"""Servidor MCP: o fluxo inteiro pelas ferramentas que o Claude usa."""

import asyncio
import json

import pytest


def _chamar(mcp, nome, **args):
    resultado = asyncio.run(mcp.call_tool(nome, args))
    estruturado = getattr(resultado, "structured_content", None)
    if isinstance(estruturado, dict):
        return estruturado.get("result", estruturado) if len(estruturado) == 1 else estruturado
    itens = [json.loads(c.text) for c in resultado.content]
    return itens[0] if len(itens) == 1 and isinstance(itens[0], dict) else itens


@pytest.fixture
def mcp(client, sessao, monkeypatch):
    chave = client.post("/api/empresa/api-key", headers=sessao).json()["api_key"]
    monkeypatch.setenv("REPLIQUE_API_KEY", chave)
    import mcp_server
    return mcp_server.mcp


def test_ferramentas_expostas(mcp):
    nomes = {t.name for t in asyncio.run(mcp.list_tools())}
    assert nomes == {"listar_clientes", "status_contas", "pesquisar_mais_vendidos", "copiar_anuncio", "listar_rascunhos",
                     "ver_rascunho", "editar_rascunho", "checar_rascunho", "publicar_rascunho",
                     "validar_no_mercadolivre", "buscar_catalogo_mercadolivre", "avaliar_risco", "calcular_margem",
                     "saude_da_conta"}
    ferramentas = {t.name: t for t in asyncio.run(mcp.list_tools())}
    assert ferramentas["status_contas"].annotations.read_only_hint is True


def test_fluxo_completo_pelo_mcp(mcp):
    status = _chamar(mcp, "status_contas")
    assert len(status) == 3 and not any(s["pesquisa_real"] for s in status)

    p = _chamar(mcp, "pesquisar_mais_vendidos", termo="cadeira gamer", plataformas=["mercadolivre", "amazon"], limite=5)
    assert p["pesquisa_id"] and len(p["resultados"]) == 10 and all(r["demo"] for r in p["resultados"])

    primeiro = p["resultados"][0]
    a = _chamar(mcp, "copiar_anuncio", plataforma=primeiro["plataforma"], id_externo=primeiro["id_externo"],
                tipo=primeiro["tipo"], pesquisa_id=p["pesquisa_id"])
    a = _chamar(mcp, "editar_rascunho", anuncio_id=a["id"], titulo="Cadeira Gamer Reclinável com Apoio Lombar",
                preco=899.0, atributos={"Cor": "Preta"}, por_plataforma={"mercadolivre": {"category_id": "MLB1"}})
    assert a["preco"] == 899.0 and a["atributos"] == {"Cor": "Preta"}

    previa = _chamar(mcp, "publicar_rascunho", anuncio_id=a["id"], plataformas=["mercadolivre"])
    assert previa["publicado"] is False and "checagem" in previa

    final = _chamar(mcp, "publicar_rascunho", anuncio_id=a["id"], plataformas=["mercadolivre"], confirmar=True)
    assert final["status"] == "simulado" and final["publicacoes"][0]["demo"]
    assert any(r["id"] == a["id"] for r in _chamar(mcp, "listar_rascunhos"))


def test_chave_invalida(mcp, monkeypatch):
    monkeypatch.setenv("REPLIQUE_API_KEY", "rpq_errada")
    with pytest.raises(Exception, match="inválida"):
        _chamar(mcp, "listar_rascunhos")
