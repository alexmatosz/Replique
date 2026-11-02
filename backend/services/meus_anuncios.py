"""Meus anúncios: todas as publicações do cliente nas três plataformas numa
visão só, com vendas, margem e risco calculados pelo que o Replique já tem.

- vendas e margem dos últimos 30 dias: pedidos sincronizados no Financeiro
  (o mesmo cálculo de Vendas por pedido, com custo, tarifa, frete e imposto);
- risco: a checagem de antes de publicar (fotos copiadas, título idêntico ao
  do concorrente, palavras penalizadas);
- situação, preço e estoque ao vivo: /api/publicacoes/situacao;
- visitas: só do Mercado Livre, da conta do próprio cliente, sob demanda.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.marketplaces.base import LIMITE_TITULO
from backend.marketplaces.mercadolivre import MercadoLivre
from backend.marketplaces.registry import obter_adaptador
from backend.banco.models import Anuncio, Cliente, Publicacao, Usuario, Venda
from backend.services import financeiro, replique
from backend.services.publicacoes import removida

DIAS = 30
MAX_ETIQUETAS = 10


def _risco(anuncio: Anuncio, plataforma: str) -> tuple[str, list[str]]:
    if plataforma not in LIMITE_TITULO:
        return "baixo", []
    c = replique.checar(anuncio, [plataforma])[plataforma]
    graves = [a for a in c["avisos"] if "fotos ainda são" in a or "idêntico" in a or "penalizadas" in a]
    if c["erros"] or graves:
        return "alto", c["erros"] + graves
    return ("medio" if len(c["avisos"]) > 1 else "baixo"), c["avisos"]


def _vendas_por_item(db: Session, cliente: Cliente) -> dict[str, dict]:
    cfg = financeiro.config_de(db, cliente)
    cat = financeiro.Catalogo(db, cliente.id)
    fim = datetime.now(timezone.utc)
    linhas, _, _ = financeiro._calcular_periodo(db, cliente, cfg, cat, fim - timedelta(days=DIAS), fim)
    por = defaultdict(lambda: {"unidades": 0, "faturamento": 0.0, "lucro": 0.0, "sem_custo": False})
    for x in linhas:
        if not x["valida"]:
            continue
        p = por[x["item_id"]]
        p["unidades"] += x["quantidade"]
        p["faturamento"] += x["total"]
        p["lucro"] += x["lucro"]
        p["sem_custo"] = p["sem_custo"] or x["sem_custo"] or x["sem_vinculo"]
    return {k: {**v, "faturamento": round(v["faturamento"], 2), "lucro": round(v["lucro"], 2),
                "margem": round(v["lucro"] / v["faturamento"] * 100, 1) if v["faturamento"] else None} for k, v in por.items()}


def listar(db: Session, cliente: Cliente) -> dict:
    pares = [(p, a) for p, a in (db.query(Publicacao, Anuncio).join(Anuncio, Anuncio.id == Publicacao.anuncio_id)
                                 .filter(Publicacao.cliente_id == cliente.id, Publicacao.sucesso.is_(True))
                                 .order_by(Publicacao.id.desc()).limit(400)) if not removida(p)]
    liberado = bool(cliente.vendas_lucro)
    vendas = _vendas_por_item(db, cliente) if liberado else {}
    sincronizado = liberado and db.query(Venda.id).filter(Venda.cliente_id == cliente.id).first() is not None
    itens = []
    for p, a in pares:
        risco, motivos = _risco(a, p.plataforma)
        v = vendas.get(p.id_externo)
        itens.append({"publicacao_id": p.id, "anuncio_id": a.id, "plataforma": p.plataforma, "id_externo": p.id_externo,
                      "link": p.link, "titulo": a.titulo, "foto": (a.fotos or [""])[0], "sku": a.sku, "preco": a.preco,
                      "estoque": a.estoque, "demo": p.demo, "publicado_em": p.criada_em, "conta": p.conta_apelido,
                      "etiquetas": p.etiquetas or [], "risco": risco, "motivos_risco": motivos[:4],
                      "vendas_30d": v["unidades"] if v else (0 if sincronizado else None),
                      "faturamento_30d": v["faturamento"] if v else (0.0 if sincronizado else None),
                      "margem_30d": v["margem"] if v else None, "margem_incompleta": bool(v and v["sem_custo"])})
    etiquetas = sorted({e for x in itens for e in x["etiquetas"]}, key=str.lower)
    return {"itens": itens, "etiquetas": etiquetas, "vendas_sincronizadas": sincronizado, "dias": DIAS, "vendas_lucro": liberado}


def etiquetar(db: Session, cliente: Cliente, usuario: Usuario, ids: list[int], adicionar: list[str], remover: list[str]) -> int:
    adicionar = [e.strip()[:30] for e in adicionar if e.strip()]
    remover = {e.strip() for e in remover}
    pubs = db.query(Publicacao).filter(Publicacao.cliente_id == cliente.id, Publicacao.id.in_(ids or [0])).all()
    for p in pubs:
        atuais = [e for e in (p.etiquetas or []) if e not in remover]
        for e in adicionar:
            if e not in atuais:
                atuais.append(e)
        if len(atuais) > MAX_ETIQUETAS:
            raise ValueError(f"Cada anúncio aceita até {MAX_ETIQUETAS} etiquetas.")
        p.etiquetas = atuais
    db.commit()
    return len(pubs)


def visitas(db: Session, cliente: Cliente) -> dict[str, int]:
    """Visitas dos últimos 30 dias dos anúncios do cliente no Mercado Livre (conta dele)."""
    ad, _ = obter_adaptador(db, cliente.id, "mercadolivre")
    if not isinstance(ad, MercadoLivre):
        return {}
    ids = [p.id_externo for p in db.query(Publicacao).filter(
        Publicacao.cliente_id == cliente.id, Publicacao.plataforma == "mercadolivre", Publicacao.sucesso.is_(True),
        Publicacao.demo.is_(False), Publicacao.id_externo != "") if not removida(p)]
    ids = list(dict.fromkeys(ids))[:200]
    hoje = datetime.now(timezone.utc).date()
    saida = {}
    for i in range(0, len(ids), 50):
        r = ad._get("/items/visits", {"ids": ",".join(ids[i:i + 50]), "date_from": (hoje - timedelta(days=DIAS)).isoformat(),
                                       "date_to": hoje.isoformat()})
        if r.status_code >= 400:
            continue
        dados = r.json()
        for x in dados if isinstance(dados, list) else [dados]:
            if x.get("item_id"):
                saida[x["item_id"]] = int(x.get("total_visits") or 0)
    return saida
