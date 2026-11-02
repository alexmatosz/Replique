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

from backend.banco.models import Cliente, Produto, RegraTributaria, Usuario, Venda
from backend.services import impostos
from backend.services.auditoria import registrar

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


_CHAVES_NCM = ("ncm",)
_CHAVES_ORIGEM = ("origin_detail", "origem", "origin")
_CHAVES_CST = ("csosn", "cst_icms", "icms_cst", "cst")
_CHAVES_CEST = ("cest",)
_CHAVES_ALIQ = {
    "icms_pct": ("icms_rate", "icms_aliquot", "icms_percentage", "aliquota_icms", "icms_aliquota"),
    "pis_pct": ("pis_rate", "pis_aliquot", "pis_percentage", "aliquota_pis", "pis_aliquota"),
    "cofins_pct": ("cofins_rate", "cofins_aliquot", "cofins_percentage", "aliquota_cofins", "cofins_aliquota"),
    "ipi_pct": ("ipi_rate", "ipi_aliquot", "ipi_percentage", "aliquota_ipi", "ipi_aliquota"),
    "fcp_pct": ("fcp_rate", "fcp_aliquot", "fcp_percentage", "aliquota_fcp", "fcp_aliquota"),
}


def _procurar(obj, chaves: tuple[str, ...]):
    """Primeiro valor não vazio de uma das chaves, em qualquer nível do JSON."""
    if isinstance(obj, dict):
        for k in chaves:
            v = obj.get(k)
            if v not in (None, "", [], {}) and not isinstance(v, (dict, list)):
                return v
        for v in obj.values():
            achado = _procurar(v, chaves)
            if achado not in (None, ""):
                return achado
    elif isinstance(obj, list):
        for v in obj:
            achado = _procurar(v, chaves)
            if achado not in (None, ""):
                return achado
    return None


def dados_fiscais_ml(info: dict, regra_ml: dict | None) -> dict:
    """Converte a ficha fiscal do SKU no Faturador do ML (e a regra
    tributária ligada a ela) para os campos da planilha de tributação."""
    saida = {}
    ncm = _procurar(info, _CHAVES_NCM)
    if ncm:
        saida["ncm"] = re.sub(r"\D", "", str(ncm))[:10]
    origem = _procurar(info, _CHAVES_ORIGEM)
    if origem is not None and str(origem).strip().isdigit():
        saida["origem"] = str(origem).strip()[:2]
    cst = _procurar(info, _CHAVES_CST) or (_procurar(regra_ml, _CHAVES_CST) if regra_ml else None)
    if cst:
        saida["cst_icms"] = re.sub(r"\D", "", str(cst))[:4]
    titulo = info.get("title") or info.get("description")
    if titulo:
        saida["descricao"] = str(titulo)[:300]
    if regra_ml:
        for campo, chaves in _CHAVES_ALIQ.items():
            valor = _numero(_procurar(regra_ml, chaves))
            if valor is not None:
                saida[campo] = valor
    return saida


def importar_do_ml(db: Session, cliente: Cliente, usuario: Usuario, skus: list[str] | None = None) -> dict:
    """Busca no Faturador do Mercado Livre a ficha fiscal de cada SKU do
    cliente (produtos cadastrados e SKUs que já venderam). Só preenche campos
    vazios: o que veio da planilha do contador continua valendo."""
    from concurrent.futures import ThreadPoolExecutor
    from urllib.parse import quote

    from backend.marketplaces.registry import obter_adaptador
    ml, aviso = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    if not ml or getattr(ml, "demo", False):
        raise ValueError(aviso or "Conecte a conta do Mercado Livre do cliente em Contas para buscar os dados fiscais.")
    if skus is None:
        skus = {s for (s,) in db.query(Produto.sku).filter(Produto.cliente_id == cliente.id, Produto.sku != "")}
        skus |= {s for (s,) in db.query(Venda.sku).filter(Venda.cliente_id == cliente.id, Venda.sku != "").distinct()}
    skus = sorted({str(s).strip() for s in skus if str(s or "").strip()})[:800]
    if not skus:
        raise ValueError("O cliente ainda não tem SKUs: cadastre os produtos (Produtos e custos) ou sincronize as vendas.")
    from backend.marketplaces.base import ErroMarketplace
    try:
        uid = ml._user_id()
    except ErroMarketplace as e:
        raise ValueError(e.mensagem)
    regras_ml: dict[str, dict] = {}
    offset = 0
    while offset < 1000:
        r = ml._get(f"/users/{uid}/invoices/tax_rules", {"offset": offset, "limit": 50})
        if r.status_code >= 400:
            break
        d = r.json()
        for regra in d.get("results") or []:
            if regra.get("id") is not None:
                regras_ml[str(regra["id"])] = regra
        offset += 50
        if offset >= (d.get("paging") or {}).get("total", 0):
            break

    def ficha(sku):
        r = ml._get(f"/items/fiscal_information/{quote(sku, safe='')}")
        return sku, (r.json() if r.status_code == 200 else None)

    with ThreadPoolExecutor(max_workers=8) as pool:
        fichas = list(pool.map(ficha, skus))
    existentes = {r.sku.upper(): r for r in db.query(RegraTributaria).filter_by(cliente_id=cliente.id)}
    novos = completados = 0
    sem_ficha = []
    for sku, info in fichas:
        if not info:
            sem_ficha.append(sku)
            continue
        regra_id = _procurar(info, ("tax_rule_id", "rule_id"))
        dados = dados_fiscais_ml(info, regras_ml.get(str(regra_id)) if regra_id is not None else None)
        if not dados:
            sem_ficha.append(sku)
            continue
        r = existentes.get(sku.upper())
        if r is None:
            r = RegraTributaria(empresa_id=cliente.empresa_id, cliente_id=cliente.id, sku=sku)
            db.add(r)
            existentes[sku.upper()] = r
            novos += 1
        else:
            completados += 1
        for campo, valor in dados.items():
            if getattr(r, campo) in (None, ""):
                setattr(r, campo, valor)
    registrar(db, cliente.empresa_id, "financeiro",
              f"Buscou os dados fiscais no Faturador do Mercado Livre: {novos} SKU(s) novos, {completados} completados",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return {"consultados": len(skus), "novos": novos, "completados": completados, "sem_ficha": len(sem_ficha),
            "exemplos_sem_ficha": sem_ficha[:8], "regras_ml": len(regras_ml)}
