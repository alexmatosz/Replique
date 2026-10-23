"""Pesquisas, rascunhos de anúncio, fotos e publicação.

Listas e criação usam o cliente ativo (seletor do topo). Um rascunho já
existente é sempre tratado pelo cliente DONO dele: é esse cliente cujas
contas são usadas na validação e na publicação.
"""

import re
import unicodedata
import zipfile
from datetime import datetime, timezone
from io import BytesIO

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import Contexto, contexto, contexto_equipe, exigir_equipe, usuario_atual
from app.api.limites import consumir, uso_ia, uso_pesquisa, uso_uploads
from app.db import get_db
from app.marketplaces.base import ErroMarketplace
from app.marketplaces.mercadolivre import MercadoLivre
from app.models import Anuncio, Cliente, Pesquisa, Publicacao, Usuario
from app.services import acesso, ia, imagens, replique
from app.services.auditoria import registrar
from app.services.fotos import FotoInvalida, guardar

router = APIRouter(prefix="/api", tags=["replique"])

_TIPOS_IMAGEM = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_MAX_BYTES = 10 * 1024 * 1024


class NovaPesquisa(BaseModel):
    termo: str
    plataformas: list[str]
    limite: int = Field(default=20, ge=1, le=50)
    categoria_ml: str | None = None
    todas_marcas: bool = False
    modo: str = Field(default="anuncios", pattern="^(anuncios|ranking)$")


class Copiar(BaseModel):
    plataforma: str
    id_externo: str
    tipo: str = "ITEM"
    pesquisa_id: int | None = None
    item_id: str = Field(default="", max_length=40)


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
        "criado_em", "atualizado_em", "cliente_id", "custo", "imposto_pct", "aprovacao_em")},
        "aprovacao": a.aprovacao or "", "aprovacao_nota": a.aprovacao_nota or "",
        "cliente_exige_aprovacao": bool(cliente and cliente.exige_aprovacao),
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


@router.post("/pesquisas")
def pesquisar(dados: NovaPesquisa, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    consumir(uso_pesquisa, ctx.usuario.id)
    try:
        p = replique.pesquisar(db, ctx.cliente, dados.termo, dados.plataformas, dados.limite, ctx.usuario,
                               dados.categoria_ml, dados.todas_marcas, dados.modo)
    except (ValueError, ErroMarketplace) as e:
        _erro(e)
    return _pesquisa_dict(p)


@router.get("/pesquisas")
def historico(ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    q = (db.query(Pesquisa).filter_by(cliente_id=ctx.cliente.id).order_by(Pesquisa.id.desc()).limit(30))
    return [{"id": p.id, "termo": p.termo, "plataformas": p.plataformas, "quantidade": len(p.resultados),
             "criada_em": p.criada_em} for p in q]


@router.delete("/pesquisas")
def apagar_historico(ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    """Apaga todas as pesquisas recentes deste cliente."""
    n = db.query(Pesquisa).filter_by(cliente_id=ctx.cliente.id).delete()
    db.commit()
    return {"apagadas": n}


@router.delete("/pesquisas/{pesquisa_id}")
def apagar_pesquisa(pesquisa_id: int, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    p = db.get(Pesquisa, pesquisa_id)
    if not p or p.cliente_id != ctx.cliente.id:
        raise HTTPException(404, "Pesquisa não encontrada neste cliente.")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.get("/pesquisas/{pesquisa_id}")
def ver_pesquisa(pesquisa_id: int, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    p = db.get(Pesquisa, pesquisa_id)
    if not p or p.cliente_id != ctx.cliente.id:
        raise HTTPException(404, "Pesquisa não encontrada neste cliente.")
    return _pesquisa_dict(p)


@router.post("/anuncios/copiar")
def copiar(dados: Copiar, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    resultado = None
    if dados.pesquisa_id:
        p = db.get(Pesquisa, dados.pesquisa_id)
        if p and p.cliente_id == ctx.cliente.id:
            resultado = next((r for r in p.resultados if r["id_externo"] == dados.id_externo
                              and r["plataforma"] == dados.plataforma), None)
    try:
        a = replique.copiar(db, ctx.cliente, dados.plataforma, dados.id_externo, dados.tipo, resultado, ctx.usuario,
                            dados.item_id)
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
    falhas: dict[int, str] = {}
    for p in (db.query(Publicacao).filter(Publicacao.cliente_id == ctx.cliente.id, Publicacao.sucesso.is_(False))
              .order_by(Publicacao.id)):
        falhas[p.anuncio_id] = f"{p.plataforma}: {p.mensagem}"
    return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "status": a.status,
             "falha": falhas.get(a.id, "") if a.status in ("erro", "parcial") else "",
             "foto": (a.fotos or [""])[0], "origem": a.origem.get("plataforma"), "aprovacao": a.aprovacao or "",
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
    a.excluido_em = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/anuncios/{anuncio_id}/ia")
def melhorar(anuncio_id: int, dados: Plataformas, usuario: Usuario = Depends(exigir_equipe),
             db: Session = Depends(get_db)):
    """Devolve sugestões; o usuário escolhe o que aplicar no editor."""
    anuncio = _anuncio(db, usuario, anuncio_id)
    consumir(uso_ia, usuario.id)
    return ia.melhorar_anuncio(anuncio, dados.plataformas)


@router.post("/anuncios/{anuncio_id}/checar")
def checar(anuncio_id: int, dados: Plataformas, usuario: Usuario = Depends(exigir_equipe),
           db: Session = Depends(get_db)):
    a = _anuncio(db, usuario, anuncio_id)
    try:
        res = replique.checar(a, replique.validar_plataformas(dados.plataformas))
    except ValueError as e:
        _erro(e)
    for p, r in res.items():
        pub = (db.query(Publicacao).filter_by(anuncio_id=a.id, plataforma=p, sucesso=True, demo=False)
               .order_by(Publicacao.id.desc()).first())
        if pub:
            r["avisos"].insert(0, f"Este rascunho já foi publicado aqui ({pub.id_externo}, {pub.criada_em:%d/%m/%Y}). "
                                  "Publicar de novo cria um segundo anúncio igual, o que o marketplace pode tratar como duplicado.")
    return res


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
    from app.services.publicacoes import removida
    q = [(p, a) for p, a in (db.query(Publicacao, Anuncio).join(Anuncio, Anuncio.id == Publicacao.anuncio_id)
                             .filter(Publicacao.cliente_id == ctx.cliente.id).order_by(Publicacao.id.desc()).limit(400))
         if not removida(p)]
    nomes = _nomes(db, [p.usuario_id for p, _ in q])
    return [{**publicacao_dict(p, nomes), "titulo": a.titulo, "foto": (a.fotos or [""])[0], "preco": a.preco,
             "estoque": a.estoque, "sku": a.sku, "rascunho_status": a.status,
             "rascunho_excluido": a.excluido_em is not None} for p, a in q]


@router.get("/mercadolivre/produtos/{product_id}/anuncios")
def anuncios_do_produto(product_id: str = Path(pattern=r"^[A-Za-z0-9-]{3,40}$"), ctx: Contexto = Depends(contexto_equipe),
                        db: Session = Depends(get_db)):
    """Todos os anúncios de um produto do catálogo, com vendedor, Full e visitas."""
    from app.marketplaces.demo import DemoMarketplace
    from app.marketplaces.registry import obter_adaptador
    consumir(uso_pesquisa, ctx.usuario.id)
    adaptador, _ = obter_adaptador(db, ctx.cliente.id, "mercadolivre", "pesquisar")
    if product_id.startswith("DEMO-"):
        adaptador = DemoMarketplace("mercadolivre")
    try:
        return {**adaptador.anuncios_do_produto(product_id), "demo": adaptador.demo}
    except ErroMarketplace as e:
        _erro(e)


class LinkAnuncio(BaseModel):
    url: str = Field(min_length=3, max_length=2000)


@router.post("/mercadolivre/link")
def ler_link(dados: LinkAnuncio, ctx: Contexto = Depends(contexto_equipe), db: Session = Depends(get_db)):
    """Link colado de um anúncio ou produto do ML: devolve o produto de catálogo
    (para abrir os anúncios dele) ou o que a API libera do anúncio."""
    from app.marketplaces.registry import obter_adaptador
    consumir(uso_pesquisa, ctx.usuario.id)
    adaptador, _ = obter_adaptador(db, ctx.cliente.id, "mercadolivre", "pesquisar")
    try:
        return {**adaptador.analisar_link(dados.url), "demo": adaptador.demo}
    except ErroMarketplace as e:
        _erro(e)


@router.get("/anuncios/{anuncio_id}/fotos.zip")
def baixar_fotos(anuncio_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Todas as fotos do rascunho num .zip (foto-01.jpg, foto-02.jpg...)."""
    a = _anuncio(db, usuario, anuncio_id)
    if not a.fotos:
        raise HTTPException(400, "Este rascunho não tem fotos.")
    pacote, falhas = BytesIO(), []
    with httpx.Client(headers={"User-Agent": "Replique/1.0"}) as http, zipfile.ZipFile(pacote, "w", zipfile.ZIP_STORED) as z:
        for n, url in enumerate(a.fotos, start=1):
            try:
                conteudo = imagens.ler_bytes(url, a.empresa_id, http)
                formato = (Image.open(BytesIO(conteudo)).format or "jpeg").lower()
            except Exception:
                falhas.append(n)
                continue
            z.writestr(f"foto-{n:02d}.{ {'jpeg': 'jpg'}.get(formato, formato) }", conteudo)
    if len(falhas) == len(a.fotos):
        raise HTTPException(400, "Não consegui baixar nenhuma foto (endereços fora do ar ou de demonstração).")
    sem_acento = unicodedata.normalize("NFKD", a.titulo or "").encode("ascii", "ignore").decode()
    nome = re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")[:60] or f"rascunho-{a.id}"
    cabecalhos = {"Content-Disposition": f'attachment; filename="{nome}-fotos.zip"'}
    if falhas:
        cabecalhos["X-Fotos-Falharam"] = ",".join(map(str, falhas))
    return Response(pacote.getvalue(), media_type="application/zip", headers=cabecalhos)


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
    db.commit()
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
    consumir(uso_uploads, usuario.id)
    conteudo = bytearray()
    while pedaco := await arquivo.read(256 * 1024):
        conteudo += pedaco
        if len(conteudo) > _MAX_BYTES:
            raise HTTPException(400, "Imagem maior que 10 MB.")
    conteudo = bytes(conteudo)
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
    return {"url": guardar(usuario.empresa_id, conteudo, extensao), "aviso": aviso}


class FotoExterna(BaseModel):
    url: str = Field(max_length=2000)


@router.post("/uploads/importar")
def importar_foto(dados: FotoExterna, usuario: Usuario = Depends(exigir_equipe)):
    """Traz uma foto de link externo para os arquivos da empresa. O editor de
    fotos só consegue salvar imagens do próprio Replique."""
    url = dados.url.strip()
    if url.startswith("/uploads/"):
        try:
            imagens.arquivo_local(url, usuario.empresa_id)
        except Exception:
            raise HTTPException(404, "Foto não encontrada.")
        return {"url": url}
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Use um link de imagem começando com https://.")
    consumir(uso_uploads, usuario.id)
    extensoes = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
    try:
        with httpx.Client(headers={"User-Agent": "Replique/1.0 (+Monvatti)"}) as http:
            conteudo = imagens.baixar_externa(http, url)[0]
        with Image.open(BytesIO(conteudo)) as img:
            formato = img.format
        if formato not in extensoes:
            saida = BytesIO()
            imagens.abrir(conteudo).save(saida, "PNG")
            conteudo, formato = saida.getvalue(), "PNG"
    except FotoInvalida as e:
        raise HTTPException(400, str(e))
    except (httpx.HTTPError, OSError):
        raise HTTPException(400, "Não consegui baixar ou ler essa imagem.")
    return {"url": guardar(usuario.empresa_id, conteudo, extensoes[formato])}


class AcaoPublicacao(BaseModel):
    acao: str


class PrecoEstoque(BaseModel):
    preco: float | None = None
    estoque: int | None = None


@router.get("/publicacoes/situacao")
def situacao_das_publicacoes(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    """Situação ao vivo dos anúncios publicados no ML e na Shopee (ativo, pausado, finalizado...)."""
    from app.services import publicacoes as servico
    return {str(k): v for k, v in servico.situacoes(db, ctx.cliente).items()}


@router.post("/publicacoes/{publicacao_id}/tirar-da-lista")
def tirar_publicacao_da_lista(publicacao_id: int, usuario: Usuario = Depends(exigir_equipe), db: Session = Depends(get_db)):
    """Some com a publicação da lista (ex.: anúncio apagado direto no ML por outra conta).
    Não mexe no marketplace."""
    from app.services import publicacoes as servico
    pub = db.get(Publicacao, publicacao_id)
    if not pub or pub.empresa_id != usuario.empresa_id or not acesso.pode_ver(db, usuario, pub.cliente_id):
        raise HTTPException(404, "Publicação não encontrada.")
    servico.tirar_da_lista(db, pub, "removido da lista pela equipe", usuario)
    db.commit()
    return {"ok": True}


@router.post("/publicacoes/{publicacao_id}/acao")
def acao_na_publicacao(publicacao_id: int, dados: AcaoPublicacao, usuario: Usuario = Depends(exigir_equipe),
                       db: Session = Depends(get_db)):
    from app.services import publicacoes as servico
    pub = db.get(Publicacao, publicacao_id)
    if not pub or pub.empresa_id != usuario.empresa_id or not acesso.pode_ver(db, usuario, pub.cliente_id):
        raise HTTPException(404, "Publicação não encontrada.")
    try:
        return servico.executar(db, pub, dados.acao, usuario)
    except ValueError as e:
        _erro(e)


@router.post("/publicacoes/{publicacao_id}/preco-estoque")
def preco_estoque_da_publicacao(publicacao_id: int, dados: PrecoEstoque, usuario: Usuario = Depends(exigir_equipe),
                                db: Session = Depends(get_db)):
    from app.services import publicacoes as servico
    pub = db.get(Publicacao, publicacao_id)
    if not pub or pub.empresa_id != usuario.empresa_id or not acesso.pode_ver(db, usuario, pub.cliente_id):
        raise HTTPException(404, "Publicação não encontrada.")
    try:
        return servico.alterar_preco_estoque(db, pub, dados.preco, dados.estoque, usuario)
    except ValueError as e:
        _erro(e)
