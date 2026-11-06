"""Amazon (Selling Partner API — região NA, que inclui o Brasil).

Autenticação: Login with Amazon (LWA). O aplicativo do Replique tem
client_id/secret (.env) e cada empresa cliente fornece o refresh_token da
própria conta de vendedor (autorização do app no Seller Central) + o
Seller ID (Merchant Token). Desde 2023 a SP-API não exige mais assinatura
AWS SigV4 — só o header x-amz-access-token.

Pesquisa: Catalog Items API 2022-04-01 (searchCatalogItems) com
`salesRanks` — o ranking de vendas da Amazon (quanto menor, mais vende).
Preço: Product Pricing API (competitivePrice), quando disponível.

Publicação (Listings Items API 2021-08-01, putListingsItem):
- Anúncio copiado da Amazon (tem ASIN): cria uma OFERTA no mesmo ASIN
  (requirements=LISTING_OFFER_ONLY). É assim que a Amazon funciona — ela
  não permite criar uma página duplicada para o mesmo produto.
- Produto novo: cria a listagem completa (requirements=LISTING) com o
  productType da categoria.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from backend import config
from backend.marketplaces.base import (
    AnuncioCopiado, ErroMarketplace, Marketplace, ResultadoPesquisa, ResultadoPublicacao,
    popularidade_por_sales_rank,
)
from backend.services.conteudo import cortar_titulo, descricao_texto_puro

LWA_URL = "https://api.amazon.com/auth/o2/token"


class Amazon(Marketplace):
    plataforma = "amazon"

    @property
    def mkt(self) -> str:
        return self.cred.get("marketplace_id") or config.AMAZON_MARKETPLACE_ID

    def _token(self) -> str:
        if not self.cred.get("refresh_token"):
            raise ErroMarketplace("Conta da Amazon não conectada. Informe o refresh token em Contas.")
        if not (config.AMAZON_LWA_CLIENT_ID and config.AMAZON_LWA_CLIENT_SECRET):
            raise ErroMarketplace("AMAZON_LWA_CLIENT_ID/SECRET não configurados no .env do Monvatti Radar.")
        if self.cred.get("access_token") and time.time() < self.cred.get("expira_em", 0) - 60:
            return self.cred["access_token"]
        r = self.http.post(LWA_URL, data={
            "grant_type": "refresh_token", "refresh_token": self.cred["refresh_token"],
            "client_id": config.AMAZON_LWA_CLIENT_ID, "client_secret": config.AMAZON_LWA_CLIENT_SECRET,
        })
        if r.status_code >= 400:
            raise ErroMarketplace("A Amazon recusou o refresh token. Gere um novo no Seller Central e atualize em Contas.")
        dados = r.json()
        self.cred["access_token"] = dados["access_token"]
        self.cred["expira_em"] = time.time() + dados.get("expires_in", 3600)
        self.salvar_credenciais()
        return self.cred["access_token"]

    def _req(self, metodo: str, caminho: str, params: dict | None = None, corpo: dict | None = None):
        r = self.http.request(metodo, f"{config.AMAZON_ENDPOINT}{caminho}", params=params, json=corpo,
                              headers={"x-amz-access-token": self._token(), "Accept": "application/json"})
        if r.status_code == 429:
            time.sleep(1.5)
            r = self.http.request(metodo, f"{config.AMAZON_ENDPOINT}{caminho}", params=params, json=corpo,
                                  headers={"x-amz-access-token": self._token(), "Accept": "application/json"})
        return r

    def _json_ou_erro(self, r, contexto: str) -> dict:
        if r.status_code >= 400:
            try:
                erros = r.json().get("errors") or []
                msg = "; ".join(e.get("message", "") for e in erros) or r.text[:300]
            except ValueError:
                msg = r.text[:300]
            raise ErroMarketplace(f"Amazon — {contexto}: {msg}", {"status": r.status_code})
        return r.json()

    def pesquisar(self, termo: str, limite: int = 20) -> list[ResultadoPesquisa]:
        dados = self._json_ou_erro(self._req("GET", "/catalog/2022-04-01/items", {
            "keywords": termo, "marketplaceIds": self.mkt, "pageSize": min(limite, 20),
            "includedData": "summaries,images,salesRanks", "locale": "pt_BR",
        }), "pesquisar catálogo")
        saida = []
        for item in dados.get("items", []):
            asin = item["asin"]
            resumo = _do_marketplace(item.get("summaries"), self.mkt)
            rank = _melhor_rank(_do_marketplace(item.get("salesRanks"), self.mkt))
            imagens = (_do_marketplace(item.get("images"), self.mkt) or {}).get("images") or []
            saida.append(ResultadoPesquisa(
                plataforma=self.plataforma, id_externo=asin, tipo="ASIN",
                titulo=resumo.get("itemName", asin), imagem=imagens[0]["link"] if imagens else "",
                link=f"https://www.amazon.com.br/dp/{asin}", vendedor=resumo.get("brand", ""),
                sales_rank=rank[0] if rank else None,
                popularidade=popularidade_por_sales_rank(rank[0] if rank else None),
                origem_sinal=f"nº {rank[0]} em {rank[1]}" if rank else "Sem ranking de vendas",
            ))
        self._preencher_precos(saida)
        saida.sort(key=lambda r: r.popularidade, reverse=True)
        return saida

    def _preencher_precos(self, resultados: list[ResultadoPesquisa]):
        if not resultados:
            return
        r = self._req("GET", "/products/pricing/v0/competitivePrice", {
            "MarketplaceId": self.mkt, "ItemType": "Asin",
            "Asins": ",".join(x.id_externo for x in resultados[:20]),
        })
        if r.status_code >= 400:
            return
        por_asin = {x.id_externo: x for x in resultados}
        for p in r.json().get("payload", []):
            precos = (((p.get("Product") or {}).get("CompetitivePricing") or {}).get("CompetitivePrices") or [])
            if precos and p.get("ASIN") in por_asin:
                valor = ((precos[0].get("Price") or {}).get("LandedPrice") or {}).get("Amount")
                por_asin[p["ASIN"]].preco = valor

    def obter_anuncio(self, id_externo: str, tipo: str = "ASIN") -> AnuncioCopiado:
        item = self._json_ou_erro(self._req("GET", f"/catalog/2022-04-01/items/{id_externo}", {
            "marketplaceIds": self.mkt, "locale": "pt_BR",
            "includedData": "summaries,images,attributes,identifiers,productTypes",
        }), "ler produto")
        resumo = _do_marketplace(item.get("summaries"), self.mkt)
        attrs = item.get("attributes") or {}
        bullets = [b.get("value") for b in attrs.get("bullet_point", []) if b.get("value")]
        desc = next((d.get("value") for d in attrs.get("product_description", []) if d.get("value")), "")
        descricao = "\n".join(filter(None, [desc, "", *[f"• {b}" for b in bullets]])).strip()
        imagens = sorted((_do_marketplace(item.get("images"), self.mkt) or {}).get("images") or [],
                         key=lambda i: (i.get("variant") != "MAIN", -(i.get("width") or 0)))
        fotos, vistas = [], set()
        for img in imagens:
            if img.get("variant") not in vistas:
                vistas.add(img.get("variant"))
                fotos.append(img["link"])
        ids = _do_marketplace(item.get("identifiers"), self.mkt).get("identifiers") or []
        gtin = next((i["identifier"] for i in ids if i.get("identifierType") in ("EAN", "GTIN", "UPC")), "")
        tipo_produto = (_do_marketplace(item.get("productTypes"), self.mkt) or {}).get("productType", "")
        caracteristicas = {}
        for chave in ("color", "material", "size", "item_weight", "number_of_items", "model_name"):
            v = (attrs.get(chave) or [{}])[0].get("value")
            if v is not None:
                caracteristicas[chave.replace("_", " ").capitalize()] = str(v)
        return AnuncioCopiado(
            titulo=resumo.get("itemName", ""), descricao=descricao, fotos=fotos,
            marca=resumo.get("brand", ""), modelo=resumo.get("modelNumber", ""), gtin=gtin,
            atributos=caracteristicas, link=f"https://www.amazon.com.br/dp/{id_externo}",
            por_plataforma={"amazon": {"asin": id_externo, "product_type": tipo_produto}},
        )

    def publicar(self, anuncio) -> ResultadoPublicacao:
        seller_id = self.cred.get("seller_id")
        if not seller_id:
            raise ErroMarketplace("Informe o Seller ID (Merchant Token) da Amazon em Contas.")
        cfg = (anuncio.por_plataforma or {}).get("amazon", {})
        sku = anuncio.sku or f"RPQ-{anuncio.id}"
        mkt = self.mkt
        oferta = {
            "condition_type": [{"value": "used_good" if anuncio.condicao == "used" else "new_new", "marketplace_id": mkt}],
            "purchasable_offer": [{"currency": "BRL", "marketplace_id": mkt,
                                   "our_price": [{"schedule": [{"value_with_tax": round(float(anuncio.preco), 2)}]}]}],
            "fulfillment_availability": [{"fulfillment_channel_code": "DEFAULT", "quantity": int(anuncio.estoque or 1)}],
        }

        if cfg.get("asin") and cfg.get("modo", "oferta") == "oferta":
            corpo = {"productType": "PRODUCT", "requirements": "LISTING_OFFER_ONLY",
                     "attributes": {**oferta, "merchant_suggested_asin": [{"value": cfg["asin"], "marketplace_id": mkt}]}}
        else:
            product_type = cfg.get("product_type") or self._sugerir_product_type(anuncio.titulo)
            corpo = {"productType": product_type, "requirements": "LISTING",
                     "attributes": {**oferta, **self._atributos_listagem(anuncio, mkt, cfg.get("atributos") or {})}}

        r = self._req("PUT", f"/listings/2021-08-01/items/{seller_id}/{sku}",
                      {"marketplaceIds": mkt, "issueLocale": "pt_BR"}, corpo)
        dados = self._json_ou_erro(r, "enviar anúncio")
        problemas = [i for i in dados.get("issues", []) if i.get("severity") == "ERROR"]
        if dados.get("status") != "ACCEPTED" or problemas:
            msgs = "; ".join(i.get("message", "") for i in problemas) or dados.get("status")
            raise ErroMarketplace(f"A Amazon não aceitou o anúncio: {msgs}", {"resposta": dados})
        asin = cfg.get("asin", "")
        return ResultadoPublicacao(
            sucesso=True, id_externo=sku,
            link=f"https://www.amazon.com.br/dp/{asin}" if asin else "https://sellercentral.amazon.com.br/inventory",
            mensagem=(f"Enviado à Amazon (SKU {sku}). A Amazon processa em alguns minutos — "
                      "acompanhe o status no Seller Central."),
            detalhes={"submissionId": dados.get("submissionId"), "avisos": dados.get("issues", [])},
        )

    def eventos_financeiros(self, de: datetime, ate: datetime) -> dict[str, list[dict]]:
        """Finances API: vendas enviadas (ShipmentEventList), reembolsos e cobranças
        de Sponsored Products lançados entre `de` e `ate`. A API aceita só até 2 minutos
        antes de agora e 0,5 requisição por segundo, por isso a pausa entre páginas."""
        limite = datetime.now(timezone.utc) - timedelta(minutes=3)
        params = {"PostedAfter": de.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                  "PostedBefore": min(ate.astimezone(timezone.utc), limite).isoformat().replace("+00:00", "Z"),
                  "MaxResultsPerPage": 100}
        saida: dict[str, list[dict]] = {"vendas": [], "reembolsos": [], "ads": []}
        while True:
            dados = self._json_ou_erro(self._req("GET", "/finances/v0/financialEvents", params), "ler o financeiro")
            corpo = dados.get("payload") or {}
            eventos = corpo.get("FinancialEvents") or {}
            saida["vendas"] += eventos.get("ShipmentEventList") or []
            saida["reembolsos"] += eventos.get("RefundEventList") or []
            saida["ads"] += eventos.get("ProductAdsPaymentEventList") or []
            if not corpo.get("NextToken"):
                return saida
            params = {"NextToken": corpo["NextToken"]}
            time.sleep(2.1)

    def _sugerir_product_type(self, titulo: str) -> str:
        r = self._req("GET", "/definitions/2020-09-01/productTypes",
                      {"keywords": titulo[:100], "marketplaceIds": self.mkt, "locale": "pt_BR"})
        tipos = self._json_ou_erro(r, "descobrir tipo de produto").get("productTypes") or []
        if not tipos:
            raise ErroMarketplace("A Amazon não sugeriu um tipo de produto. Informe o productType na aba Amazon do editor.")
        return tipos[0]["name"]

    @staticmethod
    def _atributos_listagem(anuncio, mkt: str, extras: dict) -> dict:
        def v(valor):
            return [{"value": valor, "marketplace_id": mkt}]

        descricao = descricao_texto_puro(anuncio.descricao)
        bullets = [ln.lstrip("•-* ").strip() for ln in descricao.splitlines() if ln.strip().startswith(("•", "-", "*"))]
        attrs = {
            "item_name": v(cortar_titulo(anuncio.titulo, 200)),
            "brand": v(anuncio.marca or "Genérico"),
            "product_description": v(descricao[:2000]),
        }
        if bullets:
            attrs["bullet_point"] = [{"value": b[:500], "marketplace_id": mkt} for b in bullets[:5]]
        if anuncio.modelo:
            attrs["model_number"] = v(anuncio.modelo)
        if anuncio.gtin:
            tipo = "upc" if len(anuncio.gtin) == 12 else "ean"
            attrs["externally_assigned_product_identifier"] = [{"type": tipo, "value": anuncio.gtin, "marketplace_id": mkt}]
        else:
            attrs["supplier_declared_has_product_identifier_exemption"] = v(True)
        fotos = [f for f in anuncio.fotos or [] if f.startswith("http")]
        if fotos:
            attrs["main_product_image_locator"] = [{"media_location": fotos[0], "marketplace_id": mkt}]
            for i, f in enumerate(fotos[1:9], start=1):
                attrs[f"other_product_image_locator_{i}"] = [{"media_location": f, "marketplace_id": mkt}]
        for chave, valor in extras.items():
            if valor not in (None, ""):
                attrs[str(chave).strip()] = v(valor)
        return attrs


def _do_marketplace(lista, mkt: str) -> dict:
    for x in lista or []:
        if x.get("marketplaceId") == mkt:
            return x
    return (lista or [{}])[0] if lista else {}


def _melhor_rank(bloco: dict) -> tuple[int, str] | None:
    """Prefere o ranking da categoria específica (classificationRanks),
    que é mais comparável; senão usa o do grupo (ex: 'Casa')."""
    candidatos = [(r["rank"], r.get("title", "")) for r in bloco.get("classificationRanks", []) if r.get("rank")]
    candidatos += [(r["rank"], r.get("title", "")) for r in bloco.get("displayGroupRanks", []) if r.get("rank")]
    return min(candidatos) if candidatos else None
