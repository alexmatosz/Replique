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
