from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import AnuncioMonitorado, Cliente, LeituraEstudo, LeituraMonitorado, Venda
from app.services import monitor


def _leitura(db, m, dias_atras, preco, mediana=None, vendedores=None, **extra):
    l = LeituraMonitorado(monitorado_id=m.id, preco=preco, status="active",
                          dados={"mercado_mediana": mediana, "mercado_vendedores": vendedores},
                          lida_em=datetime.now(timezone.utc) - timedelta(days=dias_atras), **extra)
    db.add(l)
    db.flush()
    return l


def test_concorrente_com_vendas_da_extensao_mostra_alta(client, sessao):
    cid = int(sessao["X-Cliente"])
    with SessionLocal() as db:
        empresa = db.get(Cliente, cid).empresa_id
        m = AnuncioMonitorado(empresa_id=empresa, cliente_id=cid, item_id="MLB777", proprio=False, produto_id="MLB9000")
        db.add(m)
        db.flush()
        leituras = [_leitura(db, m, 12, 100, 105, 8), _leitura(db, m, 6, 100, 106, 8), _leitura(db, m, 0, 112, 115, 12)]
        hoje = datetime.now(timezone.utc)
        for dias, vendidos in ((14, 100), (8, 114), (7, 115), (0, 185)):
            quando = hoje - timedelta(days=dias)
            db.add(LeituraEstudo(empresa_id=empresa, item_id="MLB777", dia=quando.date() - timedelta(days=0), vendidos=vendidos,
                                 lida_em=quando, titulo="Concorrente"))
        db.flush()
        t = monitor.tendencia(db, m, empresa, leituras)
        db.rollback()
    sinais = {s["tipo"]: s for s in t["sinais"]}
    assert t["resumo"] == "alta" and sinais["vendas"]["sentido"] == "subindo"
    assert sinais["preco"]["sentido"] == "subindo" and sinais["vendedores"]["sentido"] == "subindo"
    assert t["fonte_vendas"] == "extensao" and not t["dica"]


def test_sem_leituras_da_extensao_pede_para_abrir_o_anuncio(client, sessao):
    cid = int(sessao["X-Cliente"])
    with SessionLocal() as db:
        empresa = db.get(Cliente, cid).empresa_id
        m = AnuncioMonitorado(empresa_id=empresa, cliente_id=cid, item_id="MLB778", proprio=False)
        db.add(m)
        db.flush()
        t = monitor.tendencia(db, m, empresa, [_leitura(db, m, 8, 50), _leitura(db, m, 0, 45)])
        db.rollback()
    assert t["resumo"] == "estavel" and "extensão" in t["dica"]
    assert {s["tipo"]: s["sentido"] for s in t["sinais"]}["preco"] == "caindo"


def test_anuncio_proprio_usa_os_pedidos(client, sessao):
    cid = int(sessao["X-Cliente"])
    with SessionLocal() as db:
        empresa = db.get(Cliente, cid).empresa_id
        m = AnuncioMonitorado(empresa_id=empresa, cliente_id=cid, item_id="MLB779", proprio=True)
        db.add(m)
        db.flush()
        agora = datetime.now(timezone.utc)
        for n, (dias, qtd) in enumerate(((10, 2), (3, 6), (1, 5))):
            db.add(Venda(empresa_id=empresa, cliente_id=cid, pedido_id=f"T{n}", item_id="MLB779", quantidade=qtd, total=qtd * 50,
                         status="paid", data_venda=agora - timedelta(days=dias)))
        db.flush()
        t = monitor.tendencia(db, m, empresa, [_leitura(db, m, 7, 50), _leitura(db, m, 0, 50)])
        db.rollback()
    assert t["resumo"] == "alta" and t["fonte_vendas"] == "pedidos"
    assert t["vendas_dia"] > t["vendas_dia_antes"]


def test_oportunidades_explicam_o_motivo_e_o_custo_maximo(client, sessao):
    r = client.get("/api/mercado/oportunidades?categorias=MLB900001&margem=20", headers=sessao)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["itens"] and d["margem_alvo"] == 20
    x = d["itens"][0]
    assert 0 <= x["oportunidade"] <= 100 and isinstance(x["motivos"], list) and "momento" in x
    assert [i["oportunidade"] for i in d["itens"]] == sorted((i["oportunidade"] for i in d["itens"]), reverse=True)
    assert client.get("/api/mercado/oportunidades?categorias=abc", headers=sessao).status_code == 422


def test_rascunhos_da_extensao_e_exclusao_em_lote(client, time):
    adm = {**time["admin"], "X-Cliente": str(time["a"])}
    ids = [client.post("/api/anuncios", headers=adm, json={"titulo": f"Rascunho {n}"}).json()["id"] for n in range(3)]
    with SessionLocal() as db:
        from app.models import Anuncio
        a = db.get(Anuncio, ids[0])
        a.origem = {"plataforma": "mercadolivre", "via": "extensao", "link": "https://produto.mercadolivre.com.br/MLB-1"}
        db.commit()
    lista = {x["id"]: x for x in client.get("/api/anuncios", headers=adm).json()}
    assert lista[ids[0]]["via"] == "extensao" and lista[ids[0]]["link_origem"].startswith("https://")
    cons = {**time["cons"], "X-Cliente": str(time["a"])}
    assert client.post("/api/anuncios/excluir", headers=cons, json={"ids": ids}).status_code == 403
    outro = {**time["admin"], "X-Cliente": str(time["b"])}
    assert client.post("/api/anuncios/excluir", headers=outro, json={"ids": ids}).json()["excluidos"] == 0
    assert client.post("/api/anuncios/excluir", headers=adm, json={"ids": ids[:2]}).json()["excluidos"] == 2
    restantes = [x["id"] for x in client.get("/api/anuncios", headers=adm).json()]
    assert ids[2] in restantes and ids[0] not in restantes and ids[1] not in restantes
