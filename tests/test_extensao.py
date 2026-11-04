import secrets
from datetime import date

from backend.banco.db import SessionLocal
from backend.banco.models import ContaMarketplace
from backend.services import extensao


def _admin_id(client, h):
    return client.get("/api/empresa/usuarios", headers=h).json()[0]["id"]


def _ligar(client, h, chave=None):
    uid = _admin_id(client, h)
    assert client.put(f"/api/extensao/admin/usuarios/{uid}", headers=h, json={"liberada": True}).status_code == 200
    codigo = client.post(f"/api/extensao/admin/usuarios/{uid}/codigo", headers=h).json()["codigo"]
    chave = chave or secrets.token_hex(24)
    r = client.post("/api/extensao/parear", json={"codigo": codigo, "chave": chave, "navegador": "Chrome teste"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"], "X-Extensao-Chave": chave}, codigo, uid


def _conta_ml(h, cliente_id, id_externo):
    with SessionLocal() as db:
        from backend.banco.models import Cliente
        c = db.get(Cliente, cliente_id)
        db.add(ContaMarketplace(empresa_id=c.empresa_id, cliente_id=c.id, plataforma="mercadolivre",
                                apelido=f"CONTA{id_externo}", id_externo=id_externo))
        db.commit()


def test_codigo_exige_liberacao(client, sessao):
    h = sessao
    uid = _admin_id(client, h)
    r = client.post(f"/api/extensao/admin/usuarios/{uid}/codigo", headers=h)
    assert r.status_code == 403


def test_um_navegador_por_pessoa(client, sessao):
    h = sessao
    ext, codigo, uid = _ligar(client, h)
    assert client.get("/api/extensao/eu", headers=ext).status_code == 200
    outro = client.post("/api/extensao/parear", json={"codigo": codigo, "chave": secrets.token_hex(24)})
    assert outro.status_code == 403 and "navegador ligado" in outro.json()["detail"]
    copiado = {**ext, "X-Extensao-Chave": secrets.token_hex(24)}
    assert client.get("/api/extensao/eu", headers=copiado).status_code == 401
    disp = client.get("/api/extensao/admin", headers=h).json()["pessoas"][0]["navegador"]
    assert disp and disp["nome"] == "Chrome teste"
    client.delete(f"/api/extensao/admin/dispositivos/{disp['id']}", headers=h)
    assert client.get("/api/extensao/eu", headers=ext).status_code == 401


def test_bloquear_desliga_navegador(client, sessao):
    h = sessao
    ext, _, uid = _ligar(client, h)
    client.put(f"/api/extensao/admin/usuarios/{uid}", headers=h, json={"liberada": False})
    assert client.get("/api/extensao/eu", headers=ext).status_code == 401


def test_so_conta_de_estudo(client, sessao):
    h = sessao
    cliente_real = int(h["X-Cliente"])
    estudo = client.post("/api/clientes", headers=h, json={"nome": "Estudo Monvatti"}).json()["id"]
    ext, _, _ = _ligar(client, h)
    sem = client.get("/api/extensao/eu", headers=ext).json()["conta"]
    assert not sem["liberado"] and "Nenhuma conta de estudo" in sem["motivo"]
    client.patch(f"/api/clientes/{estudo}", headers=h, json={"estudo": True})
    _conta_ml(h, estudo, "111")
    _conta_ml(h, cliente_real, "222")
    assert client.get("/api/extensao/eu?conta_ml=111", headers=ext).json()["conta"]["liberado"]
    assert client.get("/api/extensao/eu", headers=ext).json()["conta"]["liberado"]
    de_cliente = client.get("/api/extensao/eu?conta_ml=222", headers=ext).json()["conta"]
    assert not de_cliente["liberado"] and "Cliente A" in de_cliente["motivo"]
    assert not client.get("/api/extensao/eu?conta_ml=999", headers=ext).json()["conta"]["liberado"]
    r = client.post("/api/extensao/anuncio", headers=ext, json={"conta_ml": "222", "pagina": {"item_id": "MLB123456789"}})
    assert r.status_code == 403
    eu = client.get("/api/extensao/eu", headers=ext).json()
    assert [c["id"] for c in eu["clientes"]] == [cliente_real]


def _foto_falsa(monkeypatch):
    from io import BytesIO

    from PIL import Image

    from backend.services import fotos

    def baixar(_http, url):
        saida = BytesIO()
        Image.new("RGB", (40, 40), (len(url) % 255, 80, 160)).save(saida, "JPEG")
        return saida.getvalue(), "foto.jpg"
    monkeypatch.setattr(fotos, "baixar_externa", baixar)


def test_copiar_cria_rascunho(client, sessao, monkeypatch):
    h = sessao
    _foto_falsa(monkeypatch)
    estudo = client.post("/api/clientes", headers=h, json={"nome": "Estudo"}).json()["id"]
    client.patch(f"/api/clientes/{estudo}", headers=h, json={"estudo": True})
    ext, _, _ = _ligar(client, h)
    pagina = {"item_id": "MLB123456789", "titulo": "Fone Bluetooth X", "descricao": "Texto", "preco": 99.9,
              "fotos": ["https://http2.mlstatic.com/D_1.jpg", "javascript:alert(1)"], "atributos": {"Marca": "JBL"}}
    r = client.post("/api/extensao/copiar", headers=ext, json={"cliente_id": int(h["X-Cliente"]), "pagina": pagina})
    assert r.status_code == 200, r.text
    a = client.get(f"/api/anuncios/{r.json()['anuncio_id']}", headers=h).json()
    assert a["titulo"] == "Fone Bluetooth X" and a["marca"] == "JBL" and len(a["fotos"]) == 1
    assert r.json()["fotos_depois"]
    [pasta] = [x for x in client.get("/api/fotos-salvas", headers=h).json() if x["item_id"] == "MLB123456789"]
    assert pasta["quantidade"] == 1 and pasta["cliente_id"] == int(h["X-Cliente"]) and pasta["fotos"][0].startswith("/uploads/")
    negado = client.post("/api/extensao/copiar", headers=ext, json={"cliente_id": estudo, "pagina": pagina})
    assert negado.status_code == 403


def test_contas_das_metricas():
    assert extensao.numero_vendidos("Novo | +50 mil vendidos") == (50000, True)
    assert extensao.numero_vendidos("+1000 vendidos") == (1000, True)
    assert extensao.numero_vendidos("37 vendidos") == (37, False)
    assert extensao.estimar_vendas(50000, True) == 77625
    assert extensao.estimar_vendas(500, True) == 776
    assert extensao.estimar_vendas(37, False) == 37
    m = extensao.metricas(50000, True, 1252.80, 994893, 413, 399, hoje=date(2026, 10, 26))
    assert m["vendas_dia"] == 121 and m["vendas_mes"] == 3631 and m["ritmo_mes"] == 7106
    assert m["conversao_pct"] == 5.03 and m["faturamento"] == 62640000.0
    assert m["periodos"]["d30"]["vendas"] == 7106 and m["periodos"]["d7"]["vendas"] == 1658
    assert m["periodos"]["mes"]["vendas"] == 6159 and m["periodos"]["total"]["vendas"] == 50000
    j = extensao.metricas(500, True, 1566.55, 29286, 441, 434)
    assert (j["vendas_estimadas"], j["ritmo_mes"], j["vendas_dia"], j["vendas_mes"]) == (776, 65, 1, 34)
    assert j["conversao_pct"] == 1.71


def test_tarifas_exige_conta_de_estudo(client, sessao):
    h = sessao
    ext, _, _ = _ligar(client, h)
    corpo = {"preco": 199.9, "categoria_id": "MLB196208", "tipo": "gold_pro"}
    assert client.post("/api/extensao/tarifas", headers=ext, json=corpo).status_code == 403
    estudo = client.post("/api/clientes", headers=h, json={"nome": "Estudo"}).json()["id"]
    client.patch(f"/api/clientes/{estudo}", headers=h, json={"estudo": True})
    _conta_ml(h, estudo, "555")
    r = client.post("/api/extensao/tarifas", headers=ext, json={**corpo, "conta_ml": "555"})
    assert r.status_code == 403 and "não está conectada" in r.json()["detail"]
    assert client.post("/api/extensao/tarifas", headers=ext, json={**corpo, "preco": 0}).status_code == 422


def test_avaliacao_mais_antiga_le_varias_paginas(monkeypatch):
    class Resposta:
        status_code = 200

        def __init__(self, texto):
            self.text = texto

    def falso_get(url, params=None, **kw):
        datas = {0: ['2025-03-01T10:00:00', '2021-11-18T09:30:00'], 20: ['2024-01-02T00:00:00']}.get(params["offset"], [])
        return Resposta("".join(f'{{"created_date":"{d}"}}' for d in datas))

    monkeypatch.setattr(extensao.httpx, "get", falso_get)
    assert extensao.avaliacao_mais_antiga("MLB1916976065", paginas=3) == "2021-11-18T09:30:00Z"


def test_codigo_de_anuncio_da_busca():
    assert extensao._id_anuncio("mlb3937953023") == "MLB3937953023"
    assert extensao._id_anuncio("MLB116815353305") == ""
    assert extensao._id_anuncio("MLBU1414018297") == ""


def test_planilha_de_estudo(client, sessao):
    from io import BytesIO

    from openpyxl import load_workbook

    ext, _, _ = _ligar(client, sessao)
    itens = [{"titulo": "Chave de fenda Vonder", "link": "https://produto.mercadolivre.com.br/MLB-1234567890", "preco": 50,
              "vendidos": 1000, "vendidos_texto": "+1000 vendidos", "vendas_dia": 0.55, "vendas_mes": 90, "comissao_pct": 14,
              "taxa_fixa": 6.25, "frete": 0, "tipo": "Clássico", "logistica": "Coleta + Flex", "catalogo": "Sim",
              "criado_em": "01/02/2024"},
             {"titulo": "Sem data", "preco": 30, "vendas_dia": None, "vendas_mes": None}]
    r = client.post("/api/extensao/estudo", headers=ext, json={"pesquisa": "vonder", "filtro": "Full", "imposto": 7, "itens": itens})
    assert r.status_code == 200 and "estudo-vonder-" in r.headers["content-disposition"]
    ws = load_workbook(BytesIO(r.content))["Estudo"]
    assert [ws.cell(4, c).value for c in (1, 2, 3, 4, 6, 7, 12, 13)] == [
        "Produto", "Vendidos", "Venda/dia", "Venda/mês", "Preço de venda", "Custo do Produto", "Margem %", "Margem R$"]
    assert ws["A5"].value == "Chave de fenda Vonder" and ws["A5"].hyperlink.target.endswith("MLB-1234567890")
    assert ws["B5"].value == 1000 and ws["B5"].number_format == '"+"#,##0'
    assert ws["C5"].value == 0.55 and ws["C5"].number_format == "#,##0.0"
    assert ws["D5"].value == 90 and ws["F5"].value == 50 and ws["G5"].value is None
    assert ws["H5"].value == 0.14 and ws["K5"].value == "=$B$3" and ws["B3"].value == 0.07
    assert ws["M5"].value == '=IF(OR(G5="",F5=""),"",F5-G5-F5*H5-I5-J5-F5*K5)'
    assert ws["L5"].value == '=IF(OR(G5="",F5=0,M5=""),"",M5/F5)'
    assert ws["P5"].value == "Coleta + Flex" and ws["Q5"].value == "Sim"
    assert ws["C6"].value == "sem data" and ws.max_column == 19 and ws["S4"].value == "Link do anúncio"
    assert not ws["A5"].alignment.wrap_text and ws.row_dimensions[5].height == ws.row_dimensions[6].height == 20
    assert client.post("/api/extensao/estudo", headers=ext, json={"itens": []}).status_code == 422


def test_fotos_salvas_pela_extensao(client, sessao, monkeypatch):
    import zipfile
    from io import BytesIO

    h = sessao
    _foto_falsa(monkeypatch)
    ext, _, _ = _ligar(client, h)
    pagina = {"item_id": "MLB987654321", "titulo": "Garrafa Térmica 1L", "link": "https://produto.mercadolivre.com.br/MLB-987654321",
              "fotos": ["https://http2.mlstatic.com/D_1-F.jpg", "https://http2.mlstatic.com/D_2-F.jpg", "https://exemplo.com/x.jpg"]}
    r = client.post("/api/extensao/fotos", headers=ext, json={"pagina": pagina})
    assert r.status_code == 200, r.text
    assert r.json()["novas"] == 2 and r.json()["total"] == 2
    pagina["fotos"].append("https://http2.mlstatic.com/D_3-F.jpg")
    de_novo = client.post("/api/extensao/fotos", headers=ext, json={"pagina": pagina}).json()
    assert de_novo["pasta_id"] == r.json()["pasta_id"] and de_novo["novas"] == 1 and de_novo["total"] == 3
    lista = client.get("/api/fotos-salvas", headers=h).json()
    assert len(lista) == 1 and lista[0]["titulo"] == "Garrafa Térmica 1L" and lista[0]["salvo_por"]
    pasta = client.get(f"/api/fotos-salvas/{lista[0]['id']}", headers=h).json()
    assert client.get(pasta["fotos"][0]).status_code == 200
    pacote = client.get(f"/api/fotos-salvas/{pasta['id']}/fotos.zip", headers=h)
    assert pacote.status_code == 200 and len(zipfile.ZipFile(BytesIO(pacote.content)).namelist()) == 3
    sem_fotos = client.post("/api/extensao/fotos", headers=ext, json={"pagina": {"item_id": "MLB1", "fotos": ["https://exemplo.com/a.jpg"]}})
    assert sem_fotos.status_code == 403
    assert client.delete(f"/api/fotos-salvas/{pasta['id']}", headers=h).status_code == 200
    assert client.get("/api/fotos-salvas", headers=h).json() == []
    assert client.get(pasta["fotos"][0]).status_code == 404


def test_venda_por_dia_com_decimal_e_logistica_com_flex():
    from backend.services import extensao
    m = extensao.metricas(15, False, 10.0, None, 30)
    assert m["vendas_dia_exata"] == 0.5 and m["vendas_mes"] == 15
    assert extensao.nome_logistica("cross_docking", True) == "Coleta + Flex"
    assert extensao.nome_logistica("fulfillment", True) == "Full"
    assert extensao.nome_logistica("self_service", True) == "Flex"


def test_copiar_o_mesmo_anuncio_reaproveita_o_rascunho(client, sessao):
    h = sessao
    ext, _, _ = _ligar(client, h)
    cliente = client.post("/api/clientes", headers=h, json={"nome": "Loja Real"}).json()["id"]
    pagina = {"item_id": "MLB5179560937", "titulo": "Garrafa Térmica 1L", "preco": 99.9, "fotos": []}
    primeiro = client.post("/api/extensao/copiar", headers=ext, json={"cliente_id": cliente, "pagina": pagina})
    assert primeiro.status_code == 200, primeiro.text
    de_novo = client.post("/api/extensao/copiar", headers=ext, json={"cliente_id": cliente, "pagina": pagina}).json()
    assert de_novo["anuncio_id"] == primeiro.json()["anuncio_id"] and de_novo["ja_existia"]
    outro = client.post("/api/extensao/copiar", headers=ext, json={"cliente_id": cliente, "pagina": {**pagina, "item_id": "MLB5179560938"}})
    assert outro.json()["anuncio_id"] != primeiro.json()["anuncio_id"]
