"""Pesquisa por anúncios (produto do catálogo → todos os anúncios dele), cópia
de um anúncio específico, download das fotos e o modo demonstração."""

import io
import time
import zipfile

import httpx
from PIL import Image

from backend.marketplaces.mercadolivre import MercadoLivre


def _ml(handler):
    ml = MercadoLivre({"access_token": "TOK", "refresh_token": "R", "obtido_em": time.time(), "expires_in": 21600,
                       "user_id": "1"})
    ml.http = httpx.Client(transport=httpx.MockTransport(handler))
    return ml


def _oferta(item, preco, vendedor, logistica="cross_docking", original=None, tipo="gold_special"):
    return {"item_id": item, "price": preco, "original_price": original, "seller_id": vendedor, "category_id": "MLB456",
            "listing_type_id": tipo, "official_store_id": None, "warranty": "90 dias", "condition": "new",
            "shipping": {"free_shipping": preco >= 79, "logistic_type": logistica},
            "seller_address": {"city": {"name": "Caxias do Sul"}, "state": {"name": "Rio Grande do Sul"}}}


def _handler_real():
    """Reproduz a API real (2026-09-30): busca livre 403, /items de outro vendedor 403,
    catálogo, anúncios do produto, visitas e vendedor liberados."""
    def handler(req: httpx.Request):
        p = req.url.path
        if p == "/sites/MLB/search" or p.startswith("/items/MLB") and not p.endswith(("/description", "/time_window")):
            return httpx.Response(403, json={"error": "forbidden"})
        if p == "/products/search":
            return httpx.Response(200, json={"paging": {"total": 2}, "results": [
                {"id": "MLB900", "name": "Furadeira Vonder FIV 550", "attributes": [{"id": "BRAND", "value_name": "Vonder"}],
                 "pictures": [{"url": "https://http2.mlstatic.com/a.jpg"}]},
                {"id": "MLB901", "name": "Furadeira Vonder sem anúncio", "pictures": []}]})
        if p == "/products/MLB900/items":
            return httpx.Response(200, json={"paging": {"total": 3}, "results": [
                _oferta("MLB1", 350.0, 10, "fulfillment", original=400.0, tipo="gold_pro"),
                _oferta("MLB2", 320.0, 11), _oferta("MLB3", 399.0, 10)]})
        if p == "/products/MLB901/items":
            return httpx.Response(200, json={"paging": {"total": 0}, "results": []})
        if p == "/products/MLB900":
            return httpx.Response(200, json={"id": "MLB900", "name": "Furadeira Vonder FIV 550",
                                              "pictures": [{"url": "https://http2.mlstatic.com/a.jpg"}],
                                              "attributes": [{"id": "BRAND", "name": "Marca", "value_name": "Vonder"}],
                                              "short_description": {"content": "curta"}})
        if p.endswith("/visits/time_window"):
            item = p.split("/")[2]
            n = {"MLB1": 5, "MLB2": 1, "MLB3": 0}[item]
            return httpx.Response(200, json={"total_visits": n * 3, "results": [
                {"date": "2026-09-20T00:00:00Z", "total": n}, {"date": "2026-09-25T00:00:00Z", "total": n * 2}]})
        if p.startswith("/users/"):
            uid = p.rsplit("/", 1)[-1]
            return httpx.Response(200, json={"nickname": f"LOJA{uid}", "permalink": "https://perfil.mercadolivre.com.br/x",
                                              "seller_reputation": {"level_id": "5_green", "power_seller_status": "platinum",
                                                                    "transactions": {"total": 1000 + int(uid)}},
                                              "address": {"city": "Caxias do Sul", "state": "BR-RS"}})
        if p == "/items/MLB2/description":
            return httpx.Response(200, json={"plain_text": "Descrição do anúncio da loja 11."})
        return httpx.Response(404, json={})
    return handler


def test_pesquisa_por_anuncios_tira_produto_sem_anuncio_e_traz_cada_anuncio():
    ml = _ml(_handler_real())
    [com] = ml.pesquisar_anuncios("furadeira vonder fiv 550")
    assert com.tipo == "PRODUCT" and com.preco == 320.0
    assert (com.extra["anuncios"], com.extra["full"], com.extra["vendedores"], com.extra["premium"]) == (3, 1, 2, 1)
    assert com.extra["marca"] == "Vonder" and "3 anúncio(s)" in com.origem_sinal
    assert [o["item_id"] for o in com.extra["ofertas"]] == ["MLB2", "MLB1", "MLB3"]
    assert [o["full"] for o in com.extra["ofertas"]] == [False, True, False]


def test_anuncios_do_produto_traz_vendedor_full_e_visitas():
    d = _ml(_handler_real()).anuncios_do_produto("MLB900")
    assert d["total"] == 3 and [a["item_id"] for a in d["anuncios"]] == ["MLB2", "MLB1", "MLB3"]
    full = next(a for a in d["anuncios"] if a["item_id"] == "MLB1")
    assert full["full"] and full["logistica_nome"] == "Full" and full["tipo_anuncio"] == "Premium" and full["desconto_pct"] == 12
    assert full["vendedor"]["apelido"] == "LOJA10" and full["vendedor"]["medalha"] == "platinum"
    assert full["visitas"]["trinta_dias"] == 15 and len(full["visitas"]["serie"]) == 30


def test_copiar_um_anuncio_do_produto_usa_descricao_e_preco_dele():
    c = _ml(_handler_real()).obter_anuncio("MLB900", "PRODUCT", "MLB2")
    assert c.titulo == "Furadeira Vonder FIV 550" and c.preco == 320.0 and c.descricao.startswith("Descrição do anúncio da loja 11")
    assert c.link.endswith("MLB-2") and c.por_plataforma["mercadolivre"]["category_id"] == "MLB456"


def test_pesquisa_demo_por_anuncios_ver_e_copiar(client, sessao):
    r = client.post("/api/pesquisas", headers=sessao, json={"termo": "furadeira vonder", "plataformas": ["mercadolivre"]})
    assert r.status_code == 200, r.text
    res = r.json()["resultados"][0]
    assert res["tipo"] == "PRODUCT" and res["extra"]["anuncios"] >= 3
    d = client.get(f"/api/mercadolivre/produtos/{res['id_externo']}/anuncios", headers=sessao).json()
    assert d["demo"] and d["anuncios"] and "serie" in d["anuncios"][0]["visitas"]
    a = client.post("/api/anuncios/copiar", headers=sessao, json={
        "plataforma": "mercadolivre", "id_externo": res["id_externo"], "tipo": "PRODUCT",
        "item_id": d["anuncios"][0]["item_id"], "pesquisa_id": r.json()["id"]})
    assert a.status_code == 200, a.text
    assert a.json()["origem"]["item_id"] == d["anuncios"][0]["item_id"]
    r = client.post("/api/pesquisas", headers=sessao, json={"termo": "furadeira vonder", "plataformas": ["mercadolivre"],
                                                             "modo": "ranking"})
    assert r.status_code == 200 and r.json()["resultados"][0]["tipo"] == "ITEM"


def test_baixar_fotos_em_zip(client, sessao):
    fotos = []
    for cor in ("red", "blue"):
        buf = io.BytesIO()
        Image.new("RGB", (600, 600), cor).save(buf, "PNG")
        fotos.append(client.post("/api/uploads", headers=sessao, files={"arquivo": ("p.png", buf.getvalue(), "image/png")}).json()["url"])
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Garrafa Térmica", "fotos": fotos}).json()
    r = client.get(f"/api/anuncios/{a['id']}/fotos.zip", headers=sessao)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert 'filename="garrafa-termica-fotos.zip"' in r.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        assert z.namelist() == ["foto-01.png", "foto-02.png"]
    vazio = client.post("/api/anuncios", headers=sessao, json={"titulo": "Sem foto"}).json()
    assert client.get(f"/api/anuncios/{vazio['id']}/fotos.zip", headers=sessao).status_code == 400


def test_interpreta_medidas_marca_e_voltagem():
    from backend.services.termo_busca import interpretar
    i = interpretar("bomba 1/2 syllent", ["Syllent"])
    assert (i["nucleo"], i["marca"], [m["rotulo"] for m in i["medidas"]]) == ("bomba", "Syllent", ["1/2 CV"])
    i = interpretar("bomba meio cavalo sylent 220v", ["Syllent"])
    assert (i["marca"], i["medidas"][0]["unidade"], i["voltagem"]) == ("Syllent", "cv", "220V")
    i = interpretar("registro de gaveta 3/4", [])
    assert [(m["unidade"], m["rotulo"]) for m in i["medidas"]] == [("pol", '3/4"')] and i["produto"] == "registro gaveta"
    assert interpretar("registro 1/2 pol", [])["medidas"][0]["unidade"] == "pol"
    assert interpretar("motor 1 1/2 cv", [])["medidas"][0]["rotulo"] == "1 1/2 CV"
    i = interpretar("garrafa termica 1 litro", [])
    assert i["medidas"][0]["base"] == 1000 and i["medidas"][0]["familia"] == "volume"
    i = interpretar("parafusadeira bosch gsr 120 12v", ["Bosch"])
    assert i["medidas"] == [] and "120" in i["produto"] and i["voltagem"] == "12V"
    assert [m["rotulo"] for m in interpretar("broca 10mm", [])["medidas"]] == ["10 mm"]


def test_medida_e_tipo_no_titulo():
    from backend.services.termo_busca import interpretar, medida_no_produto, tipo_do_produto
    i = interpretar("bomba 1/2 syllent", ["Syllent"])
    cv = i["medidas"][0]
    assert medida_no_produto(cv, "Bomba Hidromassagem Syllent 1/2 60hz")
    assert medida_no_produto(cv, "Bomba Piscina Syllent", ["367.5 W"])
    assert not medida_no_produto(cv, "Bomba Syllent 3/4 cv")
    assert not medida_no_produto(cv, "Kit União Bomba E Filtro 1 1/2 Pol")
    pol = interpretar("registro 3/4", [])["medidas"][0]
    assert medida_no_produto(pol, 'Registro De Gaveta 3/4" Deca')
    assert not medida_no_produto(pol, 'Registro De Gaveta 1/2" Deca')
    litro = interpretar("garrafa 1 litro", [])["medidas"][0]
    assert medida_no_produto(litro, "Garrafa Térmica Inox 1000ml") and not medida_no_produto(litro, "Garrafa 500ml")
    assert not tipo_do_produto(i, "Rotor Para Bomba 1/2 Cv Sodramar")
    assert not tipo_do_produto(i, "Kit 2 União Soldavel 50mm Bomba E Filtro")
    assert tipo_do_produto(i, "Motobomba Syllent 1/2 cv")


def _handler_bombas():
    def produto(pid, nome, marca, pai=None, potencia=None):
        attrs = [{"id": "BRAND", "value_name": marca}] + ([{"id": "POWER", "value_name": potencia}] if potencia else [])
        return {"id": pid, "name": nome, "attributes": attrs, "parent_id": pai, "pictures": [{"url": f"https://x/{pid}.jpg"}]}

    catalogo = [
        produto("MLB1", "Rotor Para Bomba 1/2 Cv Sodramar", "Sodramar"),
        produto("MLB2", "Bomba Pressurizadora Syllent 1/2 Cv 127V", "Syllent", pai="MLB100"),
        produto("MLB3", "Bomba Pressurizadora Syllent 1/2 Cv 220V", "Syllent", pai="MLB100"),
        produto("MLB4", "Bomba Periférica Foxlux 1/2 CV", "Foxlux"),
        produto("MLB5", "Bomba Piscina Syllent Autoescorvante", "Syllent", potencia="367.5 W"),
        produto("MLB6", "Bomba Syllent 1 CV", "Syllent"),
    ]

    def handler(req: httpx.Request):
        p = req.url.path
        if p == "/sites/MLB/domain_discovery/search":
            return httpx.Response(200, json=[{"domain_id": "MLB-PUMPS", "domain_name": "Bombas", "category_id": "MLB10",
                                              "category_name": "Bombas", "attributes": [{"id": "BRAND", "value_name": "Syllent"}]}])
        if p == "/products/search":
            return httpx.Response(200, json={"results": catalogo})
        if p.startswith("/products/") and p.endswith("/items"):
            return httpx.Response(200, json={"paging": {"total": 1}, "results": [_oferta("MLB9" + p.split("/")[2][3:], 300.0, 10)]})
        return httpx.Response(404, json={})
    return handler


def test_pesquisa_um_cartao_por_produto_exatos_antes_dos_parecidos():
    ml = _ml(_handler_bombas())
    res = ml.pesquisar_anuncios("bomba 1/2 syllent", 20)
    ids = [r.id_externo for r in res]
    assert "MLB1" not in ids
    assert ids == ["MLB2", "MLB5", "MLB4", "MLB6"]
    assert res[0].extra["versoes"] == 2 and res[0].extra["correspondencia"] == "exato"
    assert [r.extra["correspondencia"] for r in res] == ["exato", "exato", "parecido", "parecido"]
    b = ml.meta["busca"]
    assert b["interpretacao"]["marca"] == "Syllent" and b["interpretacao"]["medidas"][0]["rotulo"] == "1/2 CV"
    assert (b["exatos"], b["parecidos"]) == (2, 2)
