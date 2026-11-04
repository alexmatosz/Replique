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
DB_POOL = int(os.getenv("DB_POOL", "20"))
DB_POOL_EXTRA = int(os.getenv("DB_POOL_EXTRA", "40"))
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5-5")
ANTHROPIC_MODEL_TEXTO = os.getenv("ANTHROPIC_MODEL_TEXTO", "claude-haiku-5-5")
IA_LIMITE_CHAMADAS_MES = int(os.getenv("IA_LIMITE_CHAMADAS_MES", "300"))
IA_LIMITE_IMAGENS_MES = int(os.getenv("IA_LIMITE_IMAGENS_MES", "60"))
IA_AVISO_PCT = int(os.getenv("IA_AVISO_PCT", "80"))

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
SESSAO_INATIVIDADE_MIN = int(os.getenv("SESSAO_INATIVIDADE_MIN", "120"))

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
REDEFINIR_SENHA_MIN = int(os.getenv("REDEFINIR_SENHA_MIN", "60"))

TERMOS_VERSAO = os.getenv("TERMOS_VERSAO", "2026-10").strip()
CONTROLADOR_NOME = os.getenv("CONTROLADOR_NOME", "Monvatti").strip()
CONTROLADOR_DOCUMENTO = os.getenv("CONTROLADOR_DOCUMENTO", "").strip()
ENCARREGADO_NOME = os.getenv("ENCARREGADO_NOME", "").strip()
ENCARREGADO_EMAIL = os.getenv("ENCARREGADO_EMAIL", "").strip()
PRAZO_TITULAR_DIAS = int(os.getenv("PRAZO_TITULAR_DIAS", "15"))

PEDIDO_PARADO_DIAS = int(os.getenv("PEDIDO_PARADO_DIAS", "3"))
VENDAS_LUCRO_PADRAO = os.getenv("VENDAS_LUCRO_PADRAO", "false").lower() == "true"

CACHE_LEITURA_S = float(os.getenv("CACHE_LEITURA_S", "30"))
CACHE_LEITURA_MAX = int(os.getenv("CACHE_LEITURA_MAX", "5000"))
RESUMO_ESPERA_S = float(os.getenv("RESUMO_ESPERA_S", "30"))
CARTEIRA_PARALELA = int(os.getenv("CARTEIRA_PARALELA", "4"))
LATENCIA_LIMITE_S = float(os.getenv("LATENCIA_LIMITE_S", "2"))
LATENCIA_MAX_EVENTOS = int(os.getenv("LATENCIA_MAX_EVENTOS", "2000"))
LATENCIA_RELATORIO_HORA = int(os.getenv("LATENCIA_RELATORIO_HORA", "23"))
ALERTA_EMAIL = os.getenv("ALERTA_EMAIL", "").strip()
ALERTA_WHATSAPP_WEBHOOK = os.getenv("ALERTA_WHATSAPP_WEBHOOK", "").strip()
ALERTA_WHATSAPP_DESTINO = os.getenv("ALERTA_WHATSAPP_DESTINO", "").strip()

AGENDADOR_ATIVO = os.getenv("AGENDADOR_ATIVO", "false" if NO_VERCEL else "true").lower() == "true"
AGENDADOR_NO_PING = os.getenv("AGENDADOR_NO_PING", "true").lower() == "true"
AGENDADOR_CICLO_S = int(os.getenv("AGENDADOR_CICLO_S", "60"))
AGENDADOR_MAX_CLIENTES = int(os.getenv("AGENDADOR_MAX_CLIENTES", "200"))
AGENDADOR_MAX_ITENS = int(os.getenv("AGENDADOR_MAX_ITENS", "30"))
AGENDADOR_LEITURAS_HORA = int(os.getenv("AGENDADOR_LEITURAS_HORA", os.getenv("LIMITE_PESQUISAS_HORA", "80")))
AGENDA_PERGUNTAS_MIN = int(os.getenv("AGENDA_PERGUNTAS_MIN", "10"))
AGENDA_RADAR_MIN = int(os.getenv("AGENDA_RADAR_MIN", "30"))
AGENDA_CONCORRENTES_MIN = int(os.getenv("AGENDA_CONCORRENTES_MIN", "25"))
AGENDA_VENDAS_MIN = int(os.getenv("AGENDA_VENDAS_MIN", "60"))
AGENDA_SAUDE_MIN = int(os.getenv("AGENDA_SAUDE_MIN", "120"))
AGENDA_PEDIDOS_MIN = int(os.getenv("AGENDA_PEDIDOS_MIN", "60"))
AGENDA_PROMOCOES_MIN = int(os.getenv("AGENDA_PROMOCOES_MIN", "30"))
PROMOCOES_IDADE_MIN = int(os.getenv("PROMOCOES_IDADE_MIN", "360"))
PROMOCOES_CLIENTES_POR_CICLO = int(os.getenv("PROMOCOES_CLIENTES_POR_CICLO", "2" if NO_VERCEL else "10"))
PROMOCOES_MAX_ANUNCIOS = int(os.getenv("PROMOCOES_MAX_ANUNCIOS", "3000"))
PROMOCOES_MAX_CONSULTAS = int(os.getenv("PROMOCOES_MAX_CONSULTAS", "200"))
PROMOCOES_PAUSA_S = float(os.getenv("PROMOCOES_PAUSA_S", "0.4"))
AGENDA_MADRUGADA_HORA = int(os.getenv("AGENDA_MADRUGADA_HORA", "3"))
AGENDA_FULL_HORA = int(os.getenv("AGENDA_FULL_HORA", "6"))
AGENDA_RELATORIO_HORA = int(os.getenv("AGENDA_RELATORIO_HORA", "7"))
FULL_DIAS_ALERTA = int(os.getenv("FULL_DIAS_ALERTA", "60"))
