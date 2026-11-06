"""Acompanhamento por cliente e o módulo Gestão liberado por cliente."""


def test_acompanhamento_mostra_so_o_que_cada_um_pode_ver(client, time):
    op = client.get("/api/acompanhamento/geral", headers=time["op"]).json()
    assert [c["nome"] for c in op["clientes"]] == ["Cliente A"] and "perguntas" in op["clientes"][0]
    loja = client.get("/api/acompanhamento/geral", headers=time["loja"]).json()
    assert [c["nome"] for c in loja["clientes"]] == ["Cliente A"] and loja["equipe"] is False
    assert "perguntas" not in loja["clientes"][0] and "pedidos_abertos" not in loja["clientes"][0]
    admin = client.get("/api/acompanhamento/geral", headers=time["admin"]).json()
    assert {c["nome"] for c in admin["clientes"]} == {"Cliente A", "Cliente B"}


def test_vendas_e_lucro_desligado_esconde_e_bloqueia(client, time):
    admin, a = time["admin"], time["a"]
    h_op = {**time["op"], "X-Cliente": str(a)}
    assert client.get("/api/financeiro/lucro?mes=2026-10", headers=h_op).status_code == 200
    assert client.patch(f"/api/clientes/{a}", headers=time["cons"], json={"vendas_lucro": False}).status_code == 403
    assert client.patch(f"/api/clientes/{a}", headers=admin, json={"vendas_lucro": False}).status_code == 200
    for rota in ("/api/financeiro/lucro?mes=2026-10", "/api/financeiro/dre?mes=2026-10", "/api/financeiro/produtos",
                 "/api/financeiro/despesas?mes=2026-10"):
        r = client.get(rota, headers=h_op)
        assert r.status_code == 403 and "Gestão" in r.json()["detail"], rota
    assert client.get("/api/financeiro/lucro?mes=2026-10", headers=time["loja"]).status_code == 403
    me = client.get("/api/me", headers=time["loja"]).json()
    assert me["vendas_lucro"] is False
    assert next(c for c in client.get("/api/me", headers=time["op"]).json()["clientes"] if c["id"] == a)["vendas_lucro"] is False
    carteira = client.get("/api/analise/carteira?mes=2026-10", headers=admin).json()
    assert a not in [c.get("id") or c.get("cliente_id") for c in carteira]
    meus = client.get("/api/meus-anuncios", headers=h_op).json()
    assert meus["vendas_lucro"] is False and meus["vendas_sincronizadas"] is False
    assert client.get("/api/financeiro/estoque-full", headers=h_op).status_code == 200
    client.patch(f"/api/clientes/{a}", headers=admin, json={"vendas_lucro": True})
    assert client.get("/api/financeiro/lucro?mes=2026-10", headers=h_op).status_code == 200
    acoes = [x["descricao"] for x in client.get(f"/api/atividades?cliente_id={a}", headers=admin).json()]
    assert any("Gestão" in x for x in acoes)


def test_cliente_novo_comeca_desligado_sem_variavel(client, time, monkeypatch):
    from backend import config
    monkeypatch.setattr(config, "VENDAS_LUCRO_PADRAO", False)
    novo = client.post("/api/clientes", headers=time["admin"], json={"nome": "Cliente C"}).json()["id"]
    assert client.get(f"/api/clientes/{novo}", headers=time["admin"]).json()["vendas_lucro"] is False
