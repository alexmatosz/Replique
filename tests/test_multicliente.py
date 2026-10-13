"""Multicliente: quem vê o quê, quem pode fazer o quê e o registro de quem fez."""

import pytest


def _login(client, email, senha="senha-forte-123"):
    r = client.post("/api/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture
def agencia(client, sessao, novo_email):
    """Admin com dois clientes (A e B), um operador que atende só A e o login do lojista de A."""
    admin = {"Authorization": sessao["Authorization"]}
    a = int(sessao["X-Cliente"])
    b = client.post("/api/clientes", headers=admin, json={"nome": "Cliente B"}).json()["id"]
    email_op = novo_email("op")
    r = client.post("/api/empresa/usuarios", headers=admin, json={
        "nome": "Olga Operadora", "email": email_op, "senha": "senha-forte-123", "papel": "operador", "clientes": [a]})
    assert r.status_code == 200, r.text
    email_cli = novo_email("loja")
    r = client.post(f"/api/clientes/{a}/logins", headers=admin, json={
        "nome": "Lojista A", "email": email_cli, "senha": "senha-forte-123"})
    assert r.status_code == 200, r.text
    return {"admin": admin, "a": a, "b": b, "op": _login(client, email_op),
            "loja": _login(client, email_cli)}


def _em(h, cliente_id):
    return {**h, "X-Cliente": str(cliente_id)}


def test_sem_cliente_escolhido_pede_para_escolher(client, agencia):
    r = client.get("/api/anuncios", headers=agencia["admin"])
    assert r.status_code == 409 and "Escolha um cliente" in r.json()["detail"]


def test_operador_so_ve_os_clientes_dele(client, agencia):
    op = agencia["op"]
    me = client.get("/api/me", headers=op).json()
    assert [c["id"] for c in me["clientes"]] == [agencia["a"]]
    assert client.get("/api/anuncios", headers=_em(op, agencia["b"])).status_code == 403
    rascunho_b = client.post("/api/anuncios", headers=_em(agencia["admin"], agencia["b"]), json={"titulo": "Do B"}).json()
    assert client.get(f"/api/anuncios/{rascunho_b['id']}", headers=op).status_code == 404
    assert client.patch(f"/api/anuncios/{rascunho_b['id']}", headers=op, json={"titulo": "x"}).status_code == 404
    meu = client.post("/api/anuncios", headers=_em(op, agencia["a"]), json={"titulo": "Do A"})
    assert meu.status_code == 200 and meu.json()["criado_por"] == "Olga Operadora"
    assert client.post("/api/clientes", headers=op, json={"nome": "X"}).status_code == 403
    assert client.post("/api/contas/amazon/conectar", headers=_em(op, agencia["a"]),
                       json={"refresh_token": "Atzr|x", "seller_id": "S1"}).status_code == 403


def test_lojista_acompanha_sem_editar(client, agencia):
    op, loja = agencia["op"], agencia["loja"]
    a = client.post("/api/anuncios", headers=_em(op, agencia["a"]), json={"titulo": "Garrafa Inox", "preco": 50}).json()
    client.post("/api/anuncios", headers=_em(agencia["admin"], agencia["b"]), json={"titulo": "Segredo do B"})
    lista = client.get("/api/anuncios", headers=_em(loja, agencia["b"])).json()
    assert [x["titulo"] for x in lista] == ["Garrafa Inox"] and lista[0]["criado_por"] == "Olga Operadora"
    assert client.get(f"/api/anuncios/{a['id']}", headers=loja).status_code == 200
    assert client.post("/api/anuncios", headers=loja, json={"titulo": "x"}).status_code == 403
    assert client.patch(f"/api/anuncios/{a['id']}", headers=loja, json={"titulo": "x"}).status_code == 403
    assert client.post("/api/pesquisas", headers=loja, json={"termo": "fone", "plataformas": ["shopee"]}).status_code == 403
    assert client.post(f"/api/anuncios/{a['id']}/publicar", headers=loja, json={"plataformas": ["shopee"]}).status_code == 403
    r = client.post("/api/contas/amazon/conectar", headers=loja, json={"refresh_token": "Atzr|x", "seller_id": "SELLER-A"})
    assert r.status_code == 200
    atividades = client.get("/api/atividades", headers=loja).json()
    assert {x["acao"] for x in atividades} <= {"copia", "criacao", "edicao", "publicacao", "exclusao", "conta"}
    assert all(x["cliente_id"] == agencia["a"] for x in atividades)
    assert any(x["ator"] == "Olga Operadora" and x["acao"] == "criacao" for x in atividades)


def test_publicacao_usa_o_cliente_dono_do_rascunho(client, agencia):
    admin = agencia["admin"]
    a = client.post("/api/anuncios", headers=_em(admin, agencia["a"]), json={
        "titulo": "Fone Bluetooth", "preco": 99, "fotos": ["https://f/1.jpg"]}).json()
    pub = client.post(f"/api/anuncios/{a['id']}/publicar", headers=_em(admin, agencia["b"]),
                      json={"plataformas": ["mercadolivre"]}).json()
    assert pub["publicacoes"][0]["sucesso"] and pub["publicacoes"][0]["operador"] == "Fulano"
    assert len(client.get("/api/publicacoes", headers=_em(admin, agencia["a"])).json()) == 1
    assert client.get("/api/publicacoes", headers=_em(admin, agencia["b"])).json() == []


def test_mesma_conta_nao_pode_ir_para_dois_clientes(client, agencia):
    admin = agencia["admin"]
    corpo = {"refresh_token": "Atzr|x", "seller_id": "SELLER-UNICO"}
    assert client.post("/api/contas/amazon/conectar", headers=_em(admin, agencia["a"]), json=corpo).status_code == 200
    r = client.post("/api/contas/amazon/conectar", headers=_em(admin, agencia["b"]), json=corpo)
    assert r.status_code == 409 and "Cliente A" in r.json()["detail"]


def test_autorizacao_ml_de_outro_cliente_e_recusada(client, agencia):
    from app.security import criar_state_oauth
    me = client.get("/api/me", headers=agencia["admin"]).json()
    state_de_a = criar_state_oauth(me["empresa"]["id"], agencia["a"])
    colado = f"https://oauth.pstmn.io/v1/callback?code=TG-123&state={state_de_a}"
    r = client.post("/api/contas/mercadolivre/conectar", headers=_em(agencia["admin"], agencia["b"]), json={"texto": colado})
    assert r.status_code == 409 and "OUTRO cliente" in r.json()["detail"]


def test_afiliados_shopee_vale_para_todos_os_clientes(client, agencia):
    admin = agencia["admin"]
    assert client.post("/api/contas/shopee/afiliados", headers=admin, json={"app_id": "1", "secret": "s"}).status_code == 200
    for cid in (agencia["a"], agencia["b"]):
        shopee = next(c for c in client.get("/api/contas", headers=_em(admin, cid)).json() if c["plataforma"] == "shopee")
        assert shopee["pesquisa_real"] and shopee["shopee_afiliados_empresa"]
    assert client.post("/api/contas/shopee/afiliados", headers=agencia["op"],
                       json={"app_id": "1", "secret": "s"}).status_code == 403


def test_painel_conta_por_cliente_e_por_operador(client, agencia):
    op, admin = agencia["op"], agencia["admin"]
    for titulo in ("Um", "Dois"):
        a = client.post("/api/anuncios", headers=_em(op, agencia["a"]), json={
            "titulo": f"Produto {titulo}", "preco": 10, "fotos": ["https://f/1.jpg"]}).json()
        client.post(f"/api/anuncios/{a['id']}/publicar", headers=op, json={"plataformas": ["mercadolivre", "shopee"]})
    client.post("/api/anuncios", headers=_em(admin, agencia["b"]), json={"titulo": "Rascunho do admin"})

    p = client.get("/api/painel?dias=30", headers=admin).json()
    linha_a = next(c for c in p["por_cliente"] if c["id"] == agencia["a"])
    assert linha_a["rascunhos"] == 2 and linha_a["simulados"] == 2 and linha_a["falhas"] == 2
    olga = next(u for u in p["por_usuario"] if u["nome"] == "Olga Operadora")
    assert olga["rascunhos"] == 2 and olga["simulados"] == 2
    assert p["totais"]["rascunhos"] == 3 and p["totais"]["clientes"] == 2 and len(p["por_dia"]) == 30

    assert [c["id"] for c in client.get("/api/painel", headers=op).json()["por_cliente"]] == [agencia["a"]]
    assert [c["id"] for c in client.get("/api/painel", headers=agencia["loja"]).json()["por_cliente"]] == [agencia["a"]]
    assert client.get(f"/api/painel?cliente_id={agencia['b']}", headers=op).status_code == 404
    so_olga = client.get(f"/api/painel?usuario_id={olga['id']}", headers=admin).json()
    assert so_olga["totais"]["rascunhos"] == 2


def test_excluir_rascunho_mantem_historico(client, agencia):
    admin = _em(agencia["admin"], agencia["a"])
    a = client.post("/api/anuncios", headers=admin, json={"titulo": "Vai sumir", "preco": 5,
                                                         "fotos": ["https://f/1.jpg"]}).json()
    client.post(f"/api/anuncios/{a['id']}/publicar", headers=admin, json={"plataformas": ["mercadolivre"]})
    assert client.delete(f"/api/anuncios/{a['id']}", headers=admin).status_code == 200
    assert client.get(f"/api/anuncios/{a['id']}", headers=admin).status_code == 404
    assert all(x["id"] != a["id"] for x in client.get("/api/anuncios", headers=admin).json())
    assert client.get("/api/painel", headers=agencia["admin"]).json()["totais"]["simulados"] == 1
    acoes = [x["acao"] for x in client.get(f"/api/atividades?cliente_id={agencia['a']}", headers=agencia["admin"]).json()]
    assert "exclusao" in acoes and "publicacao" in acoes


def test_desativar_operador_e_cliente_bloqueia_acesso(client, agencia):
    admin = agencia["admin"]
    usuarios = client.get("/api/empresa/usuarios", headers=admin).json()
    olga = next(u for u in usuarios if u["nome"] == "Olga Operadora")
    assert olga["clientes"] == [agencia["a"]]
    assert client.patch(f"/api/empresa/usuarios/{olga['id']}", headers=admin, json={"ativo": False}).status_code == 200
    assert client.get("/api/me", headers=agencia["op"]).status_code == 401
    assert client.patch(f"/api/clientes/{agencia['a']}", headers=admin, json={"ativo": False}).status_code == 200
    assert client.get("/api/me", headers=agencia["loja"]).status_code == 401
    eu = next(u for u in usuarios if u["papel"] == "admin")
    assert client.patch(f"/api/empresa/usuarios/{eu['id']}", headers=admin, json={"ativo": False}).status_code == 400
    assert client.patch(f"/api/empresa/usuarios/{eu['id']}", headers=admin, json={"papel": "operador"}).status_code == 400


def test_atribuir_operadores_pelo_cliente(client, agencia):
    admin = agencia["admin"]
    olga = next(u for u in client.get("/api/empresa/usuarios", headers=admin).json() if u["papel"] == "operador")
    assert client.put(f"/api/clientes/{agencia['b']}/operadores", headers=admin, json={"ids": [olga["id"]]}).status_code == 200
    ids = {c["id"] for c in client.get("/api/me", headers=agencia["op"]).json()["clientes"]}
    assert ids == {agencia["a"], agencia["b"]}
    lista = {c["id"]: c for c in client.get("/api/clientes", headers=admin).json()}
    assert lista[agencia["b"]]["operadores"] == ["Olga Operadora"]
    eu = next(u for u in client.get("/api/empresa/usuarios", headers=admin).json() if u["papel"] == "admin")
    assert client.put(f"/api/clientes/{agencia['b']}/operadores", headers=admin, json={"ids": [eu["id"]]}).status_code == 400


def test_migracao_leva_dados_antigos_para_cliente_principal():
    """Banco de antes dos clientes: tudo vai para um cliente com o nome da empresa."""
    from app.db import SessionLocal, _migrar_para_multicliente
    from app.models import Anuncio, Cliente, ContaMarketplace, Empresa
    with SessionLocal() as db:
        e = Empresa(nome="Empresa Antiga")
        db.add(e)
        db.flush()
        db.add_all([Anuncio(empresa_id=e.id, titulo="velho"), ContaMarketplace(empresa_id=e.id, plataforma="mercadolivre"),
                    ContaMarketplace(empresa_id=e.id, plataforma="shopee_afiliados")])
        db.commit()
        eid = e.id
    _migrar_para_multicliente()
    _migrar_para_multicliente()
    with SessionLocal() as db:
        clientes = db.query(Cliente).filter_by(empresa_id=eid).all()
        assert [c.nome for c in clientes] == ["Empresa Antiga"]
        assert db.query(Anuncio).filter_by(empresa_id=eid).one().cliente_id == clientes[0].id
        contas = {c.plataforma: c.cliente_id for c in db.query(ContaMarketplace).filter_by(empresa_id=eid)}
        assert contas == {"mercadolivre": clientes[0].id, "shopee_afiliados": None}


def test_lojista_se_cadastra_pelo_link_e_aparece_para_o_admin(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    convite = client.get("/api/empresa/convite", headers=admin).json()
    assert convite["url"].endswith("/#/convite/" + convite["token"])
    assert client.get("/api/empresa/convite", headers=admin).json()["token"] == convite["token"]
    empresa = client.get("/api/me", headers=admin).json()["empresa"]["nome"]
    assert client.get(f"/api/convite/{convite['token']}").json() == {"empresa": empresa}

    email = novo_email("lojista")
    r = client.post(f"/api/convite/{convite['token']}", json={
        "loja": "Loja do Link", "nome": "Maria", "email": email, "senha": "senha-forte-123"})
    assert r.status_code == 200, r.text
    loja = {"Authorization": "Bearer " + r.json()["token"]}
    me = client.get("/api/me", headers=loja).json()
    assert me["papel"] == "cliente" and [c["nome"] for c in me["clientes"]] == ["Loja do Link"]
    novo = next(c for c in client.get("/api/clientes", headers=admin).json() if c["nome"] == "Loja do Link")
    assert novo["origem"] == "convite" and novo["operadores"] == []
    linha = next(c for c in client.get("/api/painel", headers=admin).json()["por_cliente"] if c["id"] == novo["id"])
    assert linha["com_operador"] is False and linha["origem"] == "convite"
    assert any("pelo link de cadastro" in a["descricao"] for a in client.get("/api/atividades", headers=admin).json())
    assert client.post("/api/contas/amazon/conectar", headers=loja,
                       json={"refresh_token": "Atzr|x", "seller_id": "LINK-1"}).status_code == 200

    novo_link = client.post("/api/empresa/convite", headers=admin).json()["token"]
    assert novo_link != convite["token"]
    assert client.get(f"/api/convite/{convite['token']}").status_code == 404
    assert client.post(f"/api/convite/{convite['token']}", json={
        "loja": "Loja X", "nome": "Fulana", "email": novo_email(), "senha": "senha-forte-123"}).status_code == 404
    assert client.post(f"/api/convite/{novo_link}", json={
        "loja": "Outra", "nome": "Maria", "email": email, "senha": "senha-forte-123"}).status_code == 400


def test_link_de_cadastro_so_para_admin(client, agencia):
    assert client.get("/api/empresa/convite", headers=agencia["op"]).status_code == 403
    assert client.get("/api/empresa/convite", headers=agencia["loja"]).status_code == 403


def _shopee_falsa(monkeypatch, nome="Loja da Ana"):
    from app import config
    from app.marketplaces import shopee
    monkeypatch.setattr(config, "SHOPEE_PARTNER_ID", "1000")
    monkeypatch.setattr(config, "SHOPEE_PARTNER_KEY", "chave")
    monkeypatch.setattr(shopee, "trocar_code_por_token", lambda http, code, shop_id: {
        "access_token": "at", "refresh_token": "rt", "expire_in": 14400, "obtido_em": 0, "shop_id": shop_id})
    monkeypatch.setattr(shopee, "nome_da_loja", lambda http, tok, shop_id: nome)


def test_autorizacao_shopee_leva_o_cliente_no_redirect(client, agencia, monkeypatch):
    from urllib.parse import parse_qs, urlparse
    from app.security import ler_state_oauth
    _shopee_falsa(monkeypatch)
    r = client.get("/api/contas/shopee/autorizar", headers=_em(agencia["admin"], agencia["a"]))
    assert r.status_code == 200, r.text
    redirect = parse_qs(urlparse(r.json()["url"]).query)["redirect"][0]
    assert redirect.startswith(r.json()["redirect_uri"])
    state = parse_qs(urlparse(redirect).query)["state"][0]
    assert ler_state_oauth(state)["c"] == agencia["a"]


def test_callback_shopee_conecta_a_loja_no_cliente_certo(client, agencia, monkeypatch):
    from app.security import criar_state_oauth
    _shopee_falsa(monkeypatch)
    me = client.get("/api/me", headers=agencia["admin"]).json()
    state = criar_state_oauth(me["empresa"]["id"], agencia["a"])
    r = client.get(f"/api/contas/shopee/callback?code=c1&shop_id=777&state={state}")
    assert r.status_code == 200 and "Loja da Ana" in r.text
    contas = {c["plataforma"]: c for c in client.get("/api/contas", headers=_em(agencia["admin"], agencia["a"])).json()}
    assert contas["shopee"]["conectada"] and contas["shopee"]["apelido"] == "Loja da Ana"
    assert contas["shopee"]["id_externo"] == "777" and contas["shopee"]["publicacao_real"]
    assert not next(c for c in client.get("/api/contas", headers=_em(agencia["admin"], agencia["b"])).json()
                    if c["plataforma"] == "shopee")["conectada"]

    state_b = criar_state_oauth(me["empresa"]["id"], agencia["b"])
    r = client.get(f"/api/contas/shopee/callback?code=c2&shop_id=777&state={state_b}")
    assert r.status_code == 400 and "Cliente A" in r.text
    assert client.get("/api/contas/shopee/callback?code=c3&shop_id=777&state=falso").status_code == 400


def test_url_colada_da_shopee_de_outro_cliente_e_recusada(client, agencia, monkeypatch):
    from app.security import criar_state_oauth
    _shopee_falsa(monkeypatch)
    me = client.get("/api/me", headers=agencia["admin"]).json()
    state_de_a = criar_state_oauth(me["empresa"]["id"], agencia["a"])
    colado = f"https://oauth.pstmn.io/v1/callback?state={state_de_a}&code=c1&shop_id=888"
    r = client.post("/api/contas/shopee/conectar", headers=_em(agencia["admin"], agencia["b"]), json={"texto": colado})
    assert r.status_code == 409 and "OUTRO cliente" in r.json()["detail"]
    r = client.post("/api/contas/shopee/conectar", headers=_em(agencia["admin"], agencia["b"]),
                    json={"texto": "https://oauth.pstmn.io/v1/callback?code=c1&shop_id=888"})
    assert r.status_code == 400
    r = client.post("/api/contas/shopee/conectar", headers=_em(agencia["admin"], agencia["a"]), json={"texto": colado})
    assert r.status_code == 200 and r.json()["apelido"] == "Loja da Ana"
