"""Central de promoções do Mercado Livre.

O ML não avisa quando uma promoção termina e colocar desconto anúncio por
anúncio em dezenas de contas não escala. Aqui, para cada cliente:
- a leitura (manual ou pelo agendador) junta os anúncios ativos, as campanhas
  da Central de promoções (/seller-promotions) e os convites com prazo;
- cada convite ganha uma sugestão: aprovar (com o preço que respeita a margem
  mínima do cliente), recusar (margem ruim) ou fazer direto no ML (relâmpago e
  oferta do dia, que depois de ativas não saem mais);
- anúncio sem promoção ganha a sugestão de campanha própria (desconto do
  vendedor), limitada pela mesma margem mínima;
- o operador aprova em lote. Antes de enviar, o servidor lê de novo o anúncio
  e refaz a conta: preço mudou ou margem caiu, não envia.

Segurança da conta: nada aqui muda o preço do anúncio. Só entra o preço
promocional, pelo recurso oficial de promoções, com pausa entre as chamadas e
parada imediata se o ML pedir para ir mais devagar.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from backend import config
from backend.marketplaces.base import ErroMarketplace
from backend.marketplaces.registry import obter_adaptador
from backend.banco.models import Anuncio, Cliente, ConfigPromocoes, LeituraAutomatica, Publicacao, Usuario
from backend.services import acesso, financeiro, notificacoes, novidades, rentabilidade
from backend.services.auditoria import registrar
from backend.services.margem import FRETE_GRATIS_ML_A_PARTIR as FRETE_GRATIS_A_PARTIR

log = logging.getLogger(__name__)

FUSO = ZoneInfo("America/Sao_Paulo")
TAREFA = "promocoes"

TIPOS = {
    "DEAL": "Campanha tradicional", "MARKETPLACE_CAMPAIGN": "Campanha co-participada", "SMART": "Co-participação automática",
    "PRICE_MATCHING": "Preço competitivo", "PRICE_MATCHING_MELI_ALL": "Preço competitivo (ML paga)",
    "UNHEALTHY_STOCK": "Estoque parado no Full", "PRE_NEGOTIATED": "Desconto pré-negociado", "SELLER_CAMPAIGN": "Campanha do vendedor",
    "SELLER_COUPON_CAMPAIGN": "Cupom do vendedor", "VOLUME": "Desconto por quantidade", "LIGHTNING": "Oferta relâmpago",
    "DOD": "Oferta do dia", "PRICE_DISCOUNT": "Desconto próprio", "BANK": "Co-participação Pix",
}
COM_OFERTA = {"SMART", "PRICE_MATCHING", "PRICE_MATCHING_MELI_ALL", "UNHEALTHY_STOCK", "PRE_NEGOTIATED", "BANK"}
COM_PRECO = {"DEAL", "MARKETPLACE_CAMPAIGN", "SELLER_CAMPAIGN"}
SO_NO_ML = {"LIGHTNING", "DOD"}
ATIVAS = {"started", "pending"}
DESCONTO_MINIMO_PCT = 5.0
MARGEM_VERDE_PCT = 5.0
DIAS_HISTORICO_APLICADAS = 120
MAX_POR_LOTE = 100
CACHE_ML_S = 7 * 24 * 3600

_travas: dict[int, threading.Lock] = defaultdict(threading.Lock)


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _data(v) -> datetime | None:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _iso(d: datetime | None) -> str:
    return d.isoformat() if d else ""


def config_de(db: Session, cliente: Cliente) -> ConfigPromocoes:
    cfg = db.get(ConfigPromocoes, cliente.id)
    if not cfg:
        cfg = ConfigPromocoes(cliente_id=cliente.id, empresa_id=cliente.empresa_id, ativo=True, margem_minima_pct=15.0,
                              desconto_padrao_pct=10.0, desconto_maximo_pct=40.0, dias_campanha=14, avisar_dias_antes=1)
        db.add(cfg)
        db.flush()
    return cfg


def config_dict(db: Session, cfg: ConfigPromocoes) -> dict:
    dono = db.get(Usuario, cfg.responsavel_id) if cfg.responsavel_id else None
    return {"ativo": bool(cfg.ativo), "margem_minima_pct": cfg.margem_minima_pct, "desconto_padrao_pct": cfg.desconto_padrao_pct,
            "desconto_maximo_pct": cfg.desconto_maximo_pct, "dias_campanha": cfg.dias_campanha, "avisar_dias_antes": cfg.avisar_dias_antes,
            "responsavel_id": cfg.responsavel_id, "responsavel": dono.nome if dono else ""}


def salvar_config(db: Session, cliente: Cliente, dados: dict, usuario: Usuario) -> ConfigPromocoes:
    if not acesso.pode_editar(usuario):
        raise PermissionError("Só administradores e operadores mudam as regras de promoção.")
    if dados["desconto_padrao_pct"] > dados["desconto_maximo_pct"]:
        raise ValueError("O desconto padrão não pode passar do desconto máximo.")
    resp = dados.get("responsavel_id")
    if resp:
        pessoa = db.get(Usuario, resp)
        if not pessoa or pessoa.empresa_id != cliente.empresa_id or not pessoa.ativo or pessoa.papel not in acesso.EQUIPE:
            raise ValueError("Escolha uma pessoa ativa da equipe como responsável.")
    cfg = config_de(db, cliente)
    for campo in ("ativo", "margem_minima_pct", "desconto_padrao_pct", "desconto_maximo_pct", "dias_campanha", "avisar_dias_antes"):
        setattr(cfg, campo, dados[campo])
    cfg.responsavel_id = resp or None
    registrar(db, cliente.empresa_id, "promocoes", "Alterou as regras da Central de promoções", cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return cfg


def _sku(it: dict) -> str:
    if it.get("seller_custom_field"):
        return str(it["seller_custom_field"])
    for a in it.get("attributes") or []:
        if a.get("id") == "SELLER_SKU" and a.get("value_name"):
            return str(a["value_name"])
    for v in it.get("variations") or []:
        if v.get("seller_custom_field"):
            return str(v["seller_custom_field"])
    return ""


class Custos:
    """Conta da margem na promoção: custo do produto + embalagem + comissão + taxa fixa + frete + imposto + Ads.

    Custo e embalagem vêm de Produtos e custos; se o anúncio não está ligado a um produto, vem do anúncio
    cadastrado no Replique que foi publicado nele (custo do editor). Comissão e taxa fixa são as do ML para a
    categoria, o tipo do anúncio e o preço da promoção (/listing_prices); o frete é o frete grátis com o peso
    do anúncio; imposto e Ads são os das vendas do cliente (o imposto cai para o do Financeiro). As respostas do ML ficam guardadas
    por 7 dias na leitura, para a próxima não repetir as consultas."""

    def __init__(self, db: Session, cliente: Cliente, margem_minima: float, ml=None, cache: dict | None = None):
        self.cat = financeiro.Catalogo(db, cliente.id)
        self.margem_minima = margem_minima
        lucr = rentabilidade.lucratividade(db, cliente, margem_minima)
        self.por_produto = {p["id"]: p for p in lucr["produtos"]}
        self.imposto_padrao = lucr.get("imposto_padrao_pct") or 0.0
        self.embalagem_padrao = financeiro.config_de(db, cliente).embalagem_padrao or 0.0
        self.do_replique = self._custos_do_replique(db, cliente)
        self.ml = ml
        self.vendedor = ""
        if ml is not None:
            try:
                self.vendedor = ml._user_id()
            except Exception:
                self.vendedor = ""
        agora = _agora().timestamp()
        validos = lambda d: {k: v for k, v in (d or {}).items() if agora - v[-1] < CACHE_ML_S}
        cache = cache or {}
        self.cache = {"tarifa": validos(cache.get("tarifa")), "frete": validos(cache.get("frete"))}
        self.consultas = 0

    @staticmethod
    def _custos_do_replique(db: Session, cliente: Cliente) -> dict[str, Anuncio]:
        """Anúncios do Replique com custo, pelo código do anúncio publicado no Mercado Livre."""
        linhas = (db.query(Publicacao.id_externo, Anuncio).join(Anuncio, Anuncio.id == Publicacao.anuncio_id)
                  .filter(Publicacao.cliente_id == cliente.id, Publicacao.plataforma == "mercadolivre",
                          Publicacao.sucesso.is_(True), Publicacao.demo.is_(False), Anuncio.excluido_em.is_(None),
                          Anuncio.custo.isnot(None))
                  .order_by(Publicacao.id).all())
        return {str(iid).upper(): a for iid, a in linhas if iid}

    def do_item(self, it: dict) -> dict | None:
        ship = it.get("shipping") or {}
        base = {"item_id": it.get("id", ""), "categoria": it.get("category_id") or "",
                "tipo": it.get("listing_type_id") or "gold_special", "full": ship.get("logistic_type") == "fulfillment"}
        c = self.cat.casar(it.get("id", ""), "", _sku(it))
        p = self.por_produto.get(c.produto.id) if c else None
        if p and p["custo"] is not None:
            return {**base, "custo": p["custo"] * c.unidades, "embalagem": p["embalagem"] or 0, "canal": p["canais"]["mercadolivre"],
                    "produto": p["nome"], "produto_id": p["id"], "custo_fonte": "produtos"}
        a = self.do_replique.get(str(it.get("id") or "").upper())
        if not a:
            return None
        imposto = a.imposto_pct if a.imposto_pct is not None else self.imposto_padrao
        return {**base, "custo": float(a.custo), "embalagem": self.embalagem_padrao,
                "canal": rentabilidade._padrao("mercadolivre", imposto), "produto": a.titulo or "", "produto_id": None,
                "anuncio_id": a.id, "custo_fonte": "replique"}

    def _pode_consultar(self) -> bool:
        return self.ml is not None and self.consultas < config.PROMOCOES_MAX_CONSULTAS

    def _tarifa(self, info: dict, preco: float) -> tuple[float, float] | None:
        if not info["categoria"]:
            return None
        chave = f"{info['categoria']}|{info['tipo']}|{round(preco)}"
        if chave not in self.cache["tarifa"] and self._pode_consultar():
            self.consultas += 1
            try:
                todas = self.ml.tarifas_de_venda(round(preco), info["categoria"])
            except Exception:
                todas = {}
            for tipo, t in todas.items():
                detalhes = t.get("sale_fee_details") or {}
                if "sale_fee_amount" in t:
                    self.cache["tarifa"][f"{info['categoria']}|{tipo}|{round(preco)}"] = [
                        float(detalhes.get("percentage_fee") or 0), float(detalhes.get("fixed_fee") or 0), _agora().timestamp()]
        v = self.cache["tarifa"].get(chave)
        return (v[0], v[1]) if v else None

    def _frete(self, info: dict, preco: float) -> float | None:
        if preco < FRETE_GRATIS_A_PARTIR:
            return 0.0
        chave = f"{info['item_id']}|{round(preco / 10)}"
        if chave not in self.cache["frete"] and self._pode_consultar() and self.vendedor:
            self.consultas += 1
            try:
                f = self.ml.frete_do_anuncio(self.vendedor, info["item_id"], preco)
            except Exception:
                f = None
            if f:
                self.cache["frete"][chave] = [f["custo"], _agora().timestamp()]
        v = self.cache["frete"].get(chave)
        return v[0] if v else None

    def no_preco(self, info: dict, preco: float) -> dict:
        """Comissão %, taxa fixa e frete no preço. Sem resposta do ML, usa o que as vendas mostram (ou o padrão)."""
        canal = info["canal"]
        tarifa = self._tarifa(info, preco)
        frete = self._frete(info, preco)
        return {"comissao_pct": tarifa[0] if tarifa else canal["comissao_pct"], "taxa_fixa": tarifa[1] if tarifa else canal["taxa_fixa"],
                "frete": frete if frete is not None else canal["frete_unidade"], "imposto_pct": canal["imposto_pct"],
                "ads_pct": canal["ads_pct"], "fonte": "mercado_livre" if tarifa else canal["fonte"],
                "frete_fonte": "mercado_livre" if frete is not None else canal["fonte"]}

    def margem(self, info: dict, preco: float) -> tuple[float, float]:
        c = self.no_preco(info, preco)
        canal = {"comissao_pct": c["comissao_pct"], "imposto_pct": c["imposto_pct"], "ads_pct": c["ads_pct"],
                 "frete_unidade": c["frete"], "taxa_fixa": c["taxa_fixa"]}
        return rentabilidade.margem_no_preco(preco, info["custo"], info["embalagem"], canal)

    def preco_minimo(self, info: dict) -> float | None:
        """Preço que deixa a margem mínima. As taxas mudam com o preço (taxa fixa e frete grátis a partir de R$ 79),
        então a conta é refeita com as taxas do preço encontrado até parar de mudar."""
        preco = rentabilidade.preco_minimo(info["custo"], info["embalagem"], info["canal"], self.margem_minima)
        for _ in range(4):
            if not preco:
                return None
            c = self.no_preco(info, preco)
            canal = {"comissao_pct": c["comissao_pct"], "imposto_pct": c["imposto_pct"], "ads_pct": c["ads_pct"],
                     "frete_unidade": c["frete"], "taxa_fixa": c["taxa_fixa"]}
            novo = rentabilidade.preco_minimo(info["custo"], info["embalagem"], canal, self.margem_minima)
            if novo is None or abs(novo - preco) < 0.01:
                return novo
            preco = novo
        return preco


def _acima(v: float) -> float:
    return math.ceil(v * 100) / 100


def _resultado(acao: str, motivo: str, preco: float | None, cheio: float, info: dict | None, custos: Custos) -> dict:
    saida = {"acao": acao, "motivo": motivo, "preco_sugerido": round(preco, 2) if preco else None,
             "desconto_pct": round((1 - preco / cheio) * 100, 1) if preco and cheio else None, "lucro": None, "margem": None,
             "margem_ok": None}
    if preco and info:
        saida.update(conta_da_margem(info, preco, custos))
    return saida


def conta_da_margem(info: dict, preco: float, custos: Custos) -> dict:
    """Margem vendendo a `preco`, com cada parcela da conta para mostrar na tela."""
    lucro, margem = custos.margem(info, preco)
    c = custos.no_preco(info, preco)
    return {"lucro": lucro, "margem": margem, "margem_ok": margem >= MARGEM_VERDE_PCT,
            "taxas": {"preco": round(preco, 2), "custo": round(info["custo"], 2), "embalagem": round(info["embalagem"], 2),
                      "comissao": round(preco * c["comissao_pct"] / 100, 2), "comissao_pct": c["comissao_pct"],
                      "taxa_fixa": c["taxa_fixa"], "frete": c["frete"], "imposto": round(preco * c["imposto_pct"] / 100, 2),
                      "imposto_pct": c["imposto_pct"], "ads": round(preco * c["ads_pct"] / 100, 2), "ads_pct": c["ads_pct"],
                      "fonte": c["fonte"], "frete_fonte": c["frete_fonte"], "custo_fonte": info.get("custo_fonte", "produtos")}}


def decidir_convite(conv: dict, cheio: float, info: dict | None, custos: Custos, cfg: ConfigPromocoes) -> dict:
    """Sugestão para um convite do ML. Fica sempre do lado seguro: na dúvida, recusa ou pede para conferir."""
    tipo = conv["tipo"]
    if tipo in SO_NO_ML:
        return _resultado("no_ml", "Oferta relâmpago e oferta do dia exigem estoque reservado e não podem ser retiradas depois de ativas: "
                          "decida direto na Central de promoções do ML.", conv.get("preco_sugerido") or conv.get("preco"), cheio, info, custos)
    if tipo not in COM_OFERTA | COM_PRECO:
        return _resultado("no_ml", "Este tipo de promoção é configurado direto no Mercado Livre.", None, cheio, info, custos)
    faixa = conv.get("preco_min") is not None and conv.get("preco_max") is not None and tipo in COM_PRECO
    fixo = conv.get("preco") if tipo in COM_OFERTA else None
    if not faixa and not fixo:
        preco = conv.get("preco_sugerido") or conv.get("preco")
        if not preco:
            return _resultado("no_ml", "O Mercado Livre não informou o preço desta promoção.", None, cheio, info, custos)
        fixo = preco
    desejado = fixo if fixo else (conv.get("preco_sugerido") or conv["preco_max"])
    if desejado and cheio and (1 - desejado / cheio) * 100 > cfg.desconto_maximo_pct + 0.05:
        if not faixa or conv["preco_max"] < cheio * (1 - cfg.desconto_maximo_pct / 100):
            return _resultado("recusar", f"Desconto acima do máximo do cliente ({cfg.desconto_maximo_pct:g}%).", desejado, cheio, info, custos)
        desejado = _acima(cheio * (1 - cfg.desconto_maximo_pct / 100))
    if not info:
        return _resultado("sem_custo", "Sem custo cadastrado: o Replique não consegue conferir a margem. Cadastre em Produtos e custos.",
                          desejado, cheio, info, custos)
    if custos.margem(info, desejado)[1] >= cfg.margem_minima_pct:
        return _resultado("aprovar", "Margem dentro do mínimo do cliente.", desejado, cheio, info, custos)
    minimo = custos.preco_minimo(info)
    if faixa and minimo is not None and _acima(max(minimo, conv["preco_min"])) <= conv["preco_max"]:
        return _resultado("aprovar", "Preço ajustado para manter a margem mínima.", _acima(max(minimo, conv["preco_min"])), cheio, info, custos)
    return _resultado("recusar", f"Margem abaixo de {cfg.margem_minima_pct:g}% no preço da promoção.", desejado, cheio, info, custos)


def decidir_proprio(cheio: float, info: dict | None, custos: Custos, cfg: ConfigPromocoes) -> dict:
    """Campanha própria (desconto do vendedor) para um anúncio sem promoção."""
    alvo = round(cheio * (1 - cfg.desconto_padrao_pct / 100), 2)
    if not info:
        return _resultado("sem_custo", "Sem custo cadastrado: o Replique não consegue conferir a margem. Cadastre em Produtos e custos.",
                          alvo, cheio, info, custos)
    if custos.margem(info, alvo)[1] >= cfg.margem_minima_pct:
        return _resultado("aprovar", f"Desconto padrão do cliente ({cfg.desconto_padrao_pct:g}%).", alvo, cheio, info, custos)
    minimo = custos.preco_minimo(info)
    if minimo is not None and (1 - _acima(minimo) / cheio) * 100 >= DESCONTO_MINIMO_PCT:
        return _resultado("aprovar", "Desconto reduzido para manter a margem mínima.", _acima(minimo), cheio, info, custos)
    return _resultado("recusar", f"Nem {DESCONTO_MINIMO_PCT:g}% de desconto cabe na margem mínima de {cfg.margem_minima_pct:g}%.",
                      None, cheio, info, custos)


def _adaptador(db: Session, cliente: Cliente):
    ml, aviso = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    if getattr(ml, "demo", False) or getattr(ml, "sem_conta", False):
        raise ValueError(aviso or "Conecte a conta do Mercado Livre deste cliente em Contas.")
    return ml


def _convite_do(p: dict, x: dict) -> dict:
    tipo = p.get("type") or x.get("type") or ""
    return {"promocao_id": str(p.get("id") or ""), "tipo": tipo, "tipo_nome": TIPOS.get(tipo, tipo),
            "nome": p.get("name") or TIPOS.get(tipo, tipo), "status": x.get("status") or "",
            "inicio": x.get("start_date") or p.get("start_date") or "",
            "fim": x.get("end_date") or x.get("finish_date") or p.get("finish_date") or "",
            "prazo": p.get("deadline_date") or "", "preco": _num(x.get("price")), "preco_original": _num(x.get("original_price")),
            "preco_min": _num(x.get("min_discounted_price")), "preco_max": _num(x.get("max_discounted_price")),
            "preco_sugerido": _num(x.get("suggested_discounted_price")), "offer_id": str(x.get("offer_id") or ""),
            "meli_pct": _num(x.get("meli_percentage")), "vendedor_pct": _num(x.get("seller_percentage"))}


def ler(db: Session, cliente: Cliente) -> dict:
    """Lê a conta inteira e monta as sugestões. Guarda em leituras_automaticas e devolve os dados.
    Nada fica gravado e pendente durante as consultas ao ML: no SQLite, isso seguraria a trava
    de escrita do banco por minutos e quem fosse salvar qualquer coisa ficaria esperando."""
    ml = _adaptador(db, cliente)
    cfg = config_de(db, cliente)
    db.commit()
    anterior = leitura(db, cliente.id)
    antes = (anterior.dados or {}) if anterior else {}
    ids = ml.ids_ativos(config.PROMOCOES_MAX_ANUNCIOS)
    itens = {it["id"]: it for it in ml.itens_resumidos(ids) if it.get("status", "active") == "active"}
    ativas: dict[str, list[dict]] = defaultdict(list)
    convites, campanhas, avisos = [], [], []
    for p in ml.promocoes_do_vendedor():
        if not p.get("id") or not p.get("type") or p.get("status") == "finished":
            continue
        campanhas.append({"id": str(p["id"]), "tipo": p["type"], "tipo_nome": TIPOS.get(p["type"], p["type"]),
                          "nome": p.get("name") or TIPOS.get(p["type"], p["type"]), "status": p.get("status") or "",
                          "inicio": p.get("start_date") or "", "fim": p.get("finish_date") or "", "prazo": p.get("deadline_date") or ""})
        try:
            lista = ml.itens_da_promocao(str(p["id"]), p["type"])
        except ErroMarketplace as e:
            avisos.append(f"{p.get('name') or p['type']}: {e}")
            continue
        for x in lista:
            iid = x.get("id")
            if iid not in itens:
                continue
            c = _convite_do(p, x)
            if c["status"] in ATIVAS:
                ativas[iid].append(c)
            elif c["status"] == "candidate":
                convites.append({"item_id": iid, **c})
    soltos = [iid for iid, it in itens.items() if iid not in ativas and _num(it.get("original_price")) and
              _num(it.get("original_price")) > (_num(it.get("price")) or 0)]
    for iid in soltos[:config.PROMOCOES_MAX_CONSULTAS]:
        try:
            for x in ml.promocoes_do_item(iid):
                if (x.get("status") or "") in ATIVAS:
                    ativas[iid].append(_convite_do({"type": x.get("type"), "id": x.get("id"), "name": x.get("name")}, x))
        except ErroMarketplace:
            pass
        if iid not in ativas:
            ativas[iid].append({"promocao_id": "", "tipo": "PRICE_DISCOUNT", "tipo_nome": TIPOS["PRICE_DISCOUNT"], "nome": "Desconto ativo",
                                "status": "started", "inicio": "", "fim": "", "prazo": "", "preco": _num(itens[iid].get("price"))})

    custos = Custos(db, cliente, cfg.margem_minima_pct, ml, antes.get("cache_ml"))
    agora = _agora()
    hoje = agora.astimezone(FUSO).date().isoformat()
    limite_aviso = agora + timedelta(days=max(0, cfg.avisar_dias_antes))
    linhas, em_promocao = [], {}
    for iid, it in itens.items():
        cheio = _num(it.get("original_price")) or _num(it.get("price")) or 0
        info = custos.do_item(it)
        promos = sorted(ativas.get(iid, []), key=lambda c: _data(c["fim"]) or datetime.max.replace(tzinfo=timezone.utc))
        fins = [d for d in (_data(c["fim"]) for c in promos if c["status"] == "started") if d]
        fim = min(fins) if fins else None
        if promos:
            em_promocao[iid] = _iso(fim)
        custos_ml = None
        if info and cheio:
            c = custos.no_preco(info, cheio)
            custos_ml = {"preco": cheio, "comissao_pct": c["comissao_pct"], "taxa_fixa": c["taxa_fixa"], "frete": c["frete"],
                         "fonte": c["fonte"], "frete_fonte": c["frete_fonte"]}
        atual = _num(it.get("price"))
        linhas.append({"margem_atual": conta_da_margem(info, atual, custos) if promos and info and atual else None,
                       "custo_fonte": info.get("custo_fonte") if info else None,
                       "item_id": iid, "titulo": (it.get("title") or "")[:200], "foto": it.get("thumbnail") or "",
                       "produto_id": info["produto_id"] if info else None, "custos_ml": custos_ml,
                       "link": it.get("permalink") or "", "preco": _num(it.get("price")), "preco_cheio": cheio,
                       "estoque": it.get("available_quantity"), "sku": _sku(it), "tem_custo": info is not None,
                       "produto": info["produto"] if info else "", "promocoes": promos, "fim": _iso(fim),
                       "vence": bool(fim and agora < fim <= limite_aviso),
                       "proprio": None if promos else decidir_proprio(cheio, info, custos, cfg)})
    for c in convites:
        it = itens[c["item_id"]]
        cheio = c.get("preco_original") or _num(it.get("original_price")) or _num(it.get("price")) or 0
        c.update({"titulo": (it.get("title") or "")[:200], "foto": it.get("thumbnail") or "", "link": it.get("permalink") or "",
                  "preco_cheio": cheio, "ja_em_promocao": c["item_id"] in ativas,
                  **decidir_convite(c, cheio, custos.do_item(it), custos, cfg)})
    convites.sort(key=lambda c: (c["acao"] != "aprovar", _data(c["prazo"]) or datetime.max.replace(tzinfo=timezone.utc)))

    acabaram = [x for x in (antes.get("acabaram") or []) if x.get("dia") == hoje]
    ja = {x["item_id"] for x in acabaram}
    for iid in antes.get("em_promocao") or {}:
        if iid in itens and iid not in em_promocao and iid not in ja:
            acabaram.append({"item_id": iid, "titulo": (itens[iid].get("title") or "")[:200], "dia": hoje})
    aplicadas = _aplicadas_vivas(antes.get("aplicadas") or {}, agora)
    for x in linhas:
        x["aplicada"] = aplicadas.get(f"{x['item_id']}|") if not x["promocoes"] else _ultima_aplicada(aplicadas, x["item_id"])
    for c in convites:
        c["aplicada"] = aplicadas.get(f"{c['item_id']}|{c['promocao_id']}")
        if c["aplicada"]:
            c["aplicado_em"] = c["aplicada"]["em"]
    sem = [x for x in linhas if not x["promocoes"]]
    dados = {"lida_em": _iso(agora), "itens": linhas, "convites": convites, "campanhas": campanhas, "avisos": avisos[:20],
             "em_promocao": em_promocao, "acabaram": acabaram, "cache_ml": custos.cache, "aplicadas": aplicadas,
             "resumo": {"ativos": len(linhas), "em_promocao": len(em_promocao), "sem_promocao": len(sem),
                        "vencem": sum(1 for x in linhas if x["vence"]), "acabaram_hoje": len(acabaram),
                        "convites": len(convites), "convites_aprovar": sum(1 for c in convites if c["acao"] == "aprovar"),
                        "convites_recusar": sum(1 for c in convites if c["acao"] == "recusar"),
                        "sem_custo": sum(1 for x in linhas if not x["tem_custo"]),
                        "proprio_aprovar": sum(1 for x in sem if x["proprio"]["acao"] == "aprovar"),
                        "prazo_mais_proximo": min((c["prazo"] for c in convites if c["prazo"]), default="")}}
    try:
        novidades.campanhas_novas(db, campanhas)
    except Exception as e:
        log.info("Não registrei campanhas novas: %s", e)
    _guardar(db, cliente, dados)
    avisar(db, cliente, dados, cfg)
    db.commit()
    return dados


def _aplicadas_vivas(aplicadas: dict, agora: datetime) -> dict:
    limite = agora - timedelta(days=DIAS_HISTORICO_APLICADAS)
    return {k: v for k, v in aplicadas.items() if (_data(v.get("em")) or agora) >= limite}


def _ultima_aplicada(aplicadas: dict, item_id: str) -> dict | None:
    do_item = [v for k, v in aplicadas.items() if k.split("|")[0] == item_id]
    return max(do_item, key=lambda v: v.get("em") or "") if do_item else None


def leitura(db: Session, cliente_id: int) -> LeituraAutomatica | None:
    return db.query(LeituraAutomatica).filter_by(tarefa=TAREFA, cliente_id=cliente_id, chave="").first()


def _guardar(db: Session, cliente: Cliente, dados: dict) -> None:
    l = leitura(db, cliente.id)
    if not l:
        l = LeituraAutomatica(tarefa=TAREFA, cliente_id=cliente.id, chave="", dados={}, falhas_seguidas=0)
        db.add(l)
    if "aplicadas" in dados:
        if l.id:
            db.refresh(l)
        dados["aplicadas"] = _aplicadas_vivas({**((l.dados or {}).get("aplicadas") or {}), **dados["aplicadas"]}, _agora())
    l.dados, l.erro, l.falhas_seguidas, l.lida_em = dados, "", 0, _agora()
    db.flush()


def destinatarios(db: Session, cliente: Cliente, cfg: ConfigPromocoes) -> list[int]:
    """Responsável pelas promoções, equipe do cliente (consultores e operadores) e administradores."""
    ids = set(notificacoes.equipe_do_cliente(db, cliente.id))
    ids |= {uid for (uid,) in db.query(Usuario.id).filter_by(empresa_id=cliente.empresa_id, papel="admin", ativo=True)}
    if cfg.responsavel_id:
        ids.add(cfg.responsavel_id)
    return sorted(ids)


def frase(cliente: Cliente, resumo: dict, responsavel: str) -> str:
    partes = []
    if resumo.get("acabaram_hoje"):
        partes.append(f"acabou hoje em {resumo['acabaram_hoje']} produto(s)")
    if resumo.get("vencem"):
        partes.append(f"{resumo['vencem']} vence(m) em breve")
    if resumo.get("convites"):
        partes.append(f"{resumo['convites']} convite(s) do ML esperando resposta")
    if not partes:
        return ""
    quem = f"@{responsavel.split()[0]}, " if responsavel else ""
    return f"{quem}colocar promoção nos produtos da {cliente.nome}: " + "; ".join(partes) + "."


def avisar(db: Session, cliente: Cliente, dados: dict, cfg: ConfigPromocoes) -> int:
    r = dados["resumo"]
    if not cfg.ativo or not (r["acabaram_hoje"] or r["vencem"] or r["convites"]):
        return 0
    dono = db.get(Usuario, cfg.responsavel_id) if cfg.responsavel_id else None
    hoje = _agora().astimezone(FUSO).date().isoformat()
    texto = frase(cliente, r, dono.nome if dono else "")
    return notificacoes.notificar(db, cliente, "promocao", f"Promoções: {cliente.nome}", texto, "#/promocoes",
                                  chave=f"promo-{cliente.id}-{hoje}-{r['acabaram_hoje']}-{r['vencem']}-{r['convites']}",
                                  usuarios=destinatarios(db, cliente, cfg))


def painel(db: Session, cliente: Cliente) -> dict:
    cfg = config_de(db, cliente)
    l = leitura(db, cliente.id)
    pessoas = (db.query(Usuario).filter(Usuario.empresa_id == cliente.empresa_id, Usuario.ativo.is_(True),
                                        Usuario.papel.in_(acesso.EQUIPE)).order_by(Usuario.nome).all())
    db.commit()
    return {"config": config_dict(db, cfg), "dados": (l.dados if l else None) or None,
            "erro": l.erro if l else "", "lida_em": l.lida_em if l else None,
            "equipe": [{"id": p.id, "nome": p.nome, "papel": p.papel} for p in pessoas], "tipos": TIPOS, "margem_verde_pct": MARGEM_VERDE_PCT}


def visao_geral(db: Session, usuario: Usuario) -> dict:
    clientes = acesso.clientes_acessiveis(db, usuario)
    ids = [c.id for c in clientes] or [0]
    leituras = {l.cliente_id: l for l in db.query(LeituraAutomatica).filter(
        LeituraAutomatica.tarefa == TAREFA, LeituraAutomatica.chave == "", LeituraAutomatica.cliente_id.in_(ids))}
    cfgs = {c.cliente_id: c for c in db.query(ConfigPromocoes).filter(ConfigPromocoes.cliente_id.in_(ids))}
    nomes = dict(db.query(Usuario.id, Usuario.nome).filter(Usuario.empresa_id == usuario.empresa_id))
    linhas = []
    for c in clientes:
        l, cfg = leituras.get(c.id), cfgs.get(c.id)
        resp = nomes.get(cfg.responsavel_id, "") if cfg and cfg.responsavel_id else ""
        r = ((l.dados or {}).get("resumo") if l else None) or {}
        linhas.append({"id": c.id, "nome": c.nome, "responsavel": resp, "ativo": cfg.ativo if cfg else True,
                       "lida_em": l.lida_em if l and l.dados else None, "erro": l.erro if l else "", "resumo": r,
                       "frase": frase(c, r, resp) if r else ""})
    linhas.sort(key=lambda x: (-(x["resumo"].get("acabaram_hoje", 0) + x["resumo"].get("sem_promocao", 0)), x["nome"].lower()))
    return {"clientes": linhas}


def mensagem_grupo(db: Session, usuario: Usuario) -> str:
    """Texto pronto para o grupo do WhatsApp com o que cada responsável precisa fazer hoje."""
    hoje = _agora().astimezone(FUSO)
    frases = [x["frase"] for x in visao_geral(db, usuario)["clientes"] if x["frase"] and x["ativo"]]
    if not frases:
        return ""
    return f"Promoções de {hoje:%d/%m}\n\n" + "\n".join(f"- {f}" for f in frases)


def _corpo(alvo: dict, preco: float | None, cfg: ConfigPromocoes) -> dict:
    tipo = alvo["tipo"]
    if tipo == "PRICE_DISCOUNT":
        inicio = _agora().astimezone(FUSO).replace(second=0, microsecond=0) + timedelta(minutes=5)
        fim = inicio + timedelta(days=cfg.dias_campanha)
        return {"promotion_type": tipo, "deal_price": preco, "start_date": inicio.strftime("%Y-%m-%dT%H:%M:%S"),
                "finish_date": fim.strftime("%Y-%m-%dT%H:%M:%S")}
    if tipo in COM_OFERTA:
        return {"promotion_id": alvo["promocao_id"], "promotion_type": tipo, "offer_id": alvo["offer_id"]}
    return {"promotion_id": alvo["promocao_id"], "promotion_type": tipo, "deal_price": preco}


def aplicar(db: Session, usuario: Usuario, cliente: Cliente, pedidos: list[dict], aceitar_sem_custo: bool = False) -> dict:
    """Aprovação em lote. Cada pedido: {item_id, promocao_id ("" = campanha própria)}.
    Lê de novo cada anúncio e refaz a conta antes de enviar ao ML."""
    if not acesso.pode_editar(usuario):
        raise PermissionError("Só administradores e operadores colocam anúncios em promoção.")
    if not pedidos:
        raise ValueError("Escolha pelo menos um anúncio.")
    if len(pedidos) > MAX_POR_LOTE:
        raise ValueError(f"Envie no máximo {MAX_POR_LOTE} anúncios por vez.")
    trava = _travas[cliente.id]
    if not trava.acquire(blocking=False):
        raise ValueError("Já tem um lote de promoções sendo enviado para este cliente. Espere terminar.")
    try:
        return _aplicar(db, usuario, cliente, pedidos, aceitar_sem_custo)
    finally:
        trava.release()


def _aplicar(db: Session, usuario: Usuario, cliente: Cliente, pedidos: list[dict], aceitar_sem_custo: bool) -> dict:
    l = leitura(db, cliente.id)
    dados = (l.dados or {}) if l else {}
    if not dados:
        raise ValueError("Leia as promoções da conta antes de aprovar.")
    cfg = config_de(db, cliente)
    convites = {(c["item_id"], c["promocao_id"]): c for c in dados.get("convites") or []}
    linhas = {x["item_id"]: x for x in dados.get("itens") or []}
    aplicadas = dict(dados.get("aplicadas") or {})
    ml = _adaptador(db, cliente)
    atuais = {it["id"]: it for it in ml.itens_resumidos(list(dict.fromkeys(p["item_id"] for p in pedidos)))}
    custos = Custos(db, cliente, cfg.margem_minima_pct, ml, dados.get("cache_ml"))
    feitos, recusados, erros = [], [], []
    for n, p in enumerate(pedidos):
        iid, pid = p["item_id"], p.get("promocao_id") or ""
        alvo = convites.get((iid, pid)) if pid else ({"tipo": "PRICE_DISCOUNT", "promocao_id": ""}
                                                     if iid in linhas and not linhas[iid]["promocoes"] else None)
        it = atuais.get(iid)
        if not alvo:
            recusados.append({"item_id": iid, "motivo": "Não está na última leitura. Leia de novo."})
            continue
        if not it or it.get("status") != "active":
            recusados.append({"item_id": iid, "motivo": "O anúncio não está ativo."})
            continue
        cheio_antes = (alvo.get("preco_cheio") if pid else linhas[iid]["preco_cheio"]) or 0
        cheio = (alvo.get("preco_original") if pid else None) or _num(it.get("original_price")) or _num(it.get("price")) or 0
        if not pid and _num(it.get("original_price")):
            recusados.append({"item_id": iid, "motivo": "O anúncio entrou em promoção depois da leitura."})
            continue
        if cheio_antes and abs(cheio - cheio_antes) / cheio_antes > 0.01:
            recusados.append({"item_id": iid, "motivo": "O preço do anúncio mudou depois da leitura. Leia de novo."})
            continue
        info = custos.do_item(it)
        decisao = decidir_convite(alvo, cheio, info, custos, cfg) if pid else decidir_proprio(cheio, info, custos, cfg)
        if not (decisao["acao"] == "aprovar" or (decisao["acao"] == "sem_custo" and aceitar_sem_custo)):
            recusados.append({"item_id": iid, "motivo": decisao["motivo"]})
            continue
        if n:
            time.sleep(config.PROMOCOES_PAUSA_S)
        try:
            ml.entrar_na_promocao(iid, _corpo(alvo, decisao["preco_sugerido"], cfg))
        except ErroMarketplace as e:
            erros.append({"item_id": iid, "motivo": str(e)[:300]})
            if e.detalhes.get("status") == 429:
                erros.append({"item_id": "", "motivo": "O Mercado Livre pediu para ir mais devagar. O resto do lote não foi enviado."})
                break
            continue
        feitos.append({"item_id": iid, "preco": decisao["preco_sugerido"], "tipo": alvo["tipo"]})
        quando = _iso(_agora())
        registro = {"por": usuario.nome, "por_id": usuario.id, "em": quando, "preco": decisao["preco_sugerido"],
                    "margem": decisao.get("margem"), "tipo": alvo["tipo"], "tipo_nome": TIPOS.get(alvo["tipo"], alvo["tipo"]),
                    "promocao": alvo.get("nome") or TIPOS.get(alvo["tipo"], alvo["tipo"])}
        aplicadas[f"{iid}|{pid}"] = registro
        alvo_linha = convites[(iid, pid)] if pid else linhas[iid]
        alvo_linha["aplicado_em"] = quando
        alvo_linha["aplicada"] = registro
    if feitos:
        l.dados = {**dados, "convites": list(convites.values()), "itens": list(linhas.values()), "aplicadas": aplicadas}
        registrar(db, cliente.empresa_id, "promocoes",
                  f"Colocou {len(feitos)} anúncio(s) em promoção pela Central de promoções", cliente_id=cliente.id, usuario=usuario,
                  itens=[f["item_id"] for f in feitos][:100])
    db.commit()
    return {"aplicados": feitos, "recusados": recusados, "erros": erros}
