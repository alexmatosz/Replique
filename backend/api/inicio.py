"""Visão geral da equipe (tela Início) e as pendências que aparecem no menu.

Admin vê a operação inteira; consultor e operador, só a própria carteira. Os
números saem dos pedidos de anúncio, dos rascunhos, das publicações e das
dúvidas: projetos e tarefas ficam no CRM Timer.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.api.deps import usuario_atual
from backend.banco.db import get_db
from backend.marketplaces.base import PLATAFORMAS
from backend.banco.models import AcessoCliente, Anuncio, Atividade, PedidoAnuncio, Publicacao, Usuario, Venda
from backend.services import acesso, financeiro, notificacoes, pedidos
from backend.services import conversas as svc_conversas

router = APIRouter(prefix="/api", tags=["inicio"])

PROBLEMA = ("erro", "parcial")


def _contagem(db: Session, coluna_grupo, *filtros) -> dict:
    return dict(db.query(coluna_grupo, func.count()).filter(*filtros).group_by(coluna_grupo).all())


@router.get("/visao-geral")
def visao_geral(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "Esta tela é da equipe.")
    clientes = acesso.clientes_acessiveis(db, usuario)
    ids = [c.id for c in clientes] or [0]
    desde = datetime.now(timezone.utc) - timedelta(days=30)
    vivos = (Anuncio.cliente_id.in_(ids), Anuncio.excluido_em.is_(None))
    preparo = _contagem(db, Anuncio.cliente_id, *vivos, Anuncio.status.in_(("rascunho", "simulado")))
    problema = _contagem(db, Anuncio.cliente_id, *vivos, Anuncio.status.in_(PROBLEMA))
    publicados = _contagem(db, Publicacao.cliente_id, Publicacao.cliente_id.in_(ids), Publicacao.sucesso.is_(True),
                           Publicacao.criada_em >= desde)
    ultima = dict(db.query(Atividade.cliente_id, func.max(Atividade.criada_em))
                  .filter(Atividade.cliente_id.in_(ids)).group_by(Atividade.cliente_id).all())
    lista_pedidos = db.query(PedidoAnuncio).filter(PedidoAnuncio.cliente_id.in_(ids)).all()
    abertos: dict[int, int] = {}
    atrasados: dict[int, int] = {}
    for p in lista_pedidos:
        if p.status in pedidos.ABERTOS:
            abertos[p.cliente_id] = abertos.get(p.cliente_id, 0) + 1
        if pedidos.atrasado(p):
            atrasados[p.cliente_id] = atrasados.get(p.cliente_id, 0) + 1
    duvidas = svc_conversas.resumo_nao_lidas(db, usuario)
    usa_duvidas = svc_conversas.usa_duvidas(db, usuario)
    aguardando = svc_conversas.aguardando_resposta(db, ids) if usa_duvidas else {}
    equipe: dict[int, dict[str, list[str]]] = {}
    for cid, nome, papel in (db.query(AcessoCliente.cliente_id, Usuario.nome, Usuario.papel)
                             .join(Usuario, Usuario.id == AcessoCliente.usuario_id)
                             .filter(AcessoCliente.cliente_id.in_(ids), Usuario.ativo.is_(True))):
        equipe.setdefault(cid, {"consultores": [], "operadores": []})["consultores" if papel == "consultor" else "operadores"].append(nome)
    linhas = [{"id": c.id, "nome": c.nome, "pedidos_abertos": abertos.get(c.id, 0), "pedidos_atrasados": atrasados.get(c.id, 0),
               "rascunhos_preparo": preparo.get(c.id, 0), "rascunhos_problema": problema.get(c.id, 0),
               "publicados_30d": publicados.get(c.id, 0), "duvidas_nao_lidas": duvidas["por_cliente"].get(c.id, 0),
               "aguardando_resposta": aguardando.get(c.id, 0),
               "consultores": sorted(equipe.get(c.id, {}).get("consultores", [])),
               "operadores": sorted(equipe.get(c.id, {}).get("operadores", [])),
               "ultima_atividade": ultima.get(c.id)} for c in clientes]
    pessoas = db.query(Usuario).filter(Usuario.empresa_id == usuario.empresa_id, Usuario.ativo.is_(True),
                                       Usuario.papel.in_(acesso.ATRIBUIVEIS)).all()
    if usuario.papel != "admin":
        colegas = {uid for (uid,) in db.query(AcessoCliente.usuario_id).filter(AcessoCliente.cliente_id.in_(ids))}
        pessoas = [p for p in pessoas if p.id in colegas]
    clientes_por_pessoa = _contagem(db, AcessoCliente.usuario_id, AcessoCliente.cliente_id.in_(ids))
    pubs_por_pessoa = _contagem(db, Publicacao.usuario_id, Publicacao.cliente_id.in_(ids), Publicacao.sucesso.is_(True),
                                Publicacao.criada_em >= desde)
    tabela_equipe = []
    for u in sorted(pessoas, key=lambda x: (x.papel, x.nome)):
        meus = [p for p in lista_pedidos if (p.operador_id if u.papel == "operador" else p.criado_por_id) == u.id]
        tabela_equipe.append({"id": u.id, "nome": u.nome, "papel": u.papel, "foto": u.foto or "",
                              "clientes": clientes_por_pessoa.get(u.id, 0),
                              "pedidos_abertos": sum(1 for p in meus if p.status in pedidos.ABERTOS),
                              "pedidos_atrasados": sum(1 for p in meus if pedidos.atrasado(p)),
                              "publicados_30d": pubs_por_pessoa.get(u.id, 0)})
    totais = {"clientes": len(clientes), "pedidos_abertos": sum(abertos.values()), "pedidos_atrasados": sum(atrasados.values()),
              "rascunhos_problema": sum(problema.values()), "publicados_30d": sum(publicados.values()),
              "duvidas_nao_lidas": duvidas["total"], "aguardando_resposta": sum(aguardando.values())}
    if usuario.papel == "admin":
        totais["usuarios"] = db.query(Usuario).filter_by(empresa_id=usuario.empresa_id, ativo=True).count()
    meus_pedidos = [x for x in pedidos.listar(db, usuario, meus=usuario.papel == "operador", status="abertos")
                    if usuario.papel == "operador" or x["criado_por_id"] == usuario.id][:10]
    return {"totais": totais, "clientes": linhas, "equipe": tabela_equipe, "usa_duvidas": usa_duvidas,
            "sem_equipe": [c["nome"] for c in linhas if not c["operadores"] and not c["consultores"]] if usuario.papel == "admin" else [],
            "meus_pedidos": meus_pedidos}


@router.get("/faturamento-geral")
def faturamento_geral(mes: str = Query(pattern=r"^\d{4}-\d{2}$"), usuario: Usuario = Depends(usuario_atual),
                      db: Session = Depends(get_db)):
    """Faturamento de cada cliente somando Mercado Livre, Shopee e Amazon, em dois recortes: desde o início
    da assessoria da Monvatti (data do cadastro, ou a informada em Clientes) e no mês escolhido.
    Sai das vendas sincronizadas em Gestão (pedidos pagos, sem simulações e já sem reembolsos)."""
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "Esta tela é da equipe.")
    clientes = acesso.clientes_acessiveis(db, usuario)
    ids = [c.id for c in clientes] or [0]
    ini_mes, fim_mes = financeiro.limites_do_mes(mes)
    ini_mes, fim_mes = financeiro._utc(ini_mes), financeiro._utc(fim_mes)
    inicio = {c.id: c.inicio_assessoria or c.criado_em.date() for c in clientes}
    corte = {cid: datetime.combine(d, datetime.min.time(), financeiro.FUSO_BR).astimezone(timezone.utc) for cid, d in inicio.items()}
    desde = min(corte.values(), default=ini_mes)
    zero = lambda: {p: 0.0 for p in PLATAFORMAS}
    no_mes = {c.id: zero() for c in clientes}
    acumulado = {c.id: zero() for c in clientes}
    pedidos_mes: dict[int, set] = {c.id: set() for c in clientes}
    pedidos_acum: dict[int, set] = {c.id: set() for c in clientes}
    primeira: dict[int, datetime] = {}
    for v in (db.query(Venda).filter(Venda.cliente_id.in_(ids), Venda.data_venda >= min(desde, ini_mes),
                                     Venda.simulada.isnot(True), Venda.demo.is_(False))):
        if v.plataforma not in PLATAFORMAS or not financeiro._valida(v):
            continue
        quando = v.data_venda if v.data_venda.tzinfo else v.data_venda.replace(tzinfo=timezone.utc)
        valor = v.total - min(v.reembolso or 0, v.total)
        if quando >= corte[v.cliente_id]:
            acumulado[v.cliente_id][v.plataforma] += valor
            pedidos_acum[v.cliente_id].add((v.plataforma, v.pedido_id))
            if v.cliente_id not in primeira or quando < primeira[v.cliente_id]:
                primeira[v.cliente_id] = quando
        if ini_mes <= quando <= fim_mes:
            no_mes[v.cliente_id][v.plataforma] += valor
            pedidos_mes[v.cliente_id].add((v.plataforma, v.pedido_id))

    def recorte(soma: dict, pedidos: dict) -> dict:
        linhas = []
        for c in clientes:
            por = {p: round(x, 2) for p, x in soma[c.id].items()}
            linhas.append({"id": c.id, "nome": c.nome, "vendas_lucro": bool(c.vendas_lucro), **por,
                           "total": round(sum(por.values()), 2), "pedidos": len(pedidos[c.id]),
                           "inicio": inicio[c.id].isoformat(),
                           "primeira_venda": primeira[c.id].astimezone(financeiro.FUSO_BR).date().isoformat() if c.id in primeira else None})
        linhas.sort(key=lambda x: (-x["total"], x["nome"].lower()))
        por_plataforma = {p: round(sum(x[p] for x in linhas), 2) for p in PLATAFORMAS}
        return {"total": round(sum(por_plataforma.values()), 2), "por_plataforma": por_plataforma,
                "pedidos": sum(x["pedidos"] for x in linhas), "clientes": linhas}

    return {"mes": mes, "mes_recorte": recorte(no_mes, pedidos_mes), "assessoria": recorte(acumulado, pedidos_acum),
            "plataformas": PLATAFORMAS, "sem_vendas_lucro": sum(1 for c in clientes if not c.vendas_lucro)}


@router.get("/pendencias")
def pendencias(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Números das bolinhas do menu: pedidos que pedem ação, rascunhos com
    problema do cliente aberto e notificações não lidas."""
    saida = {"notificacoes": notificacoes.nao_lidas(db, usuario)}
    if usuario.papel not in acesso.EQUIPE:
        return saida
    q = pedidos.consulta(db, usuario).filter(PedidoAnuncio.status.in_(pedidos.ABERTOS))
    if usuario.papel == "operador":
        saida["pedidos"] = q.filter(PedidoAnuncio.operador_id == usuario.id,
                                    PedidoAnuncio.status.in_(("pendente", "andamento", "problema"))).count()
    else:
        saida["pedidos"] = sum(1 for p in q if pedidos.atrasado(p) or p.status in ("problema", "rascunho_pronto"))
    if cliente_id and acesso.pode_ver(db, usuario, cliente_id):
        saida["rascunhos"] = db.query(Anuncio).filter(Anuncio.cliente_id == cliente_id, Anuncio.excluido_em.is_(None),
                                                      Anuncio.status.in_(PROBLEMA)).count()
    return saida


@router.get("/acompanhamento/geral")
def acompanhamento_geral(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """O que está sendo feito em cada conta: saúde, perguntas sem resposta,
    publicações do mês e últimas atividades. O lojista vê só a loja dele e só
    o que já podia ver (sem pedidos internos nem perguntas)."""
    from backend.api.gestao import ACOES_DO_CLIENTE
    from backend.banco.models import LeituraAutomatica
    from backend.services import saude
    clientes = acesso.clientes_acessiveis(db, usuario)
    ids = [c.id for c in clientes] or [0]
    equipe = usuario.papel in acesso.EQUIPE
    hoje = datetime.now(timezone.utc)
    inicio_mes = hoje.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ml, shopee = saude.ultimas(db, ids), saude.ultimas(db, ids, "shopee")
    publicados = _contagem(db, Publicacao.cliente_id, Publicacao.cliente_id.in_(ids), Publicacao.sucesso.is_(True),
                           Publicacao.criada_em >= inicio_mes)
    preparo = _contagem(db, Anuncio.cliente_id, Anuncio.cliente_id.in_(ids), Anuncio.excluido_em.is_(None),
                        Anuncio.status.in_(("rascunho", "simulado")))
    perguntas = {l.cliente_id: l for l in db.query(LeituraAutomatica).filter(LeituraAutomatica.tarefa == "perguntas",
                                                                             LeituraAutomatica.cliente_id.in_(ids))}
    abertos = _contagem(db, PedidoAnuncio.cliente_id, PedidoAnuncio.cliente_id.in_(ids), PedidoAnuncio.status.in_(pedidos.ABERTOS))
    linhas = []
    for c in clientes:
        s = saude.do_cliente(db, c, ml.get(c.id), shopee.get(c.id))
        q = db.query(Atividade).filter(Atividade.cliente_id == c.id)
        if not equipe:
            q = q.filter(Atividade.acao.in_(ACOES_DO_CLIENTE))
        recentes = q.order_by(Atividade.id.desc()).limit(4).all()
        linha = {"id": c.id, "nome": c.nome, "saude": s["nivel"], "saude_em": s["criada_em"], "demo_saude": s["demo"],
                 "publicados_mes": publicados.get(c.id, 0), "em_preparo": preparo.get(c.id, 0),
                 "atividades": [{"descricao": a.descricao, "ator": a.ator, "criada_em": a.criada_em} for a in recentes]}
        if equipe:
            lp = perguntas.get(c.id)
            linha.update({"perguntas": len((lp.dados or {}).get("perguntas", [])) if lp and lp.dados else None,
                          "perguntas_em": lp.lida_em if lp and lp.dados else None, "pedidos_abertos": abertos.get(c.id, 0)})
        linhas.append(linha)
    ordem = {"critico": 0, "atencao": 1, "sem_dados": 2, "nunca": 3, "ok": 4}
    return {"mes": inicio_mes.strftime("%Y-%m"), "equipe": equipe,
            "clientes": sorted(linhas, key=lambda x: (ordem.get(x["saude"], 9), -(x.get("perguntas") or 0), x["nome"]))}


TELAS_COM_FILTRO = ("mapeador",)


class NovoFiltro(BaseModel):
    nome: str = Field(min_length=1, max_length=40)
    dados: dict = Field(default_factory=dict)


@router.get("/filtros/{tela}")
def listar_filtros(tela: str, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Filtros compartilhados pela equipe da empresa nesta tela."""
    from backend.banco.models import FiltroSalvo
    if usuario.papel not in acesso.EQUIPE or tela not in TELAS_COM_FILTRO:
        raise HTTPException(404, "Tela sem filtros compartilhados.")
    nomes = dict(db.query(Usuario.id, Usuario.nome).filter(Usuario.empresa_id == usuario.empresa_id))
    return [{"id": f.id, "nome": f.nome, "dados": f.dados, "criado_por": nomes.get(f.criado_por_id, ""),
             "meu": f.criado_por_id == usuario.id, "criado_em": f.criado_em}
            for f in db.query(FiltroSalvo).filter_by(empresa_id=usuario.empresa_id, tela=tela).order_by(FiltroSalvo.nome)]


@router.post("/filtros/{tela}")
def salvar_filtro(tela: str, dados: NovoFiltro, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    import json
    from backend.banco.models import FiltroSalvo
    if usuario.papel not in acesso.EQUIPE or tela not in TELAS_COM_FILTRO:
        raise HTTPException(404, "Tela sem filtros compartilhados.")
    valores = {str(k)[:40]: (v if isinstance(v, (bool, int, float)) else str(v)[:200]) for k, v in list(dados.dados.items())[:40]}
    if len(json.dumps(valores)) > 4000:
        raise HTTPException(400, "Filtro grande demais.")
    nome = dados.nome.strip()
    f = db.query(FiltroSalvo).filter_by(empresa_id=usuario.empresa_id, tela=tela, nome=nome).first()
    if f and f.criado_por_id != usuario.id and usuario.papel != "admin":
        raise HTTPException(400, "Já existe um filtro da equipe com esse nome. Escolha outro.")
    if not f:
        f = FiltroSalvo(empresa_id=usuario.empresa_id, tela=tela, nome=nome, criado_por_id=usuario.id)
        db.add(f)
    f.dados = valores
    db.commit()
    return {"id": f.id, "nome": f.nome}


@router.delete("/filtros/{tela}/{filtro_id}")
def apagar_filtro(tela: str, filtro_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    from backend.banco.models import FiltroSalvo
    f = db.get(FiltroSalvo, filtro_id)
    if not f or f.empresa_id != usuario.empresa_id or f.tela != tela or usuario.papel not in acesso.EQUIPE:
        raise HTTPException(404, "Filtro não encontrado.")
    if f.criado_por_id != usuario.id and usuario.papel != "admin":
        raise HTTPException(403, "Só quem criou ou um administrador tira este filtro.")
    db.delete(f)
    db.commit()
    return {"ok": True}
