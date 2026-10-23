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


def test_sem_conta_do_ml_explica_o_que_falta(client, sessao):
    mercado._cache.clear()
    r = client.get("/api/mercado/tendencias", headers=sessao)
    assert r.status_code == 400 and "Conecte uma conta do Mercado Livre" in r.json()["detail"]
