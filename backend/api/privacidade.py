"""Senha esquecida, aceite dos Termos, dados do titular (LGPD) e registro de acessos."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import exigir_admin, usuario_atual
from backend.api.limites import Limitador, ip_do_cliente
from backend.banco.db import get_db
from backend.banco.models import Atividade, Cliente, Notificacao, PedidoTitular, RegistroAcesso, Usuario
from backend.security import criar_assinado, hash_senha, hash_token, ler_assinado, senha_fraca
from backend.services import acessos, email, notificacoes
from backend.services.auditoria import registrar

log = logging.getLogger("replique.acesso")
router = APIRouter(prefix="/api", tags=["privacidade"])

pedidos_senha_email = Limitador(3, 3600, "Muitos pedidos para este e-mail. Aguarde {minutos} min.")
pedidos_senha_ip = Limitador(10, 3600, "Muitos pedidos deste endereço. Aguarde {minutos} min.")
RESPOSTA_ESQUECI = ("Se este e-mail tiver acesso ao Replique, enviamos um link para criar uma senha nova. Ele vale por "
                    "{minutos} minutos. Não chegou? Confira o spam ou peça ao administrador da sua agência para trocar a sua senha.")
TIPOS_PEDIDO = {"exclusao": "Exclusão dos dados", "correcao": "Correção dos dados", "acesso": "Cópia dos dados",
                "oposicao": "Oposição a um tratamento"}


class Esqueci(BaseModel):
    email: str = Field(max_length=200)


class NovaSenha(BaseModel):
    token: str = Field(max_length=2000)
    senha: str = Field(min_length=8, max_length=200)


class PedidoIn(BaseModel):
    tipo: str = "exclusao"
    detalhes: str = Field(default="", max_length=2000)


class Atendimento(BaseModel):
    resposta: str = Field(min_length=3, max_length=2000)


def _impressao(u: Usuario) -> str:
    """Muda quando a senha muda: o link de redefinição vale uma vez só."""
    return hash_token(u.senha_hash or "")[:16]


@router.get("/publico/privacidade")
def info_privacidade():
    """Dados públicos para as páginas de Política de Privacidade e Termos de Uso."""
    return {"controlador": config.CONTROLADOR_NOME, "documento": config.CONTROLADOR_DOCUMENTO,
            "encarregado": config.ENCARREGADO_NOME, "encarregado_email": config.ENCARREGADO_EMAIL,
            "versao": config.TERMOS_VERSAO, "prazo_titular_dias": config.PRAZO_TITULAR_DIAS,
            "ia_texto": bool(config.ANTHROPIC_API_KEY), "ia_imagem": bool(config.OPENAI_API_KEY or config.GEMINI_API_KEY)}


@router.post("/auth/esqueci")
def esqueci_senha(dados: Esqueci, request: Request, db: Session = Depends(get_db)):
    """A resposta é sempre a mesma: não revela se o e-mail tem acesso."""
    endereco = dados.email.strip().lower()
    ip = ip_do_cliente(request)
    pedidos_senha_ip.conferir("ip:" + ip)
    pedidos_senha_email.conferir("email:" + endereco)
    pedidos_senha_ip.registrar("ip:" + ip)
    pedidos_senha_email.registrar("email:" + endereco)
    usuario = db.query(Usuario).filter_by(email=endereco).first() if "@" in endereco else None
    resposta = {"mensagem": RESPOSTA_ESQUECI.format(minutos=config.REDEFINIR_SENHA_MIN)}
    acessos.registrar(db, request, "redefinicao_pedida", usuario, endereco, sucesso=bool(usuario and usuario.ativo))
    db.commit()
    if not usuario or not usuario.ativo:
        return resposta
    token = criar_assinado("senha", {"u": usuario.id, "i": _impressao(usuario)}, config.REDEFINIR_SENHA_MIN * 60)
    link = f"{config.PUBLIC_BASE_URL}/#/nova-senha/{token}"
    enviou, motivo = email.enviar(
        usuario.email, "Replique: criar uma senha nova",
        f"Olá, {usuario.nome}.\n\nRecebemos um pedido para criar uma senha nova no Replique. Para continuar, abra o link abaixo "
        f"(vale por {config.REDEFINIR_SENHA_MIN} minutos e só funciona uma vez):\n\n{link}\n\n"
        "Se não foi você, ignore este e-mail: a sua senha atual continua valendo.")
    if not enviou:
        log.warning("Redefinição de senha não enviada para o acesso %s: %s", usuario.id, motivo)
    return resposta


@router.post("/auth/nova-senha")
def criar_nova_senha(dados: NovaSenha, request: Request, db: Session = Depends(get_db)):
    conteudo = ler_assinado(dados.token, "senha")
    usuario = db.get(Usuario, conteudo["u"]) if conteudo else None
    if not usuario or not usuario.ativo or conteudo.get("i") != _impressao(usuario):
        raise HTTPException(400, "Este link venceu ou já foi usado. Peça um novo em “Esqueci minha senha”.")
    if senha_fraca(dados.senha, (usuario.email, usuario.nome, usuario.empresa.nome)):
        raise HTTPException(400, "Essa senha é muito comum. Use pelo menos 8 caracteres misturando palavras, números ou símbolos.")
    usuario.senha_hash = hash_senha(dados.senha)
    usuario.sessao_versao = (usuario.sessao_versao or 0) + 1
    acessos.registrar(db, request, "senha_redefinida", usuario)
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} criou uma senha nova pelo link do e-mail",
              cliente_id=usuario.cliente_id, usuario=usuario)
    from backend.services import conta
    conta.avisar(db, usuario, "Sua senha foi redefinida", "Uma senha nova foi criada pelo link de redefinição e as sessões abertas foram encerradas.")
    db.commit()
    return {"ok": True, "mensagem": "Senha nova salva. Entre com ela."}


@router.post("/me/aceite")
def aceitar_termos(request: Request, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    usuario.termos_versao, usuario.termos_aceitos_em = config.TERMOS_VERSAO, datetime.now(timezone.utc)
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} aceitou os Termos de Uso e a Política de Privacidade "
              f"(versão {config.TERMOS_VERSAO})", cliente_id=usuario.cliente_id, usuario=usuario, ip=ip_do_cliente(request))
    db.commit()
    return {"versao": usuario.termos_versao, "aceitos_em": usuario.termos_aceitos_em}


@router.get("/me/dados")
def meus_dados(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Cópia dos dados pessoais da pessoa (LGPD, art. 18, II), em JSON."""
    cliente = db.get(Cliente, usuario.cliente_id) if usuario.cliente_id else None
    atividades = (db.query(Atividade).filter(Atividade.usuario_id == usuario.id).order_by(Atividade.id.desc()).limit(2000).all())
    acessos_lista = (db.query(RegistroAcesso).filter(RegistroAcesso.usuario_id == usuario.id)
                     .order_by(RegistroAcesso.id.desc()).limit(2000).all())
    avisos = db.query(Notificacao).filter(Notificacao.usuario_id == usuario.id).order_by(Notificacao.id.desc()).limit(500).all()
    pedidos = db.query(PedidoTitular).filter(PedidoTitular.usuario_id == usuario.id).all()
    corpo = {
        "gerado_em": datetime.now(timezone.utc).isoformat(), "controlador": config.CONTROLADOR_NOME,
        "cadastro": {"nome": usuario.nome, "email": usuario.email, "papel": usuario.papel, "empresa": usuario.empresa.nome,
                     "loja": cliente.nome if cliente else None, "foto": usuario.foto or "", "entra_com_google": bool(usuario.google_sub),
                     "criado_em": usuario.criado_em.isoformat() if usuario.criado_em else None,
                     "termos_versao": usuario.termos_versao,
                     "termos_aceitos_em": usuario.termos_aceitos_em.isoformat() if usuario.termos_aceitos_em else None},
        "atividades": [{"quando": a.criada_em.isoformat(), "acao": a.acao, "descricao": a.descricao} for a in atividades],
        "acessos": [{"quando": a.criado_em.isoformat(), "evento": acessos.EVENTOS.get(a.evento, a.evento), "ip": a.ip,
                     "navegador": a.navegador} for a in acessos_lista],
        "notificacoes": [{"quando": n.criada_em.isoformat(), "titulo": n.titulo} for n in avisos],
        "pedidos_lgpd": [{"quando": p.criado_em.isoformat(), "tipo": TIPOS_PEDIDO.get(p.tipo, p.tipo), "status": p.status,
                          "resposta": p.resposta} for p in pedidos],
    }
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} baixou a cópia dos próprios dados", cliente_id=usuario.cliente_id,
              usuario=usuario)
    db.commit()
    return JSONResponse(corpo, headers={"Content-Disposition": 'attachment; filename="meus-dados-replique.json"'})


@router.get("/me/acessos")
def meus_acessos(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    lista = db.query(RegistroAcesso).filter(RegistroAcesso.usuario_id == usuario.id).order_by(RegistroAcesso.id.desc()).limit(20).all()
    return [acessos.acesso_dict(a) for a in lista]


@router.post("/me/pedido-titular")
def pedido_do_titular(dados: PedidoIn, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Registra o pedido e avisa os administradores. Nada é apagado sozinho: o
    administrador analisa (há dados que a lei manda guardar, como os registros de acesso)."""
    if dados.tipo not in TIPOS_PEDIDO:
        raise HTTPException(400, "Tipo de pedido desconhecido.")
    aberto = db.query(PedidoTitular).filter_by(usuario_id=usuario.id, tipo=dados.tipo, status="aberto").first()
    if aberto:
        raise HTTPException(400, "Você já tem um pedido desse tipo em análise.")
    p = PedidoTitular(empresa_id=usuario.empresa_id, usuario_id=usuario.id, tipo=dados.tipo, detalhes=dados.detalhes.strip())
    db.add(p)
    db.flush()
    admins = [uid for (uid,) in db.query(Usuario.id).filter_by(empresa_id=usuario.empresa_id, papel="admin", ativo=True)]
    notificacoes.notificar(db, db.get(Cliente, usuario.cliente_id) if usuario.cliente_id else None, "pedido_titular",
                           f"Pedido LGPD: {TIPOS_PEDIDO[dados.tipo]} — {usuario.nome}",
                           f"Responder em até {config.PRAZO_TITULAR_DIAS} dias.", "#/config", chave=f"titular-{p.id}",
                           usuarios=admins, empresa_id=usuario.empresa_id)
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} fez um pedido de titular: {TIPOS_PEDIDO[dados.tipo]}",
              cliente_id=usuario.cliente_id, usuario=usuario)
    db.commit()
    return {"id": p.id, "prazo_dias": config.PRAZO_TITULAR_DIAS}


def _pedido_dict(p: PedidoTitular, nomes: dict) -> dict:
    prazo = (p.criado_em if p.criado_em.tzinfo else p.criado_em.replace(tzinfo=timezone.utc)) + timedelta(days=config.PRAZO_TITULAR_DIAS)
    return {"id": p.id, "tipo": p.tipo, "tipo_nome": TIPOS_PEDIDO.get(p.tipo, p.tipo), "detalhes": p.detalhes, "status": p.status,
            "resposta": p.resposta, "usuario": nomes.get(p.usuario_id, ""), "criado_em": p.criado_em, "prazo": prazo,
            "vencido": p.status == "aberto" and prazo < datetime.now(timezone.utc), "atendido_em": p.atendido_em}


@router.get("/empresa/pedidos-titular")
def pedidos_da_empresa(usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    nomes = dict(db.query(Usuario.id, Usuario.nome).filter(Usuario.empresa_id == usuario.empresa_id))
    lista = db.query(PedidoTitular).filter_by(empresa_id=usuario.empresa_id).order_by(PedidoTitular.id.desc()).limit(200).all()
    return [_pedido_dict(p, nomes) for p in lista]


@router.post("/empresa/pedidos-titular/{pedido_id}/atendido")
def atender_pedido(pedido_id: int, dados: Atendimento, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    p = db.get(PedidoTitular, pedido_id)
    if not p or p.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Pedido não encontrado.")
    p.status, p.resposta, p.atendido_por_id, p.atendido_em = "atendido", dados.resposta.strip(), usuario.id, datetime.now(timezone.utc)
    notificacoes.notificar(db, None, "pedido_titular", f"Seu pedido LGPD foi respondido: {TIPOS_PEDIDO.get(p.tipo, p.tipo)}",
                           p.resposta[:300], "#/inicio", chave=f"titular-resposta-{p.id}", usuarios=[p.usuario_id],
                           empresa_id=p.empresa_id)
    registrar(db, usuario.empresa_id, "usuario", f"Respondeu o pedido LGPD #{p.id}", usuario=usuario)
    db.commit()
    return {"ok": True}


@router.get("/empresa/acessos")
def acessos_da_empresa(usuario_id: int | None = None, so_falhas: bool = False, usuario: Usuario = Depends(exigir_admin),
                       db: Session = Depends(get_db)):
    q = db.query(RegistroAcesso).filter(RegistroAcesso.empresa_id == usuario.empresa_id)
    if usuario_id:
        q = q.filter(RegistroAcesso.usuario_id == usuario_id)
    if so_falhas:
        q = q.filter(RegistroAcesso.sucesso.is_(False))
    nomes = dict(db.query(Usuario.id, Usuario.nome).filter(Usuario.empresa_id == usuario.empresa_id))
    return [acessos.acesso_dict(a, nomes) for a in q.order_by(RegistroAcesso.id.desc()).limit(300)]
