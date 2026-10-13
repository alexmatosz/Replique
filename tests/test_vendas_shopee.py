"""Vendas da Shopee no financeiro: taxas do extrato, frete, cupom da loja e Ads da loja."""

from datetime import datetime, timezone

from app.services import financeiro, vendas_shopee
from tests.test_financeiro import MES, _lucro, _produto, _simples_zero

QUANDO = int(datetime(2026, 9, 12, 15, tzinfo=timezone.utc).timestamp())


def _pedido(sn, itens, status="COMPLETED", renda=None, estado="São Paulo"):
    return {"order_sn": sn, "order_status": status, "create_time": QUANDO,
            "recipient_address": {"state": estado},
            "item_list": [{"item_id": iid, "item_name": f"Produto {iid}", "item_sku": sku, "model_id": 0,
                           "model_name": "", "model_sku": "", "model_quantity_purchased": q,
                           "model_discounted_price": p} for iid, sku, q, p in itens],
            "escrow": {"order_income": renda} if renda is not None else {}}


class _LojaFalsa:
    demo = False

    def __init__(self, pedidos, ads=None):
        self._pedidos, self._ads = pedidos, ads or []

    def pedidos(self, de, ate):
        return self._pedidos

    def gastos_ads(self, de, ate):
        return self._ads


def _usar(monkeypatch, *a, **kw):
    monkeypatch.setattr(financeiro, "obter_adaptador", lambda *x, **y: (_LojaFalsa(*a, **kw), ""))


def test_uf_pelo_nome_do_estado():
    assert vendas_shopee.uf("São Paulo") == "SP" and vendas_shopee.uf("rio grande do sul") == "RS"
    assert vendas_shopee.uf("BA") == "BA" and vendas_shopee.uf("Lisboa") == ""


def test_taxas_do_extrato_divididas_entre_os_itens():
    renda = {"commission_fee": 24, "service_fee": 12, "seller_transaction_fee": 4, "actual_shipping_fee": 30,
             "shopee_shipping_rebate": 10, "buyer_paid_shipping_fee": 5, "voucher_from_seller": 8}
    linhas = vendas_shopee.linhas_do_pedido(_pedido("S1", [(1, "A", 1, 150), (2, "B", 1, 50)], renda=renda))
    a, b = linhas
    assert a["comissao"] == 30 and b["comissao"] == 10
    assert a["frete_envio"] == 11.25 and b["frete_envio"] == 3.75
    assert a["bonus_ml"] == -6 and b["bonus_ml"] == -2
    assert a["uf_destino"] == "SP" and a["status"] == "paid"


def test_sem_extrato_frete_fica_pendente_e_cancelado_sai():
    linha = vendas_shopee.linhas_do_pedido(_pedido("S2", [(1, "A", 2, 40)], status="READY_TO_SHIP"))[0]
    assert linha["frete_envio"] is None and linha["comissao"] == 0 and linha["total"] == 80
    assert vendas_shopee.linhas_do_pedido(_pedido("S3", [(1, "A", 1, 40)], status="CANCELLED"))[0]["status"] == "cancelled"


def test_sincronizar_shopee_soma_no_lucro_com_ads_da_loja(client, sessao, monkeypatch):
    _simples_zero(client, sessao)
    _produto(client, sessao, nome="Capinha", sku="CAPA-SHP", custo=10)
    renda = {"commission_fee": 14, "service_fee": 6, "seller_transaction_fee": 0, "actual_shipping_fee": 0}
    _usar(monkeypatch, [_pedido("S10", [(77, "CAPA-SHP", 2, 50)], renda=renda),
                        _pedido("S11", [(77, "CAPA-SHP", 1, 50)], status="UNPAID")],
          ads=[{"data": "2026-09-12", "item_id": "", "custo": 15, "receita": 100, "unidades": 2}])
    r = client.post(f"/api/financeiro/sincronizar?mes={MES}&plataforma=shopee", headers=sessao)
    assert r.status_code == 200, r.text
    assert r.json()["pedidos"] == 1 and any("sem separar por produto" in a for a in r.json()["avisos"])
    res = _lucro(client, sessao)
    venda = next(x for x in res["vendas"] if x["pedido_id"] == "S10")
    assert venda["plataforma"] == "shopee" and venda["produto"]["sku"] == "CAPA-SHP"
    assert venda["lucro"] == 100 - 20 - 20
    assert res["por_plataforma"]["shopee"]["pedidos"] == 1
    assert res["totais"]["ads_sem_venda"] >= 15
    assert "shopee" in res["sincronizacoes"]


def test_sem_loja_shopee_explica(client, sessao):
    r = client.post(f"/api/financeiro/sincronizar?mes={MES}&plataforma=shopee", headers=sessao)
    assert r.status_code == 400 and "Shopee" in r.json()["detail"]
