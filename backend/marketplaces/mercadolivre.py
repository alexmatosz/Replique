"""Mercado Livre.

Pesquisa (o que mais vende):
  1. /sites/{SITE}/domain_discovery/search  -> descobre a categoria do termo (público)
  2. /highlights/{SITE}/category/{id}        -> top 20 MAIS VENDIDOS oficial da categoria
  3. /items?ids=... e /products/{id}         -> detalhes (título, preço, foto)
  4. /sites/{SITE}/search                     -> complemento (anúncios relevantes)

Publicação: /items + /items/{id}/description, com upload de fotos em
/pictures/items/upload e checagem dos atributos obrigatórios da categoria.

Lições herdadas do agente_anuncios_ml (testadas contra a API real):
- Redirect URI não pode ter "localhost": usamos o callback do Postman e o
  usuário cola o código (ou configuramos PUBLIC_BASE_URL num domínio real).
- /sites/{SITE}/search responde 403 sem token.
- Categorias com attribute_types="variations" e contas no modelo User Products
  exigem family_name no lugar de title (o envio troca o campo se o ML pedir).
- Foto precisa de no mínimo 500px no menor lado (ideal 1200x1200).
- 403 "restrictions_coliving"/"address_pending" = conta sem endereço de
  despacho cadastrado; não é bug de integração.
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from backend import config
from backend.security import pkce_do_state
from backend.marketplaces.base import (
    AnuncioCopiado, ErroMarketplace, Marketplace, ResultadoPesquisa, ResultadoPublicacao,
    popularidade_por_posicao,
)
from backend.services.conteudo import cortar_titulo, descricao_texto_puro
from backend.services import termo_busca

API = "https://api.mercadolibre.com"
AUTH_URL = "https://auth.mercadolivre.com.br/authorization"

_CAUSAS_CONHECIDAS = {
    "restrictions_coliving": "Sua conta do Mercado Livre está impedida de anunciar. Normalmente falta cadastrar o "
                             "endereço de despacho (Mercado Envios) — confira em Minha conta > Endereços.",
    "address_pending": "Falta cadastrar o endereço de despacho na conta do Mercado Livre.",
    "item.title.length": "O título passou do limite de caracteres da categoria.",
    "item.pictures.min": "O Mercado Livre exige pelo menos uma foto.",
}


def url_autorizacao(state: str | None = None) -> str:
    if not config.ML_CLIENT_ID:
        raise ErroMarketplace("ML_CLIENT_ID não configurado no .env do Monvatti Radar.")
    state = state or secrets.token_urlsafe(8)
    _, desafio = pkce_do_state(state)
    params = {"response_type": "code", "client_id": config.ML_CLIENT_ID,
              "redirect_uri": config.ML_REDIRECT_URI, "state": state,
              "code_challenge": desafio, "code_challenge_method": "S256"}
    return f"{AUTH_URL}?{urlencode(params)}"


def trocar_code_por_token(http, code: str, state: str | None = None) -> dict:
    dados = {"grant_type": "authorization_code", "client_id": config.ML_CLIENT_ID,
             "client_secret": config.ML_CLIENT_SECRET, "code": code.strip(),
             "redirect_uri": config.ML_REDIRECT_URI}
    if state:
        dados["code_verifier"] = pkce_do_state(state)[0]
    r = http.post(f"{API}/oauth/token", data=dados)
    if r.status_code >= 400:
        raise ErroMarketplace(f"O Mercado Livre recusou o código de autorização: {r.text[:300]}")
    dados = r.json()
    dados["obtido_em"] = time.time()
    return dados



_CACHE_TTL = 600
PRAZO_DETALHES_S = 15
_anuncios_produto_cache: dict[str, tuple[float, dict]] = {}
_CACHE_MAX = 3000
_CACHEAVEIS = re.compile(r"^/(sites/\w+/domain_discovery/search|products/search|products/\w+(/items)?|highlights/\w+/category/\w+)$")
_cache: dict[str, tuple[float, httpx.Response]] = {}
_cache_trava = threading.Lock()


def _chave_cache(caminho: str, params: dict | None) -> str | None:
    """Só respostas públicas do catálogo, iguais para qualquer conta, ficam guardadas."""
    if not config.CACHE_ML or not _CACHEAVEIS.match(caminho):
        return None
    return caminho + "?" + urlencode(sorted((params or {}).items()))


def _cache_ler(chave: str) -> httpx.Response | None:
    with _cache_trava:
        item = _cache.get(chave)
        if item and time.time() - item[0] < _CACHE_TTL:
            return item[1]
        _cache.pop(chave, None)
    return None


def _cache_guardar(chave: str, r: httpx.Response):
    with _cache_trava:
        if len(_cache) >= _CACHE_MAX:
            for k in sorted(_cache, key=lambda k: _cache[k][0])[: _CACHE_MAX // 5]:
                _cache.pop(k, None)
        _cache[chave] = (time.time(), r)


def _no_periodo(quando: str | None, desde: datetime, ate: datetime) -> bool:
    if not quando:
        return True
    try:
        d = datetime.fromisoformat(quando.replace("Z", "+00:00"))
    except ValueError:
        return True
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return desde.astimezone(timezone.utc) <= d <= ate.astimezone(timezone.utc)

class MercadoLivre(Marketplace):
    plataforma = "mercadolivre"

    def _token(self) -> str | None:
        if not self.cred.get("access_token"):
            return None
        expira = self.cred.get("obtido_em", 0) + self.cred.get("expires_in", 21600) - 120
        if time.time() > expira and not self.cred.get("refresh_token"):
            raise ErroMarketplace("A conexão com o Mercado Livre expirou (vale 6 horas porque o app não tem "
                                  "renovação automática). Reconecte em Contas.")
        if time.time() > expira:
            with self.renovando():
                expira = self.cred.get("obtido_em", 0) + self.cred.get("expires_in", 21600) - 120
                if time.time() > expira:
                    r = self.http.post(f"{API}/oauth/token", data={
                        "grant_type": "refresh_token", "client_id": config.ML_CLIENT_ID,
                        "client_secret": config.ML_CLIENT_SECRET, "refresh_token": self.cred["refresh_token"],
                    })
                    if r.status_code >= 400:
                        raise ErroMarketplace("A conexão com o Mercado Livre expirou. Reconecte a conta em Contas.")
                    novo = r.json()
                    novo["obtido_em"] = time.time()
                    self.cred.update(novo)
                    self.salvar_credenciais()
        return self.cred["access_token"]

    def _get(self, caminho: str, params: dict | None = None, auth: bool = True):
        chave = _chave_cache(caminho, params)
        if chave and (guardada := _cache_ler(chave)) is not None:
            return guardada
        headers = {}
        if auth and (tok := self._token()):
            headers["Authorization"] = f"Bearer {tok}"
        r = self.http.get(f"{API}{caminho}", params=params, headers=headers)
        if chave and r.status_code in (200, 404):
            _cache_guardar(chave, r)
        return r

    def _json_ou_erro(self, r, contexto: str):
        if r.status_code >= 400:
            raise ErroMarketplace(f"Mercado Livre — {contexto}: {self._explicar_erro(r)}",
                                  {"status": r.status_code, "corpo": r.text[:2000]})
        return r.json()

    @staticmethod
    def _explicar_erro(r) -> str:
        try:
            corpo = r.json()
        except ValueError:
            return f"HTTP {r.status_code}"
        partes = []
        for causa in corpo.get("cause") or []:
            if isinstance(causa, str):
                partes.append(_CAUSAS_CONHECIDAS.get(causa, causa))
            elif isinstance(causa, dict):
                codigo = causa.get("code", "")
                partes.append(_CAUSAS_CONHECIDAS.get(codigo, causa.get("message") or codigo))
        return " | ".join(partes) or corpo.get("message") or f"HTTP {r.status_code}"

    def prever_categorias(self, termo: str, limite: int = 3) -> list[dict]:
        r = self._get(f"/sites/{config.ML_SITE_ID}/domain_discovery/search",
                      {"q": termo, "limit": limite}, auth=False)
        if r.status_code >= 400:
            return []
        return [{"category_id": d.get("category_id"), "category_name": d.get("category_name"),
                 "domain_id": d.get("domain_id"), "domain_name": d.get("domain_name"),
                 "atributos": {a["id"]: a.get("value_name") for a in d.get("attributes") or []
                               if a.get("id") and a.get("value_name")}} for d in r.json()]

    def escolher_categorias(self, termo: str) -> tuple[list[dict], list[dict]]:
        """Retorna (categorias a consultar, todas as sugestões).

        O ML às vezes erra a 1ª sugestão (ex.: "controle xbox" → "Suportes de
        câmera"). Escolhe o DOMÍNIO que mais se repete entre as sugestões
        (empate: o mais bem colocado) e consulta até 2 categorias dele.
        """
        sugestoes, vistos = [], set()
        for s in self.prever_categorias(termo, 6):
            if s["category_id"] and s["category_id"] not in vistos:
                vistos.add(s["category_id"])
                sugestoes.append(s)
        if not sugestoes:
            return [], []
        contagem: dict[str, int] = {}
        primeira_posicao: dict[str, int] = {}
        for i, s in enumerate(sugestoes):
            contagem[s["domain_id"]] = contagem.get(s["domain_id"], 0) + 1
            primeira_posicao.setdefault(s["domain_id"], i)
        dominio = max(contagem, key=lambda d: (contagem[d], -primeira_posicao[d]))
        return [s for s in sugestoes if s["domain_id"] == dominio][:2], sugestoes

    @staticmethod
    def marca_do_termo(termo: str, sugestoes: list[dict]) -> str:
        """Marca que o ML reconheceu no termo (ex.: "ferramentas vonder" → "Vonder").
        Só vale se ela aparece de fato no texto digitado: "iphone" não vira
        filtro de "Apple", e "ferramentas" sozinho nunca filtra marca."""
        alvo = f" {_normalizar(termo)} "
        for s in sugestoes:
            marca = (s.get("atributos") or {}).get("BRAND")
            if marca and f" {_normalizar(marca)} " in alvo:
                return marca
        return ""

    def pesquisar(self, termo: str, limite: int = 20, categoria_id: str | None = None,
                  todas_marcas: bool = False) -> list[ResultadoPesquisa]:
        """Com marca no termo ("furadeira vonder"), a busca é EXATA: só vem o
        produto daquela marca, na ordem em que o ML o posiciona. Sem marca
        ("furadeira"), vêm os mais vendidos da categoria."""
        if not self._token():
            raise ErroMarketplace("Conecte a conta do Mercado Livre para ver os mais vendidos (a API exige login).")
        if categoria_id:
            r = self._get(f"/categories/{categoria_id}", auth=False)
            if r.status_code >= 400:
                raise ErroMarketplace(f"Categoria {categoria_id} não encontrada no Mercado Livre.")
            categorias = [{"category_id": categoria_id, "category_name": r.json().get("name", categoria_id)}]
            _, sugestoes = self.escolher_categorias(termo)
        else:
            categorias, sugestoes = self.escolher_categorias(termo)
        marca = "" if todas_marcas else self.marca_do_termo(termo, categorias + sugestoes)
        self.meta = {"categorias_usadas": categorias, "categorias_sugeridas": sugestoes,
                     "busca": {"modo": "exata" if marca else "categoria", "marca": marca}}
        if marca:
            resultados = self._pesquisa_exata(termo, marca, categorias, limite)
            if resultados:
                return resultados
            self.meta["busca"] = {"modo": "categoria", "marca": "", "sem_resultado_marca": marca}
        return self._mais_vendidos(termo, categorias, limite)

    def _mais_vendidos(self, termo: str, categorias: list[dict], limite: int) -> list[ResultadoPesquisa]:
        resultados: list[ResultadoPesquisa] = []
        vistos: set[str] = set()
        sem_ranking = []
        for ordem, cat in enumerate(categorias):
            r = self._get(f"/highlights/{config.ML_SITE_ID}/category/{cat['category_id']}")
            if r.status_code >= 400:
                sem_ranking.append(cat.get("category_name") or cat["category_id"])
                continue
            for item in self._resolver_destaques(r.json().get("content", []), cat, ordem):
                if item.id_externo not in vistos:
                    vistos.add(item.id_externo)
                    resultados.append(item)

        if not resultados:
            detalhe = f" (sem ranking disponível em: {', '.join(sem_ranking)})" if sem_ranking else ""
            raise ErroMarketplace("O Mercado Livre não tem ranking de mais vendidos para esse termo" + detalhe +
                                  ". Tente um nome de produto mais específico ou escolha outra categoria.")
        resultados.sort(key=lambda x: (x.posicao_ranking or 99, x.extra.get("ordem_categoria", 0)))
        return resultados[:limite]

    def _pesquisa_exata(self, termo: str, marca: str, categorias: list[dict], limite: int) -> list[ResultadoPesquisa]:
        """Produto de uma marca específica, juntando três fontes do ML:
        1. ranking de mais vendidos da categoria, só o que é da marca (sinal mais forte);
        2. busca do ML pelo termo, na ordem em que o próprio ML posiciona;
        3. catálogo do ML pelo termo, para cobrir o que as outras não liberam.
        Dentro disso, sobe quem tem as palavras do modelo (ex.: "GSR 120")."""
        marca_n = _normalizar(marca)
        fontes: dict[str, int] = {}

        def da_marca(texto: str) -> bool:
            return f" {marca_n} " in f" {_normalizar(texto)} "

        ranking: list[ResultadoPesquisa] = []
        for ordem, cat in enumerate(categorias):
            r = self._get(f"/highlights/{config.ML_SITE_ID}/category/{cat['category_id']}")
            if r.status_code < 400:
                ranking += [x for x in self._resolver_destaques(r.json().get("content", []), cat, ordem, marca)
                            if x.extra.get("da_marca")]
        fontes["ranking"] = len(ranking)

        busca: list[ResultadoPesquisa] = []
        r = self._get(f"/sites/{config.ML_SITE_ID}/search", {"q": termo, "limit": 50})
        if r.status_code < 400:
            for pos, it in enumerate(r.json().get("results", []), start=1):
                attrs = {a.get("id"): a.get("value_name") for a in it.get("attributes") or []}
                if not (da_marca(attrs.get("BRAND") or "") or da_marca(it.get("title", ""))):
                    continue
                busca.append(self._resultado_da_busca(it, pos, termo))
            fontes["busca"] = len(busca)
        else:
            fontes["busca"] = -1

        catalogo: list[ResultadoPesquisa] = []
        params = {"status": "active", "site_id": config.ML_SITE_ID, "q": termo, "limit": 20}
        dominio = next((c.get("domain_id") for c in categorias if c.get("domain_id")), None)
        if dominio:
            params["domain_id"] = dominio
        r = self._get("/products/search", params)
        if r.status_code < 400:
            achados = [p for p in r.json().get("results", []) if p.get("status", "active") == "active"
                       and (da_marca(next((a.get("value_name") or "" for a in p.get("attributes") or []
                                           if a.get("id") == "BRAND"), "")) or da_marca(p.get("name", "")))]
            nome_cat = (categorias[0].get("category_name") if categorias else "") or "catálogo"
            for pos, p in enumerate(achados[:12], start=1):
                res = ResultadoPesquisa(
                    plataforma=self.plataforma, id_externo=p["id"], titulo=p.get("name") or p["id"], tipo="PRODUCT",
                    popularidade=round(popularidade_por_posicao(pos, max(len(achados), 2)) * 0.7, 1),
                    origem_sinal=f"{pos}º no catálogo do ML para “{termo}”",
                    imagem=((p.get("pictures") or [{}])[0]).get("url", ""),
                    link=f"https://www.mercadolivre.com.br/p/{p['id']}",
                    extra={"marca": marca, "da_marca": True, "fonte": "catalogo", "category_name": nome_cat, "posicao_busca": pos},
                )
                catalogo.append(res)
            self._token()
            with ThreadPoolExecutor(max_workers=6) as pool:
                list(pool.map(self._precos_do_produto, catalogo))
        fontes["catalogo"] = len(catalogo)
        self.meta["busca"]["fontes"] = fontes

        vistos, saida = set(), []
        for grupo, lista in enumerate((ranking, busca, catalogo)):
            for x in lista:
                chave = x.extra.get("catalog_product_id") or x.id_externo
                if chave in vistos or x.id_externo in vistos:
                    continue
                vistos.update({chave, x.id_externo})
                x.extra["grupo"] = grupo
                x.extra["aderencia"] = _aderencia(termo, marca, categorias, x.titulo)
                saida.append(x)
        saida.sort(key=lambda x: (-x.extra["aderencia"], x.extra["grupo"], x.extra.get("posicao_busca") or x.posicao_ranking or 99))
        return saida[:limite]

    def _resultado_da_busca(self, it: dict, pos: int, termo: str) -> ResultadoPesquisa:
        """Anúncio vindo de /sites/{SITE}/search. Se ele está num produto de
        catálogo, aponta para o produto (a cópia do catálogo vem completa)."""
        foto = (it.get("thumbnail") or "").replace("http://", "https://").replace("-I.", "-O.")
        vendidos = it.get("sold_quantity")
        res = ResultadoPesquisa(
            plataforma=self.plataforma, id_externo=it["id"], titulo=it.get("title") or it["id"], tipo="ITEM",
            preco=it.get("price"), imagem=foto, link=it.get("permalink", ""),
            vendidos=vendidos if isinstance(vendidos, int) and vendidos > 0 else None,
            vendedor=(it.get("seller") or {}).get("nickname", ""),
            popularidade=round(popularidade_por_posicao(pos, 50) * 0.9, 1),
            origem_sinal=f"{pos}º na busca do Mercado Livre por “{termo}”",
            extra={"da_marca": True, "fonte": "busca", "posicao_busca": pos,
                   "catalog_product_id": it.get("catalog_product_id") or "",
                   "preco_original": it.get("original_price")},
        )
        if it.get("catalog_product_id"):
            res.extra["item_id"] = it["id"]
            res.id_externo, res.tipo = it["catalog_product_id"], "PRODUCT"
        return res

    def _precos_do_produto(self, res: ResultadoPesquisa):
        r = self._get(f"/products/{res.id_externo}/items")
        if r.status_code >= 400:
            return
        ofertas = [o for o in r.json().get("results", []) if o.get("price")]
        if ofertas:
            res.preco = min(o["price"] for o in ofertas)
            res.extra.update({"vendedores": r.json().get("paging", {}).get("total", len(ofertas)),
                              "preco_max": max(o["price"] for o in ofertas)})
            res.origem_sinal += f" · {res.extra['vendedores']} vendedor(es)"

    def _resolver_destaques(self, conteudo: list[dict], cat: dict, ordem: int = 0,
                            marca: str = "") -> list[ResultadoPesquisa]:
        """Monta os resultados do ranking. O que a API do ML libera para quem
        NÃO é o dono do anúncio (testado em 2026-09-24):
        - PRODUCT (catálogo): nome, fotos e preços dos vendedores → completo;
        - ITEM: /items dá 403; descrição e visitas são liberadas;
        - USER_PRODUCT (MLBU): /user-products dá 403.
        """
        self._token()
        nome_cat = cat.get("category_name") or cat["category_id"]
        total = len(conteudo) or 20
        marca_n = f" {_normalizar(marca)} " if marca else ""
        ids_itens = [c["id"] for c in conteudo if c.get("type") == "ITEM"]
        visitas = {}
        if ids_itens:
            r = self._get("/visits/items", {"ids": ",".join(ids_itens)})
            if r.status_code < 400 and isinstance(r.json(), dict):
                visitas = r.json()

        def resolver(c: dict) -> ResultadoPesquisa:
            posicao, tipo, id_ext = c.get("position", 20), c.get("type"), c.get("id")
            res = ResultadoPesquisa(
                plataforma=self.plataforma, id_externo=id_ext, titulo=id_ext, tipo=tipo,
                posicao_ranking=posicao, popularidade=popularidade_por_posicao(posicao, total),
                origem_sinal=f"{posicao}º mais vendido em {nome_cat}",
                extra={"category_id": cat["category_id"], "category_name": nome_cat, "ordem_categoria": ordem},
            )
            if tipo == "PRODUCT":
                self._completar_produto(res)
                if marca:
                    res.extra["da_marca"] = marca_n in f" {_normalizar(res.extra.get('marca') or res.titulo)} "
            elif tipo == "ITEM":
                res.titulo = "Anúncio de vendedor — detalhes restritos pela API do ML"
                res.link = f"https://produto.mercadolivre.com.br/{id_ext[:3]}-{id_ext[3:]}"
                res.extra["restrito"] = True
                if isinstance(visitas.get(id_ext), int):
                    res.extra["visitas"] = visitas[id_ext]
                    res.origem_sinal += " · " + f"{visitas[id_ext]:,}".replace(",", ".") + " visitas"
                r = self._get(f"/items/{id_ext}/description")
                if r.status_code < 400:
                    texto = r.json().get("plain_text") or ""
                    trecho = next((ln.strip() for ln in texto.splitlines()
                                   if len(ln.strip(" -_*•=")) > 15), "")
                    res.extra["trecho"] = trecho[:140]
                    if marca:
                        res.extra["da_marca"] = marca_n in f" {_normalizar(texto)} "
            else:
                res.titulo = "Produto de vendedor — detalhes restritos pela API do ML"
                res.link = f"https://www.mercadolivre.com.br/up/{id_ext}"
                res.extra["restrito"] = True
            return res

        with ThreadPoolExecutor(max_workers=6) as pool:
            return list(pool.map(resolver, conteudo))

    def _completar_produto(self, res: ResultadoPesquisa):
        r = self._get(f"/products/{res.id_externo}")
        if r.status_code < 400:
            d = r.json()
            res.titulo = d.get("name") or res.id_externo
            res.extra["marca"] = next((a.get("value_name") for a in d.get("attributes") or []
                                       if a.get("id") == "BRAND" and a.get("value_name")), "")
            fotos = d.get("pictures") or []
            res.imagem = fotos[0].get("url", "") if fotos else ""
            res.link = d.get("permalink") or f"https://www.mercadolivre.com.br/p/{res.id_externo}"
            if (d.get("buy_box_winner") or {}).get("price"):
                res.preco = d["buy_box_winner"]["price"]
        r = self._get(f"/products/{res.id_externo}/items")
        if r.status_code < 400:
            ofertas = [o for o in r.json().get("results", []) if o.get("price")]
            if ofertas:
                mais_barata = min(ofertas, key=lambda o: o["price"])
                res.preco = res.preco or mais_barata["price"]
                res.extra.update({"vendedores": r.json().get("paging", {}).get("total", len(ofertas)),
                                  "preco_max": max(o["price"] for o in ofertas),
                                  "preco_original": mais_barata.get("original_price")})
                res.origem_sinal += f" · {res.extra['vendedores']} vendedor(es)"

    def pesquisar_anuncios(self, termo: str, limite: int = 20) -> list[ResultadoPesquisa]:
        """O mais perto da busca de dentro do ML que a API permite: entende o
        termo (produto, marca, potência, voltagem), busca o catálogo, junta as
        versões do mesmo produto num cartão só e põe primeiro o que bate com
        tudo o que foi pedido, depois alguns parecidos, como o ML faz."""
        if not self._token():
            raise ErroMarketplace("Conecte a conta do Mercado Livre para pesquisar (a API exige login).")
        sugestoes = self.prever_categorias(termo, 6)
        marcas_ml = [m for m in ((s.get("atributos") or {}).get("BRAND") for s in sugestoes) if m]
        interp = termo_busca.interpretar(termo, marcas_ml)
        busca = interp["termo_busca"]
        if busca != termo:
            sugestoes += [s for s in self.prever_categorias(busca, 4)
                          if s["category_id"] not in {x["category_id"] for x in sugestoes}]
        dominios = list(dict.fromkeys(s["domain_id"] for s in sugestoes if s.get("domain_id")))[:3]
        consultas = [{"domain_id": d} for d in dominios] + [{}]
        self._token()

        def buscar(extra):
            achados = []
            for offset in (0, 50):
                r = self._get("/products/search", {"status": "active", "site_id": config.ML_SITE_ID, "q": busca,
                                                   "limit": 50, "offset": offset, **extra})
                if r.status_code >= 400:
                    break
                lote = r.json().get("results") or []
                achados += lote
                if len(lote) < 50 or not extra:
                    break
            return achados

        categorias = list(dict.fromkeys(s["category_id"] for s in sugestoes if s.get("category_id")))[:3]

        def produto(pid):
            d = self._get(f"/products/{pid}")
            return {**d.json(), "_mais_vendido": True} if d.status_code < 400 else None

        def mais_vendidos(cat):
            r = self._get(f"/highlights/{config.ML_SITE_ID}/category/{cat}")
            ids = [c["id"] for c in (r.json().get("content") or []) if c.get("type") == "PRODUCT"] if r.status_code < 400 else []
            with ThreadPoolExecutor(max_workers=8) as fichas:
                return [d for d in fichas.map(produto, ids) if d]

        with ThreadPoolExecutor(max_workers=8) as pool:
            f_ranking = [pool.submit(mais_vendidos, c) for c in categorias]
            f_listas = [pool.submit(buscar, c) for c in consultas]
            ranking = [f.result() for f in f_ranking]
            listas = [f.result() for f in f_listas]
        posicao: dict[str, float] = {}
        for lista in listas:
            for i, p in enumerate(lista):
                posicao[p.get("id")] = min(posicao.get(p.get("id"), 999), i)
        for lista in ranking:
            for i, p in enumerate(lista):
                posicao[p.get("id")] = min(posicao.get(p.get("id"), 999), 30 + i) - 15

        familias: dict[str, dict] = {}
        for lista in ranking + listas:
            for p in lista:
                if not p.get("id") or p.get("status", "active") != "active":
                    continue
                chave = p.get("parent_id") or p["id"]
                atual = familias.get(chave)
                if atual is None:
                    familias[chave] = {**p, "_versoes": {p["id"]}}
                else:
                    atual["_versoes"].add(p["id"])
                    atual["_mais_vendido"] = atual.get("_mais_vendido") or p.get("_mais_vendido")
                    if posicao.get(p["id"], 999) < posicao.get(atual["id"], 999):
                        familias[chave] = {**p, "_versoes": atual["_versoes"], "_mais_vendido": atual.get("_mais_vendido")}
        produtos = sorted(familias.values(), key=lambda p: posicao.get(p["id"], 999))
        if not produtos:
            raise ErroMarketplace(f"O Mercado Livre não achou produtos de catálogo para “{termo}”. Tente outro nome.")

        sobra = " ".join(w for w in termo_busca.normalizar(termo).split() if w != interp["nucleo"])
        if not interp["marca"] and sobra:
            marcas_achadas = [a.get("value_name") for p in produtos for a in p.get("attributes") or []
                              if a.get("id") == "BRAND" and a.get("value_name")]
            marca_achada = termo_busca.achar_marca(sobra, marcas_achadas)
            if marca_achada:
                termo_busca.aplicar_marca(interp, marca_achada)

        criterios = ((["marca"] if interp["marca"] else []) + [m["rotulo"] for m in interp["medidas"]]
                     + (["voltagem"] if interp["voltagem"] else []))
        marca_n = termo_busca.normalizar(interp["marca"]) if interp["marca"] else ""

        def avaliar(p) -> dict:
            attrs = {a.get("id"): a.get("value_name") for a in p.get("attributes") or [] if a.get("value_name")}
            valores = [str(v) for v in attrs.values()]
            nome = p.get("name") or ""
            bate = {}
            if marca_n:
                bate["marca"] = f" {marca_n} " in f" {termo_busca.normalizar(attrs.get('BRAND'))} {termo_busca.normalizar(nome)} "
            for medida in interp["medidas"]:
                bate[medida["rotulo"]] = termo_busca.medida_no_produto(medida, nome, valores)
            if interp["voltagem"]:
                bate["voltagem"] = termo_busca.voltagem_no_produto(interp, nome, valores)
            return {"attrs": attrs, "bate": bate, "tipo": termo_busca.tipo_do_produto(interp, nome)}

        avaliados = [(p, avaliar(p)) for p in produtos]
        if any(a["tipo"] for _, a in avaliados):
            avaliados = [(p, a) for p, a in avaliados if a["tipo"]]
        exatos = [(p, a) for p, a in avaliados if all(a["bate"].values())]
        parecidos = [(p, a) for p, a in avaliados if not all(a["bate"].values())]
        parecidos.sort(key=lambda x: (-sum(x[1]["bate"].values()), posicao.get(x[0]["id"], 999)))

        def montar(par) -> ResultadoPesquisa | None:
            p, aval = par
            attrs = aval["attrs"]
            ofertas, total = self._ofertas(p["id"], p.get("children_ids") or [])
            if not ofertas:
                return None
            res = ResultadoPesquisa(
                plataforma=self.plataforma, id_externo=p["id"], titulo=p.get("name") or p["id"], tipo="PRODUCT",
                imagem=((p.get("pictures") or [{}])[0]).get("url", ""),
                link=f"https://www.mercadolivre.com.br/p/{p['id']}",
                extra={"fonte": "anuncios", "marca": attrs.get("BRAND", ""),
                       "modelo": attrs.get("MODEL", ""), "gtin": attrs.get("GTIN", ""), "dominio": p.get("domain_id", ""),
                       "mais_vendido": bool(p.get("_mais_vendido")), "versoes": len(p.get("_versoes") or ()),
                       "correspondencia": "exato" if all(aval["bate"].values()) else "parecido", "bate": aval["bate"]})
            res.extra.update(_resumo_ofertas(ofertas, total))
            res.extra["ofertas"] = [_oferta_curta(o) for o in sorted(ofertas, key=lambda o: o.get("price") or 0)[:40]]
            if marca_n:
                res.extra["da_marca"] = aval["bate"].get("marca", False)
            res.preco = res.extra["preco_min"]
            res.origem_sinal = (("Mais vendido da categoria · " if p.get("_mais_vendido") else "") +
                                f"{total} anúncio(s) · {res.extra['full']} no Full · "
                                f"de {_brl(res.extra['preco_min'])} a {_brl(res.extra['preco_max'])}")
            return res

        folga = limite
        vagas_parecidos = max(5, limite - len(exatos)) if criterios else 0
        with ThreadPoolExecutor(max_workers=16) as pool:
            f_exatos = [pool.submit(montar, x) for x in exatos[:limite + folga]]
            f_parecidos = [pool.submit(montar, x) for x in parecidos[:vagas_parecidos + folga]]
            achados_exatos = [r for r in (f.result() for f in f_exatos) if r][:limite]
            achados_parecidos = [r for r in (f.result() for f in f_parecidos) if r][:max(5, limite - len(achados_exatos)) if criterios else 0]
        saida = achados_exatos + achados_parecidos
        for i, r in enumerate(saida, start=1):
            r.extra["posicao_busca"] = i
            r.popularidade = popularidade_por_posicao(i, max(len(saida), 2))

        nomes_dominio = {s["domain_id"]: s.get("domain_name") for s in sugestoes}
        self.meta = {"busca": {"modo": "anuncios", "marca": interp["marca"],
                               "dominios": [nomes_dominio.get(d) or d for d in dominios],
                               "interpretacao": {k: interp[k] for k in ("original", "produto", "marca", "medidas",
                                                                        "voltagem", "termo_busca", "fonte")},
                               "criterios": criterios, "exatos": len(achados_exatos), "parecidos": len(achados_parecidos)}}
        return saida

    def analisar_link(self, url: str) -> dict:
        """Lê um link do ML colado pelo usuário.
        - Página de produto (/p/MLB...): o produto e todos os anúncios dele.
        - Anúncio (MLB-123...): se for da conta conectada, vem completo. De outro
          vendedor a API não libera o anúncio, então o título do próprio link
          acha o produto de catálogo que contém esse anúncio (preço, vendedor,
          Full). Não achando, vêm a descrição e as visitas, que são liberadas."""
        texto = (url or "").strip()
        if not re.search(r"(mercadolivre|mercadolibre|mlstatic|^MLB)", texto, re.I) and not re.search(r"MLB-?\d{6,}", texto, re.I):
            raise ErroMarketplace("Cole um link do Mercado Livre (de anúncio ou de produto) ou o código MLB.")
        produto = re.search(r"/p/(MLB\d+)", texto, re.I)
        filtro_item = re.search(r"item_id[:=%3A]+(MLB)-?(\d{6,})", texto, re.I)
        item = filtro_item or re.search(r"(?:item_id[:=]|wid=|/|^|-)(MLB)-?(\d{6,})", texto, re.I)
        item_id = f"MLB{item.group(2)}" if item else ""
        if produto:
            pid = produto.group(1).upper()
            if item_id == pid:
                item_id = ""
            return {"tipo": "produto", "product_id": pid, "item_id": item_id}
        if not item_id:
            raise ErroMarketplace("Não achei o código do anúncio (MLB...) nesse link.")
        r = self._get(f"/items/{item_id}")
        if r.status_code < 400:
            it = r.json()
            if it.get("catalog_product_id"):
                return {"tipo": "produto", "product_id": it["catalog_product_id"], "item_id": item_id, "proprio": True}
            return {"tipo": "item", "item_id": item_id, "proprio": True, "titulo": it.get("title", ""), "preco": it.get("price"),
                    "foto": ((it.get("pictures") or [{}])[0]).get("secure_url", ""), "link": it.get("permalink", "")}
        slug = re.search(r"MLB-?\d+-([a-z0-9-]+?)(?:-_JM|_JM|$|[?#])", texto, re.I)
        titulo = re.sub(r"-+", " ", slug.group(1)).strip() if slug else ""
        desc = self._get(f"/items/{item_id}/description")
        descricao = (desc.json().get("plain_text") or "") if desc.status_code < 400 else ""
        busca = titulo or " ".join(re.findall(r"[\wÀ-ÿ]+", descricao)[:8])
        if busca:
            achados = self._get("/products/search", {"status": "active", "site_id": config.ML_SITE_ID, "q": busca, "limit": 15})
            candidatos = (achados.json().get("results") or []) if achados.status_code < 400 else []

            def tem_o_item(p):
                ofertas, _ = self._ofertas(p["id"], p.get("children_ids") or [])
                return p["id"] if any(o.get("item_id") == item_id for o in ofertas) else None

            with ThreadPoolExecutor(max_workers=6) as pool:
                for pid in pool.map(tem_o_item, candidatos):
                    if pid:
                        return {"tipo": "produto", "product_id": pid, "item_id": item_id}
        visitas = self._get("/visits/items", {"ids": item_id})
        return {"tipo": "item", "item_id": item_id, "proprio": False, "titulo": titulo.capitalize(),
                "descricao": descricao[:1500],
                "visitas": (visitas.json() or {}).get(item_id) if visitas.status_code < 400 else None,
                "link": f"https://produto.mercadolivre.com.br/MLB-{item_id[3:]}"}

    def _ofertas(self, product_id: str, filhos: list[str] | None = None) -> tuple[list[dict], int]:
        """Anúncios de um produto (até 200). Produto "pai" (família com
        variações) não tem anúncio próprio: junta os dos filhos."""
        ofertas, total = [], 0
        for pid in [product_id] + (filhos or [])[:6]:
            for offset in (0, 100):
                r = self._get(f"/products/{pid}/items", {"limit": 100, "offset": offset})
                if r.status_code >= 400:
                    break
                d = r.json()
                lote = [dict(o, product_id=pid) for o in d.get("results") or []]
                ofertas += lote
                if offset == 0:
                    total += (d.get("paging") or {}).get("total", len(lote))
                if len(lote) < 100:
                    break
            if ofertas and pid == product_id:
                break
        return ofertas, total

    def anuncios_do_produto(self, product_id: str, limite: int = 40) -> dict:
        """Todos os anúncios do produto, com vendedor e visitas dia a dia. As visitas e os vendedores têm um
        tempo total (PRAZO_DETALHES_S): o que não chegar a tempo fica sem detalhe, em vez de travar a tela.
        O resultado fica guardado por 10 minutos."""
        guardado = _anuncios_produto_cache.get(product_id)
        if guardado and time.time() - guardado[0] < 600:
            return guardado[1]
        d = self._json_ou_erro(self._get(f"/products/{product_id}"), "ler produto")
        ofertas, total = self._ofertas(product_id, d.get("children_ids") or [])
        ofertas.sort(key=lambda o: o.get("price") or 0)
        ofertas = ofertas[:limite]
        self._token()
        hoje = datetime.now(timezone(timedelta(hours=-3))).date()
        dias = [(hoje - timedelta(days=i)).isoformat() for i in range(30, 0, -1)]

        def visitas(item_id: str) -> dict:
            r = self._get(f"/items/{item_id}/visits/time_window", {"last": 30, "unit": "day"})
            if r.status_code >= 400:
                return {}
            por_dia = {str(x.get("date", ""))[:10]: int(x.get("total") or 0) for x in r.json().get("results") or []}
            serie = [por_dia.get(dia, 0) for dia in dias]
            return {"ontem": serie[-1], "sete_dias": sum(serie[-7:]), "trinta_dias": int(r.json().get("total_visits") or sum(serie)),
                    "serie": serie}

        def vendedor(seller_id) -> dict:
            r = self._get(f"/users/{seller_id}")
            if r.status_code >= 400:
                return {"id": seller_id}
            u = r.json()
            rep = u.get("seller_reputation") or {}
            return {"id": seller_id, "apelido": u.get("nickname", ""), "link": u.get("permalink", ""),
                    "termometro": rep.get("level_id") or "", "medalha": rep.get("power_seller_status") or "",
                    "vendas_total": (rep.get("transactions") or {}).get("total"),
                    "cidade": (u.get("address") or {}).get("city", ""), "uf": str((u.get("address") or {}).get("state", "")).removeprefix("BR-")}

        ids_vendedores = list(dict.fromkeys(o.get("seller_id") for o in ofertas if o.get("seller_id")))
        pool = ThreadPoolExecutor(max_workers=10)
        f_vis = {o["item_id"]: pool.submit(visitas, o["item_id"]) for o in ofertas}
        f_vend = {v: pool.submit(vendedor, v) for v in ids_vendedores}
        wait(list(f_vis.values()) + list(f_vend.values()), timeout=PRAZO_DETALHES_S)
        pool.shutdown(wait=False, cancel_futures=True)

        def resultado(f, padrao):
            try:
                return f.result(timeout=0) if f.done() else padrao
            except Exception:
                return padrao
        vis = {k: resultado(f, {}) for k, f in f_vis.items()}
        vendedores = {k: resultado(f, {"id": k}) for k, f in f_vend.items()}
        incompleto = any(not f.done() for f in list(f_vis.values()) + list(f_vend.values()))
        anuncios = []
        for o in ofertas:
            ship = o.get("shipping") or {}
            preco, original = o.get("price"), o.get("original_price")
            anuncios.append({
                "item_id": o["item_id"], "product_id": o.get("product_id", product_id),
                "link": f"https://produto.mercadolivre.com.br/{o['item_id'][:3]}-{o['item_id'][3:]}",
                "preco": preco, "preco_original": original,
                "desconto_pct": round((1 - preco / original) * 100) if preco and original and original > preco else 0,
                "logistica": ship.get("logistic_type") or "", "logistica_nome": _LOGISTICA.get(ship.get("logistic_type") or "", ship.get("logistic_type") or "—"),
                "full": ship.get("logistic_type") == "fulfillment", "frete_gratis": bool(ship.get("free_shipping")),
                "tipo_anuncio": {"gold_pro": "Premium", "gold_special": "Clássico"}.get(o.get("listing_type_id"), o.get("listing_type_id") or ""),
                "loja_oficial": bool(o.get("official_store_id")), "condicao": o.get("condition") or "",
                "garantia": o.get("warranty") or "",
                "cidade": ((o.get("seller_address") or {}).get("city") or {}).get("name", ""),
                "estado": ((o.get("seller_address") or {}).get("state") or {}).get("name", ""),
                "vendedor": vendedores.get(o.get("seller_id"), {"id": o.get("seller_id")}),
                "visitas": vis.get(o["item_id"], {})})
        saida = {"produto": {"id": product_id, "nome": d.get("name") or product_id,
                             "foto": ((d.get("pictures") or [{}])[0]).get("url", ""),
                             "link": d.get("permalink") or f"https://www.mercadolivre.com.br/p/{product_id}"},
                 "total": total, "mostrados": len(anuncios), "dias": dias, "anuncios": anuncios,
                 "resumo": _resumo_ofertas(ofertas, total), "incompleto": incompleto}
        if not incompleto:
            if len(_anuncios_produto_cache) > 300:
                _anuncios_produto_cache.clear()
            _anuncios_produto_cache[product_id] = (time.time(), saida)
        return saida

    def obter_anuncio(self, id_externo: str, tipo: str = "ITEM", item_id: str = "") -> AnuncioCopiado:
        if tipo == "PRODUCT":
            return self._obter_produto(id_externo, item_id)
        if tipo == "USER_PRODUCT":
            r = self._get(f"/user-products/{id_externo}")
            if r.status_code == 403:
                return _copia_restrita(id_externo, f"https://www.mercadolivre.com.br/up/{id_externo}", "")
            d = self._json_ou_erro(r, "ler produto")
            return AnuncioCopiado(
                titulo=d.get("name", ""),
                fotos=[p.get("secure_url") or p.get("url") for p in d.get("pictures") or [] if p],
                atributos=_por_nome(d.get("attributes")),
                por_plataforma={"mercadolivre": {"category_id": d.get("category_id", "")}},
            )
        desc = self._get(f"/items/{id_externo}/description")
        descricao = desc.json().get("plain_text", "") if desc.status_code < 400 else ""
        r = self._get(f"/items/{id_externo}")
        if r.status_code == 403:
            return _copia_restrita(id_externo, f"https://produto.mercadolivre.com.br/{id_externo[:3]}-{id_externo[3:]}",
                                   descricao)
        d = self._json_ou_erro(r, "ler anúncio")
        attrs = {a["id"]: a.get("value_name") for a in d.get("attributes") or [] if a.get("value_name")}
        return AnuncioCopiado(
            titulo=d.get("title", ""), descricao=descricao, preco=d.get("price") or 0,
            fotos=[p.get("secure_url") or p.get("url") for p in d.get("pictures") or []],
            atributos=_por_nome(d.get("attributes")),
            marca=attrs.get("BRAND", ""), modelo=attrs.get("MODEL", ""), gtin=attrs.get("GTIN", ""),
            condicao=d.get("condition") or "new", link=d.get("permalink", ""),
            por_plataforma={"mercadolivre": {"category_id": d.get("category_id", ""),
                                             "listing_type_id": d.get("listing_type_id", "gold_special"),
                                             "atributos_ids": _ids_por_nome(d.get("attributes"))}},
        )

    def _obter_produto(self, product_id: str, item_id: str = "") -> AnuncioCopiado:
        """Ficha e fotos do produto de catálogo. Com `item_id`, a descrição, o
        preço e a categoria vêm daquele anúncio (o escolhido na pesquisa)."""
        d = self._json_ou_erro(self._get(f"/products/{product_id}"), "ler produto de catálogo")
        attrs = {a["id"]: a.get("value_name") for a in d.get("attributes") or [] if a.get("value_name")}
        descricao = (d.get("short_description") or {}).get("content", "")
        preco, category_id = (d.get("buy_box_winner") or {}).get("price") or 0, ""
        ofertas, _ = self._ofertas(product_id, d.get("children_ids") or [])
        ofertas = [o for o in ofertas if o.get("price")]
        escolhida = next((o for o in ofertas if o.get("item_id") == item_id), None)
        if escolhida:
            preco, category_id = escolhida["price"], escolhida.get("category_id", "")
            rd = self._get(f"/items/{item_id}/description")
            if rd.status_code < 400 and (rd.json().get("plain_text") or "").strip():
                descricao = rd.json()["plain_text"]
        elif ofertas:
            preco = preco or min(o["price"] for o in ofertas)
            category_id = ofertas[0].get("category_id", "")
            rd = self._get(f"/items/{ofertas[0]['item_id']}/description")
            if rd.status_code < 400 and len(rd.json().get("plain_text") or "") > len(descricao):
                descricao = rd.json()["plain_text"]
        return AnuncioCopiado(
            titulo=d.get("name", ""), descricao=descricao, preco=preco,
            fotos=[p.get("url") for p in d.get("pictures") or [] if p.get("url")],
            atributos=_por_nome(d.get("attributes")),
            marca=attrs.get("BRAND", ""), modelo=attrs.get("MODEL", ""), gtin=attrs.get("GTIN", ""),
            link=(f"https://produto.mercadolivre.com.br/{item_id[:3]}-{item_id[3:]}" if escolhida else "")
                 or d.get("permalink") or f"https://www.mercadolivre.com.br/p/{product_id}",
            por_plataforma={"mercadolivre": {"category_id": category_id, "catalog_product_id": product_id,
                                             "atributos_ids": _ids_por_nome(d.get("attributes"))}},
            **_embalagem(attrs),
        )

    def _req(self, metodo: str, caminho: str, contexto: str, **kw):
        tok = self._token()
        if not tok:
            raise ErroMarketplace("Conta do Mercado Livre não conectada.")
        r = self.http.request(metodo, f"{API}{caminho}", headers={"Authorization": f"Bearer {tok}"}, **kw)
        return self._json_ou_erro(r, contexto)

    def _user_id(self) -> str:
        uid = str(self.cred.get("user_id") or self.conta_info.get("id_externo") or "")
        if not uid:
            raise ErroMarketplace("Não sei o ID da conta do Mercado Livre. Reconecte em Contas.")
        return uid

    def reputacao(self) -> dict:
        d = self._req("GET", f"/users/{self._user_id()}", "ler reputação")
        return {"apelido": d.get("nickname", ""), "reputacao": d.get("seller_reputation") or {},
                "permalink": d.get("permalink", "")}

    def contagem_anuncios(self) -> dict:
        uid, saida = self._user_id(), {}
        for status in ("active", "paused", "under_review"):
            d = self._req("GET", f"/users/{uid}/items/search", "contar anúncios", params={"status": status, "limit": 1})
            saida[status] = (d.get("paging") or {}).get("total", 0)
        return saida

    def anuncios_pausados(self, limite: int = 20) -> list[dict]:
        """Anúncios pausados com o motivo (sub_status): moderação ou falta de estoque."""
        ids = self._req("GET", f"/users/{self._user_id()}/items/search", "listar pausados",
                        params={"status": "paused", "limit": limite}).get("results") or []
        return self.itens(ids)

    def itens(self, ids: list[str]) -> list[dict]:
        saida = []
        for i in range(0, len(ids), 20):
            lote = self._req("GET", "/items", "ler anúncios", params={"ids": ",".join(ids[i:i + 20])})
            saida += [x["body"] for x in lote if x.get("code") == 200 and x.get("body")]
        return saida

    def item(self, item_id: str) -> dict:
        return self._req("GET", f"/items/{item_id}", "ler anúncio")

    def pedidos(self, de: datetime, ate: datetime) -> list[dict]:
        """Pedidos do vendedor criados entre `de` e `ate`. A busca do ML não
        passa do offset 10.000: janela com mais pedidos que isso é dividida.
        Pedidos cancelados não vêm (o ML os esconde da busca do vendedor)."""
        uid, saida = self._user_id(), []

        def pagina(ini: datetime, fim: datetime, offset: int) -> dict:
            return self._req("GET", "/orders/search", "listar vendas", params={
                "seller": uid, "order.date_created.from": ini.strftime("%Y-%m-%dT%H:%M:%S.000-03:00"),
                "order.date_created.to": fim.strftime("%Y-%m-%dT%H:%M:%S.000-03:00"),
                "sort": "date_asc", "limit": 50, "offset": offset})

        def janela(ini: datetime, fim: datetime):
            d = pagina(ini, fim, 0)
            total = (d.get("paging") or {}).get("total", 0)
            if total > 9_500 and fim - ini > timedelta(hours=2):
                meio = ini + (fim - ini) / 2
                janela(ini, meio)
                janela(meio + timedelta(seconds=1), fim)
                return
            saida.extend(d.get("results") or [])
            for offset in range(50, total, 50):
                saida.extend(pagina(ini, fim, offset).get("results") or [])

        janela(de, ate)
        return saida

    def envio(self, shipment_id: str) -> dict:
        """(estado do comprador "SP", tipo de logística) do envio."""
        tok = self._token()
        r = self.http.get(f"{API}/shipments/{shipment_id}",
                          headers={"Authorization": f"Bearer {tok}", "x-format-new": "true"})
        d = self._json_ou_erro(r, "ler envio")
        endereco = ((d.get("destination") or {}).get("shipping_address") or d.get("receiver_address") or {})
        estado = str(((endereco.get("state") or {}).get("id")) or "")
        logistica = (d.get("logistic") or {}).get("type") or d.get("logistic_type") or ""
        return {"uf": estado.removeprefix("BR-")[:2].upper(), "logistica": logistica}

    def anuncios_para_catalogo(self, limite: int = 3000) -> list[dict]:
        """Anúncios ativos, uma linha por variação, com o SKU de cada uma
        (seller_custom_field ou o atributo SELLER_SKU)."""
        uid, ids = self._user_id(), []
        params = {"status": "active", "search_type": "scan", "limit": 100}
        while len(ids) < limite:
            d = self._req("GET", f"/users/{uid}/items/search", "listar anúncios", params=params)
            lote = d.get("results") or []
            ids += lote
            if not lote or not d.get("scroll_id"):
                break
            params["scroll_id"] = d["scroll_id"]
        saida = []
        for i in range(0, len(ids), 20):
            lote = self._req("GET", "/items", "ler anúncios", params={"ids": ",".join(ids[i:i + 20]), "include_attributes": "all"})
            for it in (x["body"] for x in lote if x.get("code") == 200 and x.get("body")):
                foto = it.get("thumbnail") or ((it.get("pictures") or [{}])[0].get("secure_url") or "")
                base = {"item_id": it.get("id", ""), "titulo": it.get("title", ""), "foto": foto}
                variacoes = it.get("variations") or []
                if not variacoes:
                    saida.append({**base, "variacao_id": "", "variacao": "",
                                  "sku": _sku(it.get("seller_custom_field"), it.get("attributes"))})
                for v in variacoes:
                    nome = " · ".join(f"{a.get('name')}: {a.get('value_name')}" for a in v.get("attribute_combinations") or []
                                      if a.get("value_name"))
                    saida.append({**base, "variacao_id": str(v.get("id") or ""), "variacao": nome,
                                  "sku": _sku(v.get("seller_custom_field"), v.get("attributes"))})
        return saida

    def _ads(self, caminho: str, contexto: str, versao: str = "2", **params) -> dict:
        tok = self._token()
        r = self.http.get(f"{API}{caminho}", params=params or None,
                          headers={"Authorization": f"Bearer {tok}", "api-version": versao})
        return self._json_ou_erro(r, contexto)

    def anunciante_ads(self) -> str | None:
        """ID de anunciante do Product Ads no Brasil; None se a conta não usa
        publicidade (o ML responde 404 "No permissions found")."""
        tok = self._token()
        r = self.http.get(f"{API}/advertising/advertisers", params={"product_id": "PADS"},
                          headers={"Authorization": f"Bearer {tok}", "Api-Version": "1"})
        if r.status_code == 404:
            return None
        d = self._json_ou_erro(r, "ler conta de publicidade")
        contas = d.get("advertisers") or []
        conta = next((a for a in contas if a.get("site_id") == config.ML_SITE_ID), contas[0] if contas else None)
        return str(conta["advertiser_id"]) if conta else None

    def gastos_ads(self, anunciante: str, de: str, ate: str) -> list[dict]:
        """Gasto por anúncio e por dia, [{data, item_id, custo, receita, unidades}].
        Desde 30/05/2026 o ML mede por Ad Group (um por anúncio): lista os ad
        groups do anunciante e pede as métricas diárias de cada um."""
        site, grupos, offset = config.ML_SITE_ID, [], 0
        while True:
            d = self._ads(f"/advertising/{site}/advertisers/{anunciante}/product_ads/ad_groups/search",
                          "listar anúncios patrocinados", limit=50, offset=offset)
            grupos += d.get("results") or []
            offset += 50
            if offset >= min((d.get("paging") or {}).get("total", 0), 9_950):
                break

        def metricas(grupo: dict) -> list[dict]:
            d = self._ads(f"/advertising/{site}/product_ads/ad_groups/{grupo['id']}", "ler gasto de publicidade",
                          date_from=de, date_to=ate, aggregation_type="daily", metrics="COST,TOTAL_AMOUNT,UNITS_QUANTITY")
            item = str(grupo.get("ad_group_external_id") or "")
            saida = []
            for dia in _linhas_diarias(d):
                m = {k.lower(): v for k, v in (dia.get("metrics") or dia).items()}
                data = str(dia.get("date") or dia.get("day") or "")[:10]
                if data and item and float(m.get("cost") or 0):
                    saida.append({"data": data, "item_id": item, "custo": float(m.get("cost") or 0),
                                  "receita": float(m.get("total_amount") or 0), "unidades": int(m.get("units_quantity") or 0)})
            return saida

        with ThreadPoolExecutor(max_workers=6) as pool:
            return [linha for linhas in pool.map(metricas, grupos) for linha in linhas]

    def reclamacoes(self, desde: datetime, ate: datetime) -> list[dict]:
        """Reclamações contra o vendedor abertas no período."""
        fmt = "%Y-%m-%dT%H:%M:%S.000+00:00"
        base = {"player_user_id": self._user_id(), "player_role": "respondent", "limit": 100,
                "range": f"date_created:after:{desde.astimezone(timezone.utc).strftime(fmt)},"
                         f"before:{ate.astimezone(timezone.utc).strftime(fmt)}"}
        saida, offset = [], 0
        while offset < 9_900:
            d = self._req("GET", "/post-purchase/v1/claims/search", "listar reclamações", params={**base, "offset": offset})
            saida += d.get("data") or []
            offset += 100
            if offset >= (d.get("paging") or {}).get("total", 0):
                break
        return [c for c in saida if _no_periodo(c.get("date_created"), desde, ate)]

    def frete_devolucao(self, pedido_id: str) -> float:
        """Quanto o vendedor pagou pelos envios de devolução do pedido."""
        tok, uid = self._token(), self._user_id()
        r = self.http.get(f"{API}/orders/{pedido_id}/shipments", params={"hosted": "true"},
                          headers={"Authorization": f"Bearer {tok}", "X-New-Domain": "true"})
        if r.status_code in (204, 404):
            return 0.0
        envios = self._json_ou_erro(r, "ler envios do pedido")
        envios = envios if isinstance(envios, list) else [envios]
        total = 0.0
        for e in envios:
            if e.get("type") not in ("return", "return_to_buyer"):
                continue
            c = self._req("GET", f"/shipments/{e['id']}/costs", "ler custo da devolução")
            partes = (c.get("senders") or []) + [c.get("receiver") or {}]
            total += sum(float(p.get("cost") or 0) for p in partes if str(p.get("user_id")) == uid)
        return round(total, 2)

    def custo_envio_vendedor(self, shipment_id: str) -> float:
        """Quanto o vendedor pagou pelo envio (frete grátis). Fonte indicada
        pelo ML para conciliação: /shipments/{id}/costs → senders[].cost."""
        d = self._req("GET", f"/shipments/{shipment_id}/costs", "ler custo do frete")
        uid = self._user_id()
        senders = d.get("senders") or []
        meus = [s for s in senders if str(s.get("user_id")) == uid] or senders
        return round(sum(float(s.get("cost") or 0) for s in meus), 2)

    def cobrancas_da_fatura(self, chave: str) -> list[dict]:
        """Linhas da fatura do ML do período `chave` (AAAA-MM-01): as gerais e as do
        Full. Escrito pela documentação (/billing/integration); as contas conectadas
        em 2026-11-06 não tinham cobrança nenhuma, então o formato de cada linha
        ainda não foi visto numa conta real."""
        saida = []
        for caminho in (f"/billing/integration/periods/key/{chave}/group/ML/details",
                        f"/billing/integration/periods/key/{chave}/group/ML/full/details"):
            offset = 0
            while True:
                d = self._req("GET", caminho, "ler a fatura do Mercado Livre",
                              params={"document_type": "BILL", "offset": offset, "limit": 150})
                lote = d.get("results") or []
                saida.extend({**x, "_origem": "full" if "/full/" in caminho else "geral"} for x in lote)
                offset += len(lote)
                if not lote or offset >= int(d.get("total") or 0) or offset >= 6000:
                    break
        return saida

    def bonus_do_pedido(self, pedido_id: str) -> dict[str, float]:
        """Parte dos descontos (cupom, campanha) bancada pelo Mercado Livre, por
        anúncio. O unit_price do pedido já vem com o desconto, e essa parte o ML
        paga ao vendedor. Desconto pago pela tarifa (funding_mode sale_fee) já
        aparece na comissão menor e cashback é dado ao comprador depois: os dois
        ficam de fora."""
        r = self._get(f"/orders/{pedido_id}/discounts")
        if r.status_code >= 400:
            return {}
        saida: dict[str, float] = {}
        for d in r.json().get("details") or []:
            if d.get("type") == "cashback" or (d.get("supplier") or {}).get("funding_mode") == "sale_fee":
                continue
            for it in d.get("items") or []:
                a = it.get("amounts") or {}
                ml = float(a.get("total") or 0) - float(a.get("seller") or 0)
                if ml > 0 and it.get("id"):
                    saida[str(it["id"])] = round(saida.get(str(it["id"]), 0) + ml, 2)
        return saida

    def ofertas_do_produto(self, product_id: str) -> list[dict]:
        r = self._get(f"/products/{product_id}/items")
        return [o for o in (r.json().get("results", []) if r.status_code < 400 else []) if o.get("price")]

    def ids_ativos(self, limite: int = 3000) -> list[str]:
        uid, ids = self._user_id(), []
        params = {"status": "active", "search_type": "scan", "limit": 100}
        while len(ids) < limite:
            d = self._req("GET", f"/users/{uid}/items/search", "listar anúncios", params=params)
            lote = d.get("results") or []
            ids += lote
            if not lote or not d.get("scroll_id"):
                break
            params["scroll_id"] = d["scroll_id"]
        return ids[:limite]

    def itens_resumidos(self, ids: list[str]) -> list[dict]:
        campos = ("id,title,price,original_price,thumbnail,permalink,available_quantity,seller_custom_field,variations,attributes,"
                  "listing_type_id,category_id,shipping,status")
        saida = []
        for i in range(0, len(ids), 20):
            lote = self._req("GET", "/items", "ler anúncios", params={"ids": ",".join(ids[i:i + 20]), "attributes": campos})
            saida += [x["body"] for x in lote if x.get("code") == 200 and x.get("body")]
        return saida

    def promocoes_do_vendedor(self) -> list[dict]:
        """Campanhas da Central de promoções em que a conta foi convidada ou participa."""
        d = self._req("GET", f"/seller-promotions/users/{self._user_id()}", "listar promoções", params={"app_version": "v2"})
        return d.get("results") or []

    def itens_da_promocao(self, promocao_id: str, tipo: str, status: str = "", limite: int = 3000) -> list[dict]:
        params = {"promotion_type": tipo, "app_version": "v2", "limit": 50}
        if status:
            params["status"] = status
        saida = []
        while len(saida) < limite:
            d = self._req("GET", f"/seller-promotions/promotions/{promocao_id}/items", "listar itens da promoção", params=params)
            lote = d.get("results") or []
            saida += lote
            proximo = (d.get("paging") or {}).get("searchAfter")
            if not lote or not proximo:
                break
            params["search_after"] = proximo
        return saida[:limite]

    def promocoes_do_item(self, item_id: str) -> list[dict]:
        d = self._req("GET", f"/seller-promotions/items/{item_id}", "ler promoções do anúncio", params={"app_version": "v2"})
        return d if isinstance(d, list) else (d.get("results") or [])

    def entrar_na_promocao(self, item_id: str, corpo: dict) -> dict:
        """Coloca o anúncio numa promoção. Só mexe no preço promocional: o preço do anúncio fica como está."""
        return self._req("POST", f"/seller-promotions/items/{item_id}", "colocar o anúncio na promoção",
                         params={"app_version": "v2"}, json=corpo)

    def atualizar_preco(self, item_id: str, preco: float) -> dict:
        return self._req("PUT", f"/items/{item_id}", "atualizar preço", json={"price": round(preco, 2)})

    def atualizar_estoque(self, item_id: str, estoque: int) -> dict:
        return self._req("PUT", f"/items/{item_id}", "atualizar estoque", json={"available_quantity": int(estoque)})

    def situacao_itens(self, ids: list[str]) -> dict[str, dict]:
        """Situação de cada anúncio: {id: {status, sub_status, acessivel}}. acessivel=False
        quando o anúncio não é da conta conectada (o ML responde 403)."""
        saida = {}
        for i in range(0, len(ids), 20):
            lote = self._req("GET", "/items", "ler anúncios", params={"ids": ",".join(ids[i:i + 20])})
            for x in lote:
                corpo = x.get("body") or {}
                iid = corpo.get("id")
                if not iid:
                    continue
                if x.get("code") == 200:
                    saida[iid] = {"status": corpo.get("status"), "sub_status": corpo.get("sub_status") or [],
                                  "acessivel": True, "preco": corpo.get("price"),
                                  "estoque": corpo.get("available_quantity"), "vendidos": corpo.get("sold_quantity"),
                                  "full": (corpo.get("shipping") or {}).get("logistic_type") == "fulfillment",
                                  "frete_gratis": bool((corpo.get("shipping") or {}).get("free_shipping")),
                                  "tipo": {"gold_pro": "Premium", "gold_special": "Clássico"}.get(corpo.get("listing_type_id"), ""),
                                  "catalogo": bool(corpo.get("catalog_listing")), "link": corpo.get("permalink") or ""}
                elif x.get("code") == 404:
                    saida[iid] = {"status": "deleted", "sub_status": [], "acessivel": True}
                else:
                    saida[iid] = {"status": None, "sub_status": [], "acessivel": False, "codigo": x.get("code")}
        return saida

    def alterar_status(self, item_id: str, status: str) -> dict:
        """paused (pausar), active (reativar) ou closed (finalizar: não volta mais)."""
        return self._req("PUT", f"/items/{item_id}", "mudar a situação do anúncio", json={"status": status})

    def excluir(self, item_id: str) -> None:
        """O ML só exclui anúncio finalizado: finaliza (se preciso) e exclui."""
        atual = self._req("GET", f"/items/{item_id}", "ler anúncio")
        if atual.get("status") != "closed":
            self.alterar_status(item_id, "closed")
        self._req("PUT", f"/items/{item_id}", "excluir o anúncio", json={"deleted": "true"})

    def perguntas_pendentes(self, limite: int = 50) -> list[dict]:
        d = self._req("GET", "/questions/search", "ler perguntas", params={
            "seller_id": self._user_id(), "status": "UNANSWERED", "api_version": 4,
            "sort_fields": "date_created", "sort_types": "DESC", "limit": limite})
        return d.get("questions") or []

    def pergunta(self, question_id: str) -> dict:
        return self._req("GET", f"/questions/{question_id}", "ler pergunta", params={"api_version": 4})

    def responder_pergunta(self, question_id: int, texto: str) -> dict:
        return self._req("POST", "/answers", "responder pergunta", json={"question_id": int(question_id), "text": texto})

    def tarifa_venda(self, preco: float, listing_type_id: str, category_id: str = "") -> dict | None:
        """Tarifa de venda do ML para o preço (endpoint público)."""
        params = {"price": round(preco, 2), "listing_type_id": listing_type_id or "gold_special"}
        if category_id:
            params["category_id"] = category_id
        r = self._get(f"/sites/{config.ML_SITE_ID}/listing_prices", params)
        if r.status_code >= 400:
            return None
        d = r.json()
        d = d[0] if isinstance(d, list) and d else d
        return d if isinstance(d, dict) and "sale_fee_amount" in d else None

    def tarifas_de_venda(self, preco: float, category_id: str = "") -> dict:
        """Tarifas de todos os tipos de anúncio para o preço, numa consulta só ({listing_type_id: tarifa})."""
        params = {"price": round(preco, 2)}
        if category_id:
            params["category_id"] = category_id
        r = None
        for _ in range(3):
            try:
                r = self._get(f"/sites/{config.ML_SITE_ID}/listing_prices", params)
            except httpx.HTTPError:
                r = None
            if r is not None and r.status_code != 429:
                break
            time.sleep(1)
        if r is None or r.status_code >= 400 or not isinstance(r.json(), list):
            return {}
        return {d["listing_type_id"]: d for d in r.json() if isinstance(d, dict) and d.get("listing_type_id")}

    def medidas_da_categoria(self, category_id: str) -> str | None:
        """Pacote típico da categoria segundo o ML ("AxLxC,gramas"), para estimar o frete."""
        r = self._get(f"/categories/{category_id}/shipping_preferences")
        d = (r.json().get("dimensions") or {}) if r.status_code < 400 else {}
        if not all(d.get(k) for k in ("height", "width", "length", "weight")):
            return None
        return f"{round(d['height'])}x{round(d['width'])}x{round(d['length'])},{round(d['weight'])}"

    def custo_frete_gratis(self, preco: float, dimensoes: str, listing_type_id: str, condicao: str = "new") -> float | None:
        """Quanto o vendedor paga no frete grátis (Mercado Envios). dimensoes = "CxLxA,gramas"."""
        try:
            d = self._req("GET", f"/users/{self._user_id()}/shipping_options/free", "calcular frete", params={
                "dimensions": dimensoes, "item_price": round(preco, 2), "listing_type_id": listing_type_id or "gold_special",
                "mode": "me2", "condition": condicao, "logistic_type": "drop_off", "verbose": "true"})
        except ErroMarketplace:
            return None
        custo = ((d.get("coverage") or {}).get("all_country") or {}).get("list_cost")
        return float(custo) if custo is not None else None

    def frete_do_anuncio(self, vendedor_id: str, item_id: str, preco: float | None = None) -> dict | None:
        """Frete grátis que o vendedor do anúncio paga, com o peso real cadastrado nele (vale para anúncio de terceiros)."""
        params = {"item_id": item_id}
        if preco:
            params["item_price"] = round(preco, 2)
        r = self._get(f"/users/{vendedor_id}/shipping_options/free", params)
        if r.status_code >= 400:
            return None
        cobertura = (r.json().get("coverage") or {}).get("all_country") or {}
        if cobertura.get("list_cost") is None:
            return None
        return {"custo": float(cobertura["list_cost"]), "peso_g": cobertura.get("billable_weight")}

    def primeira_pergunta(self, item_id: str) -> dict:
        """Data da pergunta mais antiga e total de perguntas do anúncio (públicas)."""
        r = self._get("/questions/search", {"item": item_id, "sort_fields": "date_created", "sort_types": "ASC",
                                            "limit": 1, "api_version": 4})
        if r.status_code >= 400:
            return {}
        d = r.json()
        perguntas = d.get("questions") or []
        return {"total": d.get("total"), "primeira": perguntas[0].get("date_created") if perguntas else None,
                "vendedor_id": str(perguntas[0].get("seller_id") or "") if perguntas else ""}

    MODOS_CATALOGO = {"ambos", "lista", "catalogo"}

    def modo_catalogo(self, anuncio) -> str:
        """ambos = lista geral + catálogo (padrão quando há produto de catálogo);
        lista = só anúncio próprio; catalogo = só na página do catálogo."""
        cfg = (anuncio.por_plataforma or {}).get("mercadolivre", {})
        if not cfg.get("catalog_product_id"):
            return "lista"
        modo = cfg.get("modo_catalogo") or "ambos"
        return modo if modo in self.MODOS_CATALOGO else "ambos"

    def _atributos_do_catalogo(self, product_id: str | None) -> dict:
        """Ficha técnica do produto de catálogo, por ID de atributo. Serve de
        fonte para os obrigatórios da categoria em qualquer categoria."""
        if not product_id:
            return {}
        r = self._get(f"/products/{product_id}")
        if r.status_code >= 400:
            return {}
        return {a["id"]: a["value_name"] for a in r.json().get("attributes") or [] if a.get("value_name")}

    def detalhe_catalogo(self, product_id: str) -> dict:
        d = self._json_ou_erro(self._get(f"/products/{product_id}"), "ler produto de catálogo")
        attrs = {a["id"]: a.get("value_name") for a in d.get("attributes") or [] if a.get("value_name")}
        fotos = d.get("pictures") or []
        return {"id": d.get("id", product_id), "nome": d.get("name", ""), "foto": fotos[0].get("url", "") if fotos else "",
                "status": d.get("status", ""), "domain_id": d.get("domain_id", ""),
                "marca": attrs.get("BRAND", ""), "modelo": attrs.get("MODEL", ""), "gtin": attrs.get("GTIN", ""),
                "link": f"https://www.mercadolivre.com.br/p/{d.get('id', product_id)}",
                "ficha": [{"nome": a.get("name"), "valor": a.get("value_name")} for a in d.get("attributes") or []
                          if a.get("value_name")][:15]}

    def buscar_catalogo(self, anuncio, termo: str | None = None) -> dict:
        """Produtos de catálogo parecidos com o rascunho: por GTIN (exato) e por
        texto dentro do domínio da categoria (sem o filtro de domínio, a busca
        por "parafusadeira" traz mandris e baterias)."""
        category_id = self._categoria(anuncio)
        dominio = self._json_ou_erro(self._get(f"/categories/{category_id}", auth=False),
                                     "ler categoria").get("settings", {}).get("catalog_domain")
        if not dominio:
            sug = self.prever_categorias(anuncio.titulo, 1)
            dominio = sug[0]["domain_id"] if sug else None
        vistos, candidatos = set(), []

        def adicionar(resultados, por_gtin=False):
            for x in resultados:
                if x.get("id") in vistos or x.get("status", "active") != "active":
                    continue
                vistos.add(x["id"])
                attrs = {a["id"]: a.get("value_name") for a in x.get("attributes") or [] if a.get("value_name")}
                fotos = x.get("pictures") or []
                candidatos.append({"id": x["id"], "nome": x.get("name", ""), "foto": fotos[0].get("url", "") if fotos else "",
                                   "marca": attrs.get("BRAND", ""), "modelo": attrs.get("MODEL", ""),
                                   "gtin": attrs.get("GTIN", ""), "por_gtin": por_gtin,
                                   "link": f"https://www.mercadolivre.com.br/p/{x['id']}"})

        if anuncio.gtin:
            r = self._get("/products/search", {"status": "active", "site_id": config.ML_SITE_ID,
                                               "product_identifier": anuncio.gtin})
            if r.status_code < 400:
                adicionar(r.json().get("results", []), por_gtin=True)
        q = termo or " ".join(p for p in [anuncio.marca, anuncio.modelo] if p) or anuncio.titulo
        params = {"status": "active", "site_id": config.ML_SITE_ID, "q": q, "limit": 10}
        if dominio:
            params["domain_id"] = dominio
        r = self._get("/products/search", params)
        if r.status_code < 400:
            adicionar(r.json().get("results", []))
        atual = ((anuncio.por_plataforma or {}).get("mercadolivre") or {}).get("catalog_product_id")
        return {"atual": self.detalhe_catalogo(atual) if atual else None, "candidatos": candidatos[:10],
                "dominio": dominio, "busca": q}

    def entrar_no_catalogo(self, item_id: str, catalog_product_id: str) -> dict:
        """Optin: cria a publicação de catálogo ligada a um anúncio já existente
        (preço e estoque passam a ser sincronizados pelo ML)."""
        headers = {"Authorization": f"Bearer {self._token()}"}
        r = self.http.get(f"{API}/items/{item_id}/catalog_listing_eligibility", headers=headers)
        if r.status_code < 400:
            eleg = r.json()
            if eleg.get("status") == "ALREADY_OPTED_IN":
                return {"ok": True, "ja_estava": True, "mensagem": "Este anúncio já está no catálogo."}
            if eleg.get("status") not in ("READY_FOR_OPTIN", "CATALOG_PRODUCT_ID_NULL", "PRODUCT_INACTIVE", None):
                raise ErroMarketplace(f"O ML diz que o anúncio {item_id} não pode entrar no catálogo agora "
                                      f"({eleg.get('status')}: {eleg.get('reason') or 'sem detalhe'}).")
        r = self.http.post(f"{API}/items/catalog_listings", headers=headers,
                           json={"item_id": item_id, "catalog_product_id": catalog_product_id})
        cat = self._json_ou_erro(r, "entrar no catálogo")
        return {"ok": True, "id": cat.get("id"), "link": cat.get("permalink", ""), "status": cat.get("status"),
                "mensagem": f"Publicação de catálogo {cat.get('id')} criada e ligada ao anúncio {item_id}."}

    def _categoria(self, anuncio) -> str:
        cfg = (anuncio.por_plataforma or {}).get("mercadolivre", {})
        if cfg.get("category_id"):
            return cfg["category_id"]
        consulta = " ".join(p for p in [anuncio.titulo, anuncio.marca, anuncio.modelo] if p)
        sugestoes = self.prever_categorias(consulta, 1)
        if not sugestoes:
            raise ErroMarketplace("Não consegui descobrir a categoria no Mercado Livre. "
                                  "Informe o ID da categoria no editor (aba Mercado Livre).")
        return sugestoes[0]["category_id"]

    def montar_payload(self, anuncio, catalogo_direto: bool = False) -> tuple[dict, dict]:
        """Payload de POST /items (o mesmo usado em /items/validate).
        Retorna (payload, contexto) com categoria e atributos faltando."""
        cfg = (anuncio.por_plataforma or {}).get("mercadolivre", {})
        category_id = self._categoria(anuncio)
        categoria = self._json_ou_erro(self._get(f"/categories/{category_id}", auth=False), "ler categoria")
        atributos_cat = self._json_ou_erro(self._get(f"/categories/{category_id}/attributes", auth=False),
                                           "ler atributos da categoria")
        do_catalogo = self._atributos_do_catalogo(cfg.get("catalog_product_id"))
        atributos, faltando = self.montar_atributos(anuncio, atributos_cat, do_catalogo)

        max_titulo = (categoria.get("settings") or {}).get("max_title_length") or 60
        usa_family = categoria.get("attribute_types") == "variations"
        payload = {
            "family_name" if usa_family else "title": cortar_titulo(anuncio.titulo, max_titulo),
            "category_id": category_id,
            "price": round(float(anuncio.preco), 2),
            "currency_id": "BRL",
            "available_quantity": int(anuncio.estoque or 1),
            "buying_mode": "buy_it_now",
            "condition": anuncio.condicao or "new",
            "listing_type_id": cfg.get("listing_type_id") or "gold_special",
            "pictures": self._fotos_ml(anuncio),
            "attributes": atributos,
        }
        if anuncio.sku:
            payload["attributes"].append({"id": "SELLER_SKU", "value_name": anuncio.sku})
        if cfg.get("catalog_product_id"):
            payload["catalog_product_id"] = cfg["catalog_product_id"]
            if catalogo_direto:
                payload["catalog_listing"] = True
        if cfg.get("garantia_tipo"):
            payload["sale_terms"] = [{"id": "WARRANTY_TYPE", "value_name": cfg["garantia_tipo"]}]
            if cfg.get("garantia_tempo"):
                payload["sale_terms"].append({"id": "WARRANTY_TIME", "value_name": cfg["garantia_tempo"]})
        nomes = {a["id"]: a.get("name", a["id"]) for a in atributos_cat}
        return payload, {"category_id": category_id, "categoria": categoria.get("name", category_id),
                         "faltando": faltando, "nomes": nomes}

    def validar(self, anuncio) -> dict:
        """Pergunta ao próprio ML se o anúncio seria aceito, SEM publicar
        (POST /items/validate). Funciona em qualquer categoria, inclusive para
        regras condicionais (ex.: GTIN obrigatório em Parafusadeiras)."""
        if not self._token():
            raise ErroMarketplace("Conecte a conta do Mercado Livre para validar.")
        if not anuncio.fotos:
            return {"erros": ["Adicione pelo menos uma foto."], "avisos": [], "modo": self.modo_catalogo(anuncio)}
        modo = self.modo_catalogo(anuncio)
        payload, ctx = self.montar_payload(anuncio, catalogo_direto=(modo == "catalogo"))
        r = self._post_item("/items/validate", payload, {"Authorization": f"Bearer {self._token()}"})
        erros, avisos = [], []
        if r.status_code >= 400:
            corpo = r.json() if r.content else {}
            for c in corpo.get("cause") or []:
                if c.get("code") in _CAUSAS_IGNORADAS:
                    continue
                texto = self._traduzir_causa(c, ctx["nomes"])
                (erros if c.get("type") == "error" else avisos).append(texto)
            if not corpo.get("cause"):
                erros.append(corpo.get("message") or f"HTTP {r.status_code}")
        return {"erros": erros, "avisos": avisos, "modo": modo, "categoria": ctx["categoria"],
                "category_id": ctx["category_id"]}

    def _post_item(self, caminho: str, payload: dict, headers: dict):
        """POST em /items ou /items/validate. Se o ML pedir family_name (modelo
        User Products) no lugar de title, ou o contrário, troca o campo e tenta
        de novo uma vez."""
        r = self.http.post(f"{API}{caminho}", json=payload, headers=headers)
        if r.status_code < 400:
            return r
        texto = r.text or ""
        if "family_name" in texto and "title" in payload:
            payload["family_name"] = payload.pop("title")
        elif re.search(r"title", texto) and "family_name" in payload and "family_name" not in texto:
            payload["title"] = payload.pop("family_name")
        else:
            return r
        return self.http.post(f"{API}{caminho}", json=payload, headers=headers)

    @staticmethod
    def _traduzir_causa(causa: dict, nomes: dict) -> str:
        codigo, msg = causa.get("code", ""), causa.get("message", "")
        ids = re.findall(r"attributes? \[([A-Z0-9_, ]+)\]", msg, flags=re.I)
        legiveis = ", ".join(nomes.get(i.strip(), i.strip()) for grupo in ids for i in grupo.split(",") if i.strip())
        if "missing_conditional_required" in codigo or "missing_required" in codigo:
            dica = " — informe o código de barras no campo EAN/GTIN" if "GTIN" in msg else ""
            return f"O Mercado Livre exige nesta categoria: {legiveis or msg}{dica}."
        if codigo == "item.shipping.mandatory_free_shipping":
            return "O ML vai aplicar frete grátis obrigatório neste preço (o custo do frete fica com você)."
        if codigo.startswith("item.attribute") and legiveis:
            return f"Atributo com problema ({legiveis}): {msg}"
        return _CAUSAS_CONHECIDAS.get(codigo, msg or codigo)

    def publicar(self, anuncio) -> ResultadoPublicacao:
        if not self._token():
            raise ErroMarketplace("Conta do Mercado Livre não conectada.")
        if not anuncio.fotos:
            raise ErroMarketplace("Adicione pelo menos uma foto antes de publicar no Mercado Livre.")
        modo = self.modo_catalogo(anuncio)
        payload, ctx = self.montar_payload(anuncio, catalogo_direto=(modo == "catalogo"))
        if ctx["faltando"] and modo != "catalogo":
            raise ErroMarketplace(
                f"Faltam atributos obrigatórios da categoria {ctx['categoria']}: {'; '.join(ctx['faltando'])}. "
                "No editor, abra a aba Mercado Livre em 'Ajustes por plataforma' e preencha em "
                "'Atributos obrigatórios da categoria'.", {"category_id": ctx["category_id"], "faltando": ctx["faltando"]})

        headers = {"Authorization": f"Bearer {self._token()}"}
        item = self._json_ou_erro(self._post_item("/items", payload, headers), "criar anúncio")

        aviso = ""
        if anuncio.descricao:
            rd = self.http.post(f"{API}/items/{item['id']}/description",
                                json={"plain_text": descricao_texto_puro(anuncio.descricao)}, headers=headers)
            if rd.status_code >= 400:
                aviso = f" (a descrição foi recusada: {self._explicar_erro(rd)})"

        status, moderacao = self._status_pos_publicacao(item)
        tipo = "no catálogo" if modo == "catalogo" else "na lista geral"
        mensagem = f"Publicado {tipo} do Mercado Livre como {item['id']}{aviso}."
        if status != "active":
            mensagem = (f"Anúncio {item['id']} criado, mas o Mercado Livre o deixou como '{status}'"
                        + (f": {moderacao}" if moderacao else " (em análise).")
                        + " Ajuste no editor e publique de novo, ou corrija no painel do ML.")
        detalhes = {"category_id": ctx["category_id"], "status": status, "moderacao": moderacao, "modo": modo,
                    "catalog_product_id": payload.get("catalog_product_id")}

        if modo == "ambos":
            try:
                cat = self.entrar_no_catalogo(item["id"], payload["catalog_product_id"])
                detalhes["catalogo"] = cat
                mensagem += f" {cat['mensagem']}"
            except ErroMarketplace as e:
                detalhes["catalogo"] = {"ok": False, "erro": e.mensagem}
                mensagem += (f" Não entrou no catálogo agora ({e.mensagem}). Tente de novo em alguns minutos "
                             "pelo botão 'Entrar no catálogo' no editor.")
        return ResultadoPublicacao(sucesso=True, id_externo=item["id"], link=item.get("permalink", ""),
                                   mensagem=mensagem, detalhes=detalhes)

    def _fotos_ml(self, anuncio) -> list[dict]:
        """Fotos no formato do ML. Arquivos enviados ao Replique sobem uma vez
        só: o picture_id fica guardado no rascunho (fotos_ml) e é reaproveitado
        na validação e na publicação."""
        cfg = dict((anuncio.por_plataforma or {}).get("mercadolivre", {}))
        cache = dict(cfg.get("fotos_ml") or {})
        saida = []
        for url in (anuncio.fotos or [])[:12]:
            if url.startswith("http") and "127.0.0.1" not in url and "localhost" not in url:
                saida.append({"source": url})
                continue
            if url not in cache:
                cache[url] = self._foto_para_ml(url)["id"]
            saida.append({"id": cache[url]})
        if cache != (cfg.get("fotos_ml") or {}):
            cfg["fotos_ml"] = cache
            anuncio.por_plataforma = {**(anuncio.por_plataforma or {}), "mercadolivre": cfg}
        return saida

    def _status_pos_publicacao(self, item: dict) -> tuple[str, str]:
        """A moderação automática do ML roda segundos depois de criar o item
        e pode pausá-lo (ex.: "título/fotos não correspondem ao produto" —
        visto no teste real de 2026-09-24). Confere o status e busca o motivo."""
        headers = {"Authorization": f"Bearer {self._token()}"}
        status = item.get("status", "")
        for _ in range(3):
            time.sleep(2)
            r = self.http.get(f"{API}/items/{item['id']}", headers=headers)
            if r.status_code < 400:
                status = r.json().get("status", status)
                if status != "active":
                    break
        if status == "active":
            return status, ""
        r = self.http.get(f"{API}/moderations/infractions/{item.get('seller_id') or self.cred.get('user_id')}",
                          params={"related_item_id": item["id"]}, headers=headers)
        infracoes = r.json().get("infractions", []) if r.status_code < 400 else []
        return status, "; ".join(i.get("reason", "") for i in infracoes if i.get("reason"))

    def atributos_para_editor(self, anuncio) -> dict:
        """Atributos da categoria para o editor: obrigatórios primeiro, com as
        opções aceitas e o valor que o Replique já sabe (e de onde veio)."""
        category_id = self._categoria(anuncio)
        categoria = self._json_ou_erro(self._get(f"/categories/{category_id}", auth=False), "ler categoria")
        attrs = self._json_ou_erro(self._get(f"/categories/{category_id}/attributes", auth=False),
                                   "ler atributos da categoria")
        do_catalogo = self._atributos_do_catalogo(((anuncio.por_plataforma or {}).get("mercadolivre") or {})
                                                  .get("catalog_product_id"))
        analise = [{k: v for k, v in a.items() if k != "_attr"}
                   for a in self.analisar_atributos(anuncio, attrs, do_catalogo)]
        obrigatorios = [a for a in analise if a["obrigatorio"] and a["id"] not in ("EMPTY_GTIN_REASON",)]
        return {"category_id": category_id, "category_name": categoria.get("name", category_id),
                "obrigatorios": obrigatorios, "faltando": sum(1 for a in obrigatorios if not a["valor"])}

    def _foto_para_ml(self, url: str) -> dict:
        if url.startswith("http") and "127.0.0.1" not in url and "localhost" not in url:
            return {"source": url}
        conteudo, nome = self.baixar_imagem(url)
        for tentativa in range(3):
            try:
                r = self.http.post(f"{API}/pictures/items/upload", files={"file": (nome, conteudo)},
                                   headers={"Authorization": f"Bearer {self._token()}"}, timeout=60)
            except httpx.TransportError:
                r = None
            if r is not None and r.status_code < 500:
                break
            time.sleep(2 * (tentativa + 1))
        if r is None:
            raise ErroMarketplace(f"Não consegui enviar a foto {nome}: o Mercado Livre não respondeu. Tente de novo.")
        dados = self._json_ou_erro(r, f"enviar foto {nome} (mínimo 500px no menor lado)")
        return {"id": dados["id"]}

    @staticmethod
    def analisar_atributos(anuncio, atributos_cat: list[dict], do_catalogo: dict | None = None) -> list[dict]:
        """Casa as características do rascunho com os atributos da categoria.

        Tolerante a acentos, maiúsculas e plural, por nome ou por ID: o catálogo
        do ML chama de "Tipos de alimentação" (POWER_SUPPLY_TYPES) o que a
        categoria chama de "Tipo de alimentação" (POWER_SUPPLY_TYPE) — caso
        real de 2026-09-24. Atributo obrigatório de opções fixas sem valor é
        deduzido do título quando exatamente uma opção aparece nele.

        Retorna um item por atributo da categoria (exceto somente-leitura):
        {id, nome, obrigatorio, opcoes, valor, origem: informado|dados|catalogo|deduzido|faltando}.
        do_catalogo: ficha técnica do produto de catálogo ({ID: valor}), usada
        quando o rascunho não tem o valor.
        """
        do_catalogo = do_catalogo or {}
        informados = {}
        for k, v in (anuncio.atributos or {}).items():
            if v not in (None, ""):
                informados.setdefault(_normalizar(k), v)
        ids_copiados = ((anuncio.por_plataforma or {}).get("mercadolivre") or {}).get("atributos_ids") or {}
        for nome, aid in ids_copiados.items():
            if anuncio.atributos.get(nome) not in (None, ""):
                informados.setdefault(_normalizar(aid), anuncio.atributos[nome])
        base = {"brand": anuncio.marca, "model": anuncio.modelo, "gtin": anuncio.gtin}
        if not anuncio.gtin:
            base["empty_gtin_reason"] = "O produto não tem código cadastrado"
        titulo = f" {_normalizar(anuncio.titulo)} "

        analise = []
        for attr in atributos_cat:
            tags = attr.get("tags") or {}
            if tags.get("read_only") or tags.get("fixed"):
                continue
            aid, nome = attr["id"], (attr.get("name") or "").strip()
            opcoes = [o.get("name") for o in attr.get("values") or [] if o.get("name")]
            obrigatorio = bool(tags.get("required") or tags.get("catalog_required"))
            valor = informados.get(_normalizar(aid)) or informados.get(_normalizar(nome))
            origem = "informado" if valor else ""
            if not valor and base.get(aid.lower()) and aid != "EMPTY_GTIN_REASON":
                valor, origem = base[aid.lower()], "dados"
            if not valor and do_catalogo.get(aid):
                valor, origem = do_catalogo[aid], "catalogo"
            if not valor and aid == "EMPTY_GTIN_REASON" and not do_catalogo.get("GTIN") and base.get("empty_gtin_reason"):
                valor, origem = base["empty_gtin_reason"], "dados"
            if not valor and obrigatorio and opcoes:
                achadas = [o for o in opcoes if f" {_normalizar(o)} " in titulo]
                if len(achadas) == 1:
                    valor, origem = achadas[0], "deduzido"
            analise.append({"id": aid, "nome": nome or aid, "obrigatorio": obrigatorio, "opcoes": opcoes,
                            "tipo": attr.get("value_type", ""), "unidade": attr.get("default_unit", ""),
                            "valor": valor or "", "origem": origem or "faltando", "_attr": attr})
        return analise

    @classmethod
    def montar_atributos(cls, anuncio, atributos_cat: list[dict],
                         do_catalogo: dict | None = None) -> tuple[list[dict], list[str]]:
        """(atributos no formato do POST /items, obrigatórios faltando com as opções aceitas)."""
        saida, faltando = [], []
        for a in cls.analisar_atributos(anuncio, atributos_cat, do_catalogo):
            if a["valor"]:
                saida.append(_valor_atributo(a["_attr"], a["valor"]))
            elif a["obrigatorio"]:
                opcoes = f" (opções: {', '.join(a['opcoes'][:8])}{'…' if len(a['opcoes']) > 8 else ''})" if a["opcoes"] else ""
                faltando.append(a["nome"] + opcoes)
        return saida, faltando


def _aderencia(termo: str, marca: str, categorias: list[dict], titulo: str) -> float:
    """Fração das palavras "de modelo" do termo que aparecem no título (0 a 1).
    Palavras de modelo = o que sobra tirando a marca, o nome da categoria e
    conectivos: "parafusadeira bosch gsr 120" → {"gsr", "120"}."""
    genericas = {"de", "da", "do", "para", "com", "e", "kit", "jogo", "conjunto"}
    genericas |= set(_normalizar(marca).split())
    for c in categorias:
        genericas |= set(_normalizar(c.get("category_name")).split()) | set(_normalizar(c.get("domain_name")).split())
    palavras = [p for p in _normalizar(termo).split() if p not in genericas]
    if not palavras:
        return 1.0
    no_titulo = set(_normalizar(titulo).split())
    return round(sum(p in no_titulo for p in palavras) / len(palavras), 2)


def _normalizar(texto) -> str:
    """'Tipos de Alimentação' → 'tipo de alimentacao'; 'POWER_SUPPLY_TYPES' → 'power supply type'."""
    import unicodedata
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode().lower()
    palavras = "".join(c if c.isalnum() else " " for c in t).split()
    return " ".join(p[:-1] if len(p) > 3 and p.endswith("s") else p for p in palavras)


_CAUSAS_IGNORADAS = {"shipping.lost_me1_by_user"}

_IDS_EM_CAMPO_PROPRIO = {"BRAND", "MODEL", "GTIN", "ITEM_CONDITION", "EMPTY_GTIN_REASON"}


def _ids_por_nome(atributos: list[dict] | None) -> dict:
    """{"Cor": "COLOR", ...} — guardado no rascunho para casar pelo ID na publicação."""
    return {(a.get("name") or a["id"]): a["id"] for a in atributos or []
            if a.get("value_name") and a.get("id") not in _IDS_EM_CAMPO_PROPRIO}


def _por_nome(atributos: list[dict] | None) -> dict:
    """Características copiadas ficam com o nome legível ("Cor": "Preto").
    Marca, modelo e GTIN vão para campos próprios do rascunho."""
    return {(a.get("name") or a["id"]): a["value_name"] for a in atributos or []
            if a.get("value_name") and a.get("id") not in _IDS_EM_CAMPO_PROPRIO}


def _copia_restrita(id_externo: str, link: str, descricao: str) -> AnuncioCopiado:
    """Rascunho de um anúncio cujos dados o ML não libera: fica o link e,
    quando houver, a descrição; o usuário completa título, fotos e preço."""
    return AnuncioCopiado(
        titulo="", descricao=descricao, link=link,
        por_plataforma={"mercadolivre": {"aviso_copia": (
            "O Mercado Livre não libera título, fotos e preço de anúncios de outros vendedores. "
            "Abra o anúncio original pelo link e complete esses campos.")}},
    )


def _valor_atributo(attr: dict, valor) -> dict:
    valor = str(valor).strip()
    for opcao in attr.get("values") or []:
        if _normalizar(opcao.get("name")) == _normalizar(valor):
            return {"id": attr["id"], "value_id": opcao["id"], "value_name": opcao["name"]}
    if attr.get("value_type") == "number_unit" and attr.get("default_unit"):
        try:
            float(valor.replace(",", "."))
            valor = f"{valor} {attr['default_unit']}"
        except ValueError:
            pass
    return {"id": attr["id"], "value_name": valor}


def _sku(campo: str | None, atributos: list[dict] | None) -> str:
    """SKU do anúncio/variação: o campo antigo ou o atributo SELLER_SKU."""
    if campo and str(campo).strip():
        return str(campo).strip()[:80]
    for a in atributos or []:
        if a.get("id") == "SELLER_SKU" and a.get("value_name"):
            return str(a["value_name"]).strip()[:80]
    return ""


def _linhas_diarias(resposta) -> list[dict]:
    """Métricas diárias do Ad Group: a resposta traz a lista em "results" ou
    em "metrics" (conforme a versão); aceita as duas formas."""
    if isinstance(resposta, list):
        return [x for x in resposta if isinstance(x, dict)]
    for chave in ("results", "metrics", "daily"):
        valor = resposta.get(chave) if isinstance(resposta, dict) else None
        if isinstance(valor, list):
            return [x for x in valor if isinstance(x, dict)]
    return []


_LOGISTICA = {"fulfillment": "Full", "self_service": "Flex", "cross_docking": "Coleta", "xd_drop_off": "Agência",
              "drop_off": "Correios", "default": "Próprio", "not_specified": "A combinar"}


def _medida_em(valor, unidades: dict) -> float | None:
    m = re.match(r"\s*([\d.,]+)\s*([a-zA-Z]+)", str(valor or ""))
    if not m or m.group(2).lower() not in unidades:
        return None
    try:
        return float(m.group(1).replace(",", ".")) * unidades[m.group(2).lower()]
    except ValueError:
        return None


def _embalagem(attrs: dict) -> dict:
    """Peso e medidas do produto de catálogo (servem para o custo do frete)."""
    peso = _medida_em(attrs.get("PACKAGE_WEIGHT") or attrs.get("WEIGHT"), {"kg": 1, "g": 0.001})
    cm = {"cm": 1, "mm": 0.1, "m": 100}
    dims = {"comprimento": _medida_em(attrs.get("PACKAGE_LENGTH") or attrs.get("LENGTH"), cm),
            "largura": _medida_em(attrs.get("PACKAGE_WIDTH") or attrs.get("WIDTH"), cm),
            "altura": _medida_em(attrs.get("PACKAGE_HEIGHT") or attrs.get("HEIGHT"), cm)}
    saida = {}
    if peso:
        saida["peso_kg"] = round(peso, 3)
    if all(dims.values()):
        saida["dimensoes_cm"] = {k: round(v, 1) for k, v in dims.items()}
    return saida


def _brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _oferta_curta(o: dict) -> dict:
    """Um anúncio do produto, só com o que a lista e os filtros usam."""
    ship = o.get("shipping") or {}
    return {"item_id": o.get("item_id"), "preco": o.get("price"), "preco_original": o.get("original_price"),
            "full": ship.get("logistic_type") == "fulfillment", "frete_gratis": bool(ship.get("free_shipping")),
            "tipo_anuncio": {"gold_pro": "Premium", "gold_special": "Clássico"}.get(o.get("listing_type_id"), ""),
            "loja_oficial": bool(o.get("official_store_id")), "vendedor_id": o.get("seller_id"),
            "condicao": o.get("condition") or "",
            "cidade": ((o.get("seller_address") or {}).get("city") or {}).get("name", "")}


def _resumo_ofertas(ofertas: list[dict], total: int) -> dict:
    """Números do produto para comparar na lista de resultados."""
    precos = sorted(o["price"] for o in ofertas if o.get("price"))
    ship = [o.get("shipping") or {} for o in ofertas]
    return {"anuncios": total, "vendedores": len({o.get("seller_id") for o in ofertas}),
            "full": sum(1 for s in ship if s.get("logistic_type") == "fulfillment"),
            "frete_gratis": sum(1 for s in ship if s.get("free_shipping")),
            "lojas_oficiais": sum(1 for o in ofertas if o.get("official_store_id")),
            "premium": sum(1 for o in ofertas if o.get("listing_type_id") == "gold_pro"),
            "classico": sum(1 for o in ofertas if o.get("listing_type_id") == "gold_special"),
            "fora_full": sum(1 for s in ship if s.get("logistic_type") != "fulfillment"),
            "preco_min": precos[0] if precos else None, "preco_max": precos[-1] if precos else None,
            "preco_mediano": precos[len(precos) // 2] if precos else None}
