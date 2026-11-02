"""Fluxo completo pela API web, em modo demonstração (sem credenciais)."""

import io

from PIL import Image


def test_cadastro_login_e_me(client, sessao):
    me = client.get("/api/me", headers=sessao).json()
    assert me["papel"] == "admin"
    assert me["ia_disponivel"] is False
    r = client.post("/api/auth/login", json={"email": me["email"], "senha": "senha-forte-123"})
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"email": me["email"], "senha": "errada"}).status_code == 401


def test_rotas_exigem_login(client):
    assert client.get("/api/anuncios").status_code == 401
    assert client.get("/api/anuncios", headers={"Authorization": "Bearer lixo"}).status_code == 401


def test_email_duplicado(client, sessao):
    email = client.get("/api/me", headers=sessao).json()["email"]
    r = client.post("/api/auth/cadastro", json={"empresa": "XX", "nome": "YY", "email": email, "senha": "12345678"})
    assert r.status_code == 400


def test_pesquisa_demo_ordena_e_avisa(client, sessao):
    r = client.post("/api/pesquisas", headers=sessao,
                    json={"termo": "garrafa térmica", "plataformas": ["mercadolivre", "shopee", "amazon"], "limite": 20})
    assert r.status_code == 200, r.text
    p = r.json()
    assert {a["plataforma"] for a in p["avisos"]} == {"mercadolivre", "shopee", "amazon"}
    assert all(a["mensagem"].startswith("Modo demonstração") for a in p["avisos"])
    pops = [x["popularidade"] for x in p["resultados"]]
    assert pops == sorted(pops, reverse=True)
    assert [x["posicao_geral"] for x in p["resultados"]] == list(range(1, len(pops) + 1))
    assert set(p["resumo"]) == {"mercadolivre", "shopee", "amazon"}
    p2 = client.post("/api/pesquisas", headers=sessao,
                     json={"termo": "garrafa térmica", "plataformas": ["mercadolivre", "shopee", "amazon"]}).json()
    assert [x["id_externo"] for x in p2["resultados"]] == [x["id_externo"] for x in p["resultados"]]


def test_pesquisa_valida_entrada(client, sessao):
    assert client.post("/api/pesquisas", headers=sessao, json={"termo": "x", "plataformas": ["shopee"]}).status_code == 400
    assert client.post("/api/pesquisas", headers=sessao, json={"termo": "fone", "plataformas": []}).status_code == 400
    assert client.post("/api/pesquisas", headers=sessao, json={"termo": "fone", "plataformas": ["ebay"]}).status_code == 400


def test_copiar_editar_checar_publicar(client, sessao):
    p = client.post("/api/pesquisas", headers=sessao, json={"termo": "fone bluetooth", "plataformas": ["shopee"]}).json()
    alvo = p["resultados"][0]
    a = client.post("/api/anuncios/copiar", headers=sessao, json={
        "plataforma": alvo["plataforma"], "id_externo": alvo["id_externo"], "tipo": alvo["tipo"], "pesquisa_id": p["id"]}).json()
    assert a["status"] == "rascunho" and a["titulo"] and a["fotos"]
    assert a["origem"]["plataforma"] == "shopee" and a["origem"]["popularidade"] == alvo["popularidade"]

    chk = client.post(f"/api/anuncios/{a['id']}/checar", headers=sessao, json={"plataformas": ["shopee", "mercadolivre"]}).json()
    assert not chk["shopee"]["pode_publicar"] and chk["mercadolivre"]["pode_publicar"]
    assert any("fotos próprias" in x for x in chk["mercadolivre"]["avisos"])
    assert any("idêntico" in x for x in chk["mercadolivre"]["avisos"])

    r = client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={
        "titulo": "Fone Bluetooth Sem Fio com Case", "peso_kg": 0.25, "preco": 99.9,
        "por_plataforma": {"mercadolivre": {"category_id": "MLB1234"}}})
    assert r.status_code == 200
    a2 = client.patch(f"/api/anuncios/{a['id']}", headers=sessao,
                      json={"por_plataforma": {"mercadolivre": {"listing_type_id": "gold_pro"}}}).json()
    assert a2["por_plataforma"]["mercadolivre"] == {"category_id": "MLB1234", "listing_type_id": "gold_pro"}

    pub = client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao,
                      json={"plataformas": ["shopee", "mercadolivre", "amazon"]}).json()
    assert pub["status"] == "simulado"
    assert all(x["sucesso"] and x["demo"] for x in pub["publicacoes"])
    assert "SIMULADA" in pub["publicacoes"][0]["mensagem"]
    assert len(client.get("/api/publicacoes", headers=sessao).json()) == 3


def test_edicao_invalida(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Teste"}).json()
    assert client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"preco": -1}).status_code == 400
    assert client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"condicao": "seminovo"}).status_code == 400
    assert client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"empresa_id": 99}).status_code == 400


def test_publicar_bloqueado_nao_envia(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Sem preço"}).json()
    pub = client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]}).json()
    assert pub["status"] == "erro"
    assert pub["publicacoes"][0]["mensagem"].startswith("Não publicado")


def test_isolamento_entre_empresas(client, sessao, empresa_nova):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Segredo"}).json()
    h2 = empresa_nova("Concorrente")
    assert client.get(f"/api/anuncios/{a['id']}", headers=h2).status_code == 404
    assert client.get("/api/anuncios", headers={**h2, "X-Cliente": sessao["X-Cliente"]}).status_code == 403
    assert client.patch(f"/api/anuncios/{a['id']}", headers=h2, json={"titulo": "x"}).status_code == 404
    assert client.post(f"/api/anuncios/{a['id']}/publicar", headers=h2, json={"plataformas": ["shopee"]}).status_code == 404
    assert all(x["titulo"] != "Segredo" for x in client.get("/api/anuncios", headers=h2).json())


def test_upload_foto(client, sessao):
    buf = io.BytesIO()
    Image.new("RGB", (300, 300), "red").save(buf, "PNG")
    r = client.post("/api/uploads", headers=sessao, files={"arquivo": ("p.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200
    assert r.json()["url"].startswith("/uploads/") and "500px" in r.json()["aviso"]
    assert client.get(r.json()["url"]).status_code == 200
    r = client.post("/api/uploads", headers=sessao, files={"arquivo": ("x.txt", b"oi", "text/plain")})
    assert r.status_code == 400


def test_ia_sem_chave_usa_regras(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={
        "titulo": "FONE BLUETOOTH NOVO FRETE GRÁTIS Promoção", "marca": "JBL", "atributos": {"Cor": "Preto"}}).json()
    s = client.post(f"/api/anuncios/{a['id']}/ia", headers=sessao, json={"plataformas": ["mercadolivre"]}).json()
    assert s["fonte"] == "regras"
    assert s["titulo"] == "Fone Bluetooth"
    assert "Cor: Preto" in s["descricao"]


def test_contas_listam_modo_demo(client, sessao):
    contas = client.get("/api/contas", headers=sessao).json()
    assert {c["plataforma"] for c in contas} == {"mercadolivre", "shopee", "amazon"}
    assert not any(c["pesquisa_real"] for c in contas)
    client.post("/api/contas/shopee/afiliados", headers=sessao, json={"app_id": "123", "secret": "abc"})
    shopee = next(c for c in client.get("/api/contas", headers=sessao).json() if c["plataforma"] == "shopee")
    assert shopee["pesquisa_real"] and not shopee["publicacao_real"]


def test_state_oauth_nao_vale_como_sessao(client):
    from backend.security import criar_state_oauth
    assert client.get("/api/me", headers={"Authorization": "Bearer " + criar_state_oauth(1)}).status_code == 401


def test_interface_carrega(client):
    assert "Replique" in client.get("/").text
    assert client.get("/static/js/base.js").status_code == 200
    assert client.get("/demo-img.svg?t=<script>&c=zzz").text.count("<script>") == 0


def test_foto_volta_do_banco_quando_a_pasta_temporaria_some(client, sessao, monkeypatch):
    from backend import config

    monkeypatch.setattr(config, "FOTOS_NO_BANCO", True)
    buf = io.BytesIO()
    Image.new("RGB", (600, 600), "white").save(buf, "PNG")
    url = client.post("/api/uploads", headers=sessao, files={"arquivo": ("p.png", buf.getvalue(), "image/png")}).json()["url"]
    _, _, empresa, nome = url.split("/")
    (config.UPLOADS_DIR / empresa / nome).unlink()
    r = client.get(url)
    assert r.status_code == 200 and r.content == buf.getvalue()
    assert client.get(f"/uploads/{empresa}/{'0' * 20}.png").status_code == 404
