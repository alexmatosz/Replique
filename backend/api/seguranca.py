"""Sessão por cookie, verificação em duas etapas e controles do administrador."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import COOKIE_SESSAO, exigir_admin, precisa_configurar_2fa, usuario_atual
from backend.api.limites import Limitador
from backend.banco.db import get_db
from backend.banco.models import Usuario
from backend.security import (conferir_senha, conferir_totp, criar_assinado, criar_token_sessao, criptografar, descriptografar,
                          gerar_codigos_recuperacao, gerar_segredo_totp, ler_assinado, ler_token_sessao, resumo_codigo)
from backend.services import acessos, conta, email
from backend.services.auditoria import registrar

router = APIRouter(prefix="/api", tags=["seguranca"])
falhas_2fa = Limitador(5, 900, "Muitos códigos errados. Aguarde {minutos} min e entre de novo.")


class Senha(BaseModel):
    senha: str = Field(max_length=200)


class Codigo(BaseModel):
    codigo: str = Field(max_length=40)


class Desafio(BaseModel):
    desafio: str = Field(max_length=2000)
    codigo: str = Field(max_length=40)


class Desligar(BaseModel):
    senha: str = Field(max_length=200)
    codigo: str = Field(max_length=40)


class Exigir(BaseModel):
    exigir_2fa: bool


def _https(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


def gravar_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(COOKIE_SESSAO, token, max_age=config.SESSION_HOURS * 3600, httponly=True, samesite="strict",
                        secure=_https(request), path="/")


@router.post("/auth/cookie")
def criar_cookie(request: Request, response: Response):
    """Troca o token recebido no login pelo cookie HttpOnly (o JavaScript não lê
    o cookie, então uma falha de XSS não leva a sessão)."""
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not ler_token_sessao(token):
        raise HTTPException(401, "Sessão inválida.")
    gravar_cookie(response, request, token)
    return {"ok": True}


@router.post("/auth/renovar")
def renovar(request: Request, response: Response, usuario: Usuario = Depends(usuario_atual)):
    dados = request.state.sessao
    token = criar_token_sessao(usuario.id, usuario.empresa_id, usuario.sessao_versao or 0, dados.get("l"))
    if not ler_token_sessao(token):
        raise HTTPException(401, "A sessão chegou ao limite. Entre novamente.")
    if request.cookies.get(COOKIE_SESSAO):
        gravar_cookie(response, request, token)
    return {"token": token, "inatividade_min": config.SESSAO_INATIVIDADE_MIN}


@router.post("/auth/sair")
def sair(response: Response):
    response.delete_cookie(COOKIE_SESSAO, path="/")
    return {"ok": True}


@router.post("/auth/2fa")
def entrar_com_codigo(dados: Desafio, request: Request, db: Session = Depends(get_db)):
    d = ler_assinado(dados.desafio, "2fa")
    usuario = db.get(Usuario, d["u"]) if d else None
    if not usuario or not usuario.ativo or (usuario.sessao_versao or 0) != d.get("v") or not usuario.totp_ativo:
        raise HTTPException(401, "O tempo para digitar o código acabou. Entre de novo.")
    chave = f"u:{usuario.id}"
    falhas_2fa.conferir(chave)
    if not _codigo_valido(usuario, dados.codigo):
        falhas_2fa.registrar(chave)
        acessos.registrar(db, request, "2fa_falha", usuario, sucesso=False)
        db.commit()
        raise HTTPException(401, "Código incorreto.")
    falhas_2fa.limpar(chave)
    return _sessao_apos_2fa(db, request, usuario)


def _sessao_apos_2fa(db: Session, request: Request, usuario: Usuario) -> dict:
    ip_novo = conta._ip_novo(db, usuario, request)
    acessos.registrar(db, request, "login_2fa", usuario)
    if ip_novo:
        conta.avisar(db, usuario, "Novo acesso à sua conta", f"Entrada a partir do endereço {ip_novo}.", email_tambem=False)
    db.commit()
    return conta.sessao_dict(usuario)


def _codigo_valido(u: Usuario, codigo: str) -> bool:
    """Código do app (uma vez só) ou código de recuperação (riscado ao usar)."""
    segredo = descriptografar(u.totp_segredo or "").get("s", "")
    passo = conferir_totp(segredo, codigo, u.totp_ultimo_passo) if segredo else None
    if passo is not None:
        u.totp_ultimo_passo = passo
        return True
    resumo = resumo_codigo(codigo)
    restantes = list(u.codigos_recuperacao or [])
    if resumo in restantes:
        restantes.remove(resumo)
        u.codigos_recuperacao = restantes
        return True
    return False


def _reautenticar(u: Usuario, senha: str):
    """Mudanças no segundo fator pedem a senha de novo (ASVS 7.5.1)."""
    if not conferir_senha(senha, u.senha_hash):
        raise HTTPException(400, "Senha incorreta.")


@router.get("/me/2fa")
def situacao_2fa(usuario: Usuario = Depends(usuario_atual)):
    return {"ativo": bool(usuario.totp_ativo), "codigos_restantes": len(usuario.codigos_recuperacao or []),
            "exigido": bool(usuario.empresa.exigir_2fa) and usuario.papel != "cliente",
            "pendente": precisa_configurar_2fa(usuario, usuario.empresa)}


@router.post("/me/2fa/iniciar")
def iniciar_2fa(dados: Senha, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _reautenticar(usuario, dados.senha)
    if usuario.totp_ativo:
        raise HTTPException(400, "A verificação em duas etapas já está ligada.")
    segredo = gerar_segredo_totp()
    usuario.totp_segredo = criptografar({"s": segredo})
    usuario.totp_ultimo_passo = None
    db.commit()
    rotulo = f"Replique:{usuario.email}"
    return {"segredo": " ".join(segredo[i:i + 4] for i in range(0, len(segredo), 4)),
            "uri": f"otpauth://totp/{rotulo}?secret={segredo}&issuer=Replique&digits=6&period=30"}


@router.post("/me/2fa/ativar")
def ativar_2fa(dados: Codigo, request: Request, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    segredo = descriptografar(usuario.totp_segredo or "").get("s", "")
    if not segredo or usuario.totp_ativo:
        raise HTTPException(400, "Comece a configuração de novo.")
    passo = conferir_totp(segredo, dados.codigo, None)
    if passo is None:
        raise HTTPException(400, "Código incorreto. Confira se o relógio do celular está certo e digite o código atual.")
    codigos = gerar_codigos_recuperacao()
    usuario.totp_ativo, usuario.totp_ultimo_passo = True, passo
    usuario.codigos_recuperacao = [resumo_codigo(c) for c in codigos]
    acessos.registrar(db, request, "2fa_ligado", usuario)
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} ligou a verificação em duas etapas", cliente_id=usuario.cliente_id,
              usuario=usuario)
    conta.avisar(db, usuario, "Verificação em duas etapas ligada", "A partir de agora, além da senha, a entrada pede o código do app.")
    db.commit()
    return {"codigos_recuperacao": codigos}


@router.post("/me/2fa/desligar")
def desligar_2fa(dados: Desligar, request: Request, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _reautenticar(usuario, dados.senha)
    if bool(usuario.empresa.exigir_2fa) and usuario.papel != "cliente":
        raise HTTPException(400, "A sua agência exige a verificação em duas etapas para a equipe.")
    if not usuario.totp_ativo or not _codigo_valido(usuario, dados.codigo):
        raise HTTPException(400, "Código incorreto.")
    usuario.totp_ativo, usuario.totp_segredo, usuario.codigos_recuperacao = False, None, []
    usuario.sessao_versao = (usuario.sessao_versao or 0) + 1
    acessos.registrar(db, request, "2fa_desligado", usuario)
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} desligou a verificação em duas etapas", cliente_id=usuario.cliente_id,
              usuario=usuario)
    conta.avisar(db, usuario, "Verificação em duas etapas desligada", "A entrada volta a pedir só a senha. As outras sessões foram encerradas.")
    db.commit()
    return conta.sessao_dict(usuario)


@router.post("/me/2fa/codigos")
def novos_codigos(dados: Senha, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _reautenticar(usuario, dados.senha)
    if not usuario.totp_ativo:
        raise HTTPException(400, "Ligue a verificação em duas etapas primeiro.")
    codigos = gerar_codigos_recuperacao()
    usuario.codigos_recuperacao = [resumo_codigo(c) for c in codigos]
    conta.avisar(db, usuario, "Códigos de recuperação trocados", "Os códigos antigos deixaram de valer.")
    db.commit()
    return {"codigos_recuperacao": codigos}


def _da_empresa(db: Session, admin: Usuario, usuario_id: int) -> Usuario:
    u = db.get(Usuario, usuario_id)
    if not u or u.empresa_id != admin.empresa_id:
        raise HTTPException(404, "Acesso não encontrado.")
    return u


@router.put("/empresa/seguranca")
def configurar_seguranca(dados: Exigir, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    if dados.exigir_2fa and not usuario.totp_ativo:
        raise HTTPException(400, "Ligue primeiro a sua verificação em duas etapas (Minha conta) para não ficar sem acesso.")
    usuario.empresa.exigir_2fa = dados.exigir_2fa
    registrar(db, usuario.empresa_id, "usuario", ("Passou a exigir" if dados.exigir_2fa else "Deixou de exigir")
              + " a verificação em duas etapas da equipe", usuario=usuario)
    db.commit()
    return {"exigir_2fa": bool(usuario.empresa.exigir_2fa)}


@router.get("/empresa/seguranca")
def ver_seguranca(usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    equipe = db.query(Usuario).filter(Usuario.empresa_id == usuario.empresa_id, Usuario.ativo.is_(True)).order_by(Usuario.nome).all()
    return {"exigir_2fa": bool(usuario.empresa.exigir_2fa), "inatividade_min": config.SESSAO_INATIVIDADE_MIN,
            "sessao_horas": config.SESSION_HOURS,
            "pessoas": [{"id": u.id, "nome": u.nome, "papel": u.papel, "dois_fatores": bool(u.totp_ativo)} for u in equipe]}


@router.post("/empresa/usuarios/{usuario_id}/encerrar-sessoes")
def encerrar_sessoes(usuario_id: int, admin: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    u = _da_empresa(db, admin, usuario_id)
    u.sessao_versao = (u.sessao_versao or 0) + 1
    registrar(db, admin.empresa_id, "usuario", f"Encerrou as sessões de {u.nome}", usuario=admin)
    db.commit()
    return {"ok": True}


@router.post("/empresa/usuarios/{usuario_id}/2fa/reset")
def zerar_2fa(usuario_id: int, admin: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    """Para quem perdeu o celular e os códigos: o admin confirma quem é a pessoa
    (ASVS 6.4.4) e desliga; ela configura de novo ao entrar."""
    u = _da_empresa(db, admin, usuario_id)
    u.totp_ativo, u.totp_segredo, u.codigos_recuperacao = False, None, []
    u.sessao_versao = (u.sessao_versao or 0) + 1
    registrar(db, admin.empresa_id, "usuario", f"Desligou a verificação em duas etapas de {u.nome} (aparelho perdido)", usuario=admin)
    conta.avisar(db, u, "Verificação em duas etapas desligada pelo administrador", f"{admin.nome} desligou a sua verificação em "
                 "duas etapas. Configure de novo em Minha conta.")
    db.commit()
    return {"ok": True}


@router.post("/empresa/usuarios/{usuario_id}/link-senha")
def link_de_senha(usuario_id: int, admin: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    """O admin não escolhe a senha de ninguém (ASVS 6.4.6): gera um link de uso
    único para a própria pessoa criar a senha."""
    from backend.api.privacidade import _impressao
    u = _da_empresa(db, admin, usuario_id)
    if not u.ativo:
        raise HTTPException(400, "Reative o acesso antes.")
    token = criar_assinado("senha", {"u": u.id, "i": _impressao(u)}, config.REDEFINIR_SENHA_MIN * 60)
    link = f"{config.PUBLIC_BASE_URL}/#/nova-senha/{token}"
    enviou, motivo = email.enviar(u.email, "Replique: crie a sua senha",
                                  f"Olá, {u.nome}.\n\n{admin.nome} pediu para você criar uma senha nova no Replique. Abra o link "
                                  f"(vale {config.REDEFINIR_SENHA_MIN} minutos, uma vez só):\n\n{link}")
    registrar(db, admin.empresa_id, "usuario", f"Gerou um link de senha para {u.nome}", usuario=admin)
    db.commit()
    return {"link": link, "enviado": enviou, "motivo": motivo, "validade_min": config.REDEFINIR_SENHA_MIN}
