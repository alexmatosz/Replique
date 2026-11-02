from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from backend.banco.db import get_db
from backend.banco.models import Cliente, Empresa, Usuario
from backend.security import ler_token_sessao
from backend.services import acesso


COOKIE_SESSAO = "rpq_sessao"
METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}
LIVRES_SEM_2FA = ("/api/me/", "/api/auth/", "/api/publico/")


def token_do_pedido(request: Request) -> tuple[str, bool]:
    """(token, veio do cookie?). O cabeçalho Authorization vale para o MCP, os
    testes e integrações; o navegador usa o cookie HttpOnly."""
    cabecalho = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if cabecalho:
        return cabecalho, False
    return request.cookies.get(COOKIE_SESSAO, ""), True


def usuario_atual(request: Request, db: Session = Depends(get_db)) -> Usuario:
    token, do_cookie = token_do_pedido(request)
    if do_cookie and token and request.method not in METODOS_SEGUROS and request.headers.get("x-replique") != "1":
        raise HTTPException(403, "Pedido recusado pela proteção contra CSRF. Recarregue a página.")
    dados = ler_token_sessao(token) if token else None
    if not dados:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    usuario = db.get(Usuario, dados["u"])
    if not usuario or usuario.empresa_id != dados["e"]:
        raise HTTPException(401, "Sessão inválida.")
    if not usuario.ativo:
        raise HTTPException(401, "Este acesso foi desativado. Fale com o administrador.")
    if dados.get("v", 0) != (usuario.sessao_versao or 0):
        raise HTTPException(401, "Sua sessão foi encerrada (senha ou permissão alterada). Entre novamente.")
    empresa = db.get(Empresa, usuario.empresa_id)
    if not empresa or not empresa.ativa:
        raise HTTPException(403, "Empresa inativa. Fale com a Monvatti.")
    if usuario.papel == "cliente":
        cliente = db.get(Cliente, usuario.cliente_id) if usuario.cliente_id else None
        if not cliente or not cliente.ativo:
            raise HTTPException(401, "O acesso desta loja está desativado. Fale com a Monvatti.")
    caminho = request.url.path
    if precisa_configurar_2fa(usuario, empresa) and caminho != "/api/me" and not caminho.startswith(LIVRES_SEM_2FA):
        raise HTTPException(403, "A sua agência exige a verificação em duas etapas. Configure em Minha conta para continuar.")
    request.state.sessao = dados
    return usuario


def precisa_configurar_2fa(usuario: Usuario, empresa: Empresa) -> bool:
    return bool(empresa.exigir_2fa) and usuario.papel in acesso.EQUIPE and not usuario.totp_ativo


def exigir_admin(usuario: Usuario = Depends(usuario_atual)) -> Usuario:
    if usuario.papel != "admin":
        raise HTTPException(403, "Apenas administradores podem fazer isso.")
    return usuario


def exigir_equipe(usuario: Usuario = Depends(usuario_atual)) -> Usuario:
    """Admin ou operador (quem cria e publica anúncios)."""
    if not acesso.pode_editar(usuario):
        raise HTTPException(403, "Esta ação é feita pela equipe Monvatti. Pelo seu acesso você acompanha o trabalho.")
    return usuario


@dataclass
class Contexto:
    usuario: Usuario
    cliente: Cliente


def contexto(x_cliente: str = Header(default=""), usuario: Usuario = Depends(usuario_atual),
             db: Session = Depends(get_db)) -> Contexto:
    """Cliente em que o usuário está trabalhando. Login de cliente é sempre a
    própria loja; admin e operador escolhem pelo seletor (cabeçalho X-Cliente)."""
    if usuario.papel == "cliente":
        cliente_id = usuario.cliente_id
    else:
        try:
            cliente_id = int(x_cliente)
        except ValueError:
            raise HTTPException(409, "Escolha um cliente no seletor do topo para continuar.")
    if not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(403, "Você não tem acesso a este cliente.")
    return Contexto(usuario, db.get(Cliente, cliente_id))


def contexto_escrita(ctx: Contexto = Depends(contexto)) -> Contexto:
    """Quem pode alterar dados do cliente (custos, despesas, impostos): todos menos o consultor."""
    if ctx.usuario.papel == "consultor":
        raise HTTPException(403, "O acesso de consultor é só para acompanhar. Peça ao operador para fazer a alteração.")
    return ctx


def contexto_time(ctx: Contexto = Depends(contexto)) -> Contexto:
    """Telas de acompanhamento da equipe (admin, operador e consultor)."""
    if ctx.usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "Esta tela é da equipe Monvatti.")
    return ctx


def contexto_equipe(ctx: Contexto = Depends(contexto)) -> Contexto:
    if not acesso.pode_editar(ctx.usuario):
        raise HTTPException(403, "Esta ação é feita pela equipe Monvatti. Pelo seu acesso você acompanha o trabalho.")
    return ctx
