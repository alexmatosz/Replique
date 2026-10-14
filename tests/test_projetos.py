"""Projetos, tarefas, reuniões, dúvidas por página e visão geral nos quatro perfis."""

import pytest


def _login(client, email, senha="senha-forte-123"):
    r = client.post("/api/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture
def time(client, sessao, novo_email):
    """Admin, clientes A e B, consultor e operador de A, operador de B e o lojista de A e de B."""
    admin = {"Authorization": sessao["Authorization"]}
    a = int(sessao["X-Cliente"])
    b = client.post("/api/clientes", headers=admin, json={"nome": "Cliente B"}).json()["id"]
    pessoas = {}
    for chave, nome, papel, clientes in (("cons", "Carla Consultora", "consultor", [a]), ("op", "Olga Operadora", "operador", [a]),
                                         ("op_b", "Beto Operador", "operador", [b])):
        email = novo_email(chave)
        r = client.post("/api/empresa/usuarios", headers=admin, json={
            "nome": nome, "email": email, "senha": "senha-forte-123", "papel": papel, "clientes": clientes})
        assert r.status_code == 200, r.text
        pessoas[chave] = _login(client, email)
        pessoas[chave + "_id"] = r.json()["id"]
    for chave, cid in (("loja", a), ("loja_b", b)):
        email = novo_email(chave)
        r = client.post(f"/api/clientes/{cid}/logins", headers=admin, json={
            "nome": f"Lojista {chave}", "email": email, "senha": "senha-forte-123"})
        assert r.status_code == 200, r.text
        pessoas[chave] = _login(client, email)
    return {"admin": admin, "a": a, "b": b, **pessoas}


def _projeto(client, h, cliente_id, nome="Implantação"):
    r = client.post("/api/projetos", headers=h, json={"cliente_id": cliente_id, "nome": nome})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _tarefa(client, h, projeto_id, **extra):
    r = client.post("/api/tarefas", headers=h, json={"projeto_id": projeto_id, "titulo": extra.pop("titulo", "Cadastrar produtos"), **extra})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_consultor_planeja_e_operador_executa(client, time):
    pid = _projeto(client, time["cons"], time["a"])
    assert client.post("/api/projetos", headers=time["op"], json={"cliente_id": time["a"], "nome": "Outro projeto"}).status_code == 403
    tid = _tarefa(client, time["cons"], pid, responsavel_id=time["op_id"], prazo="2020-01-10")
    r = client.patch(f"/api/tarefas/{tid}", headers=time["op"], json={"status": "andamento"})
    assert r.status_code == 200, r.text
    assert client.patch(f"/api/tarefas/{tid}", headers=time["op"], json={"titulo": "Outro"}).status_code == 403
    assert client.post(f"/api/tarefas/{tid}/notas", headers=time["op"], json={"texto": "Fotos prontas"}).status_code == 200
    t = client.get(f"/api/tarefas/{tid}", headers=time["cons"]).json()
    assert t["status"] == "andamento" and t["responsavel"] == "Olga Operadora" and t["atrasada"]
    assert [n["texto"] for n in t["notas"]] == ["Status: Pendente → Em andamento", "Fotos prontas"]
    propria = _tarefa(client, time["op"], pid, titulo="Revisar títulos")
    assert client.patch(f"/api/tarefas/{propria}", headers=time["op"], json={"titulo": "Revisar títulos e fotos"}).status_code == 200
    assert client.delete(f"/api/tarefas/{tid}", headers=time["op"]).status_code == 403


def test_responsavel_precisa_atender_o_cliente(client, time):
    pid = _projeto(client, time["admin"], time["a"])
    r = client.post("/api/tarefas", headers=time["admin"], json={"projeto_id": pid, "titulo": "Fotos", "responsavel_id": time["op_b_id"]})
    assert r.status_code == 400 and "não atende" in r.json()["detail"]


def test_ninguem_ve_tarefas_de_outro_cliente(client, time):
    pid_b = _projeto(client, time["admin"], time["b"], "Projeto B")
    tid_b = _tarefa(client, time["admin"], pid_b, titulo="Segredo do B")
    for quem in ("cons", "op", "loja"):
        assert client.get(f"/api/tarefas/{tid_b}", headers=time[quem]).status_code == 404
        assert client.patch(f"/api/tarefas/{tid_b}", headers=time[quem], json={"status": "concluida"}).status_code in (403, 404)
        assert client.get(f"/api/projetos?cliente_id={time['b']}", headers=time[quem]).status_code == 404 or quem == "loja"
        assert "Segredo do B" not in str(client.get("/api/tarefas", headers=time[quem]).json())
    assert client.get(f"/api/projetos?cliente_id={time['b']}", headers=time["loja"]).status_code == 404
    assert client.get(f"/api/tarefas?cliente_id={time['b']}", headers=time["loja"]).status_code == 404
    assert client.get(f"/api/acompanhamento?cliente_id={time['b']}", headers=time["op"]).status_code == 404
    assert "Segredo do B" in str(client.get("/api/tarefas", headers=time["op_b"]).json())


def test_lojista_ve_so_tarefas_liberadas_e_notas_publicas(client, time):
    pid = _projeto(client, time["cons"], time["a"])
    publica = _tarefa(client, time["cons"], pid, titulo="Enviar fotos", status="aguardando_cliente")
    interna = _tarefa(client, time["cons"], pid, titulo="Conferir margem interna", visivel_cliente=False)
    client.post(f"/api/tarefas/{publica}/notas", headers=time["op"], json={"texto": "Recado interno", "interna": True})
    client.post(f"/api/tarefas/{publica}/notas", headers=time["op"], json={"texto": "Aguardando as fotos do produto"})
    loja = time["loja"]
    titulos = [t["titulo"] for t in client.get("/api/tarefas", headers=loja).json()]
    assert titulos == ["Enviar fotos"]
    assert client.get(f"/api/tarefas/{interna}", headers=loja).status_code == 404
    notas = [n["texto"] for n in client.get(f"/api/tarefas/{publica}", headers=loja).json()["notas"]]
    assert notas == ["Aguardando as fotos do produto"]
    acomp = client.get("/api/acompanhamento", headers=loja).json()
    assert [t["titulo"] for t in acomp["depende_de_voce"]] == ["Enviar fotos"]
    assert acomp["totais"]["tarefas"] == 1
    hist = " ".join(a["descricao"] for a in acomp["historico"])
    assert "Enviar fotos" in hist and "margem interna" not in hist
    feed = " ".join(a["descricao"] for a in client.get("/api/atividades", headers=loja).json())
    assert "margem interna" not in feed
    assert client.post("/api/tarefas", headers=loja, json={"projeto_id": pid, "titulo": "Minha tarefa"}).status_code == 403
    assert client.patch(f"/api/tarefas/{publica}", headers=loja, json={"status": "concluida"}).status_code == 403


def test_reunioes_sao_da_equipe(client, time):
    r = client.post("/api/reunioes", headers=time["cons"], json={"cliente_id": time["a"], "data": "2026-10-01",
                                                                  "titulo": "Kickoff", "resumo": "Levantamento do catálogo"})
    assert r.status_code == 200, r.text
    assert [x["titulo"] for x in client.get(f"/api/reunioes?cliente_id={time['a']}", headers=time["op"]).json()] == ["Kickoff"]
    assert client.post("/api/reunioes", headers=time["op"], json={"cliente_id": time["a"], "data": "2026-10-01"}).status_code == 403
    assert client.get(f"/api/reunioes?cliente_id={time['a']}", headers=time["loja"]).status_code == 403
    assert client.get(f"/api/reunioes?cliente_id={time['a']}", headers=time["op_b"]).status_code == 404


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


def test_duvida_ligada_a_tarefa(client, time):
    pid = _projeto(client, time["cons"], time["a"])
    tid = _tarefa(client, time["cons"], pid, titulo="Enviar fotos")
    interna = _tarefa(client, time["cons"], pid, titulo="Interna", visivel_cliente=False)
    r = client.post("/api/conversas/mensagens", headers=time["loja"],
                    json={"pagina": "projeto", "ref_tipo": "tarefa", "ref_id": tid, "texto": "Quantas fotos?"})
    assert r.status_code == 200 and r.json()["titulo"] == "Enviar fotos"
    n = client.get(f"/api/conversas/nao-lidas?cliente_id={time['a']}", headers=time["cons"]).json()
    assert n["por_ref"] == {f"tarefa:{tid}": 1}
    assert client.post("/api/conversas/mensagens", headers=time["loja"],
                       json={"pagina": "projeto", "ref_tipo": "tarefa", "ref_id": interna, "texto": "?"}).status_code == 404
    client.post("/api/conversas/mensagens", headers=time["cons"], json={"cliente_id": time["a"], "pagina": "projeto",
                                                                        "ref_tipo": "tarefa", "ref_id": interna, "texto": "nota"})
    assert client.get("/api/conversas/nao-lidas", headers=time["loja"]).json()["total"] == 0
    pid_b = _projeto(client, time["admin"], time["b"])
    tid_b = _tarefa(client, time["admin"], pid_b)
    assert client.post("/api/conversas/mensagens", headers=time["cons"], json={
        "cliente_id": time["a"], "pagina": "projeto", "ref_tipo": "tarefa", "ref_id": tid_b, "texto": "x"}).status_code == 404
    assert client.post("/api/conversas/mensagens", headers=time["loja"], json={"pagina": "inexistente", "texto": "x"}).status_code == 400


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
    assert "lucro" not in me["ferramentas"] and "projeto" in me["ferramentas"]
    assert client.get("/api/financeiro/lucro", headers=loja).status_code == 403
    assert "lucro" in client.get("/api/me", headers=time["loja_b"]).json()["ferramentas"]
    assert client.patch(f"/api/clientes/{time['a']}", headers=time["cons"], json={"ferramentas_off": []}).status_code == 403


def test_visao_geral_por_perfil(client, time):
    pid = _projeto(client, time["cons"], time["a"])
    _tarefa(client, time["cons"], pid, responsavel_id=time["op_id"], prazo="2020-01-01")
    pid_b = _projeto(client, time["admin"], time["b"])
    _tarefa(client, time["admin"], pid_b, status="concluida")
    geral = client.get("/api/visao-geral", headers=time["admin"]).json()
    assert {c["nome"] for c in geral["clientes"]} == {"Cliente A", "Cliente B"}
    assert geral["totais"]["atrasadas"] == 1 and geral["totais"]["concluidas_30d"] == 1 and geral["totais"]["usuarios"] >= 4
    assert {p["nome"] for p in geral["equipe"]} >= {"Carla Consultora", "Olga Operadora", "Beto Operador"}
    cons = client.get("/api/visao-geral", headers=time["cons"]).json()
    assert [c["nome"] for c in cons["clientes"]] == ["Cliente A"] and "usuarios" not in cons["totais"]
    op = client.get("/api/visao-geral", headers=time["op"]).json()
    assert [t["titulo"] for t in op["minhas"]] == ["Cadastrar produtos"]
    assert client.get("/api/visao-geral", headers=time["loja"]).status_code == 403
