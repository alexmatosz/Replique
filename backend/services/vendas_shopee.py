"""Vendas da Shopee no financeiro.

Cada pedido vira uma linha por item/modelo, no mesmo formato das vendas do
Mercado Livre. O que a Shopee cobra vem do extrato do pagamento
(get_escrow_detail) e é dividido entre os itens pelo valor de cada um:

- comissão = commission_fee + service_fee + seller_transaction_fee;
- frete do vendedor = actual_shipping_fee - shopee_shipping_rebate - buyer_paid_shipping_fee (nunca negativo);
- cupom pago pela loja (voucher_from_seller) diminui o que entra, no campo de ajuste do marketplace;
- seller_return_refund (devolução) entra como reembolso.
"""

from __future__ import annotations

import unicodedata
from datetime import datetime, timezone

PAGO = {"READY_TO_SHIP", "PROCESSED", "RETRY_SHIP", "SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED", "TO_RETURN"}
CANCELADO = {"CANCELLED", "IN_CANCEL"}

_UF = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE",
    "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso": "MT",
    "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR",
    "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
    "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP",
    "sergipe": "SE", "tocantins": "TO",
}


def _n(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def uf(estado: str | None) -> str:
    texto = (estado or "").strip()
    if len(texto) == 2 and texto.upper() in _UF.values():
        return texto.upper()
    chave = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return _UF.get(chave, "")


def status(pedido: dict) -> str:
    s = pedido.get("order_status") or ""
    if s in CANCELADO:
        return "cancelled"
    if s in PAGO:
        return "paid"
    return s.lower() or "pending"


def linhas_do_pedido(pedido: dict) -> list[dict]:
    itens = pedido.get("item_list") or []
    renda = (pedido.get("escrow") or {}).get("order_income") or {}
    total_pedido = sum(_n(i.get("model_discounted_price") or i.get("model_original_price")) *
                       int(i.get("model_quantity_purchased") or 1) for i in itens) or 1
    taxas = _n(renda.get("commission_fee")) + _n(renda.get("service_fee")) + _n(renda.get("seller_transaction_fee"))
    frete = max(0.0, _n(renda.get("actual_shipping_fee")) - _n(renda.get("shopee_shipping_rebate"))
                - _n(renda.get("buyer_paid_shipping_fee")))
    cupom_loja = _n(renda.get("voucher_from_seller"))
    devolvido = abs(_n(renda.get("seller_return_refund")))
    criado = pedido.get("create_time")
    data = datetime.fromtimestamp(int(criado), timezone.utc) if criado else datetime.now(timezone.utc)
    st = status(pedido)
    tem_extrato = bool(renda)
    saida = []
    for i in itens:
        qtd = int(i.get("model_quantity_purchased") or 1)
        unit = _n(i.get("model_discounted_price") or i.get("model_original_price"))
        total = round(unit * qtd, 2)
        parte = total / total_pedido
        saida.append({
            "pedido_id": str(pedido.get("order_sn") or ""), "pacote_id": "", "envio_id": "",
            "item_id": str(i.get("item_id") or ""), "variacao_id": str(i.get("model_id") or "") if i.get("model_id") else "",
            "sku": str(i.get("model_sku") or i.get("item_sku") or "")[:80],
            "titulo": str(i.get("item_name") or "")[:300], "variacao": str(i.get("model_name") or "")[:200],
            "quantidade": qtd, "preco_unitario": unit, "total": total,
            "comissao": round(taxas * parte, 2), "reembolso": round(min(devolvido * parte, total), 2),
            "bonus_ml": round(-cupom_loja * parte, 2),
            "frete_envio": round(frete * parte, 2) if tem_extrato else None,
            "uf_destino": uf((pedido.get("recipient_address") or {}).get("state")),
            "logistica": "shopee", "status": st, "data_venda": data,
            "devolucao": "aberta" if pedido.get("order_status") == "TO_RETURN" else ("devolvida" if devolvido else ""),
        })
    return saida
