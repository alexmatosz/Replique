"""Contrato comum de todos os marketplaces.

Cada plataforma (Mercado Livre, Shopee, Amazon) implementa as mesmas três
operações, então o resto do sistema — tela, API e servidor MCP — não
precisa saber com qual plataforma está falando.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import httpx

PLATAFORMAS = {
    "mercadolivre": "Mercado Livre",
    "shopee": "Shopee",
    "amazon": "Amazon",
}

# Limites de título de cada plataforma (usados na validação e no editor).
LIMITE_TITULO = {"mercadolivre": 60, "shopee": 120, "amazon": 200}


class ErroMarketplace(Exception):
    """Erro com mensagem já em português, pronta para mostrar ao usuário."""

    def __init__(self, mensagem: str, detalhes: dict | None = None):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.detalhes = detalhes or {}


@dataclass
class ResultadoPesquisa:
    plataforma: str
    id_externo: str
    titulo: str
    preco: float | None = None
    moeda: str = "BRL"
    imagem: str = ""
    link: str = ""
    tipo: str = "ITEM"  # ITEM | PRODUCT | USER_PRODUCT | ASIN
    vendidos: int | None = None
    avaliacao: float | None = None
    posicao_ranking: int | None = None  # posição num ranking oficial de mais vendidos
    sales_rank: int | None = None  # Amazon: quanto menor, mais vende
    vendedor: str = ""
    popularidade: float = 0  # 0-100, comparável entre plataformas
    origem_sinal: str = ""  # explica de onde veio a popularidade
    demo: bool = False
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AnuncioCopiado:
    titulo: str
    descricao: str = ""
    preco: float = 0
    fotos: list[str] = field(default_factory=list)
    atributos: dict = field(default_factory=dict)
    marca: str = ""
    modelo: str = ""
    gtin: str = ""
    condicao: str = "new"
    link: str = ""
    por_plataforma: dict = field(default_factory=dict)
    demo: bool = False


@dataclass
class ResultadoPublicacao:
    sucesso: bool
    id_externo: str = ""
    link: str = ""
    mensagem: str = ""
    detalhes: dict = field(default_factory=dict)
    demo: bool = False


def popularidade_por_posicao(posicao: int, total: int = 20) -> float:
    """1º lugar = 100; último lugar do ranking ainda vale ~25."""
    posicao = max(1, posicao)
    return round(max(25.0, 100 - (posicao - 1) * (75 / max(1, total - 1))), 1)


def popularidade_por_vendas(vendidos: int | None) -> float:
    """Escala logarítmica: 10 vendas ≈ 25, 1.000 ≈ 55, 100.000 ≈ 85."""
    if not vendidos or vendidos <= 0:
        return 10.0
    return round(min(100.0, 10 + math.log10(vendidos) * 15), 1)


def popularidade_por_sales_rank(rank: int | None) -> float:
    """Amazon Best Sellers Rank: 1 = 100; 100 ≈ 70; 10.000 ≈ 40; 1.000.000 ≈ 10."""
    if not rank or rank <= 0:
        return 10.0
    return round(max(5.0, 100 - math.log10(rank) * 15), 1)


class Marketplace:
    """Classe base. `credenciais` são as da conta do cliente (vazias em modo
    demonstração) e `salvar_credenciais` persiste tokens renovados."""

    plataforma: str = ""
    demo: bool = False
    # apelido e ID da conta usada, preenchidos pelo registry (vão para a auditoria)
    conta_info: dict = {}

    def __init__(self, credenciais: dict | None = None, salvar_credenciais=None):
        self.cred = credenciais or {}
        self._salvar = salvar_credenciais or (lambda _c: None)
        self._http: httpx.Client | None = None

    @property
    def http(self) -> httpx.Client:
        # Criado só quando usado: montar o contexto SSL custa ~0,5 s, e o modo
        # demonstração nunca faz chamadas.
        if self._http is None:
            self._http = httpx.Client(timeout=20, follow_redirects=True,
                                      headers={"User-Agent": "Replique/1.0 (+Monvatti)"})
        return self._http

    @http.setter
    def http(self, cliente: httpx.Client):
        self._http = cliente

    def salvar_credenciais(self):
        self._salvar(self.cred)

    # --- operações que cada plataforma implementa ---
    def pesquisar(self, termo: str, limite: int = 20) -> list[ResultadoPesquisa]:
        raise NotImplementedError

    def obter_anuncio(self, id_externo: str, tipo: str = "ITEM") -> AnuncioCopiado:
        raise NotImplementedError

    def publicar(self, anuncio) -> ResultadoPublicacao:
        raise NotImplementedError

    # --- utilitários ---
    def baixar_imagem(self, url: str) -> tuple[bytes, str]:
        """Lê uma foto do anúncio: arquivo enviado ao Replique (/uploads/...)
        ou URL externa. Retorna (bytes, nome_arquivo)."""
        from app.config import UPLOADS_DIR
        if url.startswith("/uploads/"):
            caminho = UPLOADS_DIR / url.removeprefix("/uploads/")
            return caminho.read_bytes(), caminho.name
        if not url.startswith("http"):
            raise ErroMarketplace("Há uma foto de demonstração no anúncio. Troque por fotos reais antes de publicar.")
        r = self.http.get(url)
        if r.status_code >= 400:
            raise ErroMarketplace(f"Não consegui baixar a foto {url} (HTTP {r.status_code}).")
        nome = url.split("?")[0].rsplit("/", 1)[-1] or "foto.jpg"
        return r.content, nome
