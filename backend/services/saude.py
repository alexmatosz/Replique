"""Saúde das contas de cada cliente no Mercado Livre e na Shopee.

Mercado Livre: reputação (termômetro, reclamações, cancelamentos, atrasos no
envio) e anúncios pausados pela moderação, com aviso ANTES de a conta mudar de cor.
Shopee (só quando a loja está conectada): nota do Account Health, métricas fora
da meta, pontos de penalidade, punições em andamento e anúncios bloqueados.

Limites do MLB (developers.mercadolivre.com.br › Reputação de vendedores,
atualizado em 2025-08): taxa máxima para cada cor.
"""

from __future__ import annotations

import hashlib
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.marketplaces.base import ErroMarketplace
from backend.marketplaces.registry import conta_do_cliente, obter_adaptador
from backend.banco.models import Cliente, SaudeConta

log = logging.getLogger(__name__)

CORES = ("lider", "verde", "amarelo", "laranja", "vermelho")
LIMITES_MLB = {
    "claims": ("Reclamações", (0.01, 0.02, 0.045, 0.08)),
    "cancellations": ("Cancelamentos pelo vendedor", (0.005, 0.015, 0.035, 0.04)),
    "delayed_handling_time": ("Envios com atraso", (0.06, 0.10, 0.18, 0.22)),
}
MODERACAO = {"waiting_for_patch", "held", "suspended", "forbidden", "under_infraction", "freezed"}
ATENCAO = 0.7
TERMOMETRO = {"1_red": "vermelho", "2_orange": "laranja", "3_yellow": "amarelo", "4_light_green": "verde claro",
              "5_green": "verde"}


def _pct(v: float) -> str:
    return f"{v * 100:.1f}%".replace(".", ",")


def _periodo(texto: str) -> str:
    return (texto or "").replace("days", "dias").replace("historic", "histórico")


def cor_da_taxa(taxa: float, limites: tuple) -> str:
    for cor, limite in zip(CORES, limites):
        if taxa <= limite:
            return cor
    return "vermelho"


def analisar(reputacao: dict, contagem: dict, pausados: list[dict]) -> tuple[str, dict]:
    rep = reputacao.get("reputacao") or {}
    metricas_ml = rep.get("metrics") or {}
    protegido = bool(rep.get("protection_end_date"))
    metricas, alertas, nivel = [], [], "ok"

    def subir(novo):
        nonlocal nivel
        ordem = ["ok", "atencao", "critico"]
        nivel = max(nivel, novo, key=ordem.index)

    for chave, (nome, limites) in LIMITES_MLB.items():
        m = metricas_ml.get(chave) or {}
        taxa = (m.get("excluded") or {}).get("real_rate") if protegido else None
        taxa = float(taxa if taxa is not None else m.get("rate") or 0)
        cor = cor_da_taxa(taxa, limites)
        uso = taxa / limites[1] if limites[1] else 0
        metricas.append({"id": chave, "nome": nome, "taxa": taxa, "valor": m.get("value", 0), "periodo": _periodo(m.get("period", "")),
                         "limite_verde": limites[1], "limite_lider": limites[0], "cor": cor, "uso_do_limite": round(uso, 2)})
        if cor in ("amarelo", "laranja", "vermelho"):
            subir("critico")
            alertas.append(f"{nome}: {_pct(taxa)}, acima do limite do verde ({_pct(limites[1])}). A reputação já está caindo.")
        elif uso >= ATENCAO:
            subir("atencao")
            alertas.append(f"{nome}: {_pct(taxa)}, perto do limite do verde ({_pct(limites[1])}).")

    level = rep.get("level_id") or ""
    if level in ("1_red", "2_orange"):
        subir("critico")
        alertas.append(f"Termômetro {TERMOMETRO.get(level, level)}: risco de restrição de anúncios.")
    elif level == "3_yellow":
        subir("atencao")
        alertas.append("Termômetro amarelo: os anúncios perdem exposição.")
    if protegido and rep.get("real_level") and rep.get("real_level") != "green":
        subir("atencao")
        alertas.append(f"A conta está protegida até {rep['protection_end_date'][:10]}, mas o nível real é "
                       f"{rep['real_level']}. Quando a proteção acabar, a cor muda.")

    moderados = [{"id": p.get("id"), "titulo": p.get("title", ""), "motivo": ", ".join(p.get("sub_status") or []),
                  "link": p.get("permalink", "")}
                 for p in pausados if set(p.get("sub_status") or []) & MODERACAO]
    if moderados:
        subir("critico")
        alertas.append(f"{len(moderados)} anúncio(s) pausado(s) pela moderação. Corrija antes de publicar mais.")
    if contagem.get("under_review"):
        subir("atencao")
        alertas.append(f"{contagem['under_review']} anúncio(s) em revisão pelo Mercado Livre.")

    dados = {"apelido": reputacao.get("apelido", ""), "link": reputacao.get("permalink", ""),
             "termometro": level, "termometro_nome": TERMOMETRO.get(level, "sem reputação ainda" if not level else level),
             "mercado_lider": rep.get("power_seller_status") or "", "protegido": protegido,
             "vendas_periodo": (metricas_ml.get("sales") or {}).get("completed"),
             "periodo": _periodo((metricas_ml.get("sales") or {}).get("period", "")),
             "metricas": metricas, "anuncios": contagem, "moderados": moderados, "alertas": alertas}
    return nivel, dados


def _demo(cliente: Cliente) -> tuple[str, dict, dict, list]:
    """Números fictícios e estáveis por cliente (conta não conectada)."""
    semente = int(hashlib.sha256(f"saude{cliente.id}".encode()).hexdigest(), 16)
    fator = (semente % 100) / 100
    rep = {"apelido": "DEMONSTRACAO", "reputacao": {"level_id": "5_green" if fator < 0.7 else "3_yellow",
           "power_seller_status": "gold" if fator < 0.3 else None,
           "metrics": {"sales": {"period": "60 days", "completed": 80 + semente % 400},
                       "claims": {"rate": round(0.004 + fator * 0.03, 4), "value": 3},
                       "cancellations": {"rate": round(fator * 0.012, 4), "value": 1},
                       "delayed_handling_time": {"rate": round(0.02 + fator * 0.1, 4), "value": 5}}}}
    contagem = {"active": 20 + semente % 180, "paused": semente % 6, "under_review": 1 if fator > 0.85 else 0}
    pausados = [{"id": "MLB-DEMO-1", "title": "Anúncio de demonstração pausado", "sub_status": ["waiting_for_patch"],
                 "permalink": ""}] if fator > 0.8 else []
    return rep, contagem, pausados


NOTA_SHOPEE = {1: ("critico", "Ruim"), 2: ("atencao", "Precisa melhorar"), 3: ("ok", "Bom"), 4: ("ok", "Excelente")}
METRICAS_SHOPEE = {
    "late_shipment_rate": "Envios com atraso",
    "non_fulfillment_rate": "Pedidos não cumpridos",
    "cancellation_rate": "Cancelamentos",
    "return_refund_rate": "Devoluções e reembolsos",
    "fast_handover_rate": "Postagem rápida",
    "preparation_time": "Tempo de preparo",
    "response_rate": "Taxa de resposta do chat",
    "response_time": "Tempo de resposta do chat",
    "shop_rating": "Avaliação da loja",
    "severe_listing_violations": "Violações graves em anúncios",
    "other_listing_violations": "Outras violações em anúncios",
    "pre_order_listing_rate": "Anúncios em pré-venda",
    "pre_order_listing_violation_rate": "Anúncios em pré-venda",
    "spam_listings": "Anúncios spam",
    "counterfeit_ip_infringement": "Falsificação ou propriedade intelectual",
    "prohibited_listings": "Anúncios proibidos",
}
UNIDADE_SHOPEE = {2: "%", 3: " s", 4: " dias", 5: " h"}


def _cumpre(valor: float, comparador: str, meta: float) -> bool:
    return {"<": valor < meta, "<=": valor <= meta, ">": valor > meta, ">=": valor >= meta,
            "=": valor == meta}.get(comparador, True)


def _fmt(valor, unidade: int) -> str:
    texto = f"{float(valor):.2f}".rstrip("0").rstrip(".").replace(".", ",")
    return texto + UNIDADE_SHOPEE.get(unidade, "")


def analisar_shopee(desempenho: dict, penalidades: dict, contagem: dict, bloqueados: list[dict],
                    apelido: str = "") -> tuple[str, dict]:
    nivel, alertas = "ok", []

    def subir(novo):
        nonlocal nivel
        nivel = max(nivel, novo, key=["ok", "atencao", "critico"].index)

    geral = desempenho.get("overall_performance") or {}
    nota = geral.get("rating")
    nivel_nota, nome_nota = NOTA_SHOPEE.get(nota, ("ok", ""))
    if nivel_nota != "ok":
        subir(nivel_nota)
        alertas.append(f"Desempenho da loja: {nome_nota}. A Shopee reduz a exposição de lojas abaixo de Bom.")

    metricas = []
    for m in desempenho.get("metric_list") or []:
        alvo = m.get("target") or {}
        atual = m.get("current_period")
        if atual is None or alvo.get("value") is None:
            continue
        chave = (m.get("metric_name") or "").strip()
        nome = METRICAS_SHOPEE.get(chave.lower(), chave.replace("_", " ").capitalize())
        unidade = m.get("unit")
        ok = _cumpre(float(atual), alvo.get("comparator") or "", float(alvo["value"]))
        metricas.append({"nome": nome, "valor": _fmt(atual, unidade),
                         "meta": f"{alvo.get('comparator', '')} {_fmt(alvo['value'], unidade)}".strip(), "ok": ok})
        if not ok:
            subir("atencao")
            alertas.append(f"{nome}: {_fmt(atual, unidade)}, fora da meta da Shopee ({alvo.get('comparator', '')} "
                           f"{_fmt(alvo['value'], unidade)}).")
    metricas.sort(key=lambda x: x["ok"])

    pontos = int((penalidades.get("penalty_points") or {}).get("overall_penalty_points") or 0)
    punicoes = [{"nome": p.get("punishment_name") or f"Nível {p.get('punishment_tier', '?')}",
                 "dias": p.get("days_left")} for p in penalidades.get("ongoing_punishment") or []]
    if punicoes:
        subir("critico")
        alertas.append("Punição em andamento: " + "; ".join(
            f"{p['nome']}" + (f" (faltam {p['dias']} dias)" if p["dias"] is not None else "") for p in punicoes) + ".")
    elif pontos:
        subir("atencao")
        alertas.append(f"{pontos} ponto(s) de penalidade neste trimestre. A partir de 3 pontos a Shopee aplica punições.")

    if bloqueados or contagem.get("banned"):
        subir("critico")
        alertas.append(f"{contagem.get('banned') or len(bloqueados)} anúncio(s) bloqueado(s) pela Shopee. "
                       "Corrija antes de publicar mais.")
    if contagem.get("under_review"):
        subir("atencao")
        alertas.append(f"{contagem['under_review']} anúncio(s) em revisão pela Shopee.")

    dados = {"apelido": apelido, "nota": nome_nota, "pontos_penalidade": pontos, "punicoes": punicoes,
             "metricas": metricas, "anuncios": contagem, "moderados": [{**b, "motivo": "bloqueado pela Shopee"}
                                                                       for b in bloqueados],
             "alertas": alertas}
    return nivel, dados


def _coletar_shopee(db: Session, cliente: Cliente) -> SaudeConta | None:
    if not conta_do_cliente(db, cliente.id, "shopee"):
        return None
    adaptador, aviso = obter_adaptador(db, cliente.id, "shopee", "publicar")
    if adaptador.demo or getattr(adaptador, "sem_conta", False):
        nivel, dados = "sem_dados", {"alertas": [aviso.removeprefix("Modo demonstração: ") or "Loja Shopee sem acesso."],
                                     "metricas": [], "anuncios": {}, "moderados": []}
    else:
        try:
            try:
                penal = adaptador.penalidades()
            except ErroMarketplace:
                penal = {}
            nivel, dados = analisar_shopee(adaptador.desempenho_loja(), penal, adaptador.contagem_anuncios(),
                                           adaptador.anuncios_bloqueados(), adaptador.conta_info.get("apelido", ""))
        except ErroMarketplace as e:
            nivel, dados = "sem_dados", {"alertas": [e.mensagem], "metricas": [], "anuncios": {}, "moderados": []}
    foto = SaudeConta(empresa_id=cliente.empresa_id, cliente_id=cliente.id, plataforma="shopee", nivel=nivel,
                      dados=dados, demo=False)
    db.add(foto)
    return foto


def coletar(db: Session, cliente: Cliente) -> SaudeConta:
    adaptador, aviso = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    demo = adaptador.demo
    try:
        if demo:
            rep, contagem, pausados = _demo(cliente)
        else:
            rep, contagem, pausados = adaptador.reputacao(), adaptador.contagem_anuncios(), adaptador.anuncios_pausados()
        nivel, dados = analisar(rep, contagem, pausados)
        if demo:
            dados["aviso"] = aviso
    except ErroMarketplace as e:
        nivel, dados = "sem_dados", {"alertas": [e.mensagem], "metricas": [], "anuncios": {}, "moderados": []}
    foto = SaudeConta(empresa_id=cliente.empresa_id, cliente_id=cliente.id, plataforma="mercadolivre", nivel=nivel,
                      dados=dados, demo=demo)
    db.add(foto)
    _coletar_shopee(db, cliente)
    db.commit()
    return foto


def ultimas(db: Session, cliente_ids: list[int], plataforma: str = "mercadolivre") -> dict[int, SaudeConta]:
    """Leitura mais recente de cada cliente na plataforma."""
    if not cliente_ids:
        return {}
    filtro = SaudeConta.plataforma == plataforma
    if plataforma == "mercadolivre":
        filtro = filtro | SaudeConta.plataforma.is_(None)
    ids = (db.query(func.max(SaudeConta.id)).filter(SaudeConta.cliente_id.in_(cliente_ids), filtro)
           .group_by(SaudeConta.cliente_id).all())
    return {s.cliente_id: s for s in db.query(SaudeConta).filter(SaudeConta.id.in_([i for (i,) in ids] or [0]))}


def saude_dict(s: SaudeConta | None) -> dict:
    if not s:
        return {"nivel": "nunca", "dados": {}, "demo": False, "criada_em": None}
    return {"nivel": s.nivel, "dados": s.dados, "demo": s.demo, "criada_em": s.criada_em}


def do_cliente(db: Session, cliente: Cliente, ml: SaudeConta | None, shopee: SaudeConta | None) -> dict:
    """Saúde do cliente para a tela: a do ML, a da Shopee (se a loja estiver conectada)
    e o nível geral, que é o pior dos dois."""
    base = saude_dict(ml)
    if not shopee or not conta_do_cliente(db, cliente.id, "shopee"):
        return {**base, "nivel_ml": base["nivel"], "shopee": None}
    sp = saude_dict(shopee)
    ordem = ["ok", "nunca", "sem_dados", "atencao", "critico"]
    pior = max(base["nivel"], sp["nivel"], key=lambda n: ordem.index(n) if n in ordem else 0)
    return {**base, "nivel": pior, "nivel_ml": base["nivel"], "shopee": sp}
