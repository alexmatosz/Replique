"""Atividades por período, regras do lote, Meus anúncios e Clonador."""

from datetime import date, timedelta


def _publicado(client, sessao, titulo="Garrafa Inox 1 Litro"):
    a = client.post("/api/anuncios", headers=sessao, json={
        "titulo": titulo, "preco": 89.9, "fotos": ["https://exemplo.com/1.jpg"], "descricao": "x" * 100}).json()
    r = client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]})
    assert r.status_code == 200, r.text
    return a


def test_atividades_filtram_por_periodo(client, sessao):
    client.post("/api/anuncios", headers=sessao, json={"titulo": "Algo"})
    hoje = date.today()
    assert client.get(f"/api/atividades?desde={hoje - timedelta(days=1)}&ate={hoje + timedelta(days=1)}", headers=sessao).json()
    assert client.get(f"/api/atividades?desde={hoje + timedelta(days=2)}", headers=sessao).json() == []
    assert client.get(f"/api/atividades?ate={hoje - timedelta(days=2)}", headers=sessao).json() == []


def test_regras_do_lote_aparecem_na_tela(client, sessao):
    r = client.get("/api/lotes/regras", headers=sessao).json()
    assert {"max_anuncios", "intervalo_s", "limite_diario", "parar_apos_falhas"} <= set(r)


def test_meus_anuncios_com_risco_e_etiquetas(client, sessao):
    _publicado(client, sessao)
    d = client.get("/api/meus-anuncios", headers=sessao).json()
    item = d["itens"][0]
    assert item["plataforma"] == "mercadolivre" and item["risco"] in ("baixo", "medio", "alto")
    assert item["vendas_30d"] is None and d["vendas_sincronizadas"] is False
    r = client.put("/api/meus-anuncios/etiquetas", headers=sessao,
                   json={"publicacao_ids": [item["publicacao_id"]], "adicionar": ["natal"], "remover": []})
    assert r.json()["alterados"] == 1
    d = client.get("/api/meus-anuncios", headers=sessao).json()
    assert d["itens"][0]["etiquetas"] == ["natal"] and d["etiquetas"] == ["natal"]
    client.put("/api/meus-anuncios/etiquetas", headers=sessao,
               json={"publicacao_ids": [item["publicacao_id"]], "adicionar": [], "remover": ["natal"]})
    assert client.get("/api/meus-anuncios", headers=sessao).json()["itens"][0]["etiquetas"] == []


def test_clonador_cria_so_rascunhos_com_variacoes_e_limite_de_titulo(client, sessao):
    a = _publicado(client, sessao, "T" * 58)
    r = client.post("/api/clonador", headers=sessao, json={"anuncio_ids": [a["id"]], "plataforma": "mercadolivre",
                                                            "variacoes": ["Azul", "Vermelho"]})
    assert r.status_code == 200, r.text
    criados = r.json()["criados"]
    assert len(criados) == 2 and all(len(c["titulo"]) <= 60 for c in criados)
    assert any("cortado" in " ".join(c["avisos"]) for c in criados)
    for c in criados:
        novo = client.get(f"/api/anuncios/{c['id']}", headers=sessao).json()
        assert novo["status"] == "rascunho" and novo["origem"]["clone_de"] == a["id"] and novo["aprovacao"] == ""
        assert client.get(f"/api/anuncios/{c['id']}/publicacoes", headers=sessao).json() == []


def test_clonador_para_outro_cliente_e_isolamento(client, sessao):
    a = _publicado(client, sessao)
    outro = client.post("/api/clientes", headers=sessao, json={"nome": "Loja 2"}).json()["id"]
    r = client.post("/api/clonador", headers=sessao, json={"anuncio_ids": [a["id"]], "plataforma": "shopee", "cliente_destino_id": outro})
    assert r.status_code == 200 and r.json()["cliente_destino"] == "Loja 2"
    assert any("Shopee" in x for x in r.json()["criados"][0]["avisos"])
    h2 = {**sessao, "X-Cliente": str(outro)}
    assert client.post("/api/clonador", headers=h2, json={"anuncio_ids": [a["id"]], "plataforma": "shopee"}).status_code == 400
    assert client.post("/api/clonador", headers=sessao, json={"anuncio_ids": [a["id"]], "plataforma": "xyz"}).status_code == 400


def test_clonador_aceita_publicado_com_rascunho_apagado(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Garrafa Térmica Inox 1 Litro", "preco": 90}).json()
    client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"fotos": ["https://exemplo.com/f.jpg"], "peso_kg": 0.5,
                                                                   "por_plataforma": {"mercadolivre": {"category_id": "MLB1234"}}})
    assert client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]}).json()["status"] == "simulado"
    client.delete(f"/api/anuncios/{a['id']}", headers=sessao)
    so_rascunho = client.post("/api/anuncios", headers=sessao, json={"titulo": "Rascunho apagado"}).json()
    client.delete(f"/api/anuncios/{so_rascunho['id']}", headers=sessao)
    origens = client.get("/api/clonador/origens", headers=sessao).json()
    alvo = next(o for o in origens if o["id"] == a["id"])
    assert alvo["rascunho_apagado"] and alvo["publicado_em"] == ["mercadolivre"]
    assert all(o["id"] != so_rascunho["id"] for o in origens)
    r = client.post("/api/clonador", headers=sessao, json={"anuncio_ids": [a["id"]], "plataforma": "shopee"})
    assert r.status_code == 200 and len(r.json()["criados"]) == 1
    assert client.post("/api/clonador", headers=sessao, json={"anuncio_ids": [so_rascunho["id"]], "plataforma": "shopee"}).status_code == 400


def test_filtros_do_mapeador_compartilhados_na_empresa(client, time):
    corpo = {"nome": "Casa até 100", "dados": {"rm-texto": "inox", "rm-oficial": True}}
    assert client.post("/api/filtros/mapeador", headers=time["op"], json=corpo).status_code == 200
    lista = client.get("/api/filtros/mapeador", headers=time["cons"]).json()
    assert lista[0]["nome"] == "Casa até 100" and lista[0]["dados"]["rm-oficial"] is True and not lista[0]["meu"]
    assert client.post("/api/filtros/mapeador", headers=time["cons"], json=corpo).status_code == 400
    assert client.delete(f"/api/filtros/mapeador/{lista[0]['id']}", headers=time["cons"]).status_code == 403
    assert client.get("/api/filtros/mapeador", headers=time["loja"]).status_code == 404
    assert client.get("/api/filtros/outra", headers=time["op"]).status_code == 404
    assert client.delete(f"/api/filtros/mapeador/{lista[0]['id']}", headers=time["op"]).status_code == 200
    assert client.get("/api/filtros/mapeador", headers=time["op"]).json() == []
