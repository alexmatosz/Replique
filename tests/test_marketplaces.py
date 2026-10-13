"""Adaptadores contra respostas simuladas no formato documentado de cada API.

Não substitui o teste com contas reais, mas garante que as chamadas são
montadas corretamente e as respostas são interpretadas como a documentação diz.
"""

import hashlib
import json
import time
from types import SimpleNamespace

import httpx
import pytest

from app import config
from app.marketplaces.amazon import Amazon
from app.marketplaces.base import ErroMarketplace
from app.marketplaces.mercadolivre import MercadoLivre
from app.marketplaces.shopee import Shopee
from app.services.conteudo import cortar_titulo, descricao_texto_puro, limpar_titulo


def _cliente(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def _anuncio(**kw):
    base = dict(id=7, titulo="Garrafa Térmica Inox 1 Litro", descricao="Uma garrafa ótima.\n• Inox\n• 1 litro",
                preco=89.9, estoque=5, condicao="new", marca="Stanley", modelo="Classic", gtin="", sku="",
                peso_kg=0.6, dimensoes_cm={}, fotos=["https://img.exemplo.com/1.jpg"], atributos={"Cor": "Verde"},
                por_plataforma={}, origem={})
    base.update(kw)
    return SimpleNamespace(**base)


def test_limpar_titulo():
    assert limpar_titulo("GARRAFA TERMICA NOVA frete grátis 1L inox INOX") == "Garrafa Termica 1L Inox"
    assert limpar_titulo("cabo usb-c para iphone") == "Cabo USB-C para Iphone"
    assert cortar_titulo("Cadeira de Escritório Ergonômica com Apoio de Braço", 30) == "Cadeira de Escritório"
    assert descricao_texto_puro("<p>Olá</p><ul><li>A</li></ul> veja https://x.com 🚀") == "Olá\n• A\n veja"


def _ml():
    return MercadoLivre({"access_token": "TOK", "refresh_token": "R", "obtido_em": time.time(), "expires_in": 21600})


def test_ml_pesquisa_usa_mais_vendidos():
    """Reproduz o comportamento real da API (2026-09-24): /items e /user-products
    de outros vendedores dão 403; produtos de catálogo e /products/{id}/items funcionam."""
    consultadas = []

    def handler(req: httpx.Request):
        p = req.url.path
        if p.endswith("/domain_discovery/search"):
            return httpx.Response(200, json=[
                {"category_id": "MLB95233", "category_name": "Bases e Suportes", "domain_id": "D-SUPORTE"},
                {"category_id": "MLB1", "category_name": "Joysticks", "domain_id": "D-JOY"},
                {"category_id": "MLB2", "category_name": "Joysticks", "domain_id": "D-JOY"}])
        if p.startswith("/highlights/MLB/category/"):
            assert req.headers["Authorization"] == "Bearer TOK"
            cat = p.rsplit("/", 1)[-1]
            consultadas.append(cat)
            if cat == "MLB1":
                return httpx.Response(200, json={"content": [
                    {"id": "MLB111", "position": 1, "type": "ITEM"},
                    {"id": "MLB222", "position": 2, "type": "PRODUCT"},
                    {"id": "MLBU333", "position": 3, "type": "USER_PRODUCT"}]})
            return httpx.Response(200, json={"content": [{"id": "MLB222", "position": 1, "type": "PRODUCT"}]})
        if p == "/categories/MLB2":
            return httpx.Response(200, json={"name": "Joysticks"})
        if p == "/visits/items":
            return httpx.Response(200, json={"MLB111": 20659})
        if p == "/items/MLB111/description":
            return httpx.Response(200, json={"plain_text": "---\nControle sem fio com bateria recarregável"})
        if p in ("/items/MLB111", "/user-products/MLBU333"):
            return httpx.Response(403, json={"error": "access_denied"})
        if p == "/products/MLB222":
            return httpx.Response(200, json={"name": "Controle Xbox Series", "permalink": "",
                                             "pictures": [{"url": "https://f/2.jpg"}], "buy_box_winner": None})
        if p == "/products/MLB222/items":
            return httpx.Response(200, json={"paging": {"total": 3}, "results": [
                {"item_id": "MLB9", "price": 399.0}, {"item_id": "MLB8", "price": 349.9}]})
        return httpx.Response(404)

    ml = _ml()
    ml.http = _cliente(handler)
    res = ml.pesquisar("controle xbox")
    assert consultadas == ["MLB1", "MLB2"]
    assert ml.meta["categorias_usadas"][0]["category_id"] == "MLB1"
    assert len(ml.meta["categorias_sugeridas"]) == 3
    por_id = {r.id_externo: r for r in res}
    assert [r.id_externo for r in res] == ["MLB111", "MLB222", "MLBU333"]
    prod = por_id["MLB222"]
    assert prod.titulo == "Controle Xbox Series" and prod.preco == 349.9 and prod.extra["preco_max"] == 399.0
    assert prod.link == "https://www.mercadolivre.com.br/p/MLB222" and prod.extra["vendedores"] == 3
    item = por_id["MLB111"]
    assert item.extra["restrito"] and item.extra["visitas"] == 20659
    assert item.extra["trecho"] == "Controle sem fio com bateria recarregável"
    assert item.link == "https://produto.mercadolivre.com.br/MLB-111" and res[0].popularidade == 100
    assert por_id["MLBU333"].link.endswith("/up/MLBU333") and por_id["MLBU333"].extra["restrito"]

    consultadas.clear()
    ml.pesquisar("controle xbox", categoria_id="MLB2")
    assert consultadas == ["MLB2"]


def _handler_marca(registro, busca_status=200):
    """ML de mentira para "parafusadeira bosch gsr 120": o ranking da categoria
    tem Bosch e outras marcas; a busca e o catálogo trazem Bosch e intrusos."""
    def handler(req: httpx.Request):
        p = req.url.path
        registro.append(p)
        if p.endswith("/domain_discovery/search"):
            return httpx.Response(200, json=[{
                "category_id": "MLB189008", "category_name": "Parafusadeiras", "domain_id": "D-PARAF",
                "domain_name": "Parafusadeiras elétricas", "attributes": [
                    {"id": "BRAND", "name": "Marca", "value_id": "4946", "value_name": "Bosch"}]}])
        if p == "/highlights/MLB/category/MLB189008":
            return httpx.Response(200, json={"content": [
                {"id": "MLB900", "position": 1, "type": "PRODUCT"},
                {"id": "MLB901", "position": 2, "type": "PRODUCT"},
                {"id": "MLB555", "position": 3, "type": "ITEM"}]})
        if p == "/products/MLB900":
            return httpx.Response(200, json={"name": "Parafusadeira Makita DF333", "pictures": [],
                                             "attributes": [{"id": "BRAND", "value_name": "Makita"}]})
        if p == "/products/MLB901":
            return httpx.Response(200, json={"name": "Parafusadeira Bosch GSR 120-LI", "pictures": [],
                                             "attributes": [{"id": "BRAND", "value_name": "Bosch"}]})
        if p.startswith("/products/") and p.endswith("/items"):
            return httpx.Response(200, json={"paging": {"total": 2}, "results": [{"item_id": "X", "price": 500.0}]})
        if p == "/visits/items":
            return httpx.Response(200, json={})
        if p == "/items/MLB555/description":
            return httpx.Response(200, json={"plain_text": "Parafusadeira original BOSCH com maleta e 2 baterias"})
        if p == "/sites/MLB/search":
            assert req.url.params["q"] == "parafusadeira bosch gsr 120"
            if busca_status != 200:
                return httpx.Response(busca_status, json={"message": "forbidden"})
            return httpx.Response(200, json={"results": [
                {"id": "MLB700", "title": "Parafusadeira Bosch Gsr 1000 Smart", "price": 350.0,
                 "thumbnail": "http://http2.mlstatic.com/D_1-I.jpg", "permalink": "https://p/700",
                 "attributes": [{"id": "BRAND", "value_name": "Bosch"}]},
                {"id": "MLB701", "title": "Parafusadeira Wap 12v", "price": 150.0,
                 "attributes": [{"id": "BRAND", "value_name": "Wap"}]},
                {"id": "MLB702", "title": "Parafusadeira Bosch GSR 120-LI 12V", "price": 620.0,
                 "catalog_product_id": "MLB901", "attributes": [{"id": "BRAND", "value_name": "Bosch"}]}]})
        if p == "/products/search":
            assert req.url.params["domain_id"] == "D-PARAF"
            return httpx.Response(200, json={"results": [
                {"id": "MLB950", "name": "Parafusadeira Bosch GSR 120 Professional", "status": "active",
                 "attributes": [{"id": "BRAND", "value_name": "Bosch"}]},
                {"id": "MLB951", "name": "Bateria Dewalt 12v", "status": "active",
                 "attributes": [{"id": "BRAND", "value_name": "Dewalt"}]}]})
        return httpx.Response(404)
    return handler


def test_ml_busca_exata_por_marca_e_modelo():
    registro = []
    ml = _ml()
    ml.http = _cliente(_handler_marca(registro))
    res = ml.pesquisar("parafusadeira bosch gsr 120")
    assert ml.meta["busca"]["modo"] == "exata" and ml.meta["busca"]["marca"] == "Bosch"
    ids = [r.id_externo for r in res]
    assert "MLB900" not in ids and "MLB701" not in ids and "MLB951" not in ids
    assert ids.count("MLB901") == 1
    assert ids == ["MLB901", "MLB950", "MLB700", "MLB555"]
    item_busca = next(r for r in res if r.id_externo == "MLB700")
    assert item_busca.imagem == "https://http2.mlstatic.com/D_1-O.jpg" and not item_busca.extra.get("restrito")
    assert "na busca do Mercado Livre" in item_busca.origem_sinal


def test_ml_busca_exata_sem_endpoint_de_busca_usa_ranking_e_catalogo():
    ml = _ml()
    ml.http = _cliente(_handler_marca([], busca_status=403))
    ids = [r.id_externo for r in ml.pesquisar("parafusadeira bosch gsr 120")]
    assert ids[:2] == ["MLB901", "MLB950"] and "MLB900" not in ids
    assert ml.meta["busca"]["fontes"]["busca"] == -1


def test_ml_sem_marca_ou_todas_marcas_traz_mais_vendidos_da_categoria():
    registro = []
    ml = _ml()
    ml.http = _cliente(_handler_marca(registro))
    ids = [r.id_externo for r in ml.pesquisar("parafusadeira bosch gsr 120", todas_marcas=True)]
    assert ml.meta["busca"]["modo"] == "categoria"
    assert ids == ["MLB900", "MLB901", "MLB555"] and "/sites/MLB/search" not in registro
    assert MercadoLivre.marca_do_termo("parafusadeira", [{"atributos": {"BRAND": "Bosch"}}]) == ""
    assert MercadoLivre.marca_do_termo("Ferramentas VONDER", [{"atributos": {"BRAND": "Vonder"}}]) == "Vonder"


def test_ml_copia_restrita_e_catalogo():
    def handler(req):
        p = req.url.path
        if p == "/items/MLB111":
            return httpx.Response(403, json={})
        if p == "/items/MLB111/description":
            return httpx.Response(200, json={"plain_text": "Descrição do concorrente"})
        if p == "/products/MLB222":
            return httpx.Response(200, json={"name": "Garrafa", "pictures": [{"url": "https://f/g.jpg"}],
                                             "attributes": [{"id": "BRAND", "name": "Marca", "value_name": "Stanley"}]})
        if p == "/products/MLB222/items":
            return httpx.Response(200, json={"results": [{"item_id": "MLB7", "price": 99.0, "category_id": "MLB33388"}]})
        if p == "/items/MLB7/description":
            return httpx.Response(200, json={"plain_text": "Descrição completa do vendedor líder"})
        return httpx.Response(404)

    ml = _ml()
    ml.http = _cliente(handler)
    c = ml.obter_anuncio("MLB111", "ITEM")
    assert c.titulo == "" and c.descricao == "Descrição do concorrente" and c.fotos == []
    assert "não libera" in c.por_plataforma["mercadolivre"]["aviso_copia"]
    c = ml.obter_anuncio("MLB222", "PRODUCT")
    assert c.preco == 99.0 and c.marca == "Stanley" and c.descricao.startswith("Descrição completa")
    assert c.por_plataforma["mercadolivre"]["category_id"] == "MLB33388"


def test_ml_sem_login_explica():
    with pytest.raises(ErroMarketplace, match="Conecte a conta"):
        MercadoLivre({}).pesquisar("fone")


def test_ml_copia_item_com_nomes_legiveis():
    def handler(req):
        if req.url.path == "/items/MLB111":
            return httpx.Response(200, json={
                "title": "Garrafa", "price": 50, "condition": "new", "category_id": "MLB1", "permalink": "p",
                "pictures": [{"secure_url": "https://f/a.jpg"}],
                "attributes": [{"id": "BRAND", "name": "Marca", "value_name": "Stanley"},
                               {"id": "COLOR", "name": "Cor", "value_name": "Verde"}]})
        if req.url.path == "/items/MLB111/description":
            return httpx.Response(200, json={"plain_text": "Descrição"})
        return httpx.Response(404)

    ml = _ml()
    ml.http = _cliente(handler)
    c = ml.obter_anuncio("MLB111")
    assert c.marca == "Stanley" and c.atributos == {"Cor": "Verde"}
    assert c.por_plataforma["mercadolivre"]["category_id"] == "MLB1"


def test_ml_atributos_obrigatorios():
    attrs_cat = [
        {"id": "BRAND", "name": "Marca", "tags": {"required": True}},
        {"id": "COLOR", "name": "Cor", "tags": {"required": True}, "values": [{"id": "52055", "name": "Verde"}]},
        {"id": "CAPACITY", "name": "Capacidade", "tags": {"required": True}, "value_type": "number_unit", "default_unit": "L"},
        {"id": "EMPTY_GTIN_REASON", "name": "Motivo GTIN vazio", "tags": {}},
        {"id": "ITEM_ID", "name": "x", "tags": {"read_only": True, "required": True}},
    ]
    saida, faltando = MercadoLivre.montar_atributos(_anuncio(), attrs_cat)
    assert faltando == ["Capacidade"]
    assert {"id": "COLOR", "value_id": "52055", "value_name": "Verde"} in saida
    saida, faltando = MercadoLivre.montar_atributos(_anuncio(atributos={"Cor": "Verde", "capacity": "1"}), attrs_cat)
    assert faltando == [] and {"id": "CAPACITY", "value_name": "1 L"} in saida
    assert any(a["id"] == "EMPTY_GTIN_REASON" for a in saida)


def test_ml_atributos_caso_parafusadeira():
    """Caso real de 2026-09-24 (categoria Parafusadeiras, MLB189008): o catálogo
    chama de "Tipos de alimentação"/POWER_SUPPLY_TYPES o que a categoria chama de
    "Tipo de alimentação"/POWER_SUPPLY_TYPE; "Tipo de produto" não vem do catálogo."""
    attrs_cat = [
        {"id": "POWER_SUPPLY_TYPE", "name": "Tipo de alimentação", "tags": {"required": True}, "value_type": "string",
         "values": [{"id": "1", "name": "Bateria"}, {"id": "2", "name": "Corrente doméstica"}]},
        {"id": "PRODUCT_TYPE", "name": "Tipo de produto", "tags": {"required": True}, "value_type": "list",
         "values": [{"id": "10", "name": "Parafusadeira"}, {"id": "11", "name": "Chave de impacto"}]},
    ]
    a = _anuncio(titulo="Parafusadeira Furadeira The Black 12V", atributos={"Tipos de alimentação": "bateria"})
    saida, faltando = MercadoLivre.montar_atributos(a, attrs_cat)
    assert faltando == []
    assert {"id": "POWER_SUPPLY_TYPE", "value_id": "1", "value_name": "Bateria"} in saida
    assert {"id": "PRODUCT_TYPE", "value_id": "10", "value_name": "Parafusadeira"} in saida
    origem = {x["id"]: x["origem"] for x in MercadoLivre.analisar_atributos(a, attrs_cat)}
    assert origem == {"POWER_SUPPLY_TYPE": "informado", "PRODUCT_TYPE": "deduzido"}

    _, faltando = MercadoLivre.montar_atributos(_anuncio(titulo="Ferramenta 12V", atributos={}), attrs_cat)
    assert faltando == ["Tipo de alimentação (opções: Bateria, Corrente doméstica)",
                        "Tipo de produto (opções: Parafusadeira, Chave de impacto)"]
    _, faltando = MercadoLivre.montar_atributos(
        _anuncio(titulo="Kit Parafusadeira e Chave de Impacto", atributos={"Tipo de alimentação": "Bateria"}), attrs_cat)
    assert faltando == ["Tipo de produto (opções: Parafusadeira, Chave de impacto)"]


@pytest.fixture(autouse=True)
def _sem_espera(monkeypatch):
    import app.marketplaces.mercadolivre as mod
    monkeypatch.setattr(mod.time, "sleep", lambda _s: None)


def test_ml_publicar_monta_payload():
    enviados = {}

    def handler(req):
        p = req.url.path
        if p == "/categories/MLB1":
            return httpx.Response(200, json={"name": "Garrafas", "settings": {"max_title_length": 20},
                                             "attribute_types": "attributes"})
        if p == "/categories/MLB1/attributes":
            return httpx.Response(200, json=[{"id": "BRAND", "name": "Marca", "tags": {"required": True}}])
        if p == "/items" and req.method == "POST":
            enviados["item"] = json.loads(req.content)
            return httpx.Response(201, json={"id": "MLB555", "permalink": "https://ml/555", "status": "active"})
        if p == "/items/MLB555/description":
            enviados["desc"] = json.loads(req.content)
            return httpx.Response(201, json={})
        if p == "/items/MLB555":
            return httpx.Response(200, json={"id": "MLB555", "status": "active"})
        return httpx.Response(404)

    ml = _ml()
    ml.http = _cliente(handler)
    r = ml.publicar(_anuncio(por_plataforma={"mercadolivre": {"category_id": "MLB1"}}))
    assert r.sucesso and r.id_externo == "MLB555"
    item = enviados["item"]
    assert item["title"] == "Garrafa Térmica Inox" and len(item["title"]) <= 20
    assert item["pictures"] == [{"source": "https://img.exemplo.com/1.jpg"}]
    assert item["listing_type_id"] == "gold_special" and item["price"] == 89.9
    assert "• Inox" in enviados["desc"]["plain_text"]


def test_ml_publicacao_pausada_pela_moderacao():
    """Caso real de 2026-09-24: item criado e pausado segundos depois pela moderação."""
    def handler(req):
        p = req.url.path
        if p == "/categories/MLB1":
            return httpx.Response(200, json={"name": "Joysticks", "attribute_types": "variations"})
        if p == "/categories/MLB1/attributes":
            return httpx.Response(200, json=[])
        if p == "/items" and req.method == "POST":
            assert "family_name" in json.loads(req.content)
            return httpx.Response(201, json={"id": "MLB9", "permalink": "https://ml/9", "status": "active",
                                             "seller_id": 413})
        if p == "/items/MLB9/description":
            return httpx.Response(201, json={})
        if p == "/items/MLB9":
            return httpx.Response(200, json={"status": "under_review"})
        if p == "/moderations/infractions/413":
            assert req.url.params["related_item_id"] == "MLB9"
            return httpx.Response(200, json={"infractions": [
                {"reason": "O título e/ou as fotos não correspondem ao produto."}]})
        return httpx.Response(404)

    ml = _ml()
    ml.http = _cliente(handler)
    r = ml.publicar(_anuncio(por_plataforma={"mercadolivre": {"category_id": "MLB1"}}))
    assert r.detalhes["status"] == "under_review"
    assert "não correspondem ao produto" in r.mensagem and "under_review" in r.mensagem


def _handler_catalogo(registro):
    """ML simulado para os testes de catálogo (formatos vistos na API real em 2026-09-24)."""
    def handler(req):
        p = req.url.path
        if p == "/categories/MLB189008":
            return httpx.Response(200, json={"name": "Parafusadeiras", "attribute_types": "variations",
                                             "settings": {"max_title_length": 60,
                                                          "catalog_domain": "MLB-ELECTRIC_SCREWDRIVERS"}})
        if p == "/categories/MLB189008/attributes":
            return httpx.Response(200, json=[
                {"id": "BRAND", "name": "Marca", "tags": {"required": True}},
                {"id": "VOLTAGE", "name": "Voltagem", "tags": {"required": True}},
                {"id": "GTIN", "name": "Código universal de produto", "tags": {}},
                {"id": "EMPTY_GTIN_REASON", "name": "Motivo GTIN vazio", "tags": {}}])
        if p == "/products/MLB24076624":
            return httpx.Response(200, json={"id": "MLB24076624", "name": "Parafusadeira The Black Tools TB12A",
                                             "status": "active", "pictures": [{"url": "https://f/p.jpg"}],
                                             "attributes": [{"id": "BRAND", "name": "Marca", "value_name": "The Black Tools"},
                                                            {"id": "VOLTAGE", "name": "Voltagem", "value_name": "12V"},
                                                            {"id": "GTIN", "name": "GTIN", "value_name": "7898272199910"}]})
        if p == "/products/search":
            registro.setdefault("buscas", []).append(dict(req.url.params))
            if "product_identifier" in req.url.params:
                return httpx.Response(200, json={"results": [{"id": "MLB24076624", "name": "Parafusadeira TB12A",
                                                              "status": "active", "attributes": []}]})
            return httpx.Response(200, json={"results": [
                {"id": "MLB24076624", "name": "Parafusadeira TB12A", "status": "active", "attributes": []},
                {"id": "MLB74377001", "name": "Parafusadeira TB-12E", "status": "active",
                 "attributes": [{"id": "MODEL", "value_name": "TB-12E"}]}]})
        if p == "/items/validate":
            corpo = json.loads(req.content)
            registro["validate"] = corpo
            return httpx.Response(400, json={"cause": [
                {"type": "warning", "code": "shipping.lost_me1_by_user", "message": "User has not mode me1"},
                {"type": "error", "code": "item.attribute.missing_conditional_required",
                 "message": "The attributes [GTIN] are required for category [MLB189008]."}]})
        if p == "/items" and req.method == "POST":
            registro["item"] = json.loads(req.content)
            return httpx.Response(201, json={"id": "MLB100", "permalink": "https://ml/100", "status": "active"})
        if p == "/items/MLB100":
            return httpx.Response(200, json={"status": "active"})
        if p == "/items/MLB100/description":
            return httpx.Response(201, json={})
        if p == "/items/MLB100/catalog_listing_eligibility":
            return httpx.Response(200, json={"status": "READY_FOR_OPTIN"})
        if p == "/items/catalog_listings":
            registro["optin"] = json.loads(req.content)
            return httpx.Response(201, json={"id": "MLB200", "permalink": "https://ml/200", "status": "active"})
        return httpx.Response(404)
    return handler


def _anuncio_catalogo(modo=None, **kw):
    cfg = {"category_id": "MLB189008", "catalog_product_id": "MLB24076624"}
    if modo:
        cfg["modo_catalogo"] = modo
    return _anuncio(titulo="Parafusadeira TB12A", atributos={}, marca="", modelo="", por_plataforma={"mercadolivre": cfg}, **kw)


def test_ml_ficha_do_catalogo_preenche_obrigatorios():
    reg = {}
    ml = _ml()
    ml.http = _cliente(_handler_catalogo(reg))
    a = _anuncio_catalogo()
    ed = ml.atributos_para_editor(a)
    assert ed["faltando"] == 0
    assert {(x["id"], x["valor"], x["origem"]) for x in ed["obrigatorios"]} == {
        ("BRAND", "The Black Tools", "catalogo"), ("VOLTAGE", "12V", "catalogo")}
    payload, ctx = ml.montar_payload(a)
    ids = {x["id"] for x in payload["attributes"]}
    assert {"BRAND", "VOLTAGE", "GTIN"} <= ids and "EMPTY_GTIN_REASON" not in ids
    assert payload["catalog_product_id"] == "MLB24076624" and "catalog_listing" not in payload


def test_ml_publicar_ambos_faz_optin():
    reg = {}
    ml = _ml()
    ml.http = _cliente(_handler_catalogo(reg))
    r = ml.publicar(_anuncio_catalogo())
    assert r.id_externo == "MLB100" and r.detalhes["modo"] == "ambos"
    assert reg["item"]["catalog_product_id"] == "MLB24076624" and "catalog_listing" not in reg["item"]
    assert reg["optin"] == {"item_id": "MLB100", "catalog_product_id": "MLB24076624"}
    assert r.detalhes["catalogo"]["id"] == "MLB200" and "catálogo" in r.mensagem


def test_ml_publicar_so_catalogo_e_so_lista():
    reg = {}
    ml = _ml()
    ml.http = _cliente(_handler_catalogo(reg))
    ml.publicar(_anuncio_catalogo("catalogo"))
    assert reg["item"]["catalog_listing"] is True and "optin" not in reg
    reg.clear()
    ml.publicar(_anuncio_catalogo("lista"))
    assert "catalog_listing" not in reg["item"] and "optin" not in reg


def test_ml_validar_traduz_e_ignora_ruido():
    reg = {}
    ml = _ml()
    ml.http = _cliente(_handler_catalogo(reg))
    v = ml.validar(_anuncio_catalogo("lista"))
    assert v["erros"] == ["O Mercado Livre exige nesta categoria: Código universal de produto — "
                          "informe o código de barras no campo EAN/GTIN."]
    assert v["avisos"] == []
    assert reg["validate"]["category_id"] == "MLB189008"


def test_ml_buscar_catalogo_filtra_dominio_e_gtin():
    reg = {}
    ml = _ml()
    ml.http = _cliente(_handler_catalogo(reg))
    b = ml.buscar_catalogo(_anuncio_catalogo(gtin="7898272199910"))
    assert b["atual"]["id"] == "MLB24076624" and b["dominio"] == "MLB-ELECTRIC_SCREWDRIVERS"
    assert [c["id"] for c in b["candidatos"]] == ["MLB24076624", "MLB74377001"]
    assert b["candidatos"][0]["por_gtin"] is True
    assert reg["buscas"][0]["product_identifier"] == "7898272199910"
    assert reg["buscas"][1]["domain_id"] == "MLB-ELECTRIC_SCREWDRIVERS"


def test_ml_fotos_enviadas_uma_vez():
    envios = []

    def handler(req):
        if req.url.path == "/pictures/items/upload":
            envios.append(1)
            return httpx.Response(201, json={"id": f"PIC{len(envios)}"})
        return _handler_catalogo({})(req)

    ml = _ml()
    ml.http = _cliente(handler)
    a = _anuncio_catalogo("lista", fotos=["/uploads/1/x.jpg", "https://img.exemplo.com/2.jpg"])
    ml.baixar_imagem = lambda url: (b"img", "x.jpg")
    p1, _ = ml.montar_payload(a)
    p2, _ = ml.montar_payload(a)
    assert p1["pictures"] == p2["pictures"] == [{"id": "PIC1"}, {"source": "https://img.exemplo.com/2.jpg"}]
    assert len(envios) == 1 and a.por_plataforma["mercadolivre"]["fotos_ml"] == {"/uploads/1/x.jpg": "PIC1"}


def test_ml_erro_traduzido():
    def handler(req):
        if req.url.path.startswith("/categories/MLB1/attributes"):
            return httpx.Response(200, json=[])
        if req.url.path == "/categories/MLB1":
            return httpx.Response(200, json={"name": "G"})
        return httpx.Response(403, json={"message": "seller.unable_to_list", "cause": ["restrictions_coliving"]})

    ml = _ml()
    ml.http = _cliente(handler)
    with pytest.raises(ErroMarketplace, match="endereço de despacho"):
        ml.publicar(_anuncio(por_plataforma={"mercadolivre": {"category_id": "MLB1"}}))


def test_shopee_afiliados_assinatura_e_parse():
    def handler(req):
        auth = req.headers["Authorization"]
        assert auth.startswith("SHA256 Credential=APP1, Timestamp=")
        ts = auth.split("Timestamp=")[1].split(",")[0]
        esperado = hashlib.sha256(f"APP1{ts}{req.content.decode()}SEGREDO".encode()).hexdigest()
        assert auth.endswith(f"Signature={esperado}")
        corpo = json.loads(req.content)
        assert 'keyword: "garrafa \\"inox\\""' in corpo["query"] and "sortType: 2" in corpo["query"]
        return httpx.Response(200, json={"data": {"productOfferV2": {"nodes": [
            {"itemId": 1, "shopId": 9, "productName": "Pouco", "priceMin": "10.5", "sales": 10, "imageUrl": "i"},
            {"itemId": 2, "shopId": 9, "productName": "Muito", "priceMin": "12", "sales": 90000, "ratingStar": "4.8"}]}}})

    s = Shopee({"afiliado_app_id": "APP1", "afiliado_secret": "SEGREDO"})
    s.http = _cliente(handler)
    res = s.pesquisar('garrafa "inox"')
    assert [r.titulo for r in res] == ["Muito", "Pouco"]
    assert res[0].id_externo == "9.2" and res[0].preco == 12.0 and res[0].avaliacao == 4.8
    assert res[0].popularidade > res[1].popularidade


def test_shopee_erro_graphql():
    s = Shopee({"afiliado_app_id": "A", "afiliado_secret": "B"})
    s.http = _cliente(lambda req: httpx.Response(200, json={"errors": [{"message": "Invalid Signature"}]}))
    with pytest.raises(ErroMarketplace, match="Invalid Signature"):
        s.pesquisar("x")


def test_shopee_publicar(monkeypatch):
    monkeypatch.setattr(config, "SHOPEE_PARTNER_ID", "1001")
    monkeypatch.setattr(config, "SHOPEE_PARTNER_KEY", "chave")
    from app.services import fotos
    monkeypatch.setattr(fotos, "_endereco_publico", lambda host: True)
    corpo_item = {}

    def handler(req):
        p = req.url.path
        q = req.url.params
        if p == "/1.jpg":
            return httpx.Response(200, content=b"\xff\xd8jpeg", headers={"content-type": "image/jpeg"})
        assert q["partner_id"] == "1001" and len(q["sign"]) == 64
        if p.endswith("category_recommend"):
            return httpx.Response(200, json={"response": {"category_id": [100123]}})
        if p.endswith("get_channel_list"):
            return httpx.Response(200, json={"response": {"logistics_channel_list": [
                {"logistics_channel_id": 90001, "enabled": True}, {"logistics_channel_id": 90002, "enabled": False}]}})
        if p.endswith("upload_image"):
            assert "access_token" not in q
            return httpx.Response(200, json={"response": {"image_info": {"image_id": "img-1"}}})
        if p.endswith("get_attributes"):
            return httpx.Response(200, json={"response": {"attribute_list": [
                {"attribute_id": 5, "original_attribute_name": "Cor", "is_mandatory": True,
                 "attribute_value_list": [{"value_id": 77, "original_value_name": "Verde"}]}]}})
        if p.endswith("add_item"):
            assert q["shop_id"] == "555" and q["access_token"] == "AT"
            corpo_item.update(json.loads(req.content))
            return httpx.Response(200, json={"error": "", "response": {"item_id": 424242}})
        return httpx.Response(404)

    s = Shopee({"access_token": "AT", "refresh_token": "RT", "shop_id": "555", "obtido_em": time.time(), "expire_in": 14400})
    s.http = _cliente(handler)
    r = s.publicar(_anuncio())
    assert r.link == "https://shopee.com.br/product/555/424242"
    assert corpo_item["category_id"] == 100123 and corpo_item["image"] == {"image_id_list": ["img-1"]}
    assert corpo_item["logistic_info"] == [{"logistic_id": 90001, "enabled": True}]
    assert corpo_item["attribute_list"] == [{"attribute_id": 5, "attribute_value_list": [{"value_id": 77}]}]
    assert corpo_item["weight"] == 0.6 and corpo_item["condition"] == "NEW"


def test_shopee_exige_peso():
    s = Shopee({"access_token": "AT", "shop_id": "1", "obtido_em": time.time()})
    with pytest.raises(ErroMarketplace, match="peso"):
        s.publicar(_anuncio(peso_kg=None))


@pytest.fixture
def amazon_app(monkeypatch):
    monkeypatch.setattr(config, "AMAZON_LWA_CLIENT_ID", "cid")
    monkeypatch.setattr(config, "AMAZON_LWA_CLIENT_SECRET", "csecret")


def test_amazon_pesquisa_por_sales_rank(amazon_app):
    def handler(req):
        if req.url.host == "api.amazon.com":
            return httpx.Response(200, json={"access_token": "LWA", "expires_in": 3600})
        assert req.headers["x-amz-access-token"] == "LWA"
        if req.url.path == "/catalog/2022-04-01/items":
            assert "salesRanks" in req.url.params["includedData"]
            mk = "A2Q3Y263D00KWC"
            return httpx.Response(200, json={"items": [
                {"asin": "B0LENTO", "summaries": [{"marketplaceId": mk, "itemName": "Lento"}],
                 "salesRanks": [{"marketplaceId": mk, "displayGroupRanks": [{"rank": 50000, "title": "Casa"}]}]},
                {"asin": "B0TOP", "summaries": [{"marketplaceId": mk, "itemName": "Top", "brand": "X"}],
                 "images": [{"marketplaceId": mk, "images": [{"link": "https://m/1.jpg", "variant": "MAIN"}]}],
                 "salesRanks": [{"marketplaceId": mk, "classificationRanks": [{"rank": 3, "title": "Garrafas"}],
                                 "displayGroupRanks": [{"rank": 900, "title": "Casa"}]}]}]})
        if req.url.path.startswith("/products/pricing"):
            return httpx.Response(200, json={"payload": [{"ASIN": "B0TOP", "Product": {"CompetitivePricing": {
                "CompetitivePrices": [{"Price": {"LandedPrice": {"Amount": 149.9}}}]}}}]})
        return httpx.Response(404)

    salvos = []
    a = Amazon({"refresh_token": "RT"}, salvos.append)
    a.http = _cliente(handler)
    res = a.pesquisar("garrafa")
    assert [r.id_externo for r in res] == ["B0TOP", "B0LENTO"]
    assert res[0].sales_rank == 3 and "Garrafas" in res[0].origem_sinal and res[0].preco == 149.9
    assert salvos and salvos[-1]["access_token"] == "LWA"


def test_amazon_publica_oferta_em_asin_existente(amazon_app):
    enviado = {}

    def handler(req):
        if req.url.host == "api.amazon.com":
            return httpx.Response(200, json={"access_token": "LWA", "expires_in": 3600})
        assert req.method == "PUT" and req.url.path == "/listings/2021-08-01/items/SELLER1/RPQ-7"
        enviado.update(json.loads(req.content))
        return httpx.Response(200, json={"status": "ACCEPTED", "submissionId": "s1", "issues": []})

    a = Amazon({"refresh_token": "RT", "seller_id": "SELLER1"})
    a.http = _cliente(handler)
    r = a.publicar(_anuncio(por_plataforma={"amazon": {"asin": "B0TOP"}}))
    assert r.sucesso and r.link.endswith("/dp/B0TOP")
    assert enviado["requirements"] == "LISTING_OFFER_ONLY"
    assert enviado["attributes"]["merchant_suggested_asin"][0]["value"] == "B0TOP"
    assert enviado["attributes"]["purchasable_offer"][0]["our_price"][0]["schedule"][0]["value_with_tax"] == 89.9


def test_amazon_listagem_nova_nao_vaza_atributos_genericos(amazon_app):
    enviado = {}

    def handler(req):
        if req.url.host == "api.amazon.com":
            return httpx.Response(200, json={"access_token": "LWA", "expires_in": 3600})
        enviado.update(json.loads(req.content))
        return httpx.Response(200, json={"status": "INVALID", "issues": [
            {"severity": "ERROR", "message": "'color' é obrigatório"}]})

    a = Amazon({"refresh_token": "RT", "seller_id": "S"})
    a.http = _cliente(handler)
    with pytest.raises(ErroMarketplace, match="'color' é obrigatório"):
        a.publicar(_anuncio(por_plataforma={"amazon": {"product_type": "BOTTLE", "atributos": {"material": "Aço"}}}))
    attrs = enviado["attributes"]
    assert enviado["productType"] == "BOTTLE" and enviado["requirements"] == "LISTING"
    assert "Cor" not in attrs and "cor" not in attrs and attrs["material"][0]["value"] == "Aço"
    assert attrs["bullet_point"][0]["value"] == "Inox"
    assert attrs["supplier_declared_has_product_identifier_exemption"][0]["value"] is True


def test_ml_token_vencido_sem_renovacao_explica():
    """App sem acesso off-line: o ML não entrega refresh_token e o acesso vence em 6 h."""
    ml = MercadoLivre({"access_token": "VELHO", "obtido_em": time.time() - 7 * 3600, "expires_in": 21600})
    ml.http = _cliente(lambda req: pytest.fail("não deveria chamar a API com token vencido"))
    with pytest.raises(ErroMarketplace, match="expirou .*Reconecte em Contas"):
        ml.pesquisar("fone")
