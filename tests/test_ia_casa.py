"""Padrão da casa, exemplos aprovados, limite mensal de IA e escolha do modelo de texto."""

import json
import sys
import types

from backend import config
from backend.banco.db import SessionLocal
from backend.banco.models import Anuncio
from backend.services import exemplos, ia, padrao_casa, uso_ia


def test_padrao_do_cliente_por_cima_da_agencia(client, time):
    admin = time["admin"]
    r = client.put("/api/padrao-casa", headers=admin, json={
        "titulo_formula": {"mercadolivre": "Produto + Marca + Modelo"}, "tom_voz": "direto",
        "palavras_proibidas": ["barato", "imperdível"], "fotos": {"cenario": "cozinha clara"}})
    assert r.status_code == 200, r.text
    client.put(f"/api/padrao-casa?cliente_id={time['a']}", headers=admin, json={
        "tom_voz": "acolhedor", "palavras_proibidas": ["promoção"]})
    ef = client.get(f"/api/padrao-casa?cliente_id={time['a']}", headers=time["cons"]).json()["efetivo"]
    assert ef["tom_voz"] == "acolhedor" and ef["titulo_formula"]["mercadolivre"] == "Produto + Marca + Modelo"
    assert ef["palavras_proibidas"] == ["barato", "imperdível", "promoção"] and ef["fotos"]["cenario"] == "cozinha clara"
    assert client.put("/api/padrao-casa", headers=time["cons"], json={}).status_code == 403
    assert client.get(f"/api/padrao-casa?cliente_id={time['b']}", headers=time["cons"]).status_code == 403
    assert client.get("/api/padrao-casa", headers=time["loja"]).status_code == 403


def test_regras_sem_ia_tiram_palavras_proibidas(client, time):
    client.put("/api/padrao-casa", headers=time["admin"], json={"palavras_proibidas": ["barato"]})
    h = {**time["op"], "X-Cliente": str(time["a"])}
    a = client.post("/api/anuncios", headers=h, json={"titulo": "Garrafa termica barato inox"}).json()
    r = client.post(f"/api/anuncios/{a['id']}/ia", headers=h, json={"plataformas": ["mercadolivre"]}).json()
    assert r["fonte"] == "regras" and "barato" not in r["titulo"].lower()
    assert padrao_casa.tirar_proibidas("Super Barato e bom", {"palavras_proibidas": ["barato"]}) == "Super e bom"


def test_exemplo_aprovado_volta_como_referencia_da_mesma_categoria(client, time):
    h = {**time["op"], "X-Cliente": str(time["a"])}
    desc = "Garrafa térmica de aço inox com parede dupla que mantém a bebida quente por 12 horas."
    bom = client.post("/api/anuncios", headers=h, json={"titulo": "Garrafa Térmica Inox 1 Litro", "descricao": desc,
                                                        "por_plataforma": {"mercadolivre": {"category_id": "MLB999"}}}).json()
    assert client.post(f"/api/anuncios/{bom['id']}/exemplo", headers=h, json={}).status_code == 200
    curto = client.post("/api/anuncios", headers=h, json={"titulo": "X"}).json()
    assert client.post(f"/api/anuncios/{curto['id']}/exemplo", headers=h, json={}).status_code == 400
    assert client.post(f"/api/anuncios/{bom['id']}/exemplo", headers=time["op_b"], json={}).status_code == 404
    novo = client.post("/api/anuncios", headers=h, json={"titulo": "Caneca térmica",
                                                         "por_plataforma": {"mercadolivre": {"category_id": "MLB999"}}}).json()
    with SessionLocal() as db:
        ref = exemplos.escolher(db, db.get(Anuncio, novo["id"]))
    assert [e.titulo for e in ref] == ["Garrafa Térmica Inox 1 Litro"]
    lista = client.get(f"/api/exemplos?cliente_id={time['a']}", headers=time["cons"]).json()
    assert lista[0]["origem"] == "aprovado"


def test_limite_mensal_avisa_e_bloqueia(client, time, monkeypatch):
    monkeypatch.setattr(config, "IA_LIMITE_IMAGENS_MES", 5)
    monkeypatch.setattr(config, "IA_AVISO_PCT", 80)
    with SessionLocal() as db:
        empresa = db.get(Anuncio, client.post("/api/anuncios", headers={**time["op"], "X-Cliente": str(time["a"])},
                                              json={"titulo": "Qualquer"}).json()["id"]).empresa_id
        s = uso_ia.registrar(db, empresa, time["a"], imagens=4)
        assert s["perto"] and s["pct_imagens"] == 80
        try:
            uso_ia.conferir(db, empresa, time["a"], imagens=2)
            assert False, "devia bloquear"
        except uso_ia.LimiteIA as e:
            assert "IA_LIMITE_IMAGENS_MES" in str(e)
    avisos = client.get("/api/notificacoes", headers=time["op"]).json()["itens"]
    assert any(n["tipo"] == "ia_limite" for n in avisos)
    sit = client.get(f"/api/ia/situacao?cliente_id={time['a']}", headers=time["admin"]).json()
    assert sit["uso"]["imagens"] == 4 and sit["texto"] is False and sit["imagem"] == ""


def test_texto_usa_modelo_barato_sem_fallback_e_padrao_no_pedido(monkeypatch):
    chamadas = []

    class Resposta:
        stop_reason = "end_turn"
        content = [types.SimpleNamespace(type="text", text=json.dumps({
            "titulos": ["Garrafa Termica Inox barato"], "descricao": "Texto barato bom", "palavras_chave": [], "observacoes": ""}))]

    class Mensagens:
        def create(self, **kw):
            chamadas.append(("normal", kw))
            return Resposta()

    class Cliente:
        def __init__(self, **_):
            self.messages = Mensagens()
            self.beta = types.SimpleNamespace(messages=types.SimpleNamespace(create=lambda **kw: chamadas.append(("beta", kw)) or Resposta()))

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=Cliente))
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "teste")
    monkeypatch.setattr(config, "ANTHROPIC_MODEL_TEXTO", "claude-haiku-5-5")
    anuncio = types.SimpleNamespace(titulo="Garrafa", descricao="", marca="", modelo="", condicao="new", atributos={}, preco=10)
    padrao = padrao_casa.normalizar({"palavras_proibidas": ["barato"], "tom_voz": "direto"})
    ex = types.SimpleNamespace(titulo="Modelo bom", descricao="Descrição modelo")
    saida = ia.melhorar_anuncio(anuncio, ["mercadolivre"], padrao, [ex])
    tipo, kw = chamadas[0]
    assert tipo == "normal" and kw["model"] == "claude-haiku-5-5" and "fallbacks" not in kw
    assert "Tom de voz: direto" in kw["system"] and "Modelo bom" in kw["system"]
    assert "barato" not in saida["titulo"].lower() and "barato" not in saida["descricao"].lower()
    monkeypatch.setattr(config, "ANTHROPIC_MODEL_TEXTO", "claude-sonnet-5-5")
    ia.melhorar_anuncio(anuncio, ["mercadolivre"])
    assert chamadas[-1][0] == "beta" and chamadas[-1][1]["fallbacks"] == "default"
