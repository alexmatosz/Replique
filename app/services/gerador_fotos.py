"""Gerador de fotos do anúncio a partir de UMA foto do produto.

Quatro tipos, nesta ordem no anúncio:
1. branco         — o produto sozinho em fundo branco puro (capa: é o que ML, Shopee e Amazon pedem);
2. caracteristicas — infográfico com 3 a 5 destaques do produto (montado aqui, com texto exato em português);
3. contexto       — o produto no ambiente onde é usado ou exibido (IA);
4. demonstrativa  — o produto sendo usado, mostrando função e tamanho (IA).

A IA de imagem (OpenAI ou Gemini, configurável no .env) recebe a foto real
como referência e a ordem de manter o produto idêntico: formato, cor, peças,
textos e logos. Ela cria só o cenário em volta. Sem chave de IA, o fundo
branco é feito aqui mesmo quando a foto já tem fundo liso, e o infográfico
funciona sempre.

Roda em segundo plano (GeracaoFotos): a tela acompanha pelo id.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import secrets
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from app import config
from app.db import SessionLocal
from app.models import Anuncio, GeracaoFotos, Usuario
from app.services import ia, imagens
from app.services.auditoria import registrar
from app.services.fotos import FotoInvalida

log = logging.getLogger("replique.fotos")

TIPOS = {
    "branco": "Fundo branco (capa)",
    "caracteristicas": "Características",
    "contexto": "Produto em contexto",
    "demonstrativa": "Demonstração de uso",
}
LADO = 1200
AZUL = (29, 78, 216)
TINTA = (17, 24, 39)
SEGUNDO_PLANO = os.getenv("FOTOS_EM_SEGUNDO_PLANO", "true").lower() == "true"


class ErroGeracao(Exception):
    pass


def provedor() -> str:
    """Qual IA de imagem está configurada ("" = nenhuma)."""
    escolhido = config.IMAGENS_PROVEDOR
    if escolhido == "openai" and config.OPENAI_API_KEY:
        return "openai"
    if escolhido == "gemini" and config.GEMINI_API_KEY:
        return "gemini"
    if not escolhido:
        if config.OPENAI_API_KEY:
            return "openai"
        if config.GEMINI_API_KEY:
            return "gemini"
    return ""


# ---------------------------------------------------------------- prompts
_FIEL = ("The product in the reference image must stay EXACTLY as it is: same shape, proportions, colors, materials, "
         "texture, printed text, logos, buttons, cables and every part. Do not add, remove, redesign or restyle anything "
         "on the product. ")
_SEM_TEXTO = "No text, no captions, no watermarks, no extra logos or brand names."


def _prompt_branco() -> str:
    return ("E-commerce product photo edit. " + _FIEL +
            "Remove the background and show the product alone, centered, on a pure white background (#FFFFFF), filling about "
            "85% of a square frame, soft even studio lighting, at most a very subtle natural contact shadow under it. "
            "No props, no other objects. " + _SEM_TEXTO)


def _prompt_contexto(anuncio: Anuncio, cena: str) -> str:
    onde = cena.strip() or "a realistic, attractive setting where this product is typically used or displayed in a Brazilian home or business"
    return (f"Photorealistic lifestyle photo for an e-commerce listing. The product is: {anuncio.titulo}. " + _FIEL +
            f"Place it in {onde}. Natural light, the product is the clear focus, fully visible and sharp, with realistic "
            "scale relative to the surrounding objects. Square format. " + _SEM_TEXTO)


def _prompt_demonstrativa(anuncio: Anuncio, acao: str) -> str:
    como = acao.strip() or "a person using the product the way it is meant to be used, making its function and size obvious"
    return (f"Photorealistic photo demonstrating a product in use, for an e-commerce listing. The product is: "
            f"{anuncio.titulo}. " + _FIEL + f"Show {como}. Hands or part of a person are fine; faces cropped or out of "
            "focus. Clean composition, the product fully visible and in focus. Square format. " + _SEM_TEXTO)


# ---------------------------------------------------------------- provedores de IA
def _png(img: Image.Image, maximo: int = 1536) -> bytes:
    img = img.copy()
    img.thumbnail((maximo, maximo))
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _erro_http(r: httpx.Response, quem: str) -> ErroGeracao:
    try:
        corpo = r.json()
        msg = (corpo.get("error") or {}).get("message") if isinstance(corpo.get("error"), dict) else corpo.get("error")
    except ValueError:
        msg = r.text[:200]
    return ErroGeracao(f"{quem} recusou o pedido (HTTP {r.status_code}): {msg or 'sem detalhes'}")


def _openai(http: httpx.Client, referencia: Image.Image, prompt: str) -> Image.Image:
    dados = {"model": config.OPENAI_IMAGE_MODEL, "prompt": prompt, "size": "1024x1024", "n": "1",
             "quality": "high", "input_fidelity": "high"}
    arquivos = [("image[]", ("produto.png", _png(referencia), "image/png"))]
    for _ in range(2):
        r = http.post("https://api.openai.com/v1/images/edits", data=dados, files=arquivos,
                      headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"}, timeout=240)
        if r.status_code == 400 and "input_fidelity" in r.text and "input_fidelity" in dados:
            dados.pop("input_fidelity")  # modelo que não aceita o parâmetro
            continue
        break
    if r.status_code >= 400:
        raise _erro_http(r, "A OpenAI")
    return imagens.abrir(base64.b64decode(r.json()["data"][0]["b64_json"]))


def _gemini(http: httpx.Client, referencia: Image.Image, prompt: str) -> Image.Image:
    corpo = {"contents": [{"role": "user", "parts": [
        {"text": prompt}, {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(_png(referencia)).decode()}}]}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"], "imageConfig": {"aspectRatio": "1:1"}}}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_IMAGE_MODEL}:generateContent"
    for _ in range(2):
        r = http.post(url, json=corpo, headers={"x-goog-api-key": config.GEMINI_API_KEY}, timeout=240)
        if r.status_code == 400 and "imageConfig" in corpo["generationConfig"]:
            corpo["generationConfig"].pop("imageConfig")  # modelo sem controle de proporção
            continue
        break
    if r.status_code >= 400:
        raise _erro_http(r, "O Gemini")
    for cand in r.json().get("candidates") or []:
        for parte in (cand.get("content") or {}).get("parts") or []:
            dado = parte.get("inlineData") or parte.get("inline_data")
            if dado and dado.get("data"):
                return imagens.abrir(base64.b64decode(dado["data"]))
    raise ErroGeracao("O Gemini não devolveu imagem (pode ter recusado por política de conteúdo).")


def gerar_com_ia(http: httpx.Client, referencia: Image.Image, prompt: str) -> Image.Image:
    qual = provedor()
    if qual == "openai":
        return _openai(http, referencia, prompt)
    if qual == "gemini":
        return _gemini(http, referencia, prompt)
    raise ErroGeracao("Configure OPENAI_API_KEY ou GEMINI_API_KEY no .env para gerar esta foto com IA.")


# ---------------------------------------------------------------- tratamento local
def _branco_puro(img: Image.Image, limiar: int = 243) -> Image.Image:
    """Quase-branco vira branco puro (a IA costuma entregar #FAFAFA; ML pede #FFFFFF)."""
    r, g, b = img.convert("RGB").split()
    menor = ImageChops.darker(r, ImageChops.darker(g, b))
    mascara = menor.point(lambda v: 255 if v >= limiar else 0)
    saida = img.convert("RGB")
    saida.paste((255, 255, 255), mask=mascara)
    return saida


def _caixa_do_produto(img: Image.Image, limiar: int = 240):
    r, g, b = img.convert("RGB").split()
    menor = ImageChops.darker(r, ImageChops.darker(g, b))
    return menor.point(lambda v: 255 if v < limiar else 0).getbbox()


def enquadrar(img: Image.Image, largura: int = LADO, altura: int = LADO, ocupacao: float = 0.85) -> Image.Image:
    """Recorta o produto e centraliza em fundo branco ocupando ~85% do quadro."""
    caixa = _caixa_do_produto(img)
    produto = img.crop(caixa) if caixa else img
    escala = min(largura * ocupacao / produto.width, altura * ocupacao / produto.height)
    produto = produto.resize((max(1, round(produto.width * escala)), max(1, round(produto.height * escala))),
                             Image.Resampling.LANCZOS)
    tela = Image.new("RGB", (largura, altura), "white")
    tela.paste(produto, ((largura - produto.width) // 2, (altura - produto.height) // 2))
    return tela


def _fundo_liso(img: Image.Image) -> tuple[bool, tuple]:
    """A borda da foto é de uma cor só? (foto de estúdio, fundo de cartolina…)"""
    p = img.convert("RGB").copy()
    p.thumbnail((200, 200))
    w, h = p.size
    borda = [p.getpixel((x, y)) for x in range(0, w, 3) for y in (0, h - 1)] + \
            [p.getpixel((x, y)) for y in range(0, h, 3) for x in (0, w - 1)]
    mediana = tuple(sorted(c[i] for c in borda)[len(borda) // 2] for i in range(3))
    perto = sum(1 for c in borda if max(abs(c[i] - mediana[i]) for i in range(3)) <= 28)
    return perto / len(borda) >= 0.9, mediana


def remover_fundo_liso(img: Image.Image) -> Image.Image:
    """Pinta de branco o fundo que encosta na borda (preenchimento a partir das bordas)."""
    pequeno = img.convert("RGB").copy()
    pequeno.thumbnail((600, 600))
    marca = (1, 254, 3)
    w, h = pequeno.size
    sementes = [(x, y) for x in range(0, w, max(1, w // 12)) for y in (0, h - 1)] + \
               [(x, y) for y in range(0, h, max(1, h // 12)) for x in (0, w - 1)]
    for s in sementes:
        if pequeno.getpixel(s) != marca:
            ImageDraw.floodfill(pequeno, s, marca, thresh=30)
    diferenca = ImageChops.difference(pequeno, Image.new("RGB", pequeno.size, marca)).convert("L")
    mascara = diferenca.point(lambda v: 255 if v <= 2 else 0).filter(ImageFilter.MaxFilter(3))
    mascara = mascara.resize(img.size, Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
    saida = img.convert("RGB")
    saida.paste((255, 255, 255), mask=mascara)
    return saida


def fundo_branco(http: httpx.Client, base: Image.Image) -> tuple[Image.Image, str]:
    if provedor():
        img = gerar_com_ia(http, base, _prompt_branco())
        return enquadrar(_branco_puro(img)), ""
    liso, _ = _fundo_liso(base)
    if liso:
        return enquadrar(_branco_puro(remover_fundo_liso(base))), ""
    return enquadrar(_branco_puro(base)), ("O fundo da foto não é liso: sem IA de imagem configurada, só enquadrei o produto. "
                                           "Configure OPENAI_API_KEY ou GEMINI_API_KEY para remover o fundo.")


# ---------------------------------------------------------------- infográfico
_FONTES = [
    Path(config.BASE_DIR, "web", "fontes", "Inter-Bold.ttf"),
    Path("C:/Windows/Fonts/segoeuib.ttf"), Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
]


def _fonte(tamanho: int) -> ImageFont.ImageFont:
    for caminho in _FONTES:
        if caminho.is_file():
            try:
                return ImageFont.truetype(str(caminho), tamanho)
            except OSError:
                continue
    return ImageFont.load_default(size=tamanho)  # fonte embutida no Pillow


_UNIDADE = re.compile(r"(\d) (mm|cm|m|km|kg|g|mg|ml|l|L|W|V|Hz|GB|TB|mAh|pol|polegadas)\b")


def _quebrar(draw: ImageDraw.ImageDraw, texto: str, fonte, largura: int) -> list[str]:
    """Quebra em linhas sem separar número e unidade ("3,5 mm" fica junto)."""
    texto = _UNIDADE.sub("\\1\u00a0\\2", " ".join(texto.split()))
    linhas, atual = [], ""
    for palavra in texto.split(" "):
        teste = f"{atual} {palavra}".strip()
        if draw.textlength(teste, font=fonte) <= largura or not atual:
            atual = teste
        else:
            linhas.append(atual)
            atual = palavra
    return linhas + ([atual] if atual else [])


def _destaque(draw: ImageDraw.ImageDraw, x0: int, y: int, linhas: list[str], fonte, altura_linha: int) -> int:
    """Marcador azul com check + texto. Devolve o y depois do bloco."""
    cy = y + altura_linha // 2
    draw.ellipse((x0 - 62, cy - 20, x0 - 22, cy + 20), fill=AZUL)
    draw.line([(x0 - 51, cy), (x0 - 45, cy + 7), (x0 - 32, cy - 8)], fill="white", width=5, joint="curve")
    for linha in linhas:
        draw.text((x0, y), linha, font=fonte, fill=TINTA)
        y += altura_linha
    return y


def caracteristicas(branco: Image.Image, destaques: list[str]) -> Image.Image:
    """Infográfico: produto + destaques com marcador azul. O texto é desenhado
    aqui (não pela IA), então sai sem erro de português. Produto alto fica à
    esquerda com os destaques à direita; produto largo fica em cima, com os
    destaques em duas colunas embaixo (senão ele sairia pequeno)."""
    tela = Image.new("RGB", (LADO, LADO), "white")
    draw = ImageDraw.Draw(tela)
    caixa = _caixa_do_produto(branco)
    largura, altura = (caixa[2] - caixa[0], caixa[3] - caixa[1]) if caixa else branco.size
    destaques = destaques[:5]
    if largura / max(1, altura) > 1.25:
        produto = enquadrar(branco, 1120, 700, ocupacao=0.94)
        tela.paste(produto, (40, 30))
        fonte, altura_linha = _fonte(36), 46
        colunas = [destaques[0::2], destaques[1::2]]
        for i, coluna in enumerate(colunas):
            y = 790
            for d in coluna:
                y = _destaque(draw, 130 + i * 540, y, _quebrar(draw, d, fonte, 420), fonte, altura_linha) + 34
    else:
        produto = enquadrar(branco, 640, 1000, ocupacao=0.9)
        tela.paste(produto, (20, (LADO - 1000) // 2))
        fonte, altura_linha, respiro = _fonte(42), 54, 56
        blocos = [_quebrar(draw, d, fonte, 440) for d in destaques]
        total = sum(len(b) * altura_linha for b in blocos) + respiro * (len(blocos) - 1)
        y = max(80, (LADO - total) // 2)
        for bloco in blocos:
            y = _destaque(draw, 700, y, bloco, fonte, altura_linha) + respiro
    draw.rectangle((0, LADO - 14, LADO, LADO), fill=AZUL)
    return tela


# ---------------------------------------------------------------- execução
def _salvar(img: Image.Image, empresa_id: int) -> str:
    pasta = config.UPLOADS_DIR / str(empresa_id)
    pasta.mkdir(exist_ok=True)
    nome = secrets.token_hex(10) + ".jpg"
    img.convert("RGB").resize((LADO, LADO), Image.Resampling.LANCZOS).save(pasta / nome, "JPEG", quality=90, optimize=True)
    return f"/uploads/{empresa_id}/{nome}"


def validar_pedido(pedido: dict) -> dict:
    tipos = [t for t in dict.fromkeys(pedido.get("tipos") or []) if t in TIPOS]
    if not tipos:
        raise ValueError(f"Escolha o que gerar: {', '.join(TIPOS)}.")
    foto = str(pedido.get("foto") or "").strip()
    if not foto:
        raise ValueError("Escolha a foto do produto que servirá de base.")
    if not (foto.startswith("/uploads/") or foto.startswith("http")):
        raise ValueError("Use uma foto real do produto (envie o arquivo ou cole um link), não a de demonstração.")
    return {"foto": foto, "tipos": [t for t in TIPOS if t in tipos],
            "cenario": str(pedido.get("cenario") or "")[:300], "demonstracao": str(pedido.get("demonstracao") or "")[:300]}


def iniciar(db, anuncio: Anuncio, usuario: Usuario | None, pedido: dict) -> GeracaoFotos:
    pedido = validar_pedido(pedido)
    geracao = GeracaoFotos(empresa_id=anuncio.empresa_id, anuncio_id=anuncio.id, usuario_id=usuario.id if usuario else None,
                           pedido=pedido, status="gerando")
    db.add(geracao)
    db.commit()
    if SEGUNDO_PLANO:
        threading.Thread(target=executar, args=(geracao.id,), name=f"fotos-{geracao.id}", daemon=True).start()
    else:
        executar(geracao.id)
        db.refresh(geracao)
    return geracao


def executar(geracao_id: int):
    with SessionLocal() as db, httpx.Client(headers={"User-Agent": "Replique/1.0 (+Monvatti)"}, timeout=30) as http:
        g = db.get(GeracaoFotos, geracao_id)
        anuncio = db.get(Anuncio, g.anuncio_id)
        pedido, resultado = g.pedido, []

        def guardar(tipo: str, img: Image.Image | None, aviso: str = ""):
            item = {"tipo": tipo, "nome": TIPOS[tipo], "url": _salvar(img, anuncio.empresa_id) if img else "", "aviso": aviso}
            resultado.append(item)
            g.resultado = sorted(resultado, key=lambda r: list(TIPOS).index(r["tipo"]))
            db.commit()  # a tela já mostra o que ficou pronto

        try:
            try:
                base = imagens.abrir(imagens.ler_bytes(pedido["foto"], anuncio.empresa_id, http))
            except (FotoInvalida, OSError) as e:
                raise ErroGeracao(f"Não consegui abrir a foto base: {e}") from e
            branco, aviso = None, ""
            try:
                branco, aviso = fundo_branco(http, base)
            except Exception as e:
                log.warning("Fundo branco falhou: %s", e)
                aviso = str(e)
            if "branco" in pedido["tipos"]:
                guardar("branco", branco, aviso)
            referencia = branco or base
            if "caracteristicas" in pedido["tipos"]:
                destaques = ia.destaques_produto(anuncio)
                if len(destaques) < 2:
                    guardar("caracteristicas", None, "Preencha as características do anúncio (ex.: Material, Capacidade, "
                                                     "Voltagem) para montar o infográfico.")
                else:
                    guardar("caracteristicas", caracteristicas(referencia, destaques))
            com_ia = [t for t in ("contexto", "demonstrativa") if t in pedido["tipos"]]
            if com_ia:
                prompts = {"contexto": _prompt_contexto(anuncio, pedido["cenario"]),
                           "demonstrativa": _prompt_demonstrativa(anuncio, pedido["demonstracao"])}

                def fazer(tipo):
                    try:
                        return tipo, enquadrar(gerar_com_ia(http, referencia, prompts[tipo]), ocupacao=1.0), ""
                    except Exception as e:
                        log.warning("Foto %s falhou: %s", tipo, e)
                        return tipo, None, str(e)

                with ThreadPoolExecutor(max_workers=2) as pool:
                    for tipo, img, aviso_ia in pool.map(fazer, com_ia):
                        guardar(tipo, img, aviso_ia)
            g.status = "concluido" if any(r["url"] for r in resultado) else "erro"
            if g.status == "erro":
                g.erro = next((r["aviso"] for r in resultado if r["aviso"]), "Nenhuma foto foi gerada.")
            usuario = db.get(Usuario, g.usuario_id) if g.usuario_id else None
            feitas = ", ".join(r["nome"].lower() for r in resultado if r["url"]) or "nenhuma"
            registrar(db, anuncio.empresa_id, "edicao", f"Gerou fotos para “{anuncio.titulo or 'sem título'}”: {feitas}",
                      cliente_id=anuncio.cliente_id, usuario=usuario, anuncio_id=anuncio.id, provedor=provedor() or "local")
        except ErroGeracao as e:
            g.status, g.erro = "erro", str(e)
        except Exception as e:
            log.exception("Gerador de fotos falhou (%s)", geracao_id)
            g.status, g.erro = "erro", f"Erro inesperado: {e}"
        db.commit()


def situacao(g: GeracaoFotos) -> dict:
    criada = g.criada_em if g.criada_em.tzinfo else g.criada_em.replace(tzinfo=timezone.utc)
    if g.status == "gerando" and criada < datetime.now(timezone.utc) - timedelta(minutes=15):
        g.status, g.erro = "erro", "A geração foi interrompida (o servidor reiniciou?). Tente de novo."
    return {"id": g.id, "status": g.status, "resultado": g.resultado or [], "erro": g.erro,
            "tipos": g.pedido.get("tipos", []), "provedor": provedor() or "local"}
