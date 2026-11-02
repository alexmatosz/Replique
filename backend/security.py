"""Senhas, sessões e criptografia das credenciais dos marketplaces."""

import base64
import os
import re
import unicodedata
import hashlib
import hmac
import json
import secrets
import time

from cryptography.fernet import Fernet, InvalidToken

from backend.config import SECRET_KEY, SESSAO_INATIVIDADE_MIN, SESSION_HOURS

_ITERACOES = int(os.getenv("SENHA_ITERACOES", "600000"))


def hash_senha(senha: str) -> str:
    sal = secrets.token_hex(16)
    dig = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal.encode(), _ITERACOES).hex()
    return f"pbkdf2${_ITERACOES}${sal}${dig}"


_HASH_FALSO = hash_senha(secrets.token_hex(16))


def conferir_senha(senha: str, armazenado: str | None) -> bool:
    """Sem hash válido (e-mail inexistente, acesso só com Google) calcula um hash
    falso do mesmo jeito: a resposta demora o mesmo e não entrega quais e-mails existem."""
    try:
        _, iters, sal, dig = (armazenado or "").split("$")
    except ValueError:
        _, iters, sal, dig = _HASH_FALSO.split("$")
        hashlib.pbkdf2_hmac("sha256", senha.encode(), sal.encode(), int(iters))
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


SENHAS_FRACAS = {"monvatti2026", "12345678", "123456789", "1234567890", "senha123", "senha1234", "admin123",
                 "password", "qwerty123", "abc12345", "replique", "monvatti", "mudar123", "teste123"}
_BASES_COMUNS = {
    "senha", "password", "passw0rd", "qwerty", "qwertyuiop", "asdf", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "abc", "abcd", "abcdef",
    "admin", "administrador", "root", "teste", "test", "usuario", "user", "login", "acesso", "entrar", "mudar", "mudarsenha",
    "trocar", "nova", "novasenha", "secreta", "segredo", "iloveyou", "teamo", "amor", "amorzinho", "princesa", "anjo", "deus",
    "jesus", "jesuscristo", "familia", "brasil", "flamengo", "corinthians", "palmeiras", "saopaulo", "vasco", "gremio",
    "internacional", "santos", "cruzeiro", "botafogo", "fluminense", "futebol", "bola", "dragon", "monkey", "master", "sunshine",
    "shadow", "football", "baseball", "superman", "batman", "pokemon", "welcome", "bemvindo", "loja", "minhaloja", "vendas",
    "mercadolivre", "mercado", "livre", "shopee", "amazon", "marketplace", "anuncio", "anuncios", "empresa", "agencia",
    "monvatti", "replique", "cliente", "operador", "consultor", "gerente", "financeiro", "contato", "casa", "carro", "gato",
    "cachorro", "maria", "joao", "jose", "ana", "pedro", "lucas", "gabriel", "rafael", "daniel", "bruno", "felipe", "carlos",
    "paulo", "marcos", "fernanda", "juliana", "mariana", "camila", "amanda", "beatriz", "gabriela", "letmein", "trustno1",
    "starwars", "hello", "ola", "oi", "abcabc", "aaaa", "senhasenha", "passwordpassword", "computador", "internet", "google",
    "facebook", "instagram", "whatsapp", "netflix", "spotify", "microsoft", "windows", "apple", "samsung", "xiaomi", "motorola"}
_SEQUENCIAS = ("0123456789", "9876543210", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm", "1qaz2wsx3edc")
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def senha_fraca(senha: str, contexto: tuple[str, ...] | list[str] = ()) -> bool:
    """Senha comum ou fácil de adivinhar (ASVS 6.2.4 e 6.2.11): lista de senhas e
    de palavras comuns (inclusive com números ou símbolos no fim e troca de letra
    por número, como "S3nha@2026"), sequências do teclado, poucos caracteres
    diferentes e palavras do contexto (e-mail, nome, empresa). Não exige tipos de
    caractere (ASVS 6.2.5)."""
    s = _sem_acento((senha or "").strip().lower())
    if s in SENHAS_FRACAS or len(set(s)) <= 3:
        return True
    letras = re.sub(r"[^a-z]", "", s.translate(_LEET))
    base = re.sub(r"[^a-z0-9]", "", re.sub(r"[\d\W_]+$", "", s))
    if not letras or base.translate(_LEET) in _BASES_COMUNS or letras in _BASES_COMUNS or len(set(letras)) <= 2:
        return True
    compacta = re.sub(r"[^a-z0-9]", "", s)
    if any(compacta in seq or seq.startswith(compacta) for seq in _SEQUENCIAS) or re.fullmatch(r"(.{1,4})\1+", compacta or "x"):
        return True
    for palavra in contexto:
        texto = (palavra or "").split("@")[0]
        for p in re.split(r"[^a-z0-9]+", _sem_acento(texto.lower())):
            if len(p) >= 4 and p in compacta:
                return True
    return False


def senha_proibida_no_login(senha: str) -> bool:
    """Bloqueio no login pela internet: só a lista curta e senhas de um ou dois
    caracteres repetidos (a regra completa vale ao criar ou trocar a senha, para
    não trancar fora quem já tem acesso)."""
    s = (senha or "").strip().lower()
    return s in SENHAS_FRACAS or len(set(s)) <= 2


def precisa_rehash(armazenado: str | None) -> bool:
    """Hash feito com menos iterações que o atual: refaz no próximo login."""
    try:
        return int((armazenado or "").split("$")[1]) < _ITERACOES
    except (IndexError, ValueError):
        return False


def criar_token_sessao(usuario_id: int, empresa_id: int, versao: int = 0, login_em: int | None = None) -> str:
    """Vale SESSAO_INATIVIDADE_MIN sem uso (a tela renova enquanto a pessoa usa) e
    nunca passa de SESSION_HOURS desde a entrada (ASVS 7.3.1 e 7.3.2)."""
    agora = int(time.time())
    login_em = login_em or agora
    return _assinar({"t": "sessao", "u": usuario_id, "e": empresa_id, "v": versao or 0, "l": login_em,
                     "exp": min(agora + SESSAO_INATIVIDADE_MIN * 60, login_em + SESSION_HOURS * 3600)})


_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def gerar_segredo_totp() -> str:
    """Semente do app autenticador: 160 bits do gerador seguro (ASVS 6.5.3)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def codigo_totp(segredo: str, passo: int) -> str:
    """RFC 6238: HMAC-SHA1, passos de 30 segundos, 6 dígitos."""
    chave = base64.b32decode(segredo + "=" * (-len(segredo) % 8))
    mac = hmac.new(chave, passo.to_bytes(8, "big"), hashlib.sha1).digest()
    pos = mac[-1] & 0x0F
    numero = (int.from_bytes(mac[pos:pos + 4], "big") & 0x7FFFFFFF) % 1_000_000
    return f"{numero:06d}"


def conferir_totp(segredo: str, codigo: str, ultimo_passo: int | None, agora: float | None = None) -> int | None:
    """Aceita o passo atual e o vizinho (relógio do celular um pouco fora). Cada
    código vale uma vez só (ASVS 6.5.1): devolve o passo usado, que precisa ser
    maior que o último aceito."""
    codigo = re.sub(r"\D", "", codigo or "")
    if len(codigo) != 6:
        return None
    atual = int((agora if agora is not None else time.time()) // 30)
    for passo in (atual - 1, atual, atual + 1):
        if (ultimo_passo is None or passo > ultimo_passo) and hmac.compare_digest(codigo_totp(segredo, passo), codigo):
            return passo
    return None


def gerar_codigos_recuperacao(n: int = 10) -> list[str]:
    """Códigos de uso único com 80 bits cada, mostrados uma vez; no banco fica só o resumo."""
    return ["-".join(secrets.token_hex(5)[i:i + 5] for i in (0, 5)).upper() for _ in range(n)]


def resumo_codigo(codigo: str) -> str:
    return hashlib.sha256(re.sub(r"[^A-Z0-9]", "", (codigo or "").upper()).encode()).hexdigest()


def criar_state_oauth(empresa_id: int, cliente_id: int | None = None, usuario_id: int | None = None) -> str:
    """Vai na URL de autorização do marketplace: identifica empresa e CLIENTE
    (a conta autorizada só pode ser ligada a esse cliente), vale 30 minutos e
    NÃO serve como sessão."""
    return _assinar({"t": "oauth", "e": empresa_id, "c": cliente_id, "u": usuario_id,
                     "exp": int(time.time()) + 1800})


def pkce_do_state(state: str) -> tuple[str, str]:
    """PKCE sem guardar nada: o code_verifier sai do state assinado, então a volta
    do marketplace (em qualquer servidor) recalcula o mesmo valor."""
    verificador = _b64(hmac.new(SECRET_KEY.encode(), f"pkce|{state}".encode(), hashlib.sha256).digest())
    desafio = _b64(hashlib.sha256(verificador.encode()).digest())
    return verificador, desafio


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
    if not hmac.compare_digest(esperado.encode(), assinatura.encode()):
        return None
    try:
        dados = json.loads(_unb64(corpo))
    except ValueError:
        return None
    if not isinstance(dados, dict) or dados.get("exp", 0) < time.time():
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


def criar_assinado(tipo: str, dados: dict, segundos: int) -> str:
    """Token assinado e com validade para um uso específico (tipo)."""
    return _assinar({**dados, "t": tipo, "exp": int(time.time()) + segundos})


def ler_assinado(token: str, tipo: str) -> dict | None:
    try:
        dados = _ler(token or "")
    except (ValueError, TypeError):
        return None
    return dados if dados and dados.get("t") == tipo else None


def senha_inutilizavel() -> str:
    """Para quem entra só com Google: nenhum texto confere com isto no login por senha."""
    return "google$" + secrets.token_hex(32)


def hash_token(token: str) -> str:
    return hashlib.sha256((token or "").encode()).hexdigest()
