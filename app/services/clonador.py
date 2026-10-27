"""Clonador de anúncios: cria RASCUNHOS a partir de anúncios que o cliente já tem.

Serve para levar um anúncio para outra plataforma, para outro cliente da
mesma empresa ou para criar variações (cor, tamanho, kit). Nunca publica:
o clone passa pelas mesmas travas de qualquer rascunho (checagem e nota de
risco, aprovação do lojista quando o cliente exige, conferência da conta na
hora de publicar).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.marketplaces.base import LIMITE_TITULO, PLATAFORMAS
from app.marketplaces.mercadolivre import MercadoLivre
from app.marketplaces.registry import obter_adaptador
from app.models import Anuncio, Cliente, Publicacao, Usuario
from app.services import acesso
from app.services.auditoria import registrar

MAX_ORIGENS = 50
MAX_VARIACOES = 10
MAX_CLONES = 100
CAMPOS = ("descricao", "preco", "estoque", "condicao", "marca", "modelo", "gtin", "peso_kg", "custo", "imposto_pct")


def _titulo(base: str, sufixo: str, plataforma: str) -> tuple[str, str]:
    titulo = f"{base} {sufixo}".strip() if sufixo else base
    limite = LIMITE_TITULO[plataforma]
    if len(titulo) <= limite:
        return titulo, ""
    return titulo[:limite].rstrip(), f"título cortado em {limite} caracteres ({PLATAFORMAS[plataforma]})"


def _categoria_ml(db: Session, cliente: Cliente, titulo: str) -> tuple[dict, str]:
    ad, _ = obter_adaptador(db, cliente.id, "mercadolivre")
    if not isinstance(ad, MercadoLivre):
        return {}, "escolha a categoria do Mercado Livre no editor"
    sugestao = (ad.prever_categorias(titulo, 1) or [{}])[0]
    if not sugestao.get("category_id"):
        return {}, "o Mercado Livre não sugeriu categoria: escolha no editor"
    return ({"category_id": sugestao["category_id"], "categoria_sugerida": sugestao.get("category_name", "")},
            f"categoria sugerida pelo Mercado Livre: {sugestao.get('category_name') or sugestao['category_id']} (confira)")


def origens(db: Session, cliente: Cliente) -> list[dict]:
    """O que dá para clonar: os rascunhos do cliente e também os anúncios já
    publicados cujo rascunho foi apagado (o conteúdo continua guardado)."""
    publicados = {}
    for p in (db.query(Publicacao).filter(Publicacao.cliente_id == cliente.id, Publicacao.sucesso.is_(True))
              .order_by(Publicacao.id)):
        publicados.setdefault(p.anuncio_id, []).append(p.plataforma)
    lista = (db.query(Anuncio).filter(Anuncio.cliente_id == cliente.id)
             .filter((Anuncio.excluido_em.is_(None)) | (Anuncio.id.in_(set(publicados) or {0})))
             .order_by(Anuncio.atualizado_em.desc()).limit(1000).all())
    return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "status": a.status, "foto": (a.fotos or [""])[0],
             "rascunho_apagado": a.excluido_em is not None, "publicado_em": sorted(set(publicados.get(a.id, [])))} for a in lista]


def clonar(db: Session, usuario: Usuario, origem_cliente: Cliente, anuncio_ids: list[int], plataforma: str,
           destino_cliente: Cliente | None = None, variacoes: list[str] | None = None, sku_sufixo: bool = True) -> dict:
    if plataforma not in PLATAFORMAS:
        raise ValueError("Escolha a plataforma de destino.")
    destino = destino_cliente or origem_cliente
    if destino.empresa_id != origem_cliente.empresa_id or not acesso.pode_ver(db, usuario, destino.id):
        raise ValueError("Você não atende o cliente de destino.")
    ids = list(dict.fromkeys(anuncio_ids))[:MAX_ORIGENS + 1]
    if not ids:
        raise ValueError("Escolha pelo menos um anúncio para clonar.")
    if len(ids) > MAX_ORIGENS:
        raise ValueError(f"Clone até {MAX_ORIGENS} anúncios por vez.")
    variacoes = [v.strip()[:60] for v in (variacoes or []) if v.strip()][:MAX_VARIACOES + 1]
    if len(variacoes) > MAX_VARIACOES:
        raise ValueError(f"Até {MAX_VARIACOES} variações por vez.")
    com_publicacao = {aid for (aid,) in db.query(Publicacao.anuncio_id).filter(
        Publicacao.cliente_id == origem_cliente.id, Publicacao.sucesso.is_(True), Publicacao.anuncio_id.in_(ids))}
    origens = [a for a in db.query(Anuncio).filter(Anuncio.id.in_(ids), Anuncio.cliente_id == origem_cliente.id)
               if a.excluido_em is None or a.id in com_publicacao]
    if len(origens) != len(ids):
        raise ValueError("Algum anúncio escolhido não é deste cliente ou foi excluído sem ter sido publicado.")
    if len(origens) * max(1, len(variacoes)) > MAX_CLONES:
        raise ValueError(f"Isso criaria mais de {MAX_CLONES} rascunhos. Divida em partes menores.")
    criados = []
    for a in origens:
        for sufixo in variacoes or [""]:
            titulo, aviso_titulo = _titulo(a.titulo, sufixo, plataforma)
            avisos = [x for x in (aviso_titulo,) if x]
            por_plataforma = {k: dict(v) for k, v in (a.por_plataforma or {}).items() if k == plataforma}
            if plataforma == "mercadolivre" and not por_plataforma.get("mercadolivre", {}).get("category_id"):
                cat, aviso = _categoria_ml(db, destino, titulo)
                por_plataforma["mercadolivre"] = cat
                avisos.append(aviso)
            elif plataforma != "mercadolivre" and not por_plataforma.get(plataforma):
                avisos.append(f"preencha no editor os campos próprios da {PLATAFORMAS[plataforma]} (categoria e atributos)")
            if destino.id != origem_cliente.id:
                avisos.append("custo e preço vieram do cliente de origem: confira")
            novo = Anuncio(empresa_id=destino.empresa_id, cliente_id=destino.id, criado_por_id=usuario.id, status="rascunho",
                           titulo=titulo, fotos=list(a.fotos or []), atributos={**(a.atributos or {}), **({"Variação": sufixo} if sufixo else {})},
                           dimensoes_cm=dict(a.dimensoes_cm or {}), por_plataforma=por_plataforma,
                           sku=(f"{a.sku}-{sufixo}"[:80] if a.sku and sufixo and sku_sufixo else a.sku),
                           origem={**(a.origem or {"plataforma": "manual"}), "clone_de": a.id, "clone_cliente": origem_cliente.id},
                           **{c: getattr(a, c) for c in CAMPOS})
            db.add(novo)
            db.flush()
            registrar(db, destino.empresa_id, "copia", f"Clonou “{a.titulo}” como rascunho para {PLATAFORMAS[plataforma]}"
                      + (f" ({sufixo})" if sufixo else ""), cliente_id=destino.id, usuario=usuario, anuncio_id=novo.id)
            criados.append({"id": novo.id, "titulo": novo.titulo, "origem_id": a.id, "avisos": avisos})
    db.commit()
    return {"criados": criados, "cliente_destino": destino.nome, "plataforma": plataforma}
