"""Aplicação web do Replique (API + interface)."""

import hashlib
import html
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import analise, anuncios, auth, contas, conversas, equipe, ferramentas, financeiro, gestao, lotes, projetos
from app.config import BASE_DIR, HABILITAR_DOCS, MAX_REQUISICAO_MB, NO_VERCEL
from app.db import SessionLocal, init_db
from app.security import ler_token_sessao
from app.services import ferramentas as permissoes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

@asynccontextmanager
async def _ciclo_de_vida(_app):
    from app.services.lotes import iniciar_fila
    iniciar_fila()
    yield


app = FastAPI(title="Replique — Monvatti", lifespan=_ciclo_de_vida, version="1.1.0",
              description="Pesquise os anúncios que mais vendem, copie, edite e publique em vários marketplaces.",
              docs_url="/docs" if HABILITAR_DOCS else None, redoc_url=None,
              openapi_url="/openapi.json" if HABILITAR_DOCS else None)
init_db()

_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; "
        "base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


_MAX_BYTES = int(MAX_REQUISICAO_MB * 1024 * 1024)


def _ferramenta_bloqueada(request: Request) -> str | None:
    """Nome da ferramenta se ela estiver desligada para o papel de quem chama."""
    ferramenta = permissoes.ferramenta_da_rota(request.url.path)
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    dados = ler_token_sessao(token) if ferramenta and token else None
    if not dados:
        return None
    from app.models import Cliente, Empresa, Usuario
    with SessionLocal() as db:
        usuario = db.get(Usuario, dados["u"])
        empresa = db.get(Empresa, usuario.empresa_id) if usuario else None
        if not usuario or not empresa:
            return None
        cliente = db.get(Cliente, usuario.cliente_id) if usuario.papel == "cliente" and usuario.cliente_id else None
        if ferramenta in permissoes.liberadas(usuario.papel, empresa.ferramentas_off, cliente.ferramentas_off if cliente else None):
            return None
    return next(n for k, n, _ in permissoes.CATALOGO if k == ferramenta)


@app.middleware("http")
async def ferramentas_por_funcao(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        bloqueada = _ferramenta_bloqueada(request)
        if bloqueada:
            return JSONResponse({"detail": f"A ferramenta “{bloqueada}” não está liberada para a sua função. "
                                           "Fale com o administrador."}, 403)
    return await call_next(request)


@app.middleware("http")
async def cabecalhos_de_seguranca(request: Request, call_next):
    tamanho = request.headers.get("content-length", "")
    if tamanho.isdigit() and int(tamanho) > _MAX_BYTES:
        resposta = JSONResponse({"detail": f"Envio grande demais (máximo {MAX_REQUISICAO_MB:g} MB)."}, 413)
    else:
        resposta = await call_next(request)
    resposta.headers["Content-Security-Policy"] = _CSP
    resposta.headers["X-Frame-Options"] = "DENY"
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    resposta.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resposta.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        resposta.headers["Strict-Transport-Security"] = "max-age=31536000"
    if request.url.path.startswith("/api/"):
        resposta.headers["Cache-Control"] = "no-store"
    elif request.url.path == "/" or request.url.path.startswith("/static/"):
        resposta.headers["Cache-Control"] = "no-cache"
    return resposta

app.include_router(auth.router)
app.include_router(contas.router)
app.include_router(anuncios.router)
app.include_router(gestao.router)
app.include_router(lotes.router)
app.include_router(ferramentas.router)
app.include_router(equipe.router)
app.include_router(financeiro.router)
app.include_router(analise.router)
app.include_router(projetos.router)
app.include_router(conversas.router)

WEB_DIR = BASE_DIR / "web"
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/uploads/{empresa_id}/{nome}", include_in_schema=False)
def foto_enviada(empresa_id: int, nome: str):
    from app.services.fotos import FotoInvalida, arquivo_local
    try:
        caminho = arquivo_local(f"/uploads/{empresa_id}/{nome}", empresa_id)
    except FotoInvalida:
        return JSONResponse({"detail": "Not Found"}, 404)
    return FileResponse(caminho, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.exception_handler(Exception)
async def erro_inesperado(request: Request, exc: Exception):
    logging.getLogger("replique").exception("Erro não tratado em %s", request.url.path)
    return JSONResponse({"detail": "Erro interno. Tente de novo; se persistir, veja o log do servidor."}, 500)


@app.get("/demo-img.svg", include_in_schema=False)
def imagem_demo(t: str = "Produto", c: str = "7C3AED"):
    """Imagem de marcação usada no modo demonstração (sem depender de internet)."""
    cor = c if len(c) == 6 and all(ch in "0123456789abcdefABCDEF" for ch in c) else "7C3AED"
    texto = html.escape(t[:40])
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<rect width="600" height="600" fill="#{cor}" opacity="0.14"/><rect x="150" y="130" width="300" height="260" rx="28" fill="#{cor}" opacity="0.55"/>
<text x="300" y="470" font-family="Segoe UI,Arial" font-size="26" text-anchor="middle" fill="#333">{texto}</text>
<text x="300" y="520" font-family="Segoe UI,Arial" font-size="18" text-anchor="middle" fill="#777">DEMONSTRAÇÃO</text></svg>"""
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/", include_in_schema=False)
def index():
    """A página aponta para os scripts e o CSS com a versão no endereço
    (?v=...). Quando o arquivo muda, o endereço muda e o navegador baixa o novo,
    mesmo que tenha uma cópia antiga guardada."""
    pagina = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    for nome in ("app.js", "app.css", "tema.js", "tour.js", "editor-fotos.js"):
        versao = hashlib.sha256((WEB_DIR / nome).read_bytes()).hexdigest()[:10]
        pagina = pagina.replace(f"/static/{nome}\"", f"/static/{nome}?v={versao}\"")
    if NO_VERCEL:
        pagina = pagina.replace("</body>", '  <script defer src="/_vercel/insights/script.js"></script>\n'
                                          '  <script defer src="/_vercel/speed-insights/script.js"></script>\n</body>')
    return HTMLResponse(pagina)
