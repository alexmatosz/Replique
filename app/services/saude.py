"""Saúde da conta do Mercado Livre de cada cliente.

Lê a reputação (termômetro, reclamações, cancelamentos, atrasos no envio) e os
anúncios pausados pela moderação, e avisa ANTES de a conta mudar de cor.

Limites do MLB (developers.mercadolivre.com.br › Reputação de vendedores,
atualizado em 2025-08): taxa máxima para cada cor.
"""

from __future__ import annotations

import hashlib
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.marketplaces.base import ErroMarketplace
from app.marketplaces.registry import obter_adaptador
from app.models import Cliente, SaudeConta

log = logging.getLogger(__name__)

CORES = ("lider", "verde", "amarelo", "laranja", "vermelho")
# taxa máxima para: MercadoLíder, verde, amarelo, laranja (acima disso: vermelho)
LIMITES_MLB = {
    "claims": ("Reclamações", (0.01, 0.02, 0.045, 0.08)),
    "cancellations": ("Cancelamentos pelo vendedor", (0.005, 0.015, 0.035, 0.04)),
    "delayed_handling_time": ("Envios com atraso", (0.06, 0.10, 0.18, 0.22)),
}
# sub_status de anúncio pausado que indicam moderação (não é só falta de estoque)
MODERACAO = {"waiting_for_patch", "held", "suspended", "forbidden", "under_infraction", "freezed"}
ATENCAO = 0.7  # a partir de 70% do limite do verde já avisa
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
        # vendedor protegido vê 0%: o número que vale quando a proteção acabar está em "excluded"
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
    foto = SaudeConta(empresa_id=cliente.empresa_id, cliente_id=cliente.id, nivel=nivel, dados=dados, demo=demo)
    db.add(foto)
    db.commit()
    return foto


def ultimas(db: Session, cliente_ids: list[int]) -> dict[int, SaudeConta]:
    """Leitura mais recente de cada cliente."""
    if not cliente_ids:
        return {}
    ids = (db.query(func.max(SaudeConta.id)).filter(SaudeConta.cliente_id.in_(cliente_ids))
           .group_by(SaudeConta.cliente_id).all())
    return {s.cliente_id: s for s in db.query(SaudeConta).filter(SaudeConta.id.in_([i for (i,) in ids] or [0]))}


def saude_dict(s: SaudeConta | None) -> dict:
    if not s:
        return {"nivel": "nunca", "dados": {}, "demo": False, "criada_em": None}
    return {"nivel": s.nivel, "dados": s.dados, "demo": s.demo, "criada_em": s.criada_em}
