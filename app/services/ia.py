"""Melhoria de anúncio com IA (Claude) — opcional.

Sem ANTHROPIC_API_KEY, ou se a chamada falhar, usa as regras de texto
locais (services/conteudo.py). A IA nunca trava o fluxo.

A IA reescreve o anúncio copiado para que ele NÃO seja uma cópia literal
do concorrente: título novo com as palavras que o público busca e uma
descrição própria. Isso importa: os marketplaces penalizam conteúdo
duplicado, e o texto do concorrente é dele.
"""

import json
import logging

import anthropic

from app import config
from app.marketplaces.base import LIMITE_TITULO
from app.services.conteudo import cortar_titulo, descricao_padrao, limpar_titulo

log = logging.getLogger(__name__)

_SCHEMA = {
    "type": "object",
    "properties": {
        "titulos": {"type": "array", "items": {"type": "string"},
                    "description": "3 opções de título, da melhor para a pior"},
        "descricao": {"type": "string"},
        "palavras_chave": {"type": "array", "items": {"type": "string"}},
        "observacoes": {"type": "string", "description": "Dicas curtas para o vendedor (em português)"},
    },
    "required": ["titulos", "descricao", "palavras_chave", "observacoes"],
    "additionalProperties": False,
}

_SISTEMA = """Você é especialista em anúncios de marketplaces brasileiros (Mercado Livre, Shopee, Amazon).
Recebe os dados de um anúncio de referência (de um concorrente que vende bem) e escreve um anúncio NOVO e ORIGINAL para o nosso vendedor.

Regras de título:
- Estrutura: Produto + Marca + Modelo + características mais buscadas.
- Respeite o limite de caracteres informado.
- Proibido: "novo", "frete grátis", "promoção", "oferta", "melhor", "top", "original" solto, tudo em maiúsculas, emojis, símbolos.
- Não copie o título de referência palavra por palavra; reordene e use termos de busca reais.

Regras de descrição:
- Texto puro (sem HTML, sem links, sem emojis), em português do Brasil.
- Abertura de 1-2 frases, lista de características com "•", seção "Na caixa" se fizer sentido, e fechamento convidando a perguntar.
- Só afirme o que estiver nos dados. Não invente especificações, certificações ou garantias.
- Não mencione outras lojas, concorrentes ou o anúncio de referência.

Nas observações, aponte em 1-3 frases o que falta para o anúncio ficar competitivo (ex.: fotos próprias, peso, EAN)."""


def disponivel() -> bool:
    return bool(config.ANTHROPIC_API_KEY)


def melhorar_anuncio(anuncio, plataformas: list[str]) -> dict:
    """Retorna {titulo, titulos, descricao, palavras_chave, observacoes, fonte}."""
    limite = min((LIMITE_TITULO.get(p, 60) for p in plataformas or ["mercadolivre"]), default=60)
    if disponivel():
        try:
            return _com_claude(anuncio, limite)
        except Exception as e:  # IA é bônus: qualquer falha cai no modo local
            log.warning("IA indisponível, usando regras locais: %s", e)
    titulo = limpar_titulo(anuncio.titulo, limite)
    return {
        "titulo": titulo, "titulos": [titulo],
        "descricao": descricao_padrao(titulo, anuncio.marca, anuncio.modelo, anuncio.atributos, anuncio.condicao),
        "palavras_chave": [], "fonte": "regras",
        "observacoes": "Configure ANTHROPIC_API_KEY no .env para reescrever com IA.",
    }


def _com_claude(anuncio, limite: int) -> dict:
    cliente = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    dados = {
        "titulo_referencia": anuncio.titulo, "descricao_referencia": (anuncio.descricao or "")[:6000],
        "marca": anuncio.marca, "modelo": anuncio.modelo, "condicao": anuncio.condicao,
        "caracteristicas": anuncio.atributos, "preco": anuncio.preco,
        "limite_caracteres_titulo": limite,
    }
    resposta = cliente.beta.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=_SISTEMA,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": _SCHEMA}},
        messages=[{"role": "user", "content": "Dados do anúncio de referência:\n" + json.dumps(dados, ensure_ascii=False)}],
    )
    if resposta.stop_reason == "refusal":
        raise RuntimeError("a IA recusou o pedido")
    texto = next(b.text for b in resposta.content if b.type == "text")
    saida = json.loads(texto)
    titulos = [cortar_titulo(limpar_titulo(t), limite) for t in saida["titulos"] if t.strip()]
    return {
        "titulo": titulos[0] if titulos else limpar_titulo(anuncio.titulo, limite),
        "titulos": titulos, "descricao": saida["descricao"].strip(),
        "palavras_chave": saida.get("palavras_chave", []), "observacoes": saida.get("observacoes", ""),
        "fonte": "ia",
    }


# ---------------------------------------------------------------- respostas a perguntas
_SISTEMA_PERGUNTA = """Você responde perguntas de compradores no Mercado Livre em nome de uma loja brasileira.
- Português do Brasil, cordial e direto, no máximo 3 frases (até 350 caracteres).
- Use SOMENTE as informações do anúncio fornecidas. Se a resposta não estiver nos dados, diga que vai confirmar e
  não invente medidas, compatibilidades, garantias ou prazos.
- É PROIBIDO: telefone, e-mail, links, redes sociais, WhatsApp, pedir para comprar fora do Mercado Livre,
  mencionar concorrentes. Isso gera punição na conta.
- Comece com "Olá!" e termine convidando a comprar ou a perguntar de novo."""

_SCHEMA_RESPOSTA = {
    "type": "object",
    "properties": {"resposta": {"type": "string"},
                   "confianca": {"type": "string", "enum": ["alta", "media", "baixa"],
                                 "description": "baixa = a informação não estava nos dados do anúncio"}},
    "required": ["resposta", "confianca"],
    "additionalProperties": False,
}


def _claude_json(sistema: str, schema: dict, conteudo: str, max_tokens: int = 4000) -> dict:
    cliente = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    resposta = cliente.beta.messages.create(
        model=config.ANTHROPIC_MODEL, max_tokens=max_tokens,
        betas=["server-side-fallback-2026-07-01"], fallbacks="default", system=sistema,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": conteudo}],
    )
    if resposta.stop_reason == "refusal":
        raise RuntimeError("a IA recusou o pedido")
    return json.loads(next(b.text for b in resposta.content if b.type == "text"))


def responder_pergunta(pergunta: str, dados_anuncio: dict) -> dict:
    """{resposta, confianca, fonte}. Sem IA: resposta-modelo para o operador completar."""
    if disponivel():
        try:
            saida = _claude_json(_SISTEMA_PERGUNTA, _SCHEMA_RESPOSTA, json.dumps(
                {"pergunta": pergunta[:1000], "anuncio": dados_anuncio}, ensure_ascii=False, default=str))
            return {"resposta": saida["resposta"].strip()[:2000], "confianca": saida["confianca"], "fonte": "ia"}
        except Exception as e:
            log.warning("IA indisponível para a pergunta: %s", e)
    return {"resposta": "Olá! Obrigado pela pergunta. [complete com a informação]. Qualquer outra dúvida, estamos à disposição!",
            "confianca": "baixa", "fonte": "modelo"}


# ---------------------------------------------------------------- destaques para a foto de características
_SISTEMA_DESTAQUES = """Você escolhe os destaques de um produto para uma imagem de anúncio (infográfico).
- De 3 a 5 destaques, cada um com NO MÁXIMO 28 caracteres, em português do Brasil.
- Só use o que estiver nos dados (não invente especificações, certificações ou garantias).
- Prefira benefícios concretos e números: "Capacidade de 1,2 litro", "Aço inox 304", "Bivolt".
- Sem emojis, sem ponto final, sem marcas de concorrentes."""

_SCHEMA_DESTAQUES = {
    "type": "object",
    "properties": {"destaques": {"type": "array", "items": {"type": "string"}}},
    "required": ["destaques"], "additionalProperties": False,
}


def destaques_produto(anuncio) -> list[str]:
    atributos = {k: v for k, v in (anuncio.atributos or {}).items() if v}
    if disponivel():
        try:
            saida = _claude_json(_SISTEMA_DESTAQUES, _SCHEMA_DESTAQUES, json.dumps({
                "titulo": anuncio.titulo, "marca": anuncio.marca, "modelo": anuncio.modelo,
                "caracteristicas": atributos, "descricao": (anuncio.descricao or "")[:3000]}, ensure_ascii=False))
            itens = [d.strip().rstrip(".")[:32] for d in saida["destaques"] if d.strip()]
            if itens:
                return itens[:5]
        except Exception as e:
            log.warning("IA indisponível para os destaques: %s", e)
    # sem IA: as características mais curtas viram destaques
    candidatos = [f"{k}: {v}" for k, v in atributos.items() if len(f"{k}: {v}") <= 32]
    if anuncio.modelo and len(f"Modelo {anuncio.modelo}") <= 32:
        candidatos.insert(0, f"Modelo {anuncio.modelo}")
    return candidatos[:5]
