"""Planilha de tributação (Lucro Real e Presumido): leitura, importação e uso no imposto da venda."""

import io
from types import SimpleNamespace

from openpyxl import Workbook

from app.services import financeiro, impostos, tributacao


def _cfg(**kw):
    base = dict(regime="real", aliquota_simples_pct=6.0, uf_origem="SP", pis_cofins_pct=None, outros_pct=None,
                credito_custo_pct=0.0, importado=False, cobrar_difal=True, icms_excluido_pis_cofins=False,
                aliquotas_uf={}, custo_por="sku", embalagem_padrao=0.0)
    return SimpleNamespace(**{**base, **kw})


def _regra(**kw):
    base = dict(sku="X", origem="", cst_icms="", icms_pct=None, icms_st=False, fcp_pct=None, ipi_pct=None, pis_pct=None,
                cofins_pct=None, credito_icms_pct=None, credito_pis_cofins_pct=None, aliquotas_uf={})
    return SimpleNamespace(**{**base, **kw})


def test_regra_do_sku_manda_no_imposto():
    cfg = _cfg()
    geral = impostos.calcular(cfg, 100, "SP")
    assert geral.icms == 18 and geral.pis_cofins == 9.25
    r = impostos.calcular(cfg, 100, "SP", regra=_regra(icms_pct=12, pis_pct=0, cofins_pct=0, ipi_pct=5))
    assert r.icms == 12 and r.pis_cofins == 0 and r.ipi == 5 and r.total == 17 and "planilha" in r.detalhe
    st = impostos.calcular(cfg, 100, "SP", regra=_regra(cst_icms="60"))
    assert st.icms == 0 and "ST" in st.detalhe
    isento = impostos.calcular(cfg, 100, "BA", regra=_regra(cst_icms="40"))
    assert isento.icms == 0 and isento.difal == 0
    importado = impostos.calcular(cfg, 100, "BA", regra=_regra(origem="1"))
    assert importado.icms == 4 and importado.difal == 20.5 - 4
    destino = impostos.calcular(cfg, 100, "RJ", regra=_regra(aliquotas_uf={"RJ": 20}, fcp_pct=2))
    assert destino.icms == 12 and destino.difal == 20 + 2 - 12
    cred = impostos.calcular(cfg, 100, "SP", custo=50, regra=_regra(credito_icms_pct=12, credito_pis_cofins_pct=9.25))
    assert cred.credito == round(50 * 21.25 / 100, 2)


def test_le_csv_com_nomes_de_coluna_de_erp():
    csv = ("Código (SKU);Descrição;NCM;Origem da mercadoria;CST/CSOSN;Alíquota ICMS;Substituição tributária;"
           "Alíquota PIS;Alíquota COFINS;ICMS RJ\n"
           "GAR-1;Garrafa;9617.00.10;0 - Nacional;000;18,00%;não;1,65;7,6;22\n"
           ";sem sku;;;;;;;;\n"
           "POTE-5;Potes;3924.10.00;0;060;;Sim;1,65;7,6;\n").encode("cp1252")
    a = tributacao.analisar("produtos.csv", csv)
    assert {"sku", "ncm", "origem", "cst_icms", "icms_pct", "icms_st", "pis_pct", "cofins_pct"} <= set(a["mapa"]["campos"])
    assert a["mapa"]["ufs"] == {"RJ": 9}
    g, p = a["regras"]
    assert g["sku"] == "GAR-1" and g["ncm"] == "96170010" and g["origem"] == "0" and g["cst_icms"] == "000"
    assert g["icms_pct"] == 18 and g["aliquotas_uf"] == {"RJ": 22} and not g["icms_st"]
    assert p["icms_st"] and p["cst_icms"] == "060" and p["icms_pct"] is None
    assert any("sem SKU" in x for x in a["avisos"])


def test_le_xlsx_com_porcentagem_formatada():
    wb = Workbook()
    ws = wb.active
    ws.append(["Relatório de produtos"])
    ws.append(["SKU", "ICMS", "PIS", "COFINS"])
    ws.append(["A1", 0.18, 0.0165, 0.076])
    for c in ws[3][1:]:
        c.number_format = "0.00%"
    buf = io.BytesIO()
    wb.save(buf)
    [r] = tributacao.analisar("p.xlsx", buf.getvalue())["regras"]
    assert r["sku"] == "A1" and r["icms_pct"] == 18 and r["pis_pct"] == 1.65 and r["cofins_pct"] == 7.6


def test_importa_planilha_e_venda_usa_a_regra(client, sessao):
    client.put("/api/financeiro/config", headers=sessao, json={"regime": "real", "uf_origem": "SP"})
    modelo = client.get("/api/financeiro/tributacao/modelo.csv", headers=sessao)
    assert modelo.status_code == 200 and "SKU;" in modelo.content.decode("utf-8-sig")
    arquivo = "SKU;ICMS;PIS;COFINS\nGAR;12;0;0\n".encode()
    r = client.post("/api/financeiro/tributacao/previa", headers=sessao, files={"arquivo": ("t.csv", arquivo, "text/csv")})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1 and r.json()["mapa"]["campos"]["sku"] == 0
    r = client.post("/api/financeiro/tributacao/importar", headers=sessao, files={"arquivo": ("t.csv", arquivo, "text/csv")},
                    data={"substituir": "true"})
    assert r.status_code == 200 and r.json()["novos"] == 1
    client.post("/api/financeiro/simular", headers=sessao, json={"sku": "GAR", "titulo": "Garrafa", "preco": 100, "uf": "SP"})
    client.post("/api/financeiro/simular", headers=sessao, json={"sku": "OUTRO", "titulo": "Outro", "preco": 100, "uf": "SP"})
    mes = __import__("datetime").datetime.now(financeiro.FUSO_BR).strftime("%Y-%m")
    res = client.get(f"/api/financeiro/lucro?mes={mes}", headers=sessao).json()
    gar = next(x for x in res["vendas"] if x["sku"] == "GAR")
    outro = next(x for x in res["vendas"] if x["sku"] == "OUTRO")
    assert gar["imposto"] == 12 and not gar["sem_regra_fiscal"]
    assert outro["sem_regra_fiscal"] and outro["imposto"] > 12
    assert any(a["tipo"] == "tributacao" for a in res["alertas"])
    assert client.delete("/api/financeiro/tributacao", headers=sessao).json()["apagadas"] == 1
