"""Radar de concorrência dos anúncios publicados no Mercado Livre.

Compara o preço do anúncio do cliente com o dos concorrentes do mesmo
produto (vendedores do produto de catálogo, ou o anúncio que foi copiado) e
sugere um preço, sem descer abaixo da margem mínima. Nada muda sozinho: o
operador decide e aplica.
"""

from __future__ import annotations

import hashlib
import statistics

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import config
from app.marketplaces.base import ErroMarketplace
from app.marketplaces.registry import obter_adaptador
from app.models import Anuncio, ContaMarketplace, Publicacao, RadarPreco, Usuario
from app.services import margem, publicacoes
from app.services.auditoria import registrar

DEGRAU = 0.10


def publicacao_ml(db: Session, anuncio: Anuncio) -> Publicacao | None:
    """Publicação no ML que o radar acompanha. As que saíram da lista (apagadas
    no ML ou tiradas pela equipe) não contam mais."""
    pubs = (db.query(Publicacao).filter_by(anuncio_id=anuncio.id, plataforma="mercadolivre", sucesso=True)
            .order_by(Publicacao.demo, Publicacao.id.desc()).all())
    return next((p for p in pubs if not publicacoes.removida(p)), None)


def conta_ml_conectada(db: Session, cliente_id: int) -> ContaMarketplace | None:
    return (db.query(ContaMarketplace).filter_by(cliente_id=cliente_id, plataforma="mercadolivre", ativa=True)
            .order_by(ContaMarketplace.id.desc()).first())


def contas(pub: Publicacao, conectada: ContaMarketplace | None) -> dict:
    """Quem publicou o anúncio e qual conta está conectada agora. outra_conta=True
    quando dá para afirmar que são vendedores diferentes (o ML recusa com 403)."""
    publicou = pub.conta_apelido or ""
    atual = conectada.apelido if conectada else ""
    outra = bool(pub.conta_id_externo and conectada and conectada.id_externo
                 and pub.conta_id_externo != conectada.id_externo)
    return {"publicou": publicou, "publicou_id": pub.conta_id_externo or "", "conectada": atual,
            "conectada_id": conectada.id_externo if conectada else "", "outra_conta": outra,
            "publicado_em": pub.criada_em}


def _produto_de_catalogo(anuncio: Anuncio) -> str:
    cfg = (anuncio.por_plataforma or {}).get("mercadolivre", {})
    origem = anuncio.origem or {}
    if cfg.get("catalog_product_id"):
        return cfg["catalog_product_id"]
    return origem.get("id_externo", "") if origem.get("plataforma") == "mercadolivre" and origem.get("tipo") == "PRODUCT" else ""


def _concorrentes_demo(anuncio: Anuncio) -> list[dict]:
    semente = int(hashlib.sha256(f"radar{anuncio.id}".encode()).hexdigest(), 16)
    base = anuncio.preco or 100
    return [{"item_id": f"MLB-DEMO-{i}", "preco": round(base * (0.88 + ((semente >> (i * 5)) % 30) / 100), 2),
             "vendedor": f"vendedor {i}"} for i in range(1, 6)]


def sugerir(meu_preco: float, precos: list[float], preco_minimo: float | None) -> tuple[str, float | None, str]:
    if not precos:
        return "sem_dados", None, "Não encontrei concorrentes com preço para comparar."
    menor = min(precos)
    alvo = round(menor - DEGRAU, 2)
    piso = f" (a margem mínima de {config.MARGEM_MINIMA_PCT:g}% não deixa descer mais)"
    if meu_preco > menor + 0.005:
        if preco_minimo and alvo < preco_minimo:
            if meu_preco <= preco_minimo:
                return "no_limite", None, (f"O menor concorrente está em R$ {menor:.2f}, mas o seu preço já é o mínimo para "
                                           f"a margem de {config.MARGEM_MINIMA_PCT:g}%. Concorra por reputação, fotos e frete.")
            return "acima", preco_minimo, f"Menor concorrente: R$ {menor:.2f}. Dá para descer até R$ {preco_minimo:.2f}{piso}."
        return "acima", alvo, f"Você está R$ {meu_preco - menor:.2f} acima do menor concorrente (R$ {menor:.2f})."
    if meu_preco < menor * 0.95:
        return "abaixo", alvo, (f"Você está {1 - meu_preco / menor:.0%} abaixo do menor concorrente (R$ {menor:.2f}): "
                                "dá para subir o preço e ainda ser o mais barato.")
    return "competitivo", None, f"Preço competitivo: o menor concorrente está em R$ {menor:.2f}."


def atualizar(db: Session, anuncio: Anuncio) -> RadarPreco:
    pub = publicacao_ml(db, anuncio)
    if not pub:
        raise ValueError("O radar acompanha anúncios já publicados no Mercado Livre. Publique este primeiro.")
    adaptador, _ = obter_adaptador(db, anuncio.cliente_id, "mercadolivre", "publicar")
    demo = adaptador.demo or pub.demo
    dados: dict = {"item_id": pub.id_externo, "link": pub.link}
    if demo:
        meu_preco, dados["status"] = anuncio.preco, "active"
        concorrentes = _concorrentes_demo(anuncio)
    else:
        try:
            meu = adaptador.item(pub.id_externo)
        except ErroMarketplace as e:
            if publicacoes._eh_403(e):
                raise ValueError(publicacoes.outra_conta(pub, adaptador.conta_info.get("apelido", ""))) from e
            raise ValueError(e.mensagem) from e
        meu_preco = float(meu.get("price") or anuncio.preco or 0)
        dados.update({"status": meu.get("status"), "vendidos": meu.get("sold_quantity"),
                      "estoque": meu.get("available_quantity"), "link": meu.get("permalink") or pub.link})
        concorrentes = []
        if produto := _produto_de_catalogo(anuncio):
            concorrentes = [{"item_id": o.get("item_id"), "preco": float(o["price"]), "vendedor": str(o.get("seller_id", ""))}
                            for o in adaptador.ofertas_do_produto(produto) if o.get("item_id") != pub.id_externo]
            dados["fonte"] = f"vendedores do produto de catálogo {produto}"
        origem = anuncio.origem or {}
        if not concorrentes and origem.get("plataforma") == "mercadolivre" and origem.get("tipo", "ITEM") == "ITEM":
            try:
                ref = adaptador.item(origem["id_externo"])
                if ref.get("price"):
                    concorrentes = [{"item_id": origem["id_externo"], "preco": float(ref["price"]), "vendedor": "anúncio copiado"}]
                    dados["fonte"] = "anúncio que foi copiado"
            except (ErroMarketplace, KeyError):
                pass
    precos = [c["preco"] for c in concorrentes if c.get("preco")]
    calc = margem.calcular(db, anuncio, ["mercadolivre"], meu_preco)["mercadolivre"]
    situacao, sugerido, texto = sugerir(meu_preco, precos, calc.get("preco_minimo"))
    dados.update({"meu_preco": meu_preco, "concorrentes": sorted(concorrentes, key=lambda c: c["preco"])[:10],
                  "quantidade": len(precos), "menor": min(precos) if precos else None,
                  "mediana": statistics.median(precos) if precos else None, "situacao": situacao,
                  "sugerido": sugerido, "texto": texto, "preco_minimo": calc.get("preco_minimo"),
                  "margem_atual": calc.get("margem_pct") if calc.get("custo") is not None else None})
    leitura = RadarPreco(empresa_id=anuncio.empresa_id, cliente_id=anuncio.cliente_id, anuncio_id=anuncio.id,
                         dados=dados, demo=demo)
    db.add(leitura)
    db.commit()
    return leitura


def aplicar_preco(db: Session, anuncio: Anuncio, preco: float, usuario: Usuario | None) -> dict:
    """Muda o preço do anúncio PUBLICADO no Mercado Livre (e no rascunho)."""
    if preco <= 0:
        raise ValueError("Preço inválido.")
    calc = margem.calcular(db, anuncio, ["mercadolivre"], preco)["mercadolivre"]
    if calc["alerta"] == "prejuizo":
        raise ValueError(f"Neste preço a venda dá prejuízo ({calc['mensagem']}). Revise o custo ou escolha outro preço.")
    pub = publicacao_ml(db, anuncio)
    if not pub:
        raise ValueError("Este rascunho não tem anúncio publicado no Mercado Livre.")
    adaptador, _ = obter_adaptador(db, anuncio.cliente_id, "mercadolivre", "publicar")
    anterior = anuncio.preco
    if not (adaptador.demo or pub.demo):
        try:
            adaptador.atualizar_preco(pub.id_externo, preco)
        except ErroMarketplace as e:
            if publicacoes._eh_403(e):
                raise ValueError(publicacoes.outra_conta(pub, adaptador.conta_info.get("apelido", ""))) from e
            raise ValueError(e.mensagem) from e
    anuncio.preco = round(preco, 2)
    simulado = adaptador.demo or pub.demo
    registrar(db, anuncio.empresa_id, "preco",
              f"{'Simulou a mudança' if simulado else 'Mudou'} o preço de “{anuncio.titulo}” no Mercado Livre: "
              f"R$ {anterior:.2f} → R$ {preco:.2f}", cliente_id=anuncio.cliente_id, usuario=usuario,
              anuncio_id=anuncio.id, id_externo=pub.id_externo, plataforma="mercadolivre")
    db.commit()
    return {"ok": True, "simulado": simulado, "preco": anuncio.preco, "margem": calc}


def ultimas(db: Session, anuncio_ids: list[int]) -> dict[int, RadarPreco]:
    if not anuncio_ids:
        return {}
    ids = (db.query(func.max(RadarPreco.id)).filter(RadarPreco.anuncio_id.in_(anuncio_ids))
           .group_by(RadarPreco.anuncio_id).all())
    return {r.anuncio_id: r for r in db.query(RadarPreco).filter(RadarPreco.id.in_([i for (i,) in ids] or [0]))}
