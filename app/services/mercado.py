"""Radar de mercado: tendências e nichos do Mercado Livre.

Junta o que a API oficial libera:
- /trends: buscas em alta (as 10 primeiras são as que mais cresceram, as 20
  seguintes as mais buscadas e as 20 últimas as populares);
- /highlights: os mais vendidos da categoria;
- produto de catálogo e as ofertas dele: quantos vendedores disputam, preço,
  lojas oficiais e Full.

A nota de oportunidade pesa a procura contra a concorrência. Vendas de
concorrentes não vêm pela API, então a procura é medida pela posição nas
tendências e no ranking de mais vendidos.
"""

from __future__ import annotations

import math
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

from app import config
from app.marketplaces.mercadolivre import MercadoLivre
from app.marketplaces.registry import obter_adaptador
from app.models import ContaMarketplace

_CACHE_S = 3 * 3600
_cache: dict[str, tuple[float, object]] = {}

TIPOS = {"em_alta": "Em alta", "mais_buscado": "Mais buscado", "popular": "Popular", "mais_vendido": "Mais vendido"}


def adaptador_ml(db: Session, empresa_id: int, cliente_id: int) -> MercadoLivre:
    """Conta do cliente; sem ela, qualquer conta do ML da empresa (os dados são de mercado, não da loja)."""
    ad, _ = obter_adaptador(db, cliente_id, "mercadolivre")
    if isinstance(ad, MercadoLivre):
        return ad
    outra = (db.query(ContaMarketplace)
             .filter(ContaMarketplace.empresa_id == empresa_id, ContaMarketplace.plataforma == "mercadolivre",
                     ContaMarketplace.ativa.is_(True), ContaMarketplace.cliente_id.isnot(None))
             .order_by(ContaMarketplace.id.desc()).first())
    if outra:
        ad, _ = obter_adaptador(db, outra.cliente_id, "mercadolivre")
        if isinstance(ad, MercadoLivre):
            return ad
    raise ValueError("Conecte uma conta do Mercado Livre (de qualquer cliente) para ler as tendências do mercado.")


def _guardado(chave: str, gerar):
    agora = time.time()
    if (achado := _cache.get(chave)) and agora - achado[0] < _CACHE_S:
        return achado[1]
    valor = gerar()
    _cache[chave] = (agora, valor)
    return valor


def categorias(ad: MercadoLivre, pai: str | None = None) -> list[dict]:
    def gerar():
        if pai:
            info = _categoria(ad, pai)
            return info["filhas"] if info else []
        r = ad._get(f"/sites/{config.ML_SITE_ID}/categories")
        return [{"id": c["id"], "nome": c["name"]} for c in r.json()] if r.status_code < 400 else []
    return _guardado(f"cat:{pai or ''}", gerar)


def _categoria(ad: MercadoLivre, categoria_id: str | None) -> dict | None:
    if not categoria_id:
        return None

    def gerar():
        r = ad._get(f"/categories/{categoria_id}")
        if r.status_code >= 400:
            return None
        c = r.json()
        caminho = c.get("path_from_root") or []
        return {"nome": " › ".join(x["name"] for x in caminho[-2:]), "anuncios": c.get("total_items_in_this_category"),
                "filhas": [{"id": f["id"], "nome": f["name"], "anuncios": f.get("total_items_in_this_category")}
                           for f in c.get("children_categories") or []]}
    return _guardado(f"info:{categoria_id}", gerar)


def _concorrencia(ad: MercadoLivre, product_id: str) -> dict | None:
    r = ad._get(f"/products/{product_id}/items", {"limit": 50})
    if r.status_code >= 400:
        return None
    d = r.json()
    ofertas = d.get("results") or []
    if not ofertas:
        return None
    precos = [o["price"] for o in ofertas if o.get("price")]
    return {"vendedores": (d.get("paging") or {}).get("total", len(ofertas)),
            "preco_min": min(precos) if precos else None,
            "preco_mediano": round(statistics.median(precos), 2) if precos else None,
            "oficiais": sum(1 for o in ofertas if o.get("official_store_id")) / len(ofertas),
            "full": sum(1 for o in ofertas if (o.get("shipping") or {}).get("logistic_type") == "fulfillment") / len(ofertas),
            "categoria_id": ofertas[0].get("category_id")}


def _produto(ad: MercadoLivre, product_id: str) -> dict | None:
    r = ad._get(f"/products/{product_id}")
    if r.status_code >= 400:
        return None
    p = r.json()
    fotos = p.get("pictures") or []
    return {"id": p.get("id"), "nome": p.get("name") or "", "foto": fotos[0].get("url") if fotos else ""}


def _juntar(concorrencias: list[dict]) -> dict:
    if not concorrencias:
        return {}
    precos = [c["preco_mediano"] for c in concorrencias if c.get("preco_mediano")]
    minimos = [c["preco_min"] for c in concorrencias if c.get("preco_min")]
    return {"vendedores": round(statistics.mean(c["vendedores"] for c in concorrencias)),
            "preco_min": min(minimos) if minimos else None,
            "preco_mediano": round(statistics.median(precos), 2) if precos else None,
            "oficiais": round(statistics.mean(c["oficiais"] for c in concorrencias), 2),
            "full": round(statistics.mean(c["full"] for c in concorrencias), 2)}


def _completar(ad: MercadoLivre, dados: dict, categoria_id: str | None) -> dict:
    info = _categoria(ad, categoria_id)
    dados["categoria_id"] = categoria_id
    dados["categoria"] = info["nome"] if info else ""
    dados["anuncios_categoria"] = info["anuncios"] if info else None
    dados["concorrencia"] = concorrencia(dados)
    return dados


def concorrencia(dados: dict) -> int:
    """0 a 100. Mistura quantos anúncios a categoria tem (saturação), quantos
    vendedores disputam os produtos de catálogo e o peso de lojas oficiais e Full."""
    partes, pesos = [], []
    if dados.get("anuncios_categoria"):
        partes.append(min(1.0, max(0.0, (math.log10(dados["anuncios_categoria"]) - 2) / 4)))
        pesos.append(0.6)
    if dados.get("vendedores"):
        partes.append(min(1.0, (dados["vendedores"] - 1) / 30))
        pesos.append(0.4)
    if not pesos:
        return 50
    base = sum(p * w for p, w in zip(partes, pesos)) / sum(pesos)
    base += 0.15 * dados.get("oficiais", 0) + 0.10 * dados.get("full", 0)
    return round(min(1.0, base) * 100)


def nota(demanda: float, dados: dict) -> int:
    """0 a 100: muita procura e pouca concorrência = oportunidade."""
    return max(0, min(100, round(0.55 * demanda + 0.45 * (100 - dados["concorrencia"]))))


def _tipo_tendencia(posicao: int) -> tuple[str, float]:
    if posicao < 10:
        return "em_alta", 100 - posicao
    if posicao < 30:
        return "mais_buscado", 85 - (posicao - 10) * 0.75
    return "popular", 70 - (posicao - 30) * 0.75


def _analisar_termo(ad: MercadoLivre, termo: str) -> dict:
    sugestao = (ad.prever_categorias(termo, 1) or [{}])[0]
    filtro = {"domain_id": sugestao["domain_id"]} if sugestao.get("domain_id") else {}
    r = ad._get("/products/search", {"status": "active", "site_id": config.ML_SITE_ID, "q": termo, "limit": 3, **filtro})
    produtos = (r.json().get("results") or [])[:3] if r.status_code < 400 else []
    dados = _juntar([c for p in produtos if p.get("id") and (c := _concorrencia(ad, p["id"]))])
    dados["exemplo"] = produtos[0].get("name") if produtos else ""
    return _completar(ad, dados, sugestao.get("category_id"))


def tendencias(ad: MercadoLivre, categoria: str | None = None) -> list[dict]:
    def gerar():
        ad._token()
        caminho = f"/trends/{config.ML_SITE_ID}" + (f"/{categoria}" if categoria else "")
        r = ad._get(caminho)
        if r.status_code >= 400:
            raise ValueError("O Mercado Livre não devolveu as tendências agora. Tente de novo em instantes.")
        termos = [t for t in r.json() if t.get("keyword")][:50]
        with ThreadPoolExecutor(max_workers=10) as pool:
            analises = list(pool.map(lambda t: _analisar_termo(ad, t["keyword"]), termos))
        saida = []
        for i, (t, dados) in enumerate(zip(termos, analises)):
            tipo, demanda = _tipo_tendencia(i)
            saida.append({"termo": t["keyword"], "link": t.get("url", ""), "tipo": tipo, "posicao": i + 1,
                          **dados, "nota": nota(demanda, dados)})
        return saida
    return _guardado(f"tend:{categoria or ''}", gerar)


def mais_vendidos(ad: MercadoLivre, categoria: str) -> list[dict]:
    def gerar():
        ad._token()
        r = ad._get(f"/highlights/{config.ML_SITE_ID}/category/{categoria}")
        if r.status_code >= 400:
            raise ValueError("Essa categoria não tem ranking de mais vendidos. Escolha uma subcategoria.")
        ids = [(c["id"], c.get("position") or i + 1) for i, c in enumerate(r.json().get("content") or [])
               if c.get("type") == "PRODUCT"][:20]

        def analisar(par):
            pid, posicao = par
            produto = _produto(ad, pid)
            if not produto:
                return None
            dados = _concorrencia(ad, pid) or {}
            dados = _completar(ad, dados, dados.pop("categoria_id", None) or categoria)
            demanda = max(40, 100 - (posicao - 1) * 2.5)
            return {"termo": produto["nome"], "link": f"https://www.mercadolivre.com.br/p/{pid}", "tipo": "mais_vendido",
                    "posicao": posicao, "foto": produto["foto"], "produto_id": pid, **dados, "nota": nota(demanda, dados)}
        with ThreadPoolExecutor(max_workers=10) as pool:
            return [x for x in pool.map(analisar, ids) if x]
    return _guardado(f"top:{categoria}", gerar)
