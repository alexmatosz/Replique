"""Chat de dúvidas em cada página.

- cliente: conversa só sobre a própria loja, a partir da página em que está;
- consultor e operador: veem e respondem as conversas dos clientes atribuídos
  (o operador só se a ferramenta "Dúvidas" estiver liberada para a função);
- admin: vê e responde todas.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.api.deps import usuario_atual
from backend.banco.db import get_db
from backend.banco.models import Cliente, Conversa, LeituraConversa, Mensagem, Usuario
from backend.services import acesso
from backend.services import conversas as svc

router = APIRouter(prefix="/api/conversas", tags=["conversas"])


class NovaMensagem(BaseModel):
    cliente_id: int | None = None
    pagina: str = Field(min_length=1, max_length=30)
    ref_tipo: str = Field(default="", max_length=20)
    ref_id: int = 0
    texto: str = Field(min_length=1, max_length=4000)


class Resolucao(BaseModel):
    resolvida: bool


def _cliente_id(db: Session, usuario: Usuario, cliente_id: int | None) -> int:
    if usuario.papel == "cliente":
        if cliente_id and cliente_id != usuario.cliente_id:
            raise HTTPException(404, "Cliente não encontrado.")
        return usuario.cliente_id
    if not cliente_id or not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(404, "Cliente não encontrado.")
    return cliente_id


def _validar_local(db: Session, usuario: Usuario, cliente_id: int, pagina: str, ref_tipo: str, ref_id: int) -> str:
    if pagina not in svc.PAGINAS:
        raise HTTPException(400, "Página desconhecida.")
    if not ref_tipo:
        return ""
    titulo = svc.titulo_ref(db, cliente_id, ref_tipo, ref_id)
    if titulo is None or not svc.ref_visivel(db, usuario, ref_tipo, ref_id):
        raise HTTPException(404, "Item não encontrado.")
    return titulo


def _conversa_visivel(db: Session, usuario: Usuario, conversa_id: int) -> Conversa:
    c = db.get(Conversa, conversa_id)
    if not c or c.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Conversa não encontrada.")
    if usuario.papel == "cliente":
        if c.cliente_id != usuario.cliente_id or not svc.ref_visivel(db, usuario, c.ref_tipo, c.ref_id):
            raise HTTPException(404, "Conversa não encontrada.")
    elif not acesso.pode_ver(db, usuario, c.cliente_id):
        raise HTTPException(404, "Conversa não encontrada.")
    return c


def _msg_dict(m: Mensagem, usuario: Usuario) -> dict:
    return {"id": m.id, "texto": m.texto, "autor": m.autor_nome, "papel": m.autor_papel,
            "minha": m.autor_id == usuario.id, "criada_em": m.criada_em}


def _conversa_dict(db: Session, c: Conversa, usuario: Usuario, lida_ate: int | None = None) -> dict:
    mensagens = db.query(Mensagem).filter_by(conversa_id=c.id).order_by(Mensagem.id).all()
    return {"id": c.id, "cliente_id": c.cliente_id, "pagina": c.pagina, "pagina_nome": svc.PAGINAS.get(c.pagina, c.pagina),
            "ref_tipo": c.ref_tipo, "ref_id": c.ref_id, "titulo": c.titulo, "resolvida": bool(c.resolvida),
            "lida_ate": lida_ate, "mensagens": [_msg_dict(m, usuario) for m in mensagens]}


def _abrir(db: Session, usuario: Usuario, c: Conversa) -> dict:
    leitura = db.get(LeituraConversa, (usuario.id, c.id))
    antes = leitura.ultima_lida_id if leitura else 0
    svc.marcar_lida(db, usuario, c)
    db.commit()
    return _conversa_dict(db, c, usuario, antes)


@router.get("/abrir")
def abrir(pagina: str, cliente_id: int | None = None, ref_tipo: str = "", ref_id: int = 0,
          usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Conversa da página (e do item, se houver). Abrir marca como lida para quem abriu."""
    cid = _cliente_id(db, usuario, cliente_id)
    titulo = _validar_local(db, usuario, cid, pagina, ref_tipo, ref_id)
    c = db.query(Conversa).filter_by(cliente_id=cid, pagina=pagina, ref_tipo=ref_tipo, ref_id=ref_id if ref_tipo else 0).first()
    if not c or not svc.ref_visivel(db, usuario, c.ref_tipo, c.ref_id):
        return {"id": None, "cliente_id": cid, "pagina": pagina, "pagina_nome": svc.PAGINAS[pagina],
                "ref_tipo": ref_tipo, "ref_id": ref_id, "titulo": titulo, "resolvida": False, "mensagens": []}
    return _abrir(db, usuario, c)


@router.get("/nao-lidas")
def nao_lidas(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if cliente_id and usuario.papel != "cliente" and not acesso.pode_ver(db, usuario, cliente_id):
        cliente_id = None
    return svc.resumo_nao_lidas(db, usuario, cliente_id)


@router.get("")
def caixa(cliente_id: int | None = None, filtro: str = Query("todas", pattern="^(todas|nao_lidas|aguardando|resolvidas)$"),
          usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Caixa de dúvidas: conversas dos clientes que a pessoa atende, mais recentes primeiro."""
    ids = svc.clientes_visiveis(db, usuario)
    if cliente_id:
        ids = [cliente_id] if cliente_id in ids else []
    q = db.query(Conversa).filter(Conversa.cliente_id.in_(ids or [0]))
    if filtro == "aguardando":
        q = q.filter(Conversa.resolvida.is_(False), Conversa.ultima_autor_papel == "cliente")
    elif filtro == "resolvidas":
        q = q.filter(Conversa.resolvida.is_(True))
    elif filtro != "nao_lidas":
        q = q.filter(Conversa.resolvida.is_(False))
    conversas = [c for c in q.order_by(Conversa.atualizada_em.desc()).limit(300) if svc.ref_visivel(db, usuario, c.ref_tipo, c.ref_id)]
    nao = {x["conversa_id"]: x["n"] for x in svc.nao_lidas(db, usuario, ids)}
    if filtro == "nao_lidas":
        conversas = [c for c in conversas if nao.get(c.id)]
    ultimas = {}
    if conversas:
        sub = (db.query(func.max(Mensagem.id)).filter(Mensagem.conversa_id.in_([c.id for c in conversas]))
               .group_by(Mensagem.conversa_id))
        ultimas = {m.conversa_id: m for m in db.query(Mensagem).filter(Mensagem.id.in_(sub))}
    nomes = {c.id: c.nome for c in db.query(Cliente).filter(Cliente.id.in_({c.cliente_id for c in conversas} or {0}))}
    saida = []
    for c in conversas:
        m = ultimas.get(c.id)
        saida.append({"id": c.id, "cliente_id": c.cliente_id, "cliente_nome": nomes.get(c.cliente_id, ""),
                      "pagina": c.pagina, "pagina_nome": svc.PAGINAS.get(c.pagina, c.pagina), "ref_tipo": c.ref_tipo,
                      "ref_id": c.ref_id, "titulo": c.titulo, "resolvida": bool(c.resolvida),
                      "aguardando": not c.resolvida and c.ultima_autor_papel == "cliente", "nao_lidas": nao.get(c.id, 0),
                      "ultima": {"texto": m.texto[:160], "autor": m.autor_nome, "papel": m.autor_papel,
                                 "criada_em": m.criada_em} if m else None, "atualizada_em": c.atualizada_em})
    return saida


@router.get("/{conversa_id}")
def ver(conversa_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return _abrir(db, usuario, _conversa_visivel(db, usuario, conversa_id))


@router.post("/mensagens")
def enviar(dados: NovaMensagem, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    cid = _cliente_id(db, usuario, dados.cliente_id)
    texto = dados.texto.strip()
    if not texto:
        raise HTTPException(400, "Escreva a mensagem.")
    ref_id = dados.ref_id if dados.ref_tipo else 0
    titulo = _validar_local(db, usuario, cid, dados.pagina, dados.ref_tipo, ref_id)
    c = db.query(Conversa).filter_by(cliente_id=cid, pagina=dados.pagina, ref_tipo=dados.ref_tipo, ref_id=ref_id).first()
    if c and not svc.ref_visivel(db, usuario, c.ref_tipo, c.ref_id):
        raise HTTPException(404, "Item não encontrado.")
    agora = datetime.now(timezone.utc)
    if not c:
        c = Conversa(empresa_id=usuario.empresa_id, cliente_id=cid, pagina=dados.pagina, ref_tipo=dados.ref_tipo,
                     ref_id=ref_id, titulo=titulo)
        db.add(c)
        db.flush()
    elif titulo:
        c.titulo = titulo
    m = Mensagem(conversa_id=c.id, autor_id=usuario.id, autor_nome=usuario.nome, autor_papel=usuario.papel, texto=texto)
    db.add(m)
    c.ultima_autor_papel = usuario.papel
    c.atualizada_em = agora
    if usuario.papel == "cliente":
        c.resolvida = False
    db.flush()
    svc.marcar_lida(db, usuario, c)
    db.commit()
    return _conversa_dict(db, c, usuario)


@router.post("/{conversa_id}/resolver")
def resolver(conversa_id: int, dados: Resolucao, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Equipe marca a dúvida como resolvida (sai da lista de pendentes) ou reabre."""
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "Só a equipe marca dúvidas como resolvidas.")
    c = _conversa_visivel(db, usuario, conversa_id)
    c.resolvida = dados.resolvida
    db.commit()
    return {"ok": True, "resolvida": c.resolvida}
