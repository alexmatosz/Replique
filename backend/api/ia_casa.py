"""IA da casa: Padrão da casa, exemplos aprovados e o uso de IA no mês."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.api.deps import exigir_admin, usuario_atual
from backend.banco.db import get_db
from backend.banco.models import Anuncio, Usuario
from backend.services import acesso, exemplos, ia, padrao_casa, uso_ia

router = APIRouter(prefix="/api", tags=["ia"])


class PadraoEntrada(BaseModel):
    titulo_formula: dict[str, str] = Field(default_factory=dict)
    modelo_descricao: str = Field(default="", max_length=padrao_casa.LIMITE_TEXTO)
    tom_voz: str = Field(default="", max_length=500)
    palavras_proibidas: list[str] = Field(default_factory=list, max_length=padrao_casa.MAX_PALAVRAS)
    palavras_obrigatorias: list[str] = Field(default_factory=list, max_length=padrao_casa.MAX_PALAVRAS)
    fotos: dict[str, str] = Field(default_factory=dict)


class NovoExemplo(BaseModel):
    origem: str = "aprovado"
    titulo: str = Field(default="", max_length=300)
    descricao: str = Field(default="", max_length=6000)


def _equipe(usuario: Usuario):
    if usuario.papel not in acesso.EQUIPE:
        raise HTTPException(403, "Esta área é da equipe.")


def _cliente_ok(db, usuario, cliente_id):
    if cliente_id and not acesso.pode_ver(db, usuario, cliente_id):
        raise HTTPException(403, "Você não tem acesso a este cliente.")


@router.get("/padrao-casa")
def ver_padrao(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    _cliente_ok(db, usuario, cliente_id)
    return {"padrao": padrao_casa.ler(db, usuario.empresa_id, cliente_id),
            "efetivo": padrao_casa.efetivo(db, usuario.empresa_id, cliente_id), "cliente_id": cliente_id}


@router.put("/padrao-casa")
def salvar_padrao(dados: PadraoEntrada, cliente_id: int | None = None, usuario: Usuario = Depends(exigir_admin),
                  db: Session = Depends(get_db)):
    _cliente_ok(db, usuario, cliente_id)
    return {"padrao": padrao_casa.salvar(db, usuario, dados.model_dump(), cliente_id)}


@router.get("/exemplos")
def listar_exemplos(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    _cliente_ok(db, usuario, cliente_id)
    lista = exemplos.listar(db, usuario.empresa_id, cliente_id)
    ids = acesso.ids_acessiveis(db, usuario)
    return [e for e in lista if ids is None or e["cliente_id"] in ids]


@router.delete("/exemplos/{exemplo_id}")
def tirar_exemplo(exemplo_id: int, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    if not exemplos.desativar(db, usuario.empresa_id, exemplo_id):
        raise HTTPException(404, "Exemplo não encontrado.")
    return {"ok": True}


@router.post("/anuncios/{anuncio_id}/exemplo")
def aprovar_como_modelo(anuncio_id: int, dados: NovoExemplo, usuario: Usuario = Depends(usuario_atual),
                        db: Session = Depends(get_db)):
    _equipe(usuario)
    a = db.get(Anuncio, anuncio_id)
    if not a or a.empresa_id != usuario.empresa_id or a.excluido_em or not acesso.pode_ver(db, usuario, a.cliente_id):
        raise HTTPException(404, "Anúncio não encontrado.")
    try:
        ex = exemplos.salvar(db, a, usuario, dados.origem, dados.titulo, dados.descricao)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"id": ex.id, "origem": ex.origem}


@router.get("/ia/situacao")
def situacao_ia(cliente_id: int | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _equipe(usuario)
    _cliente_ok(db, usuario, cliente_id)
    saida = {**ia.situacao(), "uso": uso_ia.situacao(db, usuario.empresa_id, cliente_id) if cliente_id else None}
    if usuario.papel == "admin":
        saida["uso_clientes"] = uso_ia.resumo_empresa(db, usuario.empresa_id)
    return saida
