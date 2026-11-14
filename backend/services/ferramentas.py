"""Ferramentas que cada função da equipe pode usar.

Três camadas: o desenvolvedor (e-mail em config.DESENVOLVEDORES) vê tudo e
escolhe o que os administradores de todas as empresas recebem; o admin da
empresa escolhe, dentro disso, o que operador, consultor e cliente usam; e
dá ainda para desligar ferramentas de um cliente específico. Ferramenta nova
(NOVAS) nasce só para o desenvolvedor: ele testa, libera para os admins, e o
admin liga para as outras funções. A trava vale no menu e no servidor (as
rotas da ferramenta respondem 403).
"""

from __future__ import annotations

import re
import time

from backend import config

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
NOVAS: set[str] = set()
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


CHAVE_ADMIN = "ferramentas_admin"
_cache_admin: dict = {"em": 0.0, "valor": None}


def eh_desenvolvedor(usuario) -> bool:
    return bool(usuario) and (getattr(usuario, "email", "") or "").strip().lower() in config.DESENVOLVEDORES


def padrao_admin() -> set[str]:
    return set(IDS) - NOVAS


def do_admin(dados: dict | None) -> set[str]:
    """Ferramentas que os administradores recebem. Sem ajuste salvo, todas menos as
    novas. Com ajuste salvo, só as da lista: ferramenta criada depois fica fora."""
    lista = (dados or {}).get("liberadas")
    return padrao_admin() if lista is None else set(lista) & set(IDS)


def ferramentas_do_admin() -> set[str]:
    """Lê o ajuste global (guardado por poucos segundos para não ir ao banco a cada pedido)."""
    if _cache_admin["valor"] is None or time.monotonic() - _cache_admin["em"] > 5:
        from backend.banco.db import SessionLocal
        from backend.banco.models import AjusteSistema
        with SessionLocal() as db:
            a = db.get(AjusteSistema, CHAVE_ADMIN)
            _cache_admin.update(valor=do_admin(a.dados if a else None), em=time.monotonic())
    return set(_cache_admin["valor"])


def salvar_do_admin(db, lista: list[str]) -> set[str]:
    from backend.banco.models import AjusteSistema
    novas = sorted(set(lista) & set(IDS))
    a = db.get(AjusteSistema, CHAVE_ADMIN)
    if not a:
        a = AjusteSistema(chave=CHAVE_ADMIN, dados={})
        db.add(a)
    a.dados = {"liberadas": novas}
    _cache_admin["valor"] = None
    return set(novas)


def liberadas(papel: str, desligadas: dict | None, do_cliente: list | None = None, dev: bool = False,
              admin: set[str] | None = None) -> set[str]:
    """O desenvolvedor vê tudo. O administrador vê o que o desenvolvedor liberou para
    os administradores. As outras funções veem o que o administrador liberou para elas,
    sempre dentro do que o administrador tem. Ferramenta nova nasce desligada."""
    if dev:
        return set(IDS)
    do_adm = ferramentas_do_admin() if admin is None else admin
    if papel == "admin":
        return do_adm
    d = desligadas or {}
    ligadas = set(((d.get("ligadas") or {}).get(papel)) or [])
    saida = (set(PADRAO.get(papel, set())) - NOVAS - set(d.get(papel) or [])) | (ligadas & NOVAS & set(PADRAO.get(papel, set())))
    if papel == "cliente":
        saida -= set(do_cliente or [])
    return saida & do_adm


def liberadas_do_usuario(usuario, loja=None) -> set[str]:
    return liberadas(usuario.papel, usuario.empresa.ferramentas_off, loja.ferramentas_off if loja else None,
                     dev=eh_desenvolvedor(usuario))


def normalizar_cliente(lista: list | None) -> list[str]:
    return sorted({f for f in (lista or []) if f in PADRAO["cliente"]})


def normalizar(liberadas_por_papel: dict, anterior: dict | None, visiveis: set[str]) -> dict:
    """Guarda o que cada função tem a partir do que veio marcado na tela. Só mexe nas
    ferramentas que quem salvou enxerga; as outras ficam como estavam."""
    anterior = anterior or {}
    saida: dict = {}
    ligadas_ant = anterior.get("ligadas") or {}
    ligadas: dict = {}
    for papel in PAPEIS_CONFIGURAVEIS:
        possiveis = set(PADRAO[papel])
        marcadas = set(liberadas_por_papel.get(papel) or []) & possiveis
        mexe = possiveis & visiveis
        off = (set(anterior.get(papel) or []) - mexe) | ((mexe - NOVAS) - marcadas)
        lig = (set(ligadas_ant.get(papel) or []) - mexe) | (marcadas & mexe & NOVAS)
        if off & possiveis:
            saida[papel] = sorted(off & possiveis)
        if lig:
            ligadas[papel] = sorted(lig)
    if ligadas:
        saida["ligadas"] = ligadas
    return saida


def catalogo_dict(desligadas: dict | None, dev: bool = False) -> dict:
    do_adm = ferramentas_do_admin()
    visiveis = set(IDS) if dev else do_adm
    saida = {"ferramentas": [{"id": k, "nome": n, "grupo": g, "nova": k in NOVAS, "do_admin": k in do_adm}
                             for k, n, g in CATALOGO if k in visiveis],
             "papeis": {p: {"possiveis": sorted(set(PADRAO[p]) & visiveis),
                            "liberadas": sorted(liberadas(p, desligadas, admin=set(IDS) if dev else do_adm) & visiveis)}
                        for p in PAPEIS_CONFIGURAVEIS},
             "desenvolvedor": dev}
    if dev:
        saida["admin"] = {"possiveis": sorted(IDS), "liberadas": sorted(do_adm)}
    return saida
