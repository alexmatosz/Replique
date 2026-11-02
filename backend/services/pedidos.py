"""Pedidos de anúncio: o consultor pede, o operador cria e publica.

Não é gerenciador de tarefas: cada pedido é a criação de um ou mais anúncios
para um cliente. Fluxo:
- o consultor (ou admin) cria o pedido com cliente, marketplaces, produto por
  link ou por texto, quantidade, prazo, legenda e o operador responsável;
- o operador clica em "Começar": o rascunho nasce ligado ao pedido (cópia do
  link quando houver, senão em branco com o texto) e o pedido fica em
  andamento;
- ao publicar os anúncios pedidos o pedido fecha sozinho; falha na publicação
  deixa "Com problema" com o motivo;
- prazo vencido ou pedido parado geram aviso para o operador e o consultor.
O lojista não vê os pedidos. Tudo vai para a auditoria.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend import config
from backend.marketplaces.base import PLATAFORMAS, ErroMarketplace
from backend.marketplaces.registry import obter_adaptador
from backend.banco.models import AcessoCliente, Anuncio, Cliente, PedidoAnuncio, Publicacao, Usuario
from backend.services import acesso, notificacoes, replique
from backend.services.auditoria import registrar

STATUS = {"pendente": "Pendente", "andamento": "Em andamento", "rascunho_pronto": "Rascunho pronto",
          "publicado": "Publicado", "problema": "Com problema"}
ABERTOS = ("pendente", "andamento", "rascunho_pronto", "problema")
MAX_QUANTIDADE = 50


class ErroPedido(ValueError):
    pass


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime | None) -> datetime | None:
    return d.replace(tzinfo=timezone.utc) if d and d.tzinfo is None else d


def pode_pedir(usuario: Usuario) -> bool:
    return usuario.papel in ("admin", "consultor")


def _atende(db: Session, usuario: Usuario, cliente_id: int) -> bool:
    if usuario.papel == "admin":
        return True
    return db.query(AcessoCliente).filter_by(usuario_id=usuario.id, cliente_id=cliente_id).first() is not None


def validar(db: Session, usuario: Usuario, dados: dict) -> dict:
    cliente_id = dados.get("cliente_id")
    if not acesso.pode_ver(db, usuario, cliente_id):
        raise ErroPedido("Você não tem acesso a este cliente.")
    marketplaces = [m for m in dict.fromkeys(dados.get("marketplaces") or []) if m in PLATAFORMAS]
    if not marketplaces:
        raise ErroPedido("Escolha pelo menos um marketplace.")
    link = (dados.get("produto_link") or "").strip()
    texto = (dados.get("produto_texto") or "").strip()
    if link and not re.match(r"^https?://", link, re.I) and not re.match(r"^MLB-?\d{6,}$", link, re.I):
        raise ErroPedido("O link do produto precisa começar com http:// ou https:// (ou ser um código MLB).")
    if not link and not texto:
        raise ErroPedido("Informe o produto por link ou descreva por texto.")
    quantidade = int(dados.get("quantidade") or 1)
    if not 1 <= quantidade <= MAX_QUANTIDADE:
        raise ErroPedido(f"A quantidade de anúncios vai de 1 a {MAX_QUANTIDADE}.")
    operador = db.get(Usuario, dados.get("operador_id")) if dados.get("operador_id") else None
    if not operador or operador.empresa_id != usuario.empresa_id or not operador.ativo or operador.papel not in ("operador", "admin"):
        raise ErroPedido("Escolha um operador ativo da equipe.")
    if not _atende(db, operador, cliente_id):
        raise ErroPedido(f"{operador.nome} não atende este cliente. Atribua o cliente a ele em Clientes › Gerenciar.")
    prazo = dados.get("prazo")
    if isinstance(prazo, str):
        try:
            prazo = date.fromisoformat(prazo) if prazo else None
        except ValueError:
            raise ErroPedido("Prazo inválido.")
    return {"cliente_id": cliente_id, "marketplaces": marketplaces, "produto_link": link[:1000], "produto_texto": texto[:5000],
            "quantidade": quantidade, "prazo": prazo, "legenda": (dados.get("legenda") or "").strip()[:10000],
            "operador_id": operador.id}


def criar(db: Session, usuario: Usuario, dados: dict) -> PedidoAnuncio:
    if not pode_pedir(usuario):
        raise ErroPedido("Pedidos de anúncio são criados pelo consultor ou pelo administrador.")
    campos = validar(db, usuario, dados)
    pedido = PedidoAnuncio(empresa_id=usuario.empresa_id, criado_por_id=usuario.id, **campos)
    db.add(pedido)
    db.flush()
    cliente = db.get(Cliente, pedido.cliente_id)
    registrar(db, usuario.empresa_id, "pedido", f"Pediu {pedido.quantidade} anúncio(s) para {cliente.nome} "
              f"({', '.join(PLATAFORMAS[m] for m in pedido.marketplaces)})", cliente_id=cliente.id, usuario=usuario,
              pedido_id=pedido.id)
    if pedido.operador_id != usuario.id:
        notificacoes.notificar(db, cliente, "pedido_novo", f"Novo pedido de anúncio: {cliente.nome}",
                               _resumo_produto(pedido), f"#/pedidos/{pedido.id}", chave=f"pedido-novo-{pedido.id}",
                               usuarios=[pedido.operador_id])
    db.commit()
    return pedido


def editar(db: Session, usuario: Usuario, pedido: PedidoAnuncio, dados: dict) -> PedidoAnuncio:
    if not pode_pedir(usuario):
        raise ErroPedido("Só o consultor ou o administrador alteram o pedido.")
    if pedido.status == "publicado":
        raise ErroPedido("Pedido já publicado não pode ser alterado.")
    campos = validar(db, usuario, {**pedido_campos(pedido), **dados, "cliente_id": pedido.cliente_id})
    for k, v in campos.items():
        setattr(pedido, k, v)
    pedido.movimentado_em = _agora()
    registrar(db, usuario.empresa_id, "pedido", f"Alterou o pedido #{pedido.id}", cliente_id=pedido.cliente_id,
              usuario=usuario, pedido_id=pedido.id)
    db.commit()
    return pedido


def pedido_campos(p: PedidoAnuncio) -> dict:
    return {"marketplaces": p.marketplaces, "produto_link": p.produto_link, "produto_texto": p.produto_texto,
            "quantidade": p.quantidade, "prazo": p.prazo.isoformat() if p.prazo else None, "legenda": p.legenda,
            "operador_id": p.operador_id}


def _resumo_produto(p: PedidoAnuncio) -> str:
    base = p.produto_texto.splitlines()[0] if p.produto_texto else p.produto_link
    return (base or "")[:160]


def consulta(db: Session, usuario: Usuario):
    """Pedidos que a pessoa pode ver. O lojista não vê pedidos."""
    if usuario.papel == "cliente":
        raise ErroPedido("Pedidos de anúncio são da equipe.")
    q = db.query(PedidoAnuncio).filter(PedidoAnuncio.empresa_id == usuario.empresa_id)
    ids = acesso.ids_acessiveis(db, usuario)
    if ids is not None:
        q = q.filter(PedidoAnuncio.cliente_id.in_(ids or {0}))
    return q


def obter(db: Session, usuario: Usuario, pedido_id: int) -> PedidoAnuncio:
    p = consulta(db, usuario).filter(PedidoAnuncio.id == pedido_id).first()
    if not p:
        raise LookupError("Pedido não encontrado.")
    return p


def atrasado(p: PedidoAnuncio, hoje: date | None = None) -> bool:
    return bool(p.prazo and p.status != "publicado" and p.prazo < (hoje or date.today()))


def parado(p: PedidoAnuncio, agora: datetime | None = None) -> bool:
    limite = (agora or _agora()) - timedelta(days=config.PEDIDO_PARADO_DIAS)
    return p.status in ABERTOS and _aware(p.movimentado_em) is not None and _aware(p.movimentado_em) < limite


def rascunhos(db: Session, pedido: PedidoAnuncio) -> list[Anuncio]:
    return (db.query(Anuncio).filter(Anuncio.pedido_id == pedido.id, Anuncio.cliente_id == pedido.cliente_id,
                                     Anuncio.excluido_em.is_(None)).order_by(Anuncio.id).all())


def pedido_dict(db: Session, p: PedidoAnuncio, nomes: dict[int, str] | None = None, detalhes: bool = False) -> dict:
    nomes = nomes if nomes is not None else _nomes(db, [p])
    hoje = date.today()
    saida = {"id": p.id, "cliente_id": p.cliente_id, "cliente": nomes.get(("c", p.cliente_id), ""),
             "operador_id": p.operador_id, "operador": nomes.get(p.operador_id, ""),
             "criado_por_id": p.criado_por_id, "criado_por": nomes.get(p.criado_por_id, ""),
             "marketplaces": p.marketplaces, "produto_link": p.produto_link, "produto_texto": p.produto_texto,
             "resumo": _resumo_produto(p), "quantidade": p.quantidade, "prazo": p.prazo.isoformat() if p.prazo else None,
             "legenda": p.legenda, "status": p.status, "status_nome": STATUS.get(p.status, p.status), "motivo": p.motivo,
             "atrasado": atrasado(p, hoje), "parado": parado(p), "criado_em": p.criado_em, "movimentado_em": p.movimentado_em,
             "iniciado_em": p.iniciado_em, "concluido_em": p.concluido_em}
    if detalhes:
        lista = rascunhos(db, p)
        saida["rascunhos"] = [{"id": a.id, "titulo": a.titulo, "status": a.status} for a in lista]
        saida["publicados"] = sum(1 for a in lista if a.status in ("publicado", "simulado", "parcial"))
    return saida


def _nomes(db: Session, pedidos: list[PedidoAnuncio]) -> dict:
    ids = {x for p in pedidos for x in (p.operador_id, p.criado_por_id) if x}
    nomes: dict = dict(db.query(Usuario.id, Usuario.nome).filter(Usuario.id.in_(ids or {0})))
    for cid, nome in db.query(Cliente.id, Cliente.nome).filter(Cliente.id.in_({p.cliente_id for p in pedidos} or {0})):
        nomes[("c", cid)] = nome
    return nomes


def listar(db: Session, usuario: Usuario, meus: bool = False, status: str = "", cliente_id: int | None = None) -> list[dict]:
    q = consulta(db, usuario)
    if meus:
        q = q.filter(PedidoAnuncio.operador_id == usuario.id)
    if status == "abertos":
        q = q.filter(PedidoAnuncio.status.in_(ABERTOS))
    elif status in STATUS:
        q = q.filter(PedidoAnuncio.status == status)
    if cliente_id:
        q = q.filter(PedidoAnuncio.cliente_id == cliente_id)
    pedidos = q.order_by(PedidoAnuncio.id.desc()).limit(300).all()
    nomes = _nomes(db, pedidos)
    hoje = date.today()
    lista = [pedido_dict(db, p, nomes) for p in pedidos]
    return sorted(lista, key=lambda x: (x["status"] == "publicado", not x["atrasado"], x["prazo"] or "9999", -x["id"]))


def comecar(db: Session, usuario: Usuario, pedido: PedidoAnuncio) -> tuple[Anuncio, str]:
    """Cria o rascunho ligado ao pedido. Com link do Mercado Livre usa o fluxo de
    copiar; se a cópia não der (link de outra loja, anúncio bloqueado pela API),
    cria em branco com o link e o texto na descrição e avisa."""
    if usuario.papel not in ("operador", "admin"):
        raise ErroPedido("Quem começa o pedido é o operador.")
    if usuario.papel == "operador" and pedido.operador_id != usuario.id:
        raise ErroPedido("Este pedido está com outro operador.")
    if pedido.status == "publicado":
        raise ErroPedido("Este pedido já foi publicado.")
    cliente = db.get(Cliente, pedido.cliente_id)
    if not cliente or not cliente.ativo:
        raise ErroPedido("O cliente deste pedido está desativado.")
    anuncio, aviso = None, ""
    if pedido.produto_link and re.search(r"mercadoli[vb]re|MLB-?\d{6,}", pedido.produto_link, re.I):
        try:
            adaptador, _ = obter_adaptador(db, cliente.id, "mercadolivre", "pesquisar")
            achado = adaptador.analisar_link(pedido.produto_link)
            if achado.get("tipo") == "produto":
                anuncio = replique.copiar(db, cliente, "mercadolivre", achado["product_id"], "PRODUCT", None, usuario,
                                          achado.get("item_id") or "")
            elif achado.get("proprio"):
                anuncio = replique.copiar(db, cliente, "mercadolivre", achado["item_id"], "ITEM", None, usuario)
            else:
                aviso = "A API do Mercado Livre não libera este anúncio de outra loja; o rascunho foi criado em branco com o link."
        except (ErroMarketplace, ValueError) as e:
            aviso = f"Não deu para copiar o link ({getattr(e, 'mensagem', str(e))}); o rascunho foi criado em branco."
    elif pedido.produto_link:
        aviso = "Só links do Mercado Livre são copiados automaticamente; o rascunho foi criado em branco com o link."
    if anuncio is None:
        primeira = (pedido.produto_texto.splitlines() or [""])[0].strip()
        descricao = "\n\n".join(x for x in (pedido.produto_texto, f"Link de referência: {pedido.produto_link}" if pedido.produto_link else "") if x)
        anuncio = replique.criar_em_branco(db, cliente, {"titulo": primeira[:120] or f"Pedido #{pedido.id}",
                                                         "descricao": descricao}, usuario)
    anuncio.pedido_id = pedido.id
    pedido.status = "andamento"
    pedido.iniciado_em = pedido.iniciado_em or _agora()
    pedido.movimentado_em = _agora()
    pedido.motivo = ""
    registrar(db, cliente.empresa_id, "pedido", f"Começou o pedido #{pedido.id}: rascunho “{anuncio.titulo or 'sem título'}”",
              cliente_id=cliente.id, usuario=usuario, anuncio_id=anuncio.id, pedido_id=pedido.id)
    db.commit()
    return anuncio, aviso


def marcar_pronto(db: Session, usuario: Usuario, pedido: PedidoAnuncio) -> PedidoAnuncio:
    if usuario.papel not in ("operador", "admin") or (usuario.papel == "operador" and pedido.operador_id != usuario.id):
        raise ErroPedido("Só o operador responsável marca o rascunho como pronto.")
    if not rascunhos(db, pedido):
        raise ErroPedido("Comece o pedido antes: ainda não há rascunho.")
    if pedido.status == "publicado":
        raise ErroPedido("Este pedido já foi publicado.")
    pedido.status, pedido.movimentado_em = "rascunho_pronto", _agora()
    registrar(db, usuario.empresa_id, "pedido", f"Rascunho do pedido #{pedido.id} pronto para publicar",
              cliente_id=pedido.cliente_id, usuario=usuario, pedido_id=pedido.id)
    if pedido.criado_por_id and pedido.criado_por_id != usuario.id:
        notificacoes.notificar(db, db.get(Cliente, pedido.cliente_id), "pedido_novo", f"Rascunho pronto: pedido #{pedido.id}",
                               _resumo_produto(pedido), f"#/pedidos/{pedido.id}", chave=f"pedido-pronto-{pedido.id}-{pedido.movimentado_em:%Y%m%d%H%M}",
                               usuarios=[pedido.criado_por_id])
    db.commit()
    return pedido


def apos_publicar(db: Session, anuncio: Anuncio, publicacoes: list[Publicacao], usuario: Usuario | None) -> None:
    """Chamado depois de cada publicação: fecha o pedido quando os anúncios
    pedidos estão no ar, ou marca o problema com o motivo."""
    if not anuncio.pedido_id:
        return
    pedido = db.get(PedidoAnuncio, anuncio.pedido_id)
    if not pedido or pedido.cliente_id != anuncio.cliente_id or pedido.status == "publicado":
        return
    lista = rascunhos(db, pedido)
    no_ar = sum(1 for a in lista if a.status in ("publicado", "simulado", "parcial"))
    falhas = [p for p in publicacoes if not p.sucesso]
    pedido.movimentado_em = _agora()
    if no_ar >= pedido.quantidade:
        pedido.status, pedido.concluido_em, pedido.motivo = "publicado", _agora(), ""
        registrar(db, pedido.empresa_id, "pedido", f"Pedido #{pedido.id} concluído: {no_ar} anúncio(s) publicado(s)",
                  cliente_id=pedido.cliente_id, usuario=usuario, pedido_id=pedido.id)
    elif falhas:
        pedido.status = "problema"
        pedido.motivo = "; ".join(f"{PLATAFORMAS.get(p.plataforma, p.plataforma)}: {p.mensagem}" for p in falhas)[:2000]
        notificacoes.notificar(db, db.get(Cliente, pedido.cliente_id), "anuncio_problema",
                               f"Pedido #{pedido.id} com problema na publicação", pedido.motivo[:300], f"#/pedidos/{pedido.id}",
                               chave=f"pedido-problema-{pedido.id}-{anuncio.id}-{len(falhas)}",
                               usuarios=[pedido.operador_id, pedido.criado_por_id])
    else:
        pedido.status = "andamento"


def verificar_prazos(db: Session, agora: datetime | None = None) -> int:
    """Avisa operador e consultor de pedidos atrasados ou parados (uma vez por dia)."""
    agora = agora or _agora()
    hoje = agora.date()
    criados = 0
    for p in db.query(PedidoAnuncio).filter(PedidoAnuncio.status.in_(ABERTOS)):
        cliente = db.get(Cliente, p.cliente_id)
        if not cliente or not cliente.ativo:
            continue
        destinos = [p.operador_id, p.criado_por_id]
        if atrasado(p, hoje):
            criados += notificacoes.notificar(db, cliente, "pedido_atrasado", f"Pedido #{p.id} atrasado: {cliente.nome}",
                                              f"Prazo era {p.prazo:%d/%m/%Y}. {_resumo_produto(p)}", f"#/pedidos/{p.id}",
                                              chave=f"pedido-atrasado-{p.id}-{hoje.isoformat()}", usuarios=destinos)
        elif parado(p, agora):
            criados += notificacoes.notificar(db, cliente, "pedido_parado", f"Pedido #{p.id} parado: {cliente.nome}",
                                              f"Sem movimento há mais de {config.PEDIDO_PARADO_DIAS} dia(s). {_resumo_produto(p)}",
                                              f"#/pedidos/{p.id}", chave=f"pedido-parado-{p.id}-{hoje.isoformat()}",
                                              usuarios=destinos)
    if criados:
        db.commit()
    return criados


def painel(db: Session, usuario: Usuario) -> dict:
    """Resumo para o consultor: por operador, por cliente e os atrasados."""
    pedidos = consulta(db, usuario).all()
    nomes = _nomes(db, pedidos)
    por_operador: dict[int, dict] = {}
    por_cliente: dict[int, dict] = {}
    hoje = date.today()
    for p in pedidos:
        for chave, grupo, nome in ((p.operador_id, por_operador, nomes.get(p.operador_id, "sem operador")),
                                   (p.cliente_id, por_cliente, nomes.get(("c", p.cliente_id), ""))):
            g = grupo.setdefault(chave, {"id": chave, "nome": nome, "abertos": 0, "atrasados": 0, "publicados_30d": 0,
                                         "por_status": {s: 0 for s in STATUS}})
            g["por_status"][p.status] = g["por_status"].get(p.status, 0) + 1
            if p.status in ABERTOS:
                g["abertos"] += 1
            if atrasado(p, hoje):
                g["atrasados"] += 1
            if p.status == "publicado" and _aware(p.concluido_em) and _aware(p.concluido_em) >= _agora() - timedelta(days=30):
                g["publicados_30d"] += 1
    atrasados = [pedido_dict(db, p, nomes) for p in pedidos if atrasado(p, hoje)]
    return {"por_operador": sorted(por_operador.values(), key=lambda g: (-g["atrasados"], -g["abertos"], g["nome"])),
            "por_cliente": sorted(por_cliente.values(), key=lambda g: (-g["atrasados"], -g["abertos"], g["nome"])),
            "atrasados": sorted(atrasados, key=lambda x: x["prazo"] or ""),
            "totais": {"abertos": sum(1 for p in pedidos if p.status in ABERTOS), "atrasados": len(atrasados),
                       "problema": sum(1 for p in pedidos if p.status == "problema"),
                       "publicados_30d": sum(g["publicados_30d"] for g in por_cliente.values())}}
