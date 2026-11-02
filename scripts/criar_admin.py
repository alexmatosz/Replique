"""Cria o primeiro administrador (e a agência) direto no servidor.

Use ao hospedar o Replique: a tela de cadastro da agência fica fechada pela
internet para ninguém se adiantar e virar o administrador.

    python criar_admin.py
"""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal, init_db  # noqa: E402
from app.models import Empresa, Usuario  # noqa: E402
from app.security import hash_senha, senha_fraca  # noqa: E402


def perguntar(rotulo: str, minimo: int = 2) -> str:
    while True:
        valor = input(f"{rotulo}: ").strip()
        if len(valor) >= minimo:
            return valor
        print(f"  Informe pelo menos {minimo} caracteres.")


def main():
    init_db()
    with SessionLocal() as db:
        empresas = db.query(Empresa).order_by(Empresa.id).all()
        if empresas:
            print("Agências existentes:")
            for e in empresas:
                print(f"  {e.id} = {e.nome}")
            escolha = input("Número da agência para o novo admin (Enter = criar agência nova): ").strip()
            empresa = next((e for e in empresas if str(e.id) == escolha), None) if escolha else None
        else:
            empresa = None
        if empresa is None:
            empresa = Empresa(nome=perguntar("Nome da agência"))
            db.add(empresa)
            db.flush()
        nome = perguntar("Seu nome")
        email = perguntar("E-mail", 5).lower()
        if "@" not in email or db.query(Usuario).filter_by(email=email).first():
            sys.exit("E-mail inválido ou já cadastrado.")
        while True:
            senha = getpass.getpass("Senha (mín. 8, não aparece ao digitar): ")
            if len(senha) < 8 or senha_fraca(senha):
                print("  Senha curta ou comum demais. Misture palavras, números ou símbolos.")
                continue
            if getpass.getpass("Repita a senha: ") == senha:
                break
            print("  As senhas não conferem.")
        db.add(Usuario(empresa_id=empresa.id, nome=nome, email=email, senha_hash=hash_senha(senha), papel="admin"))
        db.commit()
        print(f"\nAdministrador {email} criado na agência “{empresa.nome}”. Já pode entrar pela tela.")


if __name__ == "__main__":
    main()
