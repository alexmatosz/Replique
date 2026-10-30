"""Calculadora de margem: quanto sobra de cada venda em cada marketplace.

lucro = preço − tarifa do marketplace − frete pago pelo vendedor − imposto − custo

- Mercado Livre: tarifa pela API oficial (listing_prices) e custo do frete
  pela conta do cliente, quando ela está conectada; senão, pela tabela oficial
  de custos de envio (frete_ml), que vale para todo preço, inclusive abaixo de R$ 79.
- Shopee: a API não informa a tarifa antes da venda. Com 5 ou mais vendas pagas
  do cliente nos últimos 90 dias, o percentual sai do que a Shopee cobrou de fato
  (extrato de cada pedido, no Financeiro); senão, SHOPEE_COMISSAO_PCT do .env.
- Amazon: AMAZON_COMISSAO_PCT do .env.
O frete pode ser informado à mão por plataforma (por_plataforma.X.frete_estimado).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import config
from app.marketplaces.base import PLATAFORMAS
from app.marketplaces.registry import obter_adaptador
from app.models import Anuncio, Venda
from app.services import frete_ml, novidades

log = logging.getLogger(__name__)

FRETE_GRATIS_ML_A_PARTIR = 79.0


def _num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _dimensoes_ml(anuncio: Anuncio) -> str | None:
    d = anuncio.dimensoes_cm or {}
    if not (anuncio.peso_kg and all(_num(d.get(k)) for k in ("comprimento", "largura", "altura"))):
        return None
    alt, larg, comp = (max(1, round(float(d[k]))) for k in ("altura", "largura", "comprimento"))
    return f"{alt}x{larg}x{comp},{max(1, round(anuncio.peso_kg * 1000))}"


def _tarifa_e_frete(db: Session, anuncio: Anuncio, p: str, preco: float, cache: dict) -> tuple[float, float, float, str, str]:
    """(tarifa, parte fixa da tarifa, frete, origem da tarifa, origem do frete)"""
    cfg = (anuncio.por_plataforma or {}).get(p, {})
    frete_manual = _num(cfg.get("frete_estimado"))
    if p == "mercadolivre":
        tarifa = fixa = frete = None
        fonte_tarifa = fonte_frete = ""
        if "ml" not in cache:
            adaptador, _ = obter_adaptador(db, anuncio.cliente_id, "mercadolivre", "publicar") if anuncio.cliente_id else (None, "")
            cache["ml"] = adaptador if adaptador is not None and not adaptador.demo and not getattr(adaptador, "sem_conta", False) else None
        ml = cache["ml"]
        if ml:
            try:
                info = ml.tarifa_venda(preco, cfg.get("listing_type_id") or "gold_special", cfg.get("category_id") or "")
                if info:
                    tarifa = float(info["sale_fee_amount"])
                    fixa = float((info.get("sale_fee_details") or {}).get("fixed_fee") or 0)
                    fonte_tarifa = "tarifa oficial do Mercado Livre"
            except Exception as e:
                log.info("Sem tarifa do ML: %s", e)
        if tarifa is None:
            tarifa, fixa = preco * config.ML_COMISSAO_PCT_PADRAO / 100, 0.0
            fonte_tarifa = f"estimativa de {config.ML_COMISSAO_PCT_PADRAO:g}% (conecte a conta para a tarifa exata)"
        dims = _dimensoes_ml(anuncio)
        if frete_manual is not None:
            frete, fonte_frete = frete_manual, "informado por vocês"
        elif ml and dims and preco >= FRETE_GRATIS_ML_A_PARTIR:
            frete = ml.custo_frete_gratis(preco, dims, cfg.get("listing_type_id") or "gold_special", anuncio.condicao or "new")
            fonte_frete = "calculado pelo Mercado Livre nesta conta" if frete is not None else ""
        if frete is None and dims and (pela_tabela := frete_ml.custo(preco, dims)):
            frete, fonte_frete = pela_tabela[0], "tabela do ML (reputação verde)"
        if frete is None:
            frete, fonte_frete = 0.0, "não calculado: informe peso e medidas (ou o frete estimado) para incluir"
        return tarifa, fixa, frete, fonte_tarifa, fonte_frete
    if p == "shopee":
        if "shopee" not in cache:
            cache["shopee"] = pct_shopee_das_vendas(db, anuncio.cliente_id) if anuncio.cliente_id else None
        historico = cache["shopee"]
        fixa = config.SHOPEE_TAXA_FIXA
        if historico:
            pct, vendas = historico
            fonte = (f"{pct:.1f}% + R$ {fixa:.2f}".replace(".", ",") +
                     f", pelo que a Shopee cobrou nas últimas {vendas} vendas da loja")
        else:
            pct = config.SHOPEE_COMISSAO_PCT
            fonte = (f"{pct:g}% + R$ {fixa:.2f}".replace(".", ",") +
                     " por venda (estimativa; com 5 vendas sincronizadas no Financeiro, vira a tarifa real)")
        return (preco * pct / 100 + fixa, fixa, frete_manual or 0.0, fonte,
                "informado por vocês" if frete_manual is not None else "não incluído")
    tarifa = preco * config.AMAZON_COMISSAO_PCT / 100
    return (tarifa, 0.0, frete_manual or 0.0, f"{config.AMAZON_COMISSAO_PCT:g}% (varia por categoria)",
            "informado por vocês" if frete_manual is not None else "não incluído")


def pct_shopee_das_vendas(db: Session, cliente_id: int, dias: int = 90, minimo: int = 5) -> tuple[float, int] | None:
    """(percentual cobrado, vendas usadas) a partir dos extratos das vendas reais da Shopee.
    A taxa fixa por unidade (SHOPEE_TAXA_FIXA) é descontada antes de calcular o percentual."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    vendas = (db.query(Venda).filter(Venda.cliente_id == cliente_id, Venda.plataforma == "shopee",
                                     Venda.status == "paid", Venda.data_venda >= desde, Venda.comissao > 0,
                                     Venda.total > 0, Venda.demo.is_(False))
              .all())
    vendas = [v for v in vendas if not v.simulada]
    if len(vendas) < minimo:
        return None
    total = sum(v.total for v in vendas)
    variavel = sum(v.comissao for v in vendas) - config.SHOPEE_TAXA_FIXA * sum(v.quantidade or 1 for v in vendas)
    pct = max(0.0, variavel / total * 100)
    return round(pct, 2), len(vendas)


def calcular(db: Session, anuncio: Anuncio, plataformas: list[str] | None = None, preco: float | None = None) -> dict:
    preco = float(preco if preco is not None else anuncio.preco or 0)
    custo = anuncio.custo
    imposto_pct = anuncio.imposto_pct if anuncio.imposto_pct is not None else imposto_do_cliente(db, anuncio)[0]
    minima = config.MARGEM_MINIMA_PCT
    cache: dict = {}
    saida = {}
    for p in plataformas or list(PLATAFORMAS):
        if preco <= 0:
            saida[p] = {"alerta": "sem_preco", "mensagem": "Informe o preço."}
            continue
        tarifa, fixa, frete, fonte_tarifa, fonte_frete = _tarifa_e_frete(db, anuncio, p, preco, cache)
        imposto = preco * imposto_pct / 100
        lucro = preco - tarifa - frete - imposto - (custo or 0)
        margem = lucro / preco * 100
        pct_variavel = max(0.0, (tarifa - fixa) / preco)
        divisor = 1 - pct_variavel - imposto_pct / 100 - minima / 100
        preco_minimo = round(((custo or 0) + frete + fixa) / divisor, 2) if custo is not None and divisor > 0 else None
        if custo is None:
            alerta, mensagem = "sem_custo", "Informe o custo do produto para saber o lucro de verdade."
        elif lucro < 0:
            alerta, mensagem = "prejuizo", f"Prejuízo de R$ {-lucro:.2f} por venda neste preço."
        elif margem < minima:
            alerta, mensagem = "baixa", f"Margem de {margem:.1f}%, abaixo da mínima de {minima:g}%."
        else:
            alerta, mensagem = "ok", f"Margem de {margem:.1f}%."
        saida[p] = {"preco": round(preco, 2), "tarifa": round(tarifa, 2), "frete": round(frete, 2),
                    "imposto": round(imposto, 2), "imposto_pct": imposto_pct, "custo": custo,
                    "lucro": round(lucro, 2), "margem_pct": round(margem, 1), "preco_minimo": preco_minimo,
                    "margem_minima_pct": minima, "fonte_tarifa": fonte_tarifa, "fonte_frete": fonte_frete,
                    "alerta": alerta, "mensagem": mensagem}
    return saida


TIPOS_ML = {"gold_special": "Clássico", "gold_pro": "Premium"}
_CACHE_ML: dict = {}


def _memo(chave, funcao):
    if chave not in _CACHE_ML:
        if len(_CACHE_ML) > 2000:
            _CACHE_ML.clear()
        _CACHE_ML[chave] = funcao()
    return _CACHE_ML[chave]


def imposto_do_cliente(db: Session, anuncio: Anuncio) -> tuple[float, str]:
    """% de imposto sobre a venda conforme o Financeiro do cliente."""
    from app.models import ConfigFinanceira
    from app.services import impostos
    cfg = db.get(ConfigFinanceira, anuncio.cliente_id) if anuncio.cliente_id else None
    if not cfg:
        return config.IMPOSTO_PCT_PADRAO, f"padrão de {config.IMPOSTO_PCT_PADRAO:g}% (configure em Impostos)"
    if cfg.regime not in ("presumido", "real"):
        aliq = float(cfg.aliquota_simples_pct or 0)
        return aliq, f"Simples Nacional {aliq:g}%, configurado em Impostos"
    efetivas = [impostos.calcular(cfg, 100.0, uf).aliquota_efetiva for uf in impostos.UFS]
    media = round(sum(efetivas) / len(efetivas), 2)
    nome = "Lucro Presumido" if cfg.regime == "presumido" else "Lucro Real"
    return media, f"{nome}: média dos estados de destino, {media:g}%, configurado em Impostos"


MARGENS_REFERENCIA = (5, 10, 15, 20, 25, 30)
_FAIXAS_FRETE = (79, 100, 120, 150, 200)


def precificar(db: Session, anuncio: Anuncio, preco: float | None = None, custo: float | None = None,
               imposto_pct: float | None = None, embalagem: float | None = None, frete_manual: float | None = None,
               peso_kg: float | None = None, dimensoes_cm: dict | None = None, tipo: str | None = None,
               comissao_pct: float | None = None, incluir_frete: bool = True,
               margens: tuple = MARGENS_REFERENCIA) -> dict:
    """Calculadora de margem do Mercado Livre no editor.
    Tarifa de venda pela categoria (API do ML), frete grátis pela conta do
    cliente, imposto do Financeiro. lucro = preço − custo − tarifa − frete −
    imposto − embalagem; "você recebe" = preço − tarifa − frete.
    Os preços mínimos por margem consideram a taxa fixa e o frete da faixa
    de preço em que cada um cai, não só a porcentagem."""
    from app.models import ConfigFinanceira
    cfg_ml = (anuncio.por_plataforma or {}).get("mercadolivre", {})
    categoria = cfg_ml.get("category_id") or ""
    preco = float(preco if preco is not None else anuncio.preco or 0)
    custo = custo if custo is not None else anuncio.custo
    tipo = tipo or cfg_ml.get("listing_type_id") or "gold_special"
    if tipo not in (*TIPOS_ML, "custom"):
        tipo = "gold_special"
    if imposto_pct is not None:
        fonte_imposto = "informado neste anúncio"
    elif anuncio.imposto_pct is not None:
        imposto_pct, fonte_imposto = anuncio.imposto_pct, "informado neste anúncio"
    else:
        imposto_pct, fonte_imposto = imposto_do_cliente(db, anuncio)
    if embalagem is None:
        cfg = db.get(ConfigFinanceira, anuncio.cliente_id) if anuncio.cliente_id else None
        embalagem = float(cfg.embalagem_padrao or 0) if cfg else 0.0

    adaptador, _ = obter_adaptador(db, anuncio.cliente_id, "mercadolivre", "publicar") if anuncio.cliente_id else (None, "")
    ml = adaptador if adaptador is not None and not adaptador.demo and not getattr(adaptador, "sem_conta", False) else None
    conta = anuncio.cliente_id

    medidas = Anuncio(peso_kg=peso_kg if peso_kg is not None else anuncio.peso_kg,
                      dimensoes_cm=dimensoes_cm if dimensoes_cm is not None else anuncio.dimensoes_cm)
    dims, fonte_dims = _dimensoes_ml(medidas), "peso e medidas do anúncio"
    if not dims and ml and categoria:
        dims = _memo(("dims", categoria), lambda: ml.medidas_da_categoria(categoria))
        fonte_dims = "medidas típicas da categoria (informe peso e medidas para o valor exato)"

    def tarifa(p: float, t: str) -> tuple[float, float, float, str]:
        """(% da tarifa, tarifa sem a parte fixa, taxa fixa, de onde veio)"""
        if t == "custom":
            pct = float(comissao_pct or 0)
            return pct, p * pct / 100, 0.0, "porcentagem digitada"
        if ml:
            try:
                info = _memo(("tarifa", conta, categoria, t, round(p, 2)), lambda: ml.tarifa_venda(p, t, categoria))
            except Exception as e:
                log.info("Sem tarifa do ML: %s", e)
                info = None
            if info:
                det = info.get("sale_fee_details") or {}
                fixa = float(det.get("fixed_fee") or 0)
                variavel = float(info["sale_fee_amount"]) - fixa
                pct = float(det.get("percentage_fee") or 0) or variavel / p * 100
                return pct, variavel, fixa, ("tarifa oficial do Mercado Livre para a categoria" if categoria
                                             else "tarifa do Mercado Livre sem categoria: escolha a categoria para o valor exato")
        pct = config.ML_COMISSAO_PCT_PADRAO + (4 if t == "gold_pro" else 0)
        return pct, p * pct / 100, 0.0, f"estimativa de {pct:g}% (conecte a conta para a tarifa exata)"

    def frete_auto(p: float, t: str) -> tuple[float, str]:
        if not dims:
            return 0.0, ("informe peso e medidas (ou a categoria) para calcular o frete" if ml
                         else "informe peso e medidas para calcular o frete")
        tabela = tabela_frete()
        pela_tabela = frete_ml.custo(p, dims, tabela)
        if pela_tabela is None:
            return 0.0, "peso e medidas inválidos: confira os campos"
        valor_tabela, peso = pela_tabela
        texto_tabela = (f"tabela do ML ({frete_ml.NOME_TABELA[tabela]}), {str(peso).replace('.', ',')} kg cobrados, "
                        f"{fonte_dims}")
        if ml and p >= FRETE_GRATIS_ML_A_PARTIR:
            faixa = sum(p >= f for f in _FAIXAS_FRETE)
            t = t if t in TIPOS_ML else "gold_special"
            valor = _memo(("frete", conta, dims, t, faixa, anuncio.condicao or "new"),
                          lambda: ml.custo_frete_gratis(p, dims, t, anuncio.condicao or "new"))
            if valor is not None:
                novidades.frete_diferente_da_tabela(db, float(valor), valor_tabela)
                return float(valor), f"calculado pelo Mercado Livre nesta conta, {fonte_dims}"
        return valor_tabela, texto_tabela

    def tabela_frete() -> str:
        if not ml:
            return "verde"
        try:
            nivel = _memo(("reputacao", conta), lambda: (ml.reputacao().get("reputacao") or {}).get("level_id"))
        except Exception as e:
            log.info("Sem reputação do ML: %s", e)
            nivel = None
        return frete_ml.tabela_da_reputacao(nivel)

    def frete(p: float, t: str) -> tuple[float, str]:
        if not incluir_frete:
            return 0.0, "frete fora da conta"
        if frete_manual is not None:
            return float(frete_manual), "digitado por vocês"
        return frete_auto(p, t)

    def conta_de(p: float, t: str) -> dict:
        pct, variavel, fixa, fonte_tarifa = tarifa(p, t)
        valor_frete, fonte_frete = frete(p, t)
        tarifa_total = variavel + fixa
        imposto = p * imposto_pct / 100
        lucro = p - (custo or 0) - tarifa_total - valor_frete - imposto - embalagem
        return {"preco": round(p, 2), "tarifa_pct": round(pct, 2), "tarifa": round(tarifa_total, 2), "taxa_fixa": round(fixa, 2),
                "frete": round(valor_frete, 2), "imposto": round(imposto, 2), "embalagem": round(embalagem, 2),
                "custo": custo, "recebe": round(p - tarifa_total - valor_frete, 2), "lucro": round(lucro, 2),
                "margem_pct": round(lucro / p * 100, 2) if p > 0 else None,
                "fonte_tarifa": fonte_tarifa, "fonte_frete": fonte_frete}

    def preco_para(alvo: float) -> float | None:
        if custo is None:
            return None
        p, anterior = max(preco, 10.0), None
        for _ in range(6):
            r = conta_de(p, tipo)
            taxas = (r["tarifa_pct"], r["taxa_fixa"], r["frete"])
            divisor = 1 - r["tarifa_pct"] / 100 - imposto_pct / 100 - alvo / 100
            if divisor <= 0:
                return None
            novo = round((custo + embalagem + r["taxa_fixa"] + r["frete"]) / divisor, 2)
            if taxas == anterior or abs(novo - p) < 0.01:
                return novo
            p, anterior = novo, taxas
        return p

    atual = conta_de(preco, tipo) if preco > 0 else None
    referencia = {t: tarifa(max(preco, 100.0), t)[0] for t in TIPOS_ML}
    auto = frete_auto(preco, tipo) if preco > 0 else (0.0, "")
    return {"tipo": tipo, "atual": atual, "tarifas_pct": referencia,
            "alvos": [{"margem": m, "preco": preco_para(m)} for m in margens],
            "frete_auto": round(auto[0], 2), "fonte_frete_auto": auto[1],
            "imposto_pct": imposto_pct, "fonte_imposto": fonte_imposto, "embalagem": embalagem,
            "categoria": categoria, "conta_conectada": bool(ml), "sem_custo": custo is None}
