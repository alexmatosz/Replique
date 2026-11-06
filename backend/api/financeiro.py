"""Lucro das vendas: impostos da loja, catálogo de produtos (custo e
embalagem), vínculo dos anúncios com os produtos, sincronização das vendas do
Mercado Livre (com publicidade e devoluções), simulação de venda e o resumo do mês.

O lojista (login do cliente) também pode cadastrar produtos, custos e
impostos: é ele quem conhece o preço de compra e o regime da empresa."""

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from starlette.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.api.deps import Contexto, contexto, contexto_escrita
from backend.api.limites import consumir, uso_ia, uso_pesquisa
from backend.banco.db import get_db
from backend.services import analista, financeiro, rentabilidade

router = APIRouter(prefix="/api/financeiro", tags=["financeiro"])
MES = Query(pattern=r"^\d{4}-\d{2}$")


class ConfigIn(BaseModel):
    regime: str = Field(max_length=20)
    aliquota_simples_pct: float = Field(default=6.0, ge=0, le=40)
    uf_origem: str = Field(default="", max_length=2)
    pis_cofins_pct: float | None = Field(default=None, ge=0, le=30)
    outros_pct: float | None = Field(default=None, ge=0, le=30)
    credito_custo_pct: float = Field(default=0.0, ge=0, le=40)
    importado: bool = False
    cobrar_difal: bool = True
    icms_excluido_pis_cofins: bool = True
    devolucao_volta_estoque: bool = True
    aliquotas_uf: dict[str, float | None] = Field(default_factory=dict)
    embalagem_padrao: float = Field(default=0.0, ge=0, le=10_000)


class CustoExtraIn(BaseModel):
    descricao: str = Field(default="", max_length=80)
    valor: float | None = Field(default=None, ge=0, le=1_000_000)


class ProdutoIn(BaseModel):
    nome: str = Field(max_length=300)
    sku: str = Field(default="", max_length=80)
    custo: float | None = Field(default=None, ge=0)
    embalagem: float | None = Field(default=None, ge=0)
    imposto_pct: float | None = Field(default=None, ge=0, le=60)
    preco: float | None = Field(default=None, ge=0, le=1_000_000)
    custos_extras: list[CustoExtraIn] = Field(default_factory=list, max_length=20)
    vincular_item_id: str = Field(default="", max_length=40)
    vincular_variacao_id: str = Field(default="", max_length=40)
    vincular_titulo: str = Field(default="", max_length=300)
    vincular_sku: str = Field(default="", max_length=80)


class CustoIn(BaseModel):
    id: int
    custo: float | None = Field(default=None, ge=0)
    embalagem: float | None = Field(default=None, ge=0)


class CustosIn(BaseModel):
    itens: list[CustoIn] = Field(max_length=5000)


class VinculoIn(BaseModel):
    item_id: str = Field(max_length=40)
    variacao_id: str = Field(default="", max_length=40)
    todas_variacoes: bool = False
    produto_id: int
    unidades: int = Field(default=1, ge=1, le=100)
    titulo: str = Field(default="", max_length=300)


class SimulacaoIn(BaseModel):
    sku: str = Field(default="", max_length=80)
    item_id: str = Field(default="", max_length=40)
    titulo: str = Field(default="", max_length=300)
    preco: float = Field(gt=0, le=1_000_000)
    quantidade: int = Field(default=1, ge=1, le=1000)
    uf: str = Field(default="", max_length=2)
    comissao_pct: float = Field(default=16, ge=0, le=50)
    taxa_fixa: float = Field(default=0, ge=0, le=100)
    frete: float = Field(default=0, ge=0, le=10_000)
    ads: float = Field(default=0, ge=0, le=100_000)
    devolucao: str = Field(default="", max_length=20)
    frete_devolucao: float = Field(default=0, ge=0, le=10_000)


def _executar(fn, *args):
    try:
        return fn(*args)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/config")
def ler_config(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    cfg = financeiro.config_de(db, ctx.cliente)
    db.commit()
    return financeiro.config_dict(cfg)


@router.put("/config")
def salvar_config(dados: ConfigIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    cfg = _executar(financeiro.salvar_config, db, ctx.cliente, dados.model_dump(), ctx.usuario)
    return financeiro.config_dict(cfg)


@router.get("/produtos")
def listar_produtos(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    r = financeiro.listar_produtos(db, ctx.cliente)
    db.commit()
    return r


@router.post("/produtos")
def criar_produto(dados: ProdutoIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    corpo = dados.model_dump()
    if dados.vincular_item_id:
        corpo["origem"] = "venda"
    p = _executar(financeiro.salvar_produto, db, ctx.cliente, corpo, ctx.usuario)
    if dados.vincular_item_id and (not financeiro.chave_sku(p.sku) or financeiro.chave_sku(p.sku) != financeiro.chave_sku(dados.vincular_sku)):
        _executar(financeiro.vincular, db, ctx.cliente, {
            "item_id": dados.vincular_item_id, "variacao_id": dados.vincular_variacao_id, "produto_id": p.id,
            "titulo": dados.vincular_titulo, "unidades": 1}, ctx.usuario)
    return financeiro.produto_dict(p)


@router.put("/produtos/{produto_id}")
def editar_produto(produto_id: int, dados: ProdutoIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    corpo = dados.model_dump()
    for campo in ("imposto_pct", "preco", "custos_extras"):
        if campo not in dados.model_fields_set:
            corpo.pop(campo)
    p = _executar(financeiro.salvar_produto, db, ctx.cliente, corpo, ctx.usuario, produto_id)
    return financeiro.produto_dict(p)


@router.delete("/produtos/{produto_id}")
def excluir_produto(produto_id: int, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    _executar(financeiro.excluir_produto, db, ctx.cliente, produto_id, ctx.usuario)
    return {"ok": True}


@router.put("/custos")
def salvar_custos(dados: CustosIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    n = _executar(financeiro.salvar_custos, db, ctx.cliente, [i.model_dump() for i in dados.itens], ctx.usuario)
    return {"alterados": n}


@router.post("/produtos/importar")
def importar_produtos(ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    return _executar(financeiro.importar_do_ml, db, ctx.cliente, ctx.usuario)


@router.post("/vinculos")
def vincular(dados: VinculoIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    v = _executar(financeiro.vincular, db, ctx.cliente, dados.model_dump(), ctx.usuario)
    return {"item_id": v.item_id, "variacao_id": v.variacao_id, "produto_id": v.produto_id, "unidades": v.unidades}


@router.delete("/vinculos")
def desvincular(item_id: str = Query(max_length=40), variacao_id: str = Query(default="", max_length=40),
                ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    _executar(financeiro.desvincular, db, ctx.cliente, item_id, variacao_id, ctx.usuario)
    return {"ok": True}


@router.post("/sincronizar")
def sincronizar(mes: str = MES, plataforma: str = Query("mercadolivre", pattern="^(mercadolivre|shopee|amazon)$"),
                ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    return _executar(financeiro.sincronizar, db, ctx.cliente, mes, plataforma)


@router.get("/lucro")
def lucro_do_mes(mes: str = MES, ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    r = _executar(financeiro.resumo, db, ctx.cliente, mes)
    db.commit()
    return r


@router.get("/gestao")
def gestao_de_vendas(mes: str = MES, ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    """Faturamento, lucro e margem por canal e por produto, com o mês anterior e a curva ABC."""
    r = _executar(rentabilidade.gestao, db, ctx.cliente, mes)
    db.commit()
    return r


@router.get("/dre")
def dre_simplificado(mes: str = MES, meses: int = Query(3, ge=1, le=12), ctx: Contexto = Depends(contexto),
                     db: Session = Depends(get_db)):
    r = _executar(rentabilidade.dre, db, ctx.cliente, mes, meses)
    db.commit()
    return r


@router.get("/lucratividade")
def minha_lucratividade(margem: float = Query(rentabilidade.MARGEM_ALVO_PADRAO, ge=0, le=90), ctx: Contexto = Depends(contexto),
                        db: Session = Depends(get_db)):
    return rentabilidade.lucratividade(db, ctx.cliente, margem)


@router.get("/analise")
def analise_do_mes(mes: str = MES, ia: bool = False, ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    """Agente de métricas: o que tirou lucro no mês e o que fazer. ia=true pede o resumo escrito pela IA."""
    if ia:
        consumir(uso_ia, ctx.usuario.id)
    r = _executar(analista.analisar, db, ctx.cliente, mes, ia)
    db.commit()
    return r


@router.post("/simular")
def simular_venda(dados: SimulacaoIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    v = _executar(financeiro.simular_venda, db, ctx.cliente, dados.model_dump(), ctx.usuario)
    return {"id": v.id, "pedido_id": v.pedido_id}


@router.delete("/simulacoes")
def apagar_simulacoes(ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    return {"apagadas": financeiro.apagar_simulacoes(db, ctx.cliente)}


class DespesaIn(BaseModel):
    descricao: str = Field(max_length=200)
    categoria: str = Field(default="outros", max_length=30)
    valor: float = Field(gt=0, le=10_000_000)
    fixa: bool = True
    mes_inicio: str = Field(pattern=r"^\d{4}-\d{2}$")


@router.get("/despesas")
def listar_despesas(mes: str = MES, ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    return _executar(financeiro.listar_despesas, db, ctx.cliente, mes)


@router.post("/despesas")
def criar_despesa(dados: DespesaIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    return financeiro.despesa_dict(_executar(financeiro.salvar_despesa, db, ctx.cliente, dados.model_dump(), ctx.usuario))


@router.put("/despesas/{despesa_id}")
def editar_despesa(despesa_id: int, dados: DespesaIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    d = _executar(financeiro.salvar_despesa, db, ctx.cliente, dados.model_dump(), ctx.usuario, despesa_id)
    return financeiro.despesa_dict(d)


@router.delete("/despesas/{despesa_id}")
def excluir_despesa(despesa_id: int, mes: str = MES, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    return {"acao": _executar(financeiro.excluir_despesa, db, ctx.cliente, despesa_id, mes, ctx.usuario)}


class ConfigFullIn(BaseModel):
    custo_unidade_mes: float = Field(ge=0, le=1000)
    dias_prolongado: int = Field(ge=30, le=720)


@router.get("/estoque-full")
def estoque_full(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    """Estoque no Full com idade, custo parado e aviso de armazenamento prolongado."""
    from backend.services import estoque_full as servico
    consumir(uso_pesquisa, ctx.usuario.id)
    return _executar(servico.painel, db, ctx.cliente)


@router.put("/estoque-full/config")
def config_estoque_full(dados: ConfigFullIn, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    from backend.services import estoque_full as servico
    _executar(servico.salvar_config, db, ctx.cliente, dados.custo_unidade_mes, dados.dias_prolongado, ctx.usuario)
    return {"ok": True}


_MAX_PLANILHA = 8 * 1024 * 1024


async def _ler_planilha(arquivo: UploadFile) -> bytes:
    conteudo = await arquivo.read(_MAX_PLANILHA + 1)
    if len(conteudo) > _MAX_PLANILHA:
        raise HTTPException(400, "Planilha maior que 8 MB.")
    if not conteudo:
        raise HTTPException(400, "Arquivo vazio.")
    return conteudo


def _mapa(texto: str) -> dict | None:
    if not texto:
        return None
    try:
        return json.loads(texto)
    except ValueError:
        raise HTTPException(400, "Mapeamento de colunas inválido.")


@router.get("/tributacao")
def ver_tributacao(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    from backend.services import tributacao
    return tributacao.listar(db, ctx.cliente)


@router.get("/tributacao/modelo.csv")
def modelo_tributacao(ctx: Contexto = Depends(contexto)):
    from backend.services import tributacao
    return Response(tributacao.modelo_csv(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="modelo-planilha-tributacao.csv"'})


@router.post("/tributacao/previa")
async def previa_tributacao(arquivo: UploadFile = File(...), mapa: str = Form(default=""),
                            ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    from backend.services import tributacao
    conteudo = await _ler_planilha(arquivo)
    return await run_in_threadpool(_executar, tributacao.previa, db, ctx.cliente, arquivo.filename or "", conteudo, _mapa(mapa))


@router.post("/tributacao/importar")
async def importar_tributacao(arquivo: UploadFile = File(...), mapa: str = Form(default=""), substituir: bool = Form(default=True),
                              ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    from backend.services import tributacao
    conteudo = await _ler_planilha(arquivo)
    return await run_in_threadpool(_executar, tributacao.importar, db, ctx.cliente, arquivo.filename or "", conteudo, _mapa(mapa),
                                   substituir, ctx.usuario)


@router.post("/tributacao/mercadolivre")
def tributacao_do_ml(ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    """Puxa NCM, origem, CST/CSOSN e as alíquotas das regras tributárias do Faturador do Mercado Livre."""
    from backend.services import tributacao
    return _executar(tributacao.importar_do_ml, db, ctx.cliente, ctx.usuario)


@router.delete("/tributacao")
def apagar_tributacao(ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    from backend.services import tributacao
    return {"apagadas": tributacao.apagar(db, ctx.cliente, ctx.usuario)}


@router.delete("/tributacao/{regra_id}")
def apagar_regra(regra_id: int, ctx: Contexto = Depends(contexto_escrita), db: Session = Depends(get_db)):
    from backend.services import tributacao
    if not tributacao.apagar(db, ctx.cliente, ctx.usuario, regra_id):
        raise HTTPException(404, "Regra não encontrada.")
    return {"ok": True}
