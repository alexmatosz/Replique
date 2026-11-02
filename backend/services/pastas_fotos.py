"""Pastas de fotos salvas pela extensão Monvatti Pro.

Uma pasta por anúncio do Mercado Livre (pelo código MLB). As fotos são baixadas
pelo servidor só do CDN de imagens do ML e guardadas como cópias da empresa, para
continuarem disponíveis mesmo que o anúncio original saia do ar. Salvar de novo o
mesmo anúncio acrescenta só as fotos que ainda não estavam na pasta.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from io import BytesIO
from urllib.parse import urlparse

import httpx
from PIL import Image
from sqlalchemy.orm import Session

from backend.banco.models import Cliente, PastaFotos, Usuario
from backend.services import acesso, fotos
from backend.services.auditoria import registrar

MAX_FOTOS = 12
_FORMATOS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}


def _texto(valor, limite: int) -> str:
    return re.sub(r"\s+", " ", str(valor or "")).strip()[:limite]


def _do_ml(url: str) -> bool:
    p = urlparse(url)
    return p.scheme == "https" and bool(p.hostname) and (p.hostname == "mlstatic.com" or p.hostname.endswith(".mlstatic.com"))


def _guardar_imagem(empresa_id: int, conteudo: bytes) -> str:
    imagem = Image.open(BytesIO(conteudo))
    extensao = _FORMATOS.get(imagem.format or "")
    if not extensao:
        saida = BytesIO()
        imagem.convert("RGB").save(saida, "JPEG", quality=92)
        conteudo, extensao = saida.getvalue(), ".jpg"
    return fotos.guardar(empresa_id, conteudo, extensao)


def ids_visiveis(db: Session, usuario: Usuario) -> list[int] | None:
    """None = todas as pastas da empresa (admin); senão, os clientes que a pessoa atende."""
    return None if usuario.papel == "admin" else [c.id for c in acesso.clientes_acessiveis(db, usuario)]


def _visivel(db: Session, usuario: Usuario, pasta: PastaFotos | None) -> bool:
    if not pasta or pasta.empresa_id != usuario.empresa_id or usuario.papel not in acesso.EQUIPE:
        return False
    ids = ids_visiveis(db, usuario)
    return ids is None or pasta.cliente_id is None or pasta.cliente_id in ids


def salvar(db: Session, usuario: Usuario, pagina: dict, cliente_id: int | None = None,
           http: httpx.Client | None = None) -> tuple[PastaFotos, int, int]:
    """Guarda as fotos do anúncio aberto na pasta dele. Devolve (pasta, novas, falhas)."""
    if usuario.papel not in acesso.EQUIPE:
        raise ValueError("Só a equipe salva fotos pela extensão.")
    if cliente_id is not None and not acesso.pode_ver(db, usuario, cliente_id):
        raise ValueError("Você não atende este cliente.")
    urls = list(dict.fromkeys(u for u in (pagina.get("fotos") or []) if isinstance(u, str) and _do_ml(u)))[:MAX_FOTOS]
    if not urls:
        raise ValueError("Não achei fotos do anúncio para salvar.")
    item_id = _texto(pagina.get("item_id"), 40)
    pasta = (db.query(PastaFotos).filter_by(empresa_id=usuario.empresa_id, item_id=item_id).first()
             if item_id else None)
    if pasta is None:
        pasta = PastaFotos(empresa_id=usuario.empresa_id, item_id=item_id, fotos=[], origens=[])
        db.add(pasta)
    novas = [u for u in urls if u not in (pasta.origens or [])]
    guardadas, origens, falhas = list(pasta.fotos or []), list(pasta.origens or []), 0
    proprio = http is None
    http = http or httpx.Client(headers={"User-Agent": "Replique/1.0"})
    try:
        for url in novas:
            try:
                conteudo, _ = fotos.baixar_externa(http, url)
                guardadas.append(_guardar_imagem(usuario.empresa_id, conteudo))
                origens.append(url)
            except Exception:
                falhas += 1
    finally:
        if proprio:
            http.close()
    if not guardadas:
        if pasta.id is None:
            db.expunge(pasta)
        raise ValueError("Não consegui baixar as fotos do anúncio. Tente de novo em instantes.")
    pasta.fotos, pasta.origens = guardadas, origens
    pasta.titulo = _texto(pagina.get("titulo"), 300) or pasta.titulo or "Anúncio sem título"
    pasta.link = _texto(pagina.get("link"), 500) or pasta.link
    pasta.usuario_id = usuario.id
    if cliente_id is not None:
        pasta.cliente_id = cliente_id
    pasta.atualizado_em = datetime.now(timezone.utc)
    db.flush()
    salvas = len(novas) - falhas
    registrar(db, usuario.empresa_id, "fotos", f"Salvou {salvas} foto(s) de “{pasta.titulo}” pela extensão Monvatti Pro",
              cliente_id=pasta.cliente_id, usuario=usuario)
    return pasta, salvas, falhas


def listar(db: Session, usuario: Usuario) -> list[PastaFotos]:
    q = db.query(PastaFotos).filter_by(empresa_id=usuario.empresa_id)
    ids = ids_visiveis(db, usuario)
    if ids is not None:
        q = q.filter((PastaFotos.cliente_id.is_(None)) | (PastaFotos.cliente_id.in_(ids or [0])))
    return q.order_by(PastaFotos.atualizado_em.desc()).all()


def obter(db: Session, usuario: Usuario, pasta_id: int) -> PastaFotos:
    pasta = db.get(PastaFotos, pasta_id)
    if not _visivel(db, usuario, pasta):
        raise LookupError("Pasta não encontrada.")
    return pasta


def excluir(db: Session, usuario: Usuario, pasta_id: int) -> None:
    pasta = obter(db, usuario, pasta_id)
    if not acesso.pode_editar(usuario):
        raise PermissionError("Só administradores e operadores excluem pastas de fotos.")
    for url in pasta.fotos or []:
        fotos.apagar(url, pasta.empresa_id)
    registrar(db, usuario.empresa_id, "fotos", f"Excluiu a pasta de fotos “{pasta.titulo}”",
              cliente_id=pasta.cliente_id, usuario=usuario)
    db.delete(pasta)


def para_dict(db: Session, pasta: PastaFotos) -> dict:
    cliente = db.get(Cliente, pasta.cliente_id) if pasta.cliente_id else None
    dono = db.get(Usuario, pasta.usuario_id) if pasta.usuario_id else None
    return {"id": pasta.id, "titulo": pasta.titulo, "item_id": pasta.item_id, "link": pasta.link,
            "fotos": list(pasta.fotos or []), "quantidade": len(pasta.fotos or []),
            "cliente_id": pasta.cliente_id, "cliente_nome": cliente.nome if cliente else "",
            "salvo_por": dono.nome if dono else "", "criado_em": pasta.criado_em, "atualizado_em": pasta.atualizado_em}
