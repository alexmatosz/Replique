import ast
import inspect
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def test_conexoes_do_banco_cobrem_todas_as_threads_do_servidor():
    from backend.banco.db import engine
    assert engine.pool.size() + engine.pool._max_overflow >= 40


def test_sqlite_em_modo_wal_com_espera():
    from backend.banco.db import engine
    with engine.connect() as conexao:
        assert conexao.exec_driver_sql("PRAGMA journal_mode").scalar().lower() == "wal"
        assert conexao.exec_driver_sql("PRAGMA busy_timeout").scalar() >= 15000


def test_middleware_de_ferramentas_nao_consulta_o_banco_no_laco():
    from backend import main
    fonte = inspect.getsource(main.ferramentas_por_funcao)
    assert "run_in_threadpool(_ferramenta_bloqueada" in fonte


def test_rotas_async_nao_usam_o_banco_direto():
    """Rota async roda no laço do servidor: consulta ao banco ali trava todo mundo. O trabalho vai para run_in_threadpool."""
    problemas = []
    for arquivo in (RAIZ / "backend" / "api").glob("*.py"):
        arvore = ast.parse(arquivo.read_text(encoding="utf-8"))
        for no in ast.walk(arvore):
            if not isinstance(no, ast.AsyncFunctionDef):
                continue
            for filho in ast.walk(no):
                if (isinstance(filho, ast.Attribute) and isinstance(filho.value, ast.Name) and filho.value.id == "db"
                        and filho.attr in ("query", "get", "commit", "add", "execute", "scalar", "flush", "delete")):
                    problemas.append(f"{arquivo.name}:{filho.lineno} {no.name}")
    assert not problemas, problemas


def test_pyproject_lista_as_mesmas_dependencias_do_requirements():
    """A Vercel instala pelo pyproject.toml e ignora o requirements.txt (Render e Railway usam o requirements)."""
    import tomllib
    projeto = tomllib.loads((RAIZ / "pyproject.toml").read_text(encoding="utf-8"))
    requisitos = [l.strip() for l in (RAIZ / "requirements.txt").read_text(encoding="utf-8").splitlines()
                  if l.strip() and not l.startswith("#")]
    assert sorted(projeto["project"]["dependencies"]) == sorted(requisitos)
    assert projeto["tool"]["vercel"]["entrypoint"] == "backend.main:app"


def test_distinct_so_em_colunas_simples():
    """No PostgreSQL, DISTINCT numa tabela inteira falha quando ela tem colunas JSON (anúncios, por exemplo).
    O SQLite aceita, então os testes não pegariam: use DISTINCT só escolhendo colunas, como query(Venda.sku)."""
    import re
    problemas = []
    for arquivo in (RAIZ / "backend").rglob("*.py"):
        texto = arquivo.read_text(encoding="utf-8")
        for achado in re.finditer(r"\.distinct\(\)", texto):
            inicio = texto.rfind(".query(", 0, achado.start())
            alvo = re.match(r"\.query\(\s*([\w.]+)", texto[inicio:])
            if inicio < 0 or not alvo or "." not in alvo.group(1):
                problemas.append(f"{arquivo.name}:{texto.count(chr(10), 0, achado.start()) + 1}")
    assert not problemas, problemas


def test_testes_nunca_usam_o_email_de_verdade():
    from backend import config
    from backend.services import email
    assert not email.disponivel() and config.SMTP_SENHA == ""
