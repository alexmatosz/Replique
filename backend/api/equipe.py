"""Convites da equipe por e-mail e entrar com Google.

Fluxo do convite: o admin informa nome, e-mail e papel → o Replique gera um
link de uso único (vale CONVITE_DIAS dias) e manda por e-mail (ou mostra para
copiar) → a pessoa abre o link e cria o acesso com senha ou com a conta Google
do MESMO e-mail convidado.
"""

import logging
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from html import escape

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import exigir_admin
from backend.api.limites import cadastros_ip, ip_do_cliente
from backend.banco.db import get_db
from backend.banco.models import AcessoCliente, Cliente, ConviteColaborador, Empresa, Usuario
from backend.security import (criar_assinado, criar_token_sessao, hash_senha, hash_token, ler_assinado,
                          senha_fraca, senha_inutilizavel)
from backend.services import acesso, email, google_login
from backend.services.auditoria import registrar

log = logging.getLogger("replique.acesso")
router = APIRouter(prefix="/api", tags=["equipe"])
COOKIE_GOOGLE = "rpq_google"


class NovoConvite(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    papel: str = "operador"
    clientes: list[int] = []
    enviar_email: bool = True


class NovoConviteLojista(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    enviar_email: bool = True


class AceiteComSenha(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    senha: str = Field(min_length=8, max_length=200)
    aceite_termos: bool = False


class Ticket(BaseModel):
    ticket: str = Field(max_length=2000)


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _link(token: str) -> str:
    return f"{config.PUBLIC_BASE_URL}/#/colaborador/{token}"


def _convite_valido(db: Session, token: str) -> ConviteColaborador:
    c = db.query(ConviteColaborador).filter_by(token_hash=hash_token(token)).first() if len(token or "") >= 20 else None
    if not c or c.cancelado or c.usado_em:
        raise HTTPException(404, "Este convite não existe, já foi usado ou foi cancelado. Peça um novo ao administrador.")
    if _aware(c.expira_em) < _agora():
        raise HTTPException(410, "Este convite expirou. Peça um novo ao administrador.")
    empresa = db.get(Empresa, c.empresa_id)
    if not empresa or not empresa.ativa:
        raise HTTPException(404, "A empresa deste convite está inativa.")
    return c


def _convite_dict(c: ConviteColaborador) -> dict:
    return {"id": c.id, "nome": c.nome, "email": c.email, "papel": c.papel, "clientes": c.clientes or [],
            "expira_em": c.expira_em, "criado_em": c.criado_em}


def _sessao(u: Usuario) -> dict:
    return {"token": criar_token_sessao(u.id, u.empresa_id, u.sessao_versao or 0)}


def _texto_email(c: ConviteColaborador, empresa: str, link: str, quem: str, loja: str = "") -> tuple[str, str]:
    papel = acesso.PAPEIS.get(c.papel, c.papel).lower()
    if loja:
        convite = f"{quem}, da {empresa}, convidou você para acompanhar a loja {loja} no Monvatti Radar"
        convite_html = (f"{escape(quem)}, da <b>{escape(empresa)}</b>, convidou você para acompanhar a loja "
                        f"<b>{escape(loja)}</b> no Monvatti Radar: os anúncios, as aprovações e os resultados de vendas")
    else:
        convite = f"{quem} convidou você para a equipe da {empresa} no Monvatti Radar, como {papel}"
        convite_html = (f"{escape(quem)} convidou você para a equipe da <b>{escape(empresa)}</b> "
                        f"no Monvatti Radar, como <b>{escape(papel)}</b>")
    texto = (f"Olá, {c.nome}!\n\n{convite}.\n\n"
             f"Crie o seu acesso por este link (vale {config.CONVITE_DIAS} dias e só pode ser usado uma vez):\n{link}\n\n"
             "Você pode entrar com a sua conta Google deste e-mail ou criar uma senha.\n\n"
             "Se não esperava este convite, ignore esta mensagem.")
    html = (f"<p>Olá, {escape(c.nome)}!</p><p>{convite_html}.</p><p><a href=\"{escape(link)}\" style=\"display:inline-block;"
            "background:#1650f2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600\">"
            f"Criar meu acesso</a></p><p style=\"color:#5f6b85;font-size:13px\">O link vale {config.CONVITE_DIAS} dias e só "
            "pode ser usado uma vez. Você pode entrar com a conta Google deste e-mail ou criar uma senha. Se não esperava "
            "este convite, ignore esta mensagem.</p>")
    return texto, html


@router.get("/empresa/convites")
def listar_convites(usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    return [_convite_dict(c) for c in _pendentes(db, usuario.empresa_id) if c.papel != "cliente"]


def _pendentes(db: Session, empresa_id: int) -> list[ConviteColaborador]:
    lista = (db.query(ConviteColaborador).filter_by(empresa_id=empresa_id, cancelado=False, usado_em=None)
             .order_by(ConviteColaborador.id.desc()).all())
    return [c for c in lista if _aware(c.expira_em) > _agora()]


def _email_livre(db: Session, email_: str) -> str:
    email_ = email_.strip().lower()
    if "@" not in email_ or "." not in email_.split("@")[-1]:
        raise HTTPException(400, "E-mail inválido.")
    if db.query(Usuario).filter_by(email=email_).first():
        raise HTTPException(400, "Já existe um acesso com esse e-mail.")
    return email_


def _novo_convite(db: Session, usuario: Usuario, email_: str, nome: str, papel: str, clientes: list[int]) -> tuple[ConviteColaborador, str]:
    for antigo in db.query(ConviteColaborador).filter_by(empresa_id=usuario.empresa_id, email=email_, usado_em=None, cancelado=False):
        antigo.cancelado = True
    token = secrets.token_urlsafe(32)
    c = ConviteColaborador(empresa_id=usuario.empresa_id, email=email_, nome=nome.strip(), papel=papel,
                           clientes=clientes, token_hash=hash_token(token), criado_por_id=usuario.id,
                           expira_em=_agora() + timedelta(days=config.CONVITE_DIAS))
    db.add(c)
    return c, _link(token)


def _cliente_da_empresa(db: Session, usuario: Usuario, cliente_id: int) -> Cliente:
    cliente = db.get(Cliente, cliente_id)
    if not cliente or cliente.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Cliente não encontrado.")
    return cliente


@router.get("/clientes/{cliente_id}/convites")
def convites_do_cliente(cliente_id: int, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    _cliente_da_empresa(db, usuario, cliente_id)
    return [_convite_dict(c) for c in _pendentes(db, usuario.empresa_id)
            if c.papel == "cliente" and (c.clientes or [None])[0] == cliente_id]


@router.post("/clientes/{cliente_id}/convites")
def convidar_lojista(cliente_id: int, dados: NovoConviteLojista, usuario: Usuario = Depends(exigir_admin),
                     db: Session = Depends(get_db)):
    """Convite por e-mail para o lojista: ele abre o link e cria o próprio acesso, já ligado à loja."""
    cliente = _cliente_da_empresa(db, usuario, cliente_id)
    if not cliente.ativo:
        raise HTTPException(400, "Reative o cliente antes de convidar.")
    email_ = _email_livre(db, dados.email)
    c, link = _novo_convite(db, usuario, email_, dados.nome, "cliente", [cliente.id])
    enviado, motivo = False, "envio por e-mail desmarcado"
    if dados.enviar_email:
        texto, html = _texto_email(c, usuario.empresa.nome, link, usuario.nome, cliente.nome)
        enviado, motivo = email.enviar(email_, f"Seu acesso à loja {cliente.nome} no Monvatti Radar", texto, html)
    registrar(db, usuario.empresa_id, "usuario",
              f"Convidou {c.nome} ({email_}) para o acesso de cliente" + (" (e-mail enviado)" if enviado else ""),
              usuario=usuario, cliente_id=cliente.id)
    db.commit()
    return {**_convite_dict(c), "url": link, "email_enviado": enviado, "motivo": "" if enviado else motivo}


@router.post("/empresa/convites")
def convidar(dados: NovoConvite, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    if dados.papel not in acesso.EQUIPE:
        raise HTTPException(400, "O convite é para admin, operador ou consultor. Lojista é convidado em Clientes › Gerenciar.")
    email_ = _email_livre(db, dados.email)
    ids = set(dados.clientes) if dados.papel in acesso.ATRIBUIVEIS else set()
    validos = {c.id for c in db.query(Cliente).filter(Cliente.empresa_id == usuario.empresa_id, Cliente.id.in_(ids or {0}))}
    if ids - validos:
        raise HTTPException(400, "Algum dos clientes informados não existe.")
    c, link = _novo_convite(db, usuario, email_, dados.nome, dados.papel, sorted(validos))
    enviado, motivo = False, "envio por e-mail desmarcado"
    if dados.enviar_email:
        texto, html = _texto_email(c, usuario.empresa.nome, link, usuario.nome)
        enviado, motivo = email.enviar(email_, f"Convite para a equipe da {usuario.empresa.nome} no Monvatti Radar", texto, html)
    registrar(db, usuario.empresa_id, "usuario",
              f"Convidou {c.nome} ({email_}) como {acesso.PAPEIS[c.papel].lower()}" + (" (e-mail enviado)" if enviado else ""),
              usuario=usuario)
    db.commit()
    return {**_convite_dict(c), "url": link, "email_enviado": enviado, "motivo": "" if enviado else motivo}


@router.delete("/empresa/convites/{convite_id}")
def cancelar_convite(convite_id: int, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    c = db.get(ConviteColaborador, convite_id)
    if not c or c.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Convite não encontrado.")
    c.cancelado = True
    registrar(db, usuario.empresa_id, "usuario", f"Cancelou o convite de {c.nome} ({c.email})", usuario=usuario)
    db.commit()
    return {"ok": True}


@router.get("/colaborador/{token}")
def ver_convite_colaborador(token: str, db: Session = Depends(get_db)):
    c = _convite_valido(db, token)
    loja = _loja_do_convite(db, c) if c.papel == "cliente" else None
    return {"empresa": db.get(Empresa, c.empresa_id).nome, "nome": c.nome, "email": c.email, "papel": c.papel,
            "loja": loja.nome if loja else "", "google": google_login.disponivel()}


def _loja_do_convite(db: Session, c: ConviteColaborador) -> Cliente:
    loja = db.get(Cliente, (c.clientes or [0])[0])
    if not loja or loja.empresa_id != c.empresa_id or not loja.ativo:
        raise HTTPException(404, "A loja deste convite não está mais ativa. Peça um novo convite à agência.")
    return loja


def _criar_da_equipe(db: Session, c: ConviteColaborador, nome: str, senha_hash: str, google_sub: str | None) -> Usuario:
    if db.query(Usuario).filter_by(email=c.email).first():
        raise HTTPException(400, "Já existe um acesso com esse e-mail. Use Entrar.")
    loja = _loja_do_convite(db, c) if c.papel == "cliente" else None
    u = Usuario(empresa_id=c.empresa_id, nome=nome.strip(), email=c.email, senha_hash=senha_hash, papel=c.papel,
                google_sub=google_sub, cliente_id=loja.id if loja else None)
    db.add(u)
    db.flush()
    if c.papel in acesso.ATRIBUIVEIS:
        for cid in c.clientes or []:
            if db.get(Cliente, cid):
                db.add(AcessoCliente(usuario_id=u.id, cliente_id=cid))
    c.usado_em = _agora()
    onde = f"no acesso da loja {loja.nome}" if loja else f"na equipe como {acesso.PAPEIS[u.papel].lower()}"
    registrar(db, c.empresa_id, "usuario", f"{u.nome} aceitou o convite e entrou {onde}"
              + (" (com Google)" if google_sub else ""), usuario=u, cliente_id=loja.id if loja else None)
    db.commit()
    return u


@router.post("/colaborador/{token}")
def aceitar_com_senha(token: str, dados: AceiteComSenha, request: Request, db: Session = Depends(get_db)):
    ip = ip_do_cliente(request)
    cadastros_ip.conferir(ip)
    c = _convite_valido(db, token)
    cadastros_ip.registrar(ip)
    if senha_fraca(dados.senha, (c.email, dados.nome)):
        raise HTTPException(400, "Essa senha é muito comum. Use pelo menos 8 caracteres misturando palavras, números ou símbolos.")
    from backend.services import acessos
    from backend.api.auth import aplicar_aceite
    u = _criar_da_equipe(db, c, dados.nome, hash_senha(dados.senha), None)
    aplicar_aceite(u, dados.aceite_termos)
    acessos.registrar(db, request, "cadastro", u)
    db.commit()
    return _sessao(u)


@router.get("/auth/opcoes")
def opcoes_de_login():
    return {"google": google_login.disponivel()}


@router.get("/auth/google/iniciar", include_in_schema=False)
def google_iniciar(convite: str = "", db: Session = Depends(get_db)):
    if not google_login.disponivel():
        return RedirectResponse("/#/google-erro/indisponivel", 303)
    if convite:
        _convite_valido(db, convite)
    nonce = secrets.token_urlsafe(24)
    state = criar_assinado("google_state", {"c": convite or None, "n": nonce}, 600)
    resposta = RedirectResponse(google_login.url_autorizacao(state, nonce), 303)
    resposta.set_cookie(COOKIE_GOOGLE, nonce, max_age=600, httponly=True, samesite="lax",
                        secure=config.PUBLIC_BASE_URL.startswith("https"), path="/api/auth/google")
    return resposta


def _erro(codigo: str) -> RedirectResponse:
    r = RedirectResponse(f"/#/google-erro/{codigo}", 303)
    r.delete_cookie(COOKIE_GOOGLE, path="/api/auth/google")
    return r


@router.get("/auth/google/callback", include_in_schema=False)
def google_callback(request: Request, code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    if error:
        return _erro("cancelado")
    dados = ler_assinado(state, "google_state")
    nonce = request.cookies.get(COOKIE_GOOGLE, "")
    if not dados or not code or not nonce or not secrets.compare_digest(nonce, dados.get("n", "")):
        return _erro("sessao")
    try:
        with httpx.Client() as http:
            quem = google_login.identidade(http, code, nonce)
    except google_login.ErroGoogle as e:
        log.warning("Google recusado: %s", e)
        return _erro("google")
    if dados.get("c"):
        try:
            c = _convite_valido(db, dados["c"])
        except HTTPException:
            return _erro("convite")
        if quem["email"] != c.email:
            log.warning("Convite para %s aceito com a conta Google %s", c.email, quem["email"])
            return _erro("outro-email")
        if db.query(Usuario).filter_by(google_sub=quem["sub"]).first():
            return _erro("ja-ligada")
        u = _criar_da_equipe(db, c, c.nome or quem["nome"], senha_inutilizavel(), quem["sub"])
    else:
        u = db.query(Usuario).filter_by(google_sub=quem["sub"]).first() or db.query(Usuario).filter_by(email=quem["email"]).first()
        if not u:
            return _erro("sem-acesso")
        if u.google_sub and u.google_sub != quem["sub"]:
            return _erro("outra-conta")
        if not u.google_sub:
            u.google_sub = quem["sub"]
            registrar(db, u.empresa_id, "usuario", f"{u.nome} ligou a conta Google ao acesso", usuario=u,
                      cliente_id=u.cliente_id)
            db.commit()
    if not u.ativo:
        return _erro("desativado")
    empresa = db.get(Empresa, u.empresa_id)
    if not empresa or not empresa.ativa:
        return _erro("desativado")
    if u.papel == "cliente":
        cliente = db.get(Cliente, u.cliente_id) if u.cliente_id else None
        if not cliente or not cliente.ativo:
            return _erro("desativado")
    bilhete = criar_assinado("google_login", {"u": u.id, "v": u.sessao_versao or 0, "j": secrets.token_urlsafe(12)}, 120)
    r = RedirectResponse(f"/#/google/{bilhete}", 303)
    r.delete_cookie(COOKIE_GOOGLE, path="/api/auth/google")
    return r


_bilhetes_usados: dict[str, float] = {}
_trava_bilhetes = threading.Lock()


@router.post("/auth/google/entrar")
def google_entrar(dados: Ticket, request: Request, db: Session = Depends(get_db)):
    b = ler_assinado(dados.ticket, "google_login")
    if not b:
        raise HTTPException(401, "O login com Google expirou. Tente de novo.")
    with _trava_bilhetes:
        agora = time.time()
        for j, quando in list(_bilhetes_usados.items()):
            if quando < agora - 300:
                del _bilhetes_usados[j]
        if b["j"] in _bilhetes_usados:
            raise HTTPException(401, "Este login já foi usado. Entre de novo.")
        _bilhetes_usados[b["j"]] = agora
    u = db.get(Usuario, b["u"])
    if not u or not u.ativo or (u.sessao_versao or 0) != b.get("v", 0):
        raise HTTPException(401, "Acesso indisponível. Entre de novo.")
    from backend.services import conta
    return conta.finalizar_login(db, request, u, "login_google")
