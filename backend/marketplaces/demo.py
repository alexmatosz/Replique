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

from backend.marketplaces.base import (
    PLATAFORMAS, AnuncioCopiado, ErroMarketplace, Marketplace, ResultadoPesquisa, ResultadoPublicacao,
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


class SemConta:
    """Plataforma sem conta conectada (uso real, sem modo demonstração): qualquer
    consulta responde pedindo para conectar a conta, em vez de inventar dados."""
    demo = False
    sem_conta = True
    meta = None

    def __init__(self, plataforma: str, motivo: str):
        self.plataforma, self.motivo = plataforma, motivo
        self.conta_info = {"apelido": "", "id_externo": ""}
        self.mensagem = f"Conecte a conta de {PLATAFORMAS.get(plataforma, plataforma)} deste cliente em Contas ({motivo})."

    def __getattr__(self, nome):
        if nome.startswith("__"):
            raise AttributeError(nome)

        def recusar(*_a, **_k):
            raise ErroMarketplace(self.mensagem)
        return recusar


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

    def pesquisar_anuncios(self, termo: str, limite: int = 20) -> list[ResultadoPesquisa]:
        """Mesmo formato da pesquisa por anúncios do ML real (produto + resumo dos anúncios)."""
        resultados = self.pesquisar(termo, limite)
        for r in resultados:
            rng = self._rng(r.id_externo, "anuncios")
            n = rng.randint(3, 18)
            precos = sorted(round(r.preco * rng.uniform(0.85, 1.25), 2) for _ in range(n))
            r.tipo, r.posicao_ranking = "PRODUCT", None
            full, premium = rng.randint(0, n // 2), rng.randint(0, n)
            r.extra["ofertas"] = [{"item_id": f"DEMO-ITEM-{r.id_externo[-6:]}-{k}", "preco": precos[k], "preco_original": None,
                                   "full": k < full, "frete_gratis": True, "tipo_anuncio": "Premium" if k < premium else "Clássico",
                                   "loja_oficial": False, "vendedor_id": k, "condicao": "new", "cidade": ""} for k in range(n)]
            r.extra.update({"fonte": "anuncios", "anuncios": n, "vendedores": n, "full": full, "fora_full": n - full,
                            "frete_gratis": rng.randint(n // 2, n), "lojas_oficiais": rng.randint(0, 2),
                            "premium": premium, "classico": n - premium, "preco_min": precos[0], "preco_max": precos[-1],
                            "preco_mediano": precos[n // 2]})
            r.preco = precos[0]
            r.origem_sinal = f"{n} anúncio(s) · {r.extra['full']} no Full (demonstração)"
        return resultados

    def anuncios_do_produto(self, product_id: str, limite: int = 40) -> dict:
        rng = self._rng(product_id, "anuncios")
        n = rng.randint(3, 18)
        base = round(rng.uniform(39, 499), 2)
        anuncios = []
        for i in range(n):
            serie = [max(0, int(rng.gauss(12, 6))) for _ in range(30)]
            preco = round(base * rng.uniform(0.85, 1.25), 2)
            full = rng.random() < 0.35
            anuncios.append({
                "item_id": f"DEMO-ITEM-{product_id[-6:]}-{i}", "product_id": product_id, "link": "",
                "preco": preco, "preco_original": round(preco * 1.15, 2) if rng.random() < 0.3 else None,
                "desconto_pct": 13 if rng.random() < 0.3 else 0, "logistica": "fulfillment" if full else "cross_docking",
                "logistica_nome": "Full" if full else "Coleta", "full": full, "frete_gratis": preco >= 79 or full,
                "tipo_anuncio": rng.choice(["Clássico", "Premium"]), "loja_oficial": rng.random() < 0.1, "condicao": "new",
                "garantia": "Garantia de fábrica: 90 dias", "cidade": rng.choice(["São Paulo", "Curitiba", "Joinville", "Belo Horizonte"]),
                "estado": "", "vendedor": {"id": i, "apelido": f"LOJA_DEMO_{i + 1}", "link": "",
                                           "termometro": rng.choice(["5_green", "5_green", "4_light_green", "3_yellow"]),
                                           "medalha": rng.choice(["platinum", "gold", "silver", ""]),
                                           "vendas_total": rng.randint(200, 90000), "cidade": "", "uf": ""},
                "visitas": {"ontem": serie[-1], "sete_dias": sum(serie[-7:]), "trinta_dias": sum(serie), "serie": serie}})
        anuncios.sort(key=lambda a: a["preco"])
        return {"produto": {"id": product_id, "nome": "Produto de demonstração", "foto": imagem_demo("Produto", self.plataforma), "link": ""},
                "total": n, "mostrados": n, "dias": [], "anuncios": anuncios, "resumo": {"anuncios": n}}

    def analisar_link(self, url: str) -> dict:
        import re
        achado = re.search(r"MLB-?(\d{6,})", url or "", re.I)
        if not achado:
            raise ErroMarketplace("Não achei o código do anúncio (MLB...) nesse link.")
        return {"tipo": "produto", "product_id": f"DEMO-{achado.group(1)}", "item_id": ""}

    def obter_anuncio(self, id_externo: str, tipo: str = "ITEM", item_id: str = "") -> AnuncioCopiado:
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
