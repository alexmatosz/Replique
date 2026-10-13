"""Planilha de tributação do cliente (Lucro Real e Presumido).

O cliente exporta do sistema onde emite a nota (Bling, Tiny, Omie, contador...)
a planilha de produtos com os dados fiscais e importa aqui. Cada ERP chama as
colunas de um jeito, então o cabeçalho é reconhecido por sinônimos e a tela
deixa corrigir o mapeamento antes de gravar. Uma linha por SKU; quem não tem
SKU fica de fora (a venda do marketplace chega ao produto pelo SKU).
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata

from sqlalchemy.orm import Session

from app.models import Cliente, Produto, RegraTributaria, Usuario, Venda
from app.services import impostos
from app.services.auditoria import registrar

CAMPOS = {
    "sku": ("SKU", ["sku", "codigo", "codigosku", "codigoproduto", "codigodoproduto", "codproduto", "cod", "referencia",
                    "codigointerno", "skuproduto", "codigosku"]),
    "descricao": ("Descrição", ["descricao", "produto", "nome", "descricaoproduto", "nomeproduto", "descricaodoproduto"]),
    "ncm": ("NCM", ["ncm", "classificacaofiscal", "codigoncm"]),
    "origem": ("Origem", ["origem", "origemmercadoria", "origemdamercadoria", "origemproduto", "orig"]),
    "cst_icms": ("CST/CSOSN do ICMS", ["csticms", "cst", "csosn", "cstcsosn", "situacaotributaria", "sticms", "cstdoicms",
                                       "situacaotributariaicms"]),
    "icms_pct": ("Alíquota de ICMS (%)", ["icms", "aliquotaicms", "icmspct", "picms", "aliqicms", "aliquotadeicms", "icmsinterno",
                                          "aliquotaicmsinterna"]),
    "icms_st": ("Tem ICMS ST", ["st", "icmsst", "substituicaotributaria", "temst", "possuist", "sujeitoast"]),
    "fcp_pct": ("FCP (%)", ["fcp", "fcpdestino", "pfcp", "aliquotafcp", "fundodecombateapobreza"]),
    "ipi_pct": ("IPI (%)", ["ipi", "aliquotaipi", "pipi", "aliqipi", "aliquotadeipi"]),
    "pis_pct": ("PIS (%)", ["pis", "aliquotapis", "ppis", "aliqpis", "aliquotadepis"]),
    "cofins_pct": ("COFINS (%)", ["cofins", "aliquotacofins", "pcofins", "aliqcofins", "aliquotadecofins"]),
    "credito_icms_pct": ("Crédito de ICMS na compra (%)", ["creditoicms", "creditodeicms", "icmscredito", "creditoicmscompra"]),
    "credito_pis_cofins_pct": ("Crédito de PIS/COFINS na compra (%)", ["creditopiscofins", "creditopis", "creditodepiscofins",
                                                                       "piscofinscredito"]),
}
NUMERICOS = {"icms_pct", "fcp_pct", "ipi_pct", "pis_pct", "cofins_pct", "credito_icms_pct", "credito_pis_cofins_pct"}
MAX_LINHAS = 20_000
_SIM = {"sim", "s", "x", "1", "true", "verdadeiro", "yes", "y"}


def _chave(texto) -> str:
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", t)


def _uf_da_coluna(cabecalho: str) -> str | None:
    k = _chave(cabecalho)
    m = re.fullmatch(r"(?:icms|aliquota|aliq|aliquotaicms|icmsdestino|interna)?([a-z]{2})", k)
    uf = m.group(1).upper() if m else None
    return uf if uf in impostos.ALIQUOTA_INTERNA else None


def mapear(cabecalho: list[str]) -> dict:
    """{campo: índice da coluna} e {UF: índice} reconhecidos pelo nome."""
    mapa, ufs = {}, {}
    for i, nome in enumerate(cabecalho):
        k = _chave(nome)
        if not k:
            continue
        uf = _uf_da_coluna(nome)
        if uf and k not in ("st", "cst"):
            ufs.setdefault(uf, i)
            continue
        for campo, (_, sinonimos) in CAMPOS.items():
            if campo not in mapa and k in sinonimos:
                mapa[campo] = i
                break
    return {"campos": mapa, "ufs": ufs}


def _tabela_csv(conteudo: bytes) -> list[list]:
    for cod in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            texto = conteudo.decode(cod)
            break
        except UnicodeDecodeError:
            continue
    amostra = texto[:5000]
    try:
        dialeto = csv.Sniffer().sniff(amostra, delimiters=";,\t|")
        separador = dialeto.delimiter
    except csv.Error:
        separador = ";" if amostra.count(";") >= amostra.count(",") else ","
    return [linha for linha in csv.reader(io.StringIO(texto), delimiter=separador)]


def _tabela_xlsx(conteudo: bytes) -> list[list]:
    from openpyxl import load_workbook
    try:
        livro = load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    except Exception as e:
        raise ValueError("Não consegui abrir a planilha. Salve como .xlsx ou .csv e tente de novo.") from e
    folha = livro.worksheets[0]
    linhas = []
    for row in folha.iter_rows():
        valores = []
        for c in row:
            v = c.value
            if isinstance(v, (int, float)) and "%" in (c.number_format or ""):
                v = round(v * 100, 4)
            valores.append(v)
        linhas.append(valores)
        if len(linhas) > MAX_LINHAS + 20:
            break
    livro.close()
    return linhas


def ler_tabela(nome: str, conteudo: bytes) -> list[list]:
    nome = (nome or "").lower()
    if nome.endswith(".xls"):
        raise ValueError("Arquivo .xls antigo: abra no Excel e salve como .xlsx ou .csv.")
    if nome.endswith((".xlsx", ".xlsm")) or conteudo[:2] == b"PK":
        return _tabela_xlsx(conteudo)
    return _tabela_csv(conteudo)


def _achar_cabecalho(linhas: list[list]) -> int:
    melhor, indice = 0, 0
    for i, linha in enumerate(linhas[:15]):
        m = mapear([str(c or "") for c in linha])
        pontos = len(m["campos"]) + len(m["ufs"]) + (3 if "sku" in m["campos"] else 0)
        if pontos > melhor:
            melhor, indice = pontos, i
    return indice


def _numero(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).strip().replace("%", "").replace(" ", "")
    if not t or t in ("-", "—"):
        return None
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        n = float(t)
    except ValueError:
        return None
    return n if 0 <= n <= 100 else None


def _texto(v, limite: int) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()[:limite]


def _linha(valores: list, mapa: dict) -> dict:
    def valor(campo):
        i = mapa["campos"].get(campo)
        return valores[i] if i is not None and i < len(valores) else None

    r = {"sku": _texto(valor("sku"), 80), "descricao": _texto(valor("descricao"), 300),
         "ncm": re.sub(r"\D", "", _texto(valor("ncm"), 20))[:10],
         "origem": (re.findall(r"\d", _texto(valor("origem"), 40)) or [""])[0],
         "cst_icms": re.sub(r"\D", "", _texto(valor("cst_icms"), 10))[-3:],
         "icms_st": _chave(valor("icms_st")) in _SIM}
    for campo in NUMERICOS:
        r[campo] = _numero(valor(campo))
    r["aliquotas_uf"] = {uf: n for uf, i in mapa["ufs"].items()
                         if i < len(valores) and (n := _numero(valores[i])) is not None}
    return r


def analisar(nome: str, conteudo: bytes, mapa: dict | None = None) -> dict:
    linhas = ler_tabela(nome, conteudo)
    linhas = [l for l in linhas if any(str(c or "").strip() for c in l)]
    if not linhas:
        raise ValueError("A planilha está vazia.")
    topo = _achar_cabecalho(linhas)
    cabecalho = [_texto(c, 80) for c in linhas[topo]]
    detectado = mapear(cabecalho)
    if mapa:
        detectado = {"campos": {k: int(v) for k, v in (mapa.get("campos") or {}).items()
                                if k in CAMPOS and v not in (None, "") and 0 <= int(v) < len(cabecalho)},
                     "ufs": {k.upper(): int(v) for k, v in (mapa.get("ufs") or {}).items()
                             if k.upper() in impostos.ALIQUOTA_INTERNA and 0 <= int(v) < len(cabecalho)}}
    corpo = linhas[topo + 1:]
    if len(corpo) > MAX_LINHAS:
        raise ValueError(f"A planilha tem mais de {MAX_LINHAS} linhas. Divida em partes.")
    regras, sem_sku, repetidos = {}, 0, 0
    for valores in corpo:
        r = _linha(valores, detectado)
        if not r["sku"]:
            sem_sku += 1
            continue
        chave = r["sku"].upper()
        if chave in regras:
            repetidos += 1
        regras[chave] = r
    avisos = []
    if "sku" not in detectado["campos"]:
        avisos.append("Não achei a coluna do SKU. Escolha abaixo qual coluna tem o código do produto.")
    tributos = {"icms_pct", "pis_pct", "cofins_pct", "cst_icms", "icms_st"} & set(detectado["campos"])
    if not tributos and not detectado["ufs"]:
        avisos.append("Não achei nenhuma coluna de imposto (ICMS, PIS, COFINS, CST). Confira o mapeamento.")
    if sem_sku:
        avisos.append(f"{sem_sku} linha(s) sem SKU ficam de fora.")
    if repetidos:
        avisos.append(f"{repetidos} SKU(s) repetidos: vale a última linha de cada.")
    return {"cabecalho": cabecalho, "mapa": detectado, "regras": list(regras.values()), "avisos": avisos,
            "campos": {k: n for k, (n, _) in CAMPOS.items()}}


def previa(db: Session, cliente: Cliente, nome: str, conteudo: bytes, mapa: dict | None = None) -> dict:
    a = analisar(nome, conteudo, mapa)
    skus = {r["sku"].upper() for r in a["regras"]}
    conhecidos = ({(p.sku or "").strip().upper() for p in db.query(Produto.sku).filter(Produto.cliente_id == cliente.id)}
                  | {(v.sku or "").strip().upper() for v in db.query(Venda.sku).filter(Venda.cliente_id == cliente.id).distinct()})
    conhecidos.discard("")
    return {**{k: a[k] for k in ("cabecalho", "mapa", "avisos", "campos")}, "total": len(a["regras"]),
            "amostra": a["regras"][:8], "casam": len(skus & conhecidos), "skus_loja": len(conhecidos),
            "faltam": sorted(conhecidos - skus)[:20], "faltam_total": len(conhecidos - skus)}


def importar(db: Session, cliente: Cliente, nome: str, conteudo: bytes, mapa: dict | None, substituir: bool,
             usuario: Usuario) -> dict:
    a = analisar(nome, conteudo, mapa)
    if "sku" not in a["mapa"]["campos"]:
        raise ValueError("Escolha a coluna do SKU antes de importar.")
    if not a["regras"]:
        raise ValueError("Nenhuma linha com SKU para importar.")
    existentes = {r.sku.upper(): r for r in db.query(RegraTributaria).filter_by(cliente_id=cliente.id)}
    novos = atualizados = 0
    for chave, dados in ((r["sku"].upper(), r) for r in a["regras"]):
        r = existentes.pop(chave, None)
        if r:
            atualizados += 1
        else:
            r = RegraTributaria(empresa_id=cliente.empresa_id, cliente_id=cliente.id, sku=dados["sku"])
            db.add(r)
            novos += 1
        for campo, valor in dados.items():
            setattr(r, campo, valor)
    removidos = 0
    if substituir:
        for r in existentes.values():
            db.delete(r)
            removidos += 1
    registrar(db, cliente.empresa_id, "financeiro",
              f"Importou a planilha de tributação “{nome}”: {novos} SKU(s) novos, {atualizados} atualizados"
              + (f", {removidos} removidos" if removidos else ""), cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return {"novos": novos, "atualizados": atualizados, "removidos": removidos, "avisos": a["avisos"]}


def regra_dict(r: RegraTributaria) -> dict:
    return {c: getattr(r, c) for c in ("id", "sku", "descricao", "ncm", "origem", "cst_icms", "icms_pct", "icms_st", "fcp_pct",
                                       "ipi_pct", "pis_pct", "cofins_pct", "credito_icms_pct", "credito_pis_cofins_pct",
                                       "aliquotas_uf", "importado_em")}


def listar(db: Session, cliente: Cliente) -> dict:
    regras = db.query(RegraTributaria).filter_by(cliente_id=cliente.id).order_by(RegraTributaria.sku).all()
    return {"total": len(regras), "regras": [regra_dict(r) for r in regras],
            "importado_em": max((r.importado_em for r in regras), default=None),
            "campos": {k: n for k, (n, _) in CAMPOS.items()}}


def apagar(db: Session, cliente: Cliente, usuario: Usuario, regra_id: int | None = None) -> int:
    q = db.query(RegraTributaria).filter_by(cliente_id=cliente.id)
    if regra_id:
        q = q.filter_by(id=regra_id)
    n = q.delete()
    registrar(db, cliente.empresa_id, "financeiro",
              "Apagou a planilha de tributação" if not regra_id else "Apagou uma regra da planilha de tributação",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return n


def modelo_csv() -> bytes:
    cab = ["SKU", "Descrição", "NCM", "Origem", "CST ICMS", "Alíquota ICMS (%)", "ICMS ST", "FCP (%)", "IPI (%)",
           "PIS (%)", "COFINS (%)", "Crédito ICMS (%)", "Crédito PIS/COFINS (%)", "ICMS SP", "ICMS RJ", "ICMS MG"]
    exemplos = [
        ["GAR-INOX-1L", "Garrafa térmica inox 1 litro", "96170010", "0", "00", "18", "não", "", "0", "1,65", "7,6", "12", "9,25", "", "", ""],
        ["FONE-BT-01", "Fone bluetooth importado", "85183000", "1", "00", "18", "não", "2", "0", "1,65", "7,6", "4", "9,25", "18", "22", "18"],
        ["KIT-POTES-5", "Kit potes herméticos", "39241000", "0", "60", "", "sim", "", "", "1,65", "7,6", "", "9,25", "", "", ""],
    ]
    saida = io.StringIO()
    w = csv.writer(saida, delimiter=";")
    w.writerow(cab)
    w.writerows(exemplos)
    return ("﻿" + saida.getvalue()).encode("utf-8")
