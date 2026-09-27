"""Nota de risco do anúncio antes de publicar (0 = tranquilo, 100 = arriscado).

Junta os sinais que mais levam marketplace a denunciar, pausar ou suspender
conta: foto do concorrente, texto copiado, marca protegida, preço fora da
curva e publicação em rajada. Cada motivo diz quantos pontos soma e o que
fazer. A nota não bloqueia nada: ajuda a decidir.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

import httpx
from sqlalchemy.orm import Session

from app import config
from app.marketplaces.base import PLATAFORMAS
from app.models import Anuncio
from app.services import imagens
from app.services.conteudo import palavras_proibidas_no_titulo

log = logging.getLogger(__name__)

MAX_ORIGINAIS = 6
MAX_ATUAIS = 12


def _normalizar(texto: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (texto or "").lower())).strip()


def parecido(a: str, b: str) -> float:
    a, b = _normalizar(a), _normalizar(b)
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def marca_protegida(anuncio: Anuncio) -> str:
    marca = (anuncio.marca or "").strip().lower()
    if marca in config.MARCAS_PROTEGIDAS:
        return anuncio.marca
    titulo = f" {_normalizar(anuncio.titulo)} "
    return next((m for m in sorted(config.MARCAS_PROTEGIDAS) if f" {_normalizar(m)} " in titulo), "")


def _impressoes(anuncio: Anuncio, urls: list[str], http: httpx.Client) -> dict[str, str]:
    """Impressão de cada foto, com cache no próprio rascunho (baixa uma vez só)."""
    cache = dict((anuncio.origem or {}).get("impressoes") or {})
    faltando = [u for u in dict.fromkeys(urls) if u and u not in cache]

    def calcular(url):
        try:
            return url, imagens.impressao(imagens.ler_bytes(url, anuncio.empresa_id, http))
        except Exception as e:  # foto fora do ar, demonstração etc.: só não entra na comparação
            log.info("Sem impressão de %s: %s", url[:80], e)
            return url, ""

    if faltando:
        with ThreadPoolExecutor(max_workers=6) as pool:
            for url, digital in pool.map(calcular, faltando):
                cache[url] = digital
        anuncio.origem = {**(anuncio.origem or {}), "impressoes": cache}  # reatribui: o JSON é salvo
    return cache


def fotos_do_concorrente(anuncio: Anuncio, http: httpx.Client | None = None) -> tuple[list[int], bool]:
    """(posições das fotos do rascunho iguais às do anúncio copiado, conseguiu comparar?)"""
    originais = [f for f in ((anuncio.origem or {}).get("fotos_originais") or []) if f][:MAX_ORIGINAIS]
    atuais = [f for f in (anuncio.fotos or []) if f][:MAX_ATUAIS]
    if not originais or not atuais:
        return [], False
    iguais_por_link = [i for i, f in enumerate(atuais) if f in originais]
    proprio = http is None
    http = http or httpx.Client(timeout=15, headers={"User-Agent": "Replique/1.0 (+Monvatti)"})
    try:
        cache = _impressoes(anuncio, originais + atuais, http)
    finally:
        if proprio:
            http.close()
    dig_originais = [cache.get(u) for u in originais if cache.get(u)]
    if not dig_originais:
        return iguais_por_link, False
    iguais = set(iguais_por_link)
    for i, url in enumerate(atuais):
        digital = cache.get(url)
        if digital and any(imagens.mesma_foto(digital, o) for o in dig_originais):
            iguais.add(i)
    return sorted(iguais), True


def avaliar(db: Session, anuncio: Anuncio, http: httpx.Client | None = None) -> dict:
    from app.services.lotes import publicadas_24h

    motivos: list[dict] = []

    def somar(pontos: int, texto: str):
        motivos.append({"pontos": pontos, "texto": texto})

    origem = anuncio.origem or {}
    copiado = origem.get("plataforma") not in (None, "manual")

    iguais, comparou = fotos_do_concorrente(anuncio, http) if copiado else ([], False)
    if iguais:
        capa = " (inclusive a capa)" if 0 in iguais else ""
        somar(40 if 0 in iguais else 30, f"{len(iguais)} foto(s) iguais às do anúncio copiado{capa}. Foto de outro "
                                         "vendedor é o motivo nº 1 de denúncia: troque por fotos próprias ou use o gerador de fotos.")
    elif copiado and not comparou and not any(f.startswith("/uploads/") for f in anuncio.fotos or []):
        somar(20, "Não consegui comparar as fotos, e nenhuma foi enviada por vocês: confira se não são as do concorrente.")

    if copiado:
        sim_titulo = parecido(anuncio.titulo, origem.get("titulo_original", ""))
        if sim_titulo >= 0.9:
            somar(20, f"Título {sim_titulo:.0%} igual ao do concorrente. Reescreva (o botão Melhorar com IA ajuda).")
        elif sim_titulo >= 0.75:
            somar(10, f"Título {sim_titulo:.0%} parecido com o do concorrente.")
        sim_desc = parecido(anuncio.descricao[:5000], origem.get("descricao_original", ""))
        if sim_desc >= 0.8:
            somar(15, f"Descrição {sim_desc:.0%} igual à do concorrente: o texto é dele e o marketplace trata como duplicado.")

    if proibidas := palavras_proibidas_no_titulo(anuncio.titulo):
        somar(10, f"Palavras penalizadas no título: {', '.join(proibidas)}.")

    if marca := marca_protegida(anuncio):
        somar(20, f"“{marca}” tem programa de proteção de marca. Publique só se o cliente for revendedor autorizado "
                  "e tiver nota fiscal de compra: anúncio denunciado pela marca pode levar à suspensão.")

    preco_ref = origem.get("preco_original") or 0
    if preco_ref and anuncio.preco and anuncio.preco < preco_ref * 0.7:
        somar(10, f"Preço {1 - anuncio.preco / preco_ref:.0%} abaixo do anúncio de referência. Preço muito abaixo do "
                  "mercado é sinal de falsificação para a moderação.")

    if anuncio.marca and not anuncio.gtin:
        somar(5, "Produto de marca sem EAN/GTIN: o marketplace pode pedir o código ou limitar a exposição.")
    if len(anuncio.descricao or "") < 80:
        somar(5, "Descrição curta: aumenta perguntas, devoluções e reclamações.")

    if anuncio.cliente_id:
        for p in PLATAFORMAS:
            feitas = publicadas_24h(db, anuncio.cliente_id, p)
            if feitas >= config.LIMITE_DIARIO_POR_CONTA * 0.8:
                somar(15, f"A conta de {PLATAFORMAS[p]} já publicou {feitas} anúncios em 24 h (limite de segurança "
                          f"{config.LIMITE_DIARIO_POR_CONTA}). Espalhe as publicações ao longo dos dias.")
            elif feitas >= config.LIMITE_DIARIO_POR_CONTA * 0.5:
                somar(5, f"{feitas} publicações em 24 h na conta de {PLATAFORMAS[p]}: bom momento para ir mais devagar.")

    nota = min(100, sum(m["pontos"] for m in motivos))
    motivos.sort(key=lambda m: -m["pontos"])
    nivel = "alto" if nota >= 60 else "medio" if nota >= 30 else "baixo"
    return {"nota": nota, "nivel": nivel, "motivos": motivos, "comparou_fotos": comparou}
