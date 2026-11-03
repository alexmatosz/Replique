"""Mede cada tela pesada sozinha (sem concorrência): tempo, número de consultas ao banco
e tamanho da resposta. Roda numa cópia do banco do teste de carga.

Uso, depois do semear.py (com o servidor.py parado): .venv/Scripts/python scripts/carga/perfil.py
"""

import json
import os
import shutil
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

PASTA = Path(tempfile.gettempdir()) / "replique-carga"
COPIA = PASTA / "dados-perfil"
if COPIA.exists():
    shutil.rmtree(COPIA)
COPIA.mkdir()
for _f in (PASTA / "dados").glob("carga.db*"):
    shutil.copy(_f, COPIA / _f.name)
shutil.copy(PASTA / "dados" / "secret.key", COPIA / "secret.key")
os.environ.update({"DATABASE_URL": f"sqlite:///{(COPIA / 'carga.db').as_posix()}", "REPLIQUE_DATA_DIR": str(COPIA),
                   "MODO_DEMONSTRACAO": "true", "AGENDADOR_ATIVO": "false", "PROXY_MODO": "cloudflare",
                   "ANTHROPIC_API_KEY": "", "ML_CLIENT_ID": "", "ML_CLIENT_SECRET": "", "SMTP_HOST": ""})
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

from backend.banco.db import engine  # noqa: E402
from backend.main import app  # noqa: E402

consultas = {"n": 0, "linhas": 0}


@event.listens_for(engine, "after_cursor_execute")
def _conta(conn, cursor, stmt, params, context, executemany):
    consultas["n"] += 1


dados = json.load(open(PASTA / "pessoas.json"))
mes = date.today().strftime("%Y-%m")
c = TestClient(app)


def entrar(papel):
    p = next(x for x in dados["pessoas"] if x["papel"] == papel)
    r = c.post("/api/auth/login", json={"email": p["email"], "senha": p["senha"]}, headers={"cf-connecting-ip": "10.9.9.9"})
    return {"Authorization": "Bearer " + r.json()["token"]}, p


adm, _ = entrar("admin")
cons, pc = entrar("consultor")
loja, pl = entrar("cliente")
cid = dados["clientes"][0]
casos = [
    ("admin", adm, "/api/painel"), ("admin", adm, "/api/atividades"), ("admin", adm, "/api/promocoes/geral"),
    ("admin", adm, f"/api/faturamento-geral?mes={mes}"), ("admin", adm, "/api/saude"), ("admin", adm, "/api/visao-geral"),
    ("admin", {**adm, "X-Cliente": str(cid)}, f"/api/financeiro/gestao?mes={mes}"),
    ("admin", {**adm, "X-Cliente": str(cid)}, f"/api/financeiro/lucro?mes={mes}"),
    ("admin", {**adm, "X-Cliente": str(cid)}, f"/api/financeiro/dre?mes={mes}&meses=3"),
    ("admin", {**adm, "X-Cliente": str(cid)}, "/api/financeiro/lucratividade?margem=15"),
    ("admin", {**adm, "X-Cliente": str(cid)}, f"/api/financeiro/analise?mes={mes}"),
    ("admin", {**adm, "X-Cliente": str(cid)}, "/api/promocoes"),
    ("admin", {**adm, "X-Cliente": str(cid)}, "/api/anuncios"),
    ("admin", {**adm, "X-Cliente": str(cid)}, "/api/publicacoes"),
    ("admin", {**adm, "X-Cliente": str(cid)}, "/api/pedidos"),
    ("consultor", {**cons, "X-Cliente": str(pc["clientes"][0])}, f"/api/analise/carteira?mes={mes}"),
    ("consultor", cons, "/api/acompanhamento/geral"),
    ("cliente", loja, "/api/acompanhamento/geral"), ("cliente", loja, "/api/aprovacoes"),
    ("cliente", loja, f"/api/financeiro/dre?mes={mes}&meses=3"), ("cliente", loja, "/api/financeiro/lucratividade?margem=15"),
    ("cliente", loja, "/api/notificacoes"),
]
print(f"{'papel':10} {'rota':52} {'status':>6} {'ms':>8} {'consultas':>9} {'KB':>8}")
for papel, h, url in casos:
    tempos = []
    for _ in range(3):
        consultas["n"] = 0
        t = time.perf_counter()
        r = c.get(url, headers={**h, "cf-connecting-ip": "10.9.9.9"})
        tempos.append((time.perf_counter() - t) * 1000)
    print(f"{papel:10} {url[:52]:52} {r.status_code:6} {min(tempos):8.0f} {consultas['n']:9} {len(r.content) / 1024:8.1f}")
