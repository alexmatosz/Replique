"""Situação e ações nos anúncios já publicados: pausar, reativar, finalizar e excluir.

Por enquanto no Mercado Livre (Shopee e Amazon mostram só o link). O ML só
deixa mexer em anúncio da conta que o publicou: se a conta do cliente foi
trocada depois da publicação, a ação é recusada com a explicação.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.marketplaces.base import ErroMarketplace
from app.marketplaces.registry import obter_adaptador
from app.models import Anuncio, Cliente, Publicacao, Usuario
from app.services.auditoria import registrar

ACOES = {  # ação: (status no ML, verbo para o registro)
    "pausar": ("paused", "Pausou"),
    "reativar": ("active", "Reativou"),
    "finalizar": ("closed", "Finalizou"),
    "excluir": ("deleted", "Excluiu"),
}
PERMITIDAS = {  # a partir de cada situação
    "active": {"pausar", "finalizar", "excluir"},
    "paused": {"reativar", "finalizar", "excluir"},
    "under_review": {"finalizar", "excluir"},
    "inactive": {"finalizar", "excluir"},
    "closed": {"excluir"},
    "deleted": set(),
}


def outra_conta(pub: Publicacao, apelido_atual: str) -> str:
    quem = f" ({pub.conta_apelido})" if pub.conta_apelido else ""
    return (f"O Mercado Livre não deixa a conta conectada agora ({apelido_atual or 'deste cliente'}) mexer no anúncio "
            f"{pub.id_externo}: ele foi publicado por outra conta de vendedor{quem}. Para pausar, excluir ou acompanhar o "
            "preço, reconecte em Contas a conta que publicou, ou publique de novo nesta conta.")


def _eh_403(e: ErroMarketplace) -> bool:
    return (e.detalhes or {}).get("status") == 403 or "forbidden" in e.mensagem.lower()


def situacoes(db: Session, cliente: Cliente) -> dict[int, dict]:
    """{publicacao_id: {status, acoes, aviso}} das publicações de sucesso no ML."""
    pubs = (db.query(Publicacao).filter(Publicacao.cliente_id == cliente.id, Publicacao.plataforma == "mercadolivre",
                                        Publicacao.sucesso.is_(True)).order_by(Publicacao.id.desc()).limit(200).all())
    if not pubs:
        return {}
    adaptador, _ = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    apelido = adaptador.conta_info.get("apelido", "")
    reais = [p for p in pubs if not p.demo and p.id_externo]
    ao_vivo, falha = {}, ""
    if reais and not adaptador.demo:
        try:
            ao_vivo = adaptador.situacao_itens(list(dict.fromkeys(p.id_externo for p in reais)))
        except ErroMarketplace as e:
            falha = e.mensagem
    saida = {}
    for p in pubs:
        if p.demo:
            status = (p.detalhes or {}).get("status_local", "active")
            saida[p.id] = {"status": status, "acoes": sorted(PERMITIDAS.get(status, set())), "simulado": True, "aviso": ""}
            continue
        if adaptador.demo:
            saida[p.id] = {"status": None, "acoes": [], "aviso": "Conecte a conta do Mercado Livre deste cliente para gerenciar."}
            continue
        info = ao_vivo.get(p.id_externo)
        if falha or not info:
            saida[p.id] = {"status": None, "acoes": [], "aviso": falha or "O Mercado Livre não informou a situação."}
        elif not info["acessivel"]:
            saida[p.id] = {"status": None, "acoes": [], "outra_conta": True, "aviso": outra_conta(p, apelido)}
        else:
            status = info["status"]
            saida[p.id] = {"status": status, "sub_status": info["sub_status"], "acoes": sorted(PERMITIDAS.get(status, set())),
                           "aviso": ""}
    return saida


def executar(db: Session, pub: Publicacao, acao: str, usuario: Usuario | None) -> dict:
    if acao not in ACOES:
        raise ValueError("Ação desconhecida.")
    if pub.plataforma != "mercadolivre" or not pub.sucesso:
        raise ValueError("Por enquanto dá para gerenciar só anúncios publicados no Mercado Livre.")
    novo, verbo = ACOES[acao]
    titulo = (db.get(Anuncio, pub.anuncio_id).titulo if pub.anuncio_id else "") or pub.id_externo
    if pub.demo:
        atual = (pub.detalhes or {}).get("status_local", "active")
        if acao not in PERMITIDAS.get(atual, set()):
            raise ValueError(f"Não dá para {acao} um anúncio nesta situação.")
        pub.detalhes = {**(pub.detalhes or {}), "status_local": novo}
        simulado = True
    else:
        adaptador, _ = obter_adaptador(db, pub.cliente_id, "mercadolivre", "publicar")
        if adaptador.demo:
            raise ValueError("Conecte a conta do Mercado Livre deste cliente em Contas.")
        try:
            if acao == "excluir":
                adaptador.excluir(pub.id_externo)
            else:
                adaptador.alterar_status(pub.id_externo, novo)
        except ErroMarketplace as e:
            if _eh_403(e):
                raise ValueError(outra_conta(pub, adaptador.conta_info.get("apelido", ""))) from e
            raise ValueError(e.mensagem) from e
        pub.detalhes = {**(pub.detalhes or {}), "status": novo}
        simulado = False
    registrar(db, pub.empresa_id, "publicacao",
              f"{'Simulou: ' if simulado else ''}{verbo} o anúncio “{titulo}” no Mercado Livre ({pub.id_externo})",
              cliente_id=pub.cliente_id, usuario=usuario, anuncio_id=pub.anuncio_id, plataforma="mercadolivre",
              id_externo=pub.id_externo, acao_anuncio=acao)
    db.commit()
    return {"ok": True, "status": novo, "simulado": simulado}
