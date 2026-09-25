from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db():
    from app import models  # noqa: F401 — registra as tabelas
    Base.metadata.create_all(engine)
    _adicionar_colunas_novas()
    _migrar_para_multicliente()


def _adicionar_colunas_novas():
    """create_all não altera tabelas que já existem. Para não perder os dados
    de quem já usa o Replique, acrescenta colunas novas com ALTER TABLE.
    (Com PostgreSQL em produção, o ideal é migrar para Alembic.)"""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
        for tabela in Base.metadata.sorted_tables:
            if not insp.has_table(tabela.name):
                continue
            existentes = {c["name"] for c in insp.get_columns(tabela.name)}
            for coluna in tabela.columns:
                if coluna.name not in existentes:
                    tipo = coluna.type.compile(dialect=engine.dialect)
                    conn.execute(text(f'ALTER TABLE {tabela.name} ADD COLUMN "{coluna.name}" {tipo}'))


def _migrar_para_multicliente():
    """Bancos de antes dos clientes: tudo o que a empresa já tinha (contas
    conectadas, rascunhos, pesquisas, publicações) passa para um cliente
    "principal" com o nome da empresa. Idempotente: roda a cada início."""
    from sqlalchemy import update

    from app import models as m
    with SessionLocal() as db:
        # colunas booleanas novas chegam como NULL nas linhas antigas
        db.execute(update(m.Usuario).where(m.Usuario.ativo.is_(None)).values(ativo=True))
        tabelas = (m.Anuncio, m.Pesquisa, m.Publicacao, m.ContaMarketplace)
        for empresa in db.query(m.Empresa):
            orfas = any(db.query(t).filter(t.empresa_id == empresa.id, t.cliente_id.is_(None))
                        .filter(*([t.plataforma != "shopee_afiliados"] if t is m.ContaMarketplace else []))
                        .first() for t in tabelas)
            if not orfas:
                continue
            cliente = db.query(m.Cliente).filter_by(empresa_id=empresa.id).order_by(m.Cliente.id).first()
            if not cliente:
                cliente = m.Cliente(empresa_id=empresa.id, nome=empresa.nome)
                db.add(cliente)
                db.flush()
            for t in tabelas:
                filtro = [t.empresa_id == empresa.id, t.cliente_id.is_(None)]
                if t is m.ContaMarketplace:  # credencial da empresa inteira fica sem cliente
                    filtro.append(t.plataforma != "shopee_afiliados")
                db.execute(update(t).where(*filtro).values(cliente_id=cliente.id))
        db.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
