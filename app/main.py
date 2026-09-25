"""Aplicação web do Replique (API + interface)."""

import html
import logging

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import anuncios, auth, contas, gestao
from app.config import BASE_DIR, UPLOADS_DIR
from app.db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Replique — Monvatti", version="1.0.0",
              description="Pesquise os anúncios que mais vendem, copie, edite e publique em vários marketplaces.")
init_db()

app.include_router(auth.router)
app.include_router(contas.router)
app.include_router(anuncios.router)
app.include_router(gestao.router)

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
