"""Mapeador de produtos: tendências e nichos do Mercado Livre.

Junta o que a API oficial libera:
- /trends: buscas em alta (as 10 primeiras são as que mais cresceram, as 20
  seguintes as mais buscadas e as 20 últimas as populares);
- /highlights: os mais vendidos da categoria;
- produto de catálogo e as ofertas dele: quantos vendedores disputam, preço,
  lojas oficiais e Full;
- /listing_prices: a tarifa de venda do ML para o preço médio.

Cada leitura fica guardada (ColetaMercado). A tendência compara a posição de
hoje com a coleta anterior. Vendas de concorrentes não vêm pela API, então a
procura é medida pela posição nas tendências e no ranking de mais vendidos.
"""

from __future__ import annotations

import hashlib
import math
import random
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import config
from app.marketplaces.mercadolivre import MercadoLivre
from app.marketplaces.registry import obter_adaptador
from app.models import ColetaMercado, ContaMarketplace

_CACHE_S = 3 * 3600
_cache: dict[str, tuple[float, object]] = {}

TIPOS = {"em_alta": "Em alta", "mais_buscado": "Mais buscado", "popular": "Popular", "mais_vendido": "Mais vendido"}
PESOS = {"demanda": 0.35, "tendencia": 0.15, "concorrencia": 0.30, "preco": 0.10, "margem": 0.10}
PONTOS_TENDENCIA = {"subindo": 100, "novo": 60, "estavel": 60, "caindo": 20}
DEGRAU_TENDENCIA = 3
INTERVALO_COLETA = timedelta(hours=2)
DISTANCIA_COMPARACAO = timedelta(hours=12)


def adaptador_ml(db: Session, empresa_id: int, cliente_id: int) -> MercadoLivre | None:
    """Conta do cliente; sem ela, qualquer conta do ML da empresa (os dados são de
    mercado, não da loja). Sem nenhuma, None no modo demonstração."""
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
    if config.MODO_DEMONSTRACAO:
        return None
    raise ValueError("Conecte uma conta do Mercado Livre (de qualquer cliente) para ler as tendências do mercado.")


def _guardado(chave: str, gerar):
    agora = time.time()
    if (achado := _cache.get(chave)) and agora - achado[0] < _CACHE_S:
        return achado[1]
    valor = gerar()
    _cache[chave] = (agora, valor)
    return valor


def categorias(ad: MercadoLivre | None, pai: str | None = None) -> list[dict]:
    if ad is None:
        return [{"id": c, "nome": n} for c, n in _CATEGORIAS_DEMO] if not pai else []

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
    dados["tarifa"] = None
    if dados.get("preco_mediano"):
        t = ad.tarifa_venda(dados["preco_mediano"], "gold_special", categoria_id or "")
        if t:
            dados["tarifa"] = round(float(t["sale_fee_amount"]), 2)
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


def _demanda_tendencia(posicao: int) -> tuple[str, float]:
    if posicao < 10:
        return "em_alta", 100 - posicao
    if posicao < 30:
        return "mais_buscado", 85 - (posicao - 10) * 0.75
    return "popular", 70 - (posicao - 30) * 0.75


def pontos_preco(preco: float | None) -> int:
    """Faixa de preço que costuma girar bem no marketplace: nem tão barata que a
    tarifa fixa come a margem, nem tão cara que a compra trava."""
    if not preco:
        return 50
    if 40 <= preco <= 300:
        return 100
    if 20 <= preco < 40 or 300 < preco <= 600:
        return 70
    return 40


def margem_estimada(preco: float | None, tarifa: float | None, imposto_pct: float) -> float | None:
    """% do preço que sobra depois da tarifa do ML e do imposto (antes do frete e do custo do produto)."""
    if not preco or tarifa is None:
        return None
    return round((preco - tarifa - preco * imposto_pct / 100) / preco * 100, 1)


def pontos_margem(margem: float | None) -> int:
    if margem is None:
        return 50
    return round(min(100, max(0, (margem - 40) / 30 * 100)))


def tendencia(posicao: int | None, anterior: dict | None) -> str:
    if not anterior or anterior.get("posicao") is None or posicao is None:
        return "novo"
    if anterior["posicao"] - posicao >= DEGRAU_TENDENCIA:
        return "subindo"
    if posicao - anterior["posicao"] >= DEGRAU_TENDENCIA:
        return "caindo"
    return "estavel"


def pontuar(item: dict, anterior: dict | None, imposto_pct: float) -> dict:
    item["tendencia"] = tendencia(item.get("posicao"), anterior)
    item["posicao_anterior"] = anterior.get("posicao") if anterior else None
    item["margem_estimada"] = margem_estimada(item.get("preco_mediano"), item.get("tarifa"), imposto_pct)
    partes = {"demanda": round(item["demanda"]), "tendencia": PONTOS_TENDENCIA[item["tendencia"]],
              "concorrencia": 100 - item["concorrencia"], "preco": pontos_preco(item.get("preco_mediano")),
              "margem": pontos_margem(item["margem_estimada"])}
    item["partes"] = partes
    item["nota"] = max(0, min(100, round(sum(partes[k] * w for k, w in PESOS.items()))))
    return item


def chave(item: dict) -> str:
    if item.get("tipo") == "mais_vendido":
        return f"top:{item.get('produto_id')}"
    return f"busca:{item['termo'].strip().lower()}"[:200]


def anteriores(db: Session, empresa_id: int, chaves: list[str]) -> dict[str, dict]:
    """Coleta mais recente de cada chave feita há pelo menos 12 h (base da tendência)."""
    limite = datetime.now(timezone.utc) - DISTANCIA_COMPARACAO
    saida: dict[str, dict] = {}
    linhas = (db.query(ColetaMercado).filter(ColetaMercado.empresa_id == empresa_id, ColetaMercado.chave.in_(chaves or [""]),
                                             ColetaMercado.coletada_em <= limite)
              .order_by(ColetaMercado.coletada_em.desc()).all())
    for c in linhas:
        saida.setdefault(c.chave, {"posicao": c.posicao, "nota": c.nota, "preco": c.preco_mediano, "em": c.coletada_em})
    return saida


def historico(db: Session, empresa_id: int, chave_item: str, limite: int = 30) -> list[dict]:
    linhas = (db.query(ColetaMercado).filter_by(empresa_id=empresa_id, chave=chave_item)
              .order_by(ColetaMercado.coletada_em.desc()).limit(limite).all())
    return [{"em": c.coletada_em, "posicao": c.posicao, "nota": c.nota, "preco": c.preco_mediano,
             "vendedores": c.vendedores} for c in reversed(linhas)]


def registrar(db: Session, empresa_id: int, itens: list[dict], origem: str, demo: bool) -> None:
    """Guarda a coleta. Leituras repetidas em menos de 2 h não viram histórico novo."""
    desde = datetime.now(timezone.utc) - INTERVALO_COLETA
    chaves = [chave(x) for x in itens]
    recentes = {c for (c,) in db.query(ColetaMercado.chave).filter(
        ColetaMercado.empresa_id == empresa_id, ColetaMercado.chave.in_(chaves or [""]), ColetaMercado.coletada_em >= desde)}
    for x, k in zip(itens, chaves):
        if k in recentes:
            continue
        db.add(ColetaMercado(empresa_id=empresa_id, chave=k, origem=origem, termo=x["termo"][:300], posicao=x.get("posicao"),
                             nota=x.get("nota"), preco_mediano=x.get("preco_mediano"), vendedores=x.get("vendedores"), demo=demo))
    db.commit()


def mapear(db: Session, empresa_id: int, base: list[dict], origem: str, imposto_pct: float, demo: bool) -> list[dict]:
    itens = [dict(x) for x in base]
    ant = anteriores(db, empresa_id, [chave(x) for x in itens])
    for x in itens:
        x["chave"] = chave(x)
        x["demo"] = demo
        pontuar(x, ant.get(x["chave"]), imposto_pct)
    registrar(db, empresa_id, itens, origem, demo)
    return itens


def _analisar_termo(ad: MercadoLivre, termo: str) -> dict:
    sugestao = (ad.prever_categorias(termo, 1) or [{}])[0]
    filtro = {"domain_id": sugestao["domain_id"]} if sugestao.get("domain_id") else {}
    r = ad._get("/products/search", {"status": "active", "site_id": config.ML_SITE_ID, "q": termo, "limit": 3, **filtro})
    produtos = (r.json().get("results") or [])[:3] if r.status_code < 400 else []
    dados = _juntar([c for p in produtos if p.get("id") and (c := _concorrencia(ad, p["id"]))])
    dados["exemplo"] = produtos[0].get("name") if produtos else ""
    dados["produto_id"] = produtos[0].get("id") if produtos else None
    return _completar(ad, dados, sugestao.get("category_id"))


def tendencias(ad: MercadoLivre | None, categoria: str | None = None) -> list[dict]:
    if ad is None:
        return _demo("tend", categoria)

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
            tipo, demanda = _demanda_tendencia(i)
            saida.append({"termo": t["keyword"], "link": t.get("url", ""), "tipo": tipo, "posicao": i + 1,
                          "demanda": demanda, **dados})
        return saida
    return _guardado(f"tend:{categoria or ''}", gerar)


def mais_vendidos(ad: MercadoLivre | None, categoria: str) -> list[dict]:
    if ad is None:
        return _demo("top", categoria)

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
            return {"termo": produto["nome"], "link": f"https://www.mercadolivre.com.br/p/{pid}", "tipo": "mais_vendido",
                    "posicao": posicao, "foto": produto["foto"], "produto_id": pid,
                    "demanda": max(40, 100 - (posicao - 1) * 2.5), **dados}
        with ThreadPoolExecutor(max_workers=10) as pool:
            return [x for x in pool.map(analisar, ids) if x]
    return _guardado(f"top:{categoria}", gerar)


MAX_CATEGORIAS_OPORTUNIDADE = 5
PESOS_OPORTUNIDADE = {"momento": 0.40, "concorrencia": 0.30, "margem": 0.20, "preco": 0.10}
DIAS_MOMENTO = 10


def _momento(item: dict, hist: list[dict]) -> tuple[int, dict]:
    """Força da tendência: posição nas buscas em alta, se está subindo e há quantos dias aparece no topo.
    Usa as coletas guardadas (cada pesquisa no Mapeador ou nas Oportunidades vira histórico)."""
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS_MOMENTO)
    recentes = [h for h in hist if h.get("posicao") and (h["em"] if h["em"].tzinfo else h["em"].replace(tzinfo=timezone.utc)) >= limite]
    dias_topo = len({h["em"].date() for h in recentes if h["posicao"] <= 10})
    posicoes = [h["posicao"] for h in recentes]
    melhora = (max(posicoes) - item["posicao"]) if posicoes and item.get("posicao") else 0
    pontos = 0.5 * item["demanda"] + 0.3 * PONTOS_TENDENCIA[item["tendencia"]] + 0.2 * min(100, dias_topo * 25)
    return round(min(100, pontos)), {"dias_topo": dias_topo, "melhora": max(0, melhora), "coletas": len(recentes)}


def _frete_estimado(ad: MercadoLivre | None, categoria_id: str | None, preco: float | None, cache: dict) -> float | None:
    """Frete grátis pela medida típica da categoria (a mesma estimativa da extensão quando o anúncio não tem peso)."""
    if ad is None or not categoria_id or not preco:
        return None
    if preco < 79:
        return 0.0
    chave_f = (categoria_id, round(preco / 10))
    if chave_f not in cache:
        try:
            medidas = ad.medidas_da_categoria(categoria_id)
            cache[chave_f] = ad.custo_frete_gratis(preco, medidas, "gold_special") if medidas else None
        except Exception:
            cache[chave_f] = None
    return cache[chave_f]


def _motivos(x: dict, mom: dict) -> tuple[list[str], list[str]]:
    bons, cuidados = [], []
    if x.get("tipo") == "em_alta":
        bons.append(f"Entre as buscas que mais cresceram no Mercado Livre ({x['posicao']}º)")
    elif x.get("tipo") == "mais_buscado":
        bons.append(f"Entre as mais buscadas ({x['posicao']}º)")
    if x.get("tendencia") == "subindo" and x.get("posicao_anterior"):
        bons.append(f"Subiu {x['posicao_anterior'] - x['posicao']} posições desde a coleta anterior")
    if mom["dias_topo"] >= 2:
        bons.append(f"No topo das buscas em {mom['dias_topo']} dias diferentes")
    if x.get("concorrencia", 100) <= 35:
        bons.append("Pouca concorrência" + (f" ({x['vendedores']} vendedor(es) no catálogo)" if x.get("vendedores") else ""))
    elif x.get("concorrencia", 0) >= 65:
        cuidados.append("Concorrência alta")
    if x.get("vendedores") and not x.get("oficiais"):
        bons.append("Nenhuma loja oficial disputando")
    elif (x.get("oficiais") or 0) >= 0.3:
        cuidados.append("Lojas oficiais disputando")
    if (x.get("full") or 0) >= 0.5:
        cuidados.append("Metade ou mais dos vendedores no Full")
    if x.get("margem_estimada") is not None and x["margem_estimada"] >= 70:
        bons.append(f"Sobra {str(x['margem_estimada']).replace('.', ',')}% do preço depois da tarifa e do imposto")
    if x.get("tendencia") == "caindo":
        cuidados.append("Perdendo posição nas buscas")
    if x.get("preco_mediano") and x["preco_mediano"] < 40:
        cuidados.append("Preço baixo: a taxa fixa do ML pesa")
    if x.get("tipo") == "popular" and x.get("tendencia") != "subindo":
        cuidados.append("Busca popular, mas sem sinal de crescimento")
    return bons, cuidados


def oportunidades(db: Session, empresa_id: int, ad: MercadoLivre | None, categorias: list[str], imposto_pct: float,
                  margem_alvo: float) -> dict:
    """Cruza as buscas em alta de até 5 categorias com o histórico das coletas, a concorrência e a margem.
    Para cada uma diz por que pode ser oportunidade, o que pede cuidado e quanto dá para pagar no produto
    para sobrar a margem desejada (preço mediano − tarifa − frete − imposto − margem)."""
    base, vistos = [], set()
    for cat in (categorias or [None])[:MAX_CATEGORIAS_OPORTUNIDADE]:
        for x in tendencias(ad, cat):
            k = x["termo"].strip().lower()
            if k not in vistos:
                vistos.add(k)
                base.append(x)
    itens = mapear(db, empresa_id, base, "oportunidades", imposto_pct, ad is None)
    cache_frete: dict = {}
    saida = []
    for x in itens:
        pts_momento, mom = _momento(x, historico(db, empresa_id, x["chave"], 40))
        partes = {"momento": pts_momento, "concorrencia": 100 - x["concorrencia"], "margem": pontos_margem(x["margem_estimada"]),
                  "preco": pontos_preco(x.get("preco_mediano"))}
        x["partes_oportunidade"] = partes
        x["oportunidade"] = max(0, min(100, round(sum(partes[k] * w for k, w in PESOS_OPORTUNIDADE.items()))))
        x["momento"] = mom
        x["motivos"], x["cuidados"] = _motivos(x, mom)
        saida.append(x)
    saida.sort(key=lambda x: -x["oportunidade"])
    saida = saida[:30]
    for x in saida:
        preco = x.get("preco_mediano")
        frete = _frete_estimado(ad, x.get("categoria_id"), preco, cache_frete)
        x["frete_estimado"] = frete
        if preco and x.get("tarifa") is not None:
            x["custo_maximo"] = round(preco * (1 - (imposto_pct + margem_alvo) / 100) - x["tarifa"] - (frete or 0), 2)
        else:
            x["custo_maximo"] = None
    return {"itens": saida, "margem_alvo": margem_alvo, "imposto_pct": imposto_pct, "pesos": PESOS_OPORTUNIDADE,
            "categorias": categorias[:MAX_CATEGORIAS_OPORTUNIDADE]}


_CATEGORIAS_DEMO = [("MLB900001", "Casa e Cozinha (demonstração)"), ("MLB900002", "Esportes (demonstração)")]
_TERMOS_DEMO = ["garrafa térmica inox", "organizador de gaveta", "luminária led recarregável", "pote hermético vidro",
                "tapete de yoga", "caneca térmica", "mochila notebook", "suporte de celular", "kit facas cozinha",
                "squeeze academia", "corda de pular", "porta temperos", "faixa elástica", "toalha de microfibra"]


def _demo(origem: str, categoria: str | None) -> list[dict]:
    """Leitura fictícia e estável para quem está sem conta do ML no modo demonstração."""
    rng = random.Random(int(hashlib.sha256(f"mercado{origem}{categoria}".encode()).hexdigest(), 16))
    saida = []
    for i, termo in enumerate(_TERMOS_DEMO):
        preco = round(rng.uniform(25, 260), 2)
        dados = {"vendedores": rng.randint(1, 40), "preco_min": round(preco * 0.85, 2), "preco_mediano": preco,
                 "oficiais": round(rng.choice([0, 0, 0.1, 0.3]), 2), "full": round(rng.choice([0, 0.2, 0.5]), 2),
                 "categoria_id": "MLB900001", "categoria": "Casa e Cozinha (demonstração)",
                 "anuncios_categoria": rng.randint(800, 400000), "tarifa": round(preco * 0.14 + (6.75 if preco < 79 else 0), 2),
                 "exemplo": termo.title(), "produto_id": f"MLB-DEMO-{i}"}
        dados["concorrencia"] = concorrencia(dados)
        if origem == "top":
            saida.append({"termo": termo.title(), "link": "", "tipo": "mais_vendido", "posicao": i + 1, "foto": "",
                          "demanda": max(40, 100 - i * 2.5), **dados})
        else:
            tipo, demanda = _demanda_tendencia(i * 3)
            saida.append({"termo": termo, "link": "", "tipo": tipo, "posicao": i * 3 + 1, "demanda": demanda, **dados})
    return saida
