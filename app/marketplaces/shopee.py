"""Shopee.

A Shopee tem duas APIs diferentes, e o Replique usa as duas:

1. PESQUISA — API de Afiliados (open-api.affiliate.shopee.com.br/graphql)
   A Open Platform de vendedor só enxerga a PRÓPRIA loja; para ver os
   produtos que mais vendem de outros vendedores, o caminho oficial é a
   API de Afiliados, com `productOfferV2(keyword, sortType: 2)` (ordenado
   por vendas). Credenciais: AppId + Secret do painel de afiliado
   (affiliate.shopee.com.br > Open API). Cada empresa usa as suas.
   Assinatura: SHA256(AppId + Timestamp + Payload + Secret).

2. PUBLICAÇÃO — Open Platform v2 (partner.shopeemobile.com)
   Credenciais do aplicativo parceiro (SHOPEE_PARTNER_ID/KEY no .env) +
   access_token/shop_id da loja do cliente (via autorização).
   Assinatura: HMAC-SHA256(partner_key, partner_id + path + timestamp
   [+ access_token + shop_id]).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from app import config
from app.marketplaces.base import (
    AnuncioCopiado, ErroMarketplace, Marketplace, ResultadoPesquisa, ResultadoPublicacao,
    popularidade_por_vendas,
)
from app.services.conteudo import cortar_titulo, descricao_texto_puro

AFILIADOS_URL = "https://open-api.affiliate.shopee.com.br/graphql"

_QUERY_PRODUTOS = """query {{
  productOfferV2(keyword: {kw}, sortType: 2, page: 1, limit: {limite}) {{
    nodes {{ itemId productName productLink offerLink imageUrl priceMin priceMax
             sales ratingStar shopId shopName priceDiscountRate }}
    pageInfo {{ page limit hasNextPage }}
  }}
}}"""


def _assinar(caminho: str, ts: int, access_token: str = "", shop_id: str = "") -> str:
    base = f"{config.SHOPEE_PARTNER_ID}{caminho}{ts}{access_token}{shop_id}"
    return hmac.new(config.SHOPEE_PARTNER_KEY.encode(), base.encode(), hashlib.sha256).hexdigest()


def url_autorizacao() -> str:
    if not (config.SHOPEE_PARTNER_ID and config.SHOPEE_PARTNER_KEY):
        raise ErroMarketplace("SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY não configurados no .env do Replique.")
    caminho, ts = "/api/v2/shop/auth_partner", int(time.time())
    params = {"partner_id": config.SHOPEE_PARTNER_ID, "timestamp": ts,
              "sign": _assinar(caminho, ts), "redirect": config.SHOPEE_REDIRECT_URI}
    return f"{config.SHOPEE_HOST}{caminho}?{urlencode(params)}"


def trocar_code_por_token(http, code: str, shop_id: str) -> dict:
    caminho, ts = "/api/v2/auth/token/get", int(time.time())
    r = http.post(f"{config.SHOPEE_HOST}{caminho}",
                  params={"partner_id": config.SHOPEE_PARTNER_ID, "timestamp": ts, "sign": _assinar(caminho, ts)},
                  json={"code": code.strip(), "shop_id": int(shop_id), "partner_id": int(config.SHOPEE_PARTNER_ID)})
    dados = r.json() if r.content else {}
    if r.status_code >= 400 or dados.get("error"):
        raise ErroMarketplace(f"A Shopee recusou a autorização: {dados.get('message') or r.text[:300]}")
    dados["obtido_em"] = time.time()
    dados["shop_id"] = str(shop_id)
    return dados


class Shopee(Marketplace):
    plataforma = "shopee"

    # ---------- pesquisa (API de Afiliados) ----------
    def tem_afiliados(self) -> bool:
        return bool(self.cred.get("afiliado_app_id") and self.cred.get("afiliado_secret"))

    def tem_loja(self) -> bool:
        return bool(self.cred.get("access_token") and self.cred.get("shop_id"))

    def _afiliados(self, query: str) -> dict:
        app_id, secret = self.cred["afiliado_app_id"], self.cred["afiliado_secret"]
        payload = json.dumps({"query": query}, separators=(",", ":"))
        ts = str(int(time.time()))
        assinatura = hashlib.sha256(f"{app_id}{ts}{payload}{secret}".encode()).hexdigest()
        r = self.http.post(AFILIADOS_URL, content=payload, headers={
            "Content-Type": "application/json",
            "Authorization": f"SHA256 Credential={app_id}, Timestamp={ts}, Signature={assinatura}",
        })
        if r.status_code >= 400:
            raise ErroMarketplace(f"Shopee Afiliados recusou a consulta (HTTP {r.status_code}).")
        dados = r.json()
        if dados.get("errors"):
            msg = dados["errors"][0].get("message", "erro desconhecido")
            raise ErroMarketplace(f"Shopee Afiliados: {msg}. Confira AppId e Secret em Contas.")
        return dados.get("data") or {}

    def pesquisar(self, termo: str, limite: int = 20) -> list[ResultadoPesquisa]:
        if not self.tem_afiliados():
            raise ErroMarketplace("Para ver os mais vendidos da Shopee, informe o AppId e o Secret da "
                                  "API de Afiliados em Contas.")
        dados = self._afiliados(_QUERY_PRODUTOS.format(kw=json.dumps(termo), limite=min(limite, 50)))
        nos = (dados.get("productOfferV2") or {}).get("nodes") or []
        saida = []
        for n in nos:
            vendidos = n.get("sales")
            saida.append(ResultadoPesquisa(
                plataforma=self.plataforma, id_externo=f"{n.get('shopId')}.{n.get('itemId')}",
                titulo=n.get("productName", ""), preco=_num(n.get("priceMin")),
                imagem=n.get("imageUrl", ""), link=n.get("productLink", ""),
                vendidos=vendidos, avaliacao=_num(n.get("ratingStar")), vendedor=n.get("shopName", ""),
                popularidade=popularidade_por_vendas(vendidos),
                origem_sinal=f"{vendidos} vendidos" if vendidos is not None else "",
                extra={"preco_max": _num(n.get("priceMax")), "desconto": n.get("priceDiscountRate")},
            ))
        saida.sort(key=lambda r: r.vendidos or 0, reverse=True)
        return saida

    def obter_anuncio(self, id_externo: str, tipo: str = "ITEM") -> AnuncioCopiado:
        # A API de Afiliados não entrega descrição nem galeria completa; a
        # Shopee não oferece API pública para isso. Copiamos o que existe.
        shop_id, _, item_id = id_externo.partition(".")
        query = ("query { productOfferV2(itemId: %s, shopId: %s, page: 1, limit: 1) { nodes { itemId productName "
                 "productLink imageUrl priceMin sales shopName } } }") % (int(item_id), int(shop_id))
        nos = []
        if self.tem_afiliados():
            nos = (self._afiliados(query).get("productOfferV2") or {}).get("nodes") or []
        if not nos:
            raise ErroMarketplace("Não encontrei esse produto na API de Afiliados da Shopee.")
        n = nos[0]
        return AnuncioCopiado(
            titulo=n.get("productName", ""), preco=_num(n.get("priceMin")) or 0,
            fotos=[n["imageUrl"]] if n.get("imageUrl") else [],
            link=n.get("productLink", ""),
            descricao="",
            por_plataforma={"shopee": {"aviso_copia": "A Shopee só fornece título, preço e a foto principal. "
                                                      "Complete a descrição e as demais fotos."}},
        )

    # ---------- publicação (Open Platform v2) ----------
    def _token(self) -> str:
        if not self.tem_loja():
            raise ErroMarketplace("Loja da Shopee não autorizada. Conecte em Contas para publicar.")
        vencido = lambda: time.time() > self.cred.get("obtido_em", 0) + self.cred.get("expire_in", 14400) - 300  # noqa: E731
        if vencido():
            with self.renovando():  # um renova por vez; os outros usam o token novo
                if vencido():
                    caminho, ts = "/api/v2/auth/access_token/get", int(time.time())
                    r = self.http.post(f"{config.SHOPEE_HOST}{caminho}",
                                       params={"partner_id": config.SHOPEE_PARTNER_ID, "timestamp": ts,
                                               "sign": _assinar(caminho, ts)},
                                       json={"refresh_token": self.cred["refresh_token"], "shop_id": int(self.cred["shop_id"]),
                                             "partner_id": int(config.SHOPEE_PARTNER_ID)})
                    dados = r.json() if r.content else {}
                    if r.status_code >= 400 or dados.get("error"):
                        raise ErroMarketplace("A autorização da Shopee expirou. Reconecte a loja em Contas.")
                    self.cred.update({k: dados[k] for k in ("access_token", "refresh_token", "expire_in") if k in dados})
                    self.cred["obtido_em"] = time.time()
                    self.salvar_credenciais()
        return self.cred["access_token"]

    def _loja(self, metodo: str, caminho: str, params: dict | None = None, corpo: dict | None = None) -> dict:
        tok, shop_id, ts = self._token(), self.cred["shop_id"], int(time.time())
        q = {"partner_id": config.SHOPEE_PARTNER_ID, "timestamp": ts, "access_token": tok,
             "shop_id": shop_id, "sign": _assinar(caminho, ts, tok, shop_id), **(params or {})}
        r = self.http.request(metodo, f"{config.SHOPEE_HOST}{caminho}", params=q, json=corpo)
        dados = r.json() if r.content else {}
        if r.status_code >= 400 or dados.get("error"):
            raise ErroMarketplace(f"Shopee ({caminho.rsplit('/', 1)[-1]}): {dados.get('message') or dados.get('error') or r.status_code}",
                                  {"resposta": dados})
        return dados.get("response") or {}

    def _enviar_imagem(self, url: str) -> str:
        conteudo, nome = self.baixar_imagem(url)
        caminho, ts = "/api/v2/media_space/upload_image", int(time.time())
        r = self.http.post(f"{config.SHOPEE_HOST}{caminho}",
                           params={"partner_id": config.SHOPEE_PARTNER_ID, "timestamp": ts, "sign": _assinar(caminho, ts)},
                           files={"image": (nome, conteudo)}, timeout=60)
        dados = r.json() if r.content else {}
        if r.status_code >= 400 or dados.get("error"):
            raise ErroMarketplace(f"A Shopee recusou a foto {nome}: {dados.get('message') or r.status_code}")
        info = (dados.get("response") or {}).get("image_info") or {}
        return info.get("image_id") or info.get("image_info_list", [{}])[0].get("image_info", {}).get("image_id")

    def publicar(self, anuncio) -> ResultadoPublicacao:
        cfg = (anuncio.por_plataforma or {}).get("shopee", {})
        if not anuncio.peso_kg:
            raise ErroMarketplace("A Shopee exige o peso do produto (kg). Preencha no editor.")

        category_id = cfg.get("category_id")
        if not category_id:
            rec = self._loja("GET", "/api/v2/product/category_recommend", {"item_name": anuncio.titulo[:120]})
            ids = rec.get("category_id") or []
            if not ids:
                raise ErroMarketplace("A Shopee não sugeriu categoria. Informe o ID da categoria na aba Shopee do editor.")
            category_id = ids[0]

        canais = self._loja("GET", "/api/v2/logistics/get_channel_list").get("logistics_channel_list") or []
        logistica = [{"logistic_id": c["logistics_channel_id"], "enabled": True} for c in canais if c.get("enabled")]
        if not logistica:
            raise ErroMarketplace("Nenhum canal de envio ativo na loja Shopee. Ative um em Configurações de envio.")

        imagens = [i for i in (self._enviar_imagem(f) for f in (anuncio.fotos or [])[:9]) if i]
        if not imagens:
            raise ErroMarketplace("Adicione pelo menos uma foto antes de publicar na Shopee.")

        atributos, faltando = self._atributos(int(category_id), anuncio)
        descricao = descricao_texto_puro(anuncio.descricao)
        if len(descricao) < 25:
            raise ErroMarketplace("A descrição está curta demais para a Shopee. Escreva pelo menos algumas linhas.")

        dim = anuncio.dimensoes_cm or {}
        corpo = {
            "item_name": cortar_titulo(anuncio.titulo, 120),
            "description": descricao[:3000],
            "original_price": round(float(anuncio.preco), 2),
            "seller_stock": [{"stock": int(anuncio.estoque or 1)}],
            "weight": float(anuncio.peso_kg),
            "category_id": int(category_id),
            "image": {"image_id_list": imagens},
            "logistic_info": logistica,
            "brand": {"brand_id": int(cfg.get("brand_id") or 0), "original_brand_name": anuncio.marca or "NoBrand"},
            "condition": "USED" if anuncio.condicao == "used" else "NEW",
            "item_status": "NORMAL",
            "attribute_list": atributos,
        }
        if all(dim.get(k) for k in ("comprimento", "largura", "altura")):
            corpo["dimension"] = {"package_length": int(dim["comprimento"]), "package_width": int(dim["largura"]),
                                  "package_height": int(dim["altura"])}
        if anuncio.sku:
            corpo["item_sku"] = anuncio.sku

        try:
            resp = self._loja("POST", "/api/v2/product/add_item", corpo=corpo)
        except ErroMarketplace as e:
            if faltando:
                e.mensagem += f" — atributos obrigatórios não preenchidos: {', '.join(faltando)}"
            raise
        item_id = resp.get("item_id")
        return ResultadoPublicacao(
            sucesso=True, id_externo=str(item_id),
            link=f"https://shopee.com.br/product/{self.cred['shop_id']}/{item_id}",
            mensagem=f"Publicado na Shopee (item {item_id}).",
            detalhes={"category_id": category_id, "avisos": resp.get("warning")},
        )

    def _atributos(self, category_id: int, anuncio) -> tuple[list[dict], list[str]]:
        try:
            lista = self._loja("GET", "/api/v2/product/get_attributes",
                               {"category_id": category_id, "language": "pt-br"}).get("attribute_list") or []
        except ErroMarketplace:
            return [], []
        informados = {str(k).strip().lower(): v for k, v in (anuncio.atributos or {}).items() if v}
        saida, faltando = [], []
        for a in lista:
            nomes = {(a.get("original_attribute_name") or "").lower(), (a.get("display_attribute_name") or "").lower()}
            valor = next((informados[n] for n in nomes if n in informados), None)
            if not valor:
                if a.get("is_mandatory"):
                    faltando.append(a.get("display_attribute_name") or a.get("original_attribute_name"))
                continue
            opcao = next((v for v in a.get("attribute_value_list") or []
                          if str(valor).lower() in {(v.get("original_value_name") or "").lower(),
                                                    (v.get("display_value_name") or "").lower()}), None)
            valor_attr = ({"value_id": opcao["value_id"]} if opcao
                          else {"value_id": 0, "original_value_name": str(valor)})
            saida.append({"attribute_id": a["attribute_id"], "attribute_value_list": [valor_attr]})
        return saida, faltando


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
