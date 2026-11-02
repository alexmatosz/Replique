"""Pedidos de anúncio (consultor → operador), notificações e a saída de projetos e tarefas."""

from datetime import date, datetime, timedelta, timezone

from backend.banco.db import SessionLocal
from backend.banco.models import Notificacao, PedidoAnuncio, Tarefa
from backend.services import pedidos


def _pedido(client, h, cliente_id, operador_id, **extra):
    corpo = {"cliente_id": cliente_id, "marketplaces": ["mercadolivre"], "produto_texto": "Garrafa térmica 1 litro\ninox",
             "quantidade": 1, "legenda": "**Use** fotos próprias\n- título com a capacidade", "operador_id": operador_id, **extra}
    return client.post("/api/pedidos", headers=h, json=corpo)


def test_projetos_e_tarefas_sairam_mas_as_tabelas_ficam(client, time):
    for rota in ("/api/projetos", "/api/tarefas", "/api/reunioes", "/api/acompanhamento"):
        assert client.get(rota, headers=time["admin"]).status_code == 404
    with SessionLocal() as db:
        assert db.query(Tarefa).count() >= 0


def test_consultor_pede_operador_comeca_e_publicar_fecha(client, time):
    r = _pedido(client, time["cons"], time["a"], time["op_id"], prazo=(date.today() + timedelta(days=3)).isoformat())
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    assert r.json()["status"] == "pendente" and r.json()["operador"] == "Olga Operadora"
    aviso = client.get("/api/notificacoes", headers=time["op"]).json()
    assert aviso["nao_lidas"] == 1 and aviso["itens"][0]["link"] == f"#/pedidos/{pid}"
    assert [x["id"] for x in client.get("/api/pedidos?meus=true", headers=time["op"]).json()] == [pid]
    assert client.post(f"/api/pedidos/{pid}/comecar", headers=time["cons"]).status_code == 403
    r = client.post(f"/api/pedidos/{pid}/comecar", headers=time["op"])
    assert r.status_code == 200, r.text
    anuncio_id = r.json()["anuncio_id"]
    assert r.json()["pedido"]["status"] == "andamento"
    op = {**time["op"], "X-Cliente": str(time["a"])}
    rasc = client.get(f"/api/anuncios/{anuncio_id}", headers=op).json()
    assert rasc["titulo"] == "Garrafa térmica 1 litro"
    r = client.patch(f"/api/anuncios/{anuncio_id}", headers=op, json={
        "preco": 89.9, "estoque": 5, "fotos": ["https://exemplo.com/f.jpg"], "peso_kg": 0.5,
        "por_plataforma": {"mercadolivre": {"category_id": "MLB1234"}}})
    assert r.status_code == 200, r.text
    assert client.post(f"/api/pedidos/{pid}/pronto", headers=time["op"]).json()["status"] == "rascunho_pronto"
    pub = client.post(f"/api/anuncios/{anuncio_id}/publicar", headers=op, json={"plataformas": ["mercadolivre"]})
    assert pub.json()["status"] == "simulado", pub.text
    final = client.get(f"/api/pedidos/{pid}", headers=time["cons"]).json()
    assert final["status"] == "publicado" and final["concluido_em"]
    acoes = [a["descricao"] for a in client.get(f"/api/atividades?cliente_id={time['a']}", headers=time["admin"]).json()]
    assert any("Pedido #" in a and "concluído" in a for a in acoes)


def test_isolamento_e_papeis(client, time):
    assert _pedido(client, time["op"], time["a"], time["op_id"]).status_code == 403
    assert _pedido(client, time["cons"], time["b"], time["op_b_id"]).status_code in (400, 403)
    assert _pedido(client, time["cons"], time["a"], time["op_b_id"]).status_code == 400
    assert _pedido(client, time["cons"], time["a"], time["op_id"], produto_texto="", produto_link="").status_code == 400
    pid = _pedido(client, time["cons"], time["a"], time["op_id"]).json()["id"]
    assert client.get(f"/api/pedidos/{pid}", headers=time["op_b"]).status_code == 404
    assert client.get("/api/pedidos", headers=time["loja"]).status_code == 403
    assert client.post(f"/api/pedidos/{pid}/comecar", headers=time["op_b"]).status_code == 404
    ops = client.get(f"/api/pedidos/operadores?cliente_id={time['a']}", headers=time["cons"]).json()
    assert "Olga Operadora" in [o["nome"] for o in ops] and "Beto Operador" not in [o["nome"] for o in ops]


def test_atrasado_e_parado_avisam_operador_e_consultor(client, time):
    pid = _pedido(client, time["cons"], time["a"], time["op_id"], prazo=(date.today() - timedelta(days=1)).isoformat()).json()["id"]
    with SessionLocal() as db:
        assert pedidos.verificar_prazos(db) == 2
        assert pedidos.verificar_prazos(db) == 0
        p2 = PedidoAnuncio(empresa_id=db.get(PedidoAnuncio, pid).empresa_id, cliente_id=time["a"], criado_por_id=time["cons_id"],
                           operador_id=time["op_id"], marketplaces=["mercadolivre"], produto_texto="x",
                           movimentado_em=datetime.now(timezone.utc) - timedelta(days=10))
        db.add(p2)
        db.commit()
        assert pedidos.verificar_prazos(db) == 2
        tipos = {n.tipo for n in db.query(Notificacao).filter(Notificacao.usuario_id == time["op_id"])}
    assert {"pedido_atrasado", "pedido_parado"} <= tipos
    painel = client.get("/api/pedidos/painel", headers=time["cons"]).json()
    assert painel["totais"]["atrasados"] == 1 and painel["por_operador"][0]["nome"] == "Olga Operadora"
    marcadas = client.post("/api/notificacoes/lidas", headers=time["op"], json={"ids": None}).json()
    assert marcadas["nao_lidas"] == 0


def test_link_do_ml_vira_copia_no_modo_demonstracao(client, time):
    pid = _pedido(client, time["cons"], time["a"], time["op_id"], produto_texto="",
                  produto_link="https://www.mercadolivre.com.br/garrafa/p/MLB123456789").json()["id"]
    r = client.post(f"/api/pedidos/{pid}/comecar", headers=time["op"]).json()
    op = {**time["op"], "X-Cliente": str(time["a"])}
    rasc = client.get(f"/api/anuncios/{r['anuncio_id']}", headers=op).json()
    assert rasc["origem"]["plataforma"] == "mercadolivre" and rasc["titulo"]


def test_visao_geral_conta_pedidos(client, time):
    _pedido(client, time["cons"], time["a"], time["op_id"], prazo="2020-01-01")
    geral = client.get("/api/visao-geral", headers=time["admin"]).json()
    assert geral["totais"]["pedidos_atrasados"] == 1 and {c["nome"] for c in geral["clientes"]} == {"Cliente A", "Cliente B"}
    op = client.get("/api/visao-geral", headers=time["op"]).json()
    assert len(op["meus_pedidos"]) == 1 and [c["nome"] for c in op["clientes"]] == ["Cliente A"]
    assert client.get("/api/visao-geral", headers=time["loja"]).status_code == 403
    assert client.get(f"/api/pendencias?cliente_id={time['a']}", headers=time["op"]).json()["pedidos"] == 1
