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
