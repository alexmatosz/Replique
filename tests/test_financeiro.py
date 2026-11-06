"""Lucro das vendas: impostos por regime, leitura dos pedidos do ML,
sincronização (demonstração e conta real simulada) e custos por SKU/anúncio."""

from datetime import datetime
from types import SimpleNamespace

import pytest

from backend.services import financeiro, impostos


def _cfg(**kw):
    base = dict(regime="simples", aliquota_simples_pct=6.0, uf_origem="SP", pis_cofins_pct=None, outros_pct=None,
                credito_custo_pct=0.0, importado=False, cobrar_difal=True, icms_excluido_pis_cofins=True,
                aliquotas_uf={}, custo_por="sku", embalagem_padrao=0.0)
    return SimpleNamespace(**{**base, **kw})


def test_simples_e_aliquota_unica():
    imp = impostos.calcular(_cfg(aliquota_simples_pct=8), 100, "BA")
    assert imp.total == 8.0 and imp.aliquota_efetiva == 8.0


def test_presumido_venda_dentro_do_estado():
    imp = impostos.calcular(_cfg(regime="presumido"), 100, "SP")
    assert imp.icms == 18.0 and imp.difal == 0
    assert imp.pis_cofins == pytest.approx((100 - 18) * 3.65 / 100, abs=0.01)
    assert imp.outros == 2.28


def test_real_interestadual_7_por_cento_com_difal():
    imp = impostos.calcular(_cfg(regime="real"), 100, "BA")
    assert imp.icms == 7.0 and imp.difal == 13.5
    assert imp.pis_cofins == pytest.approx(93 * 9.25 / 100, abs=0.01)
    assert imp.outros == 0


def test_interestadual_12_importado_4_e_aliquota_propria():
    assert impostos.interestadual("BA", "SP", False) == 12.0
    assert impostos.interestadual("SP", "RJ", False) == 12.0
    assert impostos.interestadual("SP", "ES", False) == 7.0
    assert impostos.interestadual("SP", "BA", True) == 4.0
    imp = impostos.calcular(_cfg(regime="real", aliquotas_uf={"BA": 22}), 100, "BA")
    assert imp.difal == 15.0


def test_credito_na_compra_reduz_imposto_do_real():
    sem = impostos.calcular(_cfg(regime="real"), 100, "SP", custo=50)
    com = impostos.calcular(_cfg(regime="real", credito_custo_pct=10), 100, "SP", custo=50)
    assert round(sem.total - com.total, 2) == 5.0


def _pedido(pid, itens, envio="E1", pack=None, status="paid", fee_pagamento=None):
    return {"id": pid, "pack_id": pack, "status": status, "date_closed": "2026-09-10T10:00:00.000-03:00",
            "shipping": {"id": envio} if envio else {},
            "payments": [{"status": "approved", "marketplace_fee": fee_pagamento}] if fee_pagamento else [],
            "order_items": [{"item": {"id": i, "title": f"Produto {i}", "seller_sku": sku, "variation_id": None,
                                      "variation_attributes": [{"name": "Cor", "value_name": "Preto"}]},
                             "quantity": q, "unit_price": p, "sale_fee": f} for i, sku, q, p, f in itens]}


def test_comissao_por_unidade_e_confirmacao_pelo_pagamento():
    [linha] = financeiro.linhas_do_pedido(_pedido(1, [("MLB1", "SKU1", 2, 100, 12)]))
    assert linha["total"] == 200 and linha["comissao"] == 24 and linha["variacao"] == "Cor: Preto"
    [linha] = financeiro.linhas_do_pedido(_pedido(1, [("MLB1", "SKU1", 2, 100, 12)], fee_pagamento=12))
    assert linha["comissao"] == 12


def test_situacao_da_reclamacao():
    fechada = lambda reason, **kw: {"status": "closed", "type": kw.get("tipo", "mediations"),
                                    "resolution": {"reason": reason, "benefited": [kw.get("quem", "complainant")],
                                                   "applied_coverage": kw.get("cobertura", False)}}
    assert financeiro.situacao_da_reclamacao({"status": "opened"}) == ("aberta", False)
    assert financeiro.situacao_da_reclamacao(fechada("item_returned")) == ("devolvida", True)
    assert financeiro.situacao_da_reclamacao(fechada("payment_refunded")) == ("reembolsada", False)
    assert financeiro.situacao_da_reclamacao(fechada("payment_refunded", tipo="returns")) == ("devolvida", True)
    assert financeiro.situacao_da_reclamacao(fechada("payment_refunded", cobertura=True))[0] == "coberta"
    assert financeiro.situacao_da_reclamacao(fechada("seller_explained_functions", quem="respondent"))[0] == ""


MES = "2026-09"


def _lucro(client, sessao, mes=MES):
    r = client.get(f"/api/financeiro/lucro?mes={mes}", headers=sessao)
    assert r.status_code == 200, r.text
    return r.json()


class _MLFalso:
    demo = False

    def __init__(self, pedidos, reclamacoes=None, ads=None, anuncios=None, bonus=None):
        self._pedidos, self._reclamacoes, self._ads, self._anuncios = pedidos, reclamacoes or [], ads, anuncios or []
        self._bonus = bonus or {}
        self.envios_lidos = []

    def bonus_do_pedido(self, pedido_id):
        return dict(self._bonus.get(pedido_id, {}))

    def pedidos(self, de, ate):
        return self._pedidos

    def envio(self, envio_id):
        self.envios_lidos.append(envio_id)
        return {"uf": "BA", "logistica": "cross_docking"}

    def custo_envio_vendedor(self, envio_id):
        return 30.0

    def reclamacoes(self, de, ate):
        return self._reclamacoes

    def frete_devolucao(self, pedido_id):
        return 25.0

    def anunciante_ads(self):
        return "999" if self._ads is not None else None

    def gastos_ads(self, anunciante, de, ate):
        return self._ads

    def anuncios_para_catalogo(self):
        return self._anuncios


@pytest.fixture
def ml(monkeypatch):
    """Troca a conta do ML por uma falsa: ml(pedidos=..., reclamacoes=..., ads=...)."""
    def usar(*a, **kw):
        falso = _MLFalso(*a, **kw)
        monkeypatch.setattr(financeiro, "obter_adaptador", lambda *x, **y: (falso, ""))
        return falso
    return usar


def _simples_zero(client, sessao):
    """Sem imposto, para as contas dos testes ficarem redondas."""
    r = client.put("/api/financeiro/config", headers=sessao, json={"regime": "simples", "aliquota_simples_pct": 0})
    assert r.status_code == 200, r.text


def _produto(client, sessao, **corpo):
    r = client.post("/api/financeiro/produtos", headers=sessao, json=corpo)
    assert r.status_code == 200, r.text
    return r.json()


def test_demonstracao_importa_catalogo_e_mostra_o_que_ficou_sem_vinculo(client, sessao):
    assert client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao).json()["demo"]
    antes = _lucro(client, sessao)
    assert antes["totais"]["sem_vinculo"] == antes["totais"]["pedidos"]
    assert any(a["tipo"] == "vinculo" for a in antes["alertas"])
    assert antes["totais"]["ads_total"] > 0 and antes["totais"]["devolucoes"] == 1 and antes["totais"]["reclamacoes_abertas"] == 1

    imp = client.post("/api/financeiro/produtos/importar", headers=sessao).json()
    assert imp["criados"] == 5 and imp["vinculados"] == 1
    cat = client.get("/api/financeiro/produtos", headers=sessao).json()
    assert {p["sku"] for p in cat["produtos"]} == {"GARRAFA-1L", "POTE-VIDRO-3", "LUMI-LED", "MOCHILA-15", ""}
    assert [x["sku"] for x in cat["sem_vinculo"]] in ([], ["CANECA-500"])

    garrafa = next(p for p in cat["produtos"] if p["sku"] == "GARRAFA-1L")
    assert client.put("/api/financeiro/custos", headers=sessao, json={"itens": [
        {"id": garrafa["id"], "custo": 30, "embalagem": 2}]}).json()["alterados"] == 1
    depois = _lucro(client, sessao)
    v = next(x for x in depois["vendas"] if x["sku"] == "GARRAFA-1L" and not x["devolucao"])
    assert v["produto"]["via"] == "sku" and v["custo"] == 30 * v["quantidade"] and v["embalagem"] == 2 * v["quantidade"]
    soma = v["total"] - v["reembolso"] - v["comissao"] - v["frete"] - v["frete_devolucao"] - v["ads"] - v["imposto"] - v["custo"] - v["embalagem"]
    assert v["lucro"] == round(soma, 2)
    assert depois["totais"]["sem_vinculo"] < antes["totais"]["sem_vinculo"]


def test_sku_liga_a_venda_ao_produto_e_sem_sku_fica_sem_vinculo(client, sessao, ml):
    _simples_zero(client, sessao)
    ml([_pedido(1, [("MLB1", "abc-1 ", 2, 100, 10)], envio=""), _pedido(2, [("MLB2", None, 1, 50, 5)], envio="")])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    _produto(client, sessao, nome="Produto ABC", sku="ABC-1", custo=40, embalagem=3)

    r = _lucro(client, sessao)
    com_sku = next(x for x in r["vendas"] if x["item_id"] == "MLB1")
    assert com_sku["produto"]["nome"] == "Produto ABC" and com_sku["produto"]["via"] == "sku"
    assert com_sku["lucro"] == 200 - 20 - 80 - 6 and com_sku["margem"] == 47.0
    sem = next(x for x in r["vendas"] if x["item_id"] == "MLB2")
    assert sem["sem_vinculo"] and sem["custo"] is None and sem["lucro"] == 45.0
    cat = client.get("/api/financeiro/produtos", headers=sessao).json()
    assert [x["item_id"] for x in cat["sem_vinculo"]] == ["MLB2"]
    assert cat["produtos"][0]["anuncios"][0]["via"] == "sku"


def test_custos_extras_e_imposto_do_produto_entram_no_lucro_da_venda(client, sessao, ml):
    _simples_zero(client, sessao)
    ml([_pedido(1, [("MLB1", "ABC-1", 2, 100, 10)], envio="")])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    p = _produto(client, sessao, nome="Produto ABC", sku="ABC-1", custo=40, embalagem=3, imposto_pct=10, preco=99.9,
                 custos_extras=[{"descricao": "Etiqueta", "valor": 1.5}, {"descricao": "Brinde", "valor": 2}])
    assert p["extras_unidade"] == 3.5 and p["preco"] == 99.9 and len(p["custos_extras"]) == 2

    v = _lucro(client, sessao)["vendas"][0]
    assert v["extras"] == 7.0 and v["imposto"] == 20.0 and "produto" in v["imposto_detalhe"]
    assert v["lucro"] == 200 - 20 - 80 - 6 - 7 - 20

    r = client.put(f"/api/financeiro/produtos/{p['id']}", headers=sessao, json={"nome": "Produto ABC", "sku": "ABC-1", "custo": 40, "embalagem": 3})
    assert r.json()["imposto_pct"] == 10 and r.json()["extras_unidade"] == 3.5
    dre = client.get(f"/api/financeiro/dre?mes={MES}&meses=1", headers=sessao).json()
    assert dre["colunas"][-1]["linhas"]["cmv"] == -(80 + 6 + 7)

    r = client.put(f"/api/financeiro/produtos/{p['id']}", headers=sessao, json={"nome": "Produto ABC", "sku": "ABC-1", "custo": 40,
                                                                             "imposto_pct": None, "custos_extras": []})
    v = _lucro(client, sessao)["vendas"][0]
    assert v["extras"] == 0 and v["imposto"] == 0


def _cobranca(detalhe, valor, texto, data="2026-09-15T10:00:00", tipo="CHARGE", pedido=None, origem="geral"):
    return {"charge_info": {"detail_id": detalhe, "detail_amount": valor, "transaction_detail": texto, "detail_type": tipo,
                            "detail_sub_type": "", "creation_date_time": data},
            "sales_info": [{"order_id": pedido}] if pedido else [], "_origem": origem}


def test_tarifas_da_fatura_fora_das_vendas_entram_no_resultado(client, sessao, ml):
    _simples_zero(client, sessao)
    falso = ml([_pedido(1, [("MLB1", "ABC-1", 1, 100, 10)], envio="")])
    chaves = []

    def cobrancas(chave):
        chaves.append(chave)
        if chave != f"{MES}-01":
            return [_cobranca("D9", 4.0, "Tarifa de armazenamento", data="2026-09-30T23:00:00", origem="full")]
        return [_cobranca("D1", 12.5, "Tarifa de armazenamento Full", origem="full"),
                _cobranca("D2", 10.0, "Tarifa de venda", pedido=1),
                _cobranca("D3", 30.0, "Campanha de publicidade - Product Ads"),
                _cobranca("D4", 2.5, "Bonificação", tipo="BONUS"),
                _cobranca("D5", 7.0, "Retirada de estoque", data="2026-08-31T10:00:00"),
                _cobranca("D6", 3.0, "Ajuste sem data", data="")]
    falso.cobrancas_da_fatura = cobrancas
    s = client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao).json()
    assert chaves == [f"{MES}-01", "2026-10-01"]
    assert any("não conferida" in a for a in s["avisos"])

    r = _lucro(client, sessao)
    assert r["totais"]["tarifas_fatura"] == 12.5 - 2.5 + 3.0 + 4.0
    assert {x["descricao"] for x in r["tarifas_fatura"]} == {"Tarifa de armazenamento Full", "Bonificação", "Ajuste sem data",
                                                            "Tarifa de armazenamento"}
    assert r["vendas"][0]["lucro"] == 90 and r["totais"]["lucro"] == 90 - 17.0
    assert any(a["tipo"] == "fatura" for a in r["alertas"])
    dre = client.get(f"/api/financeiro/dre?mes={MES}&meses=1", headers=sessao).json()
    assert dre["colunas"][-1]["linhas"]["tarifas_fatura"] == -17.0
    assert dre["por_canal"]["mercadolivre"]["tarifas_fatura"] == -17.0

    falso.cobrancas_da_fatura = lambda chave: []
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    assert _lucro(client, sessao)["totais"]["tarifas_fatura"] == 0


def test_vincular_anuncio_como_kit_e_desfazer(client, sessao, ml):
    _simples_zero(client, sessao)
    ml([_pedido(1, [("MLB7", None, 1, 90, 9)], envio="")])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    p = _produto(client, sessao, nome="Pote avulso", custo=10)
    r = client.post("/api/financeiro/vinculos", headers=sessao, json={
        "item_id": "MLB7", "todas_variacoes": True, "produto_id": p["id"], "unidades": 3})
    assert r.status_code == 200, r.text
    [v] = _lucro(client, sessao)["vendas"]
    assert v["produto"]["via"] == "vinculo" and v["produto"]["unidades"] == 3 and v["custo"] == 30
    assert client.delete("/api/financeiro/vinculos?item_id=MLB7", headers=sessao).status_code == 200
    assert _lucro(client, sessao)["vendas"][0]["sem_vinculo"]


def test_criar_produto_a_partir_da_venda_sem_sku_ja_vincula(client, sessao, ml):
    _simples_zero(client, sessao)
    ml([_pedido(1, [("MLB8", None, 1, 60, 6)], envio="")])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    _produto(client, sessao, nome="Organizador", custo=20, vincular_item_id="MLB8", vincular_titulo="Produto MLB8")
    [v] = _lucro(client, sessao)["vendas"]
    assert v["produto"]["nome"] == "Organizador" and v["lucro"] == 60 - 6 - 20


def test_sku_repetido_e_recusado(client, sessao):
    _produto(client, sessao, nome="A", sku="X1")
    r = client.post("/api/financeiro/produtos", headers=sessao, json={"nome": "B", "sku": "x1"})
    assert r.status_code == 400 and "já é do produto" in r.json()["detail"]


def _mes_atual():
    from backend.services.financeiro import FUSO_BR
    return datetime.now(FUSO_BR).strftime("%Y-%m")


def test_simular_venda_com_e_sem_produto(client, sessao):
    _simples_zero(client, sessao)
    _produto(client, sessao, nome="Garrafa", sku="GAR", custo=30, embalagem=2)
    r = client.post("/api/financeiro/simular", headers=sessao, json={
        "sku": "GAR", "titulo": "Garrafa 1L", "preco": 100, "quantidade": 1, "uf": "SP",
        "comissao_pct": 16, "taxa_fixa": 0, "frete": 20, "ads": 5})
    assert r.status_code == 200, r.text
    client.post("/api/financeiro/simular", headers=sessao, json={"sku": "NAO-EXISTE", "titulo": "Sem cadastro", "preco": 50})
    res = _lucro(client, sessao, _mes_atual())
    ligada = next(x for x in res["vendas"] if x["sku"] == "GAR")
    assert ligada["simulada"] and ligada["comissao"] == 16 and ligada["ads"] == 5
    assert ligada["lucro"] == 100 - 16 - 20 - 5 - 30 - 2 and ligada["margem"] == 27.0
    assert next(x for x in res["vendas"] if x["sku"] == "NAO-EXISTE")["sem_vinculo"]
    assert any(a["tipo"] == "simulacao" for a in res["alertas"])
    assert client.delete("/api/financeiro/simulacoes", headers=sessao).json()["apagadas"] == 2
    assert _lucro(client, sessao, _mes_atual())["vendas"] == []


def test_ads_rateado_no_dia_e_gasto_sem_venda(client, sessao, ml):
    _simples_zero(client, sessao)
    ml([_pedido(1, [("MLB1", None, 1, 100, 0)], envio=""), _pedido(2, [("MLB1", None, 1, 300, 0)], envio="")],
       ads=[{"data": "2026-09-10", "item_id": "MLB1", "custo": 20, "receita": 400, "unidades": 2},
            {"data": "2026-09-11", "item_id": "MLB1", "custo": 7, "receita": 0, "unidades": 0}])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    r = _lucro(client, sessao)
    ads = {x["pedido_id"]: x["ads"] for x in r["vendas"]}
    assert ads == {"1": 5.0, "2": 15.0}
    t = r["totais"]
    assert t["ads"] == 20 and t["ads_sem_venda"] == 7 and t["ads_total"] == 27
    assert t["lucro"] == 400 - 27 and t["tacos"] == round(27 / 400 * 100, 1)


def test_conta_sem_publicidade_avisa(client, sessao, ml):
    ml([_pedido(1, [("MLB1", None, 1, 100, 0)], envio="")])
    s = client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao).json()
    assert any("Product Ads" in a for a in s["avisos"])


def _reclamacao(pedido, status="closed", reason="item_returned", tipo="returns", cobertura=False):
    r = {"id": 50 + pedido, "resource": "order", "resource_id": pedido, "type": tipo, "status": status}
    if status == "closed":
        r["resolution"] = {"reason": reason, "benefited": ["complainant"], "applied_coverage": cobertura}
    return r


def test_devolucoes_e_reclamacoes(client, sessao, ml):
    _simples_zero(client, sessao)
    _produto(client, sessao, nome="Item", sku="S1", custo=40)
    pedidos = [_pedido(i, [("MLB1", "S1", 1, 100, 10)], envio=f"E{i}") for i in (1, 2, 3, 4)]
    ml(pedidos, reclamacoes=[_reclamacao(1), _reclamacao(2, reason="payment_refunded", tipo="mediations"),
                             _reclamacao(3, cobertura=True), _reclamacao(4, status="opened")])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    r = _lucro(client, sessao)
    v = {x["pedido_id"]: x for x in r["vendas"]}
    assert v["1"]["devolucao"] == "devolvida" and v["1"]["reembolso"] == 100 and v["1"]["comissao"] == 0
    assert v["1"]["custo"] == 0 and v["1"]["frete_devolucao"] == 25 and v["1"]["lucro"] == -55
    assert v["2"]["devolucao"] == "reembolsada" and v["2"]["custo"] == 40 and v["2"]["lucro"] == -70
    assert v["3"]["lucro"] == v["4"]["lucro"] == 100 - 10 - 30 - 40
    assert r["totais"]["devolucoes"] == 2 and r["totais"]["reclamacoes_abertas"] == 1
    assert any(a["tipo"] == "reclamacao" for a in r["alertas"])

    client.put("/api/financeiro/config", headers=sessao, json={"regime": "simples", "aliquota_simples_pct": 0,
                                                              "devolucao_volta_estoque": False})
    assert next(x for x in _lucro(client, sessao)["vendas"] if x["pedido_id"] == "1")["custo"] == 40


def test_carrinho_divide_frete_e_cancelado_sai(client, sessao, ml):
    falso = ml([_pedido(10, [("MLB1", "SKU1", 1, 100, 12)], envio="E1", pack=5),
                _pedido(11, [("MLB2", "SKU2", 1, 50, 6)], envio="E1", pack=5),
                _pedido(12, [("MLB1", "SKU1", 1, 100, 12)], envio="E2")])
    assert client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao).json()["pedidos"] == 3
    r = _lucro(client, sessao)
    assert {x["pedido_id"]: x["frete"] for x in r["vendas"]} == {"10": 20.0, "11": 10.0, "12": 30.0}
    falso._pedidos = falso._pedidos[:2]
    falso.envios_lidos.clear()
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    assert falso.envios_lidos == []
    t = _lucro(client, sessao)["totais"]
    assert t["pedidos"] == 2 and t["canceladas"] == 1 and t["total"] == 150


def test_importar_do_ml_um_produto_por_sku(client, sessao, ml):
    ml([], anuncios=[
        {"item_id": "MLB1", "variacao_id": "11", "variacao": "Cor: Azul", "titulo": "Copo", "sku": "COPO-AZ", "foto": ""},
        {"item_id": "MLB2", "variacao_id": "", "variacao": "", "titulo": "Copo (outro anúncio)", "sku": "copo-az", "foto": ""},
        {"item_id": "MLB3", "variacao_id": "", "variacao": "", "titulo": "Prato", "sku": "", "foto": ""}])
    r = client.post("/api/financeiro/produtos/importar", headers=sessao).json()
    assert (r["criados"], r["vinculados"], r["ja_cadastrados"]) == (2, 1, 1)
    assert client.post("/api/financeiro/produtos/importar", headers=sessao).json()["criados"] == 0


def test_config_lucro_real_exige_estado(client, sessao):
    corpo = {"regime": "real", "uf_origem": ""}
    assert client.put("/api/financeiro/config", headers=sessao, json=corpo).status_code == 400
    r = client.put("/api/financeiro/config", headers=sessao, json={**corpo, "uf_origem": "sp", "aliquotas_uf": {"BA": 22, "SP": 18}})
    assert r.status_code == 200 and r.json()["uf_origem"] == "SP" and r.json()["aliquotas_uf"] == {"BA": 22}


def test_outra_agencia_nao_ve_nem_altera(client, sessao, empresa_nova):
    p = _produto(client, sessao, nome="Secreto", custo=1)
    outra = empresa_nova()
    alheio = {**outra, "X-Cliente": sessao["X-Cliente"]}
    assert client.get(f"/api/financeiro/lucro?mes={MES}", headers=alheio).status_code == 403
    assert client.get("/api/financeiro/produtos", headers=alheio).status_code == 403
    assert client.put(f"/api/financeiro/produtos/{p['id']}", headers=outra, json={"nome": "x"}).status_code == 404
    assert client.put("/api/financeiro/custos", headers=outra, json={"itens": [{"id": p["id"], "custo": 0}]}).status_code == 404


def test_despesas_resultado_do_mes_e_taxa_operacional(client, sessao, ml):
    _simples_zero(client, sessao)
    _produto(client, sessao, nome="Item", sku="S1", custo=40)
    ml([{**_pedido(1, [("MLB1", "S1", 10, 100, 0)], envio=""), "date_closed": "2026-08-10T10:00:00.000-03:00"}])
    client.post("/api/financeiro/sincronizar?mes=2026-08", headers=sessao)
    r = client.post("/api/financeiro/despesas", headers=sessao, json={
        "descricao": "Aluguel", "categoria": "aluguel", "valor": 100, "fixa": True, "mes_inicio": "2026-08"})
    assert r.status_code == 200, r.text
    client.post("/api/financeiro/despesas", headers=sessao, json={
        "descricao": "Conserto", "valor": 50, "fixa": False, "mes_inicio": "2026-09"})

    ml([_pedido(2, [("MLB1", "S1", 2, 100, 0)], envio="")])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    res = _lucro(client, sessao)
    t = res["totais"]
    assert res["taxa_operacional"]["pct"] == 10.0 and res["taxa_operacional"]["meses"] == ["2026-08"]
    assert t["lucro"] == 200 - 80 and t["despesas"] == 150 and t["resultado"] == -30
    assert t["ponto_equilibrio"] == round(150 / (120 / 200), 2)
    [v] = res["vendas"]
    assert v["operacional"] == 20 and v["lucro_final"] == 100

    lista = client.get(f"/api/financeiro/despesas?mes={MES}", headers=sessao).json()
    assert lista["total"] == 150
    aluguel = next(d for d in lista["itens"] if d["descricao"] == "Aluguel")
    assert client.delete(f"/api/financeiro/despesas/{aluguel['id']}?mes={MES}", headers=sessao).json()["acao"] == "encerrada"
    assert client.get(f"/api/financeiro/despesas?mes={MES}", headers=sessao).json()["total"] == 50
    assert client.get("/api/financeiro/despesas?mes=2026-08", headers=sessao).json()["total"] == 100


def test_preco_minimo_usa_o_historico_do_produto(client, sessao, ml):
    _simples_zero(client, sessao)
    _produto(client, sessao, nome="Item", sku="S1", custo=40, embalagem=2)
    ml([_pedido(1, [("MLB1", "S1", 2, 100, 16)], envio="E1")])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    cat = client.get("/api/financeiro/produtos", headers=sessao).json()
    hist = cat["produtos"][0]["historico"]
    assert hist["preco_medio"] == 100 and hist["comissao_pct"] == 16 and hist["frete_unidade"] == 15 and hist["unidades"] == 2
    assert "taxa_operacional" in cat["precificacao"]
