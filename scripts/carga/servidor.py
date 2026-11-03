"""Servidor do teste de carga: o Replique de verdade, com banco descartável na pasta
temporária do sistema, modo demonstração e um Mercado Livre falso com atraso de rede
para a Central de promoções. Nada vai para os marketplaces nem para o banco real.

Uso (na raiz do projeto): .venv/Scripts/python scripts/carga/servidor.py [--limpar]
"""

import json
import os
import random
import sys
import tempfile
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PASTA = Path(tempfile.gettempdir()) / "replique-carga"
DADOS = PASTA / "dados"
if "--limpar" in sys.argv and PASTA.exists():
    import shutil
    shutil.rmtree(PASTA)
DADOS.mkdir(parents=True, exist_ok=True)
os.environ.update({
    "DATABASE_URL": f"sqlite:///{(DADOS / 'carga.db').as_posix()}",
    "REPLIQUE_DATA_DIR": str(DADOS),
    "MODO_DEMONSTRACAO": "true", "AGENDADOR_ATIVO": "false", "PERMITIR_CADASTRO_AGENCIA": "true",
    "PROXY_MODO": "cloudflare", "PROXY_IPS": "127.0.0.1,::1", "VENDAS_LUCRO_PADRAO": "true", "LOTE_INTERVALO_S": "1",
    "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": "", "GEMINI_API_KEY": "", "IMAGENS_PROVEDOR": "",
    "ML_CLIENT_ID": "", "ML_CLIENT_SECRET": "", "SHOPEE_PARTNER_ID": "", "SHOPEE_PARTNER_KEY": "",
    "AMAZON_LWA_CLIENT_ID": "", "AMAZON_LWA_CLIENT_SECRET": "",
    "SMTP_HOST": "", "SMTP_USUARIO": "", "SMTP_SENHA": "", "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": "",
})
sys.path.insert(0, str(RAIZ))

import uvicorn  # noqa: E402

from backend.main import app  # noqa: E402
from backend.services import promocoes  # noqa: E402

ANUNCIOS_POR_CLIENTE = 250


def _rede():
    time.sleep(random.uniform(0.12, 0.35))


def _quando(dias: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=dias)).strftime("%Y-%m-%dT%H:%M:%SZ")


class MercadoLivreFalso:
    demo = False

    def __init__(self, cliente_id: int):
        self.cid = cliente_id
        self.ids = [f"MLB{cliente_id:03d}{i:05d}" for i in range(ANUNCIOS_POR_CLIENTE)]

    def ids_ativos(self, limite):
        _rede()
        return self.ids[:limite]

    def itens_resumidos(self, ids):
        _rede()
        saida = []
        for i in ids:
            n = int(i[-5:])
            preco = 40 + (n * 7) % 260
            saida.append({"id": i, "title": f"Produto {n} do cliente {self.cid}", "price": float(preco), "status": "active",
                          "original_price": None, "seller_custom_field": f"SKU-{self.cid}-{n}", "available_quantity": 10 + n % 50,
                          "category_id": "MLB1234", "listing_type_id": "gold_special",
                          "shipping": {"free_shipping": preco >= 79, "logistic_type": "drop_off"},
                          "permalink": f"https://produto.mercadolivre.com.br/{i}"})
        return saida

    def promocoes_do_vendedor(self):
        _rede()
        return [{"id": "P-DEAL", "type": "DEAL", "name": "Semana do Consumidor", "status": "started",
                 "finish_date": _quando(3), "deadline_date": _quando(2)},
                {"id": "P-SMART", "type": "SMART", "name": "Co-participação", "status": "started"},
                {"id": "P-RAIO", "type": "LIGHTNING", "name": "Relâmpago", "status": "pending"}]

    def itens_da_promocao(self, promocao_id, tipo, status="", limite=3000):
        _rede()
        if promocao_id == "P-DEAL":
            return [{"id": i, "status": "candidate", "original_price": 100, "min_discounted_price": 70,
                     "max_discounted_price": 95, "suggested_discounted_price": 85} for i in self.ids[::2]]
        if promocao_id == "P-SMART":
            return [{"id": i, "status": "candidate", "offer_id": f"OF-{i}", "price": 90, "original_price": 100,
                     "meli_percentage": 5, "seller_percentage": 5} for i in self.ids[1::3]]
        return [{"id": i, "status": "candidate", "price": 80, "original_price": 100} for i in self.ids[::5]]

    def promocoes_do_item(self, item_id):
        _rede()
        return []

    def _user_id(self):
        return str(900000 + self.cid)

    def tarifas_de_venda(self, preco, categoria=""):
        _rede()
        fixa = 0 if preco >= 79 else 6.75
        return {"gold_special": {"sale_fee_amount": preco * 0.14 + fixa, "sale_fee_details": {"percentage_fee": 14, "fixed_fee": fixa}},
                "gold_pro": {"sale_fee_amount": preco * 0.19 + fixa, "sale_fee_details": {"percentage_fee": 19, "fixed_fee": fixa}}}

    def frete_do_anuncio(self, vendedor_id, item_id, preco=None):
        _rede()
        return {"custo": 18.5, "peso_g": 600}

    def entrar_na_promocao(self, item_id, corpo):
        _rede()
        return {}


promocoes.obter_adaptador = lambda db, cliente_id, *a, **k: (MercadoLivreFalso(cliente_id), "")


def _retratos():
    """A cada 20 s grava o que cada thread está fazendo: se o servidor travar, mostra onde."""
    while True:
        time.sleep(20)
        nomes = {t.ident: t.name for t in threading.enumerate()}
        linhas = [f"=== {time.strftime('%H:%M:%S')}"]
        for ident, quadro in sys._current_frames().items():
            pilha = [f"{Path(f.filename).name}:{f.lineno} {f.name}" for f in traceback.extract_stack(quadro)
                     if any(p in f.filename for p in ("Monvatti", "sqlalchemy", "anyio", "asyncio"))][-6:]
            linhas.append(f"[{nomes.get(ident, ident)}] " + " <- ".join(reversed(pilha)))
        (PASTA / "retratos.txt").write_text("\n".join(linhas), encoding="utf-8")


def _cpu():
    anterior, momento = time.process_time(), time.time()
    with open(PASTA / "cpu.jsonl", "w", encoding="utf-8") as saida:
        while True:
            time.sleep(5)
            agora_cpu, agora = time.process_time(), time.time()
            saida.write(json.dumps({"t": round(agora), "cpu_pct": round(100 * (agora_cpu - anterior) / (agora - momento)),
                                    "threads": threading.active_count()}) + "\n")
            saida.flush()
            anterior, momento = agora_cpu, agora


threading.Thread(target=_retratos, daemon=True).start()
threading.Thread(target=_cpu, daemon=True).start()
print(f"Banco descartável em {DADOS}", flush=True)
uvicorn.run(app, host="127.0.0.1", port=8790, log_level="warning", server_header=False)
