"""Radar de mercado: tendências, mais vendidos e a nota de oportunidade."""

import pytest

from app.services import mercado


class Resposta:
    def __init__(self, dados, status=200):
        self.dados, self.status_code = dados, status

    def json(self):
        return self.dados


class MLFalso:
    RESPOSTAS = {
        "/trends/MLB": [{"keyword": "lixeira inox", "url": "https://lista.mercadolivre.com.br/lixeira-inox"},
                        {"keyword": "capa celular", "url": "https://lista.mercadolivre.com.br/capa-celular"}],
        "/products/P1/items": {"paging": {"total": 2}, "results": [
            {"price": 100, "category_id": "MLB10", "shipping": {}}, {"price": 120, "category_id": "MLB10", "shipping": {}}]},
        "/products/P2/items": {"paging": {"total": 40}, "results": [
            {"price": 20, "category_id": "MLB20", "official_store_id": 9, "shipping": {"logistic_type": "fulfillment"}}]},
        "/products/P1": {"id": "P1", "name": "Lixeira Inox 5L", "pictures": [{"url": "https://http2.mlstatic.com/x.jpg"}]},
        "/categories/MLB10": {"total_items_in_this_category": 2000, "path_from_root": [{"name": "Casa"}, {"name": "Lixeiras"}]},
        "/categories/MLB20": {"total_items_in_this_category": 3_000_000, "path_from_root": [{"name": "Celulares"}, {"name": "Capas"}]},
        "/highlights/MLB/category/MLB10": {"content": [{"id": "P1", "position": 1, "type": "PRODUCT"}]},
    }

    def _token(self):
        return "t"

    def tarifa_venda(self, preco, tipo, categoria=""):
        return {"sale_fee_amount": round(preco * 0.14, 2)}

    def prever_categorias(self, termo, limite=3):
        return [{"category_id": "MLB10" if "lixeira" in termo else "MLB20", "domain_id": "D"}]

    def _get(self, caminho, params=None, auth=True):
        if caminho == "/products/search":
            return Resposta({"results": [{"id": "P1" if "lixeira" in params["q"] else "P2", "name": "Exemplo"}]})
        return Resposta(self.RESPOSTAS[caminho]) if caminho in self.RESPOSTAS else Resposta({}, 404)


@pytest.fixture
def ml_falso(monkeypatch):
    mercado._cache.clear()
    monkeypatch.setattr(mercado, "adaptador_ml", lambda db, empresa_id, cliente_id: MLFalso())
    yield
    mercado._cache.clear()


def test_tendencias_dao_mais_nota_para_pouca_concorrencia(client, sessao, ml_falso):
    r = client.get("/api/mercado/tendencias", headers=sessao)
    assert r.status_code == 200, r.text
    lixeira, capa = r.json()
    assert lixeira["tipo"] == "em_alta" and lixeira["categoria"] == "Casa › Lixeiras"
    assert lixeira["vendedores"] == 2 and lixeira["preco_mediano"] == 110
    assert capa["oficiais"] == 1 and capa["concorrencia"] > lixeira["concorrencia"]
    assert lixeira["nota"] > capa["nota"]


def test_mais_vendidos_da_categoria(client, sessao, ml_falso):
    r = client.get("/api/mercado/mais-vendidos?categoria=MLB10", headers=sessao)
    assert r.status_code == 200, r.text
    assert r.json()[0]["termo"] == "Lixeira Inox 5L" and r.json()[0]["posicao"] == 1
    assert client.get("/api/mercado/mais-vendidos?categoria=MLB99", headers=sessao).status_code == 400
    assert client.get("/api/mercado/mais-vendidos?categoria=x;drop", headers=sessao).status_code == 422


def test_sem_conta_do_ml_mostra_demonstracao_identificada(client, sessao):
    mercado._cache.clear()
    r = client.get("/api/mercado/tendencias", headers=sessao)
    assert r.status_code == 200 and r.json() and all(x["demo"] for x in r.json())


def test_sem_conta_fora_da_demonstracao_explica_o_que_falta(client, sessao, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "MODO_DEMONSTRACAO", False)
    mercado._cache.clear()
    r = client.get("/api/mercado/tendencias", headers=sessao)
    assert r.status_code == 400 and "Conecte uma conta do Mercado Livre" in r.json()["detail"]


def test_nota_mostra_as_partes_da_formula(client, sessao, ml_falso):
    lixeira = client.get("/api/mercado/tendencias", headers=sessao).json()[0]
    assert set(lixeira["partes"]) == set(mercado.PESOS)
    assert lixeira["nota"] == round(sum(lixeira["partes"][k] * w for k, w in mercado.PESOS.items()))
    assert lixeira["margem_estimada"] is not None and lixeira["tendencia"] == "novo"


def test_tendencia_compara_com_a_coleta_anterior(client, sessao, ml_falso):
    from datetime import datetime, timedelta, timezone

    from app.db import SessionLocal
    from app.models import ColetaMercado

    empresa = client.get("/api/me", headers=sessao).json()["empresa"]["id"]
    with SessionLocal() as db:
        db.add(ColetaMercado(empresa_id=empresa, chave="busca:capa celular", origem="tendencias", termo="capa celular",
                             posicao=9, coletada_em=datetime.now(timezone.utc) - timedelta(days=1)))
        db.commit()
    itens = {x["termo"]: x for x in client.get("/api/mercado/tendencias", headers=sessao).json()}
    assert itens["capa celular"]["tendencia"] == "subindo" and itens["capa celular"]["posicao_anterior"] == 9
    hist = client.get("/api/mercado/historico", params={"chave": "busca:capa celular"}, headers=sessao).json()
    assert len(hist) == 2
    client.get("/api/mercado/tendencias", headers=sessao)
    assert len(client.get("/api/mercado/historico", params={"chave": "busca:capa celular"}, headers=sessao).json()) == 2


def test_margem_estimada_e_faixa_de_preco():
    assert mercado.margem_estimada(100, 14, 6) == 80.0
    assert mercado.margem_estimada(None, 14, 6) is None
    assert mercado.pontos_preco(100) == 100 and mercado.pontos_preco(10) == 40
    assert mercado.tendencia(5, {"posicao": 5}) == "estavel" and mercado.tendencia(9, {"posicao": 2}) == "caindo"
