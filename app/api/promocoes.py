"""Central de promoções do Mercado Livre: visão da carteira, leitura da conta,
regras do cliente e aprovação em lote."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import Contexto, contexto, usuario_atual
from app.api.limites import consumir, uso_pesquisa
from app.db import get_db
from app.marketplaces.base import ErroMarketplace
from app.models import Usuario
from app.services import acesso, promocoes

router = APIRouter(prefix="/api/promocoes", tags=["promocoes"])


class ConfigIn(BaseModel):
    ativo: bool = True
    margem_minima_pct: float = Field(ge=0, le=90)
    desconto_padrao_pct: float = Field(ge=5, le=80)
    desconto_maximo_pct: float = Field(ge=5, le=80)
    dias_campanha: int = Field(ge=1, le=60)
    avisar_dias_antes: int = Field(ge=0, le=7)
    responsavel_id: int | None = None


class PedidoIn(BaseModel):
    item_id: str = Field(max_length=40, pattern=r"^[A-Z]{3}\d+$")
    promocao_id: str = Field(default="", max_length=80)


class AplicarIn(BaseModel):
    itens: list[PedidoIn] = Field(min_length=1, max_length=promocoes.MAX_POR_LOTE)
    aceitar_sem_custo: bool = False


def _equipe(usuario: Usuario) -> None:
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "A Central de promoções é da equipe Monvatti.")


def _executar(fn, *args, **kw):
    try:
        return fn(*args, **kw)
    except PermissionError as e:
        raise HTTPException(403, str(e)) from e
    except (ValueError, ErroMarketplace) as e:
        raise HTTPException(400, str(e)) from e


@router.get("/geral")
def geral(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    return promocoes.visao_geral(db, usuario)


@router.get("/mensagem")
def mensagem(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    return {"texto": promocoes.mensagem_grupo(db, usuario)}


@router.get("")
def painel(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    _equipe(ctx.usuario)
    return promocoes.painel(db, ctx.cliente)


@router.post("/ler")
def ler(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    _equipe(ctx.usuario)
    consumir(uso_pesquisa, ctx.usuario.id)
    _executar(promocoes.ler, db, ctx.cliente)
    return promocoes.painel(db, ctx.cliente)


@router.put("/config")
def salvar_config(dados: ConfigIn, ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    _equipe(ctx.usuario)
    cfg = _executar(promocoes.salvar_config, db, ctx.cliente, dados.model_dump(), ctx.usuario)
    return promocoes.config_dict(db, cfg)


@router.post("/aplicar")
def aplicar(dados: AplicarIn, ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    _equipe(ctx.usuario)
    return _executar(promocoes.aplicar, db, ctx.usuario, ctx.cliente, [p.model_dump() for p in dados.itens],
                     dados.aceitar_sem_custo)
