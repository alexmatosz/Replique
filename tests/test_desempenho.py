"""Cache de leitura, single-flight e monitor de lentidão (parte do skillteste)."""

import threading
import time

from backend import config
from backend.services import cache_leitura, latencia


def test_segunda_chamada_igual_vem_do_cache(client, sessao):
    cache_leitura.cache.limpar()
    r1 = client.get("/api/novidades", headers=sessao)
    assert r1.status_code == 200 and r1.headers.get("X-Cache") != "HIT"
    r2 = client.get("/api/novidades", headers=sessao)
    assert r2.status_code == 200 and r2.headers.get("X-Cache") == "HIT"
    assert r1.content == r2.content


def test_cache_nao_vaza_entre_usuarios(client, empresa_nova):
    cache_leitura.cache.limpar()
    a = empresa_nova("Loja A")
    b = empresa_nova("Loja B")
    ra = client.get("/api/novidades", headers=a)
    rb = client.get("/api/novidades", headers=b)
    assert ra.status_code == rb.status_code == 200
    # cada sessão tem a própria chave: a de B nunca é marcada HIT por causa da de A
    assert rb.headers.get("X-Cache") != "HIT"


def test_resumo_pesado_calcula_uma_vez_para_chamadas_simultaneas(monkeypatch):
    # single-flight na camada de dados: muitas telas pedindo o mesmo (cliente, mês) ao
    # mesmo tempo viram um cálculo só (o banco não responde a mesma pergunta mil vezes).
    from backend.services import financeiro
    chamadas = {"n": 0}

    def calcular_lento(db, cliente, mes):
        chamadas["n"] += 1
        time.sleep(0.4)
        return {"marca": f"{cliente.id}-{mes}"}

    monkeypatch.setattr(financeiro, "_resumo_calcular", calcular_lento)
    cliente = type("C", (), {"id": 777})()
    resultados = []

    def bater():
        resultados.append(financeiro.resumo(None, cliente, "2026-01"))

    fios = [threading.Thread(target=bater) for _ in range(10)]
    for f in fios:
        f.start()
    for f in fios:
        f.join()
    assert all(r == {"marca": "777-2026-01"} for r in resultados)
    assert chamadas["n"] <= 2  # as 10 simultâneas compartilharam o cálculo


def test_rota_que_grava_nao_entra_no_cache(client, sessao):
    cache_leitura.cache.limpar()
    r = client.post("/api/clientes", headers=sessao, json={"nome": "Não cacheável"})
    assert r.status_code == 200 and r.headers.get("X-Cache") != "HIT"


def test_gravar_na_sessao_invalida_o_cache_dela(client, sessao):
    cache_leitura.cache.limpar()
    assert client.get("/api/novidades", headers=sessao).headers.get("X-Cache") != "HIT"
    assert client.get("/api/novidades", headers=sessao).headers.get("X-Cache") == "HIT"
    client.post("/api/clientes", headers=sessao, json={"nome": "Nova loja"})  # qualquer escrita da sessão
    assert client.get("/api/novidades", headers=sessao).headers.get("X-Cache") != "HIT"


def test_monitor_anota_resposta_lenta_e_monta_relatorio(monkeypatch):
    monkeypatch.setattr(config, "LATENCIA_LIMITE_S", 2.0)
    latencia._carregar("2000-01-01")  # dia vazio isolado
    monkeypatch.setattr(latencia, "_hoje", lambda: "2000-01-01")
    latencia.registrar("/api/financeiro/gestao/2026-01", "GET", 3200, 200)
    latencia.registrar("/api/anuncios/12345", "GET", 2500, 200)
    r = latencia.relatorio("2000-01-01")
    assert r["total"] == 2 and r["piores"][0]["ms"] == 3200
    rotas = dict(r["por_rota"])
    assert "/api/anuncios/{id}" in rotas  # ids agrupados
    assert "3.2s" in latencia.texto_relatorio(r)


def test_relatorio_so_envia_quando_ha_lentidao(monkeypatch):
    monkeypatch.setattr(latencia, "_hoje", lambda: "2000-01-02")
    latencia._carregar("2000-01-02")
    assert latencia.enviar_relatorio("2000-01-02")["enviado"] is False
