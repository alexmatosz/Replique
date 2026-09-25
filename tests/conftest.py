import os
import sys
import tempfile
from pathlib import Path

# Banco e pasta de dados isolados para os testes — nunca toca no data/ real.
_tmp = tempfile.mkdtemp(prefix="replique-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'teste.db').as_posix()}"
os.environ["SECRET_KEY"] = "chave-de-teste"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["PERMITIR_CADASTRO_AGENCIA"] = "true"
os.environ["FILA_ATIVA"] = "false"  # nos testes a fila é processada passo a passo
os.environ["LOTE_INTERVALO_S"] = "0"  # os testes criam uma agência por teste
for var in ("ML_CLIENT_ID", "SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "AMAZON_LWA_CLIENT_ID", "AMAZON_LWA_CLIENT_SECRET"):
    os.environ[var] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.api import limites  # noqa: E402

limites.cadastros_ip.maximo = 100_000  # os testes cadastram muitas empresas do mesmo "IP"


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


_contador = {"n": 0}


def nova_empresa(client, nome_cliente="Cliente A"):
    """Empresa nova com o admin logado e um cliente selecionado (cabeçalho X-Cliente)."""
    _contador["n"] += 1
    r = client.post("/api/auth/cadastro", json={
        "empresa": f"Agência Teste {_contador['n']}", "nome": "Fulano", "email": f"u{_contador['n']}@teste.com",
        "senha": "senha-forte-123"})
    assert r.status_code == 200, r.text
    h = {"Authorization": "Bearer " + r.json()["token"]}
    cliente = client.post("/api/clientes", headers=h, json={"nome": nome_cliente})
    assert cliente.status_code == 200, cliente.text
    return {**h, "X-Cliente": str(cliente.json()["id"])}


@pytest.fixture
def sessao(client):
    """Admin de uma empresa nova, trabalhando no cliente "Cliente A"."""
    return nova_empresa(client)


@pytest.fixture
def empresa_nova(client):
    return lambda nome_cliente="Cliente A": nova_empresa(client, nome_cliente)


@pytest.fixture
def novo_email():
    def gerar(prefixo="p"):
        _contador["n"] += 1
        return f"{prefixo}{_contador['n']}@teste.com"
    return gerar
