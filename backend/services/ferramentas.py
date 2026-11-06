"""Ferramentas que cada função da equipe pode usar.

Cada papel tem um conjunto padrão (o que faz sentido para a função). O admin
da empresa pode desligar ferramentas por papel em Configurações; o admin em
si sempre vê tudo, para ninguém se trancar fora. A trava vale no menu e no
servidor (as rotas da ferramenta respondem 403). Para o login de cliente,
dá ainda para desligar ferramentas de um cliente específico.
"""

from __future__ import annotations

import re

CATALOGO = [
    ("pedidos", "Pedidos de anúncio", "Anúncios"),
    ("duvidas", "Dúvidas (chat)", "Acompanhamento"),
    ("pesquisar", "Pesquisar produtos", "Anúncios"),
    ("rascunhos", "Rascunhos e edição", "Anúncios"),
    ("lotes", "Publicação em lote", "Anúncios"),
    ("publicacoes", "Publicações", "Anúncios"),
    ("full", "Estoque Full", "Anúncios"),
    ("saude", "Saúde das contas", "Acompanhamento"),
    ("perguntas", "Central de perguntas", "Acompanhamento"),
    ("monitor", "Radar de anúncios", "Anúncios"),
    ("clonador", "Clonador de anúncios", "Anúncios"),
    ("fotos", "Fotos salvas (Monvatti Pro)", "Anúncios"),
    ("promocoes", "Central de promoções", "Anúncios"),
    ("radar", "Mapeador de produtos", "Mercado"),
    ("concorrentes", "Análise de concorrentes", "Mercado"),
    ("relatorio", "Relatório do mês", "Acompanhamento"),
    ("lucro", "Vendas e lucro", "Gestão"),
    ("produtos", "Produtos e custos", "Gestão"),
    ("despesas", "Custo operacional", "Gestão"),
    ("impostos", "Impostos", "Gestão"),
    ("analise", "Analista de métricas", "Gestão"),
    ("painel", "Painel", "Configuração"),
    ("contas", "Contas do cliente", "Configuração"),
]
IDS = {k for k, _, _ in CATALOGO}
VENDAS_LUCRO = {"lucro", "produtos", "despesas", "impostos", "analise"}
PAPEIS_CONFIGURAVEIS = ("operador", "consultor", "cliente")

PADRAO = {
    "operador": IDS,
    "consultor": IDS - {"pesquisar", "contas", "clonador"},
    "cliente": {"duvidas", "rascunhos", "publicacoes", "full", "saude", "relatorio", "lucro", "produtos", "despesas", "impostos",
                "analise", "painel", "contas"},
}

ROTAS = [
    (r"^/api/pedidos", "pedidos"),
    (r"^/api/conversas", "duvidas"),
    (r"^/api/pesquisas", "pesquisar"),
    (r"^/api/anuncios/copiar$", "pesquisar"),
    (r"^/api/mercadolivre/produtos/", "pesquisar"),
    (r"^/api/mercadolivre/link$", "pesquisar"),
    (r"^/api/lotes", "lotes"),
    (r"^/api/publicacoes", "publicacoes"),
    (r"^/api/meus-anuncios", "publicacoes"),
    (r"^/api/financeiro/estoque-full", "full"),
    (r"^/api/saude", "saude"),
    (r"^/api/perguntas", "perguntas"),
    (r"^/api/clientes/\d+/perguntas/", "perguntas"),
    (r"^/api/radar$", "radar"),
    (r"^/api/mercado/", "radar"),
    (r"^/api/monitor", "monitor"),
    (r"^/api/concorrentes", "concorrentes"),
    (r"^/api/clonador", "clonador"),
    (r"^/api/fotos-salvas", "fotos"),
    (r"^/api/promocoes", "promocoes"),
    (r"^/api/anuncios/\d+/radar", "radar"),
    (r"^/api/relatorios/", "relatorio"),
    (r"^/api/financeiro/(lucro|sincronizar|simular|simulacoes|gestao|dre)", "lucro"),
    (r"^/api/financeiro/lucratividade", "produtos"),
    (r"^/api/financeiro/(produtos|custos|vinculos)", "produtos"),
    (r"^/api/financeiro/despesas", "despesas"),
    (r"^/api/financeiro/config", "impostos"),
    (r"^/api/financeiro/tributacao", "impostos"),
    (r"^/api/financeiro/analise", "analise"),
    (r"^/api/analise/", "analise"),
    (r"^/api/painel$", "painel"),
    (r"^/api/atividades$", "painel"),
]
_ROTAS = [(re.compile(p), f) for p, f in ROTAS]


def ferramenta_da_rota(caminho: str) -> str | None:
    return next((f for p, f in _ROTAS if p.search(caminho)), None)


def liberadas(papel: str, desligadas: dict | None, do_cliente: list | None = None) -> set[str]:
    if papel == "admin":
        return set(IDS)
    saida = set(PADRAO.get(papel, set())) - set((desligadas or {}).get(papel) or [])
    if papel == "cliente":
        saida -= set(do_cliente or [])
    return saida


def normalizar_cliente(lista: list | None) -> list[str]:
    return sorted({f for f in (lista or []) if f in PADRAO["cliente"]})


def normalizar(dados: dict) -> dict:
    """{papel: [ferramentas desligadas]} só com papéis e ferramentas conhecidos."""
    saida = {}
    for papel in PAPEIS_CONFIGURAVEIS:
        lista = sorted({f for f in (dados.get(papel) or []) if f in PADRAO[papel]})
        if lista:
            saida[papel] = lista
    return saida


def catalogo_dict(desligadas: dict | None) -> dict:
    return {"ferramentas": [{"id": k, "nome": n, "grupo": g} for k, n, g in CATALOGO],
            "papeis": {p: {"possiveis": sorted(PADRAO[p]), "liberadas": sorted(liberadas(p, desligadas))}
                       for p in PAPEIS_CONFIGURAVEIS}}
