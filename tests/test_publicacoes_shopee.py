"""Anúncios publicados na Shopee: situação, pausar, reativar, excluir, preço e estoque."""

import json
import time

import httpx
import pytest

from app import config
from app.marketplaces.base import ErroMarketplace
from app.marketplaces.shopee import Shopee
from app.services import publicacoes


def _loja(handler, monkeypatch):
    monkeypatch.setattr(config, "SHOPEE_PARTNER_ID", "1001")
    monkeypatch.setattr(config, "SHOPEE_PARTNER_KEY", "chave")
    s = Shopee({"access_token": "AT", "refresh_token": "RT", "shop_id": "555", "obtido_em": time.time(), "expire_in": 14400})
    s.http = httpx.Client(transport=httpx.MockTransport(handler))
    return s


def test_situacao_dos_anuncios_da_shopee(monkeypatch):
    def handler(req):
        q = req.url.params
        assert q["shop_id"] == "555" and q["access_token"] == "AT"
        if req.url.path.endswith("get_item_base_info"):
            assert q["item_id_list"] == "11,22,33"
            return httpx.Response(200, json={"response": {"item_list": [
                {"item_id": 11, "item_status": "NORMAL", "price_info": [{"current_price": 49.9}],
                 "stock_info_v2": {"summary_info": {"total_available_stock": 7}}},
                {"item_id": 22, "item_status": "BANNED", "has_model": True},
            ]}})
        if req.url.path.endswith("get_item_extra_info"):
            return httpx.Response(200, json={"response": {"item_list": [{"item_id": 11, "sale": 30}]}})
        return httpx.Response(404)

    s = _loja(handler, monkeypatch).situacao_itens(["11", "22", "33"])
    assert s["11"] == {"status": "active", "sub_status": [], "acessivel": True, "preco": 49.9, "estoque": 7,
                       "vendidos": 30, "variacoes": False, "link": "https://shopee.com.br/product/555/11"}
    assert s["22"]["status"] == "inactive" and s["22"]["sub_status"] == ["bloqueado pela Shopee"] and s["22"]["variacoes"]
    assert s["33"] == {"status": None, "sub_status": [], "acessivel": False}


def test_pausar_reativar_excluir_preco_e_estoque_na_shopee(monkeypatch):
    chamadas = []

    def handler(req):
        chamadas.append((req.url.path.rsplit("/", 1)[-1], json.loads(req.content)))
        if req.url.path.endswith("unlist_item") and chamadas[-1][1]["item_list"][0]["item_id"] == 99:
            return httpx.Response(200, json={"response": {"failure_list": [{"item_id": 99, "failed_reason": "item em promoção"}]}})
        return httpx.Response(200, json={"error": "", "response": {}})

    s = _loja(handler, monkeypatch)
    s.alterar_status("11", "paused")
    s.alterar_status("11", "active")
    s.excluir("11")
    s.atualizar_preco("11", 59.9)
    s.atualizar_estoque("11", 4)
    assert chamadas == [
        ("unlist_item", {"item_list": [{"item_id": 11, "unlist": True}]}),
        ("unlist_item", {"item_list": [{"item_id": 11, "unlist": False}]}),
        ("delete_item", {"item_id": 11}),
        ("update_price", {"item_id": 11, "price_list": [{"original_price": 59.9}]}),
        ("update_stock", {"item_id": 11, "stock_list": [{"seller_stock": [{"stock": 4}]}]}),
    ]
    with pytest.raises(ErroMarketplace, match="item em promoção"):
        s.alterar_status("99", "paused")
    with pytest.raises(ErroMarketplace, match="pausar, reativar ou excluir"):
        s.alterar_status("11", "closed")


def _publicado_na_shopee(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={
        "titulo": "Garrafa Térmica Inox 1L", "preco": 80, "peso_kg": 0.6, "fotos": ["https://cdn.exemplo.com/1.jpg"],
        "descricao": "Garrafa térmica de aço inox com parede dupla, mantém quente por 12 horas. " * 2}).json()
    pub = client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["shopee"]}).json()
    p = pub["publicacoes"][0]
    assert p["sucesso"], p
    return p["id"]


def test_anuncio_simulado_da_shopee_nao_tem_finalizar(client, sessao):
    pid = str(_publicado_na_shopee(client, sessao))
    s = client.get("/api/publicacoes/situacao", headers=sessao).json()[pid]
    assert s["status"] == "active" and s["acoes"] == ["excluir", "pausar"] and s["edita_preco"]
    assert client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "finalizar"}).status_code == 400
    assert client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "pausar"}).json()["status"] == "paused"
    assert client.get("/api/publicacoes/situacao", headers=sessao).json()[pid]["acoes"] == ["excluir", "reativar"]

    r = client.post(f"/api/publicacoes/{pid}/preco-estoque", headers=sessao, json={"preco": 75.5, "estoque": 3})
    assert r.status_code == 200 and r.json()["simulado"]
    s = client.get("/api/publicacoes/situacao", headers=sessao).json()[pid]
    assert s["preco"] == 75.5 and s["estoque"] == 3
    assert client.post(f"/api/publicacoes/{pid}/preco-estoque", headers=sessao, json={"preco": 0}).status_code == 400
    assert client.post(f"/api/publicacoes/{pid}/preco-estoque", headers=sessao, json={}).status_code == 400
    atividades = client.get("/api/atividades", headers=sessao).json()
    assert any("Mudou o preço para R$ 75,50 e o estoque para 3" in a["descricao"] and "na Shopee" in a["descricao"]
               for a in atividades)


def test_anuncio_real_da_shopee_usa_a_loja_do_cliente(client, sessao, monkeypatch):
    from app.db import SessionLocal
    from app.models import Publicacao
    pid = _publicado_na_shopee(client, sessao)
    with SessionLocal() as db:
        p = db.get(Publicacao, pid)
        p.demo, p.id_externo, p.conta_apelido = False, "11", "Loja Antiga"
        db.commit()
    feito = []

    class LojaFalsa:
        demo = False
        conta_info = {"apelido": "Loja Nova"}

        def situacao_itens(self, ids):
            return {"11": {"status": "active", "sub_status": [], "acessivel": True, "preco": 80.0, "estoque": 9,
                           "vendidos": 2, "link": "https://shopee.com.br/product/555/11"}}

        def alterar_status(self, item_id, status):
            feito.append(("status", item_id, status))

        def excluir(self, item_id):
            feito.append(("excluir", item_id))

        def atualizar_preco(self, item_id, preco):
            feito.append(("preco", item_id, preco))

        def atualizar_estoque(self, item_id, estoque):
            raise ErroMarketplace("Shopee (update_stock): item com variações")

    monkeypatch.setattr(publicacoes, "obter_adaptador", lambda db, cid, plat, op: (LojaFalsa(), ""))
    s = client.get("/api/publicacoes/situacao", headers=sessao).json()[str(pid)]
    assert s["status"] == "active" and s["estoque"] == 9 and s["acoes"] == ["excluir", "pausar"]
    assert client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "pausar"}).json()["simulado"] is False
    assert client.post(f"/api/publicacoes/{pid}/preco-estoque", headers=sessao, json={"preco": 70}).status_code == 200
    r = client.post(f"/api/publicacoes/{pid}/preco-estoque", headers=sessao, json={"estoque": 2})
    assert r.status_code == 400 and "variações" in r.json()["detail"]
    assert feito == [("status", "11", "paused"), ("preco", "11", 70.0)]

    LojaFalsa.situacao_itens = lambda self, ids: {"11": {"status": None, "sub_status": [], "acessivel": False}}
    s = client.get("/api/publicacoes/situacao", headers=sessao).json()[str(pid)]
    assert s["outra_conta"] and "Loja Antiga" in s["aviso"] and "Loja Nova" in s["aviso"] and not s["acoes"]

    LojaFalsa.situacao_itens = lambda self, ids: {"11": {"status": "deleted", "sub_status": [], "acessivel": True}}
    s = client.get("/api/publicacoes/situacao", headers=sessao).json()[str(pid)]
    assert s["removida"]


def test_preco_e_estoque_tambem_no_mercado_livre(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={
        "titulo": "Garrafa Térmica Inox 1L", "preco": 80, "fotos": ["https://cdn.exemplo.com/1.jpg"],
        "descricao": "Garrafa térmica de aço inox com parede dupla, mantém quente por 12 horas. " * 2}).json()
    pid = client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao,
                      json={"plataformas": ["mercadolivre"]}).json()["publicacoes"][0]["id"]
    r = client.post(f"/api/publicacoes/{pid}/preco-estoque", headers=sessao, json={"estoque": 12})
    assert r.status_code == 200 and r.json()["simulado"]
    assert client.get("/api/publicacoes/situacao", headers=sessao).json()[str(pid)]["estoque"] == 12
