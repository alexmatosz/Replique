"""Regras de segurança para fotos de anúncio.

Uma foto é texto que o usuário controla e que o servidor depois LÊ ou BAIXA
para enviar ao marketplace. Sem estas travas, dá para:
- ler arquivos do servidor ("/uploads/../secret.key" → chave que decifra os tokens);
- fazer o servidor acessar a rede interna (SSRF: "http://169.254.169.254/...",
  "http://127.0.0.1:8000/..."), por exemplo credenciais da hospedagem.
"""

from __future__ import annotations

import ipaddress
import re
import secrets
import socket
from urllib.parse import urljoin, urlparse

import httpx

from backend import config

_UPLOAD = re.compile(r"^/uploads/(\d{1,10})/([0-9a-f]{20}\.(?:jpg|png|webp))$")
MAX_FOTO = 10 * 1024 * 1024


class FotoInvalida(ValueError):
    pass


def validar_foto(url: str, empresa_id: int) -> str:
    """Aceita só fotos enviadas ao Replique pela própria empresa ou URLs http(s) comuns."""
    url = str(url or "").strip()
    m = _UPLOAD.match(url)
    if m:
        if int(m.group(1)) != empresa_id:
            raise FotoInvalida("Foto de outra empresa não pode ser usada.")
        return url
    if url.startswith("/demo-img.svg"):
        return url
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        raise FotoInvalida(f"Endereço de foto inválido: {url[:80]}. Use um link https:// ou envie o arquivo.")
    return url


def guardar(empresa_id: int, conteudo: bytes, extensao: str) -> str:
    """Grava a foto na pasta da empresa e, sem disco permanente, também no banco."""
    pasta = config.UPLOADS_DIR / str(empresa_id)
    pasta.mkdir(parents=True, exist_ok=True)
    nome = secrets.token_hex(10) + extensao
    (pasta / nome).write_bytes(conteudo)
    if config.FOTOS_NO_BANCO:
        from backend.banco.db import SessionLocal
        from backend.banco.models import ArquivoFoto
        with SessionLocal() as db:
            db.add(ArquivoFoto(empresa_id=empresa_id, nome=nome, dados=conteudo))
            db.commit()
    return f"/uploads/{empresa_id}/{nome}"


def _do_banco(empresa_id: int, nome: str) -> bytes | None:
    if not config.FOTOS_NO_BANCO:
        return None
    from backend.banco.db import SessionLocal
    from backend.banco.models import ArquivoFoto
    with SessionLocal() as db:
        foto = db.query(ArquivoFoto).filter_by(empresa_id=empresa_id, nome=nome).first()
        return foto.dados if foto else None


def apagar(url: str, empresa_id: int):
    m = _UPLOAD.match(url or "")
    if not m or int(m.group(1)) != empresa_id:
        return
    (config.UPLOADS_DIR / m.group(1) / m.group(2)).unlink(missing_ok=True)
    if config.FOTOS_NO_BANCO:
        from backend.banco.db import SessionLocal
        from backend.banco.models import ArquivoFoto
        with SessionLocal() as db:
            db.query(ArquivoFoto).filter_by(empresa_id=empresa_id, nome=m.group(2)).delete()
            db.commit()


def arquivo_local(url: str, empresa_id: int):
    """Caminho seguro de uma foto enviada ao Replique (nunca sai da pasta da empresa).
    Se a pasta temporária perdeu o arquivo, ele volta do banco."""
    m = _UPLOAD.match(url or "")
    if not m or int(m.group(1)) != empresa_id:
        raise FotoInvalida("Foto enviada inválida.")
    pasta = (config.UPLOADS_DIR / m.group(1)).resolve()
    caminho = (pasta / m.group(2)).resolve()
    if caminho.parent != pasta:
        raise FotoInvalida("Foto enviada inválida.")
    if not caminho.is_file():
        dados = _do_banco(empresa_id, m.group(2))
        if dados is None:
            raise FotoInvalida("Foto enviada não encontrada.")
        pasta.mkdir(parents=True, exist_ok=True)
        caminho.write_bytes(dados)
    return caminho


def _endereco_publico(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global or ip.is_multicast:
            return False
    return bool(infos)


def baixar_externa(http: httpx.Client, url: str) -> tuple[bytes, str]:
    """Baixa uma foto da internet PÚBLICA: bloqueia endereços internos, confere
    cada redirecionamento, limita o tamanho e exige conteúdo de imagem."""
    for _ in range(4):
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname or not _endereco_publico(p.hostname):
            raise FotoInvalida(f"Não é permitido baixar fotos deste endereço: {p.hostname or url[:60]}.")
        with http.stream("GET", url, follow_redirects=False, timeout=20) as r:
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                url = urljoin(url, r.headers["location"])
                continue
            if r.status_code >= 400:
                raise FotoInvalida(f"Não consegui baixar a foto {url[:80]} (HTTP {r.status_code}).")
            if not (r.headers.get("content-type") or "").lower().startswith("image/"):
                raise FotoInvalida(f"O link {url[:80]} não é uma imagem.")
            dados = bytearray()
            for pedaco in r.iter_bytes():
                dados += pedaco
                if len(dados) > MAX_FOTO:
                    raise FotoInvalida("Foto maior que 10 MB.")
        nome = url.split("?")[0].rsplit("/", 1)[-1] or "foto.jpg"
        return bytes(dados), nome
    raise FotoInvalida("A foto redireciona demais.")
