"""Novidades dos marketplaces: datas promocionais, frete, tarifas e regras.

Duas fontes: o que a plataforma divulga ("oficial", com link) e o que muda sem
aviso ("percebido"), anotado pela equipe ou detectado pelo próprio Replique
(ex.: o frete que o ML cobra numa conta deixou de bater com a tabela publicada).
As novidades de DO_SISTEMA entram sozinhas, uma vez, pela chave."""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.banco.models import EstadoNovidades, Novidade
from backend.services import frete_ml

log = logging.getLogger(__name__)

TEMAS = {"promocao": "Promoção", "frete": "Frete", "tarifa": "Tarifa", "regra": "Regra", "publicacao": "Publicação"}
FONTES = {"oficial": "Divulgado pela plataforma", "percebido": "Percebido no uso"}

DO_SISTEMA = (
    {"chave": "ml-tabela-frete-2026-10", "plataforma": "mercadolivre", "tema": "frete", "fonte": "oficial",
     "data": date(2026, 10, 30), "link": frete_ml.LINK_TABELA,
     "titulo": "Custos de envio do Mercado Livre: tabela por peso, preço e reputação",
     "texto": "O custo de envio é cobrado do vendedor em toda venda, mesmo quando o comprador paga o frete. "
              "De R$ 19 a R$ 78,99 o Mercado Livre oferece frete grátis padrão; a partir de R$ 79 o vendedor "
              "oferece frete grátis rápido. O valor depende do peso cobrado (o maior entre o peso real e o "
              "volumétrico: altura x largura x comprimento / 6.000) e da faixa de preço. Reputação verde ou "
              "MercadoLíder tem até 50% de desconto, amarela até 40%; laranja e vermelha pagam a tabela cheia. "
              "Abaixo de R$ 19 o custo é no máximo metade do preço. Kit paga um custo por kit. Livros, Full Super, "
              "alimentos para animais, usados e algumas categorias especiais têm tabela própria.",
     "impacto": "A calculadora do editor e a aprovação do lojista passam a descontar o frete pela tabela "
                "quando a conta não devolve o valor pela API, inclusive abaixo de R$ 79. Peso e medidas "
                "errados mudam o custo: o ML mede o pacote depois do envio e corrige as próximas vendas."},
)


def garantir_do_sistema(db: Session) -> None:
    existentes = {c for (c,) in db.query(Novidade.chave).filter(Novidade.chave.in_([n["chave"] for n in DO_SISTEMA]))}
    faltando = [n for n in DO_SISTEMA if n["chave"] not in existentes]
    if not faltando:
        return
    for n in faltando:
        db.add(Novidade(**n))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def registrar_percebida(db: Session, chave: str, **campos) -> None:
    """Grava uma novidade detectada pelo Replique, uma vez por chave, sem mexer
    na transação de quem chamou."""
    with Session(bind=db.get_bind()) as outra:
        if outra.query(Novidade.id).filter(Novidade.chave == chave).first():
            return
        outra.add(Novidade(chave=chave, fonte="percebido", data=date.today(), **campos))
        try:
            outra.commit()
        except IntegrityError:
            outra.rollback()


def _reais(v: float) -> str:
    return f"R$ {v:.2f}".replace(".", ",")


def frete_diferente_da_tabela(db: Session, cobrado: float, tabela: float, limite: float = 0.15) -> None:
    if not tabela or abs(cobrado - tabela) / tabela <= limite:
        return
    hoje = date.today()
    direcao = "mais alto" if cobrado > tabela else "mais baixo"
    try:
        registrar_percebida(
            db, f"ml-frete-difere-tabela-{hoje:%Y-%m}", plataforma="mercadolivre", tema="frete",
            titulo=f"Frete do Mercado Livre {direcao} que a tabela publicada",
            texto=f"Numa conta conectada, o ML calculou {_reais(cobrado)} de frete onde a tabela publicada "
                  f"(consultada em {frete_ml.TABELA_CONSULTADA_EM}) dá {_reais(tabela)}.",
            impacto="Pode ser mudança de tabela ainda não divulgada, desconto da conta ou medidas diferentes. "
                    "Confira a tabela oficial e as medidas do anúncio antes de precificar.",
            link=frete_ml.LINK_TABELA)
    except Exception as e:
        log.info("Não registrei a novidade de frete: %s", e)


def item(n: Novidade) -> dict:
    return {"id": n.id, "plataforma": n.plataforma, "tema": n.tema, "tema_nome": TEMAS.get(n.tema, n.tema),
            "fonte": n.fonte, "fonte_nome": FONTES.get(n.fonte, n.fonte), "titulo": n.titulo, "texto": n.texto,
            "impacto": n.impacto, "link": n.link, "data": n.data.isoformat(), "do_sistema": bool(n.chave)}


CAMPANHAS_DO_ML = {"DEAL", "MARKETPLACE_CAMPAIGN", "BANK"}
PACOTE_REFERENCIA = "10x15x20,800"
PRECO_REFERENCIA = 100.0
MAX_CATEGORIAS = 30


def _data_curta(v: str) -> str:
    return f"{v[8:10]}/{v[5:7]}/{v[:4]}" if v and len(v) >= 10 else ""


def campanhas_novas(db: Session, campanhas: list[dict]) -> int:
    """Campanhas organizadas pelo ML (ex.: 11.11, Black Friday) que aparecem pela
    primeira vez numa conta conectada."""
    novas = 0
    for c in campanhas:
        if c.get("tipo") not in CAMPANHAS_DO_ML or not c.get("id"):
            continue
        chave = f"ml-campanha-{c['id']}"
        if db.query(Novidade.id).filter(Novidade.chave == chave).first():
            continue
        periodo = " a ".join(d for d in (_data_curta(c.get("inicio", "")), _data_curta(c.get("fim", ""))) if d)
        prazo = _data_curta(c.get("prazo", ""))
        registrar_percebida(
            db, chave, plataforma="mercadolivre", tema="promocao",
            titulo=f"Campanha do Mercado Livre: {c.get('nome') or c.get('tipo_nome')}",
            texto=f"{c.get('tipo_nome') or c['tipo']}" + (f", de {periodo}" if periodo else "")
                  + (f". Adesão até {prazo}" if prazo else "") + ". Apareceu nas contas conectadas.",
            impacto="Confira na Central de promoções quais anúncios foram convidados e se o desconto pedido "
                    "mantém a margem mínima de cada lojista.")
        novas += 1
    return novas


def _adaptador_conectado(db: Session):
    from backend.marketplaces.registry import obter_adaptador
    from backend.banco.models import Cliente, ContaMarketplace
    ids = [cid for (cid,) in db.query(ContaMarketplace.cliente_id).filter(
        ContaMarketplace.plataforma == "mercadolivre", ContaMarketplace.ativa.is_(True),
        ContaMarketplace.cliente_id.isnot(None)).order_by(ContaMarketplace.id)]
    for cid in dict.fromkeys(ids):
        cliente = db.get(Cliente, cid)
        if not cliente or not cliente.ativo:
            continue
        ml, _ = obter_adaptador(db, cid, "mercadolivre", "publicar")
        if ml is not None and not ml.demo and not getattr(ml, "sem_conta", False):
            return ml
    return None


def _tarifas_vistas(db: Session) -> tuple[dict, EstadoNovidades]:
    estado = db.get(EstadoNovidades, "tarifas_ml")
    if not estado:
        estado = EstadoNovidades(chave="tarifas_ml", dados={})
        db.add(estado)
    return dict(estado.dados or {}), estado


def tarifas_mudaram(db: Session, ml) -> int:
    """Compara a % de Clássico e Premium das categorias em uso com a última leitura."""
    from backend.banco.models import Anuncio
    categorias = []
    for (pp,) in db.query(Anuncio.por_plataforma).filter(Anuncio.excluido_em.is_(None)).order_by(Anuncio.id.desc()).limit(500):
        cat = ((pp or {}).get("mercadolivre") or {}).get("category_id")
        if cat and cat not in categorias:
            categorias.append(cat)
        if len(categorias) >= MAX_CATEGORIAS:
            break
    vistas, registro = _tarifas_vistas(db)
    mudancas = 0
    for cat in categorias:
        for tipo, nome in (("gold_special", "Clássico"), ("gold_pro", "Premium")):
            info = ml.tarifa_venda(PRECO_REFERENCIA, tipo, cat)
            if not info:
                continue
            pct = float((info.get("sale_fee_details") or {}).get("percentage_fee") or 0)
            if not pct:
                continue
            chave, antes = f"{cat}|{tipo}", vistas.get(f"{cat}|{tipo}")
            vistas[chave] = pct
            if antes is None or abs(antes - pct) < 0.01:
                continue
            direcao = "subiu" if pct > antes else "caiu"
            registrar_percebida(
                db, f"ml-tarifa-{cat}-{tipo}-{pct:g}-{date.today():%Y%m%d}", plataforma="mercadolivre", tema="tarifa",
                titulo=f"Tarifa {nome} da categoria {cat} {direcao}: {antes:g}% para {pct:g}%".replace(".", ","),
                texto=f"Lida pela API do Mercado Livre para um produto de {_reais(PRECO_REFERENCIA)}.",
                impacto="Anúncios desta categoria já precificados podem estar com margem diferente: "
                        "recalcule no editor antes de pedir aprovação.")
            mudancas += 1
    registro.dados = vistas
    db.commit()
    return mudancas


def conferir_frete(db: Session, ml) -> int:
    cobrado = ml.custo_frete_gratis(PRECO_REFERENCIA, PACOTE_REFERENCIA, "gold_special")
    if cobrado is None:
        return 0
    try:
        nivel = (ml.reputacao().get("reputacao") or {}).get("level_id")
    except Exception:
        nivel = None
    tabela = frete_ml.custo(PRECO_REFERENCIA, PACOTE_REFERENCIA, frete_ml.tabela_da_reputacao(nivel))
    antes = db.query(Novidade.id).filter(Novidade.chave.like("ml-frete-difere-tabela-%")).count()
    frete_diferente_da_tabela(db, float(cobrado), tabela[0])
    return db.query(Novidade.id).filter(Novidade.chave.like("ml-frete-difere-tabela-%")).count() - antes


def verificar(db: Session) -> dict:
    """Roda as verificações automáticas. Usado pelo botão da aba e pelo agendador."""
    from backend.banco.models import LeituraAutomatica
    garantir_do_sistema(db)
    novas = {"campanhas": 0, "tarifas": 0, "frete": 0}
    for l in db.query(LeituraAutomatica).filter(LeituraAutomatica.tarefa == "promocoes", LeituraAutomatica.chave == ""):
        novas["campanhas"] += campanhas_novas(db, (l.dados or {}).get("campanhas") or [])
    ml = _adaptador_conectado(db)
    avisos = []
    if ml is None:
        avisos.append("Nenhuma conta do Mercado Livre conectada: tarifa e frete não foram conferidos.")
    else:
        for nome, fazer in (("tarifas", tarifas_mudaram), ("frete", conferir_frete)):
            try:
                novas[nome] = fazer(db, ml)
            except Exception as e:
                db.rollback()
                log.warning("Verificação de novidades (%s) falhou: %s", nome, e)
                avisos.append(f"Não consegui conferir {nome}: {e}")
    return {"novas": sum(novas.values()), "por_tipo": novas, "avisos": avisos}
