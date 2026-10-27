"""Radar de anúncios: disputa de catálogo, linha do tempo e alertas no sino."""

import types

from app.db import SessionLocal
from app.models import AnuncioMonitorado, Cliente, LeituraMonitorado, Notificacao
from app.services import monitor


class _Resp:
    def __init__(self, status, corpo):
        self.status_code, self._corpo = status, corpo

    def json(self):
        return self._corpo


def test_catalogo_traduz_motivos_e_diz_quando_a_api_nao_responde():
    ad = types.SimpleNamespace(_get=lambda caminho, params=None: _Resp(200, {
        "status": "competing", "current_price": 100, "price_to_win": 94.9, "reason": ["winner_has_better_price", "algo_novo"],
        "winner": {"item_id": "MLB1", "price": 95}, "boosts": [{"id": "free_shipping", "status": "opportunity"}]}))
    c = monitor.catalogo(ad, "MLB2")
    assert c["ganhando"] is False and c["status_nome"] == "perdendo" and c["preco_para_ganhar"] == 94.9
    assert c["motivos"] == ["o vencedor tem preço menor", "algo_novo"] and c["oportunidades"] == ["frete grátis"]
    real = types.SimpleNamespace(_get=lambda *a, **k: _Resp(200, {
        "status": "competing", "current_price": 40, "price_to_win": 40, "reason": ["no_improvement_price"],
        "boosts": [{"id": "fulfillment", "status": "opportunity", "description": "Envios Full"},
                   {"id": "shipping_collect", "status": "boosted", "description": "Envios com coleta"}],
        "winner": {"item_id": "MLB3", "price": 36.99, "boosts": [{"id": "fulfillment", "status": "boosted", "description": "Envios Full"},
                                                                 {"id": "shipping_collect", "status": "opportunity"}]}}))
    c = monitor.catalogo(real, "MLB5")
    assert c["preco_para_ganhar"] is None and c["vantagens_vencedor"] == ["Envios Full"]
    assert c["motivos"] == ["baixar só o preço não basta para ganhar", "o vencedor tem envios full"]
    fora = monitor.catalogo(types.SimpleNamespace(_get=lambda *a, **k: _Resp(403, {})), "MLB2")
    assert "não devolveu" in fora["indisponivel"]


def test_perder_catalogo_e_concorrente_mudar_preco_vao_para_o_sino(client, time):
    with SessionLocal() as db:
        cliente = db.get(Cliente, time["a"])
        meu = AnuncioMonitorado(empresa_id=cliente.empresa_id, cliente_id=cliente.id, item_id="MLB10", proprio=True, apelido="Meu")
        outro = AnuncioMonitorado(empresa_id=cliente.empresa_id, cliente_id=cliente.id, item_id="MLB11", proprio=False,
                                  produto_id="MLB99", apelido="Rival")
        db.add_all([meu, outro])
        db.flush()

        def leitura(m, preco, cat=None):
            x = LeituraMonitorado(monitorado_id=m.id, preco=preco, status="active", dados={"preco": preco, "catalogo": cat or {}})
            db.add(x)
            db.flush()
            return x
        a1 = leitura(meu, 100, {"status": "winning", "ganhando": True})
        a2 = leitura(meu, 100, {"status": "competing", "ganhando": False, "motivos": ["o vencedor está no Full"], "preco_para_ganhar": 97})
        assert monitor.avisar(db, meu, cliente, a2, a1) == 2
        b1, b2 = leitura(outro, 80), leitura(outro, 70)
        assert monitor.avisar(db, outro, cliente, b2, b1) == 2
        db.commit()
        tipos = [n.tipo for n in db.query(Notificacao).filter_by(usuario_id=time["op_id"])]
        assert "catalogo_perdido" in tipos and "concorrente_preco" in tipos
        linha = monitor.mudancas([b1, b2])
        assert linha[0]["campo"] == "Preço" and linha[0]["de"] == 80 and linha[0]["para"] == 70
        assert monitor.mudancas([a1, a2])[0]["campo"] == "Catálogo"


def test_demonstracao_traz_catalogo_marcado_como_demo(client, time):
    h = {**time["op"], "X-Cliente": str(time["a"])}
    r = client.post("/api/monitor", headers=h, json={"link": "MLB123456789", "apelido": "Garrafa"})
    assert r.status_code == 200, r.text
    lista = client.get("/api/monitor", headers=h).json()
    d = lista[0]["atual"]["dados"]
    assert lista[0]["demo"] and d["catalogo"]["demo"] and "preco_minimo" in d
    hist = client.get(f"/api/monitor/{lista[0]['id']}", headers=h).json()
    assert "mudancas" in hist


def test_frete_e_avaliacoes_com_a_resposta_real_da_api():
    respostas = {"/users/7/shipping_options/free": _Resp(200, {"coverage": {"all_country": {"list_cost": 6.85}}}),
                 "/reviews/item/MLB5": _Resp(200, {"rating_average": 4.9, "paging": {"total": 9629}, "rating_levels": {"five_star": 9173}}),
                 "/reviews/item/MLB6": _Resp(403, {"message": "access denied"})}
    ad = types.SimpleNamespace(_user_id=lambda: "7", _get=lambda caminho, params=None: respostas[caminho])
    assert monitor.frete_gratis(ad, "MLB5") == 6.85
    assert monitor.avaliacoes(ad, "MLB5", "MLB1") == {"nota": 4.9, "total": 9629, "niveis": {"five_star": 9173}}
    assert monitor.avaliacoes(ad, "MLB6") is None
