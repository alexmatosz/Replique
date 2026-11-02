"""Estoque no Full (Mercado Livre) com custo e aviso de armazenamento caro.

Para cada anúncio no Full:
- unidades no centro de distribuição (/inventories/{id}/stock/fulfillment);
- idade do estoque pelas entradas (operações INBOUND_RECEPTION dos últimos
  12 meses), supondo que o ML despacha primeiro as unidades mais antigas;
- ritmo de venda dos últimos 30 dias (vendas sincronizadas em Vendas e lucro);
- projeção até o fim do mês que vem: quantas unidades ainda vão estar lá e
  quantas vão passar do prazo de armazenamento prolongado.

A API do ML não informa a tarifa de armazenagem: o custo por unidade ao mês é
configurado por cliente (veja na fatura do Full) e usado só na estimativa.
"""

from __future__ import annotations

import hashlib
import random
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend import config
from backend.marketplaces.base import ErroMarketplace
from backend.marketplaces.registry import obter_adaptador
from backend.banco.models import Cliente, Usuario, Venda
from backend.services import financeiro
from backend.services.auditoria import registrar

DIAS_PARADO = 90
JANELA_OPERACOES = 60


def fim_do_mes_que_vem(hoje: date) -> date:
    ano, mes = hoje.year + (hoje.month == 12), hoje.month % 12 + 1
    ano2, mes2 = ano + (mes == 12), mes % 12 + 1
    return date(ano2, mes2, 1) - timedelta(days=1)


def _ritmo(db: Session, cliente_id: int, hoje: date) -> tuple[dict[tuple, float], dict[tuple, date], bool]:
    """(unidades por dia nos últimos 30 dias, dia da última venda) por (anúncio, variação).
    A chave (anúncio, "*") soma todas as variações."""
    desde = datetime.combine(hoje - timedelta(days=DIAS_PARADO), datetime.min.time(), timezone.utc)
    vendas = (db.query(Venda).filter(Venda.cliente_id == cliente_id, Venda.data_venda >= desde,
                                     Venda.status != "cancelled", Venda.simulada.isnot(True)).all())
    trinta = hoje - timedelta(days=30)
    por_dia: dict[tuple, float] = defaultdict(float)
    ultima: dict[tuple, date] = {}
    for v in vendas:
        dia = v.data_venda.astimezone(financeiro.FUSO_BR).date() if v.data_venda.tzinfo else v.data_venda.date()
        for chave in ((v.item_id, v.variacao_id or ""), (v.item_id, "*")):
            if dia >= trinta:
                por_dia[chave] += v.quantidade / 30
            if dia > ultima.get(chave, date.min):
                ultima[chave] = dia
    return por_dia, ultima, bool(vendas)


def lotes_fifo(entradas: list[tuple[date, int]], total: int) -> list[tuple[date | None, int]]:
    """Unidades que ainda estão no Full, por data de entrada: as mais novas
    ficam, as mais antigas já saíram. Sobra sem entrada conhecida = entrou há
    mais de 12 meses (data None)."""
    restantes, saida = total, []
    for dia, qtd in sorted(entradas, reverse=True):
        if restantes <= 0:
            break
        usar = min(qtd, restantes)
        saida.append((dia, usar))
        restantes -= usar
    if restantes > 0:
        saida.append((None, restantes))
    return sorted(saida, key=lambda x: x[0] or date.min)


def projetar(lotes: list[tuple[date | None, int]], por_dia: float, hoje: date, ate: date, limite: int) -> dict:
    """Vende as unidades mais antigas no ritmo atual até `ate` e conta quantas
    sobram e quantas delas estarão com mais de `limite` dias no Full."""
    vender = int(por_dia * max(0, (ate - hoje).days))
    sobra = []
    for dia, qtd in lotes:
        usar = min(qtd, vender)
        vender -= usar
        if qtd - usar > 0:
            sobra.append((dia, qtd - usar))
    restantes = sum(q for _, q in sobra)
    acima = sum(q for d, q in sobra if d is None or (ate - d).days > limite)
    acima_hoje = sum(q for d, q in lotes if d is None or (hoje - d).days > limite)
    a_partir = None
    if acima and sobra:
        d = sobra[0][0]
        a_partir = hoje if d is None else max(hoje, d + timedelta(days=limite + 1))
    return {"restantes": restantes, "acima_limite": acima, "acima_limite_hoje": acima_hoje,
            "a_partir_de": a_partir.isoformat() if a_partir else None}


def _janelas(hoje: date) -> list[tuple[date, date]]:
    saida, fim = [], hoje
    for _ in range(6):
        ini = fim - timedelta(days=JANELA_OPERACOES - 1)
        saida.append((ini, fim))
        fim = ini - timedelta(days=1)
    return saida


def _entradas(ml, uid: str, inventarios: list[str], hoje: date) -> dict[str, list[tuple[date, int]]]:
    """Entradas no Full (data, unidades) de cada inventory_id nos últimos 12 meses."""
    saida: dict[str, list[tuple[date, int]]] = defaultdict(list)

    def ler(args):
        grupo, (ini, fim) = args
        params = {"seller_id": uid, "inventory_id": ",".join(grupo), "type": "INBOUND_RECEPTION",
                  "date_from": ini.isoformat(), "date_to": fim.isoformat(), "limit": 1000}
        achados = []
        for _ in range(10):
            r = ml._get("/stock/fulfillment/operations/search", params)
            if r.status_code >= 400:
                break
            d = r.json()
            achados += d.get("results") or []
            scroll = (d.get("paging") or {}).get("scroll")
            if not scroll or not d.get("results"):
                break
            params["scroll"] = scroll
        return achados

    grupos = [inventarios[i:i + 20] for i in range(0, len(inventarios), 20)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for lista in pool.map(ler, [(g, j) for g in grupos for j in _janelas(hoje)]):
            for op in lista:
                det = op.get("detail") or {}
                qtd = int(det.get("available_quantity") or 0) + int(det.get("not_available_quantity") or 0)
                quando = str(op.get("date_created") or "")[:10]
                if qtd > 0 and quando:
                    saida[op.get("inventory_id")].append((date.fromisoformat(quando), qtd))
    return saida


def _itens_full(ml) -> list[dict]:
    """Um registro por inventory_id (anúncio sem variação ou cada variação) no Full."""
    uid, ids = ml._user_id(), []
    params = {"logistic_type": "fulfillment", "search_type": "scan", "limit": 100}
    while len(ids) < 2000:
        d = ml._req("GET", f"/users/{uid}/items/search", "listar anúncios do Full", params=params)
        lote = d.get("results") or []
        ids += lote
        if not lote or not d.get("scroll_id"):
            break
        params["scroll_id"] = d["scroll_id"]
    saida = []
    for it in ml.itens(list(dict.fromkeys(ids))):
        base = {"item_id": it.get("id", ""), "titulo": it.get("title", ""), "status": it.get("status", ""),
                "foto": (it.get("thumbnail") or "").replace("http://", "https://"), "preco": it.get("price"),
                "link": it.get("permalink", "")}
        variacoes = it.get("variations") or []
        if not variacoes and it.get("inventory_id"):
            saida.append({**base, "variacao_id": "", "variacao": "", "inventory_id": it["inventory_id"],
                          "sku": it.get("seller_custom_field") or ""})
        for v in variacoes:
            if v.get("inventory_id"):
                nome = " · ".join(f"{a.get('name')}: {a.get('value_name')}" for a in v.get("attribute_combinations") or []
                                  if a.get("value_name"))
                saida.append({**base, "variacao_id": str(v.get("id") or ""), "variacao": nome,
                              "inventory_id": v["inventory_id"], "sku": v.get("seller_custom_field") or ""})
    return saida


def _estoque(ml, inventory_id: str) -> dict:
    r = ml._get(f"/inventories/{inventory_id}/stock/fulfillment")
    if r.status_code >= 400:
        return {"erro": True}
    d = r.json()
    return {"total": int(d.get("total") or 0), "disponivel": int(d.get("available_quantity") or 0),
            "indisponivel": int(d.get("not_available_quantity") or 0),
            "detalhe": [{"status": x.get("status"), "quantidade": x.get("quantity")} for x in d.get("not_available_detail") or []]}


def _demo(cliente: Cliente, hoje: date) -> tuple[list[dict], dict, dict]:
    rng = random.Random(int(hashlib.sha256(f"full{cliente.id}".encode()).hexdigest()[:10], 16))
    nomes = ["Garrafa Térmica Inox 1L", "Fone Bluetooth TWS", "Organizador de Gaveta", "Luminária LED de Mesa",
             "Kit Potes Herméticos 5 peças", "Suporte de Celular Veicular"]
    itens, estoques, entradas = [], {}, {}
    for i, nome in enumerate(nomes):
        inv = f"DEMOINV{i}"
        itens.append({"item_id": f"MLB-DEMO-F{i}", "titulo": f"{nome} (demonstração)", "status": "active", "foto": "",
                      "preco": round(rng.uniform(39, 189), 2), "link": "", "variacao_id": "", "variacao": "",
                      "inventory_id": inv, "sku": f"DEMO-{i}"})
        total = rng.randint(8, 160)
        estoques[inv] = {"total": total, "disponivel": total - (2 if i == 3 else 0), "indisponivel": 2 if i == 3 else 0,
                         "detalhe": [{"status": "damaged", "quantidade": 2}] if i == 3 else []}
        entradas[inv] = [(hoje - timedelta(days=rng.choice([20, 75, 140, 200, 260])), rng.randint(20, 120)) for _ in range(2)]
    return itens, estoques, entradas


def painel(db: Session, cliente: Cliente) -> dict:
    cfg = financeiro.config_de(db, cliente)
    limite = int(cfg.full_dias_prolongado or 180)
    custo_mes = float(cfg.full_custo_unidade_mes or 0)
    hoje = datetime.now(financeiro.FUSO_BR).date()
    ate = fim_do_mes_que_vem(hoje)
    ml, aviso = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    if ml.demo:
        itens, estoques, entradas = _demo(cliente, hoje)
    else:
        try:
            itens = _itens_full(ml)
            invs = [i["inventory_id"] for i in itens]
            with ThreadPoolExecutor(max_workers=6) as pool:
                estoques = dict(zip(invs, pool.map(lambda x: _estoque(ml, x), invs)))
            entradas = _entradas(ml, ml._user_id(), invs, hoje) if invs else {}
        except ErroMarketplace as e:
            raise ValueError(e.mensagem) from e
    por_dia, ultima, tem_vendas = _ritmo(db, cliente.id, hoje)
    cat = financeiro.Catalogo(db, cliente.id)
    dias_ate = (ate - hoje).days
    linhas = []
    for it in itens:
        est = estoques.get(it["inventory_id"]) or {"erro": True}
        total = est.get("total", 0)
        chave = (it["item_id"], it["variacao_id"])
        ritmo = por_dia.get(chave, 0.0) if it["variacao_id"] else por_dia.get((it["item_id"], "*"), 0.0)
        lotes = lotes_fifo(entradas.get(it["inventory_id"], []), total)
        proj = projetar(lotes, ritmo, hoje, ate, limite)
        datas = [d for d, _ in lotes if d]
        mais_antiga = min(datas) if datas else None
        c = cat.casar(it["item_id"], it["variacao_id"], it["sku"])
        custo_unit = c.produto.custo * c.unidades if c and c.produto.custo is not None else None
        ult = ultima.get(chave) if it["variacao_id"] else ultima.get((it["item_id"], "*"))
        dias_sem_venda = (hoje - ult).days if ult else None
        armazenagem = round((total + proj["restantes"]) / 2 * custo_mes / 30 * dias_ate, 2) if custo_mes and total else None
        alertas = []
        if proj["acima_limite_hoje"]:
            alertas.append(f"{proj['acima_limite_hoje']} unidade(s) já passaram de {limite} dias no Full (armazenamento prolongado).")
        elif proj["acima_limite"]:
            alertas.append(f"No ritmo atual, {proj['acima_limite']} unidade(s) vão passar de {limite} dias no Full até "
                           f"{ate:%d/%m} (a partir de {date.fromisoformat(proj['a_partir_de']):%d/%m}).")
        if total and tem_vendas and (dias_sem_venda is None or dias_sem_venda >= DIAS_PARADO):
            alertas.append(f"Sem venda há mais de {DIAS_PARADO} dias: o ML pode pedir a retirada ou cobrar pelo estoque parado.")
        if total and mais_antiga and (hoje - mais_antiga).days >= config.FULL_DIAS_ALERTA:
            alertas.append(f"Há {(hoje - mais_antiga).days} dias no Full (entrada mais antiga em {mais_antiga:%d/%m/%Y}): "
                           "confira se ainda vale manter ou se é melhor fazer promoção ou retirar.")
        if est.get("indisponivel"):
            alertas.append(f"{est['indisponivel']} unidade(s) indisponíveis no Full (" +
                           ", ".join(f"{x['quantidade']} {x['status']}" for x in est.get("detalhe") or []) + ").")
        nivel = "vermelho" if proj["acima_limite_hoje"] else "amarelo" if alertas else "ok"
        linhas.append({**it, **{k: est.get(k) for k in ("total", "disponivel", "indisponivel", "detalhe")},
                       "erro": bool(est.get("erro")), "vendas_dia": round(ritmo, 2),
                       "cobertura_dias": round(total / ritmo) if ritmo else None,
                       "entrada_mais_antiga": mais_antiga.isoformat() if mais_antiga else None,
                       "idade_dias": (hoje - mais_antiga).days if mais_antiga else None,
                       "dias_sem_venda": dias_sem_venda, "projecao": proj, "custo_unitario": custo_unit,
                       "valor_parado": round(custo_unit * total, 2) if custo_unit is not None else None,
                       "armazenagem_estimada": armazenagem, "alertas": alertas, "nivel": nivel})
    ordem = {"vermelho": 0, "amarelo": 1, "ok": 2}
    linhas.sort(key=lambda x: (ordem[x["nivel"]], -(x["total"] or 0)))
    return {"demo": ml.demo, "aviso": aviso if ml.demo else "", "hoje": hoje.isoformat(), "ate": ate.isoformat(),
            "limite_dias": limite, "dias_alerta": config.FULL_DIAS_ALERTA, "custo_unidade_mes": custo_mes, "tem_vendas": tem_vendas, "itens": linhas,
            "totais": {"anuncios": len({x["item_id"] for x in linhas}), "unidades": sum(x["total"] or 0 for x in linhas),
                       "valor_parado": round(sum(x["valor_parado"] or 0 for x in linhas), 2),
                       "sem_custo": sum(1 for x in linhas if x["custo_unitario"] is None and x["total"]),
                       "com_alerta": sum(1 for x in linhas if x["alertas"]),
                       "acima_limite": sum(x["projecao"]["acima_limite"] for x in linhas),
                       "armazenagem_estimada": round(sum(x["armazenagem_estimada"] or 0 for x in linhas), 2) if custo_mes else None}}


def salvar_config(db: Session, cliente: Cliente, custo_unidade_mes: float, dias_prolongado: int, usuario: Usuario) -> None:
    if not 0 <= custo_unidade_mes <= 1000:
        raise ValueError("Custo por unidade fora do intervalo.")
    if not 30 <= dias_prolongado <= 720:
        raise ValueError("O prazo deve ficar entre 30 e 720 dias.")
    cfg = financeiro.config_de(db, cliente)
    cfg.full_custo_unidade_mes, cfg.full_dias_prolongado = custo_unidade_mes, dias_prolongado
    registrar(db, cliente.empresa_id, "financeiro",
              f"Ajustou o estoque Full: R$ {custo_unidade_mes:.2f} por unidade ao mês, aviso após {dias_prolongado} dias",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
