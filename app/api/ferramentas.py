"""Ferramentas do anúncio e acompanhamento dos clientes.

- nota de risco, calculadora de margem e gerador de fotos (equipe);
- aprovação do lojista (a equipe pede, o lojista aprova ou recusa);
- radar de preço dos anúncios publicados;
- saúde da conta do Mercado Livre, perguntas de compradores e relatório mensal.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.anuncios import _anuncio
from app.api.deps import Contexto, contexto, contexto_equipe, exigir_equipe, usuario_atual
from app.api.limites import consumir, uso_fotos_ia, uso_ia, uso_pesquisa
from app.db import get_db
from app.marketplaces.base import PLATAFORMAS
from app.models import Anuncio, Cliente, GeracaoFotos, Publicacao, RadarPreco, Usuario
from app.services import acesso, gerador_fotos, margem, perguntas, radar, relatorio, risco, saude
from app.services.auditoria import registrar

router = APIRouter(prefix="/api", tags=["ferramentas"])


class PedidoMargem(BaseModel):
    plataformas: list[str] = Field(default_factory=lambda: list(PLATAFORMAS))
    preco: float | None = Field(default=None, ge=0)


class Decisao(BaseModel):
    decisao: str  # aprovar | recusar
    nota: str = Field(default="", max_length=1000)


class PedidoFotos(BaseModel):
    foto: str = Field(max_length=2000)
    tipos: list[str]
    cenario: str = Field(default="", max_length=300)
    demonstracao: str = Field(default="", max_length=300)


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


# ------------------------------------------------------------ nota de risco e margem
@router.get("/anuncios/{anuncio_id}/risco")
def nota_de_risco(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    r = risco.avaliar(db, a)
    db.commit()  # guarda as impressões das fotos (a próxima checagem é instantânea)
    return r


@router.post("/anuncios/{anuncio_id}/margem")
def calcular_margem(anuncio_id: int, dados: PedidoMargem, usuario: Usuario = Depends(exigir_equipe),
                    db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    plataformas = [p for p in dados.plataformas if p in PLATAFORMAS] or list(PLATAFORMAS)
    return margem.calcular(db, a, plataformas, dados.preco)


# ------------------------------------------------------------ aprovação do lojista
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


# ------------------------------------------------------------ gerador de fotos
@router.post("/anuncios/{anuncio_id}/fotos/gerar")
def gerar_fotos(anuncio_id: int, dados: PedidoFotos, usuario: Usuario = Depends(exigir_equipe),
                db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    try:
        pedido = gerador_fotos.validar_pedido(dados.model_dump())
    except ValueError as e:
        _erro(e)
    if any(t in pedido["tipos"] for t in ("branco", "contexto", "demonstrativa")) and gerador_fotos.provedor():
        consumir(uso_fotos_ia, usuario.id)  # só conta o que gasta crédito de IA
    g = gerador_fotos.iniciar(db, a, usuario, pedido)
    return gerador_fotos.situacao(g)


@router.get("/fotos/geracoes/{geracao_id}")
def ver_geracao(geracao_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    g = db.get(GeracaoFotos, geracao_id)
    if not g or g.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Geração não encontrada.")
    _anuncio(db, usuario, g.anuncio_id)  # confere acesso ao cliente dono do anúncio
    saida = gerador_fotos.situacao(g)
    db.commit()
    return saida


# ------------------------------------------------------------ radar de preço
def _radar_dict(r: RadarPreco | None) -> dict | None:
    return {"dados": r.dados, "demo": r.demo, "criada_em": r.criada_em} if r else None


@router.get("/radar")
def radar_do_cliente(ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    """Anúncios do cliente publicados no Mercado Livre, com a última leitura do radar."""
    ids = {aid for (aid,) in db.query(Publicacao.anuncio_id).filter(
        Publicacao.cliente_id == ctx.cliente.id, Publicacao.plataforma == "mercadolivre", Publicacao.sucesso.is_(True))}
    anuncios = (db.query(Anuncio).filter(Anuncio.id.in_(ids or {0}), Anuncio.excluido_em.is_(None))
                .order_by(Anuncio.titulo).all())
    ultimas = radar.ultimas(db, [a.id for a in anuncios])
    return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "foto": (a.fotos or [""])[0],
             "radar": _radar_dict(ultimas.get(a.id))} for a in anuncios]


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


# ------------------------------------------------------------ saúde da conta
@router.get("/saude")
def saude_dos_clientes(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    clientes = acesso.clientes_acessiveis(db, usuario)
    ultimas = saude.ultimas(db, [c.id for c in clientes])
    ordem = {"critico": 0, "atencao": 1, "sem_dados": 2, "nunca": 3, "ok": 4}
    lista = [{"id": c.id, "nome": c.nome, **saude.saude_dict(ultimas.get(c.id))} for c in clientes]
    return sorted(lista, key=lambda x: (ordem.get(x["nivel"], 9), x["nome"]))


@router.post("/saude/{cliente_id}/atualizar")
def atualizar_saude(cliente_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    cliente = _cliente_visivel(db, usuario, cliente_id)
    consumir(uso_pesquisa, usuario.id)
    return {"id": cliente.id, "nome": cliente.nome, **saude.saude_dict(saude.coletar(db, cliente))}


# ------------------------------------------------------------ perguntas de compradores
@router.get("/perguntas")
def listar_perguntas(ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        return perguntas.listar(db, ctx.cliente)
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


# ------------------------------------------------------------ relatório mensal
@router.get("/relatorios/{cliente_id}")
def relatorio_mensal(cliente_id: int, mes: str = Query(pattern=r"^\d{4}-\d{2}$"),
                     usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    cliente = _cliente_visivel(db, usuario, cliente_id)
    try:
        return relatorio.montar(db, cliente, mes)
    except ValueError as e:
        _erro(e)


# para a tela do lojista: o que aguarda a aprovação dele
@router.get("/aprovacoes")
def aguardando_aprovacao(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    lista = (db.query(Anuncio).filter(Anuncio.cliente_id == ctx.cliente.id, Anuncio.excluido_em.is_(None),
                                      Anuncio.aprovacao == "pendente").order_by(Anuncio.atualizado_em.desc()).all())
    return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "foto": (a.fotos or [""])[0]} for a in lista]
