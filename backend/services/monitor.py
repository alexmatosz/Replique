"""Radar de anúncios: acompanha anúncios do cliente e produtos de catálogo.

O que a API oficial do Mercado Livre libera (conferido em 23/10/2026):
- anúncio do próprio cliente: tudo (/items, visitas) e as vendas vêm dos
  pedidos sincronizados no Financeiro;
- anúncio de outro vendedor: /items e visitas respondem 403. O que sai é o
  que aparece nas ofertas do produto de catálogo: preço, frete, tipo de
  anúncio, loja oficial e vendedor. Vendas e visitas de concorrentes não
  vêm pela API, e a tela diz isso.

Cada leitura vira uma LeituraMonitorado; o histórico e os alertas saem delas.
"""

from __future__ import annotations

import hashlib
import random
import re
import statistics
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.marketplaces.mercadolivre import MercadoLivre
from backend.marketplaces.registry import conta_do_cliente
from backend import config
from backend.banco.models import Anuncio, AnuncioMonitorado, Cliente, LeituraEstudo, LeituraMonitorado, Publicacao, Usuario, Venda
from backend.services import mercado
from backend.services.auditoria import registrar
from backend.services.financeiro import brl

MAX_POR_CLIENTE = 200
QUEDA_MINIMA_PCT = 1.0
ACIMA_DO_MERCADO_PCT = 5.0
JANELA_TENDENCIA = 7
LIMIAR_PRECO_PCT = 2.0
LIMIAR_VENDAS_PCT = 20.0
LIMIAR_VENDEDORES = 2
STATUS_PROBLEMA = {"paused": "pausado", "under_review": "em moderação", "inactive": "inativo", "closed": "finalizado"}
_PRODUTO = re.compile(r"/p/(MLB\d+)", re.I)
_ITEM = re.compile(r"(?<![A-Z0-9])(MLB)-?(\d{3,})", re.I)


def interpretar(texto: str) -> tuple[str, str]:
    """('produto' | 'item', código) a partir de um link ou código do Mercado Livre."""
    texto = (texto or "").strip()
    if m := _PRODUTO.search(texto):
        return "produto", m.group(1).upper()
    if m := _ITEM.search(texto):
        return "item", f"MLB{m.group(2)}"
    raise ValueError("Cole o link de um anúncio ou de um produto do Mercado Livre (ou o código MLB).")


def _minha_conta(db: Session, cliente: Cliente) -> str:
    conta = conta_do_cliente(db, cliente.id, "mercadolivre")
    return conta.id_externo if conta else ""


def _vendas_do_item(db: Session, cliente: Cliente, item_id: str) -> dict:
    """Vendas reais do anúncio do cliente nos últimos 30 e 90 dias (pedidos sincronizados no Financeiro)."""
    agora = datetime.now(timezone.utc)

    def soma(dias):
        return int(db.query(func.coalesce(func.sum(Venda.quantidade), 0)).filter(
            Venda.cliente_id == cliente.id, Venda.item_id == item_id, Venda.data_venda >= agora - timedelta(days=dias),
            Venda.status.in_(("paid", "confirmed"))).scalar() or 0)
    sincronizado = db.query(Venda.id).filter(Venda.cliente_id == cliente.id).first() is not None
    v30, v90 = soma(30), soma(90)
    return {"vendas_30d": v30 if sincronizado else None, "vendas_dia": round(v30 / 30, 2) if sincronizado else None,
            "vendas_mes": round(v90 / 3, 1) if sincronizado else None, "vendas_sincronizadas": sincronizado}


MOTIVOS_CATALOGO = {
    "winner_has_better_price": "o vencedor tem preço menor", "winner_has_lower_price": "o vencedor tem preço menor",
    "winner_has_free_shipping": "o vencedor oferece frete grátis", "shipping_not_free": "seu anúncio não tem frete grátis",
    "winner_has_fulfillment": "o vencedor está no Full", "winner_has_same_day_shipping": "o vencedor entrega no mesmo dia",
    "winner_has_free_installments": "o vencedor oferece parcelamento sem juros",
    "winner_has_better_reputation": "o vencedor tem reputação melhor", "reputation_below_threshold": "sua reputação está abaixo do exigido",
    "non_trusted_seller": "a conta ainda não é considerada confiável pelo Mercado Livre", "item_paused": "seu anúncio está pausado",
    "out_of_stock": "seu anúncio está sem estoque", "manufacturing_time": "seu anúncio tem prazo de fabricação",
    "item_not_opted_in": "o anúncio não está no catálogo",
    "no_improvement_price": "baixar só o preço não basta para ganhar",
}
STATUS_CATALOGO = {"winning": "ganhando", "sharing_first_place": "dividindo o primeiro lugar", "competing": "perdendo",
                   "listed": "listado sem disputa"}
IMPULSOS = {"free_shipping": "frete grátis", "fulfillment": "Full", "same_day_shipping": "entrega no mesmo dia",
            "free_installments": "parcelamento sem juros", "shipping_collect": "coleta"}


def catalogo(ad: MercadoLivre, item_id: str) -> dict:
    """Competição de catálogo pela API oficial (/items/{id}/price_to_win).
    Quando a API não responde, diz isso em vez de supor."""
    r = ad._get(f"/items/{item_id}/price_to_win", {"siteId": config.ML_SITE_ID, "version": "v2"})
    if r.status_code >= 400:
        return {"indisponivel": f"A API do Mercado Livre não devolveu a disputa de catálogo deste anúncio (HTTP {r.status_code})."}
    d = r.json() or {}
    status = d.get("status") or ""
    motivos = [m if isinstance(m, str) else str(m) for m in (d.get("reason") or d.get("reasons") or [])]
    vencedor = d.get("winner") or {}

    def nome(b):
        return b.get("description") or IMPULSOS.get(b.get("id"), b.get("id"))
    meus = {b.get("id"): b.get("status") for b in (d.get("boosts") or []) if isinstance(b, dict)}
    vantagens = [nome(b) for b in (vencedor.get("boosts") or []) if isinstance(b, dict)
                 and b.get("status") == "boosted" and meus.get(b.get("id")) != "boosted"]
    textos = [MOTIVOS_CATALOGO.get(m.lower(), m) for m in motivos]
    if vantagens and status == "competing":
        textos.append("o vencedor tem " + ", ".join(vantagens).lower())
    return {"status": status, "status_nome": STATUS_CATALOGO.get(status, status or "sem informação"),
            "ganhando": status in ("winning", "sharing_first_place"), "preco_atual": d.get("current_price"),
            "preco_para_ganhar": d.get("price_to_win") if d.get("price_to_win") != d.get("current_price") or status != "competing" else None,
            "motivos": textos, "vencedor_item": vencedor.get("item_id"), "vencedor_preco": vencedor.get("price"),
            "vantagens_vencedor": vantagens,
            "oportunidades": [nome(b) for b in (d.get("boosts") or []) if isinstance(b, dict) and b.get("status") == "opportunity"],
            "visitas_compartilhadas": d.get("visit_share")}


def avaliacoes(ad: MercadoLivre, item_id: str, produto_id: str = "") -> dict | None:
    """Nota e total de avaliações. A API só libera para anúncios do próprio vendedor
    (de outros vendedores responde 403, conferido em 23/10/2026)."""
    r = ad._get(f"/reviews/item/{item_id}", {"limit": 1, **({"catalog_product_id": produto_id} if produto_id else {})})
    if r.status_code >= 400:
        return None
    d = r.json() or {}
    return {"nota": d.get("rating_average"), "total": (d.get("paging") or {}).get("total"), "niveis": d.get("rating_levels") or {}}


def frete_gratis(ad: MercadoLivre, item_id: str) -> float | None:
    """Quanto o vendedor paga de frete grátis neste anúncio (custo de lista do ML)."""
    r = ad._get(f"/users/{ad._user_id()}/shipping_options/free", {"item_id": item_id})
    if r.status_code >= 400:
        return None
    cobertura = ((r.json() or {}).get("coverage") or {}).get("all_country") or {}
    return cobertura.get("list_cost")


def _preco_minimo(db: Session, cliente: Cliente, item_id: str, preco: float | None) -> float | None:
    from backend.services import margem
    a = (db.query(Anuncio).join(Publicacao, Publicacao.anuncio_id == Anuncio.id)
         .filter(Publicacao.cliente_id == cliente.id, Publicacao.id_externo == item_id, Anuncio.excluido_em.is_(None)).first())
    if not a or not preco:
        return None
    try:
        return margem.calcular(db, a, ["mercadolivre"], preco)["mercadolivre"].get("preco_minimo")
    except Exception:
        return None


def _ofertas(ad: MercadoLivre, produto_id: str) -> tuple[list[dict], int]:
    r = ad._get(f"/products/{produto_id}/items", {"limit": 100})
    if r.status_code >= 400:
        return [], 0
    d = r.json()
    return d.get("results") or [], (d.get("paging") or {}).get("total", 0)


def _oferta_dict(o: dict) -> dict:
    ship = o.get("shipping") or {}
    return {"item_id": o.get("item_id"), "preco": o.get("price"), "vendedor_id": str(o.get("seller_id") or ""),
            "tipo_anuncio": o.get("listing_type_id") or "", "frete_gratis": bool(ship.get("free_shipping")),
            "logistica": ship.get("logistic_type") or "", "loja_oficial": bool(o.get("official_store_id"))}


def _mercado_do_produto(ofertas: list[dict]) -> dict:
    precos = sorted(o["price"] for o in ofertas if o.get("price"))
    if not precos:
        return {}
    return {"mercado_min": precos[0], "mercado_mediana": round(statistics.median(precos), 2), "mercado_max": precos[-1],
            "mercado_vendedores": len({o.get("seller_id") for o in ofertas})}


def _ler_proprio(ad: MercadoLivre, db: Session, m: AnuncioMonitorado, cliente: Cliente) -> dict:
    r = ad._get(f"/items/{m.item_id}")
    if r.status_code >= 400:
        raise ValueError(f"O Mercado Livre não devolveu o anúncio {m.item_id} (HTTP {r.status_code}).")
    it = r.json()
    ship = it.get("shipping") or {}
    dados = {"titulo": it.get("title") or "", "foto": it.get("thumbnail") or "", "link": it.get("permalink") or "",
             "preco": it.get("price"), "preco_original": it.get("original_price"), "status": it.get("status") or "",
             "sub_status": it.get("sub_status") or [], "estoque": it.get("available_quantity"),
             "tipo_anuncio": it.get("listing_type_id") or "", "logistica": ship.get("logistic_type") or "",
             "frete_gratis": bool(ship.get("free_shipping")), "categoria_id": it.get("category_id") or "",
             "produto_id": it.get("catalog_product_id") or ""}
    v = ad._get(f"/items/{m.item_id}/visits/time_window", {"last": 30, "unit": "day"})
    dados["visitas_30d"] = int(v.json().get("total_visits") or 0) if v.status_code < 400 else None
    dados.update(_vendas_do_item(db, cliente, m.item_id))
    if dados["visitas_30d"] and dados.get("vendas_30d") is not None:
        dados["conversao_pct"] = round(dados["vendas_30d"] / dados["visitas_30d"] * 100, 2)
    if dados["preco"]:
        t = ad.tarifa_venda(dados["preco"], dados["tipo_anuncio"], dados["categoria_id"])
        if t:
            dados["tarifa"] = round(float(t["sale_fee_amount"]), 2)
            dados["voce_recebe"] = round(dados["preco"] - dados["tarifa"], 2)
    if dados["produto_id"]:
        ofertas, _ = _ofertas(ad, dados["produto_id"])
        dados.update(_mercado_do_produto(ofertas))
        ordem = sorted((o for o in ofertas if o.get("price")), key=lambda o: o["price"])
        dados["posicao_preco"] = next((i + 1 for i, o in enumerate(ordem) if o.get("item_id") == m.item_id), None)
        outros = [o["price"] for o in ordem if o.get("item_id") != m.item_id]
        dados["concorrente_menor_preco"] = outros[0] if outros else None
        dados["catalogo"] = catalogo(ad, m.item_id)
    dados["preco_minimo"] = _preco_minimo(db, cliente, m.item_id, dados["preco"])
    if dados.get("frete_gratis"):
        dados["frete_custo"] = frete_gratis(ad, m.item_id)
    dados["avaliacoes"] = avaliacoes(ad, m.item_id, dados.get("produto_id") or "")
    return dados


def _ler_produto(ad: MercadoLivre, m: AnuncioMonitorado) -> dict:
    ofertas, total = _ofertas(ad, m.produto_id)
    info = mercado._produto(ad, m.produto_id) or {}
    dados = {"titulo": info.get("nome") or m.apelido, "foto": info.get("foto", ""),
             "link": f"https://www.mercadolivre.com.br/p/{m.produto_id}", "produto_id": m.produto_id,
             "ofertas": {o["item_id"]: _oferta_dict(o) for o in ofertas if o.get("item_id")}, "total_ofertas": total,
             **_mercado_do_produto(ofertas)}
    if m.item_id != m.produto_id:
        alvo = dados["ofertas"].get(m.item_id)
        dados.update({"preco": alvo["preco"] if alvo else None, "status": "active" if alvo else "fora_do_catalogo",
                      "vendedor_id": alvo["vendedor_id"] if alvo else m.vendedor_id,
                      "tipo_anuncio": alvo["tipo_anuncio"] if alvo else "", "logistica": alvo["logistica"] if alvo else "",
                      "frete_gratis": alvo["frete_gratis"] if alvo else None})
        ordem = sorted((o for o in ofertas if o.get("price")), key=lambda o: o["price"])
        dados["posicao_preco"] = next((i + 1 for i, o in enumerate(ordem) if o.get("item_id") == m.item_id), None)
    else:
        dados.update({"preco": dados.get("mercado_min"), "status": "active" if ofertas else "sem_ofertas"})
    return dados


def _ler_demo(m: AnuncioMonitorado, n_leituras: int) -> dict:
    rng = random.Random(int(hashlib.sha256(f"monitor{m.id}{n_leituras}".encode()).hexdigest(), 16))
    base = 50 + (int(hashlib.sha256(m.item_id.encode()).hexdigest(), 16) % 200)
    preco = round(base * rng.uniform(0.9, 1.05), 2)
    dados = {"titulo": m.apelido or f"Anúncio {m.item_id}", "foto": "", "link": "", "preco": preco, "status": "active",
             "tipo_anuncio": "gold_special", "logistica": "cross_docking", "frete_gratis": preco >= 79,
             "mercado_min": round(base * 0.85, 2), "mercado_mediana": round(base, 2), "mercado_max": round(base * 1.3, 2),
             "mercado_vendedores": rng.randint(3, 25)}
    if m.proprio:
        visitas = rng.randint(200, 900)
        vendas = rng.randint(3, 30)
        dados.update({"visitas_30d": visitas, "vendas_30d": vendas, "vendas_dia": round(vendas / 30, 2), "vendas_mes": vendas,
                      "conversao_pct": round(vendas / visitas * 100, 2), "estoque": rng.randint(0, 60),
                      "tarifa": round(preco * 0.14, 2), "voce_recebe": round(preco * 0.86, 2), "vendas_sincronizadas": True,
                      "concorrente_menor_preco": round(base * 0.95, 2), "preco_minimo": round(base * 0.8, 2),
                      "frete_custo": round(rng.uniform(6, 25), 2) if preco >= 79 else None,
                      "avaliacoes": {"nota": round(rng.uniform(4, 5), 1), "total": rng.randint(5, 400), "niveis": {}}})
        ganhando = rng.random() < 0.5
        dados["catalogo"] = {"status": "winning" if ganhando else "competing", "status_nome": "ganhando" if ganhando else "perdendo",
                             "ganhando": ganhando, "preco_atual": preco, "preco_para_ganhar": None if ganhando else round(base * 0.94, 2),
                             "motivos": [] if ganhando else ["o vencedor tem preço menor", "o vencedor tem envios full"],
                             "vencedor_preco": None if ganhando else round(base * 0.95, 2), "impulsos": [], "demo": True}
    return dados


def ler(db: Session, m: AnuncioMonitorado, cliente: Cliente) -> LeituraMonitorado:
    ad = mercado.adaptador_ml(db, cliente.empresa_id, cliente.id)
    if ad is None:
        n = db.query(LeituraMonitorado).filter_by(monitorado_id=m.id).count()
        dados, demo = _ler_demo(m, n), True
    else:
        dados = _ler_proprio(ad, db, m, cliente) if m.proprio else _ler_produto(ad, m)
        demo = False
    if not m.apelido and dados.get("titulo"):
        m.apelido = dados["titulo"][:200]
    anterior = db.query(LeituraMonitorado).filter_by(monitorado_id=m.id).order_by(LeituraMonitorado.id.desc()).first()
    leitura = LeituraMonitorado(monitorado_id=m.id, preco=dados.get("preco"), status=dados.get("status") or "",
                                visitas_30d=dados.get("visitas_30d"), vendas_30d=dados.get("vendas_30d"), dados=dados, demo=demo)
    db.add(leitura)
    db.flush()
    leituras = (db.query(LeituraMonitorado).filter_by(monitorado_id=m.id).order_by(LeituraMonitorado.id.desc()).limit(120).all())
    leitura.dados = {**dados, "tendencia": tendencia(db, m, cliente.empresa_id, list(reversed(leituras)))}
    avisar(db, m, cliente, leitura, anterior)
    db.commit()
    return leitura


def avisar(db: Session, m: AnuncioMonitorado, cliente: Cliente, atual: LeituraMonitorado, anterior: LeituraMonitorado | None) -> int:
    """Leva para o sino as mudanças que pedem ação: catálogo perdido, concorrente
    mudou o preço e anúncio pausado ou em moderação."""
    from backend.services import notificacoes
    if not anterior:
        return 0
    nome = m.apelido or m.item_id
    feitos = 0
    cat_ant, cat_atual = (anterior.dados or {}).get("catalogo") or {}, (atual.dados or {}).get("catalogo") or {}
    if m.proprio and cat_ant.get("ganhando") and cat_atual.get("status") and not cat_atual.get("ganhando"):
        motivo = ", ".join(cat_atual.get("motivos") or []) or "a API não informou o motivo"
        feitos += notificacoes.notificar(db, cliente, "catalogo_perdido", f"Perdeu o catálogo: {nome}",
                                         f"Motivo: {motivo}." + (f" Preço para ganhar: {brl(cat_atual['preco_para_ganhar'])}."
                                                                if cat_atual.get("preco_para_ganhar") else ""),
                                         "#/monitor", chave=f"catalogo-{m.id}-{atual.id}", demo=atual.demo)
    if not m.proprio and anterior.preco and atual.preco and abs(atual.preco - anterior.preco) >= anterior.preco * QUEDA_MINIMA_PCT / 100:
        verbo = "baixou" if atual.preco < anterior.preco else "subiu"
        feitos += notificacoes.notificar(db, cliente, "concorrente_preco", f"Concorrente {verbo} o preço: {nome}",
                                         f"De {brl(anterior.preco)} para {brl(atual.preco)}.", "#/concorrentes",
                                         chave=f"preco-{m.id}-{atual.id}", demo=atual.demo)
    tend_atual = ((atual.dados or {}).get("tendencia") or {}).get("resumo")
    tend_antes = ((anterior.dados or {}).get("tendencia") or {}).get("resumo")
    if tend_atual == "alta" and tend_antes != "alta":
        sinais = "; ".join(x["texto"] for x in (atual.dados or {}).get("tendencia", {}).get("sinais", [])[:3])
        feitos += notificacoes.notificar(db, cliente, "tendencia_alta", f"Tendência de alta: {nome}", sinais, "#/monitor",
                                         chave=f"tendencia-{m.id}-{atual.id}", demo=atual.demo)
    if atual.status in STATUS_PROBLEMA and anterior.status not in STATUS_PROBLEMA and m.proprio:
        feitos += notificacoes.notificar(db, cliente, "anuncio_problema", f"Anúncio {STATUS_PROBLEMA[atual.status]}: {nome}",
                                         ", ".join((atual.dados or {}).get("sub_status") or []), "#/monitor",
                                         chave=f"status-{m.id}-{atual.id}", demo=atual.demo)
    return feitos


CAMPOS_MUDANCA = (("preco", "Preço"), ("status", "Situação"), ("estoque", "Estoque"), ("frete_gratis", "Frete grátis"),
                  ("logistica", "Logística"), ("tipo_anuncio", "Tipo de anúncio"), ("posicao_preco", "Posição no preço"))


def mudancas(leituras: list[LeituraMonitorado]) -> list[dict]:
    """Linha do tempo: só o que mudou de uma leitura para a outra."""
    saida = []
    for ant, atual in zip(leituras, leituras[1:]):
        a, b = ant.dados or {}, atual.dados or {}
        for campo, nome in CAMPOS_MUDANCA:
            if a.get(campo) != b.get(campo) and b.get(campo) is not None and a.get(campo) is not None:
                saida.append({"quando": atual.lida_em, "campo": nome, "de": a.get(campo), "para": b.get(campo), "demo": atual.demo})
        ca, cb = (a.get("catalogo") or {}).get("status"), (b.get("catalogo") or {}).get("status")
        if ca and cb and ca != cb:
            saida.append({"quando": atual.lida_em, "campo": "Catálogo", "de": STATUS_CATALOGO.get(ca, ca),
                          "para": STATUS_CATALOGO.get(cb, cb), "demo": atual.demo})
    return list(reversed(saida))


def adicionar(db: Session, cliente: Cliente, usuario: Usuario, texto: str = "", produto_id: str = "",
              apelido: str = "", origem: str = "manual", vinculado_a_id: int | None = None) -> AnuncioMonitorado:
    if db.query(AnuncioMonitorado).filter_by(cliente_id=cliente.id).count() >= MAX_POR_CLIENTE:
        raise ValueError(f"O radar acompanha até {MAX_POR_CLIENTE} anúncios por cliente. Remova algum antes de adicionar.")
    tipo, codigo = ("produto", produto_id.strip().upper()) if produto_id else interpretar(texto)
    if not re.fullmatch(r"MLB\d+", codigo):
        raise ValueError("Código do Mercado Livre inválido.")
    ad = mercado.adaptador_ml(db, cliente.empresa_id, cliente.id)
    proprio, produto, vendedor = False, codigo if tipo == "produto" else "", ""
    if tipo == "item" and ad is not None:
        r = ad._get(f"/items/{codigo}")
        if r.status_code == 403:
            raise ValueError("O Mercado Livre não libera pela API o anúncio de outro vendedor. Cole o link do produto de catálogo "
                             "(o endereço com /p/MLB...): o radar acompanha todas as ofertas dele, inclusive a desse concorrente.")
        if r.status_code >= 400:
            raise ValueError(f"Não encontrei o anúncio {codigo} no Mercado Livre.")
        it = r.json()
        vendedor = str(it.get("seller_id") or "")
        proprio = vendedor == _minha_conta(db, cliente)
        if not proprio:
            produto = it.get("catalog_product_id") or ""
            if not produto:
                raise ValueError("Esse anúncio é de outro vendedor e não está em um produto de catálogo, então a API não deixa acompanhar.")
    elif tipo == "item":
        proprio = True
    item_id = codigo if tipo == "item" else produto
    if tipo == "item" and not proprio and produto:
        item_id = codigo
    if vinculado_a_id:
        meu = db.get(AnuncioMonitorado, vinculado_a_id)
        if not meu or meu.cliente_id != cliente.id or not meu.proprio:
            raise ValueError("Escolha um anúncio do próprio cliente para vincular o concorrente.")
    if db.query(AnuncioMonitorado).filter_by(cliente_id=cliente.id, plataforma="mercadolivre", item_id=item_id).first():
        raise ValueError("Esse anúncio já está no radar deste cliente.")
    m = AnuncioMonitorado(empresa_id=cliente.empresa_id, cliente_id=cliente.id, item_id=item_id, proprio=proprio,
                          apelido=(apelido or "")[:200], vendedor_id=vendedor, produto_id=produto, origem=origem[:40],
                          demo=ad is None, criado_por=usuario.id, vinculado_a_id=vinculado_a_id)
    db.add(m)
    db.commit()
    registrar(db, cliente.empresa_id, "edicao", f"Colocou {item_id} no Radar de anúncios", cliente_id=cliente.id, usuario=usuario)
    db.commit()
    try:
        ler(db, m, cliente)
    except ValueError:
        pass
    return m


def alertas(m: AnuncioMonitorado, atual: LeituraMonitorado | None, anterior: LeituraMonitorado | None) -> list[dict]:
    saida = []
    if not atual:
        return saida
    d = atual.dados or {}
    if atual.status in STATUS_PROBLEMA:
        saida.append({"nivel": "vermelho", "texto": f"Anúncio {STATUS_PROBLEMA[atual.status]} no Mercado Livre."})
    if d.get("sub_status") and "under_review" in (d.get("sub_status") or []):
        saida.append({"nivel": "vermelho", "texto": "Anúncio em moderação no Mercado Livre."})
    if atual.status == "fora_do_catalogo":
        saida.append({"nivel": "amarelo", "texto": "A oferta saiu do produto de catálogo (pausada, finalizada ou sem estoque)."})
    if not m.proprio and anterior and anterior.preco and atual.preco and atual.preco < anterior.preco * (1 - QUEDA_MINIMA_PCT / 100):
        saida.append({"nivel": "amarelo", "texto": f"O preço caiu de {brl(anterior.preco)} para {brl(atual.preco)}."})
    if not m.proprio and anterior and anterior.preco and atual.preco and atual.preco > anterior.preco * (1 + QUEDA_MINIMA_PCT / 100):
        saida.append({"nivel": "azul", "texto": f"O preço subiu de {brl(anterior.preco)} para {brl(atual.preco)}."})
    cat = d.get("catalogo") or {}
    if m.proprio and cat.get("status") and not cat.get("ganhando") and cat.get("status") != "listed":
        motivo = ", ".join(cat.get("motivos") or []) or "a API não informou o motivo"
        saida.append({"nivel": "amarelo", "texto": f"Perdendo o catálogo: {motivo}."})
    if m.proprio and atual.preco and d.get("mercado_mediana") and atual.preco > d["mercado_mediana"] * (1 + ACIMA_DO_MERCADO_PCT / 100):
        saida.append({"nivel": "amarelo", "texto": f"Seu preço está acima da mediana do mercado ({brl(d['mercado_mediana'])})."})
    return saida


def leitura_dict(x: LeituraMonitorado | None) -> dict | None:
    if not x:
        return None
    return {"id": x.id, "lida_em": x.lida_em, "preco": x.preco, "status": x.status, "visitas_30d": x.visitas_30d,
            "vendas_30d": x.vendas_30d, "demo": x.demo, "dados": {k: v for k, v in (x.dados or {}).items() if k != "ofertas"}}


def listar(db: Session, cliente: Cliente) -> list[dict]:
    monitorados = db.query(AnuncioMonitorado).filter_by(cliente_id=cliente.id).order_by(AnuncioMonitorado.id.desc()).all()
    saida = []
    for m in monitorados:
        todas = (db.query(LeituraMonitorado).filter_by(monitorado_id=m.id).order_by(LeituraMonitorado.id.desc()).limit(120).all())
        ultimas = todas[:12]
        atual = ultimas[0] if ultimas else None
        anterior = ultimas[1] if len(ultimas) > 1 else None
        saida.append({"id": m.id, "item_id": m.item_id, "produto_id": m.produto_id, "proprio": m.proprio, "apelido": m.apelido,
                      "tipo": "proprio" if m.proprio else "produto" if m.item_id == m.produto_id else "concorrente",
                      "vendedor_id": m.vendedor_id, "origem": m.origem, "demo": m.demo, "criado_em": m.criado_em,
                      "vinculado_a_id": m.vinculado_a_id,
                      "atual": leitura_dict(atual), "anterior": leitura_dict(anterior),
                      "precos": [x.preco for x in reversed(ultimas) if x.preco is not None],
                      "alertas": alertas(m, atual, anterior),
                      "tendencia": tendencia(db, m, cliente.empresa_id, list(reversed(todas)))})
    return saida


def historico(db: Session, m: AnuncioMonitorado, limite: int = 90) -> list[dict]:
    linhas = (db.query(LeituraMonitorado).filter_by(monitorado_id=m.id).order_by(LeituraMonitorado.id.desc()).limit(limite).all())
    return [leitura_dict(x) for x in reversed(linhas)]


def monitorado(db: Session, cliente: Cliente, monitorado_id: int) -> AnuncioMonitorado:
    m = db.get(AnuncioMonitorado, monitorado_id)
    if not m or m.cliente_id != cliente.id:
        raise LookupError("Anúncio monitorado não encontrado.")
    return m


def remover(db: Session, cliente: Cliente, m: AnuncioMonitorado, usuario: Usuario) -> None:
    db.query(LeituraMonitorado).filter_by(monitorado_id=m.id).delete()
    registrar(db, cliente.empresa_id, "exclusao", f"Tirou {m.item_id} do Radar de anúncios", cliente_id=cliente.id, usuario=usuario)
    db.delete(m)
    db.commit()


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


_PALAVRA = {"subindo": "subindo", "caindo": "caindo", "estavel": "estável"}


def _sentido(atual: float | None, antes: float | None, limiar_pct: float) -> tuple[str, float | None]:
    if atual is None or antes is None:
        return "sem_dados", None
    if not antes:
        return ("subindo", None) if atual > 0 else ("estavel", 0.0)
    pct = round((atual - antes) / abs(antes) * 100, 1)
    return ("subindo" if pct >= limiar_pct else "caindo" if pct <= -limiar_pct else "estavel"), pct


def _vendas_proprias(db: Session, cliente_id: int, item_id: str, agora: datetime) -> tuple[float | None, float | None]:
    """Unidades por dia nos últimos 7 dias e nos 7 anteriores (pedidos sincronizados no Financeiro)."""
    if db.query(Venda.id).filter(Venda.cliente_id == cliente_id).first() is None:
        return None, None

    def soma(ini, fim):
        return float(db.query(func.coalesce(func.sum(Venda.quantidade), 0)).filter(
            Venda.cliente_id == cliente_id, Venda.item_id == item_id, Venda.data_venda >= ini, Venda.data_venda < fim,
            Venda.status.in_(("paid", "confirmed", "partially_paid", "partially_refunded"))).scalar() or 0)
    j = timedelta(days=JANELA_TENDENCIA)
    return soma(agora - j, agora) / JANELA_TENDENCIA, soma(agora - 2 * j, agora - j) / JANELA_TENDENCIA


def _ritmo(serie: list[tuple[datetime, int]], ini: datetime, fim: datetime) -> float | None:
    """Vendas por dia entre duas datas a partir dos vendidos públicos (acumulados) lidos pela extensão."""
    dentro = [(d, v) for d, v in serie if ini - timedelta(days=2) <= d <= fim]
    if len(dentro) < 2:
        return None
    (d0, v0), (d1, v1) = dentro[0], dentro[-1]
    dias = (d1 - d0).total_seconds() / 86400
    return max(0.0, (v1 - v0) / dias) if dias >= 3 else None


def _vendas_pela_extensao(db: Session, empresa_id: int, m: AnuncioMonitorado, agora: datetime) -> tuple[float | None, float | None]:
    """Concorrente e produto de catálogo: a API não dá vendas, mas a extensão guarda os vendidos públicos
    que aparecem na página e na busca. Soma o ritmo de cada anúncio lido (todos os do produto, quando é catálogo)."""
    if m.produto_id and m.item_id == m.produto_id:
        filtro = LeituraEstudo.produto_id == m.produto_id
    else:
        filtro = LeituraEstudo.item_id == m.item_id
    linhas = (db.query(LeituraEstudo.item_id, LeituraEstudo.lida_em, LeituraEstudo.vendidos)
              .filter(LeituraEstudo.empresa_id == empresa_id, filtro, LeituraEstudo.vendidos.isnot(None),
                      LeituraEstudo.lida_em >= agora - timedelta(days=3 * JANELA_TENDENCIA)).order_by(LeituraEstudo.lida_em).all())
    series: dict[str, list] = {}
    for iid, quando, vendidos in linhas:
        series.setdefault(iid, []).append((_aware(quando), vendidos))
    j = timedelta(days=JANELA_TENDENCIA)
    agora_r = [r for r in (_ritmo(sr, agora - j, agora) for sr in series.values()) if r is not None]
    antes_r = [r for r in (_ritmo(sr, agora - 2 * j, agora - j) for sr in series.values()) if r is not None]
    return (round(sum(agora_r), 2) if agora_r else None), (round(sum(antes_r), 2) if antes_r else None)


def tendencia(db: Session, m: AnuncioMonitorado, empresa_id: int, leituras: list[LeituraMonitorado]) -> dict:
    """Para onde vão vendas, preço e mercado nos últimos 7 dias, comparando com a semana anterior
    (ou com a leitura mais antiga quando o anúncio entrou no radar há menos tempo)."""
    if not leituras:
        return {"resumo": "sem_dados", "sinais": []}
    atual = leituras[-1]
    agora = _aware(atual.lida_em)
    base = next((x for x in reversed(leituras[:-1]) if _aware(x.lida_em) <= agora - timedelta(days=JANELA_TENDENCIA - 1)), None)
    if base is None and len(leituras) > 1 and agora - _aware(leituras[0].lida_em) >= timedelta(days=2):
        base = leituras[0]
    da, dbase = atual.dados or {}, (base.dados or {}) if base else {}
    hoje = max(agora, datetime.now(timezone.utc))
    if m.proprio:
        v_agora, v_antes = _vendas_proprias(db, m.cliente_id, m.item_id, hoje)
    else:
        v_agora, v_antes = _vendas_pela_extensao(db, empresa_id, m, hoje)
    vendas, vendas_pct = _sentido(v_agora, v_antes, LIMIAR_VENDAS_PCT)
    if vendas != "sem_dados" and (v_agora or 0) < 0.15 and (v_antes or 0) < 0.15:
        vendas, vendas_pct = "estavel", 0.0
    preco, preco_pct = _sentido(atual.preco, base.preco if base else None, LIMIAR_PRECO_PCT)
    mercado, mercado_pct = _sentido(da.get("mercado_mediana"), dbase.get("mercado_mediana"), LIMIAR_PRECO_PCT)
    vend_a, vend_b = da.get("mercado_vendedores"), dbase.get("mercado_vendedores")
    if vend_a is None or vend_b is None:
        vendedores = "sem_dados"
    else:
        vendedores = "subindo" if vend_a - vend_b >= LIMIAR_VENDEDORES else "caindo" if vend_b - vend_a >= LIMIAR_VENDEDORES else "estavel"
    if m.proprio:
        visitas, visitas_pct = _sentido(atual.visitas_30d, base.visitas_30d if base else None, LIMIAR_VENDAS_PCT)
    else:
        visitas, visitas_pct = "sem_dados", None
    sinais = []
    if vendas != "sem_dados":
        pct = f" {vendas_pct:+.0f}%" if vendas_pct and vendas != "estavel" else ""
        ritmo = str(round(v_agora or 0, 1)).replace(".", ",")
        sinais.append({"tipo": "vendas", "sentido": vendas, "pct": vendas_pct, "texto": f"Vendas {_PALAVRA[vendas]}{pct} · {ritmo}/dia"})
    if preco != "sem_dados":
        pct = f" {preco_pct:+.1f}%".replace(".", ",") if preco != "estavel" else ""
        sinais.append({"tipo": "preco", "sentido": preco, "pct": preco_pct, "texto": f"Preço {_PALAVRA[preco]}{pct}"})
    if mercado != "sem_dados" and (m.proprio or m.item_id != m.produto_id):
        sinais.append({"tipo": "mercado", "sentido": mercado, "pct": mercado_pct, "texto": f"Preço do mercado {_PALAVRA[mercado]}"})
    if vendedores != "sem_dados":
        sinais.append({"tipo": "vendedores", "sentido": vendedores, "texto": f"Vendedores {_PALAVRA[vendedores]} ({vend_b} → {vend_a})"})
    if visitas != "sem_dados":
        sinais.append({"tipo": "visitas", "sentido": visitas, "pct": visitas_pct, "texto": f"Visitas {_PALAVRA[visitas]}"})
    if vendas == "subindo" or (vendas == "sem_dados" and vendedores == "subindo" and preco in ("subindo", "estavel")):
        resumo = "alta"
    elif vendas == "caindo":
        resumo = "queda"
    elif sinais:
        resumo = "estavel"
    else:
        resumo = "sem_dados"
    dica = ""
    if vendas == "sem_dados" and not m.proprio:
        dica = "Abra este anúncio (ou a busca dele) com a extensão Monvatti Pro de vez em quando: os vendidos que ela lê viram a tendência de vendas."
    elif vendas == "sem_dados":
        dica = "Sincronize as vendas em Vendas e Lucro para ver a tendência de vendas."
    return {"resumo": resumo, "sinais": sinais, "desde": _aware(base.lida_em).isoformat() if base else None,
            "fonte_vendas": "pedidos" if m.proprio else "extensao", "vendas_dia": v_agora, "vendas_dia_antes": v_antes, "dica": dica}


def precisa_atualizar(ultima: datetime | None, horas: int = 6) -> bool:
    if ultima is None:
        return True
    if ultima.tzinfo is None:
        ultima = ultima.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - ultima > timedelta(hours=horas)
