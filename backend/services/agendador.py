"""Atualização automática em segundo plano.

Cada tarefa roda de tempos em tempos (intervalo configurável por variável de
ambiente) para todos os clientes ativos com a conta conectada. Regras:
- com vários processos, só um executa cada tarefa: a reserva é um UPDATE
  condicional na tabela `tarefas_agendadas` (o banco garante);
- falha não derruba nada: é registrada, a tarefa tenta de novo no próximo
  ciclo e, depois de 3 falhas seguidas no mesmo cliente, a equipe é avisada;
- cada cliente com conta só gasta chamadas no que está ligado para ele
  (vendas só para quem tem o módulo Vendas e Lucro liberado);
- a renovação de token usa a mesma trava das telas (os adaptadores do registry).
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend import config
from backend.banco.db import SessionLocal
from backend.banco.models import Anuncio, AnuncioMonitorado, Cliente, ContaMarketplace, LeituraAutomatica, LeituraMonitorado, Publicacao, TarefaAgendada

log = logging.getLogger("replique.agendador")
FUSO = ZoneInfo("America/Sao_Paulo")
RESERVA = timedelta(minutes=20)
FALHAS_PARA_AVISAR = 3

NOMES = {"perguntas": "Perguntas do Mercado Livre", "radar_anuncios": "Radar de anúncios", "concorrentes": "Concorrentes monitorados",
         "vendas": "Vendas e financeiro", "vendas_madrugada": "Fechamento do dia (vendas)", "saude": "Saúde das contas",
         "full": "Estoque Full", "relatorio": "Relatório do mês", "pedidos": "Prazos dos pedidos",
         "promocoes": "Central de promoções", "novidades": "Novidades dos marketplaces", "lentidao": "Relatório de respostas lentas"}


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime | None) -> datetime | None:
    return d.replace(tzinfo=timezone.utc) if d and d.tzinfo is None else d


def intervalos() -> dict[str, int]:
    """Minutos entre execuções. Tarefas diárias têm hora marcada (ver proxima_execucao)."""
    return {"perguntas": config.AGENDA_PERGUNTAS_MIN, "radar_anuncios": config.AGENDA_RADAR_MIN,
            "concorrentes": config.AGENDA_CONCORRENTES_MIN, "vendas": config.AGENDA_VENDAS_MIN,
            "vendas_madrugada": 24 * 60, "saude": config.AGENDA_SAUDE_MIN, "full": 24 * 60, "relatorio": 24 * 60,
            "pedidos": config.AGENDA_PEDIDOS_MIN, "promocoes": config.AGENDA_PROMOCOES_MIN, "novidades": 24 * 60, "lentidao": 24 * 60}


def proxima_execucao(nome: str, agora: datetime) -> datetime:
    local = agora.astimezone(FUSO)
    if nome in ("vendas_madrugada", "full", "relatorio", "lentidao"):
        hora = {"vendas_madrugada": config.AGENDA_MADRUGADA_HORA, "full": config.AGENDA_FULL_HORA,
                "relatorio": config.AGENDA_RELATORIO_HORA, "lentidao": config.LATENCIA_RELATORIO_HORA}[nome]
        alvo = local.replace(hour=hora, minute=0, second=0, microsecond=0)
        if alvo <= local:
            alvo += timedelta(days=1)
        return alvo.astimezone(timezone.utc)
    return agora + timedelta(minutes=max(1, intervalos()[nome]))


def _clientes(db: Session, plataforma: str = "mercadolivre", vendas: bool = False) -> list[Cliente]:
    ids = {cid for (cid,) in db.query(ContaMarketplace.cliente_id).filter(
        ContaMarketplace.plataforma == plataforma, ContaMarketplace.ativa.is_(True), ContaMarketplace.cliente_id.isnot(None))}
    q = db.query(Cliente).filter(Cliente.ativo.is_(True), Cliente.id.in_(ids or {0}))
    if vendas:
        q = q.filter(Cliente.vendas_lucro.is_(True))
    return q.order_by(Cliente.id).limit(config.AGENDADOR_MAX_CLIENTES).all()


def guardar(db: Session, tarefa: str, cliente: Cliente, dados: dict | None = None, erro: str = "", chave: str = "") -> LeituraAutomatica:
    l = db.query(LeituraAutomatica).filter_by(tarefa=tarefa, cliente_id=cliente.id, chave=chave).first()
    if not l:
        l = LeituraAutomatica(tarefa=tarefa, cliente_id=cliente.id, chave=chave, dados={}, falhas_seguidas=0)
        db.add(l)
    if erro:
        l.erro, l.falhas_seguidas = erro[:2000], (l.falhas_seguidas or 0) + 1
        if l.falhas_seguidas == FALHAS_PARA_AVISAR:
            from backend.services import notificacoes
            notificacoes.notificar(db, cliente, "agendador_falha", f"{NOMES.get(tarefa, tarefa)} falhando: {cliente.nome}",
                                   f"{FALHAS_PARA_AVISAR} tentativas seguidas sem sucesso. Último erro: {erro[:200]}",
                                   chave=f"agendador-{tarefa}-{cliente.id}-{_agora():%Y%m%d}")
    else:
        l.dados, l.erro, l.falhas_seguidas, l.lida_em = dados or {}, "", 0, _agora()
    db.commit()
    return l


def leitura(db: Session, tarefa: str, cliente_id: int, chave: str = "") -> LeituraAutomatica | None:
    return db.query(LeituraAutomatica).filter_by(tarefa=tarefa, cliente_id=cliente_id, chave=chave).first()


_limite_hora = None


def _limitador():
    """Mesmo mecanismo dos limites por hora das telas (api/limites.py), com a
    chave do cliente: o agendador não passa de AGENDADOR_LEITURAS_HORA leituras
    por cliente em uma hora (padrão igual ao LIMITE_PESQUISAS_HORA)."""
    global _limite_hora
    if _limite_hora is None:
        from backend.api.limites import Limitador
        _limite_hora = Limitador(config.AGENDADOR_LEITURAS_HORA, 3600, "limite de {minutos} min")
    return _limite_hora


def dentro_do_limite(cliente_id: int) -> bool:
    from fastapi import HTTPException
    chave = f"agendador:c:{cliente_id}"
    try:
        _limitador().conferir(chave)
    except HTTPException:
        return False
    _limitador().registrar(chave)
    return True


def _por_cliente(db: Session, tarefa: str, clientes: list[Cliente], fazer) -> str:
    feitos, erros, adiados = 0, 0, 0
    for c in clientes:
        if not dentro_do_limite(c.id):
            adiados += 1
            continue
        try:
            dados = fazer(c) or {}
            guardar(db, tarefa, c, dados)
            feitos += 1
        except Exception as e:
            db.rollback()
            log.warning("Tarefa %s falhou no cliente %s: %s", tarefa, c.id, e)
            guardar(db, tarefa, c, erro=str(e) or e.__class__.__name__)
            erros += 1
    return (f"{feitos} cliente(s) atualizado(s)" + (f", {erros} com erro" if erros else "")
            + (f", {adiados} deixado(s) para o próximo ciclo pelo limite por hora" if adiados else ""))


def _perguntas(db: Session) -> str:
    from backend.services import perguntas

    def fazer(c):
        return {"perguntas": perguntas.listar(db, c)["perguntas"]}
    return _por_cliente(db, "perguntas", _clientes(db), fazer)


def _ler_monitorados(db: Session, tarefa: str, proprios: bool) -> str:
    from backend.services import monitor, radar

    limite = _agora() - timedelta(minutes=intervalos()[tarefa] - 1)

    def fazer(c):
        lidos = 0
        for m in db.query(AnuncioMonitorado).filter_by(cliente_id=c.id, proprio=proprios).order_by(AnuncioMonitorado.id):
            ultima = db.query(LeituraMonitorado.lida_em).filter_by(monitorado_id=m.id).order_by(LeituraMonitorado.id.desc()).first()
            if ultima and _aware(ultima[0]) > limite:
                continue
            if lidos >= config.AGENDADOR_MAX_ITENS:
                break
            monitor.ler(db, m, c)
            lidos += 1
        if proprios:
            publicados = db.query(Publicacao.anuncio_id).filter(
                Publicacao.cliente_id == c.id, Publicacao.plataforma == "mercadolivre", Publicacao.sucesso.is_(True),
                Publicacao.demo.is_(False))
            pubs = (db.query(Anuncio).filter(Anuncio.id.in_(publicados), Anuncio.excluido_em.is_(None))
                    .order_by(Anuncio.id).limit(config.AGENDADOR_MAX_ITENS).all())
            for a in pubs:
                radar.atualizar(db, a)
                lidos += 1
        return {"lidos": lidos}
    return _por_cliente(db, tarefa, _clientes(db), fazer)


def _vendas(db: Session, meses: list[str] | None = None) -> str:
    from backend.services import financeiro
    hoje = datetime.now(FUSO).date()
    meses = meses or [hoje.strftime("%Y-%m")]
    resumo = []
    for plataforma in ("mercadolivre", "shopee", "amazon"):
        def fazer(c, plataforma=plataforma):
            for mes in meses:
                financeiro.sincronizar(db, c, mes, plataforma)
            return {"meses": meses}
        clientes = _clientes(db, plataforma, vendas=True)
        if clientes:
            resumo.append(f"{plataforma}: " + _por_cliente(db, f"vendas_{plataforma}", clientes, fazer))
    return "; ".join(resumo) or "nenhum cliente com Vendas e Lucro liberado e conta conectada"


def _vendas_madrugada(db: Session) -> str:
    hoje = datetime.now(FUSO).date()
    meses = [hoje.strftime("%Y-%m")]
    if hoje.day <= 3:
        meses.insert(0, (hoje.replace(day=1) - timedelta(days=1)).strftime("%Y-%m"))
    return _vendas(db, meses)


def _saude(db: Session) -> str:
    from backend.services import notificacoes, saude

    def fazer(c):
        ml = saude.coletar(db, c)
        shopee = saude.ultimas(db, [c.id], "shopee").get(c.id)
        nivel = saude.do_cliente(db, c, ml, shopee)["nivel"]
        if nivel in ("critico", "atencao"):
            notificacoes.notificar(db, c, "saude_risco", f"Saúde da conta {'crítica' if nivel == 'critico' else 'em atenção'}: {c.nome}",
                                   "; ".join((ml.dados or {}).get("alertas", [])[:3]), "#/saude",
                                   chave=f"saude-{c.id}-{nivel}-{date.today().isoformat()}")
        return {"nivel": nivel}
    return _por_cliente(db, "saude", _clientes(db), fazer)


def _full(db: Session) -> str:
    from backend.services import estoque_full, notificacoes

    def fazer(c):
        p = estoque_full.painel(db, c)
        velhos = [x for x in p["itens"] if (x.get("idade_dias") or 0) >= config.FULL_DIAS_ALERTA and (x.get("total") or 0)]
        for x in velhos:
            notificacoes.notificar(db, c, "full_parado", f"Full parado há {x['idade_dias']} dias: {c.nome}",
                                   f"{x.get('titulo') or x.get('item_id')}: {x.get('total')} unidade(s). Confira se ainda vale manter no Full.",
                                   "#/full", chave=f"full-{c.id}-{x.get('inventory_id')}-{x.get('entrada_mais_antiga')}", demo=p["demo"])
        return {"itens": len(p["itens"]), "parados": len(velhos)}
    return _por_cliente(db, "full", _clientes(db), fazer)


def _relatorio(db: Session) -> str:
    """No dia 1, monta o relatório do mês que fechou para cada cliente ativo."""
    from backend.services import notificacoes, relatorio
    hoje = datetime.now(FUSO).date()
    if hoje.day != 1:
        return "fora do dia 1"
    mes = (hoje - timedelta(days=1)).strftime("%Y-%m")
    feitos = 0
    for c in db.query(Cliente).filter(Cliente.ativo.is_(True)).limit(config.AGENDADOR_MAX_CLIENTES):
        if leitura(db, "relatorio", c.id, mes):
            continue
        try:
            r = relatorio.montar(db, c, mes)
            guardar(db, "relatorio", c, {"numeros": r["numeros"], "mes": mes}, chave=mes)
            notificacoes.notificar(db, c, "relatorio_mes", f"Relatório de {mes[5:]}/{mes[:4]} pronto: {c.nome}",
                                   "Confira e envie ao cliente.", f"#/acompanhamento/{mes}", chave=f"relatorio-{c.id}-{mes}")
            db.commit()
            feitos += 1
        except Exception as e:
            db.rollback()
            guardar(db, "relatorio", c, erro=str(e), chave=mes)
    return f"{feitos} relatório(s) de {mes}"


def _pedidos(db: Session) -> str:
    from backend.services import pedidos
    return f"{pedidos.verificar_prazos(db)} aviso(s)"


def _promocoes(db: Session) -> str:
    """Lê a Central de promoções dos clientes com a leitura mais velha que PROMOCOES_IDADE_MIN, os mais
    atrasados primeiro e no máximo PROMOCOES_CLIENTES_POR_CICLO por rodada (no Vercel cada chamada tem
    tempo limite, então a carteira é lida aos poucos). A leitura grava os próprios dados; aqui só se
    registra a falha, sem apagar a última leitura boa."""
    from backend.banco.models import ConfigPromocoes
    from backend.services import promocoes
    desligados = {cid for (cid,) in db.query(ConfigPromocoes.cliente_id).filter(ConfigPromocoes.ativo.is_(False))}
    ultimas = {cid: _aware(lida) for cid, lida in db.query(LeituraAutomatica.cliente_id, LeituraAutomatica.lida_em)
               .filter(LeituraAutomatica.tarefa == "promocoes", LeituraAutomatica.chave == "")}
    limite = _agora() - timedelta(minutes=config.PROMOCOES_IDADE_MIN)
    antigo = datetime.min.replace(tzinfo=timezone.utc)
    fila = sorted((c for c in _clientes(db) if c.id not in desligados and (ultimas.get(c.id) or antigo) <= limite),
                  key=lambda c: ultimas.get(c.id) or antigo)
    feitos, erros, adiados = 0, 0, 0
    for c in fila[:max(1, config.PROMOCOES_CLIENTES_POR_CICLO)]:
        if not dentro_do_limite(c.id):
            adiados += 1
            continue
        try:
            promocoes.ler(db, c)
            feitos += 1
        except Exception as e:
            db.rollback()
            log.warning("Tarefa promocoes falhou no cliente %s: %s", c.id, e)
            guardar(db, "promocoes", c, erro=str(e) or e.__class__.__name__)
            erros += 1
    resto = max(0, len(fila) - max(1, config.PROMOCOES_CLIENTES_POR_CICLO))
    return (f"{feitos} cliente(s) lido(s)" + (f", {erros} com erro" if erros else "")
            + (f", {adiados} deixado(s) para o próximo ciclo pelo limite por hora" if adiados else "")
            + (f", {resto} na fila para as próximas rodadas" if resto else ""))


def _novidades(db: Session) -> str:
    from backend.services import novidades
    r = novidades.verificar(db)
    return f"{r['novas']} novidade(s)" + (f"; {' '.join(r['avisos'])}" if r["avisos"] else "")


def _lentidao(db: Session) -> str:
    """Uma vez por dia, manda o relatório das respostas que passaram do limite (e-mail/WhatsApp)."""
    from backend.services import latencia
    r = latencia.enviar_relatorio()
    if not r["total"]:
        return "nenhuma resposta lenta hoje"
    destinos = ", ".join(r.get("por") or []) or "guardado (sem e-mail/WhatsApp configurado)"
    return f"{r['total']} resposta(s) lenta(s); relatório: {destinos}" + (f"; falhas: {'; '.join(r['falhas'])}" if r.get("falhas") else "")


TAREFAS = {"perguntas": _perguntas, "radar_anuncios": lambda db: _ler_monitorados(db, "radar_anuncios", True),
           "concorrentes": lambda db: _ler_monitorados(db, "concorrentes", False), "vendas": _vendas,
           "vendas_madrugada": _vendas_madrugada, "saude": _saude, "full": _full, "relatorio": _relatorio, "pedidos": _pedidos,
           "promocoes": _promocoes, "novidades": _novidades, "lentidao": _lentidao}


def _registro(db: Session, nome: str) -> TarefaAgendada:
    t = db.query(TarefaAgendada).filter_by(nome=nome).first()
    if not t:
        t = TarefaAgendada(nome=nome, proxima_em=None, falhas_seguidas=0)
        db.add(t)
        try:
            db.commit()
        except Exception:
            db.rollback()
            t = db.query(TarefaAgendada).filter_by(nome=nome).first()
    return t


def reservar(db: Session, nome: str, agora: datetime) -> bool:
    """UPDATE condicional: só um processo vence."""
    _registro(db, nome)
    feito = (db.query(TarefaAgendada)
             .filter(TarefaAgendada.nome == nome,
                     or_(TarefaAgendada.proxima_em.is_(None), TarefaAgendada.proxima_em <= agora),
                     or_(TarefaAgendada.reservada_ate.is_(None), TarefaAgendada.reservada_ate <= agora))
             .update({TarefaAgendada.reservada_ate: agora + RESERVA}, synchronize_session=False))
    db.commit()
    return bool(feito)


def executar(db: Session, nome: str, agora: datetime | None = None) -> bool:
    """Roda a tarefa se estiver na hora e a reserva for deste processo."""
    agora = agora or _agora()
    if not reservar(db, nome, agora):
        return False
    t = db.query(TarefaAgendada).filter_by(nome=nome).first()
    try:
        t.resumo = TAREFAS[nome](db)[:500]
        t.ultima_ok_em, t.falhas_seguidas, t.ultimo_erro = _agora(), 0, ""
    except Exception as e:
        db.rollback()
        t = db.query(TarefaAgendada).filter_by(nome=nome).first()
        log.exception("Tarefa automática %s falhou", nome)
        t.ultima_falha_em, t.falhas_seguidas, t.ultimo_erro = _agora(), (t.falhas_seguidas or 0) + 1, str(e)[:2000]
    t.proxima_em, t.reservada_ate = proxima_execucao(nome, _agora()), None
    db.commit()
    return True


def executar_pendentes(limite: int | None = None) -> list[str]:
    feitas = []
    with SessionLocal() as db:
        for nome in TAREFAS:
            if limite is not None and len(feitas) >= limite:
                break
            try:
                if executar(db, nome):
                    feitas.append(nome)
            except Exception:
                db.rollback()
                log.exception("Agendador: erro ao reservar %s", nome)
    return feitas


def situacao(db: Session, cliente_id: int | None = None) -> dict:
    agora = _agora()
    tarefas = {t.nome: t for t in db.query(TarefaAgendada)}
    saida = {}
    for nome in TAREFAS:
        t = tarefas.get(nome)
        saida[nome] = {"nome": NOMES[nome], "intervalo_min": intervalos()[nome],
                       "ultima_ok_em": t.ultima_ok_em if t else None, "proxima_em": t.proxima_em if t else None,
                       "falhas_seguidas": t.falhas_seguidas if t else 0, "ultimo_erro": t.ultimo_erro if t else "",
                       "resumo": t.resumo if t else ""}
    por_cliente = {}
    if cliente_id:
        for l in db.query(LeituraAutomatica).filter(LeituraAutomatica.cliente_id == cliente_id, LeituraAutomatica.chave == ""):
            por_cliente[l.tarefa] = {"lida_em": l.lida_em if l.dados or not l.erro else None, "erro": l.erro,
                                     "falhas_seguidas": l.falhas_seguidas, "falhando": (l.falhas_seguidas or 0) >= FALHAS_PARA_AVISAR}
    return {"ativo": config.AGENDADOR_ATIVO, "agora": agora, "tarefas": saida, "cliente": por_cliente}


_acordar = threading.Event()
_trava = threading.Lock()
_thread: threading.Thread | None = None


def _laco():
    while True:
        try:
            executar_pendentes()
        except Exception:
            log.exception("Agendador parou um ciclo")
        _acordar.wait(timeout=config.AGENDADOR_CICLO_S)
        _acordar.clear()


def iniciar():
    """Uma thread por processo. Sem AGENDADOR_ATIVO, nada roda sozinho (a rota
    /api/ping ainda pode disparar uma tarefa vencida por vez)."""
    global _thread
    with _trava:
        if _thread is None and config.AGENDADOR_ATIVO:
            _thread = threading.Thread(target=_laco, name="agendador", daemon=True)
            _thread.start()
