"""Agente de métricas: achados sobre lucro, Ads, margem e queda de vendas."""

from backend.services import analista
from tests.test_financeiro import MES, _pedido, _produto, _simples_zero, ml  # noqa: F401


def _totais(**kw):
    base = dict(total=0, pedidos=0, unidades=0, ticket_medio=0, lucro=0, ads_total=0, ads_sem_venda=0, margem=0,
                tacos=0, roas=None, despesas=0, resultado=0, margem_resultado=0, devolucoes=0, sem_vinculo=0,
                sem_custo=0, faturamento_incompleto=0)
    return {**base, **kw}


def _prod(chave, total, lucro, ads=0, unidades=3, **kw):
    return {"chave": chave, "titulo": f"Produto {chave}", "item_id": f"MLB{chave}", "sku": chave, "total": total,
            "lucro": lucro, "ads": ads, "margem": round(lucro / total * 100, 1) if total else 0, "unidades": unidades,
            "sem_vinculo": False, "sem_custo": False, **kw}


def _tipos(lista):
    return {a["tipo"] for a in lista}


def test_sem_vendas_pede_sincronizar():
    lista = analista.achados({"totais": _totais(), "por_produto": []}, None)
    assert _tipos(lista) == {"sem_dados"}


def test_separa_prejuizo_causado_pelo_ads_do_estrutural():
    produtos = [_prod("A", 500, -20, ads=60), _prod("B", 300, -40, ads=10), _prod("C", 1000, 300)]
    atual = {"totais": _totais(total=1800, pedidos=20, lucro=240, ads_total=70, tacos=3.9), "por_produto": produtos}
    lista = analista.achados(atual, None)
    por_tipo = {a["tipo"]: a for a in lista}
    assert [i["titulo"] for i in por_tipo["ads_prejuizo"]["itens"]] == ["Produto A"]
    assert por_tipo["ads_prejuizo"]["itens"][0]["lucro_sem_ads"] == 40
    assert [i["titulo"] for i in por_tipo["prejuizo"]["itens"]] == ["Produto B"]
    assert por_tipo["campeoes"]["itens"][0]["titulo"] == "Produto C"
    assert lista[0]["nivel"] == "vermelho" and lista[-1]["nivel"] == "verde"


def test_tacos_alto_dados_incompletos_e_produto_que_esfriou():
    atual = {"totais": _totais(total=1000, pedidos=10, lucro=50, ads_total=200, tacos=20.0, roas=3.2, sem_custo=3,
                               faturamento_incompleto=400),
             "por_produto": [_prod("A", 900, 80), _prod("B", 100, -30, sem_custo=True)]}
    anterior = {"totais": _totais(total=3000, pedidos=30, lucro=600),
                "por_produto": [_prod("A", 1000, 200), _prod("Z", 2000, 400)]}
    lista = analista.achados(atual, anterior)
    tipos = _tipos(lista)
    assert {"tacos", "dados", "queda", "queda_lucro", "produto_esfriou"} <= tipos
    assert "prejuizo" not in tipos
    esfriou = next(a for a in lista if a["tipo"] == "produto_esfriou")
    assert [i["titulo"] for i in esfriou["itens"]] == ["Produto Z"]
    assert "ROAS de 3.2" in next(a for a in lista if a["tipo"] == "tacos")["texto"]


def test_analise_pela_api_usa_vendas_e_ads_reais(client, sessao, ml):  # noqa: F811
    _simples_zero(client, sessao)
    _produto(client, sessao, nome="Caro", sku="CARO", custo=70)
    ml([_pedido(1, [("MLB1", "CARO", 1, 100, 16)], envio=""), _pedido(2, [("MLB1", "CARO", 1, 100, 16)], envio="")],
       ads=[{"data": "2026-09-10", "item_id": "MLB1", "custo": 40, "receita": 200, "unidades": 2}])
    client.post(f"/api/financeiro/sincronizar?mes={MES}", headers=sessao)
    r = client.get(f"/api/financeiro/analise?mes={MES}", headers=sessao)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["indicadores"]["lucro_antes_ads"] == 28 and d["indicadores"]["lucro"] == -12
    assert any(a["tipo"] == "ads_prejuizo" for a in d["achados"])
    assert d["resumo"]["fonte"] == "regras" and d["resumo"]["prioridades"]

    c = client.get(f"/api/analise/carteira?mes={MES}", headers=sessao)
    assert c.status_code == 200, c.text
    linha = next(x for x in c.json() if x["indicadores"]["pedidos"])
    assert linha["vermelhos"] >= 1 and linha["principal"]


def test_lojista_ve_a_propria_analise_mas_nao_a_carteira(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    email = novo_email("loja")
    client.post(f"/api/clientes/{sessao['X-Cliente']}/logins", headers=admin,
                json={"nome": "Loja", "email": email, "senha": "senha-forte-123"})
    token = client.post("/api/auth/login", json={"email": email, "senha": "senha-forte-123"}).json()["token"]
    loja = {"Authorization": "Bearer " + token}
    assert client.get(f"/api/financeiro/analise?mes={MES}", headers=loja).status_code == 200
    assert client.get(f"/api/analise/carteira?mes={MES}", headers=loja).status_code == 403
