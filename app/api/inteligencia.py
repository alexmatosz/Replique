"""Radar de anúncios, Análise de concorrentes e Meus anúncios."""

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import Contexto, contexto, contexto_equipe, contexto_time
from app.api.limites import consumir, uso_ia, uso_pesquisa
from app.db import get_db
from app.models import AnuncioMonitorado, Cliente, LeituraMonitorado
from app.services import clonador, concorrentes, meus_anuncios, monitor

router = APIRouter(prefix="/api", tags=["inteligencia"])

PRODUTO_ML = r"^MLB\d+$"


class NovoMonitorado(BaseModel):
    link: str = Field(default="", max_length=500)
    produto_id: str = Field(default="", max_length=40)
    apelido: str = Field(default="", max_length=200)
    origem: str = Field(default="manual", max_length=40)
    vinculado_a_id: int | None = None


class PedidoClone(BaseModel):
    anuncio_ids: list[int] = Field(min_length=1, max_length=clonador.MAX_ORIGENS)
    plataforma: str
    cliente_destino_id: int | None = None
    variacoes: list[str] = Field(default_factory=list, max_length=clonador.MAX_VARIACOES)


class Etiquetas(BaseModel):
    publicacao_ids: list[int] = Field(max_length=400)
    adicionar: list[str] = Field(default_factory=list, max_length=10)
    remover: list[str] = Field(default_factory=list, max_length=10)


class NovoConcorrente(BaseModel):
    vendedor_id: str = Field(max_length=40)
    notas: str = Field(default="", max_length=2000)


def _erro(e: Exception):
    raise HTTPException(404 if isinstance(e, LookupError) else 400, str(e))


@router.get("/monitor")
def listar_monitorados(ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    return monitor.listar(db, ctx.cliente)


@router.post("/monitor")
def adicionar_monitorado(dados: NovoMonitorado, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    try:
        m = monitor.adicionar(db, ctx.cliente, ctx.usuario, dados.link, dados.produto_id, dados.apelido, dados.origem, dados.vinculado_a_id)
    except (ValueError, LookupError) as e:
        _erro(e)
    return {"id": m.id, "item_id": m.item_id, "proprio": m.proprio}


@router.post("/monitor/atualizar")
def atualizar_todos(ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    """Lê de novo os anúncios sem leitura nas últimas 6 horas (até 30 por vez)."""
    consumir(uso_pesquisa, ctx.usuario.id)
    lidos, erros = 0, []
    for m in db.query(AnuncioMonitorado).filter_by(cliente_id=ctx.cliente.id).order_by(AnuncioMonitorado.id).all():
        ultima = db.query(LeituraMonitorado.lida_em).filter_by(monitorado_id=m.id).order_by(LeituraMonitorado.id.desc()).first()
        if not monitor.precisa_atualizar(ultima[0] if ultima else None):
            continue
        if lidos >= 30:
            break
        try:
            monitor.ler(db, m, ctx.cliente)
            lidos += 1
        except ValueError as e:
            erros.append(f"{m.item_id}: {e}")
    return {"lidos": lidos, "erros": erros}


@router.post("/monitor/{monitorado_id}/atualizar")
def atualizar_monitorado(monitorado_id: int, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    try:
        m = monitor.monitorado(db, ctx.cliente, monitorado_id)
        return monitor.leitura_dict(monitor.ler(db, m, ctx.cliente))
    except (ValueError, LookupError) as e:
        _erro(e)


@router.get("/monitor/{monitorado_id}")
def historico_monitorado(monitorado_id: int, ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    try:
        m = monitor.monitorado(db, ctx.cliente, monitorado_id)
    except LookupError as e:
        _erro(e)
    return {"id": m.id, "item_id": m.item_id, "produto_id": m.produto_id, "proprio": m.proprio, "apelido": m.apelido,
            "vinculado_a_id": m.vinculado_a_id, "leituras": monitor.historico(db, m),
            "mudancas": monitor.mudancas(db.query(LeituraMonitorado).filter_by(monitorado_id=m.id)
                                         .order_by(LeituraMonitorado.id.desc()).limit(90).all()[::-1])}


@router.delete("/monitor/{monitorado_id}")
def remover_monitorado(monitorado_id: int, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        monitor.remover(db, ctx.cliente, monitor.monitorado(db, ctx.cliente, monitorado_id), ctx.usuario)
    except LookupError as e:
        _erro(e)
    return {"ok": True}


@router.get("/concorrentes")
def listar_concorrentes(ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    return concorrentes.listar(db, ctx.cliente)


@router.post("/concorrentes")
def cadastrar_concorrente(dados: NovoConcorrente, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        return concorrentes.concorrente_dict(concorrentes.cadastrar(db, ctx.cliente, ctx.usuario, dados.vendedor_id, dados.notas))
    except ValueError as e:
        _erro(e)


@router.delete("/concorrentes/{concorrente_id}")
def remover_concorrente(concorrente_id: int, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        concorrentes.remover(db, ctx.cliente, concorrente_id, ctx.usuario)
    except LookupError as e:
        _erro(e)
    return {"ok": True}


@router.get("/concorrentes/produto/{produto_id}")
def comparar_produto(produto_id: str = Path(pattern=PRODUTO_ML), ctx: Contexto = Depends(contexto_time),
                     db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    try:
        return concorrentes.comparar(db, ctx.cliente, produto_id)
    except (ValueError, LookupError) as e:
        _erro(e)


@router.post("/concorrentes/produto/{produto_id}/resumo")
def resumir_produto(produto_id: str = Path(pattern=PRODUTO_ML), ctx: Contexto = Depends(contexto_time),
                    db: Session = Depends(get_db)):
    consumir(uso_ia, ctx.usuario.id)
    try:
        return concorrentes.resumo(db, ctx.cliente, produto_id)
    except (ValueError, LookupError) as e:
        _erro(e)


@router.get("/meus-anuncios")
def listar_meus_anuncios(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    return meus_anuncios.listar(db, ctx.cliente)


@router.post("/meus-anuncios/visitas")
def visitas_meus_anuncios(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    return meus_anuncios.visitas(db, ctx.cliente)


@router.put("/meus-anuncios/etiquetas")
def etiquetar_meus_anuncios(dados: Etiquetas, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        return {"alterados": meus_anuncios.etiquetar(db, ctx.cliente, ctx.usuario, dados.publicacao_ids, dados.adicionar, dados.remover)}
    except ValueError as e:
        _erro(e)


@router.get("/clonador/origens")
def origens_do_clonador(ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    return clonador.origens(db, ctx.cliente)


@router.post("/clonador")
def clonar_anuncios(dados: PedidoClone, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    destino = db.get(Cliente, dados.cliente_destino_id) if dados.cliente_destino_id else None
    if dados.cliente_destino_id and not destino:
        raise HTTPException(404, "Cliente de destino não encontrado.")
    try:
        return clonador.clonar(db, ctx.usuario, ctx.cliente, dados.anuncio_ids, dados.plataforma, destino, dados.variacoes)
    except ValueError as e:
        _erro(e)
