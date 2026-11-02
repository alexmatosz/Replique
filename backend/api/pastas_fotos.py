"""Tela Fotos salvas: pastas com as fotos guardadas pela extensão Monvatti Pro."""

import re
import unicodedata
import zipfile
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from backend.api.deps import usuario_atual
from backend.banco.db import get_db
from backend.banco.models import Usuario
from backend.services import acesso, fotos, pastas_fotos

router = APIRouter(prefix="/api/fotos-salvas", tags=["fotos-salvas"])


def exigir_time(usuario: Usuario = Depends(usuario_atual)) -> Usuario:
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "As fotos salvas pela extensão são da equipe Monvatti.")
    return usuario


def _pasta(db: Session, usuario: Usuario, pasta_id: int):
    try:
        return pastas_fotos.obter(db, usuario, pasta_id)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e


@router.get("")
def listar(usuario: Usuario = Depends(exigir_time), db: Session = Depends(get_db)):
    return [pastas_fotos.para_dict(db, p) for p in pastas_fotos.listar(db, usuario)]


@router.get("/{pasta_id}")
def ver(pasta_id: int, usuario: Usuario = Depends(exigir_time), db: Session = Depends(get_db)):
    return pastas_fotos.para_dict(db, _pasta(db, usuario, pasta_id))


@router.get("/{pasta_id}/fotos.zip")
def baixar(pasta_id: int, usuario: Usuario = Depends(exigir_time), db: Session = Depends(get_db)):
    pasta = _pasta(db, usuario, pasta_id)
    pacote = BytesIO()
    with zipfile.ZipFile(pacote, "w", zipfile.ZIP_STORED) as z:
        for n, url in enumerate(pasta.fotos or [], start=1):
            try:
                caminho = fotos.arquivo_local(url, pasta.empresa_id)
            except fotos.FotoInvalida:
                continue
            z.writestr(f"foto-{n:02d}{caminho.suffix}", caminho.read_bytes())
    sem_acento = unicodedata.normalize("NFKD", pasta.titulo or "").encode("ascii", "ignore").decode()
    nome = re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")[:60] or f"pasta-{pasta.id}"
    return Response(pacote.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{nome}-fotos.zip"'})


@router.delete("/{pasta_id}")
def excluir(pasta_id: int, usuario: Usuario = Depends(exigir_time), db: Session = Depends(get_db)):
    try:
        pastas_fotos.excluir(db, usuario, pasta_id)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except PermissionError as e:
        raise HTTPException(403, str(e)) from e
    db.commit()
    return {"ok": True}
