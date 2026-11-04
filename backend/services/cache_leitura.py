"""Cache de leitura para o banco parar de responder a mesma pergunta mil vezes.

Guarda por pouco tempo a resposta de rotas GET só-leitura e, enquanto uma
resposta está sendo montada, faz as outras chamadas iguais esperarem por ela
em vez de refazer a consulta (single-flight). Assim, cem pessoas abrindo a
mesma tela ao mesmo tempo viram uma consulta ao banco, não cem.

Segurança: a chave inclui a sessão de quem pede, então uma pessoa nunca vê o
dado de outra. Só entram rotas marcadas como seguras (sem efeito, iguais para
a mesma sessão) e respostas 200 em JSON. Rotas com dado por cliente levam o
cabeçalho X-Cliente na chave.
"""

from __future__ import annotations

import hashlib
import threading
import time

from backend import config

# Prefixos de rotas GET que são só leitura e podem ser guardadas por alguns segundos.
# Nada que grave, publique, baixe arquivo ou dependa do horário exato entra aqui.
CACHEAVEIS = (
    "/api/novidades",
    "/api/visao-geral",
    "/api/faturamento-geral",
    "/api/acompanhamento",
    "/api/anuncios",
    "/api/promocoes",
    "/api/financeiro/lucratividade",
    "/api/financeiro/gestao",
    "/api/financeiro/dre",
    "/api/analise",
    "/api/saude",
    "/api/agendador/situacao",
    "/api/equipe",
    "/api/ferramentas",
)


def cacheavel(caminho: str) -> bool:
    return config.CACHE_LEITURA_S > 0 and any(
        caminho == p or caminho.startswith(p + "/") or caminho.startswith(p + "?") for p in CACHEAVEIS)


class _Cache:
    def __init__(self):
        self._itens: dict[str, tuple[float, object]] = {}
        self._geracoes: dict[str, int] = {}
        self._trava = threading.Lock()
        self.acertos = 0
        self.gravados = 0

    def _token(self, token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()[:16]

    def invalidar(self, token: str) -> None:
        """Depois que esta sessão grava algo (POST/PUT/DELETE), a próxima leitura dela
        vem do banco, não do cache: a geração muda e as chaves antigas deixam de casar."""
        if not token:
            return
        t = self._token(token)
        with self._trava:
            self._geracoes[t] = self._geracoes.get(t, 0) + 1

    def chave(self, token: str, metodo: str, caminho: str, query: str, cliente: str) -> str:
        t = self._token(token)
        with self._trava:
            gen = self._geracoes.get(t, 0)
        crua = f"{metodo}\n{caminho}\n{query}\n{cliente}\n{t}\n{gen}"
        return hashlib.sha256(crua.encode()).hexdigest()

    def ler(self, chave: str):
        with self._trava:
            item = self._itens.get(chave)
            if item and time.monotonic() < item[0]:
                self.acertos += 1
                return item[1]
            if item:
                self._itens.pop(chave, None)
        return None

    def guardar(self, chave: str, valor, ttl: float | None = None) -> None:
        with self._trava:
            self._itens[chave] = (time.monotonic() + (ttl or config.CACHE_LEITURA_S), valor)
            self.gravados += 1
            if len(self._itens) > config.CACHE_LEITURA_MAX:
                agora = time.monotonic()
                self._itens = {k: v for k, v in self._itens.items() if v[0] > agora}
                if len(self._itens) > config.CACHE_LEITURA_MAX:
                    for k in list(self._itens)[: len(self._itens) - config.CACHE_LEITURA_MAX]:
                        self._itens.pop(k, None)

    def limpar(self) -> None:
        with self._trava:
            self._itens.clear()
            self._geracoes.clear()

    def resumo(self) -> dict:
        with self._trava:
            return {"itens": len(self._itens), "acertos": self.acertos, "gravados": self.gravados}


cache = _Cache()
