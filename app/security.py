"""Senhas, sessões e criptografia das credenciais dos marketplaces."""

import base64
import hashlib
import hmac
import json
import secrets
import time

from cryptography.fernet import Fernet, InvalidToken

from app.config import SECRET_KEY, SESSION_HOURS

_ITERACOES = 240_000


def hash_senha(senha: str) -> str:
    sal = secrets.token_hex(16)
    dig = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal.encode(), _ITERACOES).hex()
    return f"pbkdf2${_ITERACOES}${sal}${dig}"


def conferir_senha(senha: str, armazenado: str) -> bool:
    try:
        _, iters, sal, dig = armazenado.split("$")
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal.encode(), int(iters)).hex()
    return hmac.compare_digest(calc, dig)


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _assinar(dados: dict) -> str:
    corpo = _b64(json.dumps(dados).encode())
    assinatura = _b64(hmac.new(SECRET_KEY.encode(), corpo.encode(), hashlib.sha256).digest())
    return f"{corpo}.{assinatura}"


def criar_token_sessao(usuario_id: int, empresa_id: int) -> str:
    return _assinar({"t": "sessao", "u": usuario_id, "e": empresa_id,
                     "exp": int(time.time()) + SESSION_HOURS * 3600})


def criar_state_oauth(empresa_id: int, cliente_id: int | None = None, usuario_id: int | None = None) -> str:
    """Vai na URL de autorização do marketplace: identifica empresa e CLIENTE
    (a conta autorizada só pode ser ligada a esse cliente), vale 30 minutos e
    NÃO serve como sessão."""
    return _assinar({"t": "oauth", "e": empresa_id, "c": cliente_id, "u": usuario_id,
                     "exp": int(time.time()) + 1800})


def ler_token_sessao(token: str) -> dict | None:
    dados = _ler(token)
    return dados if dados and dados.get("t") == "sessao" else None


def ler_state_oauth(token: str) -> dict | None:
    dados = _ler(token)
    return dados if dados and dados.get("t") == "oauth" else None


def _ler(token: str) -> dict | None:
    try:
        corpo, assinatura = token.split(".")
    except ValueError:
        return None
    esperado = _b64(hmac.new(SECRET_KEY.encode(), corpo.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(esperado, assinatura):
        return None
    dados = json.loads(_unb64(corpo))
    if dados.get("exp", 0) < time.time():
        return None
    return dados


def novo_token_convite() -> str:
    return secrets.token_urlsafe(18)


def gerar_api_key() -> tuple[str, str]:
    """Retorna (chave em texto puro, hash para guardar no banco)."""
    chave = "rpq_" + secrets.token_urlsafe(32)
    return chave, hash_api_key(chave)


def hash_api_key(chave: str) -> str:
    return hashlib.sha256(chave.encode()).hexdigest()


def _fernet() -> Fernet:
    chave = hashlib.sha256(("credenciais:" + SECRET_KEY).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(chave))


def criptografar(dados: dict) -> str:
    return _fernet().encrypt(json.dumps(dados).encode()).decode()


def descriptografar(texto: str) -> dict:
    if not texto:
        return {}
    try:
        return json.loads(_fernet().decrypt(texto.encode()))
    except InvalidToken:
        return {}
