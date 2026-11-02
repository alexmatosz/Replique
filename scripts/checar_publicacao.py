"""Confere se é seguro colocar o Replique na internet (usado por publicar-teste.bat).

Bloqueia a publicação se alguma conta ativa usa senha padrão/óbvia: pela
internet, é a primeira coisa que um invasor tenta.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.banco.db import SessionLocal, init_db  # noqa: E402
from backend.banco.models import Usuario  # noqa: E402
from backend.security import SENHAS_FRACAS, conferir_senha  # noqa: E402

init_db()
with SessionLocal() as db:
    fracas = [u for u in db.query(Usuario).filter(Usuario.ativo.is_(True))
              if any(conferir_senha(s, u.senha_hash) for s in SENHAS_FRACAS)]
if fracas:
    print("\n  NAO PUBLICADO: estas contas usam senha padrao ou muito comum:")
    for u in fracas:
        print(f"   - {u.email} ({u.papel})")
    print("\n  Abra o Replique neste computador (iniciar.bat), clique no seu avatar no topo")
    print("  e troque a senha. Depois rode publicar-teste.bat de novo.\n")
    sys.exit(1)
print("  Senhas conferidas: nenhuma conta com senha padrao.")
