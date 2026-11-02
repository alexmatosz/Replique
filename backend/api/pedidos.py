"""Pedidos de anúncio (consultor → operador) e a central de notificações."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.api.deps import usuario_atual
from backend.banco.db import get_db
from backend.banco.models import AcessoCliente, Usuario
from backend.services import acesso, notificacoes, pedidos
from backend.services.pedidos import ErroPedido

router = APIRouter(prefix="/api", tags=["pedidos"])


class NovoPedido(BaseModel):
    cliente_id: int
    marketplaces: list[str] = Field(min_length=1, max_length=3)
    produto_link: str = Field(default="", max_length=1000)
    produto_texto: str = Field(default="", max_length=5000)
    quantidade: int = Field(default=1, ge=1, le=pedidos.MAX_QUANTIDADE)
    prazo: date | None = None
    legenda: str = Field(default="", max_length=10000)
    operador_id: int


class EdicaoPedido(BaseModel):
    marketplaces: list[str] | None = Field(default=None, min_length=1, max_length=3)
    produto_link: str | None = Field(default=None, max_length=1000)
    produto_texto: str | None = Field(default=None, max_length=5000)
    quantidade: int | None = Field(default=None, ge=1, le=pedidos.MAX_QUANTIDADE)
    prazo: date | None = None
    sem_prazo: bool = False
    legenda: str | None = Field(default=None, max_length=10000)
    operador_id: int | None = None


class Marcar(BaseModel):
    ids: list[int] | None = Field(default=None, max_length=500)
    lida: bool = True


def _equipe(usuario: Usuario):
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "Pedidos de anúncio são da equipe.")


def _obter(db, usuario, pedido_id):
    try:
        return pedidos.obter(db, usuario, pedido_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.get("/pedidos")
def listar(meus: bool = False, status: str = "", cliente_id: int | None = None,
           usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    return pedidos.listar(db, usuario, meus=meus, status=status, cliente_id=cliente_id)


@router.get("/pedidos/painel")
def painel(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    return pedidos.painel(db, usuario)


@router.get("/pedidos/operadores")
def operadores(cliente_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Quem pode receber o pedido: operadores que atendem o cliente (e os administradores)."""
    _equipe(usuario)
    if not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(403, "Você não tem acesso a este cliente.")
    atendem = {uid for (uid,) in db.query(AcessoCliente.usuario_id).filter_by(cliente_id=cliente_id)}
    gente = db.query(Usuario).filter(Usuario.empresa_id == usuario.empresa_id, Usuario.ativo.is_(True),
                                     Usuario.papel.in_(("operador", "admin"))).order_by(Usuario.nome).all()
    return [{"id": u.id, "nome": u.nome, "papel": u.papel} for u in gente if u.papel == "admin" or u.id in atendem]


@router.post("/pedidos")
def criar(dados: NovoPedido, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    try:
        p = pedidos.criar(db, usuario, dados.model_dump())
    except ErroPedido as e:
        raise HTTPException(400 if pedidos.pode_pedir(usuario) else 403, str(e))
    return pedidos.pedido_dict(db, p, detalhes=True)


@router.get("/pedidos/{pedido_id}")
def ver(pedido_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    return pedidos.pedido_dict(db, _obter(db, usuario, pedido_id), detalhes=True)


@router.patch("/pedidos/{pedido_id}")
def editar(pedido_id: int, dados: EdicaoPedido, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    p = _obter(db, usuario, pedido_id)
    mudancas = {k: v for k, v in dados.model_dump(exclude={"sem_prazo"}).items() if v is not None}
    if dados.sem_prazo:
        mudancas["prazo"] = None
    try:
        pedidos.editar(db, usuario, p, mudancas)
    except ErroPedido as e:
        raise HTTPException(400 if pedidos.pode_pedir(usuario) else 403, str(e))
    return pedidos.pedido_dict(db, p, detalhes=True)


@router.post("/pedidos/{pedido_id}/comecar")
def comecar(pedido_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    p = _obter(db, usuario, pedido_id)
    try:
        anuncio, aviso = pedidos.comecar(db, usuario, p)
    except ErroPedido as e:
        raise HTTPException(403 if usuario.papel == "consultor" or "outro operador" in str(e) else 400, str(e))
    return {"anuncio_id": anuncio.id, "aviso": aviso, "pedido": pedidos.pedido_dict(db, p, detalhes=True)}


@router.post("/pedidos/{pedido_id}/pronto")
def pronto(pedido_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    p = _obter(db, usuario, pedido_id)
    try:
        pedidos.marcar_pronto(db, usuario, p)
    except ErroPedido as e:
        raise HTTPException(400, str(e))
    return pedidos.pedido_dict(db, p, detalhes=True)


@router.get("/notificacoes")
def listar_notificacoes(cliente_id: int | None = None, nao_lidas: bool = False,
                        usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return notificacoes.listar(db, usuario, cliente_id=cliente_id, so_nao_lidas=nao_lidas)


@router.get("/notificacoes/contagem")
def contar_notificacoes(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return {"nao_lidas": notificacoes.nao_lidas(db, usuario)}


@router.post("/notificacoes/lidas")
def marcar_notificacoes(dados: Marcar, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return {"alteradas": notificacoes.marcar(db, usuario, dados.ids, dados.lida),
            "nao_lidas": notificacoes.nao_lidas(db, usuario)}
