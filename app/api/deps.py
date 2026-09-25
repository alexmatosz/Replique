from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Cliente, Empresa, Usuario
from app.security import ler_token_sessao
from app.services import acesso


def usuario_atual(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> Usuario:
    token = authorization.removeprefix("Bearer ").strip()
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
    return usuario


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


def contexto_equipe(ctx: Contexto = Depends(contexto)) -> Contexto:
    if not acesso.pode_editar(ctx.usuario):
        raise HTTPException(403, "Esta ação é feita pela equipe Monvatti. Pelo seu acesso você acompanha o trabalho.")
    return ctx
