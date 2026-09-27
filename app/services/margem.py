"""Calculadora de margem: quanto sobra de cada venda em cada marketplace.

lucro = preço − tarifa do marketplace − frete pago pelo vendedor − imposto − custo

- Mercado Livre: tarifa pela API oficial (listing_prices) e custo do frete
  grátis pela conta do cliente, quando ela está conectada; senão, estimativa.
- Shopee e Amazon: percentuais do .env (SHOPEE_COMISSAO_PCT etc.), porque
  as APIs não informam a tarifa antes da venda.
O frete pode ser informado à mão por plataforma (por_plataforma.X.frete_estimado).
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app import config
from app.marketplaces.base import PLATAFORMAS
from app.marketplaces.registry import obter_adaptador
from app.models import Anuncio

log = logging.getLogger(__name__)

FRETE_GRATIS_ML_A_PARTIR = 79.0  # no MLB, frete grátis é obrigatório a partir deste preço


def _num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _dimensoes_ml(anuncio: Anuncio) -> str | None:
    d = anuncio.dimensoes_cm or {}
    if not (anuncio.peso_kg and all(_num(d.get(k)) for k in ("comprimento", "largura", "altura"))):
        return None
    # formato do ML: altura x largura x comprimento (cm), peso (g)
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
            cache["ml"] = adaptador if adaptador is not None and not adaptador.demo else None
        ml = cache["ml"]
        if ml:
            try:
                info = ml.tarifa_venda(preco, cfg.get("listing_type_id") or "gold_special", cfg.get("category_id") or "")
                if info:
                    tarifa = float(info["sale_fee_amount"])
                    fixa = float((info.get("sale_fee_details") or {}).get("fixed_fee") or 0)
                    fonte_tarifa = "tarifa oficial do Mercado Livre"
            except Exception as e:  # tarifa é bônus: cai na estimativa
                log.info("Sem tarifa do ML: %s", e)
        if tarifa is None:
            tarifa, fixa = preco * config.ML_COMISSAO_PCT_PADRAO / 100, 0.0
            fonte_tarifa = f"estimativa de {config.ML_COMISSAO_PCT_PADRAO:g}% (conecte a conta para a tarifa exata)"
        if frete_manual is not None:
            frete, fonte_frete = frete_manual, "informado por vocês"
        elif preco < FRETE_GRATIS_ML_A_PARTIR:
            frete, fonte_frete = 0.0, f"abaixo de R$ {FRETE_GRATIS_ML_A_PARTIR:.0f} o comprador paga o frete"
        elif ml and (dims := _dimensoes_ml(anuncio)):
            frete = ml.custo_frete_gratis(preco, dims, cfg.get("listing_type_id") or "gold_special", anuncio.condicao or "new")
            fonte_frete = "frete grátis calculado pelo Mercado Livre" if frete is not None else ""
        if frete is None:
            frete, fonte_frete = 0.0, "não calculado: informe peso e medidas (ou o frete estimado) para incluir"
        return tarifa, fixa, frete, fonte_tarifa, fonte_frete
    if p == "shopee":
        tarifa = preco * config.SHOPEE_COMISSAO_PCT / 100 + config.SHOPEE_TAXA_FIXA
        return (tarifa, config.SHOPEE_TAXA_FIXA, frete_manual or 0.0,
                f"{config.SHOPEE_COMISSAO_PCT:g}% + R$ {config.SHOPEE_TAXA_FIXA:.2f} por venda (configurável)",
                "informado por vocês" if frete_manual is not None else "não incluído")
    tarifa = preco * config.AMAZON_COMISSAO_PCT / 100
    return (tarifa, 0.0, frete_manual or 0.0, f"{config.AMAZON_COMISSAO_PCT:g}% (varia por categoria)",
            "informado por vocês" if frete_manual is not None else "não incluído")


def calcular(db: Session, anuncio: Anuncio, plataformas: list[str] | None = None, preco: float | None = None) -> dict:
    preco = float(preco if preco is not None else anuncio.preco or 0)
    custo = anuncio.custo
    imposto_pct = anuncio.imposto_pct if anuncio.imposto_pct is not None else config.IMPOSTO_PCT_PADRAO
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
        # preço mínimo para a margem mínima (aproximado: mantém o % da tarifa)
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
