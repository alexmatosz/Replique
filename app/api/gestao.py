"""Gestão: clientes, usuários, quem atende quem, Painel e atividades.

- admin: cria clientes e logins, define os operadores de cada cliente e vê tudo;
- operador: vê o Painel dos clientes que atende;
- consultor: acompanha os clientes atribuídos a ele (Painel, atividades, relatórios), sem editar;
- cliente: vê o Painel e as atividades da própria loja (quem fez o quê).
"""

from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.deps import exigir_admin, usuario_atual
from app.db import get_db
from app.models import AcessoCliente, Anuncio, Atividade, Cliente, ContaMarketplace, Publicacao, Usuario
from app import config
from app.config import PUBLIC_BASE_URL
from app.security import descriptografar, hash_senha, novo_token_convite, senha_fraca
from app.services import acesso
from app.services import ferramentas as permissoes
from app.services.auditoria import registrar

ACOES_DO_CLIENTE = ["copia", "criacao", "edicao", "publicacao", "exclusao", "conta", "lote", "aprovacao", "preco", "pergunta"]

router = APIRouter(prefix="/api", tags=["gestao"])


class NovoCliente(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    documento: str = Field(default="", max_length=30)


class EdicaoCliente(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=200)
    documento: str | None = Field(default=None, max_length=30)
    ativo: bool | None = None
    exige_aprovacao: bool | None = None
    vendas_lucro: bool | None = None
    estudo: bool | None = None
    ferramentas_off: list[str] | None = None
    inicio_assessoria: date | None = None


class NovoUsuario(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    senha: str = Field(min_length=8, max_length=200)
    papel: str = "operador"
    clientes: list[int] = []


class EdicaoUsuario(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=200)
    papel: str | None = None
    ativo: bool | None = None
    senha: str | None = Field(default=None, min_length=8, max_length=200)


class ListaIds(BaseModel):
    ids: list[int]


def _cliente(db: Session, usuario: Usuario, cliente_id: int) -> Cliente:
    if not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(404, "Cliente não encontrado.")
    return db.get(Cliente, cliente_id)


def _novo_login(db: Session, empresa_id: int, nome: str, email: str, senha: str, papel: str,
                cliente_id: int | None = None) -> Usuario:
    email = email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "E-mail inválido.")
    if senha_fraca(senha, (email, nome)):
        raise HTTPException(400, "Senha muito comum. Use pelo menos 8 caracteres misturando palavras, números ou símbolos.")
    if db.query(Usuario).filter_by(email=email).first():
        raise HTTPException(400, "Já existe um acesso com esse e-mail.")
    u = Usuario(empresa_id=empresa_id, nome=nome.strip(), email=email, senha_hash=hash_senha(senha),
                papel=papel, cliente_id=cliente_id)
    db.add(u)
    db.flush()
    return u


def _definir_clientes(db: Session, operador: Usuario, ids: list[int]):
    validos = {c.id for c in db.query(Cliente).filter(Cliente.empresa_id == operador.empresa_id,
                                                      Cliente.id.in_(set(ids) or {0}))}
    if set(ids) - validos:
        raise HTTPException(400, "Algum dos clientes informados não existe.")
    db.query(AcessoCliente).filter_by(usuario_id=operador.id).delete()
    for cid in validos:
        db.add(AcessoCliente(usuario_id=operador.id, cliente_id=cid))


def _conexao_ml(db: Session, cliente_ids: list[int]) -> dict[int, dict]:
    """Situação da conta do ML de cada cliente (para o seletor e o Painel)."""
    saida = {}
    contas = (db.query(ContaMarketplace).filter(ContaMarketplace.cliente_id.in_(cliente_ids or [0]),
                                                ContaMarketplace.plataforma == "mercadolivre",
                                                ContaMarketplace.ativa.is_(True))
              .order_by(ContaMarketplace.id).all())
    for c in contas:
        cred = descriptografar(c.credenciais_cript)
        expira = (cred.get("obtido_em", 0) + cred.get("expires_in", 21600)) if cred.get("access_token") else 0
        saida[c.cliente_id] = {"conectada": bool(cred.get("access_token")), "apelido": c.apelido,
                               "renovacao_automatica": bool(cred.get("refresh_token")), "expira_em": expira}
    return saida


def _usuario_dict(db: Session, u: Usuario) -> dict:
    clientes = []
    if u.papel in acesso.ATRIBUIVEIS:
        clientes = [a.cliente_id for a in db.query(AcessoCliente).filter_by(usuario_id=u.id)]
    cliente = db.get(Cliente, u.cliente_id) if u.cliente_id else None
    return {"id": u.id, "nome": u.nome, "email": u.email, "papel": u.papel, "ativo": bool(u.ativo), "foto": u.foto or "",
            "cliente_id": u.cliente_id, "cliente_nome": cliente.nome if cliente else "", "clientes": clientes,
            "dois_fatores": bool(u.totp_ativo),
            "criado_em": u.criado_em}


@router.get("/clientes")
def listar_clientes(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Clientes que o usuário atende, com a situação do ML e números básicos."""
    clientes = acesso.clientes_acessiveis(db, usuario, incluir_inativos=True)
    ids = [c.id for c in clientes]
    ml = _conexao_ml(db, ids)
    rascunhos = dict(db.query(Anuncio.cliente_id, func.count(Anuncio.id))
                     .filter(Anuncio.cliente_id.in_(ids or [0]), Anuncio.excluido_em.is_(None))
                     .group_by(Anuncio.cliente_id).all())
    publicados = dict(db.query(Publicacao.cliente_id, func.count(Publicacao.id))
                      .filter(Publicacao.cliente_id.in_(ids or [0]), Publicacao.sucesso.is_(True),
                              Publicacao.demo.is_(False)).group_by(Publicacao.cliente_id).all())
    operadores: dict[int, list[str]] = {}
    consultores: dict[int, list[str]] = {}
    for cid, nome, papel in (db.query(AcessoCliente.cliente_id, Usuario.nome, Usuario.papel)
                             .join(Usuario, Usuario.id == AcessoCliente.usuario_id)
                             .filter(AcessoCliente.cliente_id.in_(ids or [0]), Usuario.ativo.is_(True))):
        (consultores if papel == "consultor" else operadores).setdefault(cid, []).append(nome)
    return [{"id": c.id, "nome": c.nome, "documento": c.documento, "ativo": bool(c.ativo),
             "ml": ml.get(c.id, {"conectada": False}), "rascunhos": rascunhos.get(c.id, 0),
             "publicados": publicados.get(c.id, 0), "operadores": sorted(operadores.get(c.id, [])),
             "consultores": sorted(consultores.get(c.id, [])), "vendas_lucro": bool(c.vendas_lucro),
             "origem": c.origem or "admin", "criado_em": c.criado_em} for c in clientes]


@router.post("/clientes")
def criar_cliente(dados: NovoCliente, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    c = Cliente(empresa_id=usuario.empresa_id, nome=dados.nome.strip(), documento=dados.documento.strip(),
                vendas_lucro=config.VENDAS_LUCRO_PADRAO)
    db.add(c)
    db.flush()
    registrar(db, usuario.empresa_id, "cliente", f"Cadastrou o cliente “{c.nome}”", cliente_id=c.id, usuario=usuario)
    db.commit()
    return {"id": c.id, "nome": c.nome}


@router.get("/clientes/{cliente_id}")
def ver_cliente(cliente_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    c = _cliente(db, usuario, cliente_id)
    saida = {"id": c.id, "nome": c.nome, "documento": c.documento, "ativo": bool(c.ativo), "criado_em": c.criado_em,
             "exige_aprovacao": bool(c.exige_aprovacao), "vendas_lucro": bool(c.vendas_lucro), "estudo": bool(c.estudo),
             "inicio_assessoria": (c.inicio_assessoria or c.criado_em.date()).isoformat(),
             "ml": _conexao_ml(db, [c.id]).get(c.id, {"conectada": False})}
    if usuario.papel == "admin":
        saida["logins"] = [_usuario_dict(db, u) for u in db.query(Usuario).filter_by(cliente_id=c.id).order_by(Usuario.id)]
        saida["operadores"] = [a.usuario_id for a in db.query(AcessoCliente).filter_by(cliente_id=c.id)]
        da_funcao = permissoes.liberadas("cliente", usuario.empresa.ferramentas_off)
        saida["ferramentas"] = {"possiveis": [{"id": k, "nome": n, "grupo": g} for k, n, g in permissoes.CATALOGO
                                              if k in da_funcao],
                                "desligadas": permissoes.normalizar_cliente(c.ferramentas_off)}
    return saida


@router.patch("/clientes/{cliente_id}")
def editar_cliente(cliente_id: int, dados: EdicaoCliente, usuario: Usuario = Depends(exigir_admin),
                   db: Session = Depends(get_db)):
    c = _cliente(db, usuario, cliente_id)
    mudancas = []
    if dados.nome is not None and dados.nome.strip() != c.nome:
        mudancas.append(f"nome “{c.nome}” → “{dados.nome.strip()}”")
        c.nome = dados.nome.strip()
    if dados.documento is not None:
        c.documento = dados.documento.strip()
    if dados.ativo is not None and dados.ativo != c.ativo:
        c.ativo = dados.ativo
        mudancas.append("reativado" if dados.ativo else "desativado (logins do cliente bloqueados)")
    if dados.exige_aprovacao is not None and dados.exige_aprovacao != bool(c.exige_aprovacao):
        c.exige_aprovacao = dados.exige_aprovacao
        mudancas.append("passa a aprovar cada anúncio antes da publicação" if dados.exige_aprovacao
                        else "não precisa mais aprovar os anúncios")
    if dados.vendas_lucro is not None and dados.vendas_lucro != bool(c.vendas_lucro):
        c.vendas_lucro = dados.vendas_lucro
        mudancas.append("módulo Vendas e Lucro liberado" if dados.vendas_lucro else "módulo Vendas e Lucro desligado")
    if dados.estudo is not None and dados.estudo != bool(c.estudo):
        c.estudo = dados.estudo
        mudancas.append("passa a ser cliente interno de estudo (extensão)" if dados.estudo
                        else "deixa de ser cliente interno de estudo")
    if dados.inicio_assessoria is not None and dados.inicio_assessoria != c.inicio_assessoria:
        if dados.inicio_assessoria > date.today():
            raise HTTPException(400, "O início da assessoria não pode ser no futuro.")
        c.inicio_assessoria = dados.inicio_assessoria
        mudancas.append(f"início da assessoria em {dados.inicio_assessoria:%d/%m/%Y}")
    if dados.ferramentas_off is not None:
        novas = permissoes.normalizar_cliente(dados.ferramentas_off)
        if novas != permissoes.normalizar_cliente(c.ferramentas_off):
            c.ferramentas_off = novas
            mudancas.append(f"ferramentas do login do cliente: {len(novas)} desligada(s)" if novas
                            else "todas as ferramentas do login do cliente liberadas")
    if mudancas:
        registrar(db, usuario.empresa_id, "cliente", f"Alterou o cliente “{c.nome}”: {'; '.join(mudancas)}",
                  cliente_id=c.id, usuario=usuario)
    db.commit()
    return {"ok": True}


@router.put("/clientes/{cliente_id}/operadores")
def definir_operadores(cliente_id: int, dados: ListaIds, usuario: Usuario = Depends(exigir_admin),
                       db: Session = Depends(get_db)):
    c = _cliente(db, usuario, cliente_id)
    operadores = {u.id: u for u in db.query(Usuario).filter(Usuario.empresa_id == usuario.empresa_id,
                                                            Usuario.papel.in_(acesso.ATRIBUIVEIS),
                                                            Usuario.id.in_(set(dados.ids) or {0}))}
    if set(dados.ids) - set(operadores):
        raise HTTPException(400, "Só operadores e consultores da equipe podem ser atribuídos a um cliente.")
    db.query(AcessoCliente).filter_by(cliente_id=c.id).delete()
    for uid in operadores:
        db.add(AcessoCliente(usuario_id=uid, cliente_id=c.id))
    nomes = ", ".join(sorted(u.nome for u in operadores.values())) or "nenhum"
    registrar(db, usuario.empresa_id, "cliente", f"Definiu a equipe de “{c.nome}”: {nomes}",
              cliente_id=c.id, usuario=usuario)
    db.commit()
    return {"ok": True}


@router.post("/clientes/{cliente_id}/logins")
def criar_login_cliente(cliente_id: int, dados: NovoUsuario, usuario: Usuario = Depends(exigir_admin),
                        db: Session = Depends(get_db)):
    """Login do lojista: ele entra, autoriza a conta do marketplace e acompanha o trabalho."""
    c = _cliente(db, usuario, cliente_id)
    u = _novo_login(db, usuario.empresa_id, dados.nome, dados.email, dados.senha, "cliente", c.id)
    registrar(db, usuario.empresa_id, "usuario", f"Criou o acesso de cliente de {u.nome} ({u.email})",
              cliente_id=c.id, usuario=usuario)
    db.commit()
    return {"id": u.id}


def _convite_dict(token: str) -> dict:
    return {"token": token, "url": f"{PUBLIC_BASE_URL}/#/convite/{token}"}


@router.get("/empresa/convite")
def ver_convite(usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    """Link que a empresa envia aos lojistas: quem se cadastra por ele vira cliente DESTA empresa."""
    if not usuario.empresa.convite_token:
        usuario.empresa.convite_token = novo_token_convite()
        db.commit()
    return _convite_dict(usuario.empresa.convite_token)


@router.post("/empresa/convite")
def trocar_convite(usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    """Gera um link novo; o anterior para de funcionar (use se o link vazar)."""
    usuario.empresa.convite_token = novo_token_convite()
    registrar(db, usuario.empresa_id, "cliente", "Gerou um novo link de cadastro de clientes (o anterior foi desativado)",
              usuario=usuario)
    db.commit()
    return _convite_dict(usuario.empresa.convite_token)


@router.get("/empresa/usuarios")
def listar_usuarios(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if usuario.papel != "admin":
        return [_usuario_dict(db, usuario)]
    return [_usuario_dict(db, u) for u in db.query(Usuario).filter_by(empresa_id=usuario.empresa_id).order_by(Usuario.id)]


@router.post("/empresa/usuarios")
def criar_usuario(dados: NovoUsuario, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    if dados.papel not in acesso.EQUIPE:
        raise HTTPException(400, "Papel deve ser admin, operador ou consultor. Acesso de cliente é criado na tela Clientes.")
    novo = _novo_login(db, usuario.empresa_id, dados.nome, dados.email, dados.senha, dados.papel)
    if dados.papel in acesso.ATRIBUIVEIS:
        _definir_clientes(db, novo, dados.clientes)
    registrar(db, usuario.empresa_id, "usuario",
              f"Criou o acesso de {acesso.PAPEIS[novo.papel].lower()} de {novo.nome} ({novo.email})", usuario=usuario)
    db.commit()
    return {"id": novo.id}


@router.patch("/empresa/usuarios/{usuario_id}")
def editar_usuario(usuario_id: int, dados: EdicaoUsuario, usuario: Usuario = Depends(exigir_admin),
                   db: Session = Depends(get_db)):
    u = db.get(Usuario, usuario_id)
    if not u or u.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Usuário não encontrado.")
    mudancas = []
    if dados.papel is not None and dados.papel != u.papel:
        if u.papel == "cliente" or dados.papel not in acesso.EQUIPE:
            raise HTTPException(400, "Só dá para trocar entre admin, operador e consultor.")
        mudancas.append(f"papel {u.papel} → {dados.papel}")
        u.papel = dados.papel
        u.sessao_versao = (u.sessao_versao or 0) + 1
    if dados.ativo is not None and dados.ativo != u.ativo:
        if u.id == usuario.id:
            raise HTTPException(400, "Você não pode desativar o seu próprio acesso.")
        u.ativo = dados.ativo
        u.sessao_versao = (u.sessao_versao or 0) + 1
        mudancas.append("reativado" if dados.ativo else "desativado")
    if dados.nome is not None:
        u.nome = dados.nome.strip()
    if dados.senha:
        raise HTTPException(400, "Por segurança, o administrador não escolhe a senha de ninguém. Use “Link de senha”: a pessoa cria a própria.")
    if dados.senha:
        if senha_fraca(dados.senha, (u.email, u.nome)):
            raise HTTPException(400, "Senha muito comum. Use pelo menos 8 caracteres misturando palavras, números ou símbolos.")
        u.senha_hash = hash_senha(dados.senha)
        u.sessao_versao = (u.sessao_versao or 0) + 1
        mudancas.append("senha redefinida (sessões abertas encerradas)")
    db.flush()
    ativos_admin = db.query(Usuario).filter_by(empresa_id=usuario.empresa_id, papel="admin", ativo=True).count()
    if ativos_admin == 0:
        raise HTTPException(400, "A empresa precisa de pelo menos um administrador ativo.")
    if mudancas:
        registrar(db, usuario.empresa_id, "usuario", f"Alterou o acesso de {u.nome}: {'; '.join(mudancas)}",
                  cliente_id=u.cliente_id, usuario=usuario)
    db.commit()
    return _usuario_dict(db, u)


@router.put("/empresa/usuarios/{usuario_id}/clientes")
def definir_clientes_do_operador(usuario_id: int, dados: ListaIds, usuario: Usuario = Depends(exigir_admin),
                                 db: Session = Depends(get_db)):
    u = db.get(Usuario, usuario_id)
    if not u or u.empresa_id != usuario.empresa_id or u.papel not in acesso.ATRIBUIVEIS:
        raise HTTPException(404, "Operador ou consultor não encontrado.")
    _definir_clientes(db, u, dados.ids)
    registrar(db, usuario.empresa_id, "usuario", f"Definiu os clientes atendidos por {u.nome} ({len(set(dados.ids))})",
              usuario=usuario)
    db.commit()
    return _usuario_dict(db, u)


def _escopo(db: Session, usuario: Usuario, cliente_id: int | None) -> list[int]:
    ids = [c.id for c in acesso.clientes_acessiveis(db, usuario, incluir_inativos=True)]
    if cliente_id:
        if cliente_id not in ids:
            raise HTTPException(404, "Cliente não encontrado.")
        return [cliente_id]
    return ids


def _desde(dias: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=dias)


@router.get("/painel")
def painel(dias: int = Query(30, ge=1, le=365), cliente_id: int | None = None, usuario_id: int | None = None,
           usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Números do período: rascunhos criados e publicações por cliente, por operador e por dia."""
    ids = _escopo(db, usuario, cliente_id) or [0]
    desde = _desde(dias)
    real = case((Publicacao.sucesso.is_(True) & Publicacao.demo.is_(False), 1), else_=0)
    simulado = case((Publicacao.sucesso.is_(True) & Publicacao.demo.is_(True), 1), else_=0)
    falha = case((Publicacao.sucesso.is_(False), 1), else_=0)

    pubs = db.query(Publicacao).filter(Publicacao.cliente_id.in_(ids), Publicacao.criada_em >= desde)
    anuncios = db.query(Anuncio).filter(Anuncio.cliente_id.in_(ids), Anuncio.criado_em >= desde)
    if usuario_id:
        pubs = pubs.filter(Publicacao.usuario_id == usuario_id)
        anuncios = anuncios.filter(Anuncio.criado_por_id == usuario_id)

    def agrupar(coluna_pub, coluna_anuncio):
        linhas: dict = {}
        for chave, r, s, f in pubs.with_entities(coluna_pub, func.sum(real), func.sum(simulado), func.sum(falha)).group_by(coluna_pub):
            linhas[chave] = {"publicados": int(r or 0), "simulados": int(s or 0), "falhas": int(f or 0), "rascunhos": 0}
        for chave, n in anuncios.with_entities(coluna_anuncio, func.count(Anuncio.id)).group_by(coluna_anuncio):
            linhas.setdefault(chave, {"publicados": 0, "simulados": 0, "falhas": 0, "rascunhos": 0})["rascunhos"] = n
        return linhas

    por_cliente = agrupar(Publicacao.cliente_id, Anuncio.cliente_id)
    por_usuario = agrupar(Publicacao.usuario_id, Anuncio.criado_por_id)
    clientes = {c.id: c for c in db.query(Cliente).filter(Cliente.id.in_(ids))}
    nomes = {u.id: u for u in db.query(Usuario).filter(Usuario.id.in_([k for k in por_usuario if k] or [0]))}
    ml = _conexao_ml(db, list(clientes))
    ultima = dict(db.query(Atividade.cliente_id, func.max(Atividade.criada_em))
                  .filter(Atividade.cliente_id.in_(ids)).group_by(Atividade.cliente_id).all())

    com_operador = {cid for (cid,) in db.query(AcessoCliente.cliente_id).join(Usuario, Usuario.id == AcessoCliente.usuario_id)
                    .filter(AcessoCliente.cliente_id.in_(ids), Usuario.ativo.is_(True))}
    zero = {"publicados": 0, "simulados": 0, "falhas": 0, "rascunhos": 0}
    tabela_clientes = sorted(
        [{"id": cid, "nome": c.nome, "ativo": bool(c.ativo), "com_operador": cid in com_operador,
          "origem": c.origem or "admin", "criado_em": c.criado_em, **por_cliente.get(cid, zero),
          "ml": ml.get(cid, {"conectada": False}), "ultima_atividade": ultima.get(cid)}
         for cid, c in clientes.items() if c.ativo or cid in por_cliente],
        key=lambda x: (-x["publicados"], -x["rascunhos"], x["nome"]))
    tabela_usuarios = sorted(
        [{"id": uid, "nome": nomes[uid].nome if uid in nomes else "Claude (MCP)",
          "papel": nomes[uid].papel if uid in nomes else "mcp", **v} for uid, v in por_usuario.items()],
        key=lambda x: (-x["publicados"], -x["rascunhos"]))

    por_dia = {str(d): (int(r or 0), int(s or 0)) for d, r, s in
               pubs.with_entities(func.date(Publicacao.criada_em), func.sum(real), func.sum(simulado))
               .group_by(func.date(Publicacao.criada_em))}
    hoje = datetime.now(timezone.utc).date()
    serie = []
    for i in range(min(dias, 60) - 1, -1, -1):
        dia = str(hoje - timedelta(days=i))
        r, s = por_dia.get(dia, (0, 0))
        serie.append({"dia": dia, "publicados": r, "simulados": s})

    totais = {k: sum(v[k] for v in por_cliente.values()) for k in zero}
    ativos = [c for c in tabela_clientes if c["ativo"]]
    totais.update({"clientes": len(ativos), "clientes_com_ml": sum(1 for c in ativos if c["ml"].get("conectada")),
                   "operadores_ativos": sum(1 for u in tabela_usuarios if u["publicados"] or u["rascunhos"])})
    return {"dias": dias, "totais": totais, "por_cliente": tabela_clientes, "por_usuario": tabela_usuarios,
            "por_dia": serie}


@router.get("/atividades")
def atividades(cliente_id: int | None = None, usuario_id: int | None = None, acao: str | None = None,
               antes_de: int | None = None, limite: int = Query(50, ge=1, le=200),
               desde: date | None = None, ate: date | None = None,
               usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Linha do tempo. Atividades sem cliente (ex.: criação de usuário) só aparecem para admin."""
    ids = _escopo(db, usuario, cliente_id)
    q = db.query(Atividade).filter(Atividade.empresa_id == usuario.empresa_id)
    if usuario.papel == "admin" and not cliente_id:
        q = q.filter((Atividade.cliente_id.in_(ids or [0])) | (Atividade.cliente_id.is_(None)))
    else:
        q = q.filter(Atividade.cliente_id.in_(ids or [0]))
    if usuario.papel == "cliente":
        q = q.filter(Atividade.acao.in_(ACOES_DO_CLIENTE))
    if usuario_id:
        q = q.filter(Atividade.usuario_id == usuario_id)
    if acao:
        q = q.filter(Atividade.acao == acao)
    if antes_de:
        q = q.filter(Atividade.id < antes_de)
    fuso = timezone(timedelta(hours=-3))
    if desde:
        q = q.filter(Atividade.criada_em >= datetime.combine(desde, time.min, fuso).astimezone(timezone.utc))
    if ate:
        q = q.filter(Atividade.criada_em < datetime.combine(ate + timedelta(days=1), time.min, fuso).astimezone(timezone.utc))
    lista = q.order_by(Atividade.id.desc()).limit(limite).all()
    clientes = {c.id: c.nome for c in db.query(Cliente).filter(Cliente.id.in_({a.cliente_id for a in lista if a.cliente_id} or {0}))}
    return [{"id": a.id, "acao": a.acao, "descricao": a.descricao, "ator": a.ator, "usuario_id": a.usuario_id,
             "cliente_id": a.cliente_id, "cliente_nome": clientes.get(a.cliente_id, ""), "anuncio_id": a.anuncio_id,
             "detalhes": a.detalhes or {}, "criada_em": a.criada_em} for a in lista]


class FerramentasIn(BaseModel):
    desligadas: dict[str, list[str]]


@router.get("/empresa/ferramentas")
def ver_ferramentas(usuario: Usuario = Depends(exigir_admin)):
    """Ferramentas de cada função (operador, consultor e cliente)."""
    return permissoes.catalogo_dict(usuario.empresa.ferramentas_off)


@router.put("/empresa/ferramentas")
def salvar_ferramentas(dados: FerramentasIn, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    novo = permissoes.normalizar(dados.desligadas)
    usuario.empresa.ferramentas_off = novo
    resumo = "; ".join(f"{acesso.PAPEIS[p].lower()} sem {len(v)}" for p, v in novo.items()) or "todas liberadas"
    registrar(db, usuario.empresa_id, "usuario", f"Alterou as ferramentas de cada função ({resumo})", usuario=usuario)
    db.commit()
    return permissoes.catalogo_dict(novo)
