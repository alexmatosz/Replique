"""Publicação em massa com travas de segurança para a conta do cliente.

Fluxo: prévia (confere tudo, não publica) → criar lote (entra na fila) → a
fila publica UM anúncio por vez, com intervalo entre publicações reais.

Travas (motivo: publicação em rajada, anúncios duplicados e sequência de
recusas são o que mais leva marketplace a pausar ou suspender conta):
- no máximo LOTE_MAX_ANUNCIOS rascunhos por lote, todos do mesmo cliente;
- LOTE_INTERVALO_S segundos entre publicações reais;
- LIMITE_DIARIO_POR_CONTA publicações reais por conta em 24 h;
- para sozinho após LOTE_PARAR_APOS_FALHAS falhas seguidas ou se a moderação
  do Mercado Livre deixar um anúncio pausado;
- pula o que já foi publicado naquela plataforma e o que parece duplicado
  (mesmo GTIN ou mesmo título já publicado no cliente, ou repetido no lote);
- tudo re-conferido na hora de publicar (o rascunho pode ter mudado).
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend import config
from backend.banco.db import SessionLocal
from backend.marketplaces.base import PLATAFORMAS
from backend.marketplaces.mercadolivre import _normalizar
from backend.marketplaces.registry import obter_adaptador
from backend.banco.models import Anuncio, Cliente, Lote, LoteItem, Publicacao, Usuario
from backend.services import replique
from backend.services.auditoria import registrar

log = logging.getLogger("replique.fila")

ATIVOS = ("na_fila", "executando")


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime | None) -> datetime | None:
    return d if d is None or d.tzinfo else d.replace(tzinfo=timezone.utc)


def _ja_publicado(db: Session, anuncio: Anuncio, plataforma: str) -> Publicacao | None:
    return (db.query(Publicacao).filter_by(anuncio_id=anuncio.id, plataforma=plataforma, sucesso=True, demo=False)
            .order_by(Publicacao.id.desc()).first())


def _duplicado(db: Session, anuncio: Anuncio, plataforma: str) -> str:
    """Outro rascunho do mesmo cliente, já publicado nesta plataforma, com o
    mesmo GTIN ou o mesmo título: publicar de novo seria anúncio duplicado."""
    titulo = _normalizar(anuncio.titulo)
    q = (db.query(Anuncio.id, Anuncio.titulo, Anuncio.gtin).join(Publicacao, Publicacao.anuncio_id == Anuncio.id)
         .filter(Anuncio.cliente_id == anuncio.cliente_id, Anuncio.id != anuncio.id, Publicacao.plataforma == plataforma,
                 Publicacao.sucesso.is_(True), Publicacao.demo.is_(False)))
    for aid, outro_titulo, gtin in q:
        if anuncio.gtin and gtin == anuncio.gtin:
            return f"mesmo GTIN ({gtin}) do rascunho #{aid}, já publicado"
        if titulo and _normalizar(outro_titulo) == titulo:
            return f"mesmo título do rascunho #{aid}, já publicado"
    return ""


def publicadas_24h(db: Session, cliente_id: int, plataforma: str) -> int:
    return (db.query(Publicacao).filter(Publicacao.cliente_id == cliente_id, Publicacao.plataforma == plataforma,
                                        Publicacao.sucesso.is_(True), Publicacao.demo.is_(False),
                                        Publicacao.criada_em >= _agora() - timedelta(hours=24)).count())


def previa(db: Session, cliente: Cliente, anuncio_ids: list[int], plataformas: list[str]) -> dict:
    """Confere o lote SEM publicar: o que está pronto, o que é bloqueado e por quê."""
    plataformas = replique.validar_plataformas(plataformas)
    ids = list(dict.fromkeys(anuncio_ids))
    if not ids:
        raise ValueError("Selecione os rascunhos do lote.")
    if len(ids) > config.LOTE_MAX_ANUNCIOS:
        raise ValueError(f"No máximo {config.LOTE_MAX_ANUNCIOS} rascunhos por lote (você selecionou {len(ids)}). "
                         "Lotes menores reduzem o risco de a conta ser bloqueada por publicação em rajada.")
    anuncios = {a.id: a for a in db.query(Anuncio).filter(Anuncio.id.in_(ids), Anuncio.excluido_em.is_(None))}
    contas = {}
    for p in plataformas:
        adaptador, aviso = obter_adaptador(db, cliente.id, p, "publicar")
        feitas = publicadas_24h(db, cliente.id, p)
        contas[p] = {"real": not adaptador.demo and not getattr(adaptador, "sem_conta", False),
                     "sem_conta": getattr(adaptador, "sem_conta", False), "aviso": aviso, "apelido": adaptador.conta_info.get("apelido", ""),
                     "publicadas_24h": feitas, "limite_24h": config.LIMITE_DIARIO_POR_CONTA,
                     "disponivel_24h": max(0, config.LIMITE_DIARIO_POR_CONTA - feitas)}
    itens, vistos = [], {p: {"gtin": set(), "titulo": set()} for p in plataformas}
    for aid in ids:
        a = anuncios.get(aid)
        if not a or a.cliente_id != cliente.id:
            itens.append({"anuncio_id": aid, "titulo": "(rascunho não encontrado neste cliente)", "plataformas": {
                p: {"situacao": "bloqueado", "erros": ["Rascunho de outro cliente ou excluído."], "avisos": []} for p in plataformas}})
            continue
        chk = replique.checar(a, plataformas)
        aprovacao = replique.bloqueio_aprovacao(db, a)
        por_plat = {}
        for p in plataformas:
            erros, avisos = list(chk[p]["erros"]), list(chk[p]["avisos"])
            if aprovacao:
                erros.insert(0, aprovacao)
            if contas[p]["sem_conta"]:
                erros.insert(0, contas[p]["aviso"])
            situacao = "pronto" if not erros else "bloqueado"
            if contas[p]["real"]:
                if (pub := _ja_publicado(db, a, p)):
                    situacao, erros = "pulado", [f"Já publicado em {PLATAFORMAS[p]} ({pub.id_externo}). Publicar de novo criaria anúncio duplicado."]
                elif (motivo := _duplicado(db, a, p)):
                    situacao, erros = "pulado", [f"Possível duplicado: {motivo}."]
            chave_titulo = _normalizar(a.titulo)
            if situacao == "pronto" and ((a.gtin and a.gtin in vistos[p]["gtin"]) or chave_titulo in vistos[p]["titulo"]):
                situacao, erros = "pulado", ["Repetido neste lote (mesmo título ou GTIN de outro rascunho selecionado)."]
            if situacao == "pronto":
                vistos[p]["titulo"].add(chave_titulo)
                if a.gtin:
                    vistos[p]["gtin"].add(a.gtin)
            por_plat[p] = {"situacao": situacao, "erros": erros, "avisos": avisos}
        itens.append({"anuncio_id": a.id, "titulo": a.titulo, "preco": a.preco, "foto": (a.fotos or [""])[0],
                      "plataformas": por_plat})
    prontos = {p: sum(1 for i in itens if i["plataformas"][p]["situacao"] == "pronto") for p in plataformas}
    alertas = [f"{PLATAFORMAS[p]}: {prontos[p]} pronto(s), mas a conta só pode publicar mais {contas[p]['disponivel_24h']} "
               f"nas próximas 24 h (limite de segurança de {config.LIMITE_DIARIO_POR_CONTA}/dia). O lote para quando chegar lá."
               for p in plataformas if contas[p]["real"] and prontos[p] > contas[p]["disponivel_24h"]]
    return {"cliente": {"id": cliente.id, "nome": cliente.nome}, "contas": contas, "itens": itens, "prontos": prontos,
            "alertas": alertas, "intervalo_s": config.LOTE_INTERVALO_S, "max_anuncios": config.LOTE_MAX_ANUNCIOS}


def criar(db: Session, cliente: Cliente, usuario: Usuario | None, anuncio_ids: list[int], plataformas: list[str],
          confirmado: bool) -> Lote:
    if any(l.status in ATIVOS for l in db.query(Lote).filter_by(cliente_id=cliente.id)):
        raise ValueError("Já existe um lote em andamento para este cliente. Espere terminar ou cancele antes de criar outro.")
    p = previa(db, cliente, anuncio_ids, plataformas)
    if any(c["real"] for c in p["contas"].values()) and not confirmado:
        raise ValueError(f"Confirme que as contas são de {cliente.nome} antes de publicar de verdade.")
    lote = Lote(empresa_id=cliente.empresa_id, cliente_id=cliente.id, usuario_id=usuario.id if usuario else None,
                plataformas=list(p["contas"]), status="na_fila", proximo_em=_agora())
    db.add(lote)
    db.flush()
    ordem = 0
    for item in p["itens"]:
        for plat, info in item["plataformas"].items():
            if info["situacao"] == "pronto":
                db.add(LoteItem(lote_id=lote.id, anuncio_id=item["anuncio_id"], plataforma=plat, ordem=ordem))
                ordem += 1
    if not ordem:
        raise ValueError("Nenhum rascunho do lote está pronto para publicar. Veja os motivos na conferência.")
    registrar(db, cliente.empresa_id, "lote", f"Colocou na fila um lote de {ordem} publicação(ões) "
              f"({', '.join(PLATAFORMAS[x] for x in lote.plataformas)})", cliente_id=cliente.id, usuario=usuario, lote_id=lote.id)
    db.commit()
    acordar_fila()
    return lote


def cancelar(db: Session, lote: Lote, usuario: Usuario | None):
    if lote.status not in ATIVOS + ("interrompido",):
        raise ValueError("Este lote já terminou.")
    lote.status, lote.motivo, lote.concluido_em = "cancelado", f"Cancelado por {usuario.nome if usuario else 'MCP'}.", _agora()
    registrar(db, lote.empresa_id, "lote", f"Cancelou o lote #{lote.id}", cliente_id=lote.cliente_id, usuario=usuario, lote_id=lote.id)
    db.commit()


def retomar(db: Session, lote: Lote, usuario: Usuario | None):
    if lote.status != "interrompido":
        raise ValueError("Só dá para retomar um lote interrompido.")
    if any(l.status in ATIVOS for l in db.query(Lote).filter(Lote.cliente_id == lote.cliente_id, Lote.id != lote.id)):
        raise ValueError("Já existe outro lote em andamento para este cliente.")
    lote.status, lote.motivo, lote.falhas_seguidas, lote.proximo_em = "na_fila", "", 0, _agora()
    registrar(db, lote.empresa_id, "lote", f"Retomou o lote #{lote.id}", cliente_id=lote.cliente_id, usuario=usuario, lote_id=lote.id)
    db.commit()
    acordar_fila()


def _parar(db: Session, lote: Lote, motivo: str):
    lote.status, lote.motivo = "interrompido", motivo
    registrar(db, lote.empresa_id, "lote", f"Lote #{lote.id} interrompido: {motivo}", cliente_id=lote.cliente_id,
              anuncio_id=None, lote_id=lote.id, usuario=db.get(Usuario, lote.usuario_id) if lote.usuario_id else None)


_RESERVA_S = 300


def _reservar(db: Session, lote: Lote, agora: datetime) -> bool:
    """UPDATE condicional: só um processo vence (o banco garante)."""
    livre = (Lote.proximo_em.is_(None)) | (Lote.proximo_em <= agora)
    feito = (db.query(Lote).filter(Lote.id == lote.id, Lote.status.in_(ATIVOS), livre)
             .update({Lote.proximo_em: agora + timedelta(seconds=_RESERVA_S)}, synchronize_session=False))
    db.commit()
    if feito:
        db.refresh(lote)
    return bool(feito)


def processar_passo(db: Session) -> bool:
    """Publica o próximo item de algum lote. Retorna True se fez algo."""
    agora = _agora()
    for lote in db.query(Lote).filter(Lote.status.in_(ATIVOS)).order_by(Lote.id):
        if _aware(lote.proximo_em) and _aware(lote.proximo_em) > agora:
            continue
        if not _reservar(db, lote, agora):
            continue
        item = (db.query(LoteItem).filter_by(lote_id=lote.id, status="pendente").order_by(LoteItem.ordem).first())
        if not item:
            lote.status, lote.concluido_em = "concluido", agora
            itens = db.query(LoteItem).filter_by(lote_id=lote.id).all()
            resumo = {s: sum(1 for i in itens if i.status == s) for s in ("publicado", "simulado", "falhou", "pulado")}
            registrar(db, lote.empresa_id, "lote", f"Lote #{lote.id} concluído: " + ", ".join(f"{v} {k}" for k, v in resumo.items() if v),
                      cliente_id=lote.cliente_id, lote_id=lote.id,
                      usuario=db.get(Usuario, lote.usuario_id) if lote.usuario_id else None)
            db.commit()
            return True
        lote.status = "executando"
        reserva = lote.proximo_em
        _processar_item(db, lote, item)
        if lote.proximo_em == reserva:
            lote.proximo_em = _agora() + timedelta(seconds=min(0.5, config.LOTE_INTERVALO_S))
        db.commit()
        return True
    return False


def _processar_item(db: Session, lote: Lote, item: LoteItem):
    usuario = db.get(Usuario, lote.usuario_id) if lote.usuario_id else None
    if usuario and not usuario.ativo:
        return _parar(db, lote, f"o acesso de {usuario.nome}, que criou o lote, foi desativado")
    cliente = db.get(Cliente, lote.cliente_id)
    if not cliente or not cliente.ativo:
        return _parar(db, lote, "o cliente foi desativado")
    item.processado_em = _agora()
    anuncio = db.get(Anuncio, item.anuncio_id)
    if not anuncio or anuncio.excluido_em or anuncio.cliente_id != lote.cliente_id:
        item.status, item.mensagem = "pulado", "Rascunho excluído ou movido."
        return
    if motivo := replique.bloqueio_aprovacao(db, anuncio):
        item.status, item.mensagem = "pulado", motivo
        return
    adaptador, _ = obter_adaptador(db, lote.cliente_id, item.plataforma, "publicar")
    real = not adaptador.demo
    if real:
        if (pub := _ja_publicado(db, anuncio, item.plataforma)):
            item.status, item.mensagem = "pulado", f"Já publicado ({pub.id_externo})."
            return
        if (motivo := _duplicado(db, anuncio, item.plataforma)):
            item.status, item.mensagem = "pulado", f"Possível duplicado: {motivo}."
            return
        if publicadas_24h(db, lote.cliente_id, item.plataforma) >= config.LIMITE_DIARIO_POR_CONTA:
            return _parar(db, lote, f"limite de segurança de {config.LIMITE_DIARIO_POR_CONTA} publicações em 24 h na conta de "
                                    f"{PLATAFORMAS[item.plataforma]} atingido. Retome amanhã.")
    try:
        pub = replique.publicar(db, anuncio, [item.plataforma], usuario)[0]
    except Exception as e:
        log.exception("Falha no lote %s", lote.id)
        pub = None
        item.status, item.mensagem = "falhou", f"Erro inesperado: {e}"
    if pub is not None:
        db.flush()
        item.publicacao_id, item.mensagem = pub.id, pub.mensagem
        pausado = item.plataforma == "mercadolivre" and pub.sucesso and not pub.demo and \
            (pub.detalhes or {}).get("status") not in (None, "active")
        item.status = ("simulado" if pub.demo else "publicado") if pub.sucesso else "falhou"
        if pausado:
            lote.falhas_seguidas = config.LOTE_PARAR_APOS_FALHAS
            return _parar(db, lote, "a moderação do Mercado Livre deixou um anúncio pausado. Corrija-o antes de continuar "
                                    "(sequência de anúncios moderados prejudica a reputação da conta).")
    if item.status == "falhou":
        lote.falhas_seguidas = (lote.falhas_seguidas or 0) + 1
        if lote.falhas_seguidas >= config.LOTE_PARAR_APOS_FALHAS:
            return _parar(db, lote, f"{lote.falhas_seguidas} falhas seguidas. Confira os rascunhos antes de retomar.")
    else:
        lote.falhas_seguidas = 0
    espera = config.LOTE_INTERVALO_S if real and item.status == "publicado" else min(0.5, config.LOTE_INTERVALO_S)
    lote.proximo_em = _agora() + timedelta(seconds=espera)


_acordar = threading.Event()
_iniciado = threading.Lock()
_thread: threading.Thread | None = None


def acordar_fila():
    _acordar.set()


def _laco():
    while True:
        try:
            with SessionLocal() as db:
                fez = processar_passo(db)
        except Exception:
            log.exception("Erro na fila de publicação")
            fez = False
        if not fez:
            _acordar.wait(timeout=2)
            _acordar.clear()


def iniciar_fila():
    """Uma thread por processo publica os lotes em sequência (o estado fica no
    banco: se o servidor reiniciar, a fila continua de onde parou)."""
    global _thread
    with _iniciado:
        if _thread is None and config.FILA_ATIVA:
            _thread = threading.Thread(target=_laco, name="fila-lotes", daemon=True)
            _thread.start()
