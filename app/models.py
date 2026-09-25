"""Tabelas do Replique.

Multiempresa e multicliente:
- Empresa: quem opera o Replique (ex.: a Monvatti). Isola tudo entre empresas.
- Cliente: cada loja atendida pela empresa. Tem as próprias contas de
  marketplace, rascunhos, pesquisas e publicações.
- Usuário: admin (vê e administra tudo da empresa), operador (trabalha só nos
  clientes atribuídos a ele) ou cliente (login do lojista: conecta as contas e
  acompanha o trabalho, sem editar).
- Atividade: registro de quem fez o quê, para qual cliente e quando.
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def agora():
    return datetime.now(timezone.utc)


class Empresa(Base):
    __tablename__ = "empresas"
    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(200))
    plano: Mapped[str] = mapped_column(String(40), default="trial")
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)
    # Hash da chave usada pelo servidor MCP (a chave em si só é mostrada uma vez).
    api_key_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    # link de cadastro que a empresa envia aos lojistas (o cliente se cadastra dentro dela)
    convite_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)

    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="empresa")


class Cliente(Base):
    __tablename__ = "clientes"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    nome: Mapped[str] = mapped_column(String(200))
    documento: Mapped[str] = mapped_column(String(30), default="")  # CNPJ/CPF, opcional
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    # "admin" (cadastrado pela equipe) ou "convite" (o próprio lojista, pelo link de cadastro)
    origem: Mapped[str] = mapped_column(String(20), default="admin")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    nome: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    senha_hash: Mapped[str] = mapped_column(String(300))
    papel: Mapped[str] = mapped_column(String(20), default="admin")  # admin | operador | cliente
    # só para papel "cliente": a loja a que o login pertence
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)

    empresa: Mapped[Empresa] = relationship(back_populates="usuarios")


class AcessoCliente(Base):
    """Quais clientes cada operador atende (admins atendem todos)."""
    __tablename__ = "acessos_cliente"
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), primary_key=True, index=True)


class ContaMarketplace(Base):
    """Conta de vendedor de um cliente em um marketplace. As credenciais
    (tokens) ficam criptografadas em `credenciais_cript`. cliente_id vazio =
    credencial da empresa inteira (ex.: API de Afiliados da Shopee)."""
    __tablename__ = "contas_marketplace"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    conectada_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    plataforma: Mapped[str] = mapped_column(String(30))  # mercadolivre | shopee | amazon | shopee_afiliados
    apelido: Mapped[str] = mapped_column(String(200), default="")
    id_externo: Mapped[str] = mapped_column(String(100), default="")  # user_id ML / shop_id / seller_id
    credenciais_cript: Mapped[str] = mapped_column(Text, default="")
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Pesquisa(Base):
    __tablename__ = "pesquisas"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    termo: Mapped[str] = mapped_column(String(300))
    plataformas: Mapped[list] = mapped_column(JSON, default=list)
    resultados: Mapped[list] = mapped_column(JSON, default=list)
    avisos: Mapped[list] = mapped_column(JSON, default=list)
    # Informações extras por plataforma (ex.: categorias do ML usadas/sugeridas)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Anuncio(Base):
    """Rascunho de anúncio dentro do Replique (copiado de um concorrente ou
    criado do zero). É o que o usuário edita antes de publicar."""
    __tablename__ = "anuncios"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    criado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    atualizado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="rascunho")  # rascunho | publicado | parcial | erro
    titulo: Mapped[str] = mapped_column(String(300), default="")
    descricao: Mapped[str] = mapped_column(Text, default="")
    preco: Mapped[float] = mapped_column(Float, default=0)
    estoque: Mapped[int] = mapped_column(Integer, default=1)
    condicao: Mapped[str] = mapped_column(String(10), default="new")
    marca: Mapped[str] = mapped_column(String(120), default="")
    modelo: Mapped[str] = mapped_column(String(120), default="")
    gtin: Mapped[str] = mapped_column(String(40), default="")
    sku: Mapped[str] = mapped_column(String(80), default="")
    peso_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    dimensoes_cm: Mapped[dict] = mapped_column(JSON, default=dict)  # {comprimento, largura, altura}
    fotos: Mapped[list] = mapped_column(JSON, default=list)  # URLs (externas ou /uploads/...)
    atributos: Mapped[dict] = mapped_column(JSON, default=dict)  # {"COR": "Preto", ...}
    # Dados específicos por plataforma (categoria escolhida, ASIN, etc.)
    por_plataforma: Mapped[dict] = mapped_column(JSON, default=dict)
    # De onde veio a cópia (plataforma, id, link, métricas no momento da cópia)
    origem: Mapped[dict] = mapped_column(JSON, default=dict)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)
    # exclusão lógica: some das telas, mas o histórico de publicações e atividades continua
    excluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Publicacao(Base):
    __tablename__ = "publicacoes"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, index=True)
    # conta do marketplace usada (apelido e ID no momento da publicação), para auditoria
    conta_apelido: Mapped[str] = mapped_column(String(200), default="")
    conta_id_externo: Mapped[str] = mapped_column(String(100), default="")
    anuncio_id: Mapped[int] = mapped_column(ForeignKey("anuncios.id"), index=True)
    plataforma: Mapped[str] = mapped_column(String(30))
    sucesso: Mapped[bool] = mapped_column(Boolean, default=False)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    id_externo: Mapped[str] = mapped_column(String(100), default="")
    link: Mapped[str] = mapped_column(String(500), default="")
    mensagem: Mapped[str] = mapped_column(Text, default="")
    detalhes: Mapped[dict] = mapped_column(JSON, default=dict)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Atividade(Base):
    """Linha do tempo de auditoria: quem fez o quê, para qual cliente e quando."""
    __tablename__ = "atividades"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, index=True)
    ator: Mapped[str] = mapped_column(String(200), default="")  # nome no momento (ou "Claude (MCP)")
    # pesquisa | copia | criacao | edicao | exclusao | publicacao | conta | cliente | usuario
    acao: Mapped[str] = mapped_column(String(30), index=True)
    descricao: Mapped[str] = mapped_column(Text, default="")
    anuncio_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    detalhes: Mapped[dict] = mapped_column(JSON, default=dict)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)
