"""Projetos, tarefas e reuniões de cada cliente, e a visão geral da equipe.

- admin: todos os clientes; cria e edita tudo;
- consultor: os clientes atribuídos; planeja (projetos, tarefas, reuniões);
- operador: os clientes atribuídos; cria tarefas, muda o status e registra observações;
- cliente: só a própria loja; vê as tarefas liberadas para ele e o andamento.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import usuario_atual
from app.db import get_db
from app.models import AcessoCliente, Atividade, Cliente, NotaTarefa, Projeto, Reuniao, Tarefa, Usuario
from app.services import acesso
from app.services import conversas as svc_conversas
from app.services.auditoria import registrar

router = APIRouter(prefix="/api", tags=["projetos"])

STATUS_TAREFA = {"pendente": "Pendente", "andamento": "Em andamento", "aguardando_cliente": "Aguardando informações",
                 "ajuste": "Precisa de ajuste", "concluida": "Concluída"}
STATUS_PROJETO = {"ativo": "Ativo", "pausado": "Pausado", "concluido": "Concluído"}
ABERTAS = ("pendente", "andamento", "aguardando_cliente", "ajuste")


class NovoProjeto(BaseModel):
    cliente_id: int
    nome: str = Field(min_length=2, max_length=200)
    descricao: str = Field(default="", max_length=5000)


class EdicaoProjeto(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=200)
    descricao: str | None = Field(default=None, max_length=5000)
    status: str | None = None


class NovaTarefa(BaseModel):
    projeto_id: int
    titulo: str = Field(min_length=2, max_length=300)
    descricao: str = Field(default="", max_length=5000)
    status: str = "pendente"
    responsavel_id: int | None = None
    prazo: str | None = None
    visivel_cliente: bool = True


class EdicaoTarefa(BaseModel):
    titulo: str | None = Field(default=None, min_length=2, max_length=300)
    descricao: str | None = Field(default=None, max_length=5000)
    status: str | None = None
    responsavel_id: int | None = None
    sem_responsavel: bool = False
    prazo: str | None = None
    sem_prazo: bool = False
    visivel_cliente: bool | None = None


class NovaNota(BaseModel):
    texto: str = Field(min_length=1, max_length=5000)
    interna: bool = False


class DadosReuniao(BaseModel):
    cliente_id: int | None = None
    projeto_id: int | None = None
    data: str
    titulo: str = Field(default="", max_length=200)
    resumo: str = Field(default="", max_length=20000)
    proximos_passos: str = Field(default="", max_length=10000)


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _data_ok(valor: str | None) -> str | None:
    if not valor:
        return None
    try:
        return date.fromisoformat(valor[:10]).isoformat()
    except ValueError:
        raise HTTPException(400, "Data inválida. Use o formato AAAA-MM-DD.")


def _exigir(condicao: bool, msg: str):
    if not condicao:
        raise HTTPException(403, msg)


def _cliente_ok(db: Session, usuario: Usuario, cliente_id: int | None) -> int:
    if usuario.papel == "cliente":
        if cliente_id and cliente_id != usuario.cliente_id:
            raise HTTPException(404, "Cliente não encontrado.")
        return usuario.cliente_id
    if not cliente_id or not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(404, "Cliente não encontrado.")
    return cliente_id


def _projeto(db: Session, usuario: Usuario, projeto_id: int) -> Projeto:
    p = db.get(Projeto, projeto_id)
    if not p or p.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Projeto não encontrado.")
    _cliente_ok(db, usuario, p.cliente_id)
    return p


def _tarefa(db: Session, usuario: Usuario, tarefa_id: int) -> Tarefa:
    t = db.get(Tarefa, tarefa_id)
    if not t or t.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Tarefa não encontrada.")
    _cliente_ok(db, usuario, t.cliente_id)
    if usuario.papel == "cliente" and not t.visivel_cliente:
        raise HTTPException(404, "Tarefa não encontrada.")
    return t


def _responsavel_ok(db: Session, usuario: Usuario, cliente_id: int, responsavel_id: int | None) -> int | None:
    if not responsavel_id:
        return None
    r = db.get(Usuario, responsavel_id)
    if not r or r.empresa_id != usuario.empresa_id or not r.ativo or r.papel not in acesso.EQUIPE:
        raise HTTPException(400, "Responsável inválido: escolha alguém ativo da equipe.")
    if r.papel != "admin" and not db.get(AcessoCliente, (r.id, cliente_id)):
        raise HTTPException(400, f"{r.nome} não atende este cliente. Atribua o cliente a essa pessoa antes.")
    return r.id


def _status_ok(status: str) -> str:
    if status not in STATUS_TAREFA:
        raise HTTPException(400, "Status inválido.")
    return status


def _atrasada(t: Tarefa, hoje: str) -> bool:
    return bool(t.prazo and t.status in ABERTAS and t.prazo < hoje)


def _nomes(db: Session, ids: set) -> dict[int, str]:
    ids = {i for i in ids if i}
    return {u.id: u.nome for u in db.query(Usuario).filter(Usuario.id.in_(ids or {0}))}


def _tarefa_dict(t: Tarefa, nomes: dict[int, str], hoje: str, projetos: dict[int, str] | None = None,
                 clientes: dict[int, str] | None = None) -> dict:
    saida = {"id": t.id, "cliente_id": t.cliente_id, "projeto_id": t.projeto_id, "titulo": t.titulo,
             "descricao": t.descricao, "status": t.status, "status_nome": STATUS_TAREFA.get(t.status, t.status),
             "responsavel_id": t.responsavel_id, "responsavel": nomes.get(t.responsavel_id, ""),
             "prazo": t.prazo, "atrasada": _atrasada(t, hoje), "visivel_cliente": bool(t.visivel_cliente),
             "criado_por": nomes.get(t.criado_por_id, ""), "criado_por_id": t.criado_por_id, "criado_em": t.criado_em,
             "atualizado_em": t.atualizado_em, "concluida_em": t.concluida_em}
    if projetos is not None:
        saida["projeto"] = projetos.get(t.projeto_id, "")
    if clientes is not None:
        saida["cliente_nome"] = clientes.get(t.cliente_id, "")
    return saida


def _registrar_tarefa(db: Session, usuario: Usuario, t: Tarefa, texto: str):
    registrar(db, usuario.empresa_id, "tarefa" if t.visivel_cliente else "tarefa_interna", texto,
              cliente_id=t.cliente_id, usuario=usuario, tarefa_id=t.id)


def _hoje() -> str:
    return date.today().isoformat()


@router.get("/projetos")
def listar_projetos(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    cid = _cliente_ok(db, usuario, cliente_id)
    projetos = db.query(Projeto).filter_by(cliente_id=cid).order_by(Projeto.status != "ativo", Projeto.id.desc()).all()
    q = db.query(Tarefa.projeto_id, Tarefa.status, func.count(Tarefa.id)).filter(Tarefa.cliente_id == cid)
    if usuario.papel == "cliente":
        q = q.filter(Tarefa.visivel_cliente.is_(True))
    contagem: dict[int, dict] = {}
    for pid, st, n in q.group_by(Tarefa.projeto_id, Tarefa.status):
        contagem.setdefault(pid, {})[st] = n
    saida = []
    for p in projetos:
        c = contagem.get(p.id, {})
        total = sum(c.values())
        saida.append({"id": p.id, "cliente_id": p.cliente_id, "nome": p.nome, "descricao": p.descricao, "status": p.status,
                      "status_nome": STATUS_PROJETO.get(p.status, p.status), "tarefas": total, "por_status": c,
                      "progresso": round(100 * c.get("concluida", 0) / total) if total else 0, "criado_em": p.criado_em})
    return saida


@router.post("/projetos")
def criar_projeto(dados: NovoProjeto, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir(acesso.pode_planejar(usuario), "Projetos são criados pelo administrador ou pelo consultor.")
    cid = _cliente_ok(db, usuario, dados.cliente_id)
    p = Projeto(empresa_id=usuario.empresa_id, cliente_id=cid, nome=dados.nome.strip(), descricao=dados.descricao.strip(),
                criado_por_id=usuario.id)
    db.add(p)
    db.flush()
    registrar(db, usuario.empresa_id, "projeto", f"Criou o projeto “{p.nome}”", cliente_id=cid, usuario=usuario)
    db.commit()
    return {"id": p.id}


@router.patch("/projetos/{projeto_id}")
def editar_projeto(projeto_id: int, dados: EdicaoProjeto, usuario: Usuario = Depends(usuario_atual),
                   db: Session = Depends(get_db)):
    _exigir(acesso.pode_planejar(usuario), "Projetos são editados pelo administrador ou pelo consultor.")
    p = _projeto(db, usuario, projeto_id)
    if dados.nome is not None:
        p.nome = dados.nome.strip()
    if dados.descricao is not None:
        p.descricao = dados.descricao.strip()
    if dados.status is not None and dados.status != p.status:
        if dados.status not in STATUS_PROJETO:
            raise HTTPException(400, "Status inválido.")
        p.status = dados.status
        registrar(db, usuario.empresa_id, "projeto", f"Marcou o projeto “{p.nome}” como {STATUS_PROJETO[p.status].lower()}",
                  cliente_id=p.cliente_id, usuario=usuario)
    db.commit()
    return {"ok": True}


@router.get("/tarefas")
def listar_tarefas(cliente_id: int | None = None, projeto_id: int | None = None, status: str | None = None,
                   responsavel_id: int | None = None, minhas: bool = False, abertas: bool = False,
                   limite: int = Query(500, ge=1, le=1000),
                   usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Sem cliente_id, a equipe vê as tarefas de todos os clientes que atende."""
    if cliente_id or usuario.papel == "cliente":
        ids = [_cliente_ok(db, usuario, cliente_id)]
    else:
        ids = [c.id for c in acesso.clientes_acessiveis(db, usuario)]
    q = db.query(Tarefa).filter(Tarefa.cliente_id.in_(ids or [0]))
    if usuario.papel == "cliente":
        q = q.filter(Tarefa.visivel_cliente.is_(True))
    if projeto_id:
        q = q.filter(Tarefa.projeto_id == projeto_id)
    if status:
        q = q.filter(Tarefa.status == _status_ok(status))
    if abertas:
        q = q.filter(Tarefa.status.in_(ABERTAS))
    if minhas:
        q = q.filter(Tarefa.responsavel_id == usuario.id)
    elif responsavel_id and usuario.papel != "cliente":
        q = q.filter(Tarefa.responsavel_id == responsavel_id)
    tarefas = q.order_by(Tarefa.prazo.is_(None), Tarefa.prazo, Tarefa.id.desc()).limit(limite).all()
    nomes = _nomes(db, {t.responsavel_id for t in tarefas} | {t.criado_por_id for t in tarefas})
    projetos = {p.id: p.nome for p in db.query(Projeto).filter(Projeto.id.in_({t.projeto_id for t in tarefas} or {0}))}
    clientes = {c.id: c.nome for c in db.query(Cliente).filter(Cliente.id.in_({t.cliente_id for t in tarefas} or {0}))}
    hoje = _hoje()
    return [_tarefa_dict(t, nomes, hoje, projetos, clientes) for t in tarefas]


@router.post("/tarefas")
def criar_tarefa(dados: NovaTarefa, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir(acesso.pode_executar(usuario), "Tarefas são criadas pela equipe.")
    p = _projeto(db, usuario, dados.projeto_id)
    t = Tarefa(empresa_id=usuario.empresa_id, cliente_id=p.cliente_id, projeto_id=p.id, titulo=dados.titulo.strip(),
               descricao=dados.descricao.strip(), status=_status_ok(dados.status),
               responsavel_id=_responsavel_ok(db, usuario, p.cliente_id, dados.responsavel_id),
               prazo=_data_ok(dados.prazo), visivel_cliente=dados.visivel_cliente, criado_por_id=usuario.id)
    if t.status == "concluida":
        t.concluida_em = _agora()
    db.add(t)
    db.flush()
    _registrar_tarefa(db, usuario, t, f"Criou a tarefa “{t.titulo}” em “{p.nome}”")
    db.commit()
    return {"id": t.id}


@router.get("/tarefas/{tarefa_id}")
def ver_tarefa(tarefa_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    t = _tarefa(db, usuario, tarefa_id)
    q = db.query(NotaTarefa).filter_by(tarefa_id=t.id)
    if usuario.papel == "cliente":
        q = q.filter(NotaTarefa.interna.is_(False))
    notas = q.order_by(NotaTarefa.id).all()
    nomes = _nomes(db, {t.responsavel_id, t.criado_por_id})
    projeto = db.get(Projeto, t.projeto_id)
    return {**_tarefa_dict(t, nomes, _hoje(), {projeto.id: projeto.nome}),
            "notas": [{"id": n.id, "texto": n.texto, "autor": n.autor_nome, "interna": bool(n.interna),
                       "criada_em": n.criada_em} for n in notas]}


@router.patch("/tarefas/{tarefa_id}")
def editar_tarefa(tarefa_id: int, dados: EdicaoTarefa, usuario: Usuario = Depends(usuario_atual),
                  db: Session = Depends(get_db)):
    """Consultor e admin editam tudo; o operador muda o status e, nas tarefas que criou, os detalhes."""
    _exigir(acesso.pode_executar(usuario), "Pelo seu acesso você acompanha as tarefas.")
    t = _tarefa(db, usuario, tarefa_id)
    detalhes = any(v is not None for v in (dados.titulo, dados.descricao, dados.responsavel_id, dados.prazo,
                                           dados.visivel_cliente)) or dados.sem_responsavel or dados.sem_prazo
    if detalhes:
        _exigir(acesso.pode_planejar(usuario) or t.criado_por_id == usuario.id,
                "O operador muda o status e registra observações; os detalhes da tarefa ficam com o consultor.")
    if dados.titulo is not None:
        t.titulo = dados.titulo.strip()
    if dados.descricao is not None:
        t.descricao = dados.descricao.strip()
    if dados.sem_responsavel:
        t.responsavel_id = None
    elif dados.responsavel_id is not None:
        t.responsavel_id = _responsavel_ok(db, usuario, t.cliente_id, dados.responsavel_id)
    if dados.sem_prazo:
        t.prazo = None
    elif dados.prazo is not None:
        t.prazo = _data_ok(dados.prazo)
    if dados.visivel_cliente is not None:
        t.visivel_cliente = dados.visivel_cliente
    if dados.status is not None and dados.status != t.status:
        antes = STATUS_TAREFA.get(t.status, t.status)
        t.status = _status_ok(dados.status)
        t.concluida_em = _agora() if t.status == "concluida" else None
        db.add(NotaTarefa(tarefa_id=t.id, autor_id=usuario.id, autor_nome=usuario.nome,
                          texto=f"Status: {antes} → {STATUS_TAREFA[t.status]}"))
        _registrar_tarefa(db, usuario, t, f"Mudou a tarefa “{t.titulo}” para {STATUS_TAREFA[t.status].lower()}")
    db.commit()
    return {"ok": True}


@router.delete("/tarefas/{tarefa_id}")
def excluir_tarefa(tarefa_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir(acesso.pode_planejar(usuario), "Tarefas são excluídas pelo administrador ou pelo consultor.")
    t = _tarefa(db, usuario, tarefa_id)
    db.query(NotaTarefa).filter_by(tarefa_id=t.id).delete()
    _registrar_tarefa(db, usuario, t, f"Excluiu a tarefa “{t.titulo}”")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/tarefas/{tarefa_id}/notas")
def nova_nota(tarefa_id: int, dados: NovaNota, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir(acesso.pode_executar(usuario), "Para falar com a equipe, use o chat de dúvidas da tarefa.")
    t = _tarefa(db, usuario, tarefa_id)
    texto = dados.texto.strip()
    if not texto:
        raise HTTPException(400, "Escreva a observação.")
    db.add(NotaTarefa(tarefa_id=t.id, autor_id=usuario.id, autor_nome=usuario.nome, texto=texto, interna=dados.interna))
    t.atualizado_em = _agora()
    db.commit()
    return {"ok": True}


def _reuniao_dict(r: Reuniao) -> dict:
    return {"id": r.id, "cliente_id": r.cliente_id, "projeto_id": r.projeto_id, "data": r.data, "titulo": r.titulo,
            "resumo": r.resumo, "proximos_passos": r.proximos_passos, "autor": r.autor_nome, "autor_id": r.autor_id,
            "criada_em": r.criada_em}


def _reuniao(db: Session, usuario: Usuario, reuniao_id: int) -> Reuniao:
    r = db.get(Reuniao, reuniao_id)
    if not r or r.empresa_id != usuario.empresa_id or usuario.papel not in acesso.EQUIPE:
        raise HTTPException(404, "Reunião não encontrada.")
    _cliente_ok(db, usuario, r.cliente_id)
    return r


@router.get("/reunioes")
def listar_reunioes(cliente_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir(usuario.papel in acesso.EQUIPE, "Os registros de reunião são da equipe.")
    cid = _cliente_ok(db, usuario, cliente_id)
    return [_reuniao_dict(r) for r in db.query(Reuniao).filter_by(cliente_id=cid).order_by(Reuniao.data.desc(), Reuniao.id.desc())]


@router.post("/reunioes")
def criar_reuniao(dados: DadosReuniao, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir(acesso.pode_planejar(usuario), "Reuniões são registradas pelo consultor ou pelo administrador.")
    cid = _cliente_ok(db, usuario, dados.cliente_id)
    if dados.projeto_id and _projeto(db, usuario, dados.projeto_id).cliente_id != cid:
        raise HTTPException(400, "O projeto é de outro cliente.")
    r = Reuniao(empresa_id=usuario.empresa_id, cliente_id=cid, projeto_id=dados.projeto_id, data=_data_ok(dados.data),
                titulo=dados.titulo.strip() or "Reunião", resumo=dados.resumo.strip(),
                proximos_passos=dados.proximos_passos.strip(), autor_id=usuario.id, autor_nome=usuario.nome)
    db.add(r)
    db.flush()
    registrar(db, usuario.empresa_id, "reuniao", f"Registrou a reunião “{r.titulo}” de {r.data}", cliente_id=cid, usuario=usuario)
    db.commit()
    return _reuniao_dict(r)


@router.put("/reunioes/{reuniao_id}")
def editar_reuniao(reuniao_id: int, dados: DadosReuniao, usuario: Usuario = Depends(usuario_atual),
                   db: Session = Depends(get_db)):
    _exigir(acesso.pode_planejar(usuario), "Reuniões são editadas pelo consultor ou pelo administrador.")
    r = _reuniao(db, usuario, reuniao_id)
    if dados.projeto_id and _projeto(db, usuario, dados.projeto_id).cliente_id != r.cliente_id:
        raise HTTPException(400, "O projeto é de outro cliente.")
    r.projeto_id, r.data = dados.projeto_id, _data_ok(dados.data)
    r.titulo, r.resumo, r.proximos_passos = dados.titulo.strip() or "Reunião", dados.resumo.strip(), dados.proximos_passos.strip()
    db.commit()
    return _reuniao_dict(r)


@router.delete("/reunioes/{reuniao_id}")
def excluir_reuniao(reuniao_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    r = _reuniao(db, usuario, reuniao_id)
    _exigir(usuario.papel == "admin" or r.autor_id == usuario.id, "Só quem registrou a reunião (ou o administrador) pode excluir.")
    db.delete(r)
    db.commit()
    return {"ok": True}


ACOES_DO_CLIENTE = ["copia", "criacao", "edicao", "publicacao", "exclusao", "conta", "lote", "aprovacao", "preco",
                    "pergunta", "tarefa", "projeto"]


@router.get("/acompanhamento")
def acompanhamento(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Resumo do projeto para a tela do cliente: o que foi feito, o que está em
    andamento, o que depende dele e os próximos passos."""
    cid = _cliente_ok(db, usuario, cliente_id)
    cliente = db.get(Cliente, cid)
    ehcliente = usuario.papel == "cliente"
    q = db.query(Tarefa).filter(Tarefa.cliente_id == cid)
    if ehcliente:
        q = q.filter(Tarefa.visivel_cliente.is_(True))
    tarefas = q.all()
    nomes = _nomes(db, {t.responsavel_id for t in tarefas} | {t.criado_por_id for t in tarefas})
    projetos = {p.id: p for p in db.query(Projeto).filter_by(cliente_id=cid)}
    hoje = _hoje()
    lista = [_tarefa_dict(t, nomes, hoje, {k: p.nome for k, p in projetos.items()}) for t in tarefas]
    contagem = {s: sum(1 for t in tarefas if t.status == s) for s in STATUS_TAREFA}
    abertas = sorted([x for x in lista if x["status"] in ("pendente", "andamento", "ajuste")],
                     key=lambda x: (x["prazo"] is None, x["prazo"] or "", x["id"]))
    concluidas = sorted([x for x in lista if x["status"] == "concluida"],
                        key=lambda x: x["concluida_em"] or x["atualizado_em"], reverse=True)
    equipe = (db.query(Usuario.id, Usuario.nome, Usuario.papel, Usuario.foto).join(AcessoCliente, AcessoCliente.usuario_id == Usuario.id)
              .filter(AcessoCliente.cliente_id == cid, Usuario.ativo.is_(True)).order_by(Usuario.papel, Usuario.nome).all())
    hist = db.query(Atividade).filter(Atividade.cliente_id == cid)
    if ehcliente:
        hist = hist.filter(Atividade.acao.in_(ACOES_DO_CLIENTE))
    historico = hist.order_by(Atividade.id.desc()).limit(25).all()
    total = len(tarefas)
    return {"cliente": {"id": cliente.id, "nome": cliente.nome},
            "projetos": [{"id": p.id, "nome": p.nome, "descricao": p.descricao, "status": p.status,
                          "status_nome": STATUS_PROJETO.get(p.status, p.status),
                          "tarefas": sum(1 for t in tarefas if t.projeto_id == p.id),
                          "concluidas": sum(1 for t in tarefas if t.projeto_id == p.id and t.status == "concluida")}
                         for p in sorted(projetos.values(), key=lambda p: (p.status != "ativo", -p.id))],
            "totais": {"tarefas": total, "por_status": contagem,
                       "progresso": round(100 * contagem["concluida"] / total) if total else 0,
                       "atrasadas": sum(1 for x in lista if x["atrasada"])},
            "proximos": abertas[:8],
            "depende_de_voce": [x for x in lista if x["status"] == "aguardando_cliente"],
            "concluidas_recentes": concluidas[:8],
            "tarefas": lista,
            "equipe": [{"nome": n, "papel": acesso.PAPEIS.get(p, p), "foto": f or "", **({} if ehcliente else {"id": uid, "papel_id": p})}
                       for uid, n, p, f in equipe],
            "historico": [{"id": a.id, "acao": a.acao, "descricao": a.descricao, "ator": a.ator, "criada_em": a.criada_em}
                          for a in historico]}


@router.get("/visao-geral")
def visao_geral(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Painel de entrada da equipe. Admin vê a operação inteira; consultor e
    operador, só a própria carteira."""
    _exigir(usuario.papel in acesso.EQUIPE, "Esta tela é da equipe.")
    clientes = acesso.clientes_acessiveis(db, usuario)
    ids = [c.id for c in clientes] or [0]
    hoje = _hoje()
    contagem: dict[int, dict] = {}
    for cid, st, n in (db.query(Tarefa.cliente_id, Tarefa.status, func.count(Tarefa.id))
                       .filter(Tarefa.cliente_id.in_(ids)).group_by(Tarefa.cliente_id, Tarefa.status)):
        contagem.setdefault(cid, {})[st] = n
    atrasadas = dict(db.query(Tarefa.cliente_id, func.count(Tarefa.id))
                     .filter(Tarefa.cliente_id.in_(ids), Tarefa.status.in_(ABERTAS), Tarefa.prazo.isnot(None),
                             Tarefa.prazo < hoje).group_by(Tarefa.cliente_id).all())
    projetos = dict(db.query(Projeto.cliente_id, func.count(Projeto.id))
                    .filter(Projeto.cliente_id.in_(ids), Projeto.status == "ativo").group_by(Projeto.cliente_id).all())
    ultima = dict(db.query(Atividade.cliente_id, func.max(Atividade.criada_em))
                  .filter(Atividade.cliente_id.in_(ids)).group_by(Atividade.cliente_id).all())
    duvidas = svc_conversas.resumo_nao_lidas(db, usuario)
    usa_duvidas = svc_conversas.usa_duvidas(db, usuario)
    aguardando = svc_conversas.aguardando_resposta(db, ids) if usa_duvidas else {}
    equipe: dict[int, dict[str, list[str]]] = {}
    for cid, nome, papel in (db.query(AcessoCliente.cliente_id, Usuario.nome, Usuario.papel)
                             .join(Usuario, Usuario.id == AcessoCliente.usuario_id)
                             .filter(AcessoCliente.cliente_id.in_(ids), Usuario.ativo.is_(True))):
        equipe.setdefault(cid, {"consultores": [], "operadores": []})["consultores" if papel == "consultor" else "operadores"].append(nome)
    linhas = []
    for c in clientes:
        st = contagem.get(c.id, {})
        abertas = sum(v for k, v in st.items() if k in ABERTAS)
        total = sum(st.values())
        linhas.append({"id": c.id, "nome": c.nome, "projetos_ativos": projetos.get(c.id, 0), "tarefas": total,
                       "abertas": abertas, "por_status": st, "atrasadas": atrasadas.get(c.id, 0),
                       "progresso": round(100 * st.get("concluida", 0) / total) if total else 0,
                       "duvidas_nao_lidas": duvidas["por_cliente"].get(c.id, 0), "aguardando_resposta": aguardando.get(c.id, 0),
                       "consultores": sorted(equipe.get(c.id, {}).get("consultores", [])),
                       "operadores": sorted(equipe.get(c.id, {}).get("operadores", [])),
                       "ultima_atividade": ultima.get(c.id)})
    desde = _agora() - timedelta(days=30)
    carga: dict[int, dict] = {}
    for rid, st, n in (db.query(Tarefa.responsavel_id, Tarefa.status, func.count(Tarefa.id))
                       .filter(Tarefa.cliente_id.in_(ids), Tarefa.responsavel_id.isnot(None))
                       .group_by(Tarefa.responsavel_id, Tarefa.status)):
        carga.setdefault(rid, {"abertas": 0, "concluidas_30d": 0, "atrasadas": 0})
        if st in ABERTAS:
            carga[rid]["abertas"] += n
    for rid, n in (db.query(Tarefa.responsavel_id, func.count(Tarefa.id))
                   .filter(Tarefa.cliente_id.in_(ids), Tarefa.status == "concluida", Tarefa.concluida_em >= desde)
                   .group_by(Tarefa.responsavel_id)):
        if rid:
            carga.setdefault(rid, {"abertas": 0, "concluidas_30d": 0, "atrasadas": 0})["concluidas_30d"] = n
    for rid, n in (db.query(Tarefa.responsavel_id, func.count(Tarefa.id))
                   .filter(Tarefa.cliente_id.in_(ids), Tarefa.status.in_(ABERTAS), Tarefa.prazo.isnot(None),
                           Tarefa.prazo < hoje, Tarefa.responsavel_id.isnot(None)).group_by(Tarefa.responsavel_id)):
        carga.setdefault(rid, {"abertas": 0, "concluidas_30d": 0, "atrasadas": 0})["atrasadas"] = n
    pessoas = {u.id: u for u in db.query(Usuario).filter(Usuario.id.in_(set(carga) or {0}))}
    if usuario.papel == "admin":
        for u in db.query(Usuario).filter(Usuario.empresa_id == usuario.empresa_id, Usuario.ativo.is_(True),
                                          Usuario.papel.in_(acesso.ATRIBUIVEIS)):
            pessoas.setdefault(u.id, u)
            carga.setdefault(u.id, {"abertas": 0, "concluidas_30d": 0, "atrasadas": 0})
    clientes_por_pessoa = dict(db.query(AcessoCliente.usuario_id, func.count(AcessoCliente.cliente_id))
                               .filter(AcessoCliente.usuario_id.in_(set(pessoas) or {0}), AcessoCliente.cliente_id.in_(ids))
                               .group_by(AcessoCliente.usuario_id).all())
    tabela_equipe = sorted([{"id": uid, "nome": pessoas[uid].nome, "papel": pessoas[uid].papel, "foto": pessoas[uid].foto or "",
                             "clientes": clientes_por_pessoa.get(uid, 0), **v}
                            for uid, v in carga.items() if uid in pessoas],
                           key=lambda x: (x["papel"], x["nome"]))
    recentes = (db.query(Tarefa).filter(Tarefa.cliente_id.in_(ids), Tarefa.status == "concluida")
                .order_by(Tarefa.concluida_em.desc()).limit(8).all())
    minhas = (db.query(Tarefa).filter(Tarefa.cliente_id.in_(ids), Tarefa.responsavel_id == usuario.id,
                                      Tarefa.status.in_(ABERTAS))
              .order_by(Tarefa.prazo.is_(None), Tarefa.prazo).limit(10).all())
    nomes = _nomes(db, {t.responsavel_id for t in recentes + minhas} | {t.criado_por_id for t in recentes + minhas})
    nomes_cli = {c.id: c.nome for c in clientes}
    sem_equipe = [c["nome"] for c in linhas if not c["operadores"] and not c["consultores"]]
    totais = {"clientes": len(clientes), "projetos_ativos": sum(projetos.values()),
              "abertas": sum(x["abertas"] for x in linhas), "atrasadas": sum(atrasadas.values()),
              "aguardando_cliente": sum(x["por_status"].get("aguardando_cliente", 0) for x in linhas),
              "duvidas_nao_lidas": duvidas["total"], "aguardando_resposta": sum(aguardando.values()),
              "concluidas_30d": db.query(Tarefa).filter(Tarefa.cliente_id.in_(ids), Tarefa.status == "concluida",
                                                        Tarefa.concluida_em >= desde).count()}
    if usuario.papel == "admin":
        totais["usuarios"] = db.query(Usuario).filter_by(empresa_id=usuario.empresa_id, ativo=True).count()
    return {"totais": totais, "clientes": linhas, "equipe": tabela_equipe, "sem_equipe": sem_equipe if usuario.papel == "admin" else [],
            "usa_duvidas": usa_duvidas,
            "concluidas_recentes": [_tarefa_dict(t, nomes, hoje, clientes=nomes_cli) for t in recentes],
            "minhas": [_tarefa_dict(t, nomes, hoje, clientes=nomes_cli) for t in minhas]}
