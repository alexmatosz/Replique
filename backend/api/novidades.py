"""Aba Novidades: mudanças dos marketplaces, divulgadas ou percebidas."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.api.deps import exigir_equipe, usuario_atual
from backend.banco.db import get_db
from backend.marketplaces.base import PLATAFORMAS
from backend.banco.models import Novidade, Usuario
from backend.services import novidades

router = APIRouter(prefix="/api/novidades", tags=["novidades"])


class NovaNovidade(BaseModel):
    titulo: str = Field(min_length=3, max_length=200)
    texto: str = Field(default="", max_length=5000)
    impacto: str = Field(default="", max_length=2000)
    plataforma: str = "mercadolivre"
    tema: str = "regra"
    fonte: str = "oficial"
    link: str = Field(default="", max_length=500)
    data: date | None = None


@router.get("")
def listar(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    novidades.garantir_do_sistema(db)
    lista = (db.query(Novidade).filter(or_(Novidade.empresa_id.is_(None), Novidade.empresa_id == usuario.empresa_id))
             .order_by(Novidade.data.desc(), Novidade.id.desc()).limit(300).all())
    return [novidades.item(n) for n in lista]


@router.post("")
def criar(dados: NovaNovidade, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    if dados.plataforma not in (*PLATAFORMAS, "geral"):
        raise HTTPException(400, "Plataforma desconhecida.")
    if dados.tema not in novidades.TEMAS or dados.fonte not in novidades.FONTES:
        raise HTTPException(400, "Tema ou fonte desconhecidos.")
    if dados.link and not dados.link.startswith("https://"):
        raise HTTPException(400, "O link precisa começar com https://.")
    n = Novidade(empresa_id=usuario.empresa_id, criado_por_id=usuario.id, data=dados.data or date.today(),
                 **dados.model_dump(exclude={"data"}))
    db.add(n)
    db.commit()
    return novidades.item(n)


@router.post("/verificar")
def verificar(usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    return novidades.verificar(db)


@router.delete("/{novidade_id}")
def excluir(novidade_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    n = db.get(Novidade, novidade_id)
    if not n or n.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Novidade não encontrada ou registrada pelo Monvatti Radar.")
    db.delete(n)
    db.commit()
    return {"ok": True}
