"""Dúvidas por página: quem vê cada conversa e o que cada pessoa ainda não leu.

Cada mensagem nova conta como não lida para todos os participantes que podem
ver a conversa, menos para quem a escreveu. A leitura é guardada por pessoa
(LeituraConversa), então abrir a conversa só apaga o aviso de quem abriu.
"""

from __future__ import annotations

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import Anuncio, Cliente, Conversa, LeituraConversa, Mensagem, Produto, Tarefa, Usuario
from app.services import acesso
from app.services import ferramentas as permissoes

PAGINAS = {
    "projeto": "Projeto", "tarefas": "Tarefas", "painel": "Painel", "pesquisar": "Pesquisar",
    "rascunhos": "Anúncios", "editor": "Editar anúncio", "lotes": "Publicação em lote", "publicacoes": "Publicações",
    "full": "Estoque Full", "contas": "Contas", "saude": "Saúde da conta", "perguntas": "Central de perguntas",
    "radar": "Radar de preço", "relatorio": "Relatório do mês", "lucro": "Vendas e lucro",
    "produtos": "Produtos e custos", "despesas": "Custo operacional", "impostos": "Impostos",
    "analise": "Analista de métricas", "geral": "Geral",
}
REFS = {"tarefa": Tarefa, "anuncio": Anuncio, "produto": Produto}


def usa_duvidas(db: Session, usuario: Usuario) -> bool:
    loja = db.get(Cliente, usuario.cliente_id) if usuario.papel == "cliente" and usuario.cliente_id else None
    return "duvidas" in permissoes.liberadas(usuario.papel, usuario.empresa.ferramentas_off,
                                             loja.ferramentas_off if loja else None)


def clientes_visiveis(db: Session, usuario: Usuario) -> list[int]:
    return [c.id for c in acesso.clientes_acessiveis(db, usuario)]


def titulo_ref(db: Session, cliente_id: int, ref_tipo: str, ref_id: int) -> str | None:
    """Nome do item ligado à conversa, ou None se ele não for deste cliente."""
    modelo = REFS.get(ref_tipo)
    obj = db.get(modelo, ref_id) if modelo and ref_id else None
    if not obj or obj.cliente_id != cliente_id:
        return None
    if isinstance(obj, Tarefa):
        return obj.titulo
    if isinstance(obj, Produto):
        return obj.nome or obj.sku
    return obj.titulo or f"Anúncio #{obj.id}"


def ref_visivel(db: Session, usuario: Usuario, ref_tipo: str, ref_id: int) -> bool:
    """Lojista não vê conversas de tarefas internas da equipe."""
    if usuario.papel != "cliente" or ref_tipo != "tarefa":
        return True
    t = db.get(Tarefa, ref_id)
    return bool(t and t.visivel_cliente)


def _tarefas_ocultas(db: Session, cliente_ids: list[int]) -> set[int]:
    return {tid for (tid,) in db.query(Tarefa.id).filter(Tarefa.cliente_id.in_(cliente_ids or [0]),
                                                        Tarefa.visivel_cliente.is_(False))}


def nao_lidas(db: Session, usuario: Usuario, cliente_ids: list[int]) -> list[dict]:
    """Uma linha por conversa com mensagens que esta pessoa ainda não leu."""
    if not cliente_ids:
        return []
    linhas = (db.query(Conversa.id, Conversa.cliente_id, Conversa.pagina, Conversa.ref_tipo, Conversa.ref_id,
                       func.count(Mensagem.id))
              .join(Mensagem, Mensagem.conversa_id == Conversa.id)
              .outerjoin(LeituraConversa, and_(LeituraConversa.conversa_id == Conversa.id,
                                               LeituraConversa.usuario_id == usuario.id))
              .filter(Conversa.cliente_id.in_(cliente_ids),
                      or_(Mensagem.autor_id.is_(None), Mensagem.autor_id != usuario.id),
                      Mensagem.id > func.coalesce(LeituraConversa.ultima_lida_id, 0))
              .group_by(Conversa.id).all())
    ocultas = _tarefas_ocultas(db, cliente_ids) if usuario.papel == "cliente" else set()
    return [{"conversa_id": cid, "cliente_id": cli, "pagina": pag, "ref_tipo": rt, "ref_id": rid, "n": int(n)}
            for cid, cli, pag, rt, rid, n in linhas if not (rt == "tarefa" and rid in ocultas)]


def resumo_nao_lidas(db: Session, usuario: Usuario, cliente_id: int | None = None) -> dict:
    """Contagens para o menu: total, por cliente e, no cliente aberto, por página e por item."""
    if not usa_duvidas(db, usuario):
        return {"total": 0, "por_cliente": {}, "por_pagina": {}, "por_ref": {}}
    ids = clientes_visiveis(db, usuario)
    linhas = nao_lidas(db, usuario, ids)
    por_cliente: dict[int, int] = {}
    por_pagina: dict[str, int] = {}
    por_ref: dict[str, int] = {}
    foco = usuario.cliente_id if usuario.papel == "cliente" else cliente_id
    for x in linhas:
        por_cliente[x["cliente_id"]] = por_cliente.get(x["cliente_id"], 0) + x["n"]
        if x["cliente_id"] == foco:
            por_pagina[x["pagina"]] = por_pagina.get(x["pagina"], 0) + x["n"]
            if x["ref_tipo"]:
                chave = f"{x['ref_tipo']}:{x['ref_id']}"
                por_ref[chave] = por_ref.get(chave, 0) + x["n"]
    return {"total": sum(por_cliente.values()), "por_cliente": por_cliente, "por_pagina": por_pagina, "por_ref": por_ref}


def aguardando_resposta(db: Session, cliente_ids: list[int]) -> dict[int, int]:
    """Conversas em aberto cuja última mensagem é do lojista, por cliente."""
    if not cliente_ids:
        return {}
    return dict(db.query(Conversa.cliente_id, func.count(Conversa.id))
                .filter(Conversa.cliente_id.in_(cliente_ids), Conversa.resolvida.is_(False),
                        Conversa.ultima_autor_papel == "cliente")
                .group_by(Conversa.cliente_id).all())


def marcar_lida(db: Session, usuario: Usuario, conversa: Conversa):
    ultima = db.query(func.max(Mensagem.id)).filter(Mensagem.conversa_id == conversa.id).scalar() or 0
    leitura = db.get(LeituraConversa, (usuario.id, conversa.id))
    if leitura is None:
        db.add(LeituraConversa(usuario_id=usuario.id, conversa_id=conversa.id, ultima_lida_id=ultima))
    elif leitura.ultima_lida_id < ultima:
        leitura.ultima_lida_id = ultima
