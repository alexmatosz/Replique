"""Publicação em massa: fila, intervalos e travas que protegem a conta do cliente."""

import pytest

from backend import config
from backend.banco.db import SessionLocal
from backend.marketplaces.base import ErroMarketplace, Marketplace, ResultadoPublicacao
from backend.services import lotes, replique


class ContaFalsa(Marketplace):
    """Marketplace "real" de mentira: o título decide o resultado."""
    plataforma = "mercadolivre"
    demo = False
    publicados: list = []

    def __init__(self):
        super().__init__({})
        self.conta_info = {"apelido": "LOJA_TESTE", "id_externo": "999"}

    def publicar(self, anuncio):
        if "FALHA" in anuncio.titulo:
            raise ErroMarketplace("Recusado pelo marketplace.")
        ContaFalsa.publicados.append(anuncio.titulo)
        status = "paused" if "PAUSA" in anuncio.titulo else "active"
        return ResultadoPublicacao(sucesso=True, id_externo=f"MLB{anuncio.id}", link="https://ml/x",
                                   mensagem="ok", detalhes={"status": status})


@pytest.fixture
def conta_real(monkeypatch):
    ContaFalsa.publicados = []
    falso = lambda db, cliente_id, plataforma, operacao="pesquisar": (ContaFalsa(), "")  # noqa: E731
    monkeypatch.setattr(lotes, "obter_adaptador", falso)
    monkeypatch.setattr(replique, "obter_adaptador", falso)
    return ContaFalsa


def _rascunho(client, h, titulo, **extra):
    corpo = {"titulo": titulo, "preco": 50, "fotos": ["https://f/1.jpg"], "descricao": "x" * 100, **extra}
    return client.post("/api/anuncios", headers=h, json=corpo).json()["id"]


def _rodar_fila():
    with SessionLocal() as db:
        while lotes.processar_passo(db):
            pass


def test_lote_em_modo_demonstracao(client, sessao):
    ids = [_rascunho(client, sessao, f"Produto {i}") for i in range(3)]
    p = client.post("/api/lotes/previa", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre", "amazon"]}).json()
    assert p["prontos"] == {"mercadolivre": 3, "amazon": 3} and not p["contas"]["mercadolivre"]["real"]
    lote = client.post("/api/lotes", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre", "amazon"]}).json()
    assert lote["status"] == "na_fila" and lote["total"] == 6
    assert client.post("/api/lotes", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["amazon"]}).status_code == 400
    _rodar_fila()
    fim = client.get(f"/api/lotes/{lote['id']}", headers=sessao).json()
    assert fim["status"] == "concluido" and fim["contagem"]["simulado"] == 6
    assert any("concluído" in a["descricao"] for a in client.get("/api/atividades", headers=sessao).json())


def test_lote_tem_tamanho_maximo(client, sessao):
    ids = [_rascunho(client, sessao, f"P{i}") for i in range(config.LOTE_MAX_ANUNCIOS + 1)]
    r = client.post("/api/lotes/previa", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre"]})
    assert r.status_code == 400 and "No máximo" in r.json()["detail"]


def test_conta_real_exige_confirmacao_e_pula_duplicados(client, sessao, conta_real):
    ja = _rascunho(client, sessao, "Furadeira Vonder 650W")
    client.post(f"/api/anuncios/{ja}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]})
    ids = [ja, _rascunho(client, sessao, "Furadeira  VONDER 650w"),
           _rascunho(client, sessao, "Parafusadeira Bosch", gtin="789123"),
           _rascunho(client, sessao, "Parafusadeira Bosch 12V", gtin="789123"),
           _rascunho(client, sessao, "Trena 5m")]
    p = client.post("/api/lotes/previa", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre"]}).json()
    situacao = {i["anuncio_id"]: i["plataformas"]["mercadolivre"]["situacao"] for i in p["itens"]}
    assert situacao == {ids[0]: "pulado", ids[1]: "pulado", ids[2]: "pronto", ids[3]: "pulado", ids[4]: "pronto"}
    assert p["contas"]["mercadolivre"]["apelido"] == "LOJA_TESTE"
    corpo = {"anuncio_ids": ids, "plataformas": ["mercadolivre"]}
    assert client.post("/api/lotes", headers=sessao, json=corpo).status_code == 400
    lote = client.post("/api/lotes", headers=sessao, json={**corpo, "confirmado": True}).json()
    assert lote["total"] == 2
    _rodar_fila()
    assert conta_real.publicados == ["Furadeira Vonder 650W", "Parafusadeira Bosch", "Trena 5m"]
    chk = client.post(f"/api/anuncios/{ja}/checar", headers=sessao, json={"plataformas": ["mercadolivre"]}).json()
    assert "já foi publicado" in chk["mercadolivre"]["avisos"][0]


def test_lote_para_apos_falhas_seguidas(client, sessao, conta_real):
    ids = [_rascunho(client, sessao, f"Item FALHA {i}") for i in range(4)] + [_rascunho(client, sessao, "Item bom")]
    lote = client.post("/api/lotes", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre"],
                                                           "confirmado": True}).json()
    _rodar_fila()
    fim = client.get(f"/api/lotes/{lote['id']}", headers=sessao).json()
    assert fim["status"] == "interrompido" and "3 falhas seguidas" in fim["motivo"]
    assert fim["contagem"] == {"pendente": 2, "publicado": 0, "simulado": 0, "falhou": 3, "pulado": 0}
    assert conta_real.publicados == []
    client.post(f"/api/lotes/{lote['id']}/retomar", headers=sessao)
    _rodar_fila()
    assert "Item bom" in conta_real.publicados


def test_lote_para_quando_a_moderacao_pausa(client, sessao, conta_real):
    ids = [_rascunho(client, sessao, "Anúncio PAUSA"), _rascunho(client, sessao, "Outro anúncio")]
    lote = client.post("/api/lotes", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre"],
                                                           "confirmado": True}).json()
    _rodar_fila()
    fim = client.get(f"/api/lotes/{lote['id']}", headers=sessao).json()
    assert fim["status"] == "interrompido" and "moderação" in fim["motivo"]
    assert conta_real.publicados == ["Anúncio PAUSA"]


def test_limite_diario_por_conta(client, sessao, conta_real, monkeypatch):
    monkeypatch.setattr(config, "LIMITE_DIARIO_POR_CONTA", 2)
    ids = [_rascunho(client, sessao, f"Produto diário {i}") for i in range(4)]
    p = client.post("/api/lotes/previa", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre"]}).json()
    assert p["alertas"] and "só pode publicar mais 2" in p["alertas"][0]
    lote = client.post("/api/lotes", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre"],
                                                           "confirmado": True}).json()
    _rodar_fila()
    fim = client.get(f"/api/lotes/{lote['id']}", headers=sessao).json()
    assert fim["status"] == "interrompido" and "limite de segurança" in fim["motivo"]
    assert len(conta_real.publicados) == 2


def test_lote_so_com_rascunhos_do_cliente_e_so_equipe(client, sessao, empresa_nova):
    outro = empresa_nova("Outra")
    estranho = _rascunho(client, outro, "De outra empresa")
    p = client.post("/api/lotes/previa", headers=sessao, json={"anuncio_ids": [estranho], "plataformas": ["mercadolivre"]}).json()
    assert p["itens"][0]["plataformas"]["mercadolivre"]["situacao"] == "bloqueado"
    assert client.post("/api/lotes", headers=sessao, json={"anuncio_ids": [estranho], "plataformas": ["mercadolivre"]}).status_code == 400


def test_cancelar_lote(client, sessao):
    ids = [_rascunho(client, sessao, f"Cancelável {i}") for i in range(2)]
    lote = client.post("/api/lotes", headers=sessao, json={"anuncio_ids": ids, "plataformas": ["mercadolivre"]}).json()
    assert client.post(f"/api/lotes/{lote['id']}/cancelar", headers=sessao).json()["status"] == "cancelado"
    _rodar_fila()
    assert client.get(f"/api/lotes/{lote['id']}", headers=sessao).json()["contagem"]["pendente"] == 2
