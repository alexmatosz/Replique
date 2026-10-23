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

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
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
    api_key_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    convite_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    ferramentas_off: Mapped[dict | None] = mapped_column(JSON, default=dict, nullable=True)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)

    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="empresa")


class Cliente(Base):
    __tablename__ = "clientes"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    nome: Mapped[str] = mapped_column(String(200))
    documento: Mapped[str] = mapped_column(String(30), default="")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    origem: Mapped[str] = mapped_column(String(20), default="admin")
    exige_aprovacao: Mapped[bool | None] = mapped_column(Boolean, default=False, nullable=True)
    ferramentas_off: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    nome: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    senha_hash: Mapped[str] = mapped_column(String(300))
    papel: Mapped[str] = mapped_column(String(20), default="admin")
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    sessao_versao: Mapped[int] = mapped_column(Integer, default=0)
    google_sub: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    foto: Mapped[str | None] = mapped_column(String(200), default="", nullable=True)
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
    plataforma: Mapped[str] = mapped_column(String(30))
    apelido: Mapped[str] = mapped_column(String(200), default="")
    id_externo: Mapped[str] = mapped_column(String(100), default="")
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
    status: Mapped[str] = mapped_column(String(20), default="rascunho")
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
    dimensoes_cm: Mapped[dict] = mapped_column(JSON, default=dict)
    fotos: Mapped[list] = mapped_column(JSON, default=list)
    atributos: Mapped[dict] = mapped_column(JSON, default=dict)
    por_plataforma: Mapped[dict] = mapped_column(JSON, default=dict)
    origem: Mapped[dict] = mapped_column(JSON, default=dict)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)
    excluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    custo: Mapped[float | None] = mapped_column(Float, nullable=True)
    imposto_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    aprovacao: Mapped[str | None] = mapped_column(String(20), default="", nullable=True)
    aprovacao_nota: Mapped[str | None] = mapped_column(Text, default="", nullable=True)
    aprovacao_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aprovacao_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)


class Publicacao(Base):
    __tablename__ = "publicacoes"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, index=True)
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
    ator: Mapped[str] = mapped_column(String(200), default="")
    acao: Mapped[str] = mapped_column(String(30), index=True)
    descricao: Mapped[str] = mapped_column(Text, default="")
    anuncio_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    detalhes: Mapped[dict] = mapped_column(JSON, default=dict)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)


class Lote(Base):
    """Publicação em massa: vários rascunhos de UM cliente, publicados um de
    cada vez pela fila, com intervalo, limite diário e parada automática."""
    __tablename__ = "lotes"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    plataformas: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="na_fila", index=True)
    motivo: Mapped[str] = mapped_column(Text, default="")
    falhas_seguidas: Mapped[int] = mapped_column(Integer, default=0)
    proximo_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class LoteItem(Base):
    __tablename__ = "lote_itens"
    id: Mapped[int] = mapped_column(primary_key=True)
    lote_id: Mapped[int] = mapped_column(ForeignKey("lotes.id"), index=True)
    anuncio_id: Mapped[int] = mapped_column(ForeignKey("anuncios.id"))
    plataforma: Mapped[str] = mapped_column(String(30))
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pendente")
    mensagem: Mapped[str] = mapped_column(Text, default="")
    publicacao_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SaudeConta(Base):
    """Foto da saúde da conta de um cliente num marketplace (reputação,
    reclamações, anúncios pausados). Guardada para o painel não depender de
    consultar o marketplace a cada abertura."""
    __tablename__ = "saude_contas"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    plataforma: Mapped[str] = mapped_column(String(30), default="mercadolivre")
    nivel: Mapped[str] = mapped_column(String(20), default="ok")
    dados: Mapped[dict] = mapped_column(JSON, default=dict)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)


class RadarPreco(Base):
    """Leitura do radar de concorrência de um anúncio publicado."""
    __tablename__ = "radar_precos"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    anuncio_id: Mapped[int] = mapped_column(ForeignKey("anuncios.id"), index=True)
    plataforma: Mapped[str] = mapped_column(String(30), default="mercadolivre")
    dados: Mapped[dict] = mapped_column(JSON, default=dict)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)


class GeracaoFotos(Base):
    """Pedido ao gerador de fotos. Roda em segundo plano (a geração com IA
    leva de 20 s a 2 min) e a tela acompanha pelo id."""
    __tablename__ = "geracoes_fotos"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    anuncio_id: Mapped[int] = mapped_column(ForeignKey("anuncios.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="gerando")
    pedido: Mapped[dict] = mapped_column(JSON, default=dict)
    resultado: Mapped[list] = mapped_column(JSON, default=list)
    erro: Mapped[str] = mapped_column(Text, default="")
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class ConviteColaborador(Base):
    """Convite para alguém entrar na EQUIPE (admin ou operador). O link vai por
    e-mail; a pessoa cria o acesso com senha ou com a conta Google do MESMO
    e-mail. Guardamos só o hash do código do link."""
    __tablename__ = "convites_colaborador"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    email: Mapped[str] = mapped_column(String(200), index=True)
    nome: Mapped[str] = mapped_column(String(200), default="")
    papel: Mapped[str] = mapped_column(String(20), default="operador")
    clientes: Mapped[list] = mapped_column(JSON, default=list)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    criado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelado: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class ConfigFinanceira(Base):
    """Como calcular o lucro das vendas de um cliente: regime tributário,
    alíquotas e se o custo do produto é cadastrado por SKU ou por anúncio."""
    __tablename__ = "config_financeira"
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    regime: Mapped[str] = mapped_column(String(20), default="simples")
    aliquota_simples_pct: Mapped[float] = mapped_column(Float, default=6.0)
    uf_origem: Mapped[str] = mapped_column(String(2), default="")
    pis_cofins_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    outros_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    credito_custo_pct: Mapped[float] = mapped_column(Float, default=0.0)
    importado: Mapped[bool] = mapped_column(Boolean, default=False)
    cobrar_difal: Mapped[bool] = mapped_column(Boolean, default=True)
    icms_excluido_pis_cofins: Mapped[bool] = mapped_column(Boolean, default=True)
    aliquotas_uf: Mapped[dict] = mapped_column(JSON, default=dict)
    custo_por: Mapped[str] = mapped_column(String(10), default="sku")
    embalagem_padrao: Mapped[float] = mapped_column(Float, default=0.0)
    devolucao_volta_estoque: Mapped[bool | None] = mapped_column(Boolean, default=True, nullable=True)
    full_custo_unidade_mes: Mapped[float | None] = mapped_column(Float, default=0.0, nullable=True)
    full_dias_prolongado: Mapped[int | None] = mapped_column(Integer, default=180, nullable=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)


class Produto(Base):
    """Produto do catálogo do cliente (o que ele compra e vende), com custo e
    embalagem. As vendas chegam ao produto pelo SKU igual ou por um vínculo
    feito à mão com o anúncio (anúncio sem SKU, SKU diferente, kit)."""
    __tablename__ = "produtos"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    sku: Mapped[str] = mapped_column(String(80), default="", index=True)
    nome: Mapped[str] = mapped_column(String(300), default="")
    custo: Mapped[float | None] = mapped_column(Float, nullable=True)
    embalagem: Mapped[float | None] = mapped_column(Float, nullable=True)
    foto: Mapped[str] = mapped_column(String(500), default="")
    origem: Mapped[str] = mapped_column(String(20), default="manual")
    atualizado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)


class VinculoAnuncio(Base):
    """Liga um anúncio (ou uma variação dele) a um produto do catálogo.
    `unidades` é quantas unidades do produto saem em cada venda (kit de 3 = 3)."""
    __tablename__ = "vinculos_anuncio"
    __table_args__ = (UniqueConstraint("cliente_id", "plataforma", "item_id", "variacao_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    plataforma: Mapped[str] = mapped_column(String(30), default="mercadolivre")
    item_id: Mapped[str] = mapped_column(String(40))
    variacao_id: Mapped[str] = mapped_column(String(40), default="")
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"), index=True)
    unidades: Mapped[int] = mapped_column(Integer, default=1)
    titulo: Mapped[str] = mapped_column(String(300), default="")
    criado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class GastoAds(Base):
    """Gasto de publicidade (Product Ads) de um anúncio em um dia."""
    __tablename__ = "gastos_ads"
    __table_args__ = (UniqueConstraint("cliente_id", "plataforma", "data", "item_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    plataforma: Mapped[str] = mapped_column(String(30), default="mercadolivre")
    data: Mapped[str] = mapped_column(String(10), index=True)
    item_id: Mapped[str] = mapped_column(String(40))
    custo: Mapped[float] = mapped_column(Float, default=0)
    receita_ads: Mapped[float] = mapped_column(Float, default=0)
    unidades_ads: Mapped[int] = mapped_column(Integer, default=0)
    simulado: Mapped[bool] = mapped_column(Boolean, default=False)


class Venda(Base):
    """Uma linha de pedido do marketplace (um anúncio dentro de um pedido),
    com o que o marketplace cobrou. Custo e imposto são calculados na hora de
    mostrar, para que mudar o custo atualize os meses já sincronizados."""
    __tablename__ = "vendas"
    __table_args__ = (UniqueConstraint("cliente_id", "plataforma", "pedido_id", "item_id", "variacao_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    plataforma: Mapped[str] = mapped_column(String(30), default="mercadolivre")
    pedido_id: Mapped[str] = mapped_column(String(40))
    pacote_id: Mapped[str] = mapped_column(String(40), default="")
    envio_id: Mapped[str] = mapped_column(String(40), default="", index=True)
    item_id: Mapped[str] = mapped_column(String(40))
    variacao_id: Mapped[str] = mapped_column(String(40), default="")
    sku: Mapped[str] = mapped_column(String(80), default="")
    titulo: Mapped[str] = mapped_column(String(300), default="")
    variacao: Mapped[str] = mapped_column(String(200), default="")
    quantidade: Mapped[int] = mapped_column(Integer, default=1)
    preco_unitario: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    comissao: Mapped[float] = mapped_column(Float, default=0)
    frete_envio: Mapped[float | None] = mapped_column(Float, nullable=True)
    logistica: Mapped[str] = mapped_column(String(30), default="")
    uf_destino: Mapped[str] = mapped_column(String(2), default="")
    status: Mapped[str] = mapped_column(String(30), default="paid")
    data_venda: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    simulada: Mapped[bool | None] = mapped_column(Boolean, default=False, nullable=True)
    reembolso: Mapped[float | None] = mapped_column(Float, default=0.0, nullable=True)
    bonus_ml: Mapped[float | None] = mapped_column(Float, default=0.0, nullable=True)
    devolucao: Mapped[str | None] = mapped_column(String(20), default="", nullable=True)
    produto_voltou: Mapped[bool | None] = mapped_column(Boolean, default=False, nullable=True)
    frete_devolucao: Mapped[float | None] = mapped_column(Float, nullable=True)
    reclamacao_id: Mapped[str | None] = mapped_column(String(40), default="", nullable=True)
    sincronizada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)


class SincronizacaoVendas(Base):
    """Última sincronização de vendas de um cliente em um mês."""
    __tablename__ = "sincronizacoes_vendas"
    __table_args__ = (UniqueConstraint("cliente_id", "plataforma", "mes"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    plataforma: Mapped[str] = mapped_column(String(30), default="mercadolivre")
    mes: Mapped[str] = mapped_column(String(7))
    pedidos: Mapped[int] = mapped_column(Integer, default=0)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    avisos: Mapped[list] = mapped_column(JSON, default=list)
    feita_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)


class DespesaOperacional(Base):
    """Gasto da operação que não é de uma venda: aluguel, energia, salário,
    sistemas, contador... Fixa (repete todo mês a partir de `mes_inicio`, até
    `mes_fim` se encerrada) ou avulsa (só no mês `mes_inicio`)."""
    __tablename__ = "despesas_operacionais"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    descricao: Mapped[str] = mapped_column(String(200))
    categoria: Mapped[str] = mapped_column(String(30), default="outros")
    valor: Mapped[float] = mapped_column(Float, default=0)
    fixa: Mapped[bool] = mapped_column(Boolean, default=True)
    mes_inicio: Mapped[str] = mapped_column(String(7))
    mes_fim: Mapped[str | None] = mapped_column(String(7), nullable=True)
    criado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class RegraTributaria(Base):
    """Linha da planilha de tributação do cliente (Lucro Real e Presumido),
    importada do sistema onde ele emite a nota. Vale para as vendas do SKU."""
    __tablename__ = "regras_tributarias"
    __table_args__ = (UniqueConstraint("cliente_id", "sku"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    sku: Mapped[str] = mapped_column(String(80))
    descricao: Mapped[str] = mapped_column(String(300), default="")
    ncm: Mapped[str] = mapped_column(String(10), default="")
    origem: Mapped[str] = mapped_column(String(2), default="")
    cst_icms: Mapped[str] = mapped_column(String(4), default="")
    icms_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    icms_st: Mapped[bool] = mapped_column(Boolean, default=False)
    fcp_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    ipi_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    pis_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    cofins_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    credito_icms_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    credito_pis_cofins_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    aliquotas_uf: Mapped[dict] = mapped_column(JSON, default=dict)
    importado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Projeto(Base):
    """Projeto de um cliente (ex.: "Implantação no Mercado Livre"). Agrupa as
    tarefas que o consultor planeja e o operador executa."""
    __tablename__ = "projetos"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    nome: Mapped[str] = mapped_column(String(200))
    descricao: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="ativo")
    criado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)


class Tarefa(Base):
    """Etapa ou atividade de um projeto. `visivel_cliente` decide se o lojista
    vê a tarefa no acompanhamento dele."""
    __tablename__ = "tarefas"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    projeto_id: Mapped[int] = mapped_column(ForeignKey("projetos.id"), index=True)
    titulo: Mapped[str] = mapped_column(String(300))
    descricao: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="pendente", index=True)
    responsavel_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, index=True)
    prazo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    visivel_cliente: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, onupdate=agora)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotaTarefa(Base):
    """Observação ou atualização de uma tarefa. As internas só a equipe vê."""
    __tablename__ = "notas_tarefa"
    id: Mapped[int] = mapped_column(primary_key=True)
    tarefa_id: Mapped[int] = mapped_column(ForeignKey("tarefas.id"), index=True)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    autor_nome: Mapped[str] = mapped_column(String(200), default="")
    texto: Mapped[str] = mapped_column(Text, default="")
    interna: Mapped[bool] = mapped_column(Boolean, default=False)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Reuniao(Base):
    """Registro de reunião do consultor com o cliente. Só a equipe vê."""
    __tablename__ = "reunioes"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    projeto_id: Mapped[int | None] = mapped_column(ForeignKey("projetos.id"), nullable=True)
    data: Mapped[str] = mapped_column(String(10))
    titulo: Mapped[str] = mapped_column(String(200), default="")
    resumo: Mapped[str] = mapped_column(Text, default="")
    proximos_passos: Mapped[str] = mapped_column(Text, default="")
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    autor_nome: Mapped[str] = mapped_column(String(200), default="")
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Conversa(Base):
    """Dúvidas sobre uma página do sistema, de um cliente, e opcionalmente
    sobre um item dela (tarefa, produto ou anúncio)."""
    __tablename__ = "conversas"
    __table_args__ = (UniqueConstraint("cliente_id", "pagina", "ref_tipo", "ref_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    pagina: Mapped[str] = mapped_column(String(30))
    ref_tipo: Mapped[str] = mapped_column(String(20), default="")
    ref_id: Mapped[int] = mapped_column(Integer, default=0)
    titulo: Mapped[str] = mapped_column(String(300), default="")
    resolvida: Mapped[bool] = mapped_column(Boolean, default=False)
    ultima_autor_papel: Mapped[str] = mapped_column(String(20), default="")
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    atualizada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)


class Mensagem(Base):
    __tablename__ = "mensagens"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversa_id: Mapped[int] = mapped_column(ForeignKey("conversas.id"), index=True)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, index=True)
    autor_nome: Mapped[str] = mapped_column(String(200), default="")
    autor_papel: Mapped[str] = mapped_column(String(20), default="")
    texto: Mapped[str] = mapped_column(Text, default="")
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class LeituraConversa(Base):
    """Até qual mensagem cada pessoa já leu. A leitura de um não apaga o aviso do outro."""
    __tablename__ = "leituras_conversa"
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), primary_key=True)
    conversa_id: Mapped[int] = mapped_column(ForeignKey("conversas.id"), primary_key=True, index=True)
    ultima_lida_id: Mapped[int] = mapped_column(Integer, default=0)


class ArquivoFoto(Base):
    """Cópia das fotos enviadas ou geradas. Em hospedagem sem disco permanente
    (Vercel) é daqui que a foto volta quando a pasta temporária some."""
    __tablename__ = "arquivos_foto"
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    nome: Mapped[str] = mapped_column(String(40), unique=True)
    dados: Mapped[bytes] = mapped_column(LargeBinary)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
