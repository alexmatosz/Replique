"""Entende o que o usuário digitou na pesquisa, como a busca do Mercado Livre.

"bomba 1/2 syllent" → produto "bomba", 1/2 CV, marca Syllent.
"registro 3/4" → produto "registro", 3/4 de polegada.
As regras separam o produto, a marca (inclusive escrita errada, comparando com
as marcas que o ML conhece), a voltagem e qualquer medida com número: potência
(CV, HP, W), polegadas, mm/cm/m, litros/ml, kg/g, mAh/Ah, rpm, bar/psi.
Fração sem unidade vira CV em produto com motor e polegada nos demais.
Com a chave da Anthropic, a IA também interpreta; sem ela, ficam só as regras.
"""

import difflib
import json
import logging
import re
import unicodedata

log = logging.getLogger(__name__)

WATTS_POR_CV = 735.5

_MOTORIZADOS = {"bomba", "motobomba", "motor", "compressor", "pressurizador", "pressurizadora",
                "eletrobomba", "bombinha", "motoredutor", "soprador", "exaustor", "motoserra", "motosserra",
                "rocadeira", "lavadora", "gerador"}

_CONECTIVOS = {"de", "da", "do", "das", "dos", "para", "p", "com", "e", "a", "o", "em", "d"}

UNIDADES = {
    "cv": ("potencia", WATTS_POR_CV, "CV"), "hp": ("potencia", 745.7, "HP"),
    "w": ("potencia", 1.0, "W"), "kw": ("potencia", 1000.0, "kW"),
    "pol": ("polegada", 1.0, "pol"),
    "mm": ("comprimento", 1.0, "mm"), "cm": ("comprimento", 10.0, "cm"), "m": ("comprimento", 1000.0, "m"),
    "ml": ("volume", 1.0, "ml"), "l": ("volume", 1000.0, "L"),
    "g": ("peso", 1.0, "g"), "kg": ("peso", 1000.0, "kg"),
    "mah": ("bateria", 1.0, "mAh"), "ah": ("bateria", 1000.0, "Ah"),
    "rpm": ("rotacao", 1.0, "rpm"),
    "bar": ("pressao", 1.0, "bar"), "psi": ("pressao", 0.0689476, "psi"),
}

FAMILIAS = {"potencia": "Potência", "polegada": "Medida", "comprimento": "Medida", "volume": "Capacidade",
            "peso": "Peso", "bateria": "Bateria", "rotacao": "Rotação", "pressao": "Pressão"}

_SINONIMOS = {"cavalo": "cv", "cavalos": "cv", "watt": "w", "watts": "w", "polegada": "pol", "polegadas": "pol",
              "metro": "m", "metros": "m", "mt": "m", "mts": "m", "litro": "l", "litros": "l", "lt": "l", "lts": "l",
              "quilo": "kg", "quilos": "kg", "kgs": "kg", "gramas": "g", "grama": "g", "gr": "g"}

_TOLERANCIA = {"potencia": 0.12}

_FRACAO = r"\d+/\d+"
_NUMERO = rf"(?:(?<![\d-])\d\s+{_FRACAO}|{_FRACAO}|\d+(?:[.,]\d+)?)"
_NOMES_UNIDADE = sorted(set(UNIDADES) | set(_SINONIMOS), key=len, reverse=True)
_RE_MEDIDA = re.compile(rf"(?<![a-z0-9/.,])({_NUMERO})\s*({'|'.join(_NOMES_UNIDADE)})?(?![a-z0-9/])")

_POR_EXTENSO = [
    (r"\bum\s+cavalo\s+e\s+meio\b", "1 1/2"),
    (r"\bmeio\s+cavalo\b", "1/2"),
    (r"\b(?:um|1)\s+cavalo\b", "1"),
    (r"\bdois\s+cavalos\b", "2"),
    (r"\btres\s+quartos\s+de\s+cavalo\b", "3/4"),
]


def normalizar(texto) -> str:
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9/.,]+", " ", t)).strip()


def _valor(numero: str) -> float | None:
    numero = numero.strip().replace(",", ".")
    try:
        if " " in numero:
            inteiro, fracao = numero.split(None, 1)
            a, b = fracao.split("/")
            return int(inteiro) + int(a) / int(b)
        if "/" in numero:
            a, b = numero.split("/")
            return int(a) / int(b) if int(b) else None
        return float(numero)
    except ValueError:
        return None


def _medida(texto_numero: str, unidade: str, inferida: bool = False) -> dict | None:
    valor = _valor(texto_numero)
    if not valor or unidade not in UNIDADES:
        return None
    familia, fator, simbolo = UNIDADES[unidade]
    texto_numero = re.sub(r"\s+", " ", texto_numero.strip())
    rotulo = f'{texto_numero}"' if unidade == "pol" else f"{texto_numero} {simbolo}"
    return {"valor": valor, "unidade": unidade, "familia": familia, "base": valor * fator,
            "texto": texto_numero, "rotulo": rotulo, "nome": FAMILIAS[familia], "inferida": inferida}


def _medidas(texto: str, motorizado: bool) -> tuple[list[dict], str]:
    """(medidas, texto sem elas). Número sem unidade e sem fração (ex.: "gsr
    120") fica no texto: costuma ser modelo."""
    medidas = []
    for padrao, numero in _POR_EXTENSO:
        m = re.search(padrao, texto)
        if m:
            medidas.append(_medida(numero, "cv"))
            texto = texto[:m.start()] + " " + texto[m.end():]
    restos, fim = [], 0
    for m in _RE_MEDIDA.finditer(texto):
        numero, unidade = m.group(1), m.group(2)
        unidade = _SINONIMOS.get(unidade, unidade)
        if not unidade:
            if "/" not in numero:
                continue
            medida = _medida(numero, "cv" if motorizado else "pol", inferida=True)
        else:
            medida = _medida(numero, unidade)
        if medida:
            medidas.append(medida)
            restos.append(texto[fim:m.start()])
            fim = m.end()
    restos.append(texto[fim:])
    return [m for m in medidas if m], " ".join(restos)


def _voltagem(texto: str) -> tuple[str, str]:
    m = re.search(r"\bbivolt\b", texto)
    if m:
        return "Bivolt", texto[:m.start()] + texto[m.end():]
    m = re.search(r"(?<![\d.,/])(\d{1,3})\s*(?:v|volts?)\b", texto) or re.search(r"\b(127|220)\b", texto)
    if m:
        return f"{m.group(1)}V", texto[:m.start()] + texto[m.end():]
    return "", texto


def achar_marca(texto: str, marcas: list[str]) -> str:
    """Marca escrita no termo, exata ou com erro de digitação ("sylent" → Syllent)."""
    palavras = normalizar(texto).split()
    candidatas = {}
    for marca in marcas:
        n = normalizar(marca)
        if n and n not in candidatas and len(n) >= 3:
            candidatas[n] = marca
    for n, marca in candidatas.items():
        if f" {n} " in f" {' '.join(palavras)} ":
            return marca
    melhor, nota = "", 0.0
    for n, marca in candidatas.items():
        tamanho = len(n.split())
        for i in range(len(palavras) - tamanho + 1):
            trecho = " ".join(palavras[i:i + tamanho])
            if len(trecho) < 4 or trecho in _MOTORIZADOS:
                continue
            r = difflib.SequenceMatcher(None, trecho, n).ratio()
            if r >= 0.8 and r > nota:
                melhor, nota = marca, r
    return melhor


def interpretar(termo: str, marcas: list[str] | None = None, usar_ia: bool = True) -> dict:
    """{original, produto, nucleo, marca, medidas, voltagem, termo_busca, fonte}."""
    original = (termo or "").strip()
    texto = normalizar(original)
    marca = achar_marca(texto, marcas or [])
    sem_marca = texto
    if marca:
        n = normalizar(marca)
        sem_marca = re.sub(rf"\b{re.escape(n)}\b", " ", texto) if f" {n} " in f" {texto} " else " ".join(
            p for p in texto.split() if difflib.SequenceMatcher(None, p, n).ratio() < 0.8)
    primeira = next((p for p in sem_marca.split() if not re.fullmatch(r"[\d/.,]+", p)), "")
    voltagem, resto = _voltagem(sem_marca)
    medidas, resto = _medidas(resto, primeira in _MOTORIZADOS)
    produto = " ".join(p for p in resto.split() if p not in _CONECTIVOS)
    interp = {"original": original, "produto": produto, "nucleo": primeira, "marca": marca,
              "medidas": medidas, "voltagem": voltagem, "fonte": "regras"}
    if usar_ia:
        _com_ia(interp, marcas or [])
    interp["termo_busca"] = montar_termo(interp)
    return interp


def aplicar_marca(interp: dict, marca: str):
    """Marca achada depois (nas marcas dos resultados): sai do nome do produto."""
    n = normalizar(marca)
    interp["marca"] = marca
    interp["produto"] = " ".join(p for p in interp["produto"].split()
                                 if p != n and difflib.SequenceMatcher(None, p, n).ratio() < 0.8)
    interp["termo_busca"] = montar_termo(interp)


def montar_termo(interp: dict) -> str:
    partes = [interp.get("produto") or interp.get("nucleo") or ""]
    for m in interp.get("medidas") or []:
        partes.append(m["texto"] if m["unidade"] == "pol" else f"{m['texto']} {m['unidade']}")
    if interp.get("marca"):
        partes.append(interp["marca"])
    if interp.get("voltagem"):
        partes.append(interp["voltagem"].lower())
    termo = " ".join(p for p in partes if p).strip()
    return termo or interp.get("original", "")


_SISTEMA_IA = """Você interpreta o que um vendedor digitou para pesquisar um produto no Mercado Livre Brasil, como a própria busca do ML faria.
- "produto": o tipo do produto em poucas palavras, sem marca e sem medidas (ex.: "bomba d'água", "registro de gaveta", "parafusadeira").
- "marca": a marca, com a grafia correta, se houver (ex.: "syllent" → "Syllent"). Vazio se não houver.
- "medidas": cada número do termo que é uma medida, com o número como foi escrito ("1/2", "1 1/2", "0,5", "650") e a unidade certa para aquele produto:
  cv, hp, w, kw (potência), pol (polegada), mm, cm, m, ml, l, g, kg, mah, ah, rpm, bar, psi.
  Ex.: "1/2" numa bomba ou motor é cv; "1/2" num registro, cano, conexão, broca ou mangueira é pol; "meio cavalo" é 1/2 cv.
  Número que é modelo (ex.: "GSR 120") não é medida.
- "voltagem": "127V", "220V", "12V", "Bivolt" ou vazio.
Não invente nada que o termo não diga."""

_SCHEMA_IA = {
    "type": "object",
    "properties": {
        "produto": {"type": "string"}, "marca": {"type": "string"}, "voltagem": {"type": "string"},
        "medidas": {"type": "array", "items": {
            "type": "object",
            "properties": {"numero": {"type": "string"}, "unidade": {"type": "string", "enum": sorted(UNIDADES)}},
            "required": ["numero", "unidade"], "additionalProperties": False}},
    },
    "required": ["produto", "marca", "medidas", "voltagem"],
    "additionalProperties": False,
}


def _com_ia(interp: dict, marcas: list[str]):
    from backend.services import ia
    if not ia.disponivel():
        return
    try:
        saida = ia._claude_json(_SISTEMA_IA, _SCHEMA_IA, json.dumps({"termo": interp["original"]}, ensure_ascii=False), 600)
    except Exception as e:
        log.warning("IA indisponível para interpretar a busca: %s", e)
        return
    if saida.get("produto"):
        interp["produto"] = " ".join(p for p in normalizar(saida["produto"]).split() if p != "d")
        interp["nucleo"] = interp["produto"].split()[0]
    if saida.get("marca"):
        interp["marca"] = achar_marca(saida["marca"], marcas) or saida["marca"].strip()
    for item in saida.get("medidas") or []:
        nova = _medida(normalizar(item.get("numero")), item.get("unidade", ""))
        if not nova:
            continue
        igual = next((m for m in interp["medidas"] if abs(m["valor"] - nova["valor"]) < 1e-6), None)
        if igual is None:
            interp["medidas"].append(nova)
        elif igual["inferida"]:
            interp["medidas"][interp["medidas"].index(igual)] = nova
    if saida.get("voltagem") and not interp.get("voltagem"):
        interp["voltagem"] = saida["voltagem"].strip()
    interp["fonte"] = "ia"


def medida_no_produto(medida: dict, titulo: str, atributos: list[str] | None = None) -> bool:
    """O produto tem essa medida? Procura no título e nos valores da ficha,
    convertendo unidades da mesma família (1/2 CV = 368 W, 1 L = 1000 ml).
    Fração sem unidade no título ("Registro 1/2") vale para CV e polegada."""
    texto = normalizar(" ".join([titulo, *(atributos or [])]))
    if medida["familia"] == "potencia" and "meio cavalo" in texto and abs(medida["base"] - WATTS_POR_CV / 2) < 1:
        return True
    tolerancia = _TOLERANCIA.get(medida["familia"], 0.02)
    for m in _RE_MEDIDA.finditer(texto):
        numero, unidade = m.group(1), _SINONIMOS.get(m.group(2), m.group(2))
        valor = _valor(numero)
        if not valor:
            continue
        if not unidade:
            if "/" in numero and medida["familia"] in ("potencia", "polegada") and abs(valor - medida["valor"]) < 0.01:
                return True
            continue
        familia, fator, _ = UNIDADES[unidade]
        if familia == medida["familia"] and abs(valor * fator - medida["base"]) <= medida["base"] * tolerancia:
            return True
    return False


def voltagem_no_produto(interp: dict, titulo: str, atributos: list[str] | None = None) -> bool:
    alvo = normalizar(interp.get("voltagem") or "")
    if not alvo:
        return True
    texto = normalizar(" ".join([titulo, *(atributos or [])]))
    if alvo == "bivolt":
        return "bivolt" in texto or ("127" in texto and "220" in texto)
    numero = alvo.rstrip("v")
    if re.search(rf"(?<![\d.,/]){numero}\s*v?\b", texto):
        return True
    if numero in ("110", "127", "220"):
        return "bivolt" in texto or (numero != "220" and re.search(r"(?<![\d.,/])(110|127)\s*v?\b", texto) is not None)
    return False


def tipo_do_produto(interp: dict, titulo: str) -> bool:
    """O título é do produto pedido, e não de uma peça ou acessório dele?
    "Rotor para bomba" e "Kit união ... bomba" não são bomba."""
    nucleo = interp.get("nucleo") or ""
    if not nucleo:
        return True
    palavras = [p for p in normalizar(titulo).split() if not re.fullmatch(r"[\d/.,x]+", p)]
    for i, p in enumerate(palavras[:3]):
        if nucleo in p:
            return not (i > 0 and palavras[i - 1] in ("para", "p", "de", "do", "da"))
    return False
