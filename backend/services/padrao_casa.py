"""Padrão da casa: o guia de estilo que a IA segue nos títulos, nas descrições
e nas fotos.

Existe um padrão da agência e, opcionalmente, um por cliente. O do cliente só
substitui o que estiver preenchido nele; o resto vem da agência. Palavras
proibidas e obrigatórias se somam.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.marketplaces.base import PLATAFORMAS
from backend.banco.models import PadraoCasa, Usuario

LIMITE_TEXTO = 3000
MAX_PALAVRAS = 60

VAZIO = {"titulo_formula": {p: "" for p in PLATAFORMAS}, "modelo_descricao": "", "tom_voz": "",
         "palavras_proibidas": [], "palavras_obrigatorias": [],
         "fotos": {"fundo": "", "cenario": "", "selos": "", "destaques": ""}}


def _palavras(lista) -> list[str]:
    if isinstance(lista, str):
        lista = lista.replace("\n", ",").split(",")
    saida = []
    for p in lista or []:
        p = " ".join(str(p).split())[:60]
        if p and p.lower() not in {x.lower() for x in saida}:
            saida.append(p)
    return saida[:MAX_PALAVRAS]


def normalizar(dados: dict) -> dict:
    formula = dados.get("titulo_formula") or {}
    fotos = dados.get("fotos") or {}
    return {"titulo_formula": {p: str(formula.get(p) or "").strip()[:300] for p in PLATAFORMAS},
            "modelo_descricao": str(dados.get("modelo_descricao") or "").strip()[:LIMITE_TEXTO],
            "tom_voz": str(dados.get("tom_voz") or "").strip()[:500],
            "palavras_proibidas": _palavras(dados.get("palavras_proibidas")),
            "palavras_obrigatorias": _palavras(dados.get("palavras_obrigatorias")),
            "fotos": {k: str(fotos.get(k) or "").strip()[:300] for k in VAZIO["fotos"]}}


def _registro(db: Session, empresa_id: int, cliente_id: int | None) -> PadraoCasa | None:
    q = db.query(PadraoCasa).filter(PadraoCasa.empresa_id == empresa_id)
    q = q.filter(PadraoCasa.cliente_id == cliente_id) if cliente_id else q.filter(PadraoCasa.cliente_id.is_(None))
    return q.first()


def ler(db: Session, empresa_id: int, cliente_id: int | None = None) -> dict:
    r = _registro(db, empresa_id, cliente_id)
    return normalizar(r.dados if r else {})


def salvar(db: Session, usuario: Usuario, dados: dict, cliente_id: int | None = None) -> dict:
    r = _registro(db, usuario.empresa_id, cliente_id)
    if not r:
        r = PadraoCasa(empresa_id=usuario.empresa_id, cliente_id=cliente_id)
        db.add(r)
    r.dados = normalizar(dados)
    r.atualizado_por_id = usuario.id
    db.commit()
    return r.dados


def efetivo(db: Session, empresa_id: int, cliente_id: int | None) -> dict:
    """Padrão que vale para o cliente: o dele por cima do da agência."""
    agencia = ler(db, empresa_id)
    if not cliente_id:
        return agencia
    cliente = ler(db, empresa_id, cliente_id)
    saida = {"titulo_formula": {p: cliente["titulo_formula"][p] or agencia["titulo_formula"][p] for p in PLATAFORMAS},
             "modelo_descricao": cliente["modelo_descricao"] or agencia["modelo_descricao"],
             "tom_voz": cliente["tom_voz"] or agencia["tom_voz"],
             "palavras_proibidas": _palavras(agencia["palavras_proibidas"] + cliente["palavras_proibidas"]),
             "palavras_obrigatorias": _palavras(agencia["palavras_obrigatorias"] + cliente["palavras_obrigatorias"]),
             "fotos": {k: cliente["fotos"][k] or agencia["fotos"][k] for k in VAZIO["fotos"]}}
    return saida


def tem_conteudo(p: dict) -> bool:
    return any([any(p["titulo_formula"].values()), p["modelo_descricao"], p["tom_voz"], p["palavras_proibidas"],
                p["palavras_obrigatorias"], any(p["fotos"].values())])


def instrucoes_texto(p: dict, plataformas: list[str]) -> str:
    """Trecho do pedido à IA de texto com o guia da casa."""
    partes = []
    formulas = [f"- {PLATAFORMAS[k]}: {p['titulo_formula'][k]}" for k in plataformas if p["titulo_formula"].get(k)]
    if formulas:
        partes.append("Fórmula de título da casa (siga a ordem dos elementos):\n" + "\n".join(formulas))
    if p["modelo_descricao"]:
        partes.append("Modelo de descrição da casa (siga a estrutura, preenchendo só com dados reais do produto):\n"
                      + p["modelo_descricao"])
    if p["tom_voz"]:
        partes.append(f"Tom de voz: {p['tom_voz']}")
    if p["palavras_proibidas"]:
        partes.append("Nunca use estas palavras: " + ", ".join(p["palavras_proibidas"]))
    if p["palavras_obrigatorias"]:
        partes.append("Inclua, quando fizer sentido para o produto, estas palavras: " + ", ".join(p["palavras_obrigatorias"]))
    return "\n\n".join(partes)


def tirar_proibidas(texto: str, p: dict) -> str:
    """Usado também sem IA: remove as palavras proibidas da casa."""
    import re
    for palavra in p["palavras_proibidas"]:
        texto = re.sub(rf"(?i)(?<!\w){re.escape(palavra)}(?!\w)", "", texto)
    return re.sub(r"[ \t]{2,}", " ", texto).strip()
