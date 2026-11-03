import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="replique-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'teste.db').as_posix()}"
os.environ["REPLIQUE_DATA_DIR"] = _tmp
os.environ["SECRET_KEY"] = "chave-de-teste"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["PERMITIR_CADASTRO_AGENCIA"] = "true"
os.environ["FILA_ATIVA"] = "false"
os.environ["MODO_DEMONSTRACAO"] = "true"
os.environ["LOTE_INTERVALO_S"] = "0"
os.environ["FOTOS_EM_SEGUNDO_PLANO"] = "false"
os.environ["PROXY_MODO"] = "cloudflare"
os.environ["CACHE_ML"] = "false"
os.environ["VENDAS_LUCRO_PADRAO"] = "true"
os.environ["SENHA_ITERACOES"] = "20000"
os.environ["AGENDADOR_ATIVO"] = "false"
for var in ("OPENAI_API_KEY", "GEMINI_API_KEY", "IMAGENS_PROVEDOR"):
    os.environ[var] = ""
for var in ("ML_CLIENT_ID", "SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "AMAZON_LWA_CLIENT_ID", "AMAZON_LWA_CLIENT_SECRET",
            "SMTP_HOST", "SMTP_USUARIO", "SMTP_SENHA", "SMTP_REMETENTE", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
    os.environ[var] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402
from backend.api import limites  # noqa: E402

limites.cadastros_ip.maximo = 100_000


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


def login(client, email, senha="senha-forte-123"):
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
        pessoas[chave] = login(client, email)
        pessoas[chave + "_id"] = r.json()["id"]
    for chave, cid in (("loja", a), ("loja_b", b)):
        email = novo_email(chave)
        r = client.post(f"/api/clientes/{cid}/logins", headers=admin, json={
            "nome": f"Lojista {chave}", "email": email, "senha": "senha-forte-123"})
        assert r.status_code == 200, r.text
        pessoas[chave] = login(client, email)
    return {"admin": admin, "a": a, "b": b, **pessoas}
