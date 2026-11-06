"""Minha lucratividade, Gestão de vendas e DRE simplificado.

Tudo sai do mesmo cálculo de Vendas por pedido (financeiro.resumo e
financeiro._calcular_periodo): os números batem entre as telas. Onde falta
custo cadastrado, o resultado é marcado como incompleto em vez de mostrar
um lucro maior do que o real.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend import config
from backend.marketplaces.base import PLATAFORMAS
from backend.banco.models import Cliente, LeituraAutomatica
from backend.services import analista, financeiro, impostos

DIAS_LUCRATIVIDADE = 90
MARGEM_ALVO_PADRAO = 15.0
LIMITE_A, LIMITE_B = 80.0, 95.0


def _padrao(plataforma: str, imposto_pct: float) -> dict:
    comissao = {"mercadolivre": config.ML_COMISSAO_PCT_PADRAO, "shopee": config.SHOPEE_COMISSAO_PCT,
                "amazon": config.AMAZON_COMISSAO_PCT}[plataforma]
    return {"fonte": "padrao", "comissao_pct": comissao, "imposto_pct": imposto_pct, "ads_pct": 0.0, "frete_unidade": 0.0,
            "taxa_fixa": config.SHOPEE_TAXA_FIXA if plataforma == "shopee" else 0.0, "unidades": 0, "preco_medio": None}


def custos_ml_da_leitura(db: Session, cliente_id: int) -> dict[int, dict]:
    """Comissão, taxa fixa e frete que a Central de promoções leu no ML para cada produto (pelo anúncio dele)."""
    l = db.query(LeituraAutomatica).filter_by(tarefa="promocoes", cliente_id=cliente_id, chave="").first()
    saida: dict[int, dict] = {}
    for it in ((l.dados or {}).get("itens") or []) if l else []:
        c = it.get("custos_ml")
        if it.get("produto_id") and c and c.get("fonte") == "mercado_livre":
            saida.setdefault(it["produto_id"], c)
    return saida


def preco_minimo(custo: float, embalagem: float, canal: dict, margem_pct: float) -> float | None:
    """Preço em que sobra `margem_pct` do preço depois de tarifa, imposto, Ads, frete, custo e embalagem."""
    pct = (canal["comissao_pct"] + canal["imposto_pct"] + canal["ads_pct"] + margem_pct) / 100
    if pct >= 1:
        return None
    return round((custo + embalagem + canal["frete_unidade"] + canal["taxa_fixa"]) / (1 - pct), 2)


def margem_no_preco(preco: float, custo: float, embalagem: float, canal: dict) -> tuple[float, float]:
    """(lucro por unidade, margem %) vendendo a `preco`."""
    lucro = preco * (1 - (canal["comissao_pct"] + canal["imposto_pct"] + canal["ads_pct"]) / 100) \
        - canal["frete_unidade"] - canal["taxa_fixa"] - custo - embalagem
    return round(lucro, 2), round(lucro / preco * 100, 1) if preco else 0.0


def lucratividade(db: Session, cliente: Cliente, margem_alvo: float = MARGEM_ALVO_PADRAO) -> dict:
    cfg = financeiro.config_de(db, cliente)
    cat = financeiro.Catalogo(db, cliente.id)
    imposto_pct = impostos.calcular(cfg, 100.0, cfg.uf_origem).total
    fim = datetime.now(financeiro.FUSO_BR)
    linhas, _, _ = financeiro._calcular_periodo(db, cliente, cfg, cat, fim - timedelta(days=DIAS_LUCRATIVIDADE), fim)
    soma: dict[tuple, dict] = defaultdict(lambda: defaultdict(float))
    for x in linhas:
        if not x["valida"] or not x["produto"] or x["simulada"]:
            continue
        s = soma[(x["produto"]["id"], x["plataforma"])]
        s["unidades"] += x["quantidade"] * x["produto"]["unidades"]
        s["receita"] += x["total"] - x["reembolso"]
        s["comissao"] += x["comissao"]
        s["imposto"] += x["imposto"]
        s["ads"] += x["ads"]
        s["frete"] += x["frete"] + x["frete_devolucao"]
        s["lucro"] += x["lucro"]
    embalagem_padrao = cfg.embalagem_padrao or 0
    do_ml = custos_ml_da_leitura(db, cliente.id)
    produtos = []
    for p in cat.produtos.values():
        embalagem = (p.embalagem if p.embalagem is not None else embalagem_padrao) + financeiro.extras_por_unidade(p)
        canais = {}
        for plat in PLATAFORMAS:
            s = soma.get((p.id, plat))
            if s and s["unidades"] and s["receita"] > 0:
                canal = {"fonte": "vendas", "unidades": int(s["unidades"]), "preco_medio": round(s["receita"] / s["unidades"], 2),
                         "comissao_pct": round(s["comissao"] / s["receita"] * 100, 2), "imposto_pct": round(s["imposto"] / s["receita"] * 100, 2),
                         "ads_pct": round(s["ads"] / s["receita"] * 100, 2), "frete_unidade": round(s["frete"] / s["unidades"], 2), "taxa_fixa": 0.0}
            else:
                canal = _padrao(plat, p.imposto_pct if p.imposto_pct is not None else imposto_pct)
                c = do_ml.get(p.id) if plat == "mercadolivre" else None
                if c:
                    canal.update({"fonte": "mercado_livre", "comissao_pct": c["comissao_pct"], "taxa_fixa": c["taxa_fixa"],
                                  "frete_unidade": c["frete"] if c.get("frete_fonte") == "mercado_livre" else 0.0,
                                  "preco_medio": c.get("preco")})
            if p.custo is not None:
                canal["preco_minimo"] = preco_minimo(p.custo, embalagem, canal, margem_alvo)
                canal["preco_equilibrio"] = preco_minimo(p.custo, embalagem, canal, 0)
                if canal["preco_medio"]:
                    canal["lucro_unidade"], canal["margem"] = margem_no_preco(canal["preco_medio"], p.custo, embalagem, canal)
            canais[plat] = canal
        margens = [c["margem"] for c in canais.values() if c.get("margem") is not None]
        produtos.append({"id": p.id, "nome": p.nome, "sku": p.sku, "custo": p.custo, "embalagem": embalagem,
                         "unidades": sum(c["unidades"] for c in canais.values()), "canais": canais,
                         "margem_media": round(sum(margens) / len(margens), 1) if margens else None,
                         "prejuizo": any(m < 0 for m in margens)})
    produtos.sort(key=lambda x: (x["custo"] is None, x["margem_media"] if x["margem_media"] is not None else 999, x["nome"].lower()))
    return {"margem_alvo": margem_alvo, "dias": DIAS_LUCRATIVIDADE, "produtos": produtos, "imposto_padrao_pct": imposto_pct,
            "sem_custo": sum(1 for x in produtos if x["custo"] is None), "com_prejuizo": sum(1 for x in produtos if x["prejuizo"]),
            "regime": cfg.regime}


def _variacao(atual: float | None, anterior: float | None) -> float | None:
    if atual is None or not anterior:
        return None
    return round((atual - anterior) / abs(anterior) * 100, 1)


def curva_abc(por_produto: list[dict]) -> list[dict]:
    total = sum(p["total"] for p in por_produto) or 0
    acumulado, saida = 0.0, []
    for p in sorted(por_produto, key=lambda x: -x["total"]):
        acumulado += p["total"]
        pct = acumulado / total * 100 if total else 0
        saida.append({**p, "participacao": round(p["total"] / total * 100, 1) if total else 0, "acumulado": round(pct, 1),
                      "classe": "A" if pct - (p["total"] / total * 100 if total else 0) < LIMITE_A else "B"
                      if pct - (p["total"] / total * 100 if total else 0) < LIMITE_B else "C"})
    return saida


def _por_canal(r: dict) -> dict:
    canais: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    pedidos: dict[str, set] = defaultdict(set)
    for x in r["vendas"]:
        if not x["valida"]:
            continue
        c = canais[x["plataforma"]]
        for k in ("total", "comissao", "frete", "ads", "imposto", "lucro"):
            c[k] += x[k] or 0
        c["custo"] += (x["custo"] or 0) + x["embalagem"] + x.get("extras", 0)
        pedidos[x["plataforma"]].add(x["pedido_id"])
    saida = {}
    for k, c in canais.items():
        n = len(pedidos[k])
        saida[k] = {**{kk: round(v, 2) for kk, v in c.items()}, "pedidos": n, "ticket_medio": round(c["total"] / n, 2) if n else 0,
                    "margem": round(c["lucro"] / c["total"] * 100, 1) if c["total"] else 0.0}
    return saida


def gestao(db: Session, cliente: Cliente, mes: str) -> dict:
    atual = financeiro.resumo(db, cliente, mes)
    mes_ant = financeiro._mes_vizinho(mes, -1)
    anterior = financeiro.resumo(db, cliente, mes_ant)
    t, ta = atual["totais"], anterior["totais"]
    campos = ("total", "pedidos", "ticket_medio", "lucro", "margem", "comissao", "frete", "ads_total", "imposto", "custo")
    indicadores = {k: {"atual": t.get(k), "anterior": ta.get(k) if ta.get("pedidos") else None,
                       "variacao": _variacao(t.get(k), ta.get(k)) if ta.get("pedidos") else None} for k in campos}
    canais, canais_ant = _por_canal(atual), _por_canal(anterior)
    for k, c in canais.items():
        c["variacao_total"] = _variacao(c["total"], canais_ant.get(k, {}).get("total"))
    try:
        achados = analista.achados(atual, anterior)[:6]
    except Exception:
        achados = []
    return {"mes": mes, "mes_anterior": mes_ant, "indicadores": indicadores, "canais": canais,
            "produtos": curva_abc(atual["por_produto"]), "achados": achados, "alertas": atual["alertas"],
            "incompleto": bool(t.get("sem_custo") or t.get("sem_vinculo")), "sem_custo": t.get("sem_custo", 0),
            "sem_vinculo": t.get("sem_vinculo", 0), "sincronizacoes": atual.get("sincronizacoes", {}),
            "simuladas": t.get("simuladas", 0)}


ORIGEM_DRE = {
    "receita_bruta": "Soma dos pedidos pagos do mês (Vendas por pedido)",
    "devolucoes": "Reembolsos de devoluções e reclamações informados pelo marketplace",
    "bonus": "Bônus e descontos bancados pelo marketplace",
    "impostos": "Imposto calculado com o regime configurado em Impostos",
    "receita_liquida": "Receita bruta − devoluções + bônus − impostos",
    "cmv": "Custo dos produtos (Produtos e custos) + embalagem + custos extras do produto",
    "tarifas": "Tarifas e comissões cobradas pelo marketplace em cada venda",
    "frete": "Frete pago pelo vendedor, incluindo frete de devolução",
    "ads": "Publicidade (Mercado Livre Ads), inclusive a que não gerou venda",
    "tarifas_fatura": "Cobranças da fatura do ML fora das vendas (armazenagem do Full e outras). Leitura ainda não conferida com conta real",
    "margem_contribuicao": "Receita líquida − custo dos produtos − tarifas − frete − Ads − tarifas da fatura",
    "despesas": "Custo operacional cadastrado para o mês",
    "resultado": "Margem de contribuição − despesas operacionais",
}


def _linhas_dre(total: float, reembolso: float, bonus: float, imposto: float, custo: float, tarifas: float, frete: float,
                ads: float, despesas: float | None, fatura: float = 0.0) -> dict:
    receita_liquida = total - reembolso + bonus - imposto
    margem = receita_liquida - custo - tarifas - frete - ads - fatura
    saida = {"receita_bruta": total, "devolucoes": -reembolso, "bonus": bonus, "impostos": -imposto,
             "receita_liquida": receita_liquida, "cmv": -custo, "tarifas": -tarifas, "frete": -frete, "ads": -ads,
             "tarifas_fatura": -fatura, "margem_contribuicao": margem}
    if despesas is not None:
        saida.update({"despesas": -despesas, "resultado": margem - despesas})
    saida = {k: round(v, 2) for k, v in saida.items()}
    base = saida["receita_liquida"]
    saida["margem_liquida"] = round(saida.get("resultado", margem) / base * 100, 1) if base else None
    return saida


def _dre_do_resumo(r: dict) -> dict:
    t = r["totais"]
    return _linhas_dre(t["total"], t["reembolso"], t["bonus_ml"], t["imposto"], t["custo"] + t["embalagem"] + t.get("extras", 0), t["comissao"],
                       t["frete"] + t["frete_devolucao"], t["ads_total"], t["despesas"], t.get("tarifas_fatura", 0))


def dre(db: Session, cliente: Cliente, mes: str, meses: int = 3) -> dict:
    lista = [financeiro._mes_vizinho(mes, -i) for i in range(meses - 1, -1, -1)]
    colunas = []
    atual = None
    for m in lista:
        r = financeiro.resumo(db, cliente, m)
        t = r["totais"]
        colunas.append({"mes": m, "linhas": _dre_do_resumo(r), "pedidos": t["pedidos"],
                        "incompleto": bool(t["sem_custo"] or t["sem_vinculo"]), "sem_custo": t["sem_custo"],
                        "sem_vinculo": t["sem_vinculo"], "frete_pendente": t["frete_pendente"],
                        "sincronizado": bool(r.get("sincronizacoes"))})
        if m == mes:
            atual = r
    por_canal = {}
    canais: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    for x in atual["vendas"]:
        if not x["valida"]:
            continue
        c = canais[x["plataforma"]]
        c["total"] += x["total"]
        c["reembolso"] += x["reembolso"]
        c["bonus"] += x["bonus_ml"]
        c["imposto"] += x["imposto"]
        c["custo"] += (x["custo"] or 0) + x["embalagem"] + x.get("extras", 0)
        c["tarifas"] += x["comissao"]
        c["frete"] += x["frete"] + x["frete_devolucao"]
        c["ads"] += x["ads"]
    fatura_canal: dict[str, float] = defaultdict(float)
    for t in atual.get("tarifas_fatura") or []:
        fatura_canal[t["plataforma"]] += t["valor"]
    for k, c in canais.items():
        por_canal[k] = _linhas_dre(c["total"], c["reembolso"], c["bonus"], c["imposto"], c["custo"], c["tarifas"], c["frete"], c["ads"], None,
                                   fatura_canal.get(k, 0.0))
    despesas_cat: dict[str, float] = defaultdict(float)
    for d in atual["despesas"]:
        despesas_cat[financeiro.CATEGORIAS_DESPESA.get(d["categoria"], d["categoria"])] += d["valor"]
    avisos = []
    ult = colunas[-1]
    if ult["sem_custo"] or ult["sem_vinculo"]:
        avisos.append(f"{ult['sem_custo'] + ult['sem_vinculo']} venda(s) sem custo cadastrado ou sem produto vinculado: o custo dos produtos "
                      "está menor do que o real e o resultado aparece maior. Cadastre em Produtos e custos.")
    if ult["frete_pendente"]:
        avisos.append(f"{ult['frete_pendente']} venda(s) ainda sem o valor do frete. Sincronize de novo mais tarde.")
    if not atual["despesas"]:
        avisos.append("Nenhuma despesa operacional cadastrada no mês: o resultado não desconta aluguel, salários etc.")
    if not ult["sincronizado"]:
        avisos.append("As vendas deste mês ainda não foram sincronizadas em Vendas por pedido.")
    if atual["totais"].get("tarifas_fatura"):
        avisos.append(financeiro.AVISO_FATURA)
    if atual["totais"].get("simuladas"):
        avisos.append("Há vendas simuladas neste mês. Apague as simulações antes de usar os números.")
    return {"mes": mes, "colunas": colunas, "por_canal": por_canal, "despesas_por_categoria": dict(despesas_cat),
            "origem": ORIGEM_DRE, "avisos": avisos, "regime": atual["config"]["regime"]}
