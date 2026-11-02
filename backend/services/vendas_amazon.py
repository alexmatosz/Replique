"""Vendas da Amazon no financeiro, a partir da Finances API.

Cada item enviado (ShipmentEventList) vira uma linha de venda por pedido e
SKU, com a data em que a Amazon lançou o envio:

- receita = cobrança "Principal"; frete pago pelo comprador e promoções da
  loja entram no campo de ajuste do marketplace;
- comissão = taxas da Amazon (Commission, taxa de fechamento etc.), menos as de logística;
- frete = taxas de logística (FBA, DBA e envio cobrado do vendedor);
- reembolsos (RefundEventList) são aplicados às vendas do mesmo pedido e SKU;
- cobranças de Sponsored Products (ProductAdsPaymentEventList) entram como
  gasto de Ads da conta no dia da cobrança.

Os eventos financeiros não trazem o endereço do comprador: a UF fica vazia.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

TAXAS_DE_LOGISTICA = ("FBA", "Fulfillment", "Shipping", "DBA", "Weight", "Pick", "Pack")


def _valor(bloco: dict | None) -> float:
    try:
        return float(((bloco or {}).get("CurrencyAmount")) or 0)
    except (TypeError, ValueError):
        return 0.0


def _data(texto: str | None) -> datetime:
    try:
        return datetime.fromisoformat((texto or "").replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


def _logistica(tipo: str) -> bool:
    return any(t.lower() in (tipo or "").lower() for t in TAXAS_DE_LOGISTICA)


def linhas_de_envios(eventos: list[dict]) -> list[dict]:
    somadas: dict[tuple, dict] = {}
    for ev in eventos:
        pedido = str(ev.get("AmazonOrderId") or "")
        data = _data(ev.get("PostedDate"))
        for it in ev.get("ShipmentItemList") or []:
            sku = str(it.get("SellerSKU") or "")[:80]
            qtd = int(it.get("QuantityShipped") or 1)
            principal = sum(_valor(c.get("ChargeAmount")) for c in it.get("ItemChargeList") or []
                            if c.get("ChargeType") == "Principal")
            frete_comprador = sum(_valor(c.get("ChargeAmount")) for c in it.get("ItemChargeList") or []
                                  if c.get("ChargeType") == "ShippingCharge")
            taxas = it.get("ItemFeeList") or []
            logistica = -sum(_valor(t.get("FeeAmount")) for t in taxas if _logistica(t.get("FeeType", "")))
            comissao = -sum(_valor(t.get("FeeAmount")) for t in taxas if not _logistica(t.get("FeeType", "")))
            promocao = sum(_valor(p.get("PromotionAmount")) for p in it.get("PromotionList") or [])
            chave = (pedido, sku)
            s = somadas.setdefault(chave, {
                "pedido_id": pedido, "pacote_id": "", "envio_id": "", "item_id": sku, "variacao_id": "", "sku": sku,
                "titulo": f"SKU {sku}" if sku else "Item Amazon", "variacao": "", "quantidade": 0,
                "preco_unitario": 0.0, "total": 0.0, "comissao": 0.0, "frete_envio": 0.0, "bonus_ml": 0.0,
                "reembolso": 0.0, "uf_destino": "", "logistica": "amazon", "status": "paid", "data_venda": data,
                "devolucao": ""})
            s["quantidade"] += qtd
            s["total"] = round(s["total"] + principal, 2)
            s["comissao"] = round(s["comissao"] + comissao, 2)
            s["frete_envio"] = round(s["frete_envio"] + logistica, 2)
            s["bonus_ml"] = round(s["bonus_ml"] + frete_comprador + promocao, 2)
            s["preco_unitario"] = round(s["total"] / s["quantidade"], 2) if s["quantidade"] else 0.0
    return list(somadas.values())


def reembolsos(eventos: list[dict]) -> dict[tuple, float]:
    """{(pedido, sku): valor devolvido ao comprador}."""
    saida: dict[tuple, float] = defaultdict(float)
    for ev in eventos:
        pedido = str(ev.get("AmazonOrderId") or "")
        for it in ev.get("ShipmentItemAdjustmentList") or []:
            valor = sum(_valor(c.get("ChargeAmount")) for c in it.get("ItemChargeAdjustmentList") or []
                        if c.get("ChargeType") == "Principal")
            if valor:
                saida[(pedido, str(it.get("SellerSKU") or "")[:80])] += abs(valor)
    return dict(saida)


def gastos_ads(eventos: list[dict]) -> list[dict]:
    saida = []
    for ev in eventos:
        valor = abs(_valor(ev.get("transactionValue") or ev.get("baseValue")))
        if valor:
            saida.append({"data": _data(ev.get("postedDate")).strftime("%Y-%m-%d"), "item_id": "", "custo": valor,
                          "receita": 0.0, "unidades": 0})
    return saida
