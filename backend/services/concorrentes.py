"""Análise de concorrentes no Mercado Livre.

A base é o produto de catálogo: a API lista todas as ofertas dele (preço,
frete, tipo de anúncio, loja oficial e vendedor) e o perfil de cada
vendedor (/users). Visitas e vendas de outros vendedores não vêm pela API.
A linha do tempo de preço sai das leituras do Radar de anúncios.
"""

from __future__ import annotations

import hashlib
import json
import random
import statistics

from sqlalchemy.orm import Session

from backend.marketplaces.mercadolivre import MercadoLivre
from backend.banco.models import AnuncioMonitorado, Cliente, Concorrente, LeituraMonitorado, Usuario
from backend.services import ia, mercado, monitor
from backend.services.auditoria import registrar
from backend.services.financeiro import brl

TIPOS_ANUNCIO = {"gold_pro": "Premium", "gold_special": "Clássico", "free": "Grátis"}
LOGISTICA = {"fulfillment": "Full", "cross_docking": "Coleta", "drop_off": "Agência", "xd_drop_off": "Agência",
             "self_service": "Flex", "default": "Próprio"}


def _perfil(ad: MercadoLivre | None, vendedor_id: str) -> dict:
    if ad is None:
        rng = random.Random(int(hashlib.sha256(f"vend{vendedor_id}".encode()).hexdigest(), 16))
        return {"apelido": f"VENDEDOR_DEMO_{vendedor_id[-3:]}", "reputacao": rng.choice(["5_green", "4_light_green", "3_yellow"]),
                "medalha": rng.choice(["platinum", "gold", ""]), "vendas_total": rng.randint(200, 90000),
                "cidade": "São Paulo", "uf": "SP", "link": ""}
    r = ad._get(f"/users/{vendedor_id}")
    if r.status_code >= 400:
        return {"apelido": vendedor_id}
    u = r.json()
    rep = u.get("seller_reputation") or {}
    return {"apelido": u.get("nickname") or vendedor_id, "reputacao": rep.get("level_id") or "",
            "medalha": rep.get("power_seller_status") or "", "vendas_total": (rep.get("transactions") or {}).get("total"),
            "cidade": (u.get("address") or {}).get("city", ""), "uf": str((u.get("address") or {}).get("state", "")).removeprefix("BR-"),
            "link": u.get("permalink") or ""}


def concorrente_dict(c: Concorrente) -> dict:
    return {"id": c.id, "vendedor_id": c.vendedor_id, "apelido": c.apelido, "dados": c.dados or {}, "notas": c.notas,
            "demo": c.demo, "criado_em": c.criado_em}


def listar(db: Session, cliente: Cliente) -> list[dict]:
    lista = db.query(Concorrente).filter_by(cliente_id=cliente.id).order_by(Concorrente.apelido).all()
    acompanhados = {}
    for m in db.query(AnuncioMonitorado).filter(AnuncioMonitorado.cliente_id == cliente.id, AnuncioMonitorado.vendedor_id != ""):
        acompanhados.setdefault(m.vendedor_id, 0)
        acompanhados[m.vendedor_id] += 1
    return [{**concorrente_dict(c), "anuncios_no_radar": acompanhados.get(c.vendedor_id, 0)} for c in lista]


def cadastrar(db: Session, cliente: Cliente, usuario: Usuario, vendedor_id: str, notas: str = "") -> Concorrente:
    vendedor_id = (vendedor_id or "").strip()
    if not vendedor_id.isdigit():
        raise ValueError("Informe o número do vendedor (ID) ou cadastre pela tela do produto, no botão ao lado do vendedor.")
    if db.query(Concorrente).filter_by(cliente_id=cliente.id, plataforma="mercadolivre", vendedor_id=vendedor_id).first():
        raise ValueError("Esse vendedor já está na lista de concorrentes deste cliente.")
    meu = monitor._minha_conta(db, cliente)
    if meu and meu == vendedor_id:
        raise ValueError("Esse é o próprio cliente, não um concorrente.")
    ad = mercado.adaptador_ml(db, cliente.empresa_id, cliente.id)
    perfil = _perfil(ad, vendedor_id)
    c = Concorrente(empresa_id=cliente.empresa_id, cliente_id=cliente.id, vendedor_id=vendedor_id, apelido=perfil["apelido"][:200],
                    dados=perfil, notas=(notas or "")[:2000], demo=ad is None)
    db.add(c)
    registrar(db, cliente.empresa_id, "edicao", f"Cadastrou o concorrente {c.apelido}", cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return c


def remover(db: Session, cliente: Cliente, concorrente_id: int, usuario: Usuario) -> None:
    c = db.get(Concorrente, concorrente_id)
    if not c or c.cliente_id != cliente.id:
        raise LookupError("Concorrente não encontrado.")
    registrar(db, cliente.empresa_id, "exclusao", f"Tirou {c.apelido} da lista de concorrentes", cliente_id=cliente.id, usuario=usuario)
    db.delete(c)
    db.commit()


def _ofertas_demo(produto_id: str, meu: str) -> tuple[dict, list[dict]]:
    rng = random.Random(int(hashlib.sha256(f"prod{produto_id}".encode()).hexdigest(), 16))
    base = rng.uniform(40, 250)
    ofertas = []
    for i in range(8):
        vend = meu if i == 3 and meu else str(100000 + i)
        ofertas.append({"item_id": f"MLB-DEMO-{i}", "price": round(base * rng.uniform(0.85, 1.25), 2), "seller_id": vend,
                        "listing_type_id": rng.choice(["gold_pro", "gold_special"]), "official_store_id": 1 if i == 0 else None,
                        "shipping": {"free_shipping": True, "logistic_type": rng.choice(["fulfillment", "cross_docking", "drop_off"])}})
    return {"id": produto_id, "nome": "Produto de demonstração", "foto": "", "link": ""}, ofertas


def comparar(db: Session, cliente: Cliente, produto_id: str) -> dict:
    ad = mercado.adaptador_ml(db, cliente.empresa_id, cliente.id)
    meu = monitor._minha_conta(db, cliente)
    if ad is None:
        produto, ofertas = _ofertas_demo(produto_id, meu)
    else:
        info = mercado._produto(ad, produto_id)
        if not info:
            raise LookupError("Produto de catálogo não encontrado no Mercado Livre.")
        produto = {**info, "link": f"https://www.mercadolivre.com.br/p/{produto_id}"}
        ofertas, _ = monitor._ofertas(ad, produto_id)
    cadastrados = {c.vendedor_id: c for c in db.query(Concorrente).filter_by(cliente_id=cliente.id)}
    vendedores = {}
    for vid in dict.fromkeys(str(o.get("seller_id") or "") for o in ofertas):
        if vid:
            vendedores[vid] = cadastrados[vid].dados if vid in cadastrados else _perfil(ad, vid)
    ordem = sorted((o for o in ofertas if o.get("price")), key=lambda o: o["price"])
    linhas = []
    for pos, o in enumerate(ordem, start=1):
        vid = str(o.get("seller_id") or "")
        ship = o.get("shipping") or {}
        linhas.append({"posicao": pos, "item_id": o.get("item_id"), "preco": o.get("price"), "vendedor_id": vid,
                       "vendedor": vendedores.get(vid, {"apelido": vid}), "sou_eu": bool(meu) and vid == meu,
                       "cadastrado": vid in cadastrados, "tipo_anuncio": TIPOS_ANUNCIO.get(o.get("listing_type_id"), o.get("listing_type_id") or ""),
                       "frete_gratis": bool(ship.get("free_shipping")), "logistica": LOGISTICA.get(ship.get("logistic_type") or "", ship.get("logistic_type") or "—"),
                       "loja_oficial": bool(o.get("official_store_id")), "vendas": None, "visitas": None})
    precos = [x["preco"] for x in linhas]
    faixa = {"minimo": precos[0], "mediana": round(statistics.median(precos), 2), "maximo": precos[-1]} if precos else {}
    eu = next((x for x in linhas if x["sou_eu"]), None)
    if eu and faixa:
        largura = faixa["maximo"] - faixa["minimo"]
        eu_pct = round((eu["preco"] - faixa["minimo"]) / largura * 100) if largura else 50
        faixa.update({"meu_preco": eu["preco"], "minha_posicao": eu["posicao"], "meu_pct": eu_pct})
    return {"produto": produto, "ofertas": linhas, "faixa": faixa, "total": len(linhas), "demo": ad is None,
            "linha_do_tempo": linha_do_tempo(db, cliente, produto_id),
            "sem_api": "Vendas e visitas de outros vendedores não vêm pela API oficial do Mercado Livre."}


def linha_do_tempo(db: Session, cliente: Cliente, produto_id: str, limite: int = 60) -> list[dict]:
    """Mudanças de preço por oferta, comparando as leituras guardadas pelo Radar de anúncios."""
    m = db.query(AnuncioMonitorado).filter_by(cliente_id=cliente.id, plataforma="mercadolivre", item_id=produto_id).first()
    if not m:
        return []
    leituras = db.query(LeituraMonitorado).filter_by(monitorado_id=m.id).order_by(LeituraMonitorado.id).all()
    nomes = {c.vendedor_id: c.apelido for c in db.query(Concorrente).filter_by(cliente_id=cliente.id)}
    eventos, anterior = [], {}
    for leitura in leituras:
        ofertas = (leitura.dados or {}).get("ofertas") or {}
        for item_id, o in ofertas.items():
            antes = anterior.get(item_id)
            if antes and antes.get("preco") and o.get("preco") and antes["preco"] != o["preco"]:
                eventos.append({"em": leitura.lida_em, "item_id": item_id, "vendedor_id": o.get("vendedor_id"),
                                "vendedor": nomes.get(o.get("vendedor_id"), o.get("vendedor_id")),
                                "de": antes["preco"], "para": o["preco"]})
        for item_id in set(anterior) - set(ofertas):
            eventos.append({"em": leitura.lida_em, "item_id": item_id, "vendedor_id": anterior[item_id].get("vendedor_id"),
                            "vendedor": nomes.get(anterior[item_id].get("vendedor_id"), anterior[item_id].get("vendedor_id")),
                            "de": anterior[item_id].get("preco"), "para": None})
        anterior = ofertas or anterior
    return list(reversed(eventos))[:limite]


_SISTEMA = ("Você é consultor de e-commerce no Mercado Livre. Resuma, em português do Brasil, a estratégia dos concorrentes "
            "de um produto usando SOMENTE os dados enviados. Não invente vendas, visitas nem números que não estejam nos dados.")
_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["resumo", "recomendacoes"],
           "properties": {"resumo": {"type": "string"}, "recomendacoes": {"type": "array", "items": {"type": "string"}}}}


def _resumo_regras(c: dict) -> dict:
    o, f = c["ofertas"], c["faixa"]
    if not o:
        return {"resumo": "Nenhuma oferta ativa neste produto agora.", "recomendacoes": [], "fonte": "regras"}
    full = sum(1 for x in o if x["logistica"] == "Full")
    premium = sum(1 for x in o if x["tipo_anuncio"] == "Premium")
    oficiais = sum(1 for x in o if x["loja_oficial"])
    partes = [f"{len(o)} oferta(s) entre {brl(f['minimo'])} e {brl(f['maximo'])} (mediana {brl(f['mediana'])}).",
              f"{full} no Full, {premium} Premium e {oficiais} loja(s) oficial(is)."]
    recs = []
    if "minha_posicao" in f:
        partes.append(f"Você está em {f['minha_posicao']}º lugar no preço.")
        if f["meu_preco"] > f["mediana"]:
            recs.append("Seu preço está acima da mediana: confira a margem antes de baixar ou destaque frete e reputação.")
    else:
        recs.append("O cliente não tem oferta neste produto: veja se vale entrar no catálogo.")
    if full > len(o) / 2:
        recs.append("A maioria usa Full; sem ele o prazo de entrega tende a perder para os concorrentes.")
    return {"resumo": " ".join(partes), "recomendacoes": recs, "fonte": "regras"}


def resumo(db: Session, cliente: Cliente, produto_id: str) -> dict:
    c = comparar(db, cliente, produto_id)
    if not ia.disponivel() or c["demo"]:
        return _resumo_regras(c)
    dados = {"produto": c["produto"].get("nome"), "faixa_de_preco": c["faixa"],
             "ofertas": [{k: x[k] for k in ("posicao", "preco", "tipo_anuncio", "frete_gratis", "logistica", "loja_oficial", "sou_eu")}
                         | {"vendedor": x["vendedor"].get("apelido"), "reputacao": x["vendedor"].get("reputacao")} for x in c["ofertas"][:30]],
             "mudancas_de_preco": [{k: e[k] for k in ("em", "vendedor", "de", "para")} for e in c["linha_do_tempo"][:20]],
             "observacao": c["sem_api"]}
    try:
        saida = ia._claude_json(_SISTEMA, _SCHEMA, json.dumps(dados, ensure_ascii=False, default=str), max_tokens=2000)
    except Exception:
        return _resumo_regras(c)
    return {"resumo": saida["resumo"].strip(), "recomendacoes": [r.strip() for r in saida["recomendacoes"] if r.strip()][:5], "fonte": "ia"}
