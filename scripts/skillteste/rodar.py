"""Orquestra o skillteste: carga com k6 (100 -> 1000 pessoas) e a auto-invasão.

Roda uma etapa de cada vez, para a skill arrumar o que aparecer e passar para a
próxima. O servidor de carga (scripts/carga/servidor.py) deve estar no ar em
127.0.0.1:8790, com o banco já semeado (scripts/carga/semear.py).

Uso (na raiz do projeto, com o servidor no ar):
  .venv/Scripts/python scripts/skillteste/rodar.py preparar        # semeia o banco de teste
  .venv/Scripts/python scripts/skillteste/rodar.py carga 100       # k6 com 100 pessoas
  .venv/Scripts/python scripts/skillteste/rodar.py carga 1000      # k6 com 1000 pessoas
  .venv/Scripts/python scripts/skillteste/rodar.py seguranca       # auto-invasão
  .venv/Scripts/python scripts/skillteste/rodar.py tudo            # todas em sequência
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
AQUI = Path(__file__).resolve().parent
CARGA = RAIZ / "scripts" / "carga"
PASTA = Path(tempfile.gettempdir()) / "replique-carga"
PESSOAS = PASTA / "pessoas.json"
DOCS = RAIZ / "docs"
BASE = "http://127.0.0.1:8790"
PY = sys.executable


def _no_ar() -> bool:
    import httpx
    try:
        return httpx.get(f"{BASE}/api/ping", timeout=3).status_code < 500
    except httpx.HTTPError:
        try:
            return httpx.get(BASE, timeout=3).status_code < 600
        except httpx.HTTPError:
            return False


def _exigir_servidor(espera_s: int = 60) -> None:
    """Logo depois de uma carga pesada o servidor ainda está drenando a fila e pode
    não responder a um ping de 3 s; isso não é queda. Espera ele voltar antes de
    desistir, para a próxima etapa (ex.: carga de 1000) não ser abortada à toa."""
    import time
    limite = time.monotonic() + espera_s
    while True:
        if _no_ar():
            return
        if time.monotonic() >= limite:
            break
        time.sleep(2)
    print(f"O servidor de carga não respondeu em {BASE} após {espera_s}s.\n"
          f"Abra outro terminal e rode:  {PY} scripts/carga/servidor.py --limpar")
    sys.exit(2)


def preparar() -> None:
    _exigir_servidor()
    if PESSOAS.exists():
        print(f"Banco de teste já semeado ({PESSOAS}). Apague a pasta {PASTA} para semear de novo.")
        return
    print("Semeando o banco de teste (40 clientes, 100 pessoas)...")
    subprocess.run([PY, str(CARGA / "semear.py")], check=True, cwd=RAIZ)


def carga(vus: int, dur: str = "3m") -> int:
    _exigir_servidor()
    if not PESSOAS.exists():
        preparar()
    DOCS.mkdir(exist_ok=True)
    saida = DOCS / f"skillteste-carga-{vus}.json"
    k6 = shutil.which("k6")
    if not k6:
        print("\nk6 não está instalado. Instale uma das formas:\n"
              "  winget install k6 --source winget\n"
              "  choco install k6\n"
              "  https://k6.io/docs/get-started/installation/\n"
              "Enquanto isso, caio no simulador em Python (scripts/carga/simular.py).")
        return _fallback_python(vus)
    print(f"\n=== Carga com k6: {vus} pessoas ===")
    r = subprocess.run([k6, "run", "-e", f"VUS={vus}", "-e", f"DUR={dur}", "-e", f"PESSOAS={PESSOAS}",
                        "-e", f"SAIDA={saida}", "-e", f"BASE={BASE}", str(AQUI / "carga.js")], cwd=RAIZ)
    print(f"Resumo salvo em {saida}" if saida.exists() else "k6 não gravou o resumo.")
    return r.returncode


def _fallback_python(vus: int) -> int:
    modo = "curto" if vus <= 100 else "completo"
    print(f"Simulador Python ({'~1,5 min' if modo == 'curto' else '~13 min'}); ele usa ~100 pessoas, não {vus}.")
    return subprocess.run([PY, str(CARGA / "simular.py")] + (["curto"] if modo == "curto" else []), cwd=RAIZ).returncode


def seguranca() -> int:
    _exigir_servidor()
    if not PESSOAS.exists():
        preparar()
    DOCS.mkdir(exist_ok=True)
    saida = DOCS / "skillteste-seguranca.json"
    print("\n=== Auto-invasão ===")
    r = subprocess.run([PY, str(AQUI / "seguranca.py"), "--base", BASE, "--json", str(saida)], cwd=RAIZ)
    return r.returncode


def tudo() -> int:
    preparar()
    for vus in (100, 1000):
        if carga(vus) != 0:
            print(f"\nA carga de {vus} teve problema (thresholds ou erros). Arrume e rode de novo esta etapa.")
    return seguranca()


def main() -> int:
    etapa = sys.argv[1] if len(sys.argv) > 1 else "tudo"
    if etapa == "preparar":
        preparar(); return 0
    if etapa == "carga":
        return carga(int(sys.argv[2]) if len(sys.argv) > 2 else 100)
    if etapa == "seguranca":
        return seguranca()
    if etapa == "tudo":
        return tudo()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
