"""Configurações do Replique, lidas do arquivo .env (veja .env.example)."""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)


def _chave_secreta() -> str:
    """SECRET_KEY assina as sessões e criptografa as credenciais dos
    marketplaces. Se não estiver no .env, gera uma e guarda em
    data/secret.key — assim ela sobrevive a reinícios (se mudasse, todas as
    credenciais salvas ficariam ilegíveis)."""
    chave = os.getenv("SECRET_KEY")
    if chave:
        return chave
    arquivo = DATA_DIR / "secret.key"
    if not arquivo.exists():
        arquivo.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    return arquivo.read_text(encoding="utf-8").strip()


SECRET_KEY = _chave_secreta()
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'replique.db').as_posix()}")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

# Anthropic (opcional): melhora título/descrição com IA.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

# Mercado Livre — credenciais do APLICATIVO (uma só para todo o Replique).
# Cada empresa cliente conecta a PRÓPRIA conta de vendedor via OAuth.
ML_CLIENT_ID = os.getenv("ML_CLIENT_ID", "")
ML_CLIENT_SECRET = os.getenv("ML_CLIENT_SECRET", "")
ML_REDIRECT_URI = os.getenv("ML_REDIRECT_URI", "https://oauth.pstmn.io/v1/callback")
ML_SITE_ID = os.getenv("ML_SITE_ID", "MLB")

# Shopee Open Platform (publicar) — credenciais do aplicativo parceiro.
SHOPEE_PARTNER_ID = os.getenv("SHOPEE_PARTNER_ID", "")
SHOPEE_PARTNER_KEY = os.getenv("SHOPEE_PARTNER_KEY", "")
SHOPEE_HOST = os.getenv("SHOPEE_HOST", "https://partner.shopeemobile.com")
SHOPEE_REDIRECT_URI = os.getenv("SHOPEE_REDIRECT_URI", "https://oauth.pstmn.io/v1/callback")

# Amazon SP-API — credenciais do aplicativo (Login with Amazon).
AMAZON_LWA_CLIENT_ID = os.getenv("AMAZON_LWA_CLIENT_ID", "")
AMAZON_LWA_CLIENT_SECRET = os.getenv("AMAZON_LWA_CLIENT_SECRET", "")
AMAZON_ENDPOINT = os.getenv("AMAZON_ENDPOINT", "https://sellingpartnerapi-na.amazon.com")
AMAZON_MARKETPLACE_ID = os.getenv("AMAZON_MARKETPLACE_ID", "A2Q3Y263D00KWC")  # Brasil

SESSION_HOURS = int(os.getenv("SESSION_HOURS", "72"))
