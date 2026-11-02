"""Aprendizado simples: anúncios aprovados como modelo viram exemplos que a IA
usa como referência nas próximas gerações (poucos, escolhidos pela categoria)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.banco.models import Anuncio, ExemploAnuncio, Usuario
from backend.services.auditoria import registrar

MAX_REFERENCIAS = 3
ORIGENS = {"aprovado": "Aprovado como modelo", "editado": "Editado depois da IA"}


def categoria_de(anuncio: Anuncio) -> str:
    return str(((anuncio.por_plataforma or {}).get("mercadolivre") or {}).get("category_id") or "")[:60]


def salvar(db: Session, anuncio: Anuncio, usuario: Usuario, origem: str = "aprovado", titulo: str = "",
           descricao: str = "", plataforma: str = "mercadolivre") -> ExemploAnuncio:
    titulo = (titulo or anuncio.titulo or "").strip()
    descricao = (descricao or anuncio.descricao or "").strip()
    if len(titulo) < 10 or len(descricao) < 40:
        raise ValueError("Para virar modelo, o anúncio precisa de título e descrição completos.")
    ja = (db.query(ExemploAnuncio).filter_by(empresa_id=anuncio.empresa_id, anuncio_id=anuncio.id, titulo=titulo[:300], ativo=True)
          .first())
    if ja:
        return ja
    ex = ExemploAnuncio(empresa_id=anuncio.empresa_id, cliente_id=anuncio.cliente_id, anuncio_id=anuncio.id,
                        plataforma=plataforma, categoria=categoria_de(anuncio), titulo=titulo[:300],
                        descricao=descricao[:6000], origem=origem if origem in ORIGENS else "aprovado", criado_por_id=usuario.id)
    db.add(ex)
    registrar(db, anuncio.empresa_id, "edicao", f"Guardou “{titulo[:80]}” como exemplo para a IA ({ORIGENS[ex.origem].lower()})",
              cliente_id=anuncio.cliente_id, usuario=usuario, anuncio_id=anuncio.id)
    db.commit()
    return ex


def escolher(db: Session, anuncio: Anuncio, limite: int = MAX_REFERENCIAS) -> list[ExemploAnuncio]:
    """Prioridade: mesma categoria e mesmo cliente, mesma categoria, mesmo cliente."""
    base = db.query(ExemploAnuncio).filter(ExemploAnuncio.empresa_id == anuncio.empresa_id, ExemploAnuncio.ativo.is_(True),
                                           (ExemploAnuncio.anuncio_id != anuncio.id) | ExemploAnuncio.anuncio_id.is_(None))
    categoria = categoria_de(anuncio)
    escolhidos: list[ExemploAnuncio] = []
    filtros = []
    if categoria:
        filtros += [(ExemploAnuncio.categoria == categoria, ExemploAnuncio.cliente_id == anuncio.cliente_id),
                    (ExemploAnuncio.categoria == categoria,)]
    filtros.append((ExemploAnuncio.cliente_id == anuncio.cliente_id,))
    for f in filtros:
        for ex in base.filter(*f).order_by(ExemploAnuncio.id.desc()).limit(limite):
            if ex not in escolhidos:
                escolhidos.append(ex)
        if len(escolhidos) >= limite:
            break
    return escolhidos[:limite]


def listar(db: Session, empresa_id: int, cliente_id: int | None = None) -> list[dict]:
    q = db.query(ExemploAnuncio).filter(ExemploAnuncio.empresa_id == empresa_id, ExemploAnuncio.ativo.is_(True))
    if cliente_id:
        q = q.filter(ExemploAnuncio.cliente_id == cliente_id)
    return [{"id": e.id, "titulo": e.titulo, "descricao": e.descricao[:400], "categoria": e.categoria, "origem": e.origem,
             "origem_nome": ORIGENS.get(e.origem, e.origem), "cliente_id": e.cliente_id, "anuncio_id": e.anuncio_id,
             "criado_em": e.criado_em} for e in q.order_by(ExemploAnuncio.id.desc()).limit(200)]


def desativar(db: Session, empresa_id: int, exemplo_id: int) -> bool:
    ex = db.get(ExemploAnuncio, exemplo_id)
    if not ex or ex.empresa_id != empresa_id:
        return False
    ex.ativo = False
    db.commit()
    return True
