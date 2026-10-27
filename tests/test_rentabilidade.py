"""Minha lucratividade, Gestão de vendas (curva ABC) e DRE simplificado."""

from datetime import datetime

from app.services import rentabilidade

MES = datetime.now().strftime("%Y-%m")


def _preparar(client, sessao, custo=30):
    assert client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao).json()["demo"]
    client.post("/api/financeiro/produtos/importar", headers=sessao)
    produtos = client.get("/api/financeiro/produtos", headers=sessao).json()["produtos"]
    garrafa = next(p for p in produtos if p["sku"] == "GARRAFA-1L")
    client.put("/api/financeiro/custos", headers=sessao, json={"itens": [{"id": garrafa["id"], "custo": custo, "embalagem": 2}]})
    return garrafa


def test_preco_minimo_e_margem_no_preco():
    canal = {"comissao_pct": 15, "imposto_pct": 5, "ads_pct": 0, "frete_unidade": 10, "taxa_fixa": 0}
    p = rentabilidade.preco_minimo(30, 2, canal, 20)
    assert p == round(42 / 0.6, 2)
    assert rentabilidade.margem_no_preco(p, 30, 2, canal)[1] == 20.0
    assert rentabilidade.preco_minimo(30, 2, {**canal, "comissao_pct": 90}, 20) is None


def test_lucratividade_por_produto_e_plataforma(client, sessao):
    garrafa = _preparar(client, sessao)
    r = client.get("/api/financeiro/lucratividade?margem=20", headers=sessao).json()
    g = next(p for p in r["produtos"] if p["id"] == garrafa["id"])
    ml = g["canais"]["mercadolivre"]
    assert ml["fonte"] == "vendas" and ml["preco_minimo"] and ml["margem"] is not None
    assert g["canais"]["shopee"]["fonte"] == "padrao"
    assert r["sem_custo"] >= 1


def test_dre_fecha_com_o_lucro_e_avisa_custo_faltando(client, sessao):
    _preparar(client, sessao)
    lucro = client.get(f"/api/financeiro/lucro?mes={MES}", headers=sessao).json()["totais"]
    d = client.get(f"/api/financeiro/dre?mes={MES}", headers=sessao).json()
    linhas = d["colunas"][-1]["linhas"]
    assert abs(linhas["margem_contribuicao"] - lucro["lucro"]) <= 0.05
    soma = linhas["receita_bruta"] + linhas["devolucoes"] + linhas["bonus"] + linhas["impostos"]
    assert round(soma, 2) == linhas["receita_liquida"]
    assert linhas["resultado"] == round(linhas["margem_contribuicao"] + linhas["despesas"], 2)
    assert d["colunas"][-1]["incompleto"] and any("custo" in a for a in d["avisos"])
    assert "mercadolivre" in d["por_canal"] and len(d["colunas"]) == 3


def test_gestao_compara_com_mes_anterior_e_classifica_abc(client, sessao):
    _preparar(client, sessao)
    g = client.get(f"/api/financeiro/gestao?mes={MES}", headers=sessao).json()
    assert g["indicadores"]["total"]["atual"] > 0 and g["indicadores"]["total"]["anterior"] is None
    classes = [p["classe"] for p in g["produtos"]]
    assert classes[0] == "A" and classes == sorted(classes)
    assert round(sum(p["participacao"] for p in g["produtos"])) == 100
    assert g["canais"]["mercadolivre"]["pedidos"] > 0


def test_curva_abc_sem_vendas():
    assert rentabilidade.curva_abc([]) == []
