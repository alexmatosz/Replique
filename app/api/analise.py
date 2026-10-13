"""Visão de carteira do agente de métricas: todos os clientes que a pessoa acompanha."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import usuario_atual
from app.db import get_db
from app.models import Usuario
from app.services import acesso, analista

router = APIRouter(prefix="/api/analise", tags=["analise"])


@router.get("/carteira")
def carteira(mes: str = Query(pattern=r"^\d{4}-\d{2}$"), usuario: Usuario = Depends(usuario_atual),
             db: Session = Depends(get_db)):
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "A visão de carteira é da equipe Monvatti.")
    r = analista.carteira(db, usuario, mes)
    db.commit()
    return r
