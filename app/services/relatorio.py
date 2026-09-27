"""Relatório mensal de um cliente: o que a equipe fez, o que foi publicado e
como está a conta. A tela monta a página e o navegador salva em PDF."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.marketplaces.base import PLATAFORMAS
from app.models import Anuncio, Atividade, Cliente, Lote, Publicacao
from app.services import saude


def periodo(mes: str) -> tuple[datetime, datetime]:
    try:
        inicio = datetime.strptime(mes, "%Y-%m").replace(tzinfo=timezone.utc)
    except ValueError as e:
        raise ValueError("Mês inválido. Use o formato AAAA-MM.") from e
    fim = inicio.replace(year=inicio.year + (inicio.month == 12), month=inicio.month % 12 + 1)
    return inicio, fim


def montar(db: Session, cliente: Cliente, mes: str) -> dict:
    inicio, fim = periodo(mes)
    pubs = (db.query(Publicacao, Anuncio.titulo).join(Anuncio, Anuncio.id == Publicacao.anuncio_id)
            .filter(Publicacao.cliente_id == cliente.id, Publicacao.criada_em >= inicio, Publicacao.criada_em < fim)
            .order_by(Publicacao.id).all())
    reais = [(p, t) for p, t in pubs if p.sucesso and not p.demo]
    criados = (db.query(Anuncio).filter(Anuncio.cliente_id == cliente.id, Anuncio.criado_em >= inicio,
                                        Anuncio.criado_em < fim).count())
    atividades = (db.query(Atividade).filter(Atividade.cliente_id == cliente.id, Atividade.criada_em >= inicio,
                                             Atividade.criada_em < fim).all())
    por_acao = Counter(a.acao for a in atividades)
    por_pessoa = Counter(a.ator for a in atividades if a.acao in ("copia", "criacao", "edicao", "publicacao", "preco", "pergunta"))
    lotes = (db.query(Lote).filter(Lote.cliente_id == cliente.id, Lote.criado_em >= inicio, Lote.criado_em < fim).count())
    ultima = saude.ultimas(db, [cliente.id]).get(cliente.id)
    return {
        "cliente": {"id": cliente.id, "nome": cliente.nome, "documento": cliente.documento},
        "mes": mes, "gerado_em": datetime.now(timezone.utc),
        "numeros": {
            "rascunhos_criados": criados, "publicados": len(reais),
            "falhas": sum(1 for p, _ in pubs if not p.sucesso), "lotes": lotes,
            "perguntas_respondidas": por_acao.get("pergunta", 0), "precos_ajustados": por_acao.get("preco", 0),
        },
        "por_plataforma": {PLATAFORMAS[k]: v for k, v in Counter(p.plataforma for p, _ in reais).items()},
        "por_pessoa": dict(por_pessoa.most_common()),
        "publicacoes": [{"titulo": t, "plataforma": PLATAFORMAS.get(p.plataforma, p.plataforma), "link": p.link,
                         "data": p.criada_em, "conta": p.conta_apelido} for p, t in reais][:200],
        "saude": saude.saude_dict(ultima),
    }
