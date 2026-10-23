"""Configurações do Replique, lidas do arquivo .env."""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

NO_VERCEL = bool(os.getenv("VERCEL"))
DATA_DIR = Path(os.getenv("REPLIQUE_DATA_DIR") or (Path("/tmp/replique") if NO_VERCEL else BASE_DIR / "data"))
UPLOADS_DIR = DATA_DIR / "uploads"
FOTOS_NO_BANCO = os.getenv("FOTOS_NO_BANCO", "1" if NO_VERCEL else "0") == "1"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


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
DATABASE_URL = (os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
                or f"sqlite:///{(DATA_DIR / 'replique.db').as_posix()}")
for _prefixo in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(_prefixo):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(_prefixo):]
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

ML_CLIENT_ID = os.getenv("ML_CLIENT_ID", "")
ML_CLIENT_SECRET = os.getenv("ML_CLIENT_SECRET", "")
ML_REDIRECT_URI = os.getenv("ML_REDIRECT_URI", "https://oauth.pstmn.io/v1/callback")
ML_SITE_ID = os.getenv("ML_SITE_ID", "MLB")
CACHE_ML = os.getenv("CACHE_ML", "true").lower() == "true"

SHOPEE_PARTNER_ID = os.getenv("SHOPEE_PARTNER_ID", "")
SHOPEE_PARTNER_KEY = os.getenv("SHOPEE_PARTNER_KEY", "")
SHOPEE_HOST = os.getenv("SHOPEE_HOST", "https://partner.shopeemobile.com")
SHOPEE_REDIRECT_URI = os.getenv("SHOPEE_REDIRECT_URI", f"{PUBLIC_BASE_URL}/api/contas/shopee/callback").strip()

AMAZON_LWA_CLIENT_ID = os.getenv("AMAZON_LWA_CLIENT_ID", "")
AMAZON_LWA_CLIENT_SECRET = os.getenv("AMAZON_LWA_CLIENT_SECRET", "")
AMAZON_ENDPOINT = os.getenv("AMAZON_ENDPOINT", "https://sellingpartnerapi-na.amazon.com")
AMAZON_MARKETPLACE_ID = os.getenv("AMAZON_MARKETPLACE_ID", "A2Q3Y263D00KWC")

SESSION_HOURS = int(os.getenv("SESSION_HOURS", "72"))

PERMITIR_CADASTRO_AGENCIA = os.getenv("PERMITIR_CADASTRO_AGENCIA", "false").lower() == "true"
HABILITAR_DOCS = os.getenv("HABILITAR_DOCS", "false").lower() == "true"

LOTE_MAX_ANUNCIOS = int(os.getenv("LOTE_MAX_ANUNCIOS", "20"))
LOTE_INTERVALO_S = float(os.getenv("LOTE_INTERVALO_S", "20"))
LIMITE_DIARIO_POR_CONTA = int(os.getenv("LIMITE_DIARIO_POR_CONTA", "50"))
LOTE_PARAR_APOS_FALHAS = int(os.getenv("LOTE_PARAR_APOS_FALHAS", "3"))
FILA_ATIVA = os.getenv("FILA_ATIVA", "true").lower() == "true"
MODO_DEMONSTRACAO = os.getenv("MODO_DEMONSTRACAO", "false").lower() == "true"

PROXY_MODO = os.getenv("PROXY_MODO", "cloudflare").strip().lower()
PROXY_IPS = [p.strip() for p in os.getenv("PROXY_IPS", "127.0.0.1,::1").split(",") if p.strip()]
MAX_REQUISICAO_MB = float(os.getenv("MAX_REQUISICAO_MB", "15"))

LIMITE_IA_HORA = int(os.getenv("LIMITE_IA_HORA", "40"))
LIMITE_PESQUISAS_HORA = int(os.getenv("LIMITE_PESQUISAS_HORA", "80"))
LIMITE_FOTOS_IA_HORA = int(os.getenv("LIMITE_FOTOS_IA_HORA", "12"))
LIMITE_UPLOADS_HORA = int(os.getenv("LIMITE_UPLOADS_HORA", "300"))

IMAGENS_PROVEDOR = os.getenv("IMAGENS_PROVEDOR", "").strip().lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

SHOPEE_COMISSAO_PCT = float(os.getenv("SHOPEE_COMISSAO_PCT", "20"))
SHOPEE_TAXA_FIXA = float(os.getenv("SHOPEE_TAXA_FIXA", "4"))
AMAZON_COMISSAO_PCT = float(os.getenv("AMAZON_COMISSAO_PCT", "13"))
ML_COMISSAO_PCT_PADRAO = float(os.getenv("ML_COMISSAO_PCT_PADRAO", "16"))
IMPOSTO_PCT_PADRAO = float(os.getenv("IMPOSTO_PCT_PADRAO", "6"))
MARGEM_MINIMA_PCT = float(os.getenv("MARGEM_MINIMA_PCT", "10"))

MARCAS_PROTEGIDAS = {m.strip().lower() for m in os.getenv(
    "MARCAS_PROTEGIDAS",
    "apple,samsung,xiaomi,motorola,lg,sony,jbl,nike,adidas,puma,lacoste,tommy hilfiger,calvin klein,ray-ban,"
    "oakley,disney,marvel,lego,mattel,hasbro,stanley,tupperware,bosch,makita,dewalt,philips,electrolux,"
    "nintendo,playstation,xbox,havaianas,natura,o boticario,boticario,mac,loreal,l'oreal,chanel,dior").split(",")
    if m.strip()}

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", f"{PUBLIC_BASE_URL}/api/auth/google/callback").strip()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORTA = int(os.getenv("SMTP_PORTA", "587"))
SMTP_USUARIO = os.getenv("SMTP_USUARIO", "").strip()
SMTP_SENHA = os.getenv("SMTP_SENHA", "")
SMTP_REMETENTE = os.getenv("SMTP_REMETENTE", "").strip() or SMTP_USUARIO
CONVITE_DIAS = int(os.getenv("CONVITE_DIAS", "7"))
