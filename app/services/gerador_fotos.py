"""Gerador de fotos do anúncio a partir de UMA foto do produto.

Cinco fotos, nesta ordem no anúncio:
1. branco          — o produto sozinho em fundo branco puro (capa: é o que ML, Shopee e Amazon pedem);
2. caracteristicas — infográfico com 3 a 5 destaques ao lado do produto em fundo branco;
3. ficha           — foto de detalhe feita pela IA com a ficha técnica (material, medidas, peso…) embaixo;
4. contexto        — o produto no ambiente onde é usado ou exibido (IA);
5. explicativa     — o produto em uso (IA) com uma chamada e os destaques escritos por cima.

A IA de imagem (OpenAI ou Gemini, configurável no .env) recebe a foto real
como referência e a ordem de manter o produto idêntico: formato, cor, peças,
textos e logos. Ela cria só o cenário em volta. Todo texto que aparece nas
fotos é desenhado aqui, nunca pela IA, para sair sem erro de português. Sem
chave de IA, o fundo branco é feito aqui mesmo quando a foto já tem fundo
liso, e as duas fotos de características usam a foto de fundo branco.

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
    "caracteristicas": "Características: destaques",
    "ficha": "Características: ficha técnica",
    "contexto": "Produto em contexto",
    "explicativa": "Contexto explicativo",
}
COM_IA = ("branco", "ficha", "contexto", "explicativa")
_APELIDOS = {"demonstrativa": "explicativa", "detalhes": "ficha"}
LADO = 1200
AZUL = (11, 80, 245)
AZUL_CLARO = (232, 239, 255)
TINTA = (11, 15, 26)
CINZA = (95, 107, 133)
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


def _prompt_explicativa(anuncio: Anuncio, acao: str) -> str:
    como = acao.strip() or "a person using the product the way it is meant to be used, making its function and size obvious"
    return (f"Photorealistic photo demonstrating a product in use, for an e-commerce listing. The product is: "
            f"{anuncio.titulo}. " + _FIEL + f"Show {como}. Hands or part of a person are fine; faces cropped or out of "
            "focus. Keep the top 18% and the bottom 25% of the frame calm and uncluttered (text will be placed there "
            "later); the product sits in the middle, fully visible and in focus. Square format. " + _SEM_TEXTO)


def _prompt_ficha(anuncio: Anuncio) -> str:
    return (f"Premium close-up product photo for an e-commerce listing. The product is: {anuncio.titulo}. " + _FIEL +
            "Show it from a flattering three-quarter angle, close enough to reveal the material, finish and construction "
            "details, on a clean seamless light grey-to-white studio background with soft lighting and a gentle shadow. "
            "Wide landscape composition with the product centered. " + _SEM_TEXTO)


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
            dados.pop("input_fidelity")
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
            corpo["generationConfig"].pop("imageConfig")
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
    return ImageFont.load_default(size=tamanho)


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


def cobrir(img: Image.Image, largura: int, altura: int) -> Image.Image:
    """Preenche o quadro todo, cortando o que sobrar (foto de cena)."""
    escala = max(largura / img.width, altura / img.height)
    img = img.resize((max(1, round(img.width * escala)), max(1, round(img.height * escala))), Image.Resampling.LANCZOS)
    x, y = (img.width - largura) // 2, (img.height - altura) // 2
    return img.crop((x, y, x + largura, y + altura))


def _numero(v: float) -> str:
    return f"{v:g}".replace(".", ",")


def dados_ficha(anuncio: Anuncio) -> list[tuple[str, str]]:
    """Linhas da ficha técnica: marca, modelo, características, medidas e peso."""
    linhas = []
    if anuncio.marca:
        linhas.append(("Marca", anuncio.marca))
    if anuncio.modelo:
        linhas.append(("Modelo", anuncio.modelo))
    for nome, valor in (anuncio.atributos or {}).items():
        nome, valor = str(nome).strip(), str(valor or "").strip()
        if nome and valor and nome.lower() not in ("marca", "modelo") and len(valor) <= 40:
            linhas.append((nome, valor))
    d = anuncio.dimensoes_cm or {}
    medidas = [d.get(k) for k in ("comprimento", "largura", "altura")]
    if all(medidas):
        linhas.append(("Medidas", " x ".join(_numero(float(m)) for m in medidas) + " cm"))
    if anuncio.peso_kg:
        peso = anuncio.peso_kg
        linhas.append(("Peso", f"{_numero(round(peso * 1000))} g" if peso < 1 else f"{_numero(peso)} kg"))
    return linhas[:6]


def _cortar(draw: ImageDraw.ImageDraw, texto: str, fonte, largura: int) -> str:
    if draw.textlength(texto, font=fonte) <= largura:
        return texto
    while texto and draw.textlength(texto + "…", font=fonte) > largura:
        texto = texto[:-1]
    return texto.rstrip() + "…"


def ficha_tecnica(foto: Image.Image, linhas: list[tuple[str, str]], cena: bool) -> Image.Image:
    """Foto de detalhe em cima e a ficha técnica em tabela embaixo."""
    tela = Image.new("RGB", (LADO, LADO), "white")
    draw = ImageDraw.Draw(tela)
    altura_foto = 640 if len(linhas) > 4 else 700
    topo = cobrir(foto, LADO, altura_foto) if cena else enquadrar(foto, LADO, altura_foto, ocupacao=0.88)
    tela.paste(topo, (0, 0))
    titulo = _fonte(40)
    y = altura_foto + 34
    draw.rectangle((60, y + 6, 68, y + 44), fill=AZUL)
    draw.text((88, y), "Ficha técnica", font=titulo, fill=TINTA)
    y += 76
    rotulo, valor = _fonte(32), _fonte(34)
    altura_linha = min(74, (LADO - 40 - y) // max(1, len(linhas)))
    for i, (nome, conteudo) in enumerate(linhas):
        if i % 2 == 0:
            draw.rounded_rectangle((60, y, LADO - 60, y + altura_linha - 6), radius=12, fill=AZUL_CLARO)
        meio = y + (altura_linha - 6) // 2
        draw.text((88, meio), _cortar(draw, nome, rotulo, 360), font=rotulo, fill=CINZA, anchor="lm")
        draw.text((470, meio), _cortar(draw, conteudo, valor, LADO - 470 - 88), font=valor, fill=TINTA, anchor="lm")
        y += altura_linha
    draw.rectangle((0, LADO - 14, LADO, LADO), fill=AZUL)
    return tela


def explicativa(cena: Image.Image, chamada: str, destaques: list[str]) -> Image.Image:
    """Foto de uso com a chamada no alto e até 3 destaques numa faixa embaixo."""
    tela = cobrir(cena, LADO, LADO).convert("RGBA")
    camada = Image.new("RGBA", tela.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(camada)
    if chamada:
        fonte = _fonte(46)
        linhas = _quebrar(draw, chamada, fonte, 900)[:2]
        largura = max(draw.textlength(linha, font=fonte) for linha in linhas)
        altura = len(linhas) * 58 + 44
        draw.rounded_rectangle((56, 56, 56 + largura + 84, 56 + altura), radius=22, fill=(255, 255, 255, 240))
        draw.rounded_rectangle((56, 56, 70, 56 + altura), radius=7, fill=AZUL + (255,))
        for i, linha in enumerate(linhas):
            draw.text((98, 78 + i * 58), linha, font=fonte, fill=TINTA + (255,))
    destaques = [d for d in destaques if d][:3]
    if destaques:
        faixa = Image.new("RGBA", (LADO, 380), (6, 8, 15, 0))
        faixa.putalpha(Image.linear_gradient("L").resize((LADO, 380)).point(lambda v: int(v * 0.86)))
        fundo = Image.new("RGBA", tela.size, (0, 0, 0, 0))
        fundo.paste(faixa, (0, LADO - 380))
        tela = Image.alpha_composite(tela, fundo)
        fonte = _fonte(34)
        coluna = (LADO - 80) // len(destaques)
        for i, d in enumerate(destaques):
            x = 40 + i * coluna + 20
            linhas = _quebrar(draw, d, fonte, coluna - 90)[:2]
            y = LADO - 172
            draw.ellipse((x, y - 2, x + 44, y + 42), fill=AZUL + (255,))
            draw.line([(x + 12, y + 20), (x + 19, y + 28), (x + 32, y + 12)], fill="white", width=5, joint="curve")
            for j, linha in enumerate(linhas):
                draw.text((x + 60, y - 2 + j * 44), linha, font=fonte, fill=(255, 255, 255, 255))
    return Image.alpha_composite(tela, camada).convert("RGB")


def _salvar(img: Image.Image, empresa_id: int) -> str:
    pasta = config.UPLOADS_DIR / str(empresa_id)
    pasta.mkdir(exist_ok=True)
    nome = secrets.token_hex(10) + ".jpg"
    img.convert("RGB").resize((LADO, LADO), Image.Resampling.LANCZOS).save(pasta / nome, "JPEG", quality=90, optimize=True)
    return f"/uploads/{empresa_id}/{nome}"


def validar_pedido(pedido: dict) -> dict:
    pedidos = [_APELIDOS.get(t, t) for t in pedido.get("tipos") or []]
    tipos = [t for t in dict.fromkeys(pedidos) if t in TIPOS]
    if not tipos:
        raise ValueError(f"Escolha o que gerar: {', '.join(TIPOS)}.")
    foto = str(pedido.get("foto") or "").strip()
    if not foto:
        raise ValueError("Escolha a foto do produto que servirá de base.")
    if not (foto.startswith("/uploads/") or foto.startswith("http")):
        raise ValueError("Use uma foto real do produto (envie o arquivo ou cole um link), não a de demonstração.")
    return {"foto": foto, "tipos": [t for t in TIPOS if t in tipos],
            "cenario": str(pedido.get("cenario") or "")[:300], "demonstracao": str(pedido.get("demonstracao") or "")[:300],
            "chamada": " ".join(str(pedido.get("chamada") or "").split())[:60]}


def usa_ia(pedido: dict) -> bool:
    return bool(provedor()) and any(t in COM_IA for t in pedido["tipos"])


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
        tipos = [_APELIDOS.get(t, t) for t in pedido["tipos"]]

        def guardar(tipo: str, img: Image.Image | None, aviso: str = ""):
            item = {"tipo": tipo, "nome": TIPOS[tipo], "url": _salvar(img, anuncio.empresa_id) if img else "", "aviso": aviso}
            resultado.append(item)
            g.resultado = sorted(resultado, key=lambda r: list(TIPOS).index(r["tipo"]))
            db.commit()

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
            if "branco" in tipos:
                guardar("branco", branco, aviso)
            referencia = branco or base
            destaques = ia.destaques_produto(anuncio) if {"caracteristicas", "explicativa"} & set(tipos) else []
            if "caracteristicas" in tipos:
                if len(destaques) < 2:
                    guardar("caracteristicas", None, "Preencha as características do anúncio (ex.: Material, Capacidade, "
                                                     "Voltagem) para montar o infográfico.")
                else:
                    guardar("caracteristicas", caracteristicas(referencia, destaques))
            linhas_ficha = dados_ficha(anuncio)
            pendentes = [t for t in ("ficha", "contexto", "explicativa") if t in tipos]
            if "ficha" in pendentes and len(linhas_ficha) < 2:
                pendentes.remove("ficha")
                guardar("ficha", None, "Preencha marca, modelo, características, medidas ou peso do anúncio para montar a ficha técnica.")
            chamada = pedido.get("chamada") or (destaques[0] if destaques else "")
            chips = destaques[:3] if pedido.get("chamada") else destaques[1:4]
            prompts = {"ficha": _prompt_ficha(anuncio), "contexto": _prompt_contexto(anuncio, pedido["cenario"]),
                       "explicativa": _prompt_explicativa(anuncio, pedido["demonstracao"])}

            def fazer(tipo):
                try:
                    if tipo == "ficha" and not provedor():
                        return tipo, ficha_tecnica(referencia, linhas_ficha, cena=False), ""
                    cena = gerar_com_ia(http, referencia, prompts[tipo])
                    if tipo == "ficha":
                        return tipo, ficha_tecnica(cena, linhas_ficha, cena=True), ""
                    if tipo == "explicativa":
                        return tipo, explicativa(cena, chamada, chips), ""
                    return tipo, enquadrar(cena, ocupacao=1.0), ""
                except Exception as e:
                    log.warning("Foto %s falhou: %s", tipo, e)
                    return tipo, None, str(e)

            if pendentes:
                with ThreadPoolExecutor(max_workers=3) as pool:
                    for tipo, img, aviso_ia in pool.map(fazer, pendentes):
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
            "tipos": [_APELIDOS.get(t, t) for t in g.pedido.get("tipos", [])], "provedor": provedor() or "local"}
