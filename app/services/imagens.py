"""Leitura de fotos e "impressão digital" de imagem.

A impressão digital (dHash, 64 bits) resume a foto em tons de cinza. Duas
fotos iguais, mesmo recortadas de leve, reescaladas ou recomprimidas, têm
impressões quase iguais (poucos bits diferentes). É assim que o Replique
percebe que a foto do rascunho ainda é a do concorrente.
"""

from __future__ import annotations

from io import BytesIO

import httpx
from PIL import Image, ImageOps

from app.services.fotos import FotoInvalida, arquivo_local, baixar_externa

LIMITE_MESMA_FOTO = 10


def ler_bytes(url: str, empresa_id: int, http: httpx.Client) -> bytes:
    """Foto enviada ao Replique (sempre da própria empresa) ou da internet pública."""
    if url.startswith("/uploads/"):
        return arquivo_local(url, empresa_id).read_bytes()
    if not url.startswith("http"):
        raise FotoInvalida("Foto de demonstração.")
    return baixar_externa(http, url)[0]


def abrir(conteudo: bytes) -> Image.Image:
    img = Image.open(BytesIO(conteudo))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        fundo = Image.new("RGB", img.size, "white")
        fundo.paste(img, mask=img.split()[-1])
        return fundo
    return img.convert("RGB")


def impressao(conteudo: bytes) -> str:
    img = abrir(conteudo).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    px = img.tobytes()
    bits = 0
    for linha in range(8):
        for col in range(8):
            bits = (bits << 1) | (px[linha * 9 + col] > px[linha * 9 + col + 1])
    return f"{bits:016x}"


def distancia(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def mesma_foto(a: str, b: str) -> bool:
    return distancia(a, b) <= LIMITE_MESMA_FOTO
