"""Consultor, central de perguntas, pesquisas recentes, publicações, estoque Full e bônus do ML no lucro."""

from datetime import date

import pytest

from app.services import estoque_full, financeiro


def _login(client, email, senha="senha-forte-123"):
    r = client.post("/api/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def _em(h, cliente_id):
    return {**h, "X-Cliente": str(cliente_id)}


@pytest.fixture
def equipe(client, sessao, novo_email):
    """Admin com clientes A e B, um operador e um consultor que atendem só o A."""
    admin = {"Authorization": sessao["Authorization"]}
    a = int(sessao["X-Cliente"])
    b = client.post("/api/clientes", headers=admin, json={"nome": "Cliente B"}).json()["id"]
    logins = {}
    for papel in ("operador", "consultor"):
        email = novo_email(papel[:3])
        r = client.post("/api/empresa/usuarios", headers=admin, json={
            "nome": papel.title(), "email": email, "senha": "senha-forte-123", "papel": papel, "clientes": [a]})
        assert r.status_code == 200, r.text
        logins[papel] = _login(client, email)
    return {"admin": admin, "a": a, "b": b, **logins}


def test_consultor_acompanha_sem_editar(client, equipe):
    con = equipe["consultor"]
    me = client.get("/api/me", headers=con).json()
    assert me["papel"] == "consultor" and [c["id"] for c in me["clientes"]] == [equipe["a"]]
    rascunho = client.post("/api/anuncios", headers=_em(equipe["operador"], equipe["a"]), json={"titulo": "Garrafa"}).json()
    assert client.get("/api/anuncios", headers=_em(con, equipe["a"])).status_code == 200
    assert client.get("/api/publicacoes", headers=_em(con, equipe["a"])).status_code == 200
    assert client.get("/api/financeiro/lucro?mes=2026-09", headers=_em(con, equipe["a"])).status_code == 200
    assert client.get("/api/painel", headers=con).status_code == 200
    assert client.get("/api/anuncios", headers=_em(con, equipe["b"])).status_code == 403
    assert client.patch(f"/api/anuncios/{rascunho['id']}", headers=con, json={"titulo": "x"}).status_code == 403
    assert client.post("/api/anuncios", headers=_em(con, equipe["a"]), json={"titulo": "x"}).status_code == 403
    assert client.post("/api/pesquisas", headers=_em(con, equipe["a"]), json={"termo": "x", "plataformas": ["mercadolivre"]}).status_code == 403
    assert client.post("/api/financeiro/produtos", headers=_em(con, equipe["a"]), json={"nome": "X"}).status_code == 403
    assert client.post("/api/financeiro/produtos", headers=_em(equipe["operador"], equipe["a"]), json={"nome": "X"}).status_code == 200


def test_consultor_entra_na_equipe_do_cliente_e_troca_de_papel(client, equipe):
    admin = equipe["admin"]
    usuarios = client.get("/api/empresa/usuarios", headers=admin).json()
    con = next(u for u in usuarios if u["papel"] == "consultor")
    assert con["clientes"] == [equipe["a"]]
    r = client.put(f"/api/clientes/{equipe['b']}/operadores", headers=admin, json={"ids": [con["id"]]})
    assert r.status_code == 200, r.text
    lista = {c["id"]: c for c in client.get("/api/clientes", headers=admin).json()}
    assert lista[equipe["b"]]["consultores"] == ["Consultor"] and lista[equipe["b"]]["operadores"] == []
    r = client.patch(f"/api/empresa/usuarios/{con['id']}", headers=admin, json={"papel": "operador"})
    assert r.status_code == 200 and r.json()["papel"] == "operador"


def test_central_de_perguntas_junta_os_clientes_do_operador(client, equipe):
    r = client.get("/api/perguntas/central", headers=equipe["admin"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sem_conta"] == 2 and d["perguntas"] == []
    assert client.get("/api/perguntas/central", headers=equipe["operador"]).json()["sem_conta"] == 1
    assert client.get("/api/perguntas/central", headers=equipe["consultor"]).status_code == 200
    r = client.post(f"/api/clientes/{equipe['a']}/perguntas/1001/responder", headers=equipe["operador"], json={"texto": "Sim, serve."})
    assert r.status_code == 200 and r.json()["simulado"]
    r = client.post(f"/api/clientes/{equipe['b']}/perguntas/1001/responder", headers=equipe["operador"], json={"texto": "Sim."})
    assert r.status_code == 404
    r = client.post(f"/api/clientes/{equipe['a']}/perguntas/1001/responder", headers=equipe["consultor"], json={"texto": "Sim."})
    assert r.status_code == 403


def test_apagar_pesquisas_recentes(client, sessao):
    for termo in ("garrafa", "fone"):
        assert client.post("/api/pesquisas", headers=sessao, json={"termo": termo, "plataformas": ["mercadolivre"]}).status_code == 200
    lista = client.get("/api/pesquisas", headers=sessao).json()
    assert len(lista) == 2
    assert client.delete(f"/api/pesquisas/{lista[0]['id']}", headers=sessao).status_code == 200
    assert [p["termo"] for p in client.get("/api/pesquisas", headers=sessao).json()] == ["garrafa"]
    assert client.delete("/api/pesquisas", headers=sessao).json()["apagadas"] == 1
    assert client.get("/api/pesquisas", headers=sessao).json() == []


def test_pesquisa_por_anuncios_traz_contagem_para_os_filtros(client, sessao):
    r = client.post("/api/pesquisas", headers=sessao, json={"termo": "garrafa", "plataformas": ["mercadolivre"], "modo": "anuncios"})
    x = r.json()["resultados"][0]["extra"]
    assert x["full"] + x["fora_full"] == x["anuncios"] and x["premium"] + x["classico"] == x["anuncios"]


def test_publicacoes_trazem_foto_preco_e_falha_volta_para_rascunho(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Garrafa Térmica Inox 1 Litro", "preco": 80,
                                                          "fotos": ["https://exemplo.com/f.jpg"]}).json()
    client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]})
    pubs = client.get("/api/publicacoes", headers=sessao).json()
    assert pubs and {"foto", "preco", "estoque", "rascunho_status"} <= set(pubs[0])
    lista = client.get("/api/anuncios", headers=sessao).json()
    assert "falha" in lista[0]


def test_estoque_full_demonstracao(client, sessao):
    r = client.get("/api/financeiro/estoque-full", headers=sessao)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["demo"] and d["itens"] and d["totais"]["unidades"] == sum(x["total"] for x in d["itens"])
    assert client.put("/api/financeiro/estoque-full/config", headers=sessao,
                      json={"custo_unidade_mes": 1.5, "dias_prolongado": 120}).status_code == 200
    d = client.get("/api/financeiro/estoque-full", headers=sessao).json()
    assert d["limite_dias"] == 120 and d["custo_unidade_mes"] == 1.5 and d["totais"]["armazenagem_estimada"] > 0


def test_fifo_e_projecao_do_full():
    hoje = date(2026, 10, 1)
    lotes = estoque_full.lotes_fifo([(date(2026, 3, 1), 50), (date(2026, 8, 1), 30)], 60)
    assert lotes == [(date(2026, 3, 1), 30), (date(2026, 8, 1), 30)]
    ate = estoque_full.fim_do_mes_que_vem(hoje)
    assert ate == date(2026, 11, 30)
    p = estoque_full.projetar(lotes, 0.5, hoje, ate, 180)
    assert p["restantes"] == 60 - 30 and p["acima_limite"] == 0 and p["acima_limite_hoje"] == 30
    p = estoque_full.projetar(lotes, 0, hoje, ate, 180)
    assert p["restantes"] == 60 and p["acima_limite"] == 30
    assert estoque_full.lotes_fifo([], 5) == [(None, 5)]


def test_bonus_do_ml_entra_na_receita(client, sessao, monkeypatch):
    class Falso:
        demo = False

        def pedidos(self, de, ate):
            return [{"id": 7, "status": "paid", "date_created": "2026-09-30T23:50:00.000-03:00",
                     "date_closed": "2026-10-01T00:10:00.000-03:00", "shipping": {}, "payments": [],
                     "order_items": [{"item": {"id": "MLB9", "title": "Garrafa", "seller_sku": "G"}, "quantity": 1,
                                      "unit_price": 700, "sale_fee": 70}]}]

        def bonus_do_pedido(self, pedido_id):
            return {"MLB9": 50.0}

        def reclamacoes(self, de, ate):
            return []

        def anunciante_ads(self):
            return None

    monkeypatch.setattr(financeiro, "obter_adaptador", lambda *a, **k: (Falso(), ""))
    client.put("/api/financeiro/config", headers=sessao, json={"regime": "simples", "aliquota_simples_pct": 0})
    assert client.post("/api/financeiro/sincronizar?mes=2026-09", headers=sessao).status_code == 200
    r = client.get("/api/financeiro/lucro?mes=2026-09", headers=sessao).json()
    [v] = r["vendas"]
    assert v["bonus_ml"] == 50 and v["lucro"] == 700 + 50 - 70
    assert r["totais"]["bonus_ml"] == 50


def test_admin_desliga_ferramenta_de_uma_funcao(client, equipe):
    admin, op, con = equipe["admin"], equipe["operador"], equipe["consultor"]
    d = client.get("/api/empresa/ferramentas", headers=admin).json()
    assert "pesquisar" in d["papeis"]["operador"]["liberadas"] and "pesquisar" not in d["papeis"]["consultor"]["possiveis"]
    assert client.get("/api/empresa/ferramentas", headers=op).status_code == 403
    r = client.put("/api/empresa/ferramentas", headers=admin,
                   json={"desligadas": {"operador": ["lucro", "inexistente"], "consultor": ["saude"], "admin": ["painel"]}})
    assert r.status_code == 200 and "lucro" not in r.json()["papeis"]["operador"]["liberadas"]
    assert "lucro" not in client.get("/api/me", headers=op).json()["ferramentas"]
    assert client.get("/api/financeiro/lucro?mes=2026-09", headers=_em(op, equipe["a"])).status_code == 403
    assert client.get("/api/saude", headers=con).status_code == 403
    assert client.get("/api/saude", headers=op).status_code == 200
    assert client.get("/api/financeiro/lucro?mes=2026-09", headers=_em(admin, equipe["a"])).status_code == 200
    assert len(client.get("/api/me", headers=admin).json()["ferramentas"]) == 18


def test_sem_modo_demonstracao_nada_e_inventado(client, sessao, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "MODO_DEMONSTRACAO", False)
    r = client.post("/api/pesquisas", headers=sessao, json={"termo": "garrafa", "plataformas": ["mercadolivre", "shopee"]})
    assert r.status_code == 200 and r.json()["resultados"] == []
    assert all("Conecte a conta" in a["mensagem"] for a in r.json()["avisos"])
    cliente = int(sessao["X-Cliente"])
    saude = client.post(f"/api/saude/{cliente}/atualizar", headers=sessao).json()
    assert saude["nivel"] == "sem_dados" and not saude["demo"]
    assert client.get("/api/financeiro/estoque-full", headers=sessao).status_code == 400
    assert client.post("/api/financeiro/sincronizar?mes=2026-09", headers=sessao).status_code == 400
    assert client.get("/api/perguntas/central", headers=sessao).json()["perguntas"] == []
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Garrafa Térmica Inox 1 Litro", "preco": 80,
                                                          "fotos": ["https://exemplo.com/f.jpg"]}).json()
    pubs = client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]}).json()["publicacoes"]
    assert not pubs[0]["sucesso"] and not pubs[0]["demo"]


def test_link_colado_e_tirar_da_lista(client, sessao):
    r = client.post("/api/mercadolivre/link", headers=sessao, json={"url": "https://produto.mercadolivre.com.br/MLB-1234567-garrafa-_JM"})
    assert r.status_code == 200 and r.json()["tipo"] == "produto"
    assert client.post("/api/mercadolivre/link", headers=sessao, json={"url": "https://google.com"}).status_code == 400
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Garrafa Térmica Inox 1 Litro", "preco": 80,
                                                          "fotos": ["https://exemplo.com/f.jpg"]}).json()
    client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]})
    [pub] = [p for p in client.get("/api/publicacoes", headers=sessao).json() if p["anuncio_id"] == a["id"]]
    assert client.post(f"/api/publicacoes/{pub['id']}/tirar-da-lista", headers=sessao).status_code == 200
    assert not [p for p in client.get("/api/publicacoes", headers=sessao).json() if p["anuncio_id"] == a["id"]]
    assert client.get(f"/api/anuncios/{a['id']}", headers=sessao).json()["status"] == "rascunho"


def test_pesquisa_traz_cada_anuncio_para_filtrar(client, sessao):
    r = client.post("/api/pesquisas", headers=sessao, json={"termo": "vonder", "plataformas": ["mercadolivre"], "modo": "anuncios"})
    res = r.json()["resultados"][0]["extra"]
    assert len(res["ofertas"]) == res["anuncios"] and sum(o["full"] for o in res["ofertas"]) == res["full"]
