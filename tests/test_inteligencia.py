"""Radar de anúncios e Análise de concorrentes."""

import pytest

from app.services import mercado

MEU = "777"


class Resposta:
    def __init__(self, dados, status=200):
        self.dados, self.status_code = dados, status

    def json(self):
        return self.dados


class MLFalso:
    preco_concorrente = 90.0

    def _token(self):
        return "t"

    def _user_id(self):
        return MEU

    def tarifa_venda(self, preco, tipo, categoria=""):
        return {"sale_fee_amount": round(preco * 0.14, 2)}

    def _get(self, caminho, params=None, auth=True):
        if caminho == "/items/MLB111":
            return Resposta({"id": "MLB111", "title": "Garrafa Inox", "price": 150.0, "status": "active", "seller_id": int(MEU),
                             "listing_type_id": "gold_special", "category_id": "MLB10", "catalog_product_id": "MLB900",
                             "available_quantity": 7, "shipping": {"logistic_type": "fulfillment", "free_shipping": True}})
        if caminho == "/items/MLB111/visits/time_window":
            return Resposta({"total_visits": 300})
        if caminho.startswith("/items/"):
            return Resposta({"message": "forbidden"}, 403)
        if caminho == "/products/MLB900/items":
            return Resposta({"paging": {"total": 3}, "results": [
                {"item_id": "MLB111", "price": 150.0, "seller_id": int(MEU), "listing_type_id": "gold_special", "shipping": {}},
                {"item_id": "MLB222", "price": self.preco_concorrente, "seller_id": 555, "listing_type_id": "gold_pro",
                 "official_store_id": 3, "shipping": {"logistic_type": "fulfillment", "free_shipping": True}},
                {"item_id": "MLB333", "price": 100.0, "seller_id": 556, "listing_type_id": "gold_special", "shipping": {}}]})
        if caminho == "/products/MLB900":
            return Resposta({"id": "MLB900", "name": "Garrafa Inox 1L", "pictures": [{"url": "https://http2.mlstatic.com/a.jpg"}]})
        if caminho.startswith("/users/"):
            return Resposta({"nickname": "LOJA_" + caminho.split("/")[-1], "seller_reputation": {"level_id": "5_green"}})
        return Resposta({}, 404)


@pytest.fixture
def ml(monkeypatch, client, sessao):
    from app.db import SessionLocal
    from app.models import Cliente, ContaMarketplace
    from app.security import criptografar

    falso = MLFalso()
    monkeypatch.setattr(mercado, "adaptador_ml", lambda db, empresa_id, cliente_id: falso)
    with SessionLocal() as db:
        cli = db.get(Cliente, int(sessao["X-Cliente"]))
        db.add(ContaMarketplace(empresa_id=cli.empresa_id, cliente_id=cli.id, plataforma="mercadolivre", apelido="MINHA",
                                id_externo=MEU, credenciais_cript=criptografar({"access_token": "x"})))
        db.commit()
    return falso


def test_meu_anuncio_traz_visitas_tarifa_e_posicao_no_preco(client, sessao, ml):
    r = client.post("/api/monitor", headers=sessao, json={"link": "https://produto.mercadolivre.com.br/MLB-111-garrafa"})
    assert r.status_code == 200, r.text
    assert r.json()["proprio"] is True
    item = client.get("/api/monitor", headers=sessao).json()[0]
    d = item["atual"]["dados"]
    assert d["visitas_30d"] == 300 and d["tarifa"] == 21.0 and d["voce_recebe"] == 129.0
    assert d["posicao_preco"] == 3 and d["mercado_mediana"] == 100.0
    assert d["vendas_30d"] is None
    assert any("acima da mediana" in a["texto"] for a in item["alertas"])


def test_anuncio_de_concorrente_pede_o_produto_de_catalogo(client, sessao, ml):
    r = client.post("/api/monitor", headers=sessao, json={"link": "MLB222"})
    assert r.status_code == 400 and "produto de catálogo" in r.json()["detail"]


def test_produto_de_catalogo_e_alerta_de_queda_de_preco(client, sessao, ml):
    r = client.post("/api/monitor", headers=sessao, json={"link": "https://www.mercadolivre.com.br/garrafa/p/MLB900"})
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    ml.preco_concorrente = 80.0
    assert client.post(f"/api/monitor/{mid}/atualizar", headers=sessao).status_code == 200
    item = next(x for x in client.get("/api/monitor", headers=sessao).json() if x["id"] == mid)
    assert item["tipo"] == "produto" and item["precos"] == [90.0, 80.0]
    assert any("caiu" in a["texto"] for a in item["alertas"])
    comp = client.get("/api/concorrentes/produto/MLB900", headers=sessao).json()
    assert comp["linha_do_tempo"][0]["de"] == 90.0 and comp["linha_do_tempo"][0]["para"] == 80.0
    assert client.post("/api/monitor", headers=sessao, json={"produto_id": "MLB900"}).status_code == 400


def test_comparativo_mostra_faixa_e_minha_posicao(client, sessao, ml):
    comp = client.get("/api/concorrentes/produto/MLB900", headers=sessao).json()
    assert comp["faixa"]["minimo"] == 90.0 and comp["faixa"]["maximo"] == 150.0 and comp["faixa"]["minha_posicao"] == 3
    assert [x["sou_eu"] for x in comp["ofertas"]] == [False, False, True]
    assert all(x["vendas"] is None for x in comp["ofertas"]) and "não vêm pela API" in comp["sem_api"]
    assert client.get("/api/concorrentes/produto/x;1", headers=sessao).status_code == 422


def test_cadastro_de_concorrente_e_resumo_sem_ia(client, sessao, ml):
    r = client.post("/api/concorrentes", headers=sessao, json={"vendedor_id": "555"})
    assert r.status_code == 200 and r.json()["apelido"] == "LOJA_555"
    assert client.post("/api/concorrentes", headers=sessao, json={"vendedor_id": "555"}).status_code == 400
    assert client.post("/api/concorrentes", headers=sessao, json={"vendedor_id": MEU}).status_code == 400
    comp = client.get("/api/concorrentes/produto/MLB900", headers=sessao).json()
    assert next(x for x in comp["ofertas"] if x["vendedor_id"] == "555")["cadastrado"] is True
    resumo = client.post("/api/concorrentes/produto/MLB900/resumo", headers=sessao).json()
    assert resumo["fonte"] == "regras" and "3 oferta(s)" in resumo["resumo"]


def test_isolamento_entre_clientes(client, sessao, ml):
    mid = client.post("/api/monitor", headers=sessao, json={"link": "MLB111"}).json()["id"]
    outro = client.post("/api/clientes", headers=sessao, json={"nome": "Outra loja"}).json()["id"]
    h2 = {**sessao, "X-Cliente": str(outro)}
    assert client.get("/api/monitor", headers=h2).json() == []
    assert client.get(f"/api/monitor/{mid}", headers=h2).status_code == 404
    assert client.delete(f"/api/monitor/{mid}", headers=h2).status_code == 404


def test_demonstracao_identificada_sem_conta(client, sessao):
    r = client.post("/api/monitor", headers=sessao, json={"link": "MLB12345678"})
    assert r.status_code == 200, r.text
    item = client.get("/api/monitor", headers=sessao).json()[0]
    assert item["demo"] is True and item["atual"]["demo"] is True
    comp = client.get("/api/concorrentes/produto/MLB900", headers=sessao).json()
    assert comp["demo"] is True and comp["ofertas"]
