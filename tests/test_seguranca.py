"""Travas de segurança: arquivos do servidor, rede interna, força bruta, sessões e cabeçalhos."""

import httpx
import pytest

from app.marketplaces.base import ErroMarketplace
from app.marketplaces.shopee import Shopee
from app.services import fotos


# ------------------------------------------------------------------ fotos
@pytest.mark.parametrize("foto", [
    "/uploads/../secret.key", "/uploads/../replique.db", "/uploads/1/../../secret.key",
    "/uploads/1/x.jpg/../../../replique.db", "file:///C:/Windows/win.ini", "javascript:alert(1)",
    "http://usuario:senha@exemplo.com/a.jpg", "C:\\meuprojeto\\data\\secret.key", "//evil.com/a.jpg",
])
def test_foto_maliciosa_e_recusada_na_edicao(client, sessao, foto):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Teste"}).json()
    r = client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"fotos": [foto]})
    assert r.status_code == 400, foto


def test_foto_de_outra_empresa_e_recusada(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Teste"}).json()
    r = client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"fotos": ["/uploads/999999/" + "a" * 20 + ".jpg"]})
    assert r.status_code == 400 and "outra empresa" in r.json()["detail"]


def test_leitura_local_nunca_sai_da_pasta_da_empresa():
    loja = Shopee({})
    loja.empresa_id = 1
    for url in ("/uploads/../secret.key", "/uploads/1/../replique.db", "/uploads/2/" + "a" * 20 + ".jpg"):
        with pytest.raises(ErroMarketplace):
            loja.baixar_imagem(url)


@pytest.mark.parametrize("url", [
    "http://127.0.0.1:8000/api/me", "http://localhost/admin", "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/x.jpg", "http://192.168.0.1/x.jpg", "http://[::1]/x.jpg", "ftp://exemplo.com/x.jpg",
])
def test_download_bloqueia_rede_interna(url):
    def proibido(req):
        raise AssertionError(f"não deveria acessar {req.url}")
    loja = Shopee({})
    loja.http = httpx.Client(transport=httpx.MockTransport(proibido))
    with pytest.raises(ErroMarketplace):
        loja.baixar_imagem(url)


def test_download_confere_redirecionamento_e_tipo(monkeypatch):
    publicos = {"cdn.exemplo.com"}
    monkeypatch.setattr(fotos, "_endereco_publico", lambda host: host in publicos)

    def handler(req):
        if req.url.path == "/redireciona":
            return httpx.Response(302, headers={"location": "http://169.254.169.254/credenciais"})
        if req.url.path == "/pagina":
            return httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"})
        return httpx.Response(200, content=b"\xff\xd8", headers={"content-type": "image/jpeg"})
    loja = Shopee({})
    loja.http = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(ErroMarketplace, match="Não é permitido"):
        loja.baixar_imagem("https://cdn.exemplo.com/redireciona")
    with pytest.raises(ErroMarketplace, match="não é uma imagem"):
        loja.baixar_imagem("https://cdn.exemplo.com/pagina")
    assert loja.baixar_imagem("https://cdn.exemplo.com/foto.jpg") == (b"\xff\xd8", "foto.jpg")


# ------------------------------------------------------------------ acesso
def test_login_bloqueia_forca_bruta(client, sessao):
    email = client.get("/api/me", headers=sessao).json()["email"]
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": email, "senha": "errada-123"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": email, "senha": "senha-forte-123"})
    assert r.status_code == 429 and "tentativas" in r.json()["detail"]


def test_trocar_senha_derruba_sessoes_abertas(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    email = novo_email("op")
    uid = client.post("/api/empresa/usuarios", headers=admin, json={
        "nome": "Op", "email": email, "senha": "senha-forte-123", "papel": "operador"}).json()["id"]
    token = client.post("/api/auth/login", json={"email": email, "senha": "senha-forte-123"}).json()["token"]
    h = {"Authorization": "Bearer " + token}
    assert client.get("/api/me", headers=h).status_code == 200
    client.patch(f"/api/empresa/usuarios/{uid}", headers=admin, json={"senha": "outra-senha-456"})
    assert client.get("/api/me", headers=h).status_code == 401
    # desativar e reativar também não ressuscita a sessão antiga
    token2 = client.post("/api/auth/login", json={"email": email, "senha": "outra-senha-456"}).json()["token"]
    client.patch(f"/api/empresa/usuarios/{uid}", headers=admin, json={"ativo": False})
    client.patch(f"/api/empresa/usuarios/{uid}", headers=admin, json={"ativo": True})
    assert client.get("/api/me", headers={"Authorization": "Bearer " + token2}).status_code == 401


def test_cadastro_de_agencia_fechado_quando_desligado(client, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "PERMITIR_CADASTRO_AGENCIA", False)
    r = client.post("/api/auth/cadastro", json={"empresa": "Intrusa", "nome": "Zé", "email": "ze@intrusa.com",
                                                "senha": "senha-forte-123"})
    assert r.status_code == 403


def test_cabecalhos_de_seguranca(client):
    r = client.get("/")
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["x-content-type-options"] == "nosniff"
    csp = r.headers["content-security-policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp and "unsafe-eval" not in csp
    assert client.get("/docs").status_code == 404 and client.get("/openapi.json").status_code == 404


def test_trocar_a_propria_senha(client, sessao):
    me = client.get("/api/me", headers=sessao).json()
    r = client.post("/api/me/senha", headers=sessao, json={"atual": "errada", "nova": "nova-senha-789"})
    assert r.status_code == 400
    assert client.post("/api/me/senha", headers=sessao, json={"atual": "senha-forte-123", "nova": "12345678"}).status_code == 400
    r = client.post("/api/me/senha", headers=sessao, json={"atual": "senha-forte-123", "nova": "nova-senha-789"})
    assert r.status_code == 200
    assert client.get("/api/me", headers=sessao).status_code == 401  # sessão antiga caiu
    assert client.get("/api/me", headers={"Authorization": "Bearer " + r.json()["token"]}).status_code == 200
    assert client.post("/api/auth/login", json={"email": me["email"], "senha": "nova-senha-789"}).status_code == 200


def test_senha_fraca_nao_entra_pela_internet(client, sessao, novo_email):
    """Conta antiga com senha óbvia: entra no computador local, mas não pela internet."""
    from app.db import SessionLocal
    from app.models import Usuario
    from app.security import hash_senha
    email = client.get("/api/me", headers=sessao).json()["email"]
    with SessionLocal() as db:
        u = db.query(Usuario).filter_by(email=email).one()
        u.senha_hash = hash_senha("monvatti2026")
        db.commit()
    assert client.post("/api/auth/login", json={"email": email, "senha": "monvatti2026"}).status_code == 200
    r = client.post("/api/auth/login", json={"email": email, "senha": "monvatti2026"},
                    headers={"CF-Connecting-IP": "203.0.113.9"})
    assert r.status_code == 403 and "fraca" in r.json()["detail"]
    # e não dá para criar acesso novo com senha óbvia
    assert client.post("/api/empresa/usuarios", headers=sessao, json={
        "nome": "Op", "email": novo_email(), "senha": "12345678", "papel": "operador"}).status_code == 400
