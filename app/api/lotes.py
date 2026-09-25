"""Publicação em massa (lotes). As travas estão em app/services/lotes.py."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import Contexto, contexto, contexto_equipe, exigir_equipe
from app.db import get_db
from app.models import Anuncio, Lote, LoteItem, Usuario
from app.services import acesso, lotes

router = APIRouter(prefix="/api/lotes", tags=["lotes"])


class NovoLote(BaseModel):
    anuncio_ids: list[int]
    plataformas: list[str]
    confirmado: bool = False  # "Conferi que as contas são deste cliente"


def _lote(db: Session, usuario: Usuario, lote_id: int) -> Lote:
    lote = db.get(Lote, lote_id)
    if not lote or lote.empresa_id != usuario.empresa_id or not acesso.pode_ver(db, usuario, lote.cliente_id):
        raise HTTPException(404, "Lote não encontrado.")
    return lote


def _resumo(db: Session, lote: Lote, com_itens: bool = False) -> dict:
    itens = db.query(LoteItem).filter_by(lote_id=lote.id).order_by(LoteItem.ordem).all()
    contagem = {s: sum(1 for i in itens if i.status == s) for s in ("pendente", "publicado", "simulado", "falhou", "pulado")}
    autor = db.get(Usuario, lote.usuario_id).nome if lote.usuario_id else "Claude (MCP)"
    saida = {"id": lote.id, "status": lote.status, "motivo": lote.motivo, "plataformas": lote.plataformas,
             "criado_em": lote.criado_em, "concluido_em": lote.concluido_em, "proximo_em": lote.proximo_em,
             "por": autor, "total": len(itens), "contagem": contagem}
    if com_itens:
        titulos = {a.id: a.titulo for a in db.query(Anuncio).filter(Anuncio.id.in_({i.anuncio_id for i in itens} or {0}))}
        saida["itens"] = [{"id": i.id, "anuncio_id": i.anuncio_id, "titulo": titulos.get(i.anuncio_id, ""),
                           "plataforma": i.plataforma, "status": i.status, "mensagem": i.mensagem,
                           "processado_em": i.processado_em} for i in itens]
    return saida


@router.post("/previa")
def previa(dados: NovoLote, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    """Confere o lote sem publicar nada."""
    try:
        return lotes.previa(db, ctx.cliente, dados.anuncio_ids, dados.plataformas)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("")
def criar(dados: NovoLote, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        lote = lotes.criar(db, ctx.cliente, ctx.usuario, dados.anuncio_ids, dados.plataformas, dados.confirmado)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _resumo(db, lote, com_itens=True)


@router.get("")
def listar(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    return [_resumo(db, l) for l in db.query(Lote).filter_by(cliente_id=ctx.cliente.id).order_by(Lote.id.desc()).limit(50)]


@router.get("/{lote_id}")
def ver(lote_id: int, ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    return _resumo(db, _lote(db, ctx.usuario, lote_id), com_itens=True)


@router.post("/{lote_id}/cancelar")
def cancelar(lote_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    lote = _lote(db, usuario, lote_id)
    try:
        lotes.cancelar(db, lote, usuario)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _resumo(db, lote)


@router.post("/{lote_id}/retomar")
def retomar(lote_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    lote = _lote(db, usuario, lote_id)
    try:
        lotes.retomar(db, lote, usuario)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _resumo(db, lote)
