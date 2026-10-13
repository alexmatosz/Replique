"""Decide, para cada cliente e plataforma, se usa a conexão real ou o modo
demonstração — e explica o motivo quando cai no modo demonstração.

Regra de segurança: o adaptador é sempre montado a partir da conta DO CLIENTE
informado. Quem chama deve passar o cliente dono do rascunho (na publicação)
ou o cliente em que o usuário está trabalhando (na pesquisa)."""

from sqlalchemy.orm import Session

from app import config
from app.db import SessionLocal
from app.marketplaces.amazon import Amazon
from app.marketplaces.base import Marketplace
from app.marketplaces.demo import DemoMarketplace, SemConta
from app.marketplaces.mercadolivre import MercadoLivre
from app.marketplaces.shopee import Shopee
from app.models import Cliente, ContaMarketplace
from app.security import criptografar, descriptografar

_CLASSES = {"mercadolivre": MercadoLivre, "shopee": Shopee, "amazon": Amazon}


def conta_do_cliente(db: Session, cliente_id: int, plataforma: str) -> ContaMarketplace | None:
    return (db.query(ContaMarketplace)
            .filter_by(cliente_id=cliente_id, plataforma=plataforma, ativa=True)
            .order_by(ContaMarketplace.id.desc()).first())


def conta_da_empresa(db: Session, empresa_id: int, plataforma: str) -> ContaMarketplace | None:
    """Credencial compartilhada por todos os clientes (ex.: "shopee_afiliados")."""
    return (db.query(ContaMarketplace)
            .filter_by(empresa_id=empresa_id, cliente_id=None, plataforma=plataforma, ativa=True)
            .order_by(ContaMarketplace.id.desc()).first())


def credenciais(db: Session, cliente_id: int, plataforma: str) -> tuple[ContaMarketplace | None, dict]:
    """(conta do cliente, credenciais). Na Shopee, a pesquisa usa a API de
    Afiliados da empresa quando o cliente não tem uma própria."""
    conta = conta_do_cliente(db, cliente_id, plataforma)
    cred = descriptografar(conta.credenciais_cript) if conta else {}
    if plataforma == "shopee" and not cred.get("afiliado_app_id"):
        cliente = db.get(Cliente, cliente_id)
        geral = conta_da_empresa(db, cliente.empresa_id, "shopee_afiliados") if cliente else None
        if geral:
            cred = {**cred, **descriptografar(geral.credenciais_cript)}
    return conta, cred


def _pronta(plataforma: str, cred: dict, operacao: str) -> tuple[bool, str]:
    """(pode usar a API real?, motivo se não puder)."""
    if plataforma == "mercadolivre":
        if not cred.get("access_token"):
            return False, "conta do Mercado Livre não conectada"
        return True, ""
    if plataforma == "shopee":
        if operacao == "publicar":
            if not (config.SHOPEE_PARTNER_ID and config.SHOPEE_PARTNER_KEY):
                return False, "aplicativo Shopee (SHOPEE_PARTNER_ID/KEY) não configurado no servidor"
            if not (cred.get("access_token") and cred.get("shop_id")):
                return False, "loja Shopee não autorizada"
            return True, ""
        if not (cred.get("afiliado_app_id") and cred.get("afiliado_secret")):
            return False, "API de Afiliados da Shopee não configurada"
        return True, ""
    if plataforma == "amazon":
        if not (config.AMAZON_LWA_CLIENT_ID and config.AMAZON_LWA_CLIENT_SECRET):
            return False, "aplicativo Amazon (AMAZON_LWA_CLIENT_ID/SECRET) não configurado no servidor"
        if not cred.get("refresh_token"):
            return False, "conta da Amazon não conectada"
        if operacao == "publicar" and not cred.get("seller_id"):
            return False, "Seller ID da Amazon não informado"
        return True, ""
    return False, "plataforma desconhecida"


def obter_adaptador(db: Session, cliente_id: int, plataforma: str,
                    operacao: str = "pesquisar") -> tuple[Marketplace, str]:
    """Retorna (adaptador, aviso). O aviso vem preenchido quando o adaptador
    é o de demonstração, dizendo o que falta para usar dados reais."""
    if plataforma not in _CLASSES:
        raise ValueError(f"Plataforma desconhecida: {plataforma}")
    if not cliente_id:
        raise ValueError("Escolha o cliente antes de usar os marketplaces.")
    conta, cred = credenciais(db, cliente_id, plataforma)
    pronta, motivo = _pronta(plataforma, cred, operacao)
    if not pronta:
        if not config.MODO_DEMONSTRACAO:
            sem = SemConta(plataforma, motivo)
            return sem, sem.mensagem
        return DemoMarketplace(plataforma), f"Modo demonstração: {motivo}."

    salvar = None
    if conta:
        def salvar(novas: dict, _conta_id=conta.id):
            with SessionLocal() as s:
                c = s.get(ContaMarketplace, _conta_id)
                atuais = descriptografar(c.credenciais_cript)
                c.credenciais_cript = criptografar({**atuais, **{k: v for k, v in novas.items()
                                                                 if not k.startswith("afiliado_")}})
                s.commit()

    recarregar = None
    if conta:
        def recarregar(_conta_id=conta.id):
            with SessionLocal() as s:
                c = s.get(ContaMarketplace, _conta_id)
                return {k: v for k, v in descriptografar(c.credenciais_cript).items() if not k.startswith("afiliado_")}

    adaptador = _CLASSES[plataforma](cred, salvar, recarregar, f"conta:{conta.id}" if conta else None)
    adaptador.conta_info = {"apelido": conta.apelido if conta else "", "id_externo": conta.id_externo if conta else ""}
    cliente = db.get(Cliente, cliente_id)
    adaptador.empresa_id = cliente.empresa_id if cliente else None
    return adaptador, ""
