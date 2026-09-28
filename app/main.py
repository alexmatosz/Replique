"""Aplicação web do Replique (API + interface)."""

import html
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import anuncios, auth, contas, ferramentas, gestao, lotes
from app.config import BASE_DIR, HABILITAR_DOCS, MAX_REQUISICAO_MB, UPLOADS_DIR
from app.db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

@asynccontextmanager
async def _ciclo_de_vida(_app):
    from app.services.lotes import iniciar_fila
    iniciar_fila()  # fila da publicação em massa
    yield


app = FastAPI(title="Replique — Monvatti", lifespan=_ciclo_de_vida, version="1.1.0",
              description="Pesquise os anúncios que mais vendem, copie, edite e publique em vários marketplaces.",
              # a documentação automática mostra todas as rotas: só em desenvolvimento
              docs_url="/docs" if HABILITAR_DOCS else None, redoc_url=None,
              openapi_url="/openapi.json" if HABILITAR_DOCS else None)
init_db()

# Cabeçalhos de segurança em todas as respostas:
# - CSP: só roda JavaScript do próprio Replique (um texto malicioso num anúncio não vira script);
# - frame-ancestors/X-Frame-Options: ninguém embute o Replique num site falso (clickjacking);
# - nosniff: o navegador não "adivinha" que uma foto é HTML.
_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; "
        "base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


_MAX_BYTES = int(MAX_REQUISICAO_MB * 1024 * 1024)


@app.middleware("http")
async def cabecalhos_de_seguranca(request: Request, call_next):
    tamanho = request.headers.get("content-length", "")
    if tamanho.isdigit() and int(tamanho) > _MAX_BYTES:
        # recusa antes de ler: ninguém entope a memória do servidor com um envio gigante
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
        # a tela sempre confere se há versão nova (sem isto o navegador reaproveitava o
        # app.js antigo por horas depois de uma atualização e as telas novas não apareciam)
        resposta.headers["Cache-Control"] = "no-cache"
    return resposta

app.include_router(auth.router)
app.include_router(contas.router)
app.include_router(anuncios.router)
app.include_router(gestao.router)
app.include_router(lotes.router)
app.include_router(ferramentas.router)

WEB_DIR = BASE_DIR / "web"
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


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
    return FileResponse(WEB_DIR / "index.html")
