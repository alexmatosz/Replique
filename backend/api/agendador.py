"""Situação da atualização automática e a rota leve de verificação (/api/ping)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import exigir_admin, usuario_atual
from backend.banco.db import get_db
from backend.banco.models import TarefaAgendada, Usuario
from backend.services import acesso, agendador

router = APIRouter(prefix="/api", tags=["agendador"])


@router.get("/ping", include_in_schema=False)
def ping():
    """Rota leve para um serviço externo manter o servidor acordado. Se o
    agendador não roda sozinho (hospedagem que dorme), cada acesso executa no
    máximo uma tarefa que já estava vencida; acessos repetidos não geram
    chamadas a mais, porque cada tarefa só roda quando chega a hora dela."""
    feitas = []
    if config.AGENDADOR_NO_PING and not agendador._thread:
        feitas = agendador.executar_pendentes(limite=1)
    return {"ok": True, "agora": datetime.now(timezone.utc).isoformat(), "executou": feitas}


@router.get("/agendador/situacao")
def situacao(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if usuario.papel == "cliente":
        cliente_id = usuario.cliente_id
    elif cliente_id and not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(403, "Você não tem acesso a este cliente.")
    s = agendador.situacao(db, cliente_id)
    if usuario.papel != "admin":
        for t in s["tarefas"].values():
            t["ultimo_erro"] = "falhando" if t["ultimo_erro"] else ""
    return s


@router.post("/agendador/{nome}/agora")
def rodar_agora(nome: str, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    """Antecipa a próxima execução da tarefa (roda no próximo ciclo do agendador)."""
    if nome not in agendador.TAREFAS:
        raise HTTPException(404, "Tarefa desconhecida.")
    agendador._registro(db, nome)
    db.query(TarefaAgendada).filter_by(nome=nome).update({TarefaAgendada.proxima_em: datetime.now(timezone.utc)})
    db.commit()
    agendador._acordar.set()
    return {"ok": True}
