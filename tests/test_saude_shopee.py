"""Saúde da loja na Shopee: Account Health, penalidades e anúncios bloqueados."""

import time

import httpx

from app import config
from app.marketplaces.shopee import Shopee
from app.services import saude

DESEMPENHO = {
    "overall_performance": {"rating": 2},
    "metric_list": [
        {"metric_name": "late_shipment_rate", "current_period": 12.5, "unit": 2, "target": {"value": 10, "comparator": "<"}},
        {"metric_name": "response_rate", "current_period": 95, "unit": 2, "target": {"value": 80, "comparator": ">="}},
        {"metric_name": "metrica_sem_meta", "current_period": 3, "unit": 1, "target": {}},
    ],
}


def test_analise_da_shopee_aponta_o_que_esta_fora_da_meta():
    nivel, d = saude.analisar_shopee(DESEMPENHO, {"penalty_points": {"overall_penalty_points": 2}},
                                     {"active": 40, "paused": 1, "under_review": 0, "banned": 0}, [], "Loja da Ana")
    assert nivel == "atencao" and d["nota"] == "Precisa melhorar" and d["pontos_penalidade"] == 2
    assert d["metricas"] == [
        {"nome": "Envios com atraso", "valor": "12,5%", "meta": "< 10%", "ok": False},
        {"nome": "Taxa de resposta do chat", "valor": "95%", "meta": ">= 80%", "ok": True},
    ]
    assert any("Envios com atraso: 12,5%" in a for a in d["alertas"])
    assert any("2 ponto(s) de penalidade" in a for a in d["alertas"])


def test_punicao_ou_anuncio_bloqueado_e_critico():
    nivel, d = saude.analisar_shopee({"overall_performance": {"rating": 4}}, {
        "penalty_points": {"overall_penalty_points": 4},
        "ongoing_punishment": [{"punishment_tier": 1, "punishment_name": "Anúncios sem destaque", "days_left": 5}]},
        {"active": 3}, [], "")
    assert nivel == "critico" and "Anúncios sem destaque (faltam 5 dias)" in d["alertas"][0]
    nivel, d = saude.analisar_shopee({"overall_performance": {"rating": 3}}, {}, {"banned": 1},
                                     [{"id": "9", "titulo": "Fone", "link": ""}])
    assert nivel == "critico" and d["moderados"][0]["motivo"] == "bloqueado pela Shopee"
    nivel, d = saude.analisar_shopee({"overall_performance": {"rating": 4}}, {}, {"active": 3}, [])
    assert nivel == "ok" and d["alertas"] == []


def test_adaptador_conta_e_lista_bloqueados(monkeypatch):
    monkeypatch.setattr(config, "SHOPEE_PARTNER_ID", "1001")
    monkeypatch.setattr(config, "SHOPEE_PARTNER_KEY", "chave")
    totais = {"NORMAL": 40, "UNLIST": 2, "REVIEWING": 1, "BANNED": 1}

    def handler(req):
        q = req.url.params
        if req.url.path.endswith("get_item_list"):
            if q["page_size"] == "1":
                return httpx.Response(200, json={"response": {"total_count": totais[q["item_status"]]}})
            return httpx.Response(200, json={"response": {"item": [{"item_id": 77, "item_status": "BANNED"}]}})
        if req.url.path.endswith("get_item_base_info"):
            return httpx.Response(200, json={"response": {"item_list": [{"item_id": 77, "item_name": "Fone Bluetooth"}]}})
        return httpx.Response(404)

    s = Shopee({"access_token": "AT", "shop_id": "555", "obtido_em": time.time(), "expire_in": 14400})
    s.http = httpx.Client(transport=httpx.MockTransport(handler))
    assert s.contagem_anuncios() == {"active": 40, "paused": 2, "under_review": 1, "banned": 1}
    assert s.anuncios_bloqueados() == [{"id": "77", "titulo": "Fone Bluetooth", "link": "https://shopee.com.br/product/555/77"}]


def test_tela_de_saude_mostra_a_shopee_quando_a_loja_esta_conectada(client, sessao, monkeypatch):
    from app.security import criar_state_oauth
    from tests.test_multicliente import _shopee_falsa
    _shopee_falsa(monkeypatch, nome="Loja da Ana")
    cid = int(sessao["X-Cliente"])
    me = client.get("/api/me", headers=sessao).json()
    assert client.post(f"/api/saude/{cid}/atualizar", headers=sessao).json()["shopee"] is None
    client.get(f"/api/contas/shopee/callback?code=c&shop_id=4321&state={criar_state_oauth(me['empresa']['id'], cid)}")

    class LojaFalsa:
        demo = False
        conta_info = {"apelido": "Loja da Ana"}

        def desempenho_loja(self):
            return DESEMPENHO

        def penalidades(self):
            return {"ongoing_punishment": [{"punishment_name": "Limite de anúncios", "days_left": 3}]}

        def contagem_anuncios(self):
            return {"active": 10, "paused": 0, "under_review": 0, "banned": 0}

        def anuncios_bloqueados(self):
            return []

    original = saude.obter_adaptador

    def adaptador(db, cliente_id, plataforma, operacao="pesquisar"):
        return (LojaFalsa(), "") if plataforma == "shopee" else original(db, cliente_id, plataforma, operacao)

    monkeypatch.setattr(saude, "obter_adaptador", adaptador)
    r = client.post(f"/api/saude/{cid}/atualizar", headers=sessao).json()
    assert r["shopee"]["nivel"] == "critico" and r["nivel"] == "critico"
    assert r["shopee"]["dados"]["apelido"] == "Loja da Ana"
    linha = next(c for c in client.get("/api/saude", headers=sessao).json() if c["id"] == cid)
    assert linha["shopee"]["nivel"] == "critico" and linha["nivel"] == "critico"
    assert client.get(f"/api/relatorios/{cid}?mes=2026-10", headers=sessao).json()["saude"]["nivel"] == linha["nivel_ml"]

    client.delete("/api/contas/shopee", headers=sessao)
    linha = next(c for c in client.get("/api/saude", headers=sessao).json() if c["id"] == cid)
    assert linha["shopee"] is None and linha["nivel"] == linha["nivel_ml"]


def test_margem_da_shopee_usa_a_tarifa_cobrada_nas_vendas(client, sessao):
    from datetime import datetime, timezone

    from app.db import SessionLocal
    from app.models import Cliente, Venda
    from app.services import margem
    cid = int(sessao["X-Cliente"])
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Fone Bluetooth", "preco": 100, "custo": 40}).json()
    estimado = client.post(f"/api/anuncios/{a['id']}/margem", headers=sessao, json={"plataformas": ["shopee"]}).json()["shopee"]
    assert "estimativa" in estimado["fonte_tarifa"]

    with SessionLocal() as db:
        empresa = db.get(Cliente, cid).empresa_id
        agora = datetime.now(timezone.utc)
        for i in range(5):
            db.add(Venda(empresa_id=empresa, cliente_id=cid, plataforma="shopee", pedido_id=f"SP{i}", item_id="1",
                         quantidade=1, preco_unitario=50, total=50, comissao=50 * 0.18 + config.SHOPEE_TAXA_FIXA,
                         status="paid", data_venda=agora))
        db.add(Venda(empresa_id=empresa, cliente_id=cid, plataforma="shopee", pedido_id="CANC", item_id="1",
                     quantidade=1, preco_unitario=50, total=50, comissao=40, status="cancelled", data_venda=agora))
        db.commit()
        assert margem.pct_shopee_das_vendas(db, cid) == (18.0, 5)

    real = client.post(f"/api/anuncios/{a['id']}/margem", headers=sessao, json={"plataformas": ["shopee"]}).json()["shopee"]
    assert real["fonte_tarifa"].startswith("18,0% + R$ ") and "últimas 5 vendas" in real["fonte_tarifa"]
    assert abs(real["tarifa"] - (18 + config.SHOPEE_TAXA_FIXA)) < 0.01
