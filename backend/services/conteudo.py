"""Regras de texto de anúncio (herdadas e validadas no agente_anuncios_ml).

- Tira palavras que os marketplaces proíbem/penalizam no título
  ("novo", "frete grátis", "promoção"...).
- Tira o TUDO EM MAIÚSCULAS, preservando siglas (PS5, USB-C, 4K).
- Corta no limite de caracteres da plataforma sem deixar conectivo solto.
"""

import re

PROIBIDAS_TITULO = {
    "novo", "nova", "novos", "novas", "usado", "usada", "usados", "usadas",
    "frete", "grátis", "gratis", "promoção", "promocao", "oferta", "estoque",
    "lacrado", "lacrada", "barato", "top", "melhor", "envio", "imediato",
    "pronta", "entrega", "desconto", "liquidação", "liquidacao",
}
_MINUSCULAS = {"de", "da", "do", "das", "dos", "com", "sem", "para", "e", "em"}
_SIGLAS = {"usb", "led", "lcd", "hd", "fhd", "uhd", "hdmi", "tv", "pc", "ssd", "hdd", "gb", "tb", "mb",
           "rgb", "nfc", "gps", "abs", "pvc", "mdf"}


def _formatar_palavra(palavra: str, primeira: bool) -> str:
    if "-" in palavra.strip("-"):
        return "-".join(_formatar_palavra(p, False) if p else p for p in palavra.split("-"))
    if palavra.lower() in _MINUSCULAS and not primeira:
        return palavra.lower()
    if palavra.lower() in _SIGLAS:
        return palavra.upper()
    if any(c.isdigit() for c in palavra):
        return palavra.upper() if len(palavra) <= 4 else palavra
    if palavra.isupper() and len(palavra) <= 3:
        return palavra
    if palavra.isupper() or palavra.islower():
        return palavra[:1].upper() + palavra[1:].lower()
    return palavra


def limpar_titulo(titulo: str, limite: int | None = None) -> str:
    palavras = re.sub(r"\s+", " ", titulo or "").strip().split(" ")
    vistas, escolhidas = set(), []
    for palavra in palavras:
        chave = palavra.lower().strip(".,;:-!|")
        if not chave:
            continue
        if chave in PROIBIDAS_TITULO or (chave in vistas and chave not in _MINUSCULAS):
            if escolhidas and escolhidas[-1].lower() in _MINUSCULAS:
                escolhidas.pop()
            continue
        vistas.add(chave)
        escolhidas.append(_formatar_palavra(palavra.strip("!|"), primeira=not escolhidas))
    return cortar_titulo(" ".join(escolhidas), limite)


def cortar_titulo(titulo: str, limite: int | None) -> str:
    titulo = titulo.strip()
    if not limite or len(titulo) <= limite:
        return _sem_conectivo_final(titulo)
    saida = ""
    for palavra in titulo.split():
        candidato = f"{saida} {palavra}".strip()
        if len(candidato) > limite:
            break
        saida = candidato
    return _sem_conectivo_final(saida)


def _sem_conectivo_final(titulo: str) -> str:
    partes = titulo.split()
    while partes and partes[-1].lower() in _MINUSCULAS:
        partes.pop()
    return " ".join(partes)


def palavras_proibidas_no_titulo(titulo: str) -> list[str]:
    return sorted({p.lower().strip(".,;:-!") for p in (titulo or "").split()} & PROIBIDAS_TITULO)


def descricao_padrao(titulo: str, marca: str, modelo: str, atributos: dict, condicao: str) -> str:
    """Descrição estruturada de fallback (sem IA): abertura, características,
    condição e fechamento."""
    linhas = [f"{titulo}{' — ' + marca if marca and marca.lower() not in titulo.lower() else ''}."]
    itens = [f"• {k}: {v}" for k, v in (atributos or {}).items() if v][:12]
    if modelo:
        itens.insert(0, f"• Modelo: {modelo}")
    if itens:
        linhas += ["", "Características:", *itens]
    linhas += ["", "Produto usado, revisado e testado." if condicao == "used" else "Produto novo, na embalagem original."]
    linhas += ["", "Qualquer dúvida, fale com a gente antes de comprar. Envio rápido e suporte ágil."]
    return "\n".join(linhas)


def descricao_texto_puro(texto: str) -> str:
    """Mercado Livre e Shopee só aceitam texto puro na descrição: tira HTML,
    emojis fora do BMP e links."""
    texto = re.sub(r"<br\s*/?>|</p>|</li>", "\n", texto or "", flags=re.I)
    texto = re.sub(r"<li[^>]*>", "• ", texto, flags=re.I)
    texto = re.sub(r"<[^>]+>", "", texto)
    texto = re.sub(r"https?://\S+", "", texto)
    texto = "".join(c for c in texto if ord(c) < 0x10000)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()
