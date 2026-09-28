"""Configurações do Replique, lidas do arquivo .env (veja .env.example)."""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# REPLIQUE_DATA_DIR: outra pasta de dados (os testes usam uma temporária)
DATA_DIR = Path(os.getenv("REPLIQUE_DATA_DIR") or BASE_DIR / "data")
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

# Segurança
# Criar uma AGÊNCIA nova pela tela: desligado por padrão (só vale no primeiro uso,
# com o banco vazio). Lojistas entram pelo link de cadastro da agência.
PERMITIR_CADASTRO_AGENCIA = os.getenv("PERMITIR_CADASTRO_AGENCIA", "false").lower() == "true"
# Documentação automática da API (/docs): só para desenvolvimento.
HABILITAR_DOCS = os.getenv("HABILITAR_DOCS", "false").lower() == "true"

# Publicação em massa (travas para não arriscar a conta do cliente no marketplace)
LOTE_MAX_ANUNCIOS = int(os.getenv("LOTE_MAX_ANUNCIOS", "20"))          # rascunhos por lote
LOTE_INTERVALO_S = float(os.getenv("LOTE_INTERVALO_S", "20"))          # segundos entre publicações reais
LIMITE_DIARIO_POR_CONTA = int(os.getenv("LIMITE_DIARIO_POR_CONTA", "50"))  # publicações reais/24h por conta
LOTE_PARAR_APOS_FALHAS = int(os.getenv("LOTE_PARAR_APOS_FALHAS", "3"))  # falhas seguidas que param o lote
FILA_ATIVA = os.getenv("FILA_ATIVA", "true").lower() == "true"         # worker que processa os lotes

# ---------------------------------------------------------------- proxy / IP real
# Como descobrir o IP de quem acessa (conta para limite de tentativas e para a
# regra "senha fraca não entra pela internet"). Os cabeçalhos só são lidos
# quando a conexão vem de um endereço em PROXY_IPS; de qualquer outro lugar
# são ignorados, para ninguém forjar o próprio IP.
# - cloudflare: Cloudflare Tunnel/Cloudflare na frente (usa CF-Connecting-IP);
# - xff: proxy reverso comum (Nginx, Render, Railway): usa o último IP do
#   X-Forwarded-For que não seja um proxy de PROXY_IPS;
# - nenhum: ignora cabeçalhos (servidor exposto direto).
PROXY_MODO = os.getenv("PROXY_MODO", "cloudflare").strip().lower()
PROXY_IPS = [p.strip() for p in os.getenv("PROXY_IPS", "127.0.0.1,::1").split(",") if p.strip()]
# Tamanho máximo de uma requisição (uploads incluídos)
MAX_REQUISICAO_MB = float(os.getenv("MAX_REQUISICAO_MB", "15"))

# ---------------------------------------------------------------- limites de uso por usuário (por hora)
LIMITE_IA_HORA = int(os.getenv("LIMITE_IA_HORA", "40"))
LIMITE_PESQUISAS_HORA = int(os.getenv("LIMITE_PESQUISAS_HORA", "80"))
LIMITE_FOTOS_IA_HORA = int(os.getenv("LIMITE_FOTOS_IA_HORA", "12"))
LIMITE_UPLOADS_HORA = int(os.getenv("LIMITE_UPLOADS_HORA", "300"))

# ---------------------------------------------------------------- gerador de fotos com IA (opcional)
# openai (gpt-image) ou gemini. Vazio = escolhe pela chave que estiver preenchida.
IMAGENS_PROVEDOR = os.getenv("IMAGENS_PROVEDOR", "").strip().lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

# ---------------------------------------------------------------- margem e radar de preço
# Tarifas usadas quando a plataforma não informa a tarifa pela API (confira as
# da sua categoria: mudam com frequência).
SHOPEE_COMISSAO_PCT = float(os.getenv("SHOPEE_COMISSAO_PCT", "20"))
SHOPEE_TAXA_FIXA = float(os.getenv("SHOPEE_TAXA_FIXA", "4"))
AMAZON_COMISSAO_PCT = float(os.getenv("AMAZON_COMISSAO_PCT", "13"))
ML_COMISSAO_PCT_PADRAO = float(os.getenv("ML_COMISSAO_PCT_PADRAO", "16"))
IMPOSTO_PCT_PADRAO = float(os.getenv("IMPOSTO_PCT_PADRAO", "6"))
MARGEM_MINIMA_PCT = float(os.getenv("MARGEM_MINIMA_PCT", "10"))

# Marcas com programa de proteção (anúncio sem autorização costuma ser denunciado).
MARCAS_PROTEGIDAS = {m.strip().lower() for m in os.getenv(
    "MARCAS_PROTEGIDAS",
    "apple,samsung,xiaomi,motorola,lg,sony,jbl,nike,adidas,puma,lacoste,tommy hilfiger,calvin klein,ray-ban,"
    "oakley,disney,marvel,lego,mattel,hasbro,stanley,tupperware,bosch,makita,dewalt,philips,electrolux,"
    "nintendo,playstation,xbox,havaianas,natura,o boticario,boticario,mac,loreal,l'oreal,chanel,dior").split(",")
    if m.strip()}

# ---------------------------------------------------------------- entrar com Google (opcional)
# Google Cloud Console › APIs e serviços › Credenciais › ID do cliente OAuth (Aplicativo da Web).
# URI de redirecionamento autorizado: {PUBLIC_BASE_URL}/api/auth/google/callback
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", f"{PUBLIC_BASE_URL}/api/auth/google/callback").strip()

# ---------------------------------------------------------------- envio de e-mail (convites da equipe)
# Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORTA=587, usuário = o e-mail e senha = "senha de app"
# (Conta Google › Segurança › Senhas de app). Sem SMTP, o Replique mostra o link para copiar.
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORTA = int(os.getenv("SMTP_PORTA", "587"))
SMTP_USUARIO = os.getenv("SMTP_USUARIO", "").strip()
SMTP_SENHA = os.getenv("SMTP_SENHA", "")
SMTP_REMETENTE = os.getenv("SMTP_REMETENTE", "").strip() or SMTP_USUARIO
CONVITE_DIAS = int(os.getenv("CONVITE_DIAS", "7"))
