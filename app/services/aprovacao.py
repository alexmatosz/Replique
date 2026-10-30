"""Aprovação do lojista: a equipe prepara e precifica o anúncio, o lojista
confere a conta (preço, custo, tarifa, frete, imposto, lucro e margem) e
aprova ou questiona. O lojista não edita o anúncio.

A conta mostrada ao lojista é a do momento em que a equipe pediu a aprovação
(aprovacao_conta), para ele ver exatamente o que a equipe viu no editor."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Anuncio, Usuario
from app.services import margem
from app.services.auditoria import registrar

_CAMPOS_DA_CONTA = ("titulo", "descricao", "preco", "condicao", "marca", "modelo", "gtin", "peso_kg",
                    "dimensoes_cm", "fotos", "atributos", "custo", "imposto_pct")
_CONFIG_ML_DA_CONTA = ("listing_type_id", "category_id", "frete_estimado")


def assinatura(anuncio: Anuncio) -> tuple:
    """O que o lojista aprovou: mudou qualquer um destes, a aprovação cai."""
    cfg = (anuncio.por_plataforma or {}).get("mercadolivre", {}) or {}
    return (tuple(repr(getattr(anuncio, c)) for c in _CAMPOS_DA_CONTA)
            + tuple(repr(cfg.get(c)) for c in _CONFIG_ML_DA_CONTA))


def conta(db: Session, anuncio: Anuncio) -> dict:
    cfg = (anuncio.por_plataforma or {}).get("mercadolivre", {}) or {}
    r = margem.precificar(db, anuncio, frete_manual=margem._num(cfg.get("frete_estimado")))
    atual = r["atual"] or {}
    return {**atual, "tipo": r["tipo"], "tipo_nome": margem.TIPOS_ML.get(r["tipo"], r["tipo"]),
            "imposto_pct": r["imposto_pct"], "calculado_em": datetime.now(timezone.utc).isoformat()}


def motivo_para_nao_pedir(anuncio: Anuncio, c: dict) -> str:
    if not (anuncio.titulo or "").strip() or not anuncio.fotos:
        return "Complete título e fotos antes de pedir a aprovação."
    if not anuncio.preco or anuncio.preco <= 0:
        return "Informe o preço de venda antes de pedir a aprovação."
    if anuncio.custo is None:
        return "Informe o custo do produto: o lojista aprova vendo o lucro e a margem."
    cfg = (anuncio.por_plataforma or {}).get("mercadolivre", {}) or {}
    proprio = (anuncio.origem or {}).get("plataforma") in (None, "", "manual")
    if proprio and not margem._dimensoes_ml(anuncio) and margem._num(cfg.get("frete_estimado")) is None:
        return ("Anúncio próprio: informe o peso e as medidas da embalagem para o frete sair certo "
                "(cópias do catálogo já trazem esses dados).")
    if not c.get("frete"):
        return ("O frete não foi calculado. No Mercado Livre o vendedor sempre paga frete: "
                "digite o frete (sua parte) na calculadora do editor.")
    return ""


def pedir(db: Session, anuncio: Anuncio, usuario: Usuario | None) -> str:
    """Pede a aprovação com a conta atual. Devolve o motivo se não der ("" = pedido)."""
    c = conta(db, anuncio)
    if motivo := motivo_para_nao_pedir(anuncio, c):
        return motivo
    anuncio.aprovacao, anuncio.aprovacao_nota, anuncio.aprovacao_em = "pendente", "", None
    anuncio.aprovacao_conta = {**c, "por": usuario.nome if usuario else ""}
    registrar(db, anuncio.empresa_id, "aprovacao", f"Pediu ao lojista a aprovação de “{anuncio.titulo}”",
              cliente_id=anuncio.cliente_id, usuario=usuario, anuncio_id=anuncio.id)
    return ""


def decidir(db: Session, anuncio: Anuncio, usuario: Usuario, decisao: str, nota: str) -> None:
    anuncio.aprovacao = "aprovado" if decisao == "aprovar" else "recusado"
    anuncio.aprovacao_nota, anuncio.aprovacao_em, anuncio.aprovacao_por_id = nota, datetime.now(timezone.utc), usuario.id
    registrar(db, anuncio.empresa_id, "aprovacao",
              f"{'Aprovou' if decisao == 'aprovar' else 'Questionou'} “{anuncio.titulo}”" + (f": {nota}" if nota else ""),
              cliente_id=anuncio.cliente_id, usuario=usuario, anuncio_id=anuncio.id)


def item(anuncio: Anuncio) -> dict:
    return {"id": anuncio.id, "titulo": anuncio.titulo, "preco": anuncio.preco, "foto": (anuncio.fotos or [""])[0],
            "conta": anuncio.aprovacao_conta or None}
