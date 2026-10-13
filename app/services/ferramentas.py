"""Ferramentas que cada função da equipe pode usar.

Cada papel tem um conjunto padrão (o que faz sentido para a função). O admin
da empresa pode desligar ferramentas por papel em Configurações; o admin em
si sempre vê tudo, para ninguém se trancar fora. A trava vale no menu e no
servidor (as rotas da ferramenta respondem 403).
"""

from __future__ import annotations

import re

CATALOGO = [
    ("pesquisar", "Pesquisar produtos", "Anúncios"),
    ("rascunhos", "Rascunhos e edição", "Anúncios"),
    ("lotes", "Publicação em lote", "Anúncios"),
    ("publicacoes", "Publicações", "Anúncios"),
    ("full", "Estoque Full", "Anúncios"),
    ("saude", "Saúde das contas", "Acompanhamento"),
    ("perguntas", "Central de perguntas", "Acompanhamento"),
    ("radar", "Radar de preço", "Acompanhamento"),
    ("relatorio", "Relatório do mês", "Acompanhamento"),
    ("lucro", "Vendas e lucro", "Financeiro"),
    ("produtos", "Produtos e custos", "Financeiro"),
    ("despesas", "Custo operacional", "Financeiro"),
    ("impostos", "Impostos", "Financeiro"),
    ("analise", "Analista de métricas", "Financeiro"),
    ("painel", "Painel", "Gestão"),
    ("contas", "Contas do cliente", "Gestão"),
]
IDS = {k for k, _, _ in CATALOGO}
PAPEIS_CONFIGURAVEIS = ("operador", "consultor", "cliente")

PADRAO = {
    "operador": IDS,
    "consultor": IDS - {"pesquisar", "contas"},
    "cliente": {"rascunhos", "publicacoes", "full", "saude", "relatorio", "lucro", "produtos", "despesas", "impostos",
                "analise", "painel", "contas"},
}

ROTAS = [
    (r"^/api/pesquisas", "pesquisar"),
    (r"^/api/anuncios/copiar$", "pesquisar"),
    (r"^/api/mercadolivre/produtos/", "pesquisar"),
    (r"^/api/mercadolivre/link$", "pesquisar"),
    (r"^/api/lotes", "lotes"),
    (r"^/api/publicacoes", "publicacoes"),
    (r"^/api/financeiro/estoque-full", "full"),
    (r"^/api/saude", "saude"),
    (r"^/api/perguntas", "perguntas"),
    (r"^/api/clientes/\d+/perguntas/", "perguntas"),
    (r"^/api/radar$", "radar"),
    (r"^/api/anuncios/\d+/radar", "radar"),
    (r"^/api/relatorios/", "relatorio"),
    (r"^/api/financeiro/(lucro|sincronizar|simular|simulacoes)", "lucro"),
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


def liberadas(papel: str, desligadas: dict | None) -> set[str]:
    if papel == "admin":
        return set(IDS)
    return set(PADRAO.get(papel, set())) - set((desligadas or {}).get(papel) or [])


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
