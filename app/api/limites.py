"""Limite de tentativas (contra quebra de senha por força bruta e cadastros em massa).

Fica em memória: basta para um servidor só. Com vários servidores, mover
para o banco ou para um Redis.
"""

from __future__ import annotations

import threading
import time

from fastapi import HTTPException, Request

_LOCAL = {"127.0.0.1", "::1", "localhost", "testclient"}


def ip_do_cliente(request: Request) -> str:
    """IP real de quem acessa. Atrás de um túnel/proxy local (Cloudflare,
    Nginx), o endereço vem nos cabeçalhos; de fora, os cabeçalhos são ignorados
    para ninguém forjar outro IP."""
    ip = request.client.host if request.client else "?"
    if ip in _LOCAL:
        encaminhado = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "")
        if encaminhado:
            return encaminhado.split(",")[0].strip()
    return ip


class Limitador:
    def __init__(self, maximo: int, janela_s: int, mensagem: str):
        self.maximo, self.janela, self.mensagem = maximo, janela_s, mensagem
        self._eventos: dict[str, list[float]] = {}
        self._trava = threading.Lock()

    def _vivos(self, chave: str, agora: float) -> list[float]:
        lista = [t for t in self._eventos.get(chave, []) if agora - t < self.janela]
        self._eventos[chave] = lista
        return lista

    def conferir(self, *chaves: str):
        agora = time.time()
        with self._trava:
            for chave in chaves:
                vivos = self._vivos(chave, agora)
                if len(vivos) >= self.maximo:
                    espera = int(self.janela - (agora - vivos[0])) // 60 + 1
                    raise HTTPException(429, self.mensagem.format(minutos=espera))

    def registrar(self, *chaves: str):
        agora = time.time()
        with self._trava:
            for chave in chaves:
                self._vivos(chave, agora).append(agora)

    def limpar(self, *chaves: str):
        with self._trava:
            for chave in chaves:
                self._eventos.pop(chave, None)


# 5 senhas erradas no mesmo e-mail (ou 20 no mesmo IP) em 15 min bloqueiam por 15 min
falhas_login = Limitador(5, 900, "Muitas tentativas de login. Aguarde {minutos} min e tente de novo.")
falhas_login_ip = Limitador(20, 900, "Muitas tentativas de login deste endereço. Aguarde {minutos} min.")
cadastros_ip = Limitador(20, 3600, "Muitos cadastros deste endereço. Aguarde {minutos} min.")
