"""Limite de tentativas (contra quebra de senha por força bruta e cadastros em massa).

Fica em memória: basta para um servidor só. Com vários servidores, mover
para o banco ou para um Redis.
"""

from __future__ import annotations

import ipaddress
import threading
import time

from fastapi import HTTPException, Request

from app import config

_LOCAL = {"127.0.0.1", "::1", "localhost", "testclient"}


def _na_lista(ip: str, redes: list[str]) -> bool:
    if ip in redes or (ip == "testclient" and "127.0.0.1" in redes):
        return True
    try:
        endereco = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for rede in redes:
        try:
            if endereco in ipaddress.ip_network(rede, strict=False):
                return True
        except ValueError:
            continue
    return False


def ip_do_cliente(request: Request) -> str:
    """IP real de quem acessa. Os cabeçalhos de proxy só valem quando a
    conexão vem de um proxy confiável (PROXY_IPS) e só o cabeçalho do modo
    configurado (PROXY_MODO) é lido. Assim ninguém forja "127.0.0.1" para
    escapar do limite de tentativas ou da regra de senha fraca."""
    ip = request.client.host if request.client else "?"
    if config.PROXY_MODO == "nenhum" or not _na_lista(ip, config.PROXY_IPS):
        return ip
    if config.PROXY_MODO == "cloudflare":
        return (request.headers.get("cf-connecting-ip") or "").strip() or ip
    if config.PROXY_MODO == "xff":
        cadeia = [x.strip() for x in request.headers.get("x-forwarded-for", "").split(",") if x.strip()]
        for candidato in reversed(cadeia):
            if not _na_lista(candidato, config.PROXY_IPS):
                return candidato
        return cadeia[0] if cadeia else ip
    return ip


def acesso_local(request: Request) -> bool:
    """Conexão feita no próprio computador do servidor, sem passar por proxy."""
    ip = request.client.host if request.client else "?"
    return ip in _LOCAL and not (request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for"))


class Limitador:
    def __init__(self, maximo: int, janela_s: int, mensagem: str):
        self.maximo, self.janela, self.mensagem = maximo, janela_s, mensagem
        self._eventos: dict[str, list[float]] = {}
        self._trava = threading.Lock()

    def _vivos(self, chave: str, agora: float) -> list[float]:
        lista = [t for t in self._eventos.get(chave, []) if agora - t < self.janela]
        self._eventos[chave] = lista
        if len(self._eventos) > 5000:
            self._eventos = {k: v for k, v in self._eventos.items()
                             if k == chave or (v and agora - v[-1] < self.janela)}
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


falhas_login = Limitador(5, 900, "Muitas tentativas de login. Aguarde {minutos} min e tente de novo.")
falhas_login_ip = Limitador(20, 900, "Muitas tentativas de login deste endereço. Aguarde {minutos} min.")
cadastros_ip = Limitador(20, 3600, "Muitos cadastros deste endereço. Aguarde {minutos} min.")


uso_ia = Limitador(config.LIMITE_IA_HORA, 3600, "Limite de usos da IA por hora atingido. Tente em {minutos} min.")
uso_pesquisa = Limitador(config.LIMITE_PESQUISAS_HORA, 3600, "Limite de pesquisas por hora atingido. Tente em {minutos} min.")
uso_fotos_ia = Limitador(config.LIMITE_FOTOS_IA_HORA, 3600,
                         "Limite de gerações de fotos por hora atingido. Tente em {minutos} min.")
uso_uploads = Limitador(config.LIMITE_UPLOADS_HORA, 3600, "Limite de envios de fotos por hora atingido. Tente em {minutos} min.")


def consumir(limitador: Limitador, usuario_id: int | None):
    """Confere e conta um uso (usuario_id None = MCP, que é da própria empresa)."""
    chave = f"u:{usuario_id or 'mcp'}"
    limitador.conferir(chave)
    limitador.registrar(chave)
