"""Auto-invasão do Replique: tenta entrar e abusar do sistema como um atacante faria,
e lista onde passou (FALHA) e onde foi barrado (ok). É defensivo — roda contra o
servidor de teste local, nunca contra o banco ou as contas reais.

Cada teste é uma pergunta: "consigo ver/alterar o que não é meu?". O objetivo da
skill é chegar a zero FALHA, corrigindo o código entre uma rodada e outra.

Uso (com o servidor de carga no ar e o banco semeado):
  .venv/Scripts/python scripts/skillteste/seguranca.py
  .venv/Scripts/python scripts/skillteste/seguranca.py --base http://127.0.0.1:8790
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

import httpx

PASTA = Path(tempfile.gettempdir()) / "replique-carga"


class Alvo:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.c = httpx.Client(base_url=self.base, timeout=60, follow_redirects=False)
        self.achados: list[dict] = []

    def entrar(self, email: str, senha: str) -> dict | None:
        r = self.c.post("/api/auth/login", json={"email": email, "senha": senha})
        if r.status_code == 200 and r.json().get("token"):
            tok = r.json()["token"]
            return {"email": email, "token": tok, "h": {"Authorization": f"Bearer {tok}", "X-Replique": "1"}}
        return None

    def achar(self, severidade: str, nome: str, passou: bool, detalhe: str = "") -> None:
        self.achados.append({"severidade": severidade, "nome": nome, "falha": passou, "detalhe": detalhe[:300]})
        marca = "FALHA" if passou else "ok"
        print(f"  [{marca}] {nome}" + (f" — {detalhe[:160]}" if detalhe and passou else ""))


def carregar_pessoas() -> list[dict]:
    try:
        return json.loads((PASTA / "pessoas.json").read_text())["pessoas"]
    except (FileNotFoundError, ValueError, KeyError):
        print("pessoas.json não encontrado. Rode o semear.py antes (ver a skill skillteste).")
        sys.exit(2)


def testar(base: str) -> list[dict]:
    a = Alvo(base)
    pessoas = carregar_pessoas()
    por_papel = {}
    for p in pessoas:
        por_papel.setdefault(p["papel"], p)
    sessoes = {papel: a.entrar(p["email"], p["senha"]) for papel, p in por_papel.items()}
    admin = sessoes.get("admin")
    cliente_pessoa = next((p for p in pessoas if p["papel"] == "cliente" and p.get("clientes")), None)
    cliente = a.entrar(cliente_pessoa["email"], cliente_pessoa["senha"]) if cliente_pessoa else None
    if not admin:
        print("Não consegui entrar como admin de teste. Rode o semear.py antes.")
        sys.exit(2)

    print("\n== Autenticação e sessão ==")
    r = a.c.get("/api/inicio")
    a.achar("alta", "Rota protegida sem token é barrada", r.status_code == 200, f"status {r.status_code}")
    r = a.c.get("/api/inicio", headers={"Authorization": "Bearer nao-vale-nada"})
    a.achar("alta", "Token inventado é barrado", r.status_code == 200, f"status {r.status_code}")
    adulterado = admin["token"][:-6] + ("aaaaaa" if not admin["token"].endswith("aaaaaa") else "bbbbbb")
    r = a.c.get("/api/inicio", headers={"Authorization": f"Bearer {adulterado}"})
    a.achar("alta", "Token com assinatura mexida é barrado", r.status_code == 200, f"status {r.status_code}")

    print("\n== CSRF (escrita por cookie sem o cabeçalho X-Replique) ==")
    if admin:
        jar = {"replique_sessao": admin["token"]}
        r = a.c.post("/api/clientes", json={"nome": "Via CSRF"}, cookies=jar)
        a.achar("alta", "Escrita por cookie sem X-Replique é barrada", r.status_code == 200, f"status {r.status_code}")

    print("\n== Acesso ao que é de outro (IDOR) ==")
    if cliente:
        # o lojista força o X-Cliente de outra loja: o servidor tem de devolver a loja dele,
        # nunca a de outro. Falha = aparece o id forçado na resposta.
        meu = cliente_pessoa["clientes"][0]
        outro = next((c for c in range(1, 60) if c != meu), meu)
        r = a.c.get(f"/api/financeiro/lucratividade?margem=15", headers={**cliente["h"], "X-Cliente": str(outro)})
        # a resposta não deve trazer dados ligados ao "outro"; confirmamos comparando com a loja do lojista
        meu_dados = a.c.get("/api/financeiro/lucratividade", headers={**cliente["h"], "X-Cliente": str(meu)})
        vazou = r.status_code == 200 and meu_dados.status_code == 200 and r.text != meu_dados.text
        a.achar("alta", "Lojista com X-Cliente forçado recebe a própria loja, não a de outro", vazou,
                f"status {r.status_code}")
        # /api/empresa/usuarios para lojista só pode devolver ele mesmo (não a lista da agência)
        r = a.c.get("/api/empresa/usuarios", headers=cliente["h"])
        emails = [u.get("email") for u in r.json()] if r.status_code == 200 and isinstance(r.json(), list) else []
        vazou = len(emails) > 1 or any(e and e != cliente["email"] for e in emails)
        a.achar("alta", "Lojista não lista os usuários da agência (só a si mesmo)", vazou,
                f"{len(emails)} usuário(s) visíveis")
    if sessoes.get("operador"):
        oper = sessoes["operador"]
        # operador tenta uma ação de admin
        r = a.c.post("/api/empresa/usuarios", headers=oper["h"],
                     json={"nome": "Intruso", "email": "intruso@x.test", "senha": "Senha-Forte-123", "papel": "admin", "clientes": []})
        a.achar("alta", "Operador não cria usuário admin", r.status_code == 200, f"status {r.status_code}")
        # operador abre um cliente que NÃO está atribuído a ele
        meus = set(por_papel["operador"].get("clientes") or [])
        alheio = next((c for c in range(1, 60) if c not in meus), None)
        if alheio is not None and meus:
            r = a.c.get("/api/financeiro/lucratividade", headers={**oper["h"], "X-Cliente": str(alheio)})
            a.achar("alta", "Operador não abre cliente que não é dele", r.status_code == 200, f"status {r.status_code}")

    print("\n== Travessia de diretório e SSRF em fotos ==")
    if admin:
        for alvo in ("/uploads/1/..%2f..%2f..%2fsecret.key", "/uploads/1/../../backend/security.py"):
            r = a.c.get(alvo)
            a.achar("alta", f"Arquivo do servidor por {alvo[:40]}", r.status_code == 200 and len(r.content) > 50,
                    f"status {r.status_code}")
        r = a.c.post("/api/anuncios", headers=admin["h"], json={"titulo": "x"})
        if r.status_code == 200:
            aid = r.json().get("id")
            r2 = a.c.put(f"/api/anuncios/{aid}", headers=admin["h"],
                         json={"fotos": ["http://169.254.169.254/latest/meta-data/"]})
            a.achar("alta", "Foto apontando para rede interna (SSRF) é recusada",
                    r2.status_code == 200 and "169.254" in r2.text, f"status {r2.status_code}")

    print("\n== Injeção e cabeçalhos ==")
    if admin:
        r = a.c.get("/api/anuncios?busca=' OR '1'='1", headers=admin["h"])
        a.achar("media", "Busca com aspas não quebra o servidor", r.status_code >= 500, f"status {r.status_code}")
        r = a.c.get("/api/inicio", headers=admin["h"])
        for cab in ("content-security-policy", "x-content-type-options", "x-frame-options"):
            a.achar("baixa", f"Cabeçalho de segurança {cab} presente", cab not in r.headers, "ausente")

    print("\n== Força bruta de senha ==")
    alvo = por_papel.get("operador") or pessoas[1]
    bloqueou = False
    for _ in range(25):
        r = a.c.post("/api/auth/login", json={"email": alvo["email"], "senha": "errada-de-proposito"})
        if r.status_code == 429:
            bloqueou = True
            break
    a.achar("media", "Muitas senhas erradas bloqueiam (rate limit)", not bloqueou,
            "não bloqueou após 25 tentativas" if not bloqueou else "")

    return a.achados


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8790")
    ap.add_argument("--json", default="")
    args = ap.parse_args()
    print(f"Auto-invasão contra {args.base}")
    achados = testar(args.base)
    falhas = [x for x in achados if x["falha"]]
    print("\n" + "=" * 50)
    if falhas:
        print(f"{len(falhas)} FALHA(S) encontradas — corrija e rode de novo:")
        for f in sorted(falhas, key=lambda x: {"alta": 0, "media": 1, "baixa": 2}[x["severidade"]]):
            print(f"  - [{f['severidade']}] {f['nome']}: {f['detalhe']}")
    else:
        print(f"Nenhuma falha: {len(achados)} testes, todos barrados como esperado.")
    if args.json:
        Path(args.json).write_text(json.dumps({"achados": achados, "falhas": len(falhas)}, indent=1, ensure_ascii=False),
                                   encoding="utf-8")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
