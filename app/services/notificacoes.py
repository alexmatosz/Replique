"""Central de notificações internas (o sino do topo).

Cada aviso é de uma pessoa, com lida/não lida e link direto para o item. Por
padrão vai para o consultor e o operador que atendem o cliente; o pedido de
anúncio avisa o operador responsável e quem criou o pedido. A mesma `chave`
não gera dois avisos iguais para a mesma pessoa. Nada sai por WhatsApp ou
e-mail: fica só no Replique.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import AcessoCliente, Cliente, Notificacao, Usuario

TIPOS = {
    "pedido_atrasado": "Pedido atrasado",
    "pedido_parado": "Pedido parado",
    "pedido_novo": "Pedido de anúncio",
    "anuncio_problema": "Anúncio com problema",
    "catalogo_perdido": "Perda de catálogo",
    "concorrente_preco": "Concorrente mudou o preço",
    "saude_risco": "Conta com saúde em risco",
    "full_parado": "Full parado há 2 meses",
    "agendador_falha": "Atualização automática falhando",
    "ia_limite": "Limite de IA",
    "relatorio_mes": "Relatório do mês",
    "pedido_titular": "Pedido LGPD",
    "seguranca_conta": "Segurança da conta",
    "promocao": "Promoções",
    "tendencia_alta": "Tendência de alta",
}


def equipe_do_cliente(db: Session, cliente_id: int) -> list[int]:
    """Consultores e operadores ativos que atendem o cliente."""
    return [uid for (uid,) in db.query(Usuario.id).join(AcessoCliente, AcessoCliente.usuario_id == Usuario.id)
            .filter(AcessoCliente.cliente_id == cliente_id, Usuario.ativo.is_(True),
                    Usuario.papel.in_(("consultor", "operador")))]


def notificar(db: Session, cliente: Cliente | None, tipo: str, titulo: str, texto: str = "", link: str = "",
              chave: str = "", usuarios: list[int] | None = None, empresa_id: int | None = None, demo: bool = False) -> int:
    """Cria o aviso para cada destinatário que ainda não tem um com a mesma chave.
    Sem ninguém atribuído ao cliente, avisa os administradores. Retorna quantos criou."""
    empresa_id = empresa_id or (cliente.empresa_id if cliente else None)
    if usuarios is None:
        usuarios = equipe_do_cliente(db, cliente.id) if cliente else []
        if not usuarios:
            usuarios = [uid for (uid,) in db.query(Usuario.id).filter_by(empresa_id=empresa_id, papel="admin", ativo=True)]
    destinos = {u for u in usuarios if u}
    if chave:
        ja = {uid for (uid,) in db.query(Notificacao.usuario_id).filter(
            Notificacao.chave == chave, Notificacao.usuario_id.in_(destinos or {0}))}
        destinos -= ja
    for uid in destinos:
        db.add(Notificacao(empresa_id=empresa_id, usuario_id=uid, cliente_id=cliente.id if cliente else None, tipo=tipo,
                           titulo=titulo[:300], texto=texto, link=link[:300], chave=chave[:200], demo=demo))
    return len(destinos)


def notificacao_dict(n: Notificacao, nomes: dict[int, str]) -> dict:
    return {"id": n.id, "tipo": n.tipo, "tipo_nome": TIPOS.get(n.tipo, n.tipo), "titulo": n.titulo, "texto": n.texto,
            "link": n.link, "cliente_id": n.cliente_id, "cliente": nomes.get(n.cliente_id, ""), "lida": n.lida_em is not None,
            "demo": n.demo, "criada_em": n.criada_em}


def listar(db: Session, usuario: Usuario, cliente_id: int | None = None, so_nao_lidas: bool = False,
           limite: int = 60) -> dict:
    q = db.query(Notificacao).filter(Notificacao.usuario_id == usuario.id)
    if cliente_id:
        q = q.filter(Notificacao.cliente_id == cliente_id)
    if so_nao_lidas:
        q = q.filter(Notificacao.lida_em.is_(None))
    itens = q.order_by(Notificacao.id.desc()).limit(min(limite, 200)).all()
    nomes = dict(db.query(Cliente.id, Cliente.nome).filter(Cliente.empresa_id == usuario.empresa_id))
    return {"itens": [notificacao_dict(n, nomes) for n in itens], "nao_lidas": nao_lidas(db, usuario)}


def nao_lidas(db: Session, usuario: Usuario) -> int:
    return db.query(Notificacao).filter(Notificacao.usuario_id == usuario.id, Notificacao.lida_em.is_(None)).count()


def marcar(db: Session, usuario: Usuario, ids: list[int] | None, lida: bool = True) -> int:
    q = db.query(Notificacao).filter(Notificacao.usuario_id == usuario.id)
    if ids is not None:
        q = q.filter(Notificacao.id.in_(ids or [0]))
    feito = q.update({Notificacao.lida_em: datetime.now(timezone.utc) if lida else None}, synchronize_session=False)
    db.commit()
    return feito
