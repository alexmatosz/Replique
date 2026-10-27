"""Ferramentas do anúncio e acompanhamento dos clientes.

- nota de risco, calculadora de margem e gerador de fotos (equipe);
- aprovação do lojista (a equipe pede, o lojista aprova ou recusa);
- radar de preço dos anúncios publicados e radar de mercado (tendências e nichos);
- saúde da conta do Mercado Livre, perguntas de compradores e relatório mensal.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.anuncios import _anuncio
from app.api.deps import Contexto, contexto, contexto_equipe, contexto_time, exigir_equipe, usuario_atual
from app.api.limites import consumir, uso_fotos_ia, uso_ia, uso_pesquisa
from app.db import get_db
from app.marketplaces.base import PLATAFORMAS
from app.models import Anuncio, Cliente, GeracaoFotos, Publicacao, RadarPreco, Usuario
from app.services import acesso, gerador_fotos, margem, mercado, perguntas, radar, relatorio, risco, saude
from app.services.auditoria import registrar

router = APIRouter(prefix="/api", tags=["ferramentas"])


class PedidoMargem(BaseModel):
    plataformas: list[str] = Field(default_factory=lambda: list(PLATAFORMAS))
    preco: float | None = Field(default=None, ge=0)


class PedidoPreco(BaseModel):
    preco: float | None = Field(default=None, ge=0)
    custo: float | None = Field(default=None, ge=0)
    imposto_pct: float | None = Field(default=None, ge=0, le=100)
    embalagem: float | None = Field(default=None, ge=0)
    frete: float | None = Field(default=None, ge=0)
    peso_kg: float | None = Field(default=None, ge=0)
    dimensoes_cm: dict | None = None
    tipo: str | None = None
    comissao_pct: float | None = Field(default=None, ge=0, le=100)
    incluir_frete: bool = True


class Decisao(BaseModel):
    decisao: str
    nota: str = Field(default="", max_length=1000)


class PedidoFotos(BaseModel):
    foto: str = Field(max_length=2000)
    tipos: list[str]
    cenario: str = Field(default="", max_length=300)
    demonstracao: str = Field(default="", max_length=300)
    chamada: str = Field(default="", max_length=60)


class NovoPreco(BaseModel):
    preco: float = Field(gt=0)


class Resposta(BaseModel):
    texto: str = Field(max_length=2000)


class PedidoSugestao(BaseModel):
    texto: str = Field(max_length=2000)
    item_id: str = Field(default="", max_length=40)


def _cliente_visivel(db: Session, usuario: Usuario, cliente_id: int) -> Cliente:
    if not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(404, "Cliente não encontrado.")
    return db.get(Cliente, cliente_id)


def _erro(e: ValueError):
    raise HTTPException(400, str(e))


@router.get("/anuncios/{anuncio_id}/risco")
def nota_de_risco(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    r = risco.avaliar(db, a)
    db.commit()
    return r


@router.post("/anuncios/{anuncio_id}/margem")
def calcular_margem(anuncio_id: int, dados: PedidoMargem, usuario: Usuario = Depends(exigir_equipe),
                    db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    plataformas = [p for p in dados.plataformas if p in PLATAFORMAS] or list(PLATAFORMAS)
    return margem.calcular(db, a, plataformas, dados.preco)


@router.post("/anuncios/{anuncio_id}/precificacao")
def calcular_preco(anuncio_id: int, dados: PedidoPreco, usuario: Usuario = Depends(exigir_equipe),
                   db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    return margem.precificar(db, a, dados.preco, dados.custo, dados.imposto_pct, dados.embalagem, dados.frete,
                             dados.peso_kg, dados.dimensoes_cm, dados.tipo, dados.comissao_pct, dados.incluir_frete)


@router.post("/anuncios/{anuncio_id}/aprovacao/solicitar")
def pedir_aprovacao(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    if not a.titulo.strip() or not a.fotos:
        raise HTTPException(400, "Complete título e fotos antes de pedir a aprovação.")
    a.aprovacao, a.aprovacao_nota, a.aprovacao_em = "pendente", "", None
    registrar(db, a.empresa_id, "aprovacao", f"Pediu ao lojista a aprovação de “{a.titulo}”", cliente_id=a.cliente_id,
              usuario=usuario, anuncio_id=a.id)
    db.commit()
    return {"aprovacao": a.aprovacao}


@router.post("/anuncios/{anuncio_id}/aprovacao")
def decidir_aprovacao(anuncio_id: int, dados: Decisao, usuario: Usuario = Depends(usuario_atual),
                      db: Session = Depends(get_db)):
    """Só o lojista (login do cliente dono do anúncio) aprova ou recusa."""
    a = _anuncio(db, usuario, anuncio_id)
    if usuario.papel != "cliente" or usuario.cliente_id != a.cliente_id:
        raise HTTPException(403, "Quem aprova é o lojista, pelo login da loja.")
    if dados.decisao not in ("aprovar", "recusar"):
        raise HTTPException(400, "Decisão deve ser aprovar ou recusar.")
    if a.aprovacao != "pendente":
        raise HTTPException(400, "Este anúncio não está aguardando aprovação.")
    if dados.decisao == "recusar" and len(dados.nota.strip()) < 3:
        raise HTTPException(400, "Conte o que precisa mudar para a equipe ajustar.")
    a.aprovacao = "aprovado" if dados.decisao == "aprovar" else "recusado"
    a.aprovacao_nota, a.aprovacao_em, a.aprovacao_por_id = dados.nota.strip(), datetime.now(timezone.utc), usuario.id
    registrar(db, a.empresa_id, "aprovacao",
              f"{'Aprovou' if a.aprovacao == 'aprovado' else 'Recusou'} “{a.titulo}”" + (f": {a.aprovacao_nota}" if a.aprovacao_nota else ""),
              cliente_id=a.cliente_id, usuario=usuario, anuncio_id=a.id)
    db.commit()
    return {"aprovacao": a.aprovacao}


@router.post("/anuncios/{anuncio_id}/fotos/gerar")
def gerar_fotos(anuncio_id: int, dados: PedidoFotos, usuario: Usuario = Depends(exigir_equipe),
                db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    try:
        pedido = gerador_fotos.validar_pedido(dados.model_dump())
    except ValueError as e:
        _erro(e)
    from app.services import padrao_casa, uso_ia as uso_mensal
    pedido["estilo"] = padrao_casa.efetivo(db, a.empresa_id, a.cliente_id)["fotos"]
    if gerador_fotos.usa_ia(pedido):
        consumir(uso_fotos_ia, usuario.id)
        imagens = sum(1 for t in pedido["tipos"] if t in gerador_fotos.COM_IA)
        try:
            uso_mensal.conferir(db, a.empresa_id, a.cliente_id, imagens=imagens)
        except uso_mensal.LimiteIA as e:
            raise HTTPException(429, str(e))
        uso_mensal.registrar(db, a.empresa_id, a.cliente_id, imagens=imagens)
    g = gerador_fotos.iniciar(db, a, usuario, pedido)
    return gerador_fotos.situacao(g)


@router.get("/fotos/geracoes/{geracao_id}")
def ver_geracao(geracao_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    g = db.get(GeracaoFotos, geracao_id)
    if not g or g.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Geração não encontrada.")
    _anuncio(db, usuario, g.anuncio_id)
    saida = gerador_fotos.situacao(g)
    db.commit()
    return saida


def _radar_dict(r: RadarPreco | None) -> dict | None:
    return {"dados": r.dados, "demo": r.demo, "criada_em": r.criada_em} if r else None


@router.get("/radar")
def radar_do_cliente(ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    """Anúncios do cliente publicados no Mercado Livre, com a última leitura do radar."""
    ids = {aid for (aid,) in db.query(Publicacao.anuncio_id).filter(
        Publicacao.cliente_id == ctx.cliente.id, Publicacao.plataforma == "mercadolivre", Publicacao.sucesso.is_(True))}
    anuncios = (db.query(Anuncio).filter(Anuncio.id.in_(ids or {0}), Anuncio.excluido_em.is_(None))
                .order_by(Anuncio.titulo).all())
    pubs = {a.id: p for a in anuncios if (p := radar.publicacao_ml(db, a))}
    anuncios = [a for a in anuncios if a.id in pubs]
    conectada = radar.conta_ml_conectada(db, ctx.cliente.id)
    ultimas = radar.ultimas(db, [a.id for a in anuncios])
    return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "foto": (a.fotos or [""])[0],
             "item_id": pubs[a.id].id_externo, "contas": radar.contas(pubs[a.id], conectada),
             "radar": _radar_dict(ultimas.get(a.id))} for a in anuncios]


def _imposto_pct(db: Session, cliente: Cliente) -> float:
    return margem.imposto_do_cliente(db, Anuncio(cliente_id=cliente.id))[0]


@router.get("/mercado/categorias")
def categorias_do_mercado(pai: str | None = Query(default=None, pattern=r"^[A-Z]{3}\d+$"),
                          ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    try:
        return mercado.categorias(mercado.adaptador_ml(db, ctx.cliente.empresa_id, ctx.cliente.id), pai)
    except ValueError as e:
        _erro(e)


@router.get("/mercado/tendencias")
def tendencias_do_mercado(categoria: str | None = Query(default=None, pattern=r"^[A-Z]{3}\d+$"),
                          ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    try:
        ad = mercado.adaptador_ml(db, ctx.cliente.empresa_id, ctx.cliente.id)
        base = mercado.tendencias(ad, categoria)
    except ValueError as e:
        _erro(e)
    return mercado.mapear(db, ctx.cliente.empresa_id, base, "tendencias", _imposto_pct(db, ctx.cliente), ad is None)


@router.get("/mercado/oportunidades")
def oportunidades_do_mercado(categorias: str = Query(default="", max_length=200, pattern=r"^([A-Z]{3}\d+)?(,[A-Z]{3}\d+)*$"),
                             margem: float = Query(default=20, ge=0, le=80),
                             ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    lista = [c for c in categorias.split(",") if c]
    try:
        ad = mercado.adaptador_ml(db, ctx.cliente.empresa_id, ctx.cliente.id)
        return mercado.oportunidades(db, ctx.cliente.empresa_id, ad, lista, _imposto_pct(db, ctx.cliente), margem)
    except ValueError as e:
        _erro(e)


@router.get("/mercado/mais-vendidos")
def mais_vendidos_do_mercado(categoria: str = Query(pattern=r"^[A-Z]{3}\d+$"),
                             ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    try:
        ad = mercado.adaptador_ml(db, ctx.cliente.empresa_id, ctx.cliente.id)
        base = mercado.mais_vendidos(ad, categoria)
    except ValueError as e:
        _erro(e)
    return mercado.mapear(db, ctx.cliente.empresa_id, base, "mais_vendidos", _imposto_pct(db, ctx.cliente), ad is None)


@router.get("/mercado/historico")
def historico_do_mercado(chave: str = Query(max_length=200), ctx: Contexto = Depends(contexto_time),
                         db: Session = Depends(get_db)):
    return mercado.historico(db, ctx.cliente.empresa_id, chave)


@router.get("/anuncios/{anuncio_id}/radar")
def ver_radar(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    historico = (db.query(RadarPreco).filter_by(anuncio_id=a.id).order_by(RadarPreco.id.desc()).limit(20).all())
    return {"publicado": radar.publicacao_ml(db, a) is not None,
            "atual": _radar_dict(historico[0]) if historico else None,
            "historico": [{"criada_em": r.criada_em, "meu_preco": r.dados.get("meu_preco"), "menor": r.dados.get("menor")}
                          for r in reversed(historico)]}


@router.post("/anuncios/{anuncio_id}/radar")
def atualizar_radar(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    consumir(uso_pesquisa, usuario.id)
    try:
        return _radar_dict(radar.atualizar(db, a))
    except ValueError as e:
        _erro(e)


@router.post("/anuncios/{anuncio_id}/radar/aplicar")
def aplicar_preco(anuncio_id: int, dados: NovoPreco, usuario: Usuario = Depends(exigir_equipe),
                  db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    try:
        return radar.aplicar_preco(db, a, dados.preco, usuario)
    except ValueError as e:
        _erro(e)


@router.get("/saude")
def saude_dos_clientes(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    clientes = acesso.clientes_acessiveis(db, usuario)
    ids = [c.id for c in clientes]
    ultimas, shopee = saude.ultimas(db, ids), saude.ultimas(db, ids, "shopee")
    ordem = {"critico": 0, "atencao": 1, "sem_dados": 2, "nunca": 3, "ok": 4}
    lista = [{"id": c.id, "nome": c.nome, **saude.do_cliente(db, c, ultimas.get(c.id), shopee.get(c.id))} for c in clientes]
    return sorted(lista, key=lambda x: (ordem.get(x["nivel"], 9), x["nome"]))


@router.post("/saude/{cliente_id}/atualizar")
def atualizar_saude(cliente_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    cliente = _cliente_visivel(db, usuario, cliente_id)
    consumir(uso_pesquisa, usuario.id)
    ml = saude.coletar(db, cliente)
    shopee = saude.ultimas(db, [cliente.id], "shopee").get(cliente.id)
    return {"id": cliente.id, "nome": cliente.nome, **saude.do_cliente(db, cliente, ml, shopee)}


@router.get("/perguntas")
def listar_perguntas(ctx: Contexto = Depends(contexto_time), db: Session = Depends(get_db)):
    try:
        return perguntas.listar(db, ctx.cliente)
    except ValueError as e:
        _erro(e)


@router.get("/perguntas/central")
def central_de_perguntas(ao_vivo: bool = False, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Perguntas de todos os clientes que o usuário atende, numa lista só."""
    if usuario.papel == "cliente":
        raise HTTPException(403, "A central de perguntas é da equipe.")
    if ao_vivo:
        consumir(uso_pesquisa, usuario.id)
    return perguntas.central(acesso.clientes_acessiveis(db, usuario), ao_vivo)


@router.post("/clientes/{cliente_id}/perguntas/{question_id}/sugerir")
def sugerir_resposta_central(cliente_id: int, question_id: int, dados: PedidoSugestao,
                             usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    cliente = _cliente_visivel(db, usuario, cliente_id)
    consumir(uso_ia, usuario.id)
    return perguntas.sugerir(db, cliente, question_id, dados.texto, dados.item_id)


@router.post("/clientes/{cliente_id}/perguntas/{question_id}/responder")
def responder_pergunta_central(cliente_id: int, question_id: int, dados: Resposta,
                               usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    cliente = _cliente_visivel(db, usuario, cliente_id)
    try:
        return perguntas.responder(db, cliente, question_id, dados.texto, usuario)
    except ValueError as e:
        _erro(e)


@router.post("/perguntas/{question_id}/sugerir")
def sugerir_resposta(question_id: int, dados: PedidoSugestao, ctx: Contexto = Depends(contexto_equipe),
                     db: Session = Depends(get_db)):
    consumir(uso_ia, ctx.usuario.id)
    return perguntas.sugerir(db, ctx.cliente, question_id, dados.texto, dados.item_id)


@router.post("/perguntas/{question_id}/responder")
def responder_pergunta(question_id: int, dados: Resposta, ctx: Contexto = Depends(contexto_equipe),
                       db: Session = Depends(get_db)):
    try:
        return perguntas.responder(db, ctx.cliente, question_id, dados.texto, ctx.usuario)
    except ValueError as e:
        _erro(e)


@router.get("/relatorios/{cliente_id}")
def relatorio_mensal(cliente_id: int, mes: str = Query(pattern=r"^\d{4}-\d{2}$"),
                     usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    cliente = _cliente_visivel(db, usuario, cliente_id)
    try:
        return relatorio.montar(db, cliente, mes)
    except ValueError as e:
        _erro(e)


@router.get("/aprovacoes")
def aguardando_aprovacao(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    lista = (db.query(Anuncio).filter(Anuncio.cliente_id == ctx.cliente.id, Anuncio.excluido_em.is_(None),
                                      Anuncio.aprovacao == "pendente").order_by(Anuncio.atualizado_em.desc()).all())
    return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "foto": (a.fotos or [""])[0]} for a in lista]
