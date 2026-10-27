"""Dúvidas por página (chat) e ferramentas liberadas por cliente."""


def test_duvida_na_pagina_com_leitura_por_pessoa(client, time):
    loja, cons, admin, op = time["loja"], time["cons"], time["admin"], time["op"]
    r = client.post("/api/conversas/mensagens", headers=loja, json={"pagina": "lucro", "texto": "De onde vem a comissão?"})
    assert r.status_code == 200, r.text
    conversa = r.json()["id"]
    for quem in (cons, admin, op):
        n = client.get(f"/api/conversas/nao-lidas?cliente_id={time['a']}", headers=quem).json()
        assert n["total"] == 1 and n["por_pagina"] == {"lucro": 1} and n["por_cliente"] == {str(time["a"]): 1}
    assert client.get("/api/conversas/nao-lidas", headers=loja).json()["total"] == 0
    assert client.get("/api/conversas/nao-lidas", headers=time["op_b"]).json()["total"] == 0
    aberta = client.get(f"/api/conversas/abrir?pagina=lucro&cliente_id={time['a']}", headers=cons).json()
    assert [m["texto"] for m in aberta["mensagens"]] == ["De onde vem a comissão?"]
    assert client.get("/api/conversas/nao-lidas", headers=cons).json()["total"] == 0
    assert client.get("/api/conversas/nao-lidas", headers=admin).json()["total"] == 1
    caixa = client.get("/api/conversas?filtro=aguardando", headers=admin).json()
    assert [c["id"] for c in caixa] == [conversa] and caixa[0]["pagina_nome"] == "Vendas e lucro"
    client.post("/api/conversas/mensagens", headers=cons, json={"cliente_id": time["a"], "pagina": "lucro",
                                                                 "texto": "É a tarifa de venda do Mercado Livre."})
    assert client.get("/api/conversas/nao-lidas", headers=loja).json()["por_pagina"] == {"lucro": 1}
    assert client.get("/api/conversas/nao-lidas", headers=admin).json()["total"] == 2
    assert client.get("/api/conversas?filtro=aguardando", headers=admin).json() == []
    assert client.get(f"/api/conversas/{conversa}", headers=time["loja_b"]).status_code == 404
    assert client.get(f"/api/conversas/{conversa}", headers=time["op_b"]).status_code == 404
    assert client.get(f"/api/conversas/abrir?pagina=lucro&cliente_id={time['a']}", headers=time["op_b"]).status_code == 404
    assert client.post("/api/conversas/mensagens", headers=time["loja_b"],
                       json={"cliente_id": time["a"], "pagina": "lucro", "texto": "oi"}).status_code == 404
    assert client.post(f"/api/conversas/{conversa}/resolver", headers=loja, json={"resolvida": True}).status_code == 403
    assert client.post(f"/api/conversas/{conversa}/resolver", headers=cons, json={"resolvida": True}).status_code == 200


def test_operador_sem_ferramenta_de_duvidas(client, time):
    client.put("/api/empresa/ferramentas", headers=time["admin"], json={"desligadas": {"operador": ["duvidas"]}})
    client.post("/api/conversas/mensagens", headers=time["loja"], json={"pagina": "lucro", "texto": "Oi"})
    assert client.get("/api/conversas", headers=time["op"]).status_code == 403
    assert client.get("/api/visao-geral", headers=time["op"]).json()["totais"]["duvidas_nao_lidas"] == 0


def test_ferramentas_por_cliente(client, time):
    admin, loja = time["admin"], time["loja"]
    cli = client.get(f"/api/clientes/{time['a']}", headers=admin).json()
    assert "lucro" in [f["id"] for f in cli["ferramentas"]["possiveis"]]
    assert client.patch(f"/api/clientes/{time['a']}", headers=admin, json={"ferramentas_off": ["lucro", "inventada"]}).status_code == 200
    assert client.get(f"/api/clientes/{time['a']}", headers=admin).json()["ferramentas"]["desligadas"] == ["lucro"]
    me = client.get("/api/me", headers=loja).json()
    assert "lucro" not in me["ferramentas"] and "duvidas" in me["ferramentas"]
    assert client.get("/api/financeiro/lucro", headers=loja).status_code == 403
    assert "lucro" in client.get("/api/me", headers=time["loja_b"]).json()["ferramentas"]
    assert client.patch(f"/api/clientes/{time['a']}", headers=time["cons"], json={"ferramentas_off": []}).status_code == 403
