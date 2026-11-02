"""Situação e ações nos anúncios já publicados: pausar, reativar, finalizar,
excluir e mudar preço e estoque.

Mercado Livre e Shopee (a Amazon mostra só o link). O marketplace só deixa
mexer em anúncio da conta que o publicou: se a conta do cliente foi trocada
depois da publicação, a ação é recusada com a explicação.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.marketplaces.base import PLATAFORMAS, ErroMarketplace
from backend.marketplaces.registry import obter_adaptador
from backend.banco.models import Anuncio, Cliente, Publicacao, Usuario
from backend.services.auditoria import registrar

ACOES = {
    "pausar": ("paused", "Pausou"),
    "reativar": ("active", "Reativou"),
    "finalizar": ("closed", "Finalizou"),
    "excluir": ("deleted", "Excluiu"),
}
PERMITIDAS = {
    "mercadolivre": {
        "active": {"pausar", "finalizar", "excluir"},
        "paused": {"reativar", "finalizar", "excluir"},
        "under_review": {"finalizar", "excluir"},
        "inactive": {"finalizar", "excluir"},
        "closed": {"excluir"},
        "deleted": set(),
    },
    "shopee": {
        "active": {"pausar", "excluir"},
        "paused": {"reativar", "excluir"},
        "under_review": {"excluir"},
        "inactive": {"excluir"},
        "deleted": set(),
    },
}
GERENCIAVEIS = tuple(PERMITIDAS)
EDITA_PRECO = {"active", "paused", "under_review", "inactive"}


def _no(plataforma: str) -> str:
    return f"{'no' if plataforma == 'mercadolivre' else 'na'} {PLATAFORMAS.get(plataforma, plataforma)}"


def _acoes(plataforma: str, status: str | None) -> list[str]:
    return sorted(PERMITIDAS.get(plataforma, {}).get(status, set()))


def outra_conta(pub: Publicacao, apelido_atual: str) -> str:
    quando = pub.criada_em.strftime("%d/%m/%Y") if pub.criada_em else ""
    if pub.conta_apelido:
        quem = f"pela conta {pub.conta_apelido}"
    else:
        quem = "por uma conta que o Replique não registrou (o anúncio é de antes de guardarmos quem publicou)"
    quando = f" em {quando}" if quando else ""
    if pub.plataforma == "shopee":
        return (f"A Shopee não encontrou o anúncio {pub.id_externo} na loja conectada agora "
                f"({apelido_atual or 'outra'}). Ele foi publicado {quem}{quando}. A Shopee só deixa ler, pausar ou "
                "mudar o preço com a loja dona do anúncio. Se ele foi apagado na Shopee, use \"Tirar da lista\" "
                "em Publicações; se não, reconecte em Contas a loja que publicou.")
    return (f"O Mercado Livre recusou o acesso (403) ao anúncio {pub.id_externo}, publicado {quem}"
            f"{quando}. A conta conectada agora é {apelido_atual or 'outra'}, e o ML só deixa "
            "ler, pausar ou mudar o preço com a conta dona do anúncio. Se o anúncio foi apagado no ML, use "
            "\"Tirar da lista\" em Publicações; se não, reconecte em Contas a conta que publicou.")


def _eh_403(e: ErroMarketplace) -> bool:
    return (e.detalhes or {}).get("status") == 403 or "forbidden" in e.mensagem.lower()


def removida(pub: Publicacao) -> bool:
    return bool((pub.detalhes or {}).get("removida_em"))


def tirar_da_lista(db: Session, pub: Publicacao, motivo: str, usuario: Usuario | None = None) -> None:
    """Esconde a publicação (o anúncio não existe mais no marketplace ou não
    interessa acompanhar) e, se o rascunho não tiver outro anúncio no ar, ele
    volta para "Em preparo" para poder ser publicado de novo."""
    from datetime import datetime, timezone
    pub.detalhes = {**(pub.detalhes or {}), "removida_em": datetime.now(timezone.utc).isoformat(), "motivo_remocao": motivo}
    anuncio = db.get(Anuncio, pub.anuncio_id) if pub.anuncio_id else None
    if anuncio:
        outras = [p for p in db.query(Publicacao).filter(Publicacao.anuncio_id == anuncio.id, Publicacao.sucesso.is_(True),
                                                         Publicacao.id != pub.id) if not removida(p)]
        if not outras and anuncio.status in ("publicado", "parcial", "simulado"):
            anuncio.status = "rascunho"
    if usuario:
        registrar(db, pub.empresa_id, "publicacao", f"Tirou da lista de publicações o anúncio {pub.id_externo or pub.id} ({motivo})",
                  cliente_id=pub.cliente_id, usuario=usuario, anuncio_id=pub.anuncio_id)


def situacoes(db: Session, cliente: Cliente) -> dict[int, dict]:
    """{publicacao_id: {status, acoes, aviso, ...}} das publicações de sucesso no ML e na Shopee."""
    pubs = (db.query(Publicacao).filter(Publicacao.cliente_id == cliente.id, Publicacao.plataforma.in_(GERENCIAVEIS),
                                        Publicacao.sucesso.is_(True)).order_by(Publicacao.id.desc()).limit(300).all())
    pubs = [p for p in pubs if not removida(p)]
    saida: dict[int, dict] = {}
    for plataforma in GERENCIAVEIS:
        da_plataforma = [p for p in pubs if p.plataforma == plataforma]
        if da_plataforma:
            saida.update(_situacoes_da_plataforma(db, cliente, plataforma, da_plataforma))
    db.commit()
    return saida


def _sem_conta(adaptador) -> bool:
    return bool(adaptador.demo or getattr(adaptador, "sem_conta", False))


def _conecte(plataforma: str) -> str:
    return f"Conecte a conta {'do' if plataforma == 'mercadolivre' else 'da'} {PLATAFORMAS[plataforma]} deste cliente"


def _situacoes_da_plataforma(db: Session, cliente: Cliente, plataforma: str, pubs: list[Publicacao]) -> dict[int, dict]:
    adaptador, _ = obter_adaptador(db, cliente.id, plataforma, "publicar")
    apelido = (getattr(adaptador, "conta_info", None) or {}).get("apelido", "")
    reais = [p for p in pubs if not p.demo and p.id_externo]
    ao_vivo, falha = {}, ""
    if reais and not _sem_conta(adaptador):
        try:
            ao_vivo = adaptador.situacao_itens(list(dict.fromkeys(p.id_externo for p in reais)))
        except ErroMarketplace as e:
            falha = e.mensagem
    saida = {}
    for p in pubs:
        if p.demo:
            d = p.detalhes or {}
            status = d.get("status_local", "active")
            saida[p.id] = {"status": status, "acoes": _acoes(plataforma, status), "simulado": True, "aviso": "",
                           "edita_preco": status in EDITA_PRECO, "preco": d.get("preco_local"),
                           "estoque": d.get("estoque_local")}
            continue
        if _sem_conta(adaptador):
            saida[p.id] = {"status": None, "acoes": [], "aviso": _conecte(plataforma) + " para gerenciar."}
            continue
        info = ao_vivo.get(p.id_externo)
        if falha or not info:
            saida[p.id] = {"status": None, "acoes": [],
                           "aviso": falha or f"{'O' if plataforma == 'mercadolivre' else 'A'} {PLATAFORMAS[plataforma]} "
                                             "não informou a situação."}
        elif not info["acessivel"]:
            saida[p.id] = {"status": None, "acoes": [], "outra_conta": True, "aviso": outra_conta(p, apelido)}
        elif info["status"] == "deleted" or "deleted" in (info.get("sub_status") or []):
            tirar_da_lista(db, p, f"excluído {_no(plataforma)}")
            saida[p.id] = {"status": "deleted", "acoes": [], "aviso": "", "removida": True}
        else:
            status = info["status"]
            extra = {k: info.get(k) for k in ("preco", "estoque", "vendidos", "full", "frete_gratis", "tipo", "catalogo",
                                              "link", "variacoes")}
            saida[p.id] = {"status": status, "sub_status": info["sub_status"], "acoes": _acoes(plataforma, status),
                           "edita_preco": status in EDITA_PRECO, "aviso": "", **extra}
    return saida


def _conferir_gerenciavel(pub: Publicacao):
    if pub.plataforma not in GERENCIAVEIS or not pub.sucesso:
        raise ValueError("Por enquanto dá para gerenciar só anúncios publicados no Mercado Livre e na Shopee.")


def _adaptador_real(db: Session, pub: Publicacao):
    adaptador, _ = obter_adaptador(db, pub.cliente_id, pub.plataforma, "publicar")
    if _sem_conta(adaptador):
        raise ValueError(_conecte(pub.plataforma) + " em Contas.")
    return adaptador


def _chamar(pub: Publicacao, adaptador, funcao, *args):
    try:
        return funcao(*args)
    except ErroMarketplace as e:
        if _eh_403(e):
            raise ValueError(outra_conta(pub, adaptador.conta_info.get("apelido", ""))) from e
        raise ValueError(e.mensagem) from e


def executar(db: Session, pub: Publicacao, acao: str, usuario: Usuario | None) -> dict:
    if acao not in ACOES:
        raise ValueError("Ação desconhecida.")
    _conferir_gerenciavel(pub)
    novo, verbo = ACOES[acao]
    permitidas = PERMITIDAS[pub.plataforma]
    if acao not in set().union(*permitidas.values()):
        raise ValueError(f"Não dá para {acao} um anúncio {_no(pub.plataforma)}.")
    titulo = (db.get(Anuncio, pub.anuncio_id).titulo if pub.anuncio_id else "") or pub.id_externo
    if pub.demo:
        atual = (pub.detalhes or {}).get("status_local", "active")
        if acao not in permitidas.get(atual, set()):
            raise ValueError(f"Não dá para {acao} um anúncio nesta situação.")
        pub.detalhes = {**(pub.detalhes or {}), "status_local": novo}
        simulado = True
    else:
        adaptador = _adaptador_real(db, pub)
        if acao == "excluir":
            _chamar(pub, adaptador, adaptador.excluir, pub.id_externo)
        else:
            _chamar(pub, adaptador, adaptador.alterar_status, pub.id_externo, novo)
        pub.detalhes = {**(pub.detalhes or {}), "status": novo}
        simulado = False
    registrar(db, pub.empresa_id, "publicacao",
              f"{'Simulou: ' if simulado else ''}{verbo} o anúncio “{titulo}” {_no(pub.plataforma)} ({pub.id_externo})",
              cliente_id=pub.cliente_id, usuario=usuario, anuncio_id=pub.anuncio_id, plataforma=pub.plataforma,
              id_externo=pub.id_externo, acao_anuncio=acao)
    db.commit()
    return {"ok": True, "status": novo, "simulado": simulado}


def alterar_preco_estoque(db: Session, pub: Publicacao, preco: float | None, estoque: int | None,
                          usuario: Usuario | None) -> dict:
    """Muda o preço e/ou o estoque do anúncio direto no marketplace."""
    _conferir_gerenciavel(pub)
    if preco is None and estoque is None:
        raise ValueError("Informe o novo preço ou o novo estoque.")
    if preco is not None and preco <= 0:
        raise ValueError("O preço precisa ser maior que zero.")
    if estoque is not None and estoque < 0:
        raise ValueError("O estoque não pode ser negativo.")
    titulo = (db.get(Anuncio, pub.anuncio_id).titulo if pub.anuncio_id else "") or pub.id_externo
    if pub.demo:
        novos = {k: v for k, v in (("preco_local", preco), ("estoque_local", estoque)) if v is not None}
        pub.detalhes = {**(pub.detalhes or {}), **novos}
        simulado = True
    else:
        adaptador = _adaptador_real(db, pub)
        if preco is not None:
            _chamar(pub, adaptador, adaptador.atualizar_preco, pub.id_externo, float(preco))
        if estoque is not None:
            _chamar(pub, adaptador, adaptador.atualizar_estoque, pub.id_externo, int(estoque))
        simulado = False
    partes = ([f"o preço para R$ {preco:.2f}".replace(".", ",")] if preco is not None else []) + \
             ([f"o estoque para {estoque}"] if estoque is not None else [])
    registrar(db, pub.empresa_id, "publicacao",
              f"{'Simulou: ' if simulado else ''}Mudou {' e '.join(partes)} do anúncio “{titulo}” "
              f"{_no(pub.plataforma)} ({pub.id_externo})",
              cliente_id=pub.cliente_id, usuario=usuario, anuncio_id=pub.anuncio_id, plataforma=pub.plataforma,
              id_externo=pub.id_externo)
    db.commit()
    return {"ok": True, "preco": preco, "estoque": estoque, "simulado": simulado}
