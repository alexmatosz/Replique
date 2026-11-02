"""Controle de custo da IA: chamadas de texto e imagens geradas por cliente e
mês, com limite mensal configurável e aviso ao chegar perto."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend import config
from backend.banco.models import Cliente, UsoIA


class LimiteIA(Exception):
    pass


def mes_atual() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _linha(db: Session, empresa_id: int, cliente_id: int | None, mes: str) -> UsoIA:
    q = db.query(UsoIA).filter(UsoIA.empresa_id == empresa_id, UsoIA.mes == mes)
    q = q.filter(UsoIA.cliente_id == cliente_id) if cliente_id else q.filter(UsoIA.cliente_id.is_(None))
    linha = q.first()
    if not linha:
        linha = UsoIA(empresa_id=empresa_id, cliente_id=cliente_id, mes=mes, chamadas=0, imagens=0)
        db.add(linha)
        db.flush()
    return linha


def situacao(db: Session, empresa_id: int, cliente_id: int | None) -> dict:
    mes = mes_atual()
    q = db.query(UsoIA).filter(UsoIA.empresa_id == empresa_id, UsoIA.mes == mes)
    q = q.filter(UsoIA.cliente_id == cliente_id) if cliente_id else q.filter(UsoIA.cliente_id.is_(None))
    linha = q.first()
    chamadas, imagens = (linha.chamadas, linha.imagens) if linha else (0, 0)
    lim_c, lim_i = config.IA_LIMITE_CHAMADAS_MES, config.IA_LIMITE_IMAGENS_MES

    def pct(v, lim):
        return round(100 * v / lim) if lim else 0
    return {"mes": mes, "chamadas": chamadas, "imagens": imagens, "limite_chamadas": lim_c, "limite_imagens": lim_i,
            "pct_chamadas": pct(chamadas, lim_c), "pct_imagens": pct(imagens, lim_i),
            "perto": (lim_c and pct(chamadas, lim_c) >= config.IA_AVISO_PCT) or (lim_i and pct(imagens, lim_i) >= config.IA_AVISO_PCT)}


def conferir(db: Session, empresa_id: int, cliente_id: int | None, chamadas: int = 0, imagens: int = 0) -> None:
    s = situacao(db, empresa_id, cliente_id)
    if chamadas and s["limite_chamadas"] and s["chamadas"] + chamadas > s["limite_chamadas"]:
        raise LimiteIA(f"Limite mensal de IA de texto deste cliente atingido ({s['limite_chamadas']} chamadas). "
                       "O texto foi feito pelas regras automáticas. O administrador pode aumentar em IA_LIMITE_CHAMADAS_MES.")
    if imagens and s["limite_imagens"] and s["imagens"] + imagens > s["limite_imagens"]:
        raise LimiteIA(f"Limite mensal de fotos com IA deste cliente atingido ({s['limite_imagens']} imagens). "
                       "O administrador pode aumentar em IA_LIMITE_IMAGENS_MES.")


def registrar(db: Session, empresa_id: int, cliente_id: int | None, chamadas: int = 0, imagens: int = 0) -> dict:
    linha = _linha(db, empresa_id, cliente_id, mes_atual())
    linha.chamadas = (linha.chamadas or 0) + chamadas
    linha.imagens = (linha.imagens or 0) + imagens
    db.flush()
    s = situacao(db, empresa_id, cliente_id)
    if s["perto"] and cliente_id:
        from backend.services import notificacoes
        cliente = db.get(Cliente, cliente_id)
        notificacoes.notificar(db, cliente, "ia_limite", f"IA perto do limite do mês: {cliente.nome}",
                               f"Texto: {s['chamadas']}/{s['limite_chamadas']} · Imagens: {s['imagens']}/{s['limite_imagens']}",
                               "#/config", chave=f"ia-limite-{cliente_id}-{s['mes']}")
    db.commit()
    return s


def resumo_empresa(db: Session, empresa_id: int) -> list[dict]:
    mes = mes_atual()
    nomes = dict(db.query(Cliente.id, Cliente.nome).filter(Cliente.empresa_id == empresa_id))
    linhas = db.query(UsoIA).filter(UsoIA.empresa_id == empresa_id, UsoIA.mes == mes).all()
    return sorted([{**situacao(db, empresa_id, u.cliente_id), "cliente_id": u.cliente_id,
                    "cliente": nomes.get(u.cliente_id, "Sem cliente")} for u in linhas],
                  key=lambda x: -(x["chamadas"] + x["imagens"]))
