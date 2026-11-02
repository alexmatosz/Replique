"""Senhas (ASVS 6.2), segundo fator (6.3/6.5), sessão por cookie com CSRF e inatividade (7.x) e avisos de conta."""

import time

from backend.banco.db import SessionLocal
from backend.banco.models import Notificacao, Usuario
from backend.security import codigo_totp, hash_senha, ler_token_sessao, senha_fraca


def _login(client, email, senha="senha-forte-123"):
    return client.post("/api/auth/login", json={"email": email, "senha": senha})


def _criar(client, admin, novo_email, papel="operador"):
    email = novo_email("seg")
    uid = client.post("/api/empresa/usuarios", headers=admin, json={"nome": "Pessoa Segura", "email": email,
                                                                     "senha": "senha-forte-123", "papel": papel}).json()["id"]
    return uid, email, {"Authorization": "Bearer " + _login(client, email).json()["token"]}


def test_regras_de_senha():
    for fraca in ("S3nha@2026", "Flamengo2024!", "qwerty123", "12121212", "abcdefgh", "novasenha99", "Replique!1"):
        assert senha_fraca(fraca), fraca
    for forte in ("senha-forte-123", "Garrafa-Azul-Grande", "correto cavalo bateria grampo"):
        assert not senha_fraca(forte), forte
    assert senha_fraca("joaquina-2026", ("joaquina@loja.com",))


def test_segundo_fator_do_inicio_ao_fim(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    uid, email, h = _criar(client, admin, novo_email)
    assert client.post("/api/me/2fa/iniciar", headers=h, json={"senha": "errada"}).status_code == 400
    ini = client.post("/api/me/2fa/iniciar", headers=h, json={"senha": "senha-forte-123"}).json()
    segredo = ini["segredo"].replace(" ", "")
    assert ini["uri"].startswith("otpauth://totp/Replique:")
    passo = int(time.time() // 30)
    ativo = client.post("/api/me/2fa/ativar", headers=h, json={"codigo": codigo_totp(segredo, passo)}).json()
    recuperacao = ativo["codigos_recuperacao"]
    assert len(recuperacao) == 10
    r = _login(client, email).json()
    assert r["precisa_2fa"] and "token" not in r
    assert client.post("/api/auth/2fa", json={"desafio": r["desafio"], "codigo": codigo_totp(segredo, passo)}).status_code == 401
    ok = client.post("/api/auth/2fa", json={"desafio": r["desafio"], "codigo": codigo_totp(segredo, passo + 1)})
    assert ok.status_code == 200 and ok.json()["token"]
    r2 = _login(client, email).json()
    assert client.post("/api/auth/2fa", json={"desafio": r2["desafio"], "codigo": recuperacao[0]}).status_code == 200
    r3 = _login(client, email).json()
    assert client.post("/api/auth/2fa", json={"desafio": r3["desafio"], "codigo": recuperacao[0]}).status_code == 401
    assert client.post(f"/api/empresa/usuarios/{uid}/2fa/reset", headers=admin).status_code == 200
    assert "token" in _login(client, email).json()
    avisos = client.get("/api/notificacoes", headers={"Authorization": "Bearer " + _login(client, email).json()["token"]}).json()["itens"]
    assert any(n["tipo"] == "seguranca_conta" for n in avisos)


def test_exigir_segundo_fator_bloqueia_ate_configurar(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    assert client.put("/api/empresa/seguranca", headers=admin, json={"exigir_2fa": True}).status_code == 400
    ini = client.post("/api/me/2fa/iniciar", headers=admin, json={"senha": "senha-forte-123"}).json()
    segredo = ini["segredo"].replace(" ", "")
    client.post("/api/me/2fa/ativar", headers=admin, json={"codigo": codigo_totp(segredo, int(time.time() // 30))})
    assert client.put("/api/empresa/seguranca", headers=admin, json={"exigir_2fa": True}).status_code == 200
    _, email, h = _criar(client, admin, novo_email)
    assert client.get("/api/me", headers=h).json()["precisa_2fa"] is True
    assert client.get("/api/meus-anuncios", headers={**h, "X-Cliente": sessao["X-Cliente"]}).status_code == 403
    assert client.get("/api/me/2fa", headers=h).json()["pendente"] is True
    client.put("/api/empresa/seguranca", headers=admin, json={"exigir_2fa": False})


def test_sessao_por_cookie_exige_cabecalho_contra_csrf(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    _, email, h = _criar(client, admin, novo_email)
    token = h["Authorization"].removeprefix("Bearer ")
    from fastapi.testclient import TestClient
    from backend.main import app
    navegador = TestClient(app)
    r = navegador.post("/api/auth/cookie", headers=h)
    assert r.status_code == 200 and "httponly" in r.headers["set-cookie"].lower() and "samesite=strict" in r.headers["set-cookie"].lower()
    navegador.cookies.set("rpq_sessao", token)
    assert navegador.get("/api/me").status_code == 200
    assert navegador.patch("/api/me", json={"nome": "Outro Nome"}).status_code == 403
    assert navegador.patch("/api/me", json={"nome": "Outro Nome"}, headers={"X-Replique": "1"}).status_code == 200
    renovado = navegador.post("/api/auth/renovar", headers={"X-Replique": "1"}).json()
    assert ler_token_sessao(renovado["token"])["l"] == ler_token_sessao(token)["l"]
    assert "rpq_sessao=\"\"" in navegador.post("/api/auth/sair").headers["set-cookie"] or "Max-Age=0" in navegador.post("/api/auth/sair").headers["set-cookie"]


def test_sessao_expira_por_inatividade_e_hash_antigo_e_refeito(client, sessao, novo_email, monkeypatch):
    from backend import security
    monkeypatch.setattr(security, "SESSAO_INATIVIDADE_MIN", 0)
    assert ler_token_sessao(security.criar_token_sessao(1, 1, 0)) is None
    monkeypatch.undo()
    admin = {"Authorization": sessao["Authorization"]}
    uid, email, _ = _criar(client, admin, novo_email)
    with SessionLocal() as db:
        u = db.get(Usuario, uid)
        monkeypatch.setattr(security, "_ITERACOES", 1000)
        u.senha_hash = hash_senha("senha-forte-123")
        db.commit()
    monkeypatch.undo()
    assert _login(client, email).status_code == 200
    with SessionLocal() as db:
        assert int(db.get(Usuario, uid).senha_hash.split("$")[1]) == security._ITERACOES


def test_varias_senhas_erradas_avisam_a_pessoa(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    uid, email, _ = _criar(client, admin, novo_email)
    for _ in range(5):
        _login(client, email, "errada-errada")
    with SessionLocal() as db:
        assert db.query(Notificacao).filter_by(usuario_id=uid, tipo="seguranca_conta").count() == 1
