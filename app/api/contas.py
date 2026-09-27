"""Conexão das contas de vendedor de cada CLIENTE nos marketplaces.

Travas de segurança (misturar contas de clientes é o pior erro possível):
- a conta é sempre ligada ao cliente ativo (login do lojista = a própria loja);
- o link de autorização do ML carrega o cliente assinado; se o texto colado
  trouxer um state de outro cliente, a conexão é recusada;
- a mesma conta de vendedor não pode ficar ligada a dois clientes;
- trocar a conta de um cliente por outra fica registrado na auditoria.
"""

from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import config
from app.api.deps import Contexto, contexto, exigir_admin
from app.db import get_db
from app.marketplaces import mercadolivre, shopee
from app.marketplaces.base import PLATAFORMAS, ErroMarketplace
from app.marketplaces.registry import _pronta, conta_da_empresa, conta_do_cliente, credenciais
from app.models import Cliente, ContaMarketplace, Usuario
from app.security import criar_state_oauth, criptografar, descriptografar, ler_state_oauth
from app.services import acesso
from app.services.auditoria import registrar

router = APIRouter(prefix="/api/contas", tags=["contas"])


class CodigoColado(BaseModel):
    texto: str  # URL completa para onde o marketplace redirecionou, ou só o código
    shop_id: str | None = None


class ShopeeAfiliados(BaseModel):
    app_id: str
    secret: str


class AmazonCred(BaseModel):
    refresh_token: str
    seller_id: str
    marketplace_id: str | None = None


def _param_da_url(texto: str, nome: str) -> str | None:
    texto = texto.strip()
    if "?" in texto:
        valores = parse_qs(urlparse(texto).query).get(nome)
        return valores[0] if valores else None
    return texto if nome == "code" else None


def _pode_conectar(ctx: Contexto = Depends(contexto)) -> Contexto:
    if not acesso.pode_conectar_contas(ctx.usuario):
        raise HTTPException(403, "Quem conecta a conta do marketplace é o próprio cliente (pelo login dele) "
                                 "ou um administrador.")
    return ctx


def _conferir_dono(db: Session, cliente: Cliente, plataforma: str, id_externo: str):
    """A mesma conta de vendedor não pode estar em dois clientes."""
    if not id_externo:
        return
    outra = (db.query(ContaMarketplace, Cliente.nome).join(Cliente, Cliente.id == ContaMarketplace.cliente_id)
             .filter(ContaMarketplace.empresa_id == cliente.empresa_id, ContaMarketplace.plataforma == plataforma,
                     ContaMarketplace.id_externo == id_externo, ContaMarketplace.ativa.is_(True),
                     ContaMarketplace.cliente_id != cliente.id).first())
    if outra:
        raise HTTPException(409, f"Esta conta de {PLATAFORMAS[plataforma]} já está conectada ao cliente "
                                 f"“{outra[1]}”. Uma conta de vendedor só pode pertencer a um cliente. "
                                 "Confira se você entrou com a conta certa no marketplace.")


def _salvar(db: Session, cliente: Cliente, usuario: Usuario | None, plataforma: str, novas: dict,
            id_externo: str = "", apelido: str = "") -> ContaMarketplace:
    _conferir_dono(db, cliente, plataforma, id_externo)
    conta = conta_do_cliente(db, cliente.id, plataforma)
    anterior = (conta.apelido or conta.id_externo) if conta else ""
    trocou = bool(conta and id_externo and conta.id_externo and conta.id_externo != id_externo)
    if not conta:
        conta = ContaMarketplace(empresa_id=cliente.empresa_id, cliente_id=cliente.id, plataforma=plataforma)
        db.add(conta)
        atuais = {}
    else:
        # trocar de conta não pode herdar tokens da conta anterior
        atuais = {} if trocou else descriptografar(conta.credenciais_cript)
    conta.credenciais_cript = criptografar({**atuais, **novas})
    conta.conectada_por_id = usuario.id if usuario else None
    if id_externo:
        conta.id_externo = id_externo
    if apelido:
        conta.apelido = apelido
    descricao = (f"Trocou a conta de {PLATAFORMAS[plataforma]} de “{anterior}” para “{apelido or id_externo}”"
                 if trocou else f"Conectou {PLATAFORMAS[plataforma]}" + (f" (conta {apelido})" if apelido else ""))
    registrar(db, cliente.empresa_id, "conta", descricao, cliente_id=cliente.id, usuario=usuario,
              plataforma=plataforma, id_externo=id_externo)
    db.commit()
    return conta


@router.get("")
def listar(ctx: Contexto = Depends(contexto), db: Session = Depends(get_db)):
    saida = []
    for p, nome in PLATAFORMAS.items():
        conta, cred = credenciais(db, ctx.cliente.id, p)
        pesquisa_ok, motivo_pesquisa = _pronta(p, cred, "pesquisar")
        publicar_ok, motivo_publicar = _pronta(p, cred, "publicar")
        conectada_por = db.get(Usuario, conta.conectada_por_id).nome if conta and conta.conectada_por_id else ""
        saida.append({
            "plataforma": p, "nome": nome, "conectada": bool(conta),
            "apelido": conta.apelido if conta else "", "id_externo": conta.id_externo if conta else "",
            "conectada_por": conectada_por, "conectada_em": conta.criada_em if conta else None,
            "pesquisa_real": pesquisa_ok, "motivo_pesquisa": motivo_pesquisa,
            "publicacao_real": publicar_ok, "motivo_publicacao": motivo_publicar,
            "shopee_afiliados": bool(cred.get("afiliado_app_id")) if p == "shopee" else None,
            "shopee_afiliados_empresa": bool(conta_da_empresa(db, ctx.cliente.empresa_id, "shopee_afiliados"))
            if p == "shopee" else None,
            # Mercado Livre: até quando vale a conexão e se ela se renova sozinha
            "renovacao_automatica": bool(cred.get("refresh_token")) if p == "mercadolivre" and conta else None,
            "expira_em": (cred.get("obtido_em", 0) + cred.get("expires_in", 21600))
            if p == "mercadolivre" and cred.get("access_token") else None,
        })
    return saida


@router.get("/{plataforma}/autorizar")
def url_autorizacao(plataforma: str, ctx: Contexto = Depends(_pode_conectar)):
    try:
        if plataforma == "mercadolivre":
            # state assinado com o cliente: o retorno só pode ser ligado a ele
            state = criar_state_oauth(ctx.cliente.empresa_id, ctx.cliente.id, ctx.usuario.id)
            return {"url": mercadolivre.url_autorizacao(state), "redirect_uri": config.ML_REDIRECT_URI}
        if plataforma == "shopee":
            return {"url": shopee.url_autorizacao(), "redirect_uri": config.SHOPEE_REDIRECT_URI}
    except ErroMarketplace as e:
        raise HTTPException(400, e.mensagem)
    raise HTTPException(400, "Essa plataforma não usa autorização por link.")


@router.post("/mercadolivre/conectar")
def conectar_ml(dados: CodigoColado, ctx: Contexto = Depends(_pode_conectar), db: Session = Depends(get_db)):
    code = _param_da_url(dados.texto, "code")
    if not code:
        raise HTTPException(400, "Não encontrei o código de autorização no texto colado.")
    state = _param_da_url(dados.texto, "state")
    if not state:
        # sem o state não dá para provar que a autorização é deste cliente
        raise HTTPException(400, "Cole a URL COMPLETA da página para onde o Mercado Livre redirecionou "
                                 "(ela tem code= e state=), não só o código.")
    dono = ler_state_oauth(state)
    if not dono or dono.get("e") != ctx.cliente.empresa_id:
        raise HTTPException(400, "Este link de autorização expirou. Clique de novo em Autorizar no Mercado Livre.")
    if dono.get("c") != ctx.cliente.id:
        raise HTTPException(409, "Esta autorização foi gerada para OUTRO cliente. Selecione o cliente certo "
                                 "no topo e autorize de novo.")
    return _finalizar_ml(db, ctx.cliente, ctx.usuario, code)


def _finalizar_ml(db: Session, cliente: Cliente, usuario: Usuario | None, code: str) -> dict:
    with httpx.Client(timeout=20) as http:
        try:
            token = mercadolivre.trocar_code_por_token(http, code)
        except ErroMarketplace as e:
            raise HTTPException(400, e.mensagem)
        apelido = ""
        r = http.get("https://api.mercadolibre.com/users/me",
                     headers={"Authorization": f"Bearer {token['access_token']}"})
        if r.status_code < 400:
            apelido = r.json().get("nickname", "")
    _salvar(db, cliente, usuario, "mercadolivre", token, str(token.get("user_id", "")), apelido)
    return {"ok": True, "apelido": apelido, "cliente": cliente.nome}


@router.get("/mercadolivre/callback", response_class=HTMLResponse, include_in_schema=False)
def callback_ml(code: str = "", state: str = "", db: Session = Depends(get_db)):
    """Usado quando ML_REDIRECT_URI aponta para {PUBLIC_BASE_URL}/api/contas/mercadolivre/callback."""
    dados = ler_state_oauth(state)
    cliente = db.get(Cliente, dados["c"]) if dados and dados.get("c") else None
    if not code or not cliente or cliente.empresa_id != dados["e"] or not cliente.ativo:
        return HTMLResponse("<h3>Link de autorização inválido ou expirado. Tente de novo pelo Replique.</h3>", 400)
    usuario = db.get(Usuario, dados["u"]) if dados.get("u") else None
    try:
        r = _finalizar_ml(db, cliente, usuario, code)
    except HTTPException as e:
        import html
        return HTMLResponse(f"<h3>{html.escape(str(e.detail))}</h3>", 400)
    import html
    return HTMLResponse(f"<meta http-equiv='refresh' content='2;url=/#/contas'>"
                        f"<h3>Mercado Livre ({html.escape(r['apelido'])}) conectado ao cliente {html.escape(cliente.nome)}! "
                        "Voltando ao Replique…</h3>")


@router.post("/shopee/conectar")
def conectar_shopee(dados: CodigoColado, ctx: Contexto = Depends(_pode_conectar), db: Session = Depends(get_db)):
    code = _param_da_url(dados.texto, "code")
    shop_id = dados.shop_id or _param_da_url(dados.texto, "shop_id")
    if not code or not shop_id:
        raise HTTPException(400, "Cole a URL completa da página para onde a Shopee redirecionou "
                                 "(ela contém code= e shop_id=).")
    _conferir_dono(db, ctx.cliente, "shopee", str(shop_id))
    with httpx.Client(timeout=20) as http:
        try:
            token = shopee.trocar_code_por_token(http, code, shop_id)
        except ErroMarketplace as e:
            raise HTTPException(400, e.mensagem)
    _salvar(db, ctx.cliente, ctx.usuario, "shopee", token, str(shop_id), f"Loja {shop_id}")
    return {"ok": True}


@router.post("/shopee/afiliados")
def conectar_shopee_afiliados(dados: ShopeeAfiliados, usuario: Usuario = Depends(exigir_admin),
                              db: Session = Depends(get_db)):
    """Credencial da API de Afiliados da Shopee: é da EMPRESA e serve à pesquisa de todos os clientes."""
    if not dados.app_id.strip() or not dados.secret.strip():
        raise HTTPException(400, "Informe AppId e Secret.")
    conta = conta_da_empresa(db, usuario.empresa_id, "shopee_afiliados")
    if not conta:
        conta = ContaMarketplace(empresa_id=usuario.empresa_id, cliente_id=None, plataforma="shopee_afiliados",
                                 apelido="API de Afiliados")
        db.add(conta)
    conta.credenciais_cript = criptografar({"afiliado_app_id": dados.app_id.strip(),
                                            "afiliado_secret": dados.secret.strip()})
    conta.conectada_por_id = usuario.id
    registrar(db, usuario.empresa_id, "conta", "Configurou a API de Afiliados da Shopee (vale para todos os clientes)",
              usuario=usuario, plataforma="shopee")
    db.commit()
    return {"ok": True}


@router.post("/amazon/conectar")
def conectar_amazon(dados: AmazonCred, ctx: Contexto = Depends(_pode_conectar), db: Session = Depends(get_db)):
    novas = {"refresh_token": dados.refresh_token.strip(), "seller_id": dados.seller_id.strip(),
             "access_token": None, "expira_em": 0}
    if dados.marketplace_id:
        novas["marketplace_id"] = dados.marketplace_id.strip()
    _salvar(db, ctx.cliente, ctx.usuario, "amazon", novas, dados.seller_id.strip(), f"Seller {dados.seller_id.strip()}")
    return {"ok": True}


@router.delete("/{plataforma}")
def desconectar(plataforma: str, ctx: Contexto = Depends(_pode_conectar), db: Session = Depends(get_db)):
    conta = conta_do_cliente(db, ctx.cliente.id, plataforma)
    if conta:
        conta.ativa = False
        conta.credenciais_cript = ""
        registrar(db, ctx.cliente.empresa_id, "conta",
                  f"Desconectou {PLATAFORMAS.get(plataforma, plataforma)}" + (f" (conta {conta.apelido})" if conta.apelido else ""),
                  cliente_id=ctx.cliente.id, usuario=ctx.usuario, plataforma=plataforma)
        db.commit()
    return {"ok": True}
