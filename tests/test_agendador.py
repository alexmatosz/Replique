"""Agendador: reserva no banco, falhas sem derrubar, avisos e a rota de verificação."""

import types
from datetime import datetime, timedelta, timezone

from app import config
from app.db import SessionLocal
from app.models import Cliente, ContaMarketplace, Notificacao, TarefaAgendada
from app.services import agendador


def _zerar(db, nome):
    agendador._registro(db, nome)
    db.query(TarefaAgendada).filter_by(nome=nome).update({TarefaAgendada.proxima_em: None, TarefaAgendada.reservada_ate: None,
                                                          TarefaAgendada.falhas_seguidas: 0})
    db.commit()


def test_so_um_processo_reserva_e_a_proxima_fica_para_depois(monkeypatch):
    chamadas = []
    monkeypatch.setitem(agendador.TAREFAS, "pedidos", lambda db: chamadas.append(1) or "ok")
    with SessionLocal() as db:
        _zerar(db, "pedidos")
        agora = datetime.now(timezone.utc)
        assert agendador.reservar(db, "pedidos", agora)
        assert not agendador.reservar(db, "pedidos", agora)
        db.query(TarefaAgendada).filter_by(nome="pedidos").update({TarefaAgendada.reservada_ate: None})
        db.commit()
        assert agendador.executar(db, "pedidos") and chamadas == [1]
        assert not agendador.executar(db, "pedidos")
        t = db.query(TarefaAgendada).filter_by(nome="pedidos").first()
        assert agendador._aware(t.proxima_em) > datetime.now(timezone.utc) + timedelta(minutes=config.AGENDA_PEDIDOS_MIN - 1)


def test_falha_e_registrada_e_tenta_de_novo(monkeypatch):
    def quebra(db):
        raise RuntimeError("API fora do ar")
    monkeypatch.setitem(agendador.TAREFAS, "saude", quebra)
    with SessionLocal() as db:
        _zerar(db, "saude")
        assert agendador.executar(db, "saude")
        t = db.query(TarefaAgendada).filter_by(nome="saude").first()
        assert t.falhas_seguidas == 1 and "fora do ar" in t.ultimo_erro and t.reservada_ate is None and t.proxima_em


def test_cliente_falhando_tres_vezes_avisa_a_equipe(client, time):
    with SessionLocal() as db:
        cliente = db.get(Cliente, time["a"])
        for _ in range(3):
            agendador.guardar(db, "perguntas", cliente, erro="token expirado")
        assert db.query(Notificacao).filter_by(tipo="agendador_falha", usuario_id=time["op_id"]).count() == 1
        agendador.guardar(db, "perguntas", cliente, {"perguntas": []})
        assert agendador.leitura(db, "perguntas", cliente.id).falhas_seguidas == 0
    s = client.get(f"/api/agendador/situacao?cliente_id={time['a']}", headers=time["op"]).json()
    assert s["cliente"]["perguntas"]["erro"] == "" and "perguntas" in s["tarefas"]
    assert client.get(f"/api/agendador/situacao?cliente_id={time['b']}", headers=time["op"]).status_code == 403


def test_tarefas_diarias_tem_hora_marcada():
    agora = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)
    prox = agendador.proxima_execucao("vendas_madrugada", agora).astimezone(agendador.FUSO)
    assert prox.hour == config.AGENDA_MADRUGADA_HORA and prox.date().isoformat() == "2026-10-24"
    assert agendador.proxima_execucao("perguntas", agora) == agora + timedelta(minutes=config.AGENDA_PERGUNTAS_MIN)


def test_vendas_so_para_cliente_liberado(client, time):
    with SessionLocal() as db:
        for cid, liberado in ((time["a"], True), (time["b"], False)):
            c = db.get(Cliente, cid)
            c.vendas_lucro = liberado
            db.add(ContaMarketplace(empresa_id=c.empresa_id, cliente_id=cid, plataforma="shopee", apelido="loja",
                                    credenciais_cript="", ativa=True))
        db.commit()
        ids = {c.id for c in agendador._clientes(db, "shopee", vendas=True)}
    assert time["a"] in ids and time["b"] not in ids


def test_ping_executa_no_maximo_uma_tarefa(client, monkeypatch):
    feitas = []
    monkeypatch.setattr(agendador, "executar_pendentes", lambda limite=None: feitas.append(limite) or [])
    r = client.get("/api/ping")
    assert r.status_code == 200 and r.json()["ok"] and feitas == [1]


def test_limite_por_hora_adia_o_cliente(monkeypatch):
    from app.api.limites import Limitador
    monkeypatch.setattr(agendador, "_limite_hora", Limitador(2, 3600, "x"))
    assert agendador.dentro_do_limite(999) and agendador.dentro_do_limite(999)
    assert not agendador.dentro_do_limite(999) and agendador.dentro_do_limite(998)
    feitos = []
    resumo = agendador._por_cliente(None, "perguntas", [types.SimpleNamespace(id=999)], lambda c: feitos.append(c))
    assert feitos == [] and "próximo ciclo" in resumo
