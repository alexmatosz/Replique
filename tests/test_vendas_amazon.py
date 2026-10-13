"""Vendas da Amazon pela Finances API: receita, taxas, logística, reembolso e Sponsored Products."""

from app.services import financeiro, vendas_amazon
from tests.test_financeiro import MES, _lucro, _produto, _simples_zero


def _brl(v):
    return {"CurrencyCode": "BRL", "CurrencyAmount": v}


def _envio(pedido, sku, qtd, principal, comissao, fba=0.0, frete_comprador=0.0, promo=0.0, data="2026-09-15T12:00:00Z"):
    taxas = [{"FeeType": "Commission", "FeeAmount": _brl(-comissao)}]
    if fba:
        taxas.append({"FeeType": "FBAPerUnitFulfillmentFee", "FeeAmount": _brl(-fba)})
    cobrancas = [{"ChargeType": "Principal", "ChargeAmount": _brl(principal)},
                 {"ChargeType": "ShippingCharge", "ChargeAmount": _brl(frete_comprador)}]
    return {"AmazonOrderId": pedido, "PostedDate": data,
            "ShipmentItemList": [{"SellerSKU": sku, "QuantityShipped": qtd, "ItemChargeList": cobrancas,
                                  "ItemFeeList": taxas,
                                  "PromotionList": [{"PromotionAmount": _brl(-promo)}] if promo else []}]}


def _reembolso(pedido, sku, valor):
    return {"AmazonOrderId": pedido, "PostedDate": "2026-09-20T12:00:00Z",
            "ShipmentItemAdjustmentList": [{"SellerSKU": sku, "ItemChargeAdjustmentList": [
                {"ChargeType": "Principal", "ChargeAmount": _brl(-valor)}]}]}


class _ContaFalsa:
    demo = False

    def __init__(self, eventos):
        self._eventos = eventos

    def eventos_financeiros(self, de, ate):
        return self._eventos


def test_envio_separa_comissao_logistica_e_ajustes():
    linha = vendas_amazon.linhas_de_envios([_envio("A1", "SKU1", 2, 200, 24, fba=18, frete_comprador=10, promo=5)])[0]
    assert linha["total"] == 200 and linha["preco_unitario"] == 100 and linha["quantidade"] == 2
    assert linha["comissao"] == 24 and linha["frete_envio"] == 18 and linha["bonus_ml"] == 5
    assert linha["item_id"] == "SKU1" and linha["sku"] == "SKU1"


def test_envios_parciais_do_mesmo_pedido_somam():
    linhas = vendas_amazon.linhas_de_envios([_envio("A2", "S", 1, 50, 6), _envio("A2", "S", 1, 50, 6)])
    assert len(linhas) == 1 and linhas[0]["quantidade"] == 2 and linhas[0]["total"] == 100


def test_sincronizar_amazon_com_reembolso_e_ads(client, sessao, monkeypatch):
    _simples_zero(client, sessao)
    _produto(client, sessao, nome="Fone Bluetooth", sku="FONE-AMZ", custo=40)
    eventos = {"vendas": [_envio("A10", "FONE-AMZ", 1, 150, 18, fba=12), _envio("A11", "FONE-AMZ", 1, 150, 18, fba=12)],
               "reembolsos": [_reembolso("A11", "FONE-AMZ", 150), _reembolso("ANTIGO", "X", 30)],
               "ads": [{"postedDate": "2026-09-16T00:00:00Z", "transactionValue": _brl(25)}]}
    monkeypatch.setattr(financeiro, "obter_adaptador", lambda *a, **k: (_ContaFalsa(eventos), ""))
    r = client.post(f"/api/financeiro/sincronizar?mes={MES}&plataforma=amazon", headers=sessao)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["pedidos"] == 2 and any("meses anteriores" in a for a in s["avisos"])
    res = _lucro(client, sessao)
    a10 = next(x for x in res["vendas"] if x["pedido_id"] == "A10")
    assert a10["plataforma"] == "amazon" and a10["produto"]["nome"] == "Fone Bluetooth"
    assert a10["lucro"] == 150 - 18 - 12 - 40
    a11 = next(x for x in res["vendas"] if x["pedido_id"] == "A11")
    assert a11["devolucao"] == "reembolsada" and a11["reembolso"] == 150
    assert res["por_plataforma"]["amazon"]["pedidos"] == 2 and res["totais"]["ads_sem_venda"] >= 25


def test_sem_conta_amazon_explica(client, sessao):
    r = client.post(f"/api/financeiro/sincronizar?mes={MES}&plataforma=amazon", headers=sessao)
    assert r.status_code == 400 and "Amazon" in r.json()["detail"]
