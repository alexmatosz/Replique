"""Convites da equipe por e-mail, entrar com Google e ações nos anúncios publicados."""

from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from backend import config
from backend.marketplaces.base import ErroMarketplace


def _convidar(client, sessao, email, papel="operador", **extra):
    admin = {"Authorization": sessao["Authorization"]}
    corpo = {"nome": "Nova Pessoa", "email": email, "papel": papel, "clientes": [int(sessao["X-Cliente"])], **extra}
    r = client.post("/api/empresa/convites", headers=admin, json=corpo)
    assert r.status_code == 200, r.text
    return r.json()


def _token(url):
    return url.rsplit("/", 1)[-1]


def test_convite_por_email_cria_acesso_com_senha(client, sessao, novo_email):
    email = novo_email("colab")
    c = _convidar(client, sessao, email)
    assert not c["email_enviado"] and "SMTP" in c["motivo"]
    token = _token(c["url"])
    info = client.get(f"/api/colaborador/{token}").json()
    assert info["email"] == email and info["papel"] == "operador" and info["google"] is False
    assert client.post(f"/api/colaborador/{token}", json={"nome": "Nova", "senha": "12345678"}).status_code == 400
    r = client.post(f"/api/colaborador/{token}", json={"nome": "Nova Pessoa", "senha": "senha-forte-456"})
    assert r.status_code == 200
    me = client.get("/api/me", headers={"Authorization": "Bearer " + r.json()["token"]}).json()
    assert me["papel"] == "operador" and [x["id"] for x in me["clientes"]] == [int(sessao["X-Cliente"])]
    assert client.get(f"/api/colaborador/{token}").status_code == 404
    assert client.post(f"/api/colaborador/{token}", json={"nome": "Outra", "senha": "senha-forte-456"}).status_code == 404


def test_convite_regras(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    me = client.get("/api/me", headers=admin).json()
    assert client.post("/api/empresa/convites", headers=admin,
                       json={"nome": "Eu", "email": me["email"], "papel": "operador"}).status_code == 400
    assert client.post("/api/empresa/convites", headers=admin,
                       json={"nome": "Loja", "email": novo_email(), "papel": "cliente"}).status_code == 400
    email = novo_email("dup")
    primeiro = _convidar(client, sessao, email)
    segundo = _convidar(client, sessao, email)
    assert client.get(f"/api/colaborador/{_token(primeiro['url'])}").status_code == 404
    assert client.get(f"/api/colaborador/{_token(segundo['url'])}").status_code == 200
    assert [c["email"] for c in client.get("/api/empresa/convites", headers=admin).json()].count(email) == 1
    assert client.delete(f"/api/empresa/convites/{segundo['id']}", headers=admin).status_code == 200
    assert client.get(f"/api/colaborador/{_token(segundo['url'])}").status_code == 404


def test_convite_expirado(client, sessao, novo_email):
    from backend.banco.db import SessionLocal
    from backend.banco.models import ConviteColaborador
    c = _convidar(client, sessao, novo_email("exp"))
    with SessionLocal() as db:
        db.get(ConviteColaborador, c["id"]).expira_em = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert client.get(f"/api/colaborador/{_token(c['url'])}").status_code == 410


def test_so_admin_convida(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    email = novo_email("op")
    client.post("/api/empresa/usuarios", headers=admin, json={"nome": "Op", "email": email, "senha": "senha-forte-123",
                                                              "papel": "operador", "clientes": []})
    op = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": email, "senha": "senha-forte-123"}).json()["token"]}
    assert client.post("/api/empresa/convites", headers=op, json={"nome": "X", "email": novo_email()}).status_code == 403


def test_email_sem_smtp_nao_envia():
    from backend.services import email
    assert email.enviar("a@b.com", "x", "y") == (False, "envio de e-mail não configurado no servidor (SMTP_HOST no .env)")


@pytest.fixture
def google(monkeypatch):
    """Google configurado e com a resposta simulada (quem entrou)."""
    from backend.services import google_login
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "cliente-teste.apps.googleusercontent.com")
    monkeypatch.setattr(config, "GOOGLE_CLIENT_SECRET", "segredo-teste")
    quem = {}
    monkeypatch.setattr(google_login, "identidade", lambda http, code, nonce: dict(quem))
    return quem


def _ir_e_voltar(convite=""):
    """Faz o caminho completo: iniciar (cookie + state) → callback. Devolve o destino."""
    from backend.main import app
    navegador = TestClient(app)
    r = navegador.get("/api/auth/google/iniciar" + (f"?convite={convite}" if convite else ""), follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("https://accounts.google.com/")
    state = parse_qs(urlparse(r.headers["location"]).query)["state"][0]
    volta = navegador.get(f"/api/auth/google/callback?code=abc&state={state}", follow_redirects=False)
    return navegador, volta.headers["location"]


def test_google_desligado_por_padrao(client):
    assert client.get("/api/auth/opcoes").json() == {"google": False}
    r = client.get("/api/auth/google/iniciar", follow_redirects=False)
    assert r.headers["location"] == "/#/google-erro/indisponivel"


def test_google_aceita_convite_so_com_o_mesmo_email(client, sessao, novo_email, google):
    email = novo_email("g")
    c = _convidar(client, sessao, email)
    google.update(sub="sub-outro", email="outra@gmail.com", nome="Outra")
    assert _ir_e_voltar(_token(c["url"]))[1] == "/#/google-erro/outro-email"
    google.update(sub="sub-123", email=email, nome="Pessoa Google")
    navegador, destino = _ir_e_voltar(_token(c["url"]))
    assert destino.startswith("/#/google/")
    bilhete = destino.rsplit("/", 1)[-1]
    r = navegador.post("/api/auth/google/entrar", json={"ticket": bilhete})
    me = navegador.get("/api/me", headers={"Authorization": "Bearer " + r.json()["token"]}).json()
    assert me["email"] == email and me["papel"] == "operador"
    assert navegador.post("/api/auth/google/entrar", json={"ticket": bilhete}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "senha": "google$"}).status_code == 401


def test_google_entra_em_acesso_existente_e_liga_a_conta(client, sessao, google):
    email = client.get("/api/me", headers=sessao).json()["email"]
    google.update(sub="sub-admin", email=email, nome="Admin")
    navegador, destino = _ir_e_voltar()
    assert destino.startswith("/#/google/")
    assert navegador.post("/api/auth/google/entrar", json={"ticket": destino.rsplit("/", 1)[-1]}).status_code == 200
    google.update(sub="sub-intruso", email=email, nome="Intruso")
    assert _ir_e_voltar()[1] == "/#/google-erro/outra-conta"


def test_google_sem_acesso_e_sem_cookie(google):
    from backend.main import app
    google.update(sub="sub-x", email="ninguem@gmail.com", nome="Ninguém")
    assert _ir_e_voltar()[1] == "/#/google-erro/sem-acesso"
    from backend.security import criar_assinado
    state = criar_assinado("google_state", {"c": None, "n": "nonce"}, 600)
    r = TestClient(app).get(f"/api/auth/google/callback?code=abc&state={state}", follow_redirects=False)
    assert r.headers["location"] == "/#/google-erro/sessao"


def _publicado(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={
        "titulo": "Garrafa Térmica Inox 1L", "preco": 80, "fotos": ["https://cdn.exemplo.com/1.jpg"],
        "descricao": "Garrafa térmica de aço inox com parede dupla, mantém quente por 12 horas. " * 2}).json()
    pub = client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]}).json()
    return pub["publicacoes"][0]["id"]


def test_pausar_reativar_e_excluir_anuncio(client, sessao):
    pid = str(_publicado(client, sessao))
    s = client.get("/api/publicacoes/situacao", headers=sessao).json()[pid]
    assert s["status"] == "active" and s["simulado"] and "pausar" in s["acoes"]
    assert client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "pausar"}).json()["status"] == "paused"
    assert client.get("/api/publicacoes/situacao", headers=sessao).json()[pid]["acoes"] == ["excluir", "finalizar", "reativar"]
    client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "finalizar"})
    assert client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "reativar"}).status_code == 400
    assert client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "excluir"}).json()["status"] == "deleted"
    atividades = client.get("/api/atividades", headers=sessao).json()
    assert any("Excluiu o anúncio" in a["descricao"] for a in atividades)


def test_anuncio_de_outra_conta_explica_o_motivo(client, sessao, monkeypatch):
    from backend.banco.db import SessionLocal
    from backend.banco.models import Publicacao
    from backend.services import publicacoes, radar
    pid = _publicado(client, sessao)
    with SessionLocal() as db:
        p = db.get(Publicacao, pid)
        p.demo, p.id_externo = False, "MLB123"
        db.commit()

    class Proibido:
        demo = False
        conta_info = {"apelido": "CONTA_NOVA"}

        def _nega(self, *a, **k):
            raise ErroMarketplace("Mercado Livre — ler anúncio: Access to the requested resource is forbidden", {"status": 403})
        alterar_status = excluir = item = atualizar_preco = _nega

        def situacao_itens(self, ids):
            return {i: {"status": None, "sub_status": [], "acessivel": False, "codigo": 403} for i in ids}

    monkeypatch.setattr(publicacoes, "obter_adaptador", lambda *a, **k: (Proibido(), ""))
    monkeypatch.setattr(radar, "obter_adaptador", lambda *a, **k: (Proibido(), ""))
    r = client.post(f"/api/publicacoes/{pid}/acao", headers=sessao, json={"acao": "pausar"})
    assert r.status_code == 400 and "recusou o acesso (403)" in r.json()["detail"] and "CONTA_NOVA" in r.json()["detail"]
    s = client.get("/api/publicacoes/situacao", headers=sessao).json()[str(pid)]
    assert s["outra_conta"] and not s["acoes"]
    anuncio_id = client.get("/api/publicacoes", headers=sessao).json()[0]["anuncio_id"]
    r = client.post(f"/api/anuncios/{anuncio_id}/radar", headers=sessao)
    assert r.status_code == 400 and "não registrou" in r.json()["detail"]
    linha = next(a for a in client.get("/api/radar", headers=sessao).json() if a["id"] == anuncio_id)
    assert linha["contas"]["conectada"] == "" and linha["contas"]["publicou"] == ""

    assert client.post(f"/api/publicacoes/{pid}/tirar-da-lista", headers=sessao).status_code == 200
    assert all(a["id"] != anuncio_id for a in client.get("/api/radar", headers=sessao).json())
    r = client.post(f"/api/anuncios/{anuncio_id}/radar", headers=sessao)
    assert r.status_code == 400 and "Publique este primeiro" in r.json()["detail"]


def test_lojista_nao_mexe_em_anuncio(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    pid = _publicado(client, sessao)
    email = novo_email("loja")
    client.post(f"/api/clientes/{sessao['X-Cliente']}/logins", headers=admin,
                json={"nome": "Loja", "email": email, "senha": "senha-forte-123"})
    loja = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": email, "senha": "senha-forte-123"}).json()["token"]}
    assert client.post(f"/api/publicacoes/{pid}/acao", headers=loja, json={"acao": "excluir"}).status_code == 403
