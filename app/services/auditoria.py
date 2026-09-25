"""Registro de atividades: quem fez o quê, para qual cliente e quando.

É a base do Painel (quantos anúncios cada operador fez para cada cliente) e
do acompanhamento que o cliente vê. Quem chama faz o commit.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import Atividade, Usuario

ATOR_MCP = "Claude (MCP)"

# Edições seguidas do mesmo usuário no mesmo rascunho viram uma linha só.
_JANELA_EDICAO = timedelta(minutes=15)


def registrar(db: Session, empresa_id: int, acao: str, descricao: str, *, cliente_id: int | None = None,
              usuario: Usuario | None = None, anuncio_id: int | None = None, **detalhes) -> Atividade | None:
    ator = usuario.nome if usuario else ATOR_MCP
    usuario_id = usuario.id if usuario else None
    if acao == "edicao" and anuncio_id:
        ultima = (db.query(Atividade).filter_by(empresa_id=empresa_id, anuncio_id=anuncio_id, acao="edicao",
                                                usuario_id=usuario_id)
                  .order_by(Atividade.id.desc()).first())
        if ultima and _aware(ultima.criada_em) > datetime.now(timezone.utc) - _JANELA_EDICAO:
            ultima.criada_em = datetime.now(timezone.utc)
            ultima.descricao = descricao
            return ultima
    atividade = Atividade(empresa_id=empresa_id, cliente_id=cliente_id, usuario_id=usuario_id, ator=ator,
                          acao=acao, descricao=descricao, anuncio_id=anuncio_id, detalhes=detalhes)
    db.add(atividade)
    return atividade


def _aware(d: datetime) -> datetime:
    # o SQLite devolve datas sem fuso
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
