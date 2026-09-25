"""Modo demonstração.

Usado quando a empresa ainda não conectou a conta de uma plataforma. Gera
resultados fictícios, porém estáveis (o mesmo termo sempre gera os mesmos
dados), para dar para experimentar o fluxo completo — pesquisar, copiar,
editar e "publicar" — sem nenhuma credencial. Tudo sai marcado demo=True e
a interface mostra isso com clareza.
"""

import hashlib
import random
from urllib.parse import quote

from app.marketplaces.base import (
    PLATAFORMAS, AnuncioCopiado, Marketplace, ResultadoPesquisa, ResultadoPublicacao,
    popularidade_por_posicao, popularidade_por_sales_rank, popularidade_por_vendas,
)

_VARIACOES = [
    "Original", "Premium", "Kit 2 Unidades", "Profissional", "Compacto",
    "Com Garantia", "Linha 2026", "Alta Performance", "Resistente", "Ultra",
]
_MARCAS = ["Vexa", "Nordika", "Prime Home", "Solaris", "Atlas", "Kora", "Brisa", "Titan"]
_CORES = {"mercadolivre": "FFE600", "shopee": "EE4D2D", "amazon": "232F3E"}


def imagem_demo(texto: str, plataforma: str) -> str:
    return f"/demo-img.svg?t={quote(texto[:40])}&c={_CORES.get(plataforma, '7C3AED')}"


class DemoMarketplace(Marketplace):
    demo = True

    def __init__(self, plataforma: str):
        super().__init__()
        self.plataforma = plataforma

    def _rng(self, *partes) -> random.Random:
        semente = hashlib.sha256("|".join([self.plataforma, *map(str, partes)]).encode()).hexdigest()
        return random.Random(int(semente[:12], 16))

    def pesquisar(self, termo: str, limite: int = 20) -> list[ResultadoPesquisa]:
        rng = self._rng(termo.lower().strip())
        termo_fmt = termo.strip().title()
        resultados = []
        for i in range(min(limite, 8)):
            marca = rng.choice(_MARCAS)
            titulo = f"{termo_fmt} {marca} {rng.choice(_VARIACOES)}"
            preco = round(rng.uniform(39, 499), 2)
            id_ext = f"DEMO-{self.plataforma[:2].upper()}-{rng.randint(10**7, 10**8)}"
            r = ResultadoPesquisa(
                plataforma=self.plataforma, id_externo=id_ext, titulo=titulo, preco=preco,
                imagem=imagem_demo(titulo, self.plataforma), link="", demo=True,
                vendedor=f"Loja {marca}", avaliacao=round(rng.uniform(3.9, 5.0), 1),
                extra={"termo": termo, "marca": marca},
            )
            if self.plataforma == "mercadolivre":
                r.posicao_ranking = i + 1
                r.popularidade = popularidade_por_posicao(i + 1)
                r.origem_sinal = f"{i + 1}º mais vendido da categoria (demonstração)"
            elif self.plataforma == "amazon":
                r.tipo = "ASIN"
                r.sales_rank = int(rng.uniform(1, 40) * (i + 1) ** 2.2)
                r.popularidade = popularidade_por_sales_rank(r.sales_rank)
                r.origem_sinal = f"Ranking de vendas nº {r.sales_rank} (demonstração)"
            else:
                r.vendidos = int(rng.uniform(5000, 20000) / (i + 1))
                r.popularidade = popularidade_por_vendas(r.vendidos)
                r.origem_sinal = f"{r.vendidos} vendidos (demonstração)"
            resultados.append(r)
        return resultados

    def obter_anuncio(self, id_externo: str, tipo: str = "ITEM") -> AnuncioCopiado:
        rng = self._rng(id_externo)
        marca = rng.choice(_MARCAS)
        titulo = f"Produto {marca} {rng.choice(_VARIACOES)}"
        return AnuncioCopiado(
            titulo=titulo,
            descricao=(
                f"{titulo} — anúncio de demonstração.\n\n"
                "Principais características:\n• Material de alta qualidade\n"
                "• Acabamento premium\n• Fácil de usar\n\n"
                "Conecte sua conta da plataforma em Contas para copiar anúncios reais."
            ),
            preco=round(rng.uniform(39, 499), 2),
            fotos=[imagem_demo(f"{titulo} {n}", self.plataforma) for n in range(1, 4)],
            atributos={"Cor": rng.choice(["Preto", "Branco", "Cinza"]), "Material": "Plástico ABS"},
            marca=marca, modelo=f"{marca[:3].upper()}-{rng.randint(100, 999)}",
            demo=True,
        )

    def publicar(self, anuncio) -> ResultadoPublicacao:
        rng = self._rng(anuncio.id, anuncio.titulo)
        id_ext = f"DEMO{rng.randint(10**8, 10**9)}"
        return ResultadoPublicacao(
            sucesso=True, id_externo=id_ext, demo=True,
            mensagem=(f"Publicação SIMULADA em {PLATAFORMAS[self.plataforma]} — nada foi enviado. "
                      "Conecte a conta em Contas para publicar de verdade."),
        )
