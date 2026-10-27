from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import Cliente, Venda
from app.services import promocoes


def _em(h, cliente_id):
    return {**h, "X-Cliente": str(cliente_id)}


def _quando(dias: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=dias)).strftime("%Y-%m-%dT%H:%M:%SZ")


class MLFalso:
    demo = False

    def __init__(self):
        self.enviados = []
        self.precos = {"MLB1": 100.0, "MLB2": 100.0, "MLB3": 100.0, "MLB4": 100.0, "MLB5": 100.0}
        self.em_deal = {"MLB3"}

    def ids_ativos(self, limite):
        return list(self.precos)

    def itens_resumidos(self, ids):
        sku = {"MLB1": "A", "MLB2": "B", "MLB3": "A", "MLB4": "A", "MLB5": ""}
        return [{"id": i, "title": f"Produto {i}", "price": self.precos[i], "status": "active",
                 "original_price": 120.0 if i == "MLB4" else (130.0 if i in self.em_deal else None),
                 "seller_custom_field": sku[i], "available_quantity": 10, "category_id": "MLB1234", "listing_type_id": "gold_special",
                 "shipping": {"free_shipping": True, "logistic_type": "drop_off"}, "permalink": f"https://produto.mercadolivre.com.br/{i}"}
                for i in ids if i in self.precos]

    def promocoes_do_vendedor(self):
        return [{"id": "P-DEAL", "type": "DEAL", "name": "Semana do Consumidor", "status": "started",
                 "finish_date": _quando(0.5), "deadline_date": _quando(2)},
                {"id": "P-SMART", "type": "SMART", "name": "Co-participação", "status": "started"},
                {"id": "P-RAIO", "type": "LIGHTNING", "name": "Relâmpago", "status": "pending"},
                {"id": "P-VELHA", "type": "DEAL", "name": "Antiga", "status": "finished"}]

    def itens_da_promocao(self, promocao_id, tipo, status="", limite=3000):
        if promocao_id == "P-DEAL":
            saida = [{"id": "MLB2", "status": "candidate", "original_price": 100, "min_discounted_price": 70,
                      "max_discounted_price": 95, "suggested_discounted_price": 80}]
            if "MLB3" in self.em_deal:
                saida.append({"id": "MLB3", "status": "started", "price": 100, "original_price": 130})
            return saida
        if promocao_id == "P-SMART":
            return [{"id": "MLB1", "status": "candidate", "offer_id": "OF-1", "price": 85, "original_price": 100,
                     "meli_percentage": 5, "seller_percentage": 10}]
        if promocao_id == "P-RAIO":
            return [{"id": "MLB1", "status": "candidate", "price": 70, "original_price": 100}]
        raise AssertionError("campanha encerrada não deve ser lida")

    def promocoes_do_item(self, item_id):
        return []

    def _user_id(self):
        return "999"

    def tarifas_de_venda(self, preco, categoria=""):
        self.consultas_tarifa = getattr(self, "consultas_tarifa", 0) + 1
        fixa = 0 if preco >= 79 else 6.75
        return {"gold_special": {"sale_fee_amount": preco * 0.14 + fixa, "sale_fee_details": {"percentage_fee": 14, "fixed_fee": fixa}},
                "gold_pro": {"sale_fee_amount": preco * 0.19 + fixa, "sale_fee_details": {"percentage_fee": 19, "fixed_fee": fixa}}}

    def frete_do_anuncio(self, vendedor_id, item_id, preco=None):
        return {"custo": 10.0, "peso_g": 500}

    def entrar_na_promocao(self, item_id, corpo):
        self.enviados.append((item_id, corpo))
        return {}


def _preparar(client, adm, monkeypatch):
    ml = MLFalso()
    monkeypatch.setattr(promocoes, "obter_adaptador", lambda *a, **k: (ml, ""))
    assert client.put("/api/financeiro/config", headers=adm, json={"regime": "simples", "aliquota_simples_pct": 0}).status_code == 200
    for nome, sku, custo in (("Garrafa", "A", 50), ("Caneca", "B", 75)):
        assert client.post("/api/financeiro/produtos", headers=adm, json={"nome": nome, "sku": sku, "custo": custo}).status_code == 200
    return ml


def test_leitura_sugere_pela_margem_e_avisa(client, time, monkeypatch):
    adm = _em(time["admin"], time["a"])
    _preparar(client, adm, monkeypatch)
    r = client.post("/api/promocoes/ler", headers=adm)
    assert r.status_code == 200, r.text
    d = r.json()["dados"]
    res = d["resumo"]
    assert (res["ativos"], res["em_promocao"], res["sem_promocao"], res["vencem"], res["convites"]) == (5, 2, 3, 1, 3)
    conv = {(c["item_id"], c["tipo"]): c for c in d["convites"]}
    smart = conv[("MLB1", "SMART")]
    assert smart["acao"] == "aprovar" and smart["preco_sugerido"] == 85 and smart["margem"] >= 15
    assert conv[("MLB2", "DEAL")]["acao"] == "recusar"
    assert conv[("MLB1", "LIGHTNING")]["acao"] == "no_ml"
    itens = {i["item_id"]: i for i in d["itens"]}
    assert itens["MLB1"]["proprio"]["acao"] == "aprovar" and itens["MLB1"]["proprio"]["preco_sugerido"] == 90
    assert itens["MLB2"]["proprio"]["acao"] == "recusar"
    assert itens["MLB5"]["proprio"]["acao"] == "sem_custo"
    assert itens["MLB4"]["promocoes"][0]["tipo"] == "PRICE_DISCOUNT" and itens["MLB4"]["proprio"] is None
    assert itens["MLB3"]["vence"]
    assert smart["taxas"]["comissao_pct"] == 14 and smart["taxas"]["frete"] == 10 and smart["taxas"]["fonte"] == "mercado_livre"
    lucr = client.get("/api/financeiro/lucratividade", headers=adm).json()
    garrafa = next(p for p in lucr["produtos"] if p["sku"] == "A")["canais"]["mercadolivre"]
    assert garrafa["fonte"] == "mercado_livre" and garrafa["comissao_pct"] == 14 and garrafa["frete_unidade"] == 10
    avisos = client.get("/api/notificacoes", headers=time["admin"]).json()["itens"]
    assert any(n["tipo"] == "promocao" for n in avisos)
    assert any(n["tipo"] == "promocao" for n in client.get("/api/notificacoes", headers=time["cons"]).json()["itens"])
    geral = client.get("/api/promocoes/geral", headers=time["admin"]).json()["clientes"]
    assert next(c for c in geral if c["id"] == time["a"])["resumo"]["sem_promocao"] == 3


def test_aprovacao_em_lote_confere_antes_de_enviar(client, time, monkeypatch):
    adm = _em(time["admin"], time["a"])
    ml = _preparar(client, adm, monkeypatch)
    client.post("/api/promocoes/ler", headers=adm)
    ml.precos["MLB5"] = 140.0
    corpo = {"itens": [{"item_id": "MLB1", "promocao_id": ""}, {"item_id": "MLB1", "promocao_id": "P-SMART"},
                       {"item_id": "MLB2", "promocao_id": "P-DEAL"}, {"item_id": "MLB4", "promocao_id": ""},
                       {"item_id": "MLB5", "promocao_id": ""}], "aceitar_sem_custo": True}
    assert client.post("/api/promocoes/aplicar", headers=_em(time["cons"], time["a"]), json=corpo).status_code == 403
    r = client.post("/api/promocoes/aplicar", headers=adm, json=corpo)
    assert r.status_code == 200, r.text
    res = r.json()
    assert sorted(a["item_id"] for a in res["aplicados"]) == ["MLB1", "MLB1"]
    assert {x["item_id"] for x in res["recusados"]} == {"MLB2", "MLB4", "MLB5"}
    enviados = dict((c["promotion_type"], (i, c)) for i, c in ml.enviados)
    assert enviados["PRICE_DISCOUNT"][1]["deal_price"] == 90 and enviados["PRICE_DISCOUNT"][1]["finish_date"]
    assert enviados["SMART"][1] == {"promotion_id": "P-SMART", "promotion_type": "SMART", "offer_id": "OF-1"}
    assert "price" not in str(ml.enviados).replace("deal_price", "")
    ml.em_deal.clear()
    d = client.post("/api/promocoes/ler", headers=adm).json()["dados"]
    assert d["resumo"]["acabaram_hoje"] == 1 and d["acabaram"][0]["item_id"] == "MLB3"


def test_regras_responsavel_e_mensagem_do_grupo(client, time, monkeypatch):
    adm = _em(time["admin"], time["a"])
    _preparar(client, adm, monkeypatch)
    regras = {"ativo": True, "margem_minima_pct": 20, "desconto_padrao_pct": 10, "desconto_maximo_pct": 40, "dias_campanha": 7,
              "avisar_dias_antes": 1, "responsavel_id": time["op_id"]}
    assert client.put("/api/promocoes/config", headers=_em(time["cons"], time["a"]), json=regras).status_code == 403
    assert client.put("/api/promocoes/config", headers=adm, json={**regras, "desconto_padrao_pct": 50}).status_code == 400
    assert client.put("/api/promocoes/config", headers=adm, json=regras).json()["responsavel"] == "Olga Operadora"
    d = client.post("/api/promocoes/ler", headers=adm).json()["dados"]
    assert {i["item_id"]: i for i in d["itens"]}["MLB1"]["proprio"]["preco_sugerido"] > 90
    texto = client.get("/api/promocoes/mensagem", headers=time["admin"]).json()["texto"]
    assert "@Olga, colocar promoção nos produtos da Cliente A" in texto
    assert any(n["tipo"] == "promocao" for n in client.get("/api/notificacoes", headers=time["op"]).json()["itens"])
    assert client.get("/api/promocoes", headers=time["loja"]).status_code == 403
    assert client.get("/api/promocoes/geral", headers=time["loja"]).status_code == 403
    geral = client.get("/api/promocoes/geral", headers=time["op_b"]).json()["clientes"]
    assert [c["id"] for c in geral] == [time["b"]]


def test_sem_conta_conectada_nao_inventa_promocao(client, sessao):
    r = client.post("/api/promocoes/ler", headers=sessao)
    assert r.status_code == 400 and client.get("/api/promocoes", headers=sessao).json()["dados"] is None


def test_faturamento_geral_soma_os_marketplaces(client, time):
    with SessionLocal() as db:
        empresa = db.get(Cliente, time["a"]).empresa_id
        quando = datetime(2026, 9, 15, 15, tzinfo=timezone.utc)
        for cid, plat, pedido, total, extra in ((time["a"], "mercadolivre", "1", 1000, {}), (time["a"], "shopee", "2", 500, {}),
                                                (time["b"], "amazon", "3", 500, {}), (time["a"], "mercadolivre", "4", 300, {"simulada": True}),
                                                (time["a"], "mercadolivre", "5", 200, {"status": "cancelled"}),
                                                (time["b"], "mercadolivre", "6", 100, {"reembolso": 40.0})):
            db.add(Venda(empresa_id=empresa, cliente_id=cid, plataforma=plat, pedido_id=pedido, item_id="MLB1", total=total,
                         status=extra.get("status", "paid"), data_venda=quando, simulada=extra.get("simulada", False),
                         reembolso=extra.get("reembolso", 0.0)))
        db.commit()
    f = client.get("/api/faturamento-geral?mes=2026-09", headers=time["admin"]).json()
    m = f["mes_recorte"]
    assert m["por_plataforma"] == {"mercadolivre": 1060, "shopee": 500, "amazon": 500} and m["total"] == 2060
    assert {c["id"]: c["total"] for c in m["clientes"]} == {time["a"]: 1500, time["b"]: 560}
    assert f["assessoria"]["total"] == 0
    assert client.patch(f"/api/clientes/{time['a']}", headers=time["admin"], json={"inicio_assessoria": "2099-01-01"}).status_code == 400
    assert client.patch(f"/api/clientes/{time['a']}", headers=time["admin"], json={"inicio_assessoria": "2026-09-01"}).status_code == 200
    f = client.get("/api/faturamento-geral?mes=2026-10", headers=time["admin"]).json()
    assert {c["id"]: c["total"] for c in f["assessoria"]["clientes"]} == {time["a"]: 1500, time["b"]: 0}
    assert f["assessoria"]["por_plataforma"]["shopee"] == 500 and f["mes_recorte"]["total"] == 0
    so_a = client.get("/api/faturamento-geral?mes=2026-09", headers=time["op"]).json()["mes_recorte"]
    assert so_a["total"] == 1500 and [c["id"] for c in so_a["clientes"]] == [time["a"]]
    assert client.get("/api/faturamento-geral?mes=2026-09", headers=time["loja"]).status_code == 403
