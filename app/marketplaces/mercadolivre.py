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
- Categorias com attribute_types="variations" exigem family_name no lugar de title.
- Foto precisa de no mínimo 500px no menor lado (ideal 1200x1200).
- 403 "restrictions_coliving"/"address_pending" = conta sem endereço de
  despacho cadastrado; não é bug de integração.
"""

from __future__ import annotations

import re
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

import httpx

from app import config
from app.marketplaces.base import (
    AnuncioCopiado, ErroMarketplace, Marketplace, ResultadoPesquisa, ResultadoPublicacao,
    popularidade_por_posicao,
)
from app.services.conteudo import cortar_titulo, descricao_texto_puro

API = "https://api.mercadolibre.com"
AUTH_URL = "https://auth.mercadolivre.com.br/authorization"

# Mensagens do ML traduzidas para o que o usuário precisa fazer.
_CAUSAS_CONHECIDAS = {
    "restrictions_coliving": "Sua conta do Mercado Livre está impedida de anunciar. Normalmente falta cadastrar o "
                             "endereço de despacho (Mercado Envios) — confira em Minha conta > Endereços.",
    "address_pending": "Falta cadastrar o endereço de despacho na conta do Mercado Livre.",
    "item.title.length": "O título passou do limite de caracteres da categoria.",
    "item.pictures.min": "O Mercado Livre exige pelo menos uma foto.",
}


def url_autorizacao(state: str | None = None) -> str:
    if not config.ML_CLIENT_ID:
        raise ErroMarketplace("ML_CLIENT_ID não configurado no .env do Replique.")
    params = {"response_type": "code", "client_id": config.ML_CLIENT_ID,
              "redirect_uri": config.ML_REDIRECT_URI, "state": state or secrets.token_urlsafe(8)}
    return f"{AUTH_URL}?{urlencode(params)}"


def trocar_code_por_token(http, code: str) -> dict:
    r = http.post(f"{API}/oauth/token", data={
        "grant_type": "authorization_code", "client_id": config.ML_CLIENT_ID,
        "client_secret": config.ML_CLIENT_SECRET, "code": code.strip(),
        "redirect_uri": config.ML_REDIRECT_URI,
    })
    if r.status_code >= 400:
        raise ErroMarketplace(f"O Mercado Livre recusou o código de autorização: {r.text[:300]}")
    dados = r.json()
    dados["obtido_em"] = time.time()
    return dados


class MercadoLivre(Marketplace):
    plataforma = "mercadolivre"

    # ---------- autenticação ----------
    def _token(self) -> str | None:
        if not self.cred.get("access_token"):
            return None
        expira = self.cred.get("obtido_em", 0) + self.cred.get("expires_in", 21600) - 120
        if time.time() > expira and not self.cred.get("refresh_token"):
            # App sem acesso off-line no DevCenter: o ML não entrega refresh_token,
            # então não há como renovar sem um novo login do vendedor.
            raise ErroMarketplace("A conexão com o Mercado Livre expirou (vale 6 horas porque o app não tem "
                                  "renovação automática). Reconecte em Contas.")
        if time.time() > expira:
            with self.renovando():
                # outro processo/thread pode ter renovado enquanto esperávamos
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
        headers = {}
        if auth and (tok := self._token()):
            headers["Authorization"] = f"Bearer {tok}"
        return self.http.get(f"{API}{caminho}", params=params, headers=headers)

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

    # ---------- pesquisa ----------
    def prever_categorias(self, termo: str, limite: int = 3) -> list[dict]:
        r = self._get(f"/sites/{config.ML_SITE_ID}/domain_discovery/search",
                      {"q": termo, "limit": limite}, auth=False)
        if r.status_code >= 400:
            return []
        return [{"category_id": d.get("category_id"), "category_name": d.get("category_name"),
                 "domain_id": d.get("domain_id"), "domain_name": d.get("domain_name"),
                 # o ML reconhece marca (e às vezes linha/modelo) no texto: {"BRAND": "Vonder"}
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

        # 1. ranking oficial, filtrado pela marca
        ranking: list[ResultadoPesquisa] = []
        for ordem, cat in enumerate(categorias):
            r = self._get(f"/highlights/{config.ML_SITE_ID}/category/{cat['category_id']}")
            if r.status_code < 400:
                ranking += [x for x in self._resolver_destaques(r.json().get("content", []), cat, ordem, marca)
                            if x.extra.get("da_marca")]
        fontes["ranking"] = len(ranking)

        # 2. busca do ML (ordem de relevância do próprio ML)
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
            fontes["busca"] = -1  # endpoint indisponível para este app/conta

        # 3. catálogo do ML
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

        # junta sem repetir: o mesmo produto pode vir pelo ranking, pela busca e pelo catálogo
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
        # quem tem as palavras do modelo sobe; empate: ranking > busca > catálogo, na ordem do ML
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
        self._token()  # renova antes de disparar chamadas em paralelo
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
                    # título e ficha são restritos: a descrição é o único jeito de saber a marca
                    if marca:
                        res.extra["da_marca"] = marca_n in f" {_normalizar(texto)} "
            else:  # USER_PRODUCT
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

    # ---------- cópia ----------
    def obter_anuncio(self, id_externo: str, tipo: str = "ITEM") -> AnuncioCopiado:
        if tipo == "PRODUCT":
            return self._obter_produto(id_externo)
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
            # Anúncio de outro vendedor: o ML só libera a descrição.
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

    def _obter_produto(self, product_id: str) -> AnuncioCopiado:
        d = self._json_ou_erro(self._get(f"/products/{product_id}"), "ler produto de catálogo")
        attrs = {a["id"]: a.get("value_name") for a in d.get("attributes") or [] if a.get("value_name")}
        descricao = (d.get("short_description") or {}).get("content", "")
        preco, category_id = (d.get("buy_box_winner") or {}).get("price") or 0, ""
        # Vendedores do produto: dão o preço praticado, a categoria (necessária
        # para publicar) e a descrição completa do líder, que é liberada.
        r = self._get(f"/products/{product_id}/items")
        ofertas = [o for o in (r.json().get("results", []) if r.status_code < 400 else []) if o.get("price")]
        if ofertas:
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
            link=d.get("permalink") or f"https://www.mercadolivre.com.br/p/{product_id}",
            por_plataforma={"mercadolivre": {"category_id": category_id, "catalog_product_id": product_id,
                                             "atributos_ids": _ids_por_nome(d.get("attributes"))}},
        )

    # ---------- publicação ----------
    # ---------- acompanhamento: reputação, perguntas, tarifas, preços ----------
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
            lote = self._req("GET", "/items", "ler anúncios", params={
                "ids": ",".join(ids[i:i + 20]),
                "attributes": "id,title,price,status,sub_status,permalink,thumbnail,available_quantity,sold_quantity"})
            saida += [x["body"] for x in lote if x.get("code") == 200 and x.get("body")]
        return saida

    def item(self, item_id: str) -> dict:
        return self._req("GET", f"/items/{item_id}", "ler anúncio")

    def ofertas_do_produto(self, product_id: str) -> list[dict]:
        r = self._get(f"/products/{product_id}/items")
        return [o for o in (r.json().get("results", []) if r.status_code < 400 else []) if o.get("price")]

    def atualizar_preco(self, item_id: str, preco: float) -> dict:
        return self._req("PUT", f"/items/{item_id}", "atualizar preço", json={"price": round(preco, 2)})

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
        r = self._get(f"/sites/{config.ML_SITE_ID}/listing_prices", params, auth=False)
        if r.status_code >= 400:
            return None
        d = r.json()
        d = d[0] if isinstance(d, list) and d else d
        return d if isinstance(d, dict) and "sale_fee_amount" in d else None

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

    # ---------- catálogo ----------
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

    # ---------- validação e publicação ----------
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
        r = self.http.post(f"{API}/items/validate", json=payload, headers={"Authorization": f"Bearer {self._token()}"})
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

    @staticmethod
    def _traduzir_causa(causa: dict, nomes: dict) -> str:
        codigo, msg = causa.get("code", ""), causa.get("message", "")
        # só a lista depois de "attributes" (a mensagem também cita "[MLB189008]", a categoria)
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
        # No catálogo direto a ficha técnica vem do produto; só barra o que faltar nos outros modos.
        if ctx["faltando"] and modo != "catalogo":
            raise ErroMarketplace(
                f"Faltam atributos obrigatórios da categoria {ctx['categoria']}: {'; '.join(ctx['faltando'])}. "
                "No editor, abra a aba Mercado Livre em 'Ajustes por plataforma' e preencha em "
                "'Atributos obrigatórios da categoria'.", {"category_id": ctx["category_id"], "faltando": ctx["faltando"]})

        headers = {"Authorization": f"Bearer {self._token()}"}
        item = self._json_ou_erro(self.http.post(f"{API}/items", json=payload, headers=headers), "criar anúncio")

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
        # URL pública da internet: o ML baixa sozinho. Arquivo enviado ao
        # Replique: faz upload direto (o ML não alcança nosso servidor local).
        if url.startswith("http") and "127.0.0.1" not in url and "localhost" not in url:
            return {"source": url}
        conteudo, nome = self.baixar_imagem(url)
        # O upload do ML às vezes falha por instabilidade dele ("upstream connect
        # error", visto em 2026-09-24): tenta até 3 vezes antes de desistir.
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


# Avisos internos do ML sem efeito para o vendedor (ex.: a conta não usa o Mercado Envios 1).
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
