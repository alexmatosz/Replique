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
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
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


def url_autorizacao(state: str = "") -> str:
    """A Shopee volta para `redirect` acrescentando code= e shop_id=; o state
    assinado vai dentro do próprio redirect para identificar o cliente na volta."""
    if not (config.SHOPEE_PARTNER_ID and config.SHOPEE_PARTNER_KEY):
        raise ErroMarketplace("SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY não configurados no .env do Replique.")
    caminho, ts = "/api/v2/shop/auth_partner", int(time.time())
    redirect = config.SHOPEE_REDIRECT_URI
    if state:
        redirect += ("&" if "?" in redirect else "?") + urlencode({"state": state})
    params = {"partner_id": config.SHOPEE_PARTNER_ID, "timestamp": ts,
              "sign": _assinar(caminho, ts), "redirect": redirect}
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


def nome_da_loja(http, access_token: str, shop_id: str) -> str:
    caminho, ts = "/api/v2/shop/get_shop_info", int(time.time())
    try:
        r = http.get(f"{config.SHOPEE_HOST}{caminho}", params={
            "partner_id": config.SHOPEE_PARTNER_ID, "timestamp": ts, "access_token": access_token,
            "shop_id": shop_id, "sign": _assinar(caminho, ts, access_token, str(shop_id))})
        dados = r.json() if r.content else {}
    except Exception:
        return ""
    if r.status_code >= 400 or dados.get("error"):
        return ""
    return dados.get("shop_name") or (dados.get("response") or {}).get("shop_name") or ""


class Shopee(Marketplace):
    plataforma = "shopee"

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

    def _token(self) -> str:
        if not self.tem_loja():
            raise ErroMarketplace("Loja da Shopee não autorizada. Conecte em Contas para publicar.")
        vencido = lambda: time.time() > self.cred.get("obtido_em", 0) + self.cred.get("expire_in", 14400) - 300  # noqa: E731
        if vencido():
            with self.renovando():
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


    def situacao_itens(self, ids: list[str]) -> dict[str, dict]:
        """Mesmo formato do Mercado Livre: {id: {status, sub_status, acessivel, preco, estoque, vendidos, link}}.
        Anúncio que não aparece na loja conectada fica acessivel=False (apagado ou publicado por outra loja)."""
        saida: dict[str, dict] = {}
        validos = [i for i in dict.fromkeys(ids) if str(i).isdigit()]
        for i in range(0, len(validos), 50):
            lote = ",".join(validos[i:i + 50])
            base = self._loja("GET", "/api/v2/product/get_item_base_info", {"item_id_list": lote}).get("item_list") or []
            try:
                extra = self._loja("GET", "/api/v2/product/get_item_extra_info", {"item_id_list": lote}).get("item_list") or []
            except ErroMarketplace:
                extra = []
            vendas = {str(x.get("item_id")): x.get("sale") for x in extra}
            for it in base:
                iid = str(it.get("item_id"))
                status, sub = _STATUS.get(it.get("item_status"), (None, []))
                precos = it.get("price_info") or []
                estoque = ((it.get("stock_info_v2") or {}).get("summary_info") or {}).get("total_available_stock")
                saida[iid] = {"status": status, "sub_status": sub, "acessivel": True,
                              "preco": _num(precos[0].get("current_price")) if precos else None,
                              "estoque": estoque, "vendidos": vendas.get(iid),
                              "variacoes": bool(it.get("has_model")),
                              "link": f"https://shopee.com.br/product/{self.cred.get('shop_id')}/{iid}"}
        for iid in ids:
            saida.setdefault(str(iid), {"status": None, "sub_status": [], "acessivel": False})
        return saida

    def alterar_status(self, item_id: str, status: str) -> dict:
        """paused (tira da vitrine: unlist) ou active (volta à vitrine). A Shopee não tem "finalizar"."""
        if status not in ("paused", "active"):
            raise ErroMarketplace("A Shopee só permite pausar, reativar ou excluir o anúncio.")
        r = self._loja("POST", "/api/v2/product/unlist_item",
                       corpo={"item_list": [{"item_id": int(item_id), "unlist": status == "paused"}]})
        falhas = r.get("failure_list") or []
        if falhas:
            raise ErroMarketplace(f"A Shopee não mudou a situação: {falhas[0].get('failed_reason') or 'motivo não informado'}")
        return r

    def excluir(self, item_id: str) -> None:
        self._loja("POST", "/api/v2/product/delete_item", corpo={"item_id": int(item_id)})

    def atualizar_preco(self, item_id: str, preco: float) -> dict:
        return self._loja("POST", "/api/v2/product/update_price",
                          corpo={"item_id": int(item_id), "price_list": [{"original_price": round(float(preco), 2)}]})

    def atualizar_estoque(self, item_id: str, estoque: int) -> dict:
        return self._loja("POST", "/api/v2/product/update_stock",
                          corpo={"item_id": int(item_id), "stock_list": [{"seller_stock": [{"stock": int(estoque)}]}]})

    def desempenho_loja(self) -> dict:
        """Account Health: nota geral e cada métrica com a meta da Shopee."""
        return self._loja("GET", "/api/v2/account_health/get_shop_performance")

    def penalidades(self) -> dict:
        """Pontos de penalidade do trimestre e punições em andamento."""
        return self._loja("GET", "/api/v2/account_health/shop_penalty")

    def contagem_anuncios(self) -> dict:
        saida = {}
        for status, chave in (("NORMAL", "active"), ("UNLIST", "paused"), ("REVIEWING", "under_review"),
                              ("BANNED", "banned")):
            r = self._loja("GET", "/api/v2/product/get_item_list",
                           {"offset": 0, "page_size": 1, "item_status": status})
            saida[chave] = int(r.get("total_count") or 0)
        return saida

    def anuncios_bloqueados(self, limite: int = 20) -> list[dict]:
        r = self._loja("GET", "/api/v2/product/get_item_list",
                       {"offset": 0, "page_size": min(limite, 100), "item_status": "BANNED"})
        ids = [str(i["item_id"]) for i in r.get("item") or [] if i.get("item_id")]
        if not ids:
            return []
        base = self._loja("GET", "/api/v2/product/get_item_base_info", {"item_id_list": ",".join(ids)}).get("item_list") or []
        nomes = {str(i.get("item_id")): i.get("item_name", "") for i in base}
        return [{"id": i, "titulo": nomes.get(i, ""), "link": f"https://shopee.com.br/product/{self.cred.get('shop_id')}/{i}"}
                for i in ids]

    def pedidos(self, de: datetime, ate: datetime) -> list[dict]:
        """Pedidos criados entre `de` e `ate`, já com o detalhe (itens, endereço) e o
        extrato do pagamento (get_escrow_detail: comissão, taxas e frete reais).
        A lista da Shopee aceita no máximo 15 dias por consulta."""
        numeros: list[str] = []
        ini = de
        while ini < ate:
            fim = min(ini + timedelta(days=15) - timedelta(seconds=1), ate)
            cursor = ""
            while True:
                r = self._loja("GET", "/api/v2/order/get_order_list", {
                    "time_range_field": "create_time", "time_from": int(ini.timestamp()), "time_to": int(fim.timestamp()),
                    "page_size": 100, "cursor": cursor})
                numeros += [o["order_sn"] for o in r.get("order_list") or [] if o.get("order_sn")]
                if not r.get("more"):
                    break
                cursor = r.get("next_cursor") or ""
            ini = fim + timedelta(seconds=1)
        detalhes: list[dict] = []
        for i in range(0, len(numeros), 50):
            r = self._loja("GET", "/api/v2/order/get_order_detail", {
                "order_sn_list": ",".join(numeros[i:i + 50]),
                "response_optional_fields": "item_list,recipient_address,total_amount,pay_time,buyer_user_id"})
            detalhes += r.get("order_list") or []

        def com_extrato(p: dict) -> dict:
            if p.get("order_status") in ("UNPAID", "CANCELLED", "IN_CANCEL"):
                return {**p, "escrow": {}}
            try:
                return {**p, "escrow": self._loja("GET", "/api/v2/payment/get_escrow_detail", {"order_sn": p["order_sn"]})}
            except ErroMarketplace as e:
                return {**p, "escrow": {}, "escrow_erro": e.mensagem}

        with ThreadPoolExecutor(max_workers=4) as pool:
            return list(pool.map(com_extrato, detalhes))

    def gastos_ads(self, de: datetime, ate: datetime) -> list[dict]:
        """Gasto diário de Shopee Ads da loja inteira. A Shopee não separa o gasto
        diário por produto nesta consulta, então ele entra com item_id vazio."""
        r = self._loja("GET", "/api/v2/ads/get_all_cpc_ads_daily_performance",
                       {"start_date": de.strftime("%d-%m-%Y"), "end_date": ate.strftime("%d-%m-%Y")})
        dias = r if isinstance(r, list) else r.get("result_list") or r.get("data") or []
        saida = []
        for d in dias:
            try:
                data = datetime.strptime(d.get("date", ""), "%d-%m-%Y").strftime("%Y-%m-%d")
            except ValueError:
                continue
            custo = _num(d.get("expense")) or 0.0
            if custo:
                saida.append({"data": data, "item_id": "", "custo": custo,
                              "receita": _num(d.get("broad_gmv")) or 0.0,
                              "unidades": int(_num(d.get("broad_item_sold")) or 0)})
        return saida


_STATUS = {
    "NORMAL": ("active", []),
    "UNLIST": ("paused", []),
    "REVIEWING": ("under_review", []),
    "BANNED": ("inactive", ["bloqueado pela Shopee"]),
    "SELLER_DELETE": ("deleted", []),
    "SHOPEE_DELETE": ("deleted", ["removido pela Shopee"]),
}


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
