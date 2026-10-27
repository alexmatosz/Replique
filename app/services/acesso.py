"""Quem pode trabalhar em qual cliente.

- admin: todos os clientes da empresa;
- operador: só os clientes atribuídos a ele (tabela acessos_cliente); cria e publica;
- consultor: os clientes atribuídos a ele; pede anúncios ao operador
  (pedidos de anúncio), acompanha o que é feito e responde as dúvidas; não
  mexe em anúncios nem no financeiro;
- cliente: só a própria loja; acompanha o trabalho, aprova anúncios, conecta
  as contas e usa as ferramentas liberadas para ele.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AcessoCliente, Cliente, Usuario

PAPEIS = {"admin": "Administrador", "operador": "Operador", "consultor": "Consultor", "cliente": "Cliente"}
EQUIPE = ("admin", "operador", "consultor")
ATRIBUIVEIS = ("operador", "consultor")


def ids_acessiveis(db: Session, usuario: Usuario) -> set[int] | None:
    """IDs dos clientes que o usuário pode ver. None = todos da empresa (admin)."""
    if usuario.papel == "admin":
        return None
    if usuario.papel == "cliente":
        return {usuario.cliente_id} if usuario.cliente_id else set()
    return {a.cliente_id for a in db.query(AcessoCliente).filter_by(usuario_id=usuario.id)}


def clientes_acessiveis(db: Session, usuario: Usuario, incluir_inativos: bool = False) -> list[Cliente]:
    q = db.query(Cliente).filter_by(empresa_id=usuario.empresa_id)
    ids = ids_acessiveis(db, usuario)
    if ids is not None:
        if not ids:
            return []
        q = q.filter(Cliente.id.in_(ids))
    if not (incluir_inativos and usuario.papel == "admin"):
        q = q.filter(Cliente.ativo.is_(True))
    return q.order_by(Cliente.nome).all()


def pode_ver(db: Session, usuario: Usuario, cliente_id: int | None) -> bool:
    if not cliente_id:
        return False
    cliente = db.get(Cliente, cliente_id)
    if not cliente or cliente.empresa_id != usuario.empresa_id:
        return False
    if not cliente.ativo and usuario.papel != "admin":
        return False
    ids = ids_acessiveis(db, usuario)
    return ids is None or cliente_id in ids


def pode_editar(usuario: Usuario) -> bool:
    """Criar, editar e publicar anúncios é trabalho da equipe (admin/operador)."""
    return usuario.papel in ("admin", "operador")


def pode_conectar_contas(usuario: Usuario) -> bool:
    """Autorizar a conta do marketplace: o próprio lojista ou um admin."""
    return usuario.papel in ("admin", "cliente")
