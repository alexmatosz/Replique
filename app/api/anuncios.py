"""Pesquisas, rascunhos de anúncio, fotos e publicação.

Listas e criação usam o cliente ativo (seletor do topo). Um rascunho já
existente é sempre tratado pelo cliente DONO dele: é esse cliente cujas
contas são usadas na validação e na publicação.
"""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import Contexto, contexto, contexto_equipe, exigir_equipe, usuario_atual
from app.config import UPLOADS_DIR
from app.db import get_db
from app.marketplaces.base import ErroMarketplace
from app.marketplaces.mercadolivre import MercadoLivre
from app.models import Anuncio, Cliente, Pesquisa, Publicacao, Usuario
from app.services import acesso, ia, replique
from app.services.auditoria import registrar

router = APIRouter(prefix="/api", tags=["replique"])

_TIPOS_IMAGEM = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_MAX_BYTES = 10 * 1024 * 1024


class NovaPesquisa(BaseModel):
    termo: str
    plataformas: list[str]
    limite: int = Field(default=20, ge=1, le=50)
    categoria_ml: str | None = None
    todas_marcas: bool = False  # ignora a marca do termo e traz os mais vendidos da categoria


class Copiar(BaseModel):
    plataforma: str
    id_externo: str
    tipo: str = "ITEM"
    pesquisa_id: int | None = None


class Plataformas(BaseModel):
    plataformas: list[str]


def _erro(e: Exception):
    if isinstance(e, ErroMarketplace):
        raise HTTPException(400, e.mensagem)
    raise HTTPException(400, str(e))


def _anuncio(db: Session, usuario: Usuario, anuncio_id: int) -> Anuncio:
    a = db.get(Anuncio, anuncio_id)
    if (not a or a.excluido_em or a.empresa_id != usuario.empresa_id
            or not acesso.pode_ver(db, usuario, a.cliente_id)):
        raise HTTPException(404, "Anúncio não encontrado.")
    return a


def _nomes(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: u.nome for u in db.query(Usuario).filter(Usuario.id.in_(ids))}


def anuncio_dict(db: Session, a: Anuncio) -> dict:
    nomes = _nomes(db, [a.criado_por_id, a.atualizado_por_id])
    cliente = db.get(Cliente, a.cliente_id) if a.cliente_id else None
    return {**{c: getattr(a, c) for c in (
        "id", "status", "titulo", "descricao", "preco", "estoque", "condicao", "marca", "modelo", "gtin",
        "sku", "peso_kg", "dimensoes_cm", "fotos", "atributos", "por_plataforma", "origem",
        "criado_em", "atualizado_em", "cliente_id")},
        "cliente_nome": cliente.nome if cliente else "",
        "criado_por": nomes.get(a.criado_por_id, ""), "atualizado_por": nomes.get(a.atualizado_por_id, "")}


def publicacao_dict(p: Publicacao, nomes: dict | None = None) -> dict:
    return {**{c: getattr(p, c) for c in ("id", "anuncio_id", "plataforma", "sucesso", "demo", "id_externo",
                                          "link", "mensagem", "detalhes", "criada_em", "conta_apelido")},
            "operador": (nomes or {}).get(p.usuario_id, "Claude (MCP)" if not p.usuario_id else "")}


def _pesquisa_dict(p: Pesquisa) -> dict:
    return {"id": p.id, "termo": p.termo, "plataformas": p.plataformas, "resultados": p.resultados,
            "avisos": p.avisos, "resumo": replique.resumo_mercado(p.resultados), "meta": p.meta or {},
            "criada_em": p.criada_em}


# ------------------------------------------------------------ pesquisas
@router.post("/pesquisas")
def pesquisar(dados: NovaPesquisa, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        p = replique.pesquisar(db, ctx.cliente, dados.termo, dados.plataformas, dados.limite, ctx.usuario,
                               dados.categoria_ml, dados.todas_marcas)
    except (ValueError, ErroMarketplace) as e:
        _erro(e)
    return _pesquisa_dict(p)


@router.get("/pesquisas")
def historico(ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    q = (db.query(Pesquisa).filter_by(cliente_id=ctx.cliente.id).order_by(Pesquisa.id.desc()).limit(30))
    return [{"id": p.id, "termo": p.termo, "plataformas": p.plataformas, "quantidade": len(p.resultados),
             "criada_em": p.criada_em} for p in q]


@router.get("/pesquisas/{pesquisa_id}")
def ver_pesquisa(pesquisa_id: int, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    p = db.get(Pesquisa, pesquisa_id)
    if not p or p.cliente_id != ctx.cliente.id:
        raise HTTPException(404, "Pesquisa não encontrada neste cliente.")
    return _pesquisa_dict(p)


# ------------------------------------------------------------ anúncios
@router.post("/anuncios/copiar")
def copiar(dados: Copiar, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    resultado = None
    if dados.pesquisa_id:
        p = db.get(Pesquisa, dados.pesquisa_id)
        if p and p.cliente_id == ctx.cliente.id:
            resultado = next((r for r in p.resultados if r["id_externo"] == dados.id_externo
                              and r["plataforma"] == dados.plataforma), None)
    try:
        a = replique.copiar(db, ctx.cliente, dados.plataforma, dados.id_externo, dados.tipo, resultado, ctx.usuario)
    except (ValueError, ErroMarketplace) as e:
        _erro(e)
    return anuncio_dict(db, a)


@router.post("/anuncios")
def criar(dados: dict, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    try:
        return anuncio_dict(db, replique.criar_em_branco(db, ctx.cliente, dados, ctx.usuario))
    except (ValueError, TypeError) as e:
        _erro(e)


@router.get("/anuncios")
def listar(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    lista = (db.query(Anuncio).filter(Anuncio.cliente_id == ctx.cliente.id, Anuncio.excluido_em.is_(None))
             .order_by(Anuncio.atualizado_em.desc()).all())
    nomes = _nomes(db, [a.criado_por_id for a in lista] + [a.atualizado_por_id for a in lista])
    return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "status": a.status,
             "foto": (a.fotos or [""])[0], "origem": a.origem.get("plataforma"),
             "criado_por": nomes.get(a.criado_por_id, ""), "atualizado_por": nomes.get(a.atualizado_por_id, ""),
             "criado_em": a.criado_em, "atualizado_em": a.atualizado_em} for a in lista]


@router.get("/anuncios/{anuncio_id}")
def ver(anuncio_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return anuncio_dict(db, _anuncio(db, usuario, anuncio_id))


@router.patch("/anuncios/{anuncio_id}")
def editar(anuncio_id: int, dados: dict, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    try:
        replique.editar(db, a, dados, usuario)
    except (ValueError, TypeError) as e:
        _erro(e)
    return anuncio_dict(db, a)


@router.delete("/anuncios/{anuncio_id}")
def excluir(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    registrar(db, a.empresa_id, "exclusao", f"Excluiu o rascunho “{a.titulo or 'sem título'}”",
              cliente_id=a.cliente_id, usuario=usuario, anuncio_id=a.id)
    # exclusão lógica: publicações e atividades continuam no histórico (auditoria)
    a.excluido_em = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/anuncios/{anuncio_id}/ia")
def melhorar(anuncio_id: int, dados: Plataformas, usuario: Usuario = Depends(exigir_equipe),
             db: Session = Depends(get_db)):
    """Devolve sugestões; o usuário escolhe o que aplicar no editor."""
    return ia.melhorar_anuncio(_anuncio(db, usuario, anuncio_id), dados.plataformas)


@router.post("/anuncios/{anuncio_id}/checar")
def checar(anuncio_id: int, dados: Plataformas, usuario: Usuario = Depends(exigir_equipe),
           db: Session = Depends(get_db)):
    try:
        return replique.checar(_anuncio(db, usuario, anuncio_id), replique.validar_plataformas(dados.plataformas))
    except ValueError as e:
        _erro(e)


@router.post("/anuncios/{anuncio_id}/publicar")
def publicar(anuncio_id: int, dados: Plataformas, usuario: Usuario = Depends(exigir_equipe),
             db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    try:
        pubs = replique.publicar(db, a, dados.plataformas, usuario)
    except ValueError as e:
        _erro(e)
    nomes = _nomes(db, [usuario.id])
    return {"status": a.status, "publicacoes": [publicacao_dict(p, nomes) for p in pubs]}


@router.get("/anuncios/{anuncio_id}/publicacoes")
def publicacoes_do_anuncio(anuncio_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    lista = db.query(Publicacao).filter_by(anuncio_id=a.id).order_by(Publicacao.id.desc()).all()
    nomes = _nomes(db, [p.usuario_id for p in lista])
    return [publicacao_dict(p, nomes) for p in lista]


@router.get("/publicacoes")
def publicacoes(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    q = (db.query(Publicacao, Anuncio.titulo).join(Anuncio, Anuncio.id == Publicacao.anuncio_id)
         .filter(Publicacao.cliente_id == ctx.cliente.id).order_by(Publicacao.id.desc()).limit(200)).all()
    nomes = _nomes(db, [p.usuario_id for p, _ in q])
    return [{**publicacao_dict(p, nomes), "titulo": titulo} for p, titulo in q]


# ------------------------------------------------------------ auxiliares
@router.get("/mercadolivre/categorias")
def categorias_ml(q: str, usuario: Usuario = Depends(exigir_equipe)):
    """Sugestão de categoria do ML para o editor (endpoint público)."""
    return MercadoLivre().prever_categorias(q, 5)


@router.get("/anuncios/{anuncio_id}/mercadolivre/atributos")
def atributos_ml(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    """Obrigatórios da categoria do ML para este rascunho (endpoints públicos do ML)."""
    try:
        return MercadoLivre().atributos_para_editor(_anuncio(db, usuario, anuncio_id))
    except ErroMarketplace as e:
        _erro(e)


def _ml_real(db: Session, anuncio: Anuncio):
    """Adaptador do ML com a conta do cliente DONO do rascunho."""
    from app.marketplaces.registry import obter_adaptador
    adaptador, aviso = obter_adaptador(db, anuncio.cliente_id, "mercadolivre", "publicar")
    if adaptador.demo:
        raise HTTPException(400, "Conecte a conta do Mercado Livre deste cliente em Contas para usar esta função "
                                 f"({aviso.removeprefix('Modo demonstração: ').rstrip('.')}).")
    return adaptador


@router.post("/anuncios/{anuncio_id}/mercadolivre/validar")
def validar_ml(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    """Pergunta ao ML se o anúncio seria aceito, sem publicar."""
    a = _anuncio(db, usuario, anuncio_id)
    try:
        r = _ml_real(db, a).validar(a)
    except ErroMarketplace as e:
        _erro(e)
    db.commit()  # guarda o cache das fotos enviadas ao ML
    return r


class BuscaCatalogo(BaseModel):
    termo: str | None = None


@router.post("/anuncios/{anuncio_id}/mercadolivre/catalogo/buscar")
def buscar_catalogo_ml(anuncio_id: int, dados: BuscaCatalogo, usuario: Usuario = Depends(exigir_equipe),
                       db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    try:
        return _ml_real(db, a).buscar_catalogo(a, dados.termo)
    except ErroMarketplace as e:
        _erro(e)


@router.post("/anuncios/{anuncio_id}/mercadolivre/catalogo/entrar")
def entrar_catalogo_ml(anuncio_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    """Optin de um anúncio já publicado (lista geral) no catálogo."""
    a = _anuncio(db, usuario, anuncio_id)
    cfg = (a.por_plataforma or {}).get("mercadolivre", {})
    if not cfg.get("catalog_product_id"):
        raise HTTPException(400, "Escolha o produto de catálogo na seção Catálogo antes.")
    pub = (db.query(Publicacao).filter_by(anuncio_id=a.id, plataforma="mercadolivre", sucesso=True, demo=False)
           .order_by(Publicacao.id.desc()).first())
    if not pub:
        raise HTTPException(400, "Este rascunho ainda não tem anúncio publicado no Mercado Livre.")
    try:
        r = _ml_real(db, a).entrar_no_catalogo(pub.id_externo, cfg["catalog_product_id"])
    except ErroMarketplace as e:
        _erro(e)
    pub.detalhes = {**(pub.detalhes or {}), "catalogo": r}
    pub.mensagem += f" {r['mensagem']}"
    registrar(db, a.empresa_id, "publicacao", f"Colocou “{a.titulo}” no catálogo do Mercado Livre",
              cliente_id=a.cliente_id, usuario=usuario, anuncio_id=a.id, plataforma="mercadolivre", sucesso=True)
    db.commit()
    return r


@router.post("/uploads")
async def enviar_foto(arquivo: UploadFile = File(...), usuario: Usuario = Depends(exigir_equipe)):
    extensao = _TIPOS_IMAGEM.get(arquivo.content_type or "")
    if not extensao:
        raise HTTPException(400, "Envie uma imagem JPG, PNG ou WEBP.")
    conteudo = await arquivo.read()
    if len(conteudo) > _MAX_BYTES:
        raise HTTPException(400, "Imagem maior que 10 MB.")
    aviso = ""
    try:
        from io import BytesIO

        from PIL import Image
        with Image.open(BytesIO(conteudo)) as img:
            largura, altura = img.size
        if min(largura, altura) < 500:
            aviso = (f"A foto tem {largura}x{altura}px. Mercado Livre e Shopee exigem no mínimo 500px "
                     "no menor lado (ideal 1200x1200).")
    except Exception:
        raise HTTPException(400, "Não consegui ler essa imagem. O arquivo pode estar corrompido.")
    pasta = UPLOADS_DIR / str(usuario.empresa_id)
    pasta.mkdir(exist_ok=True)
    nome = secrets.token_hex(10) + extensao
    (pasta / nome).write_bytes(conteudo)
    return {"url": f"/uploads/{usuario.empresa_id}/{nome}", "aviso": aviso}
