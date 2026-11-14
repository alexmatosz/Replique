"""Conta de desenvolvedor: vê tudo, escolhe o que os administradores recebem e
testa ferramentas novas antes de liberar."""

import pytest

from backend import config
from backend.banco.db import SessionLocal
from backend.banco.models import AjusteSistema
from backend.services import ferramentas as permissoes

from conftest import login


def _zerar_ajuste():
    with SessionLocal() as db:
        db.query(AjusteSistema).filter_by(chave=permissoes.CHAVE_ADMIN).delete()
        db.commit()
    permissoes._cache_admin["valor"] = None


@pytest.fixture
def cenario(client, sessao, novo_email, monkeypatch):
    _zerar_ajuste()
    email_dev = novo_email("dev")
    monkeypatch.setattr(config, "DESENVOLVEDORES", {email_dev})
    r = client.post("/api/auth/cadastro", json={"empresa": "Agência do Dev", "nome": "Dev", "email": email_dev, "senha": "senha-forte-123"})
    assert r.status_code == 200, r.text
    admin = {"Authorization": sessao["Authorization"]}
    email_op = novo_email("op")
    r = client.post("/api/empresa/usuarios", headers=admin, json={
        "nome": "Operador", "email": email_op, "senha": "senha-forte-123", "papel": "operador", "clientes": [int(sessao["X-Cliente"])]})
    assert r.status_code == 200, r.text
    yield {"dev": login(client, email_dev), "admin": admin, "op": login(client, email_op), "cliente": sessao["X-Cliente"]}
    _zerar_ajuste()


def _me(client, h):
    return client.get("/api/me", headers=h).json()


def test_desenvolvedor_tira_ferramenta_dos_administradores(client, cenario):
    dev, admin, op = cenario["dev"], cenario["admin"], cenario["op"]
    assert _me(client, dev)["desenvolvedor"] is True and _me(client, admin)["desenvolvedor"] is False
    d = client.get("/api/empresa/ferramentas", headers=dev).json()
    assert d["desenvolvedor"] and "promocoes" in d["admin"]["liberadas"]
    assert "admin" not in client.get("/api/empresa/ferramentas", headers=admin).json()

    sem = sorted(set(permissoes.IDS) - {"promocoes"})
    r = client.put("/api/empresa/ferramentas", headers=dev, json={"liberadas": {p: v["liberadas"] for p, v in d["papeis"].items()}, "admin": sem})
    assert r.status_code == 200 and "promocoes" not in r.json()["admin"]["liberadas"]

    assert "promocoes" not in _me(client, admin)["ferramentas"] and "promocoes" not in _me(client, op)["ferramentas"]
    assert "promocoes" in _me(client, dev)["ferramentas"]
    assert client.get("/api/promocoes", headers={**admin, "X-Cliente": cenario["cliente"]}).status_code == 403
    vista = client.get("/api/empresa/ferramentas", headers=admin).json()
    assert "promocoes" not in {f["id"] for f in vista["ferramentas"]}

    r = client.put("/api/empresa/ferramentas", headers=admin, json={"liberadas": {"operador": []}, "admin": sorted(permissoes.IDS)})
    assert r.status_code == 403


def test_ferramenta_nova_nasce_so_para_o_desenvolvedor(client, cenario, monkeypatch):
    monkeypatch.setattr(permissoes, "NOVAS", {"concorrentes"})
    permissoes._cache_admin["valor"] = None
    dev, admin, op = cenario["dev"], cenario["admin"], cenario["op"]
    assert "concorrentes" in _me(client, dev)["ferramentas"]
    assert "concorrentes" not in _me(client, admin)["ferramentas"] and "concorrentes" not in _me(client, op)["ferramentas"]

    d = client.get("/api/empresa/ferramentas", headers=dev).json()
    nova = next(f for f in d["ferramentas"] if f["id"] == "concorrentes")
    assert nova["nova"] and not nova["do_admin"]
    marcadas = {p: v["liberadas"] for p, v in d["papeis"].items()}
    client.put("/api/empresa/ferramentas", headers=dev, json={"liberadas": marcadas, "admin": d["admin"]["liberadas"] + ["concorrentes"]})
    assert "concorrentes" in _me(client, admin)["ferramentas"]
    assert "concorrentes" not in _me(client, op)["ferramentas"]

    d = client.get("/api/empresa/ferramentas", headers=admin).json()
    marcadas = {p: v["liberadas"] for p, v in d["papeis"].items()}
    marcadas["operador"].append("concorrentes")
    assert client.put("/api/empresa/ferramentas", headers=admin, json={"liberadas": marcadas}).status_code == 200
    assert "concorrentes" in _me(client, op)["ferramentas"]
    assert "promocoes" in _me(client, op)["ferramentas"]
