from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import config
from app.api.deps import exigir_admin, usuario_atual
from app.db import get_db
from app.models import Cliente, Empresa, Usuario
from app.security import conferir_senha, criar_token_sessao, gerar_api_key, hash_senha
from app.services import acesso, ia
from app.services.auditoria import registrar

router = APIRouter(prefix="/api", tags=["auth"])


class Cadastro(BaseModel):
    empresa: str = Field(min_length=2, max_length=200)
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    senha: str = Field(min_length=8, max_length=200)


class Login(BaseModel):
    email: str
    senha: str


class CadastroLojista(BaseModel):
    loja: str = Field(min_length=2, max_length=200)
    documento: str = Field(default="", max_length=30)
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    senha: str = Field(min_length=8, max_length=200)


def _sessao(u: Usuario) -> dict:
    return {"token": criar_token_sessao(u.id, u.empresa_id), "usuario": _usuario_dict(u)}


def _usuario_dict(u: Usuario, db: Session | None = None) -> dict:
    saida = {"id": u.id, "nome": u.nome, "email": u.email, "papel": u.papel, "cliente_id": u.cliente_id,
             "empresa": {"id": u.empresa.id, "nome": u.empresa.nome, "plano": u.empresa.plano,
                         "tem_api_key": bool(u.empresa.api_key_hash)}}
    if db is not None:
        # clientes que aparecem no seletor do topo
        saida["clientes"] = [{"id": c.id, "nome": c.nome, "ativo": bool(c.ativo)}
                             for c in acesso.clientes_acessiveis(db, u, incluir_inativos=True)]
    return saida


@router.post("/auth/cadastro")
def cadastro(dados: Cadastro, db: Session = Depends(get_db)):
    email = dados.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "E-mail inválido.")
    if db.query(Usuario).filter_by(email=email).first():
        raise HTTPException(400, "Já existe uma conta com esse e-mail.")
    empresa = Empresa(nome=dados.empresa.strip())
    db.add(empresa)
    db.flush()
    usuario = Usuario(empresa_id=empresa.id, nome=dados.nome.strip(), email=email,
                      senha_hash=hash_senha(dados.senha), papel="admin")
    db.add(usuario)
    db.commit()
    return _sessao(usuario)


def _empresa_do_convite(db: Session, token: str) -> Empresa:
    empresa = db.query(Empresa).filter_by(convite_token=token, ativa=True).first() if len(token) >= 16 else None
    if not empresa:
        raise HTTPException(404, "Este link de cadastro não é válido ou foi trocado. Peça um link novo à equipe.")
    return empresa


@router.get("/convite/{token}")
def ver_convite(token: str, db: Session = Depends(get_db)):
    return {"empresa": _empresa_do_convite(db, token).nome}


@router.post("/convite/{token}")
def cadastro_lojista(token: str, dados: CadastroLojista, db: Session = Depends(get_db)):
    """O lojista cria a própria loja DENTRO da empresa que enviou o link. Ela
    aparece para o admin como cliente novo, ainda sem operador."""
    empresa = _empresa_do_convite(db, token)
    email = dados.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "E-mail inválido.")
    if db.query(Usuario).filter_by(email=email).first():
        raise HTTPException(400, "Já existe um acesso com esse e-mail. Use Entrar.")
    cliente = Cliente(empresa_id=empresa.id, nome=dados.loja.strip(), documento=dados.documento.strip(), origem="convite")
    db.add(cliente)
    db.flush()
    usuario = Usuario(empresa_id=empresa.id, nome=dados.nome.strip(), email=email, senha_hash=hash_senha(dados.senha),
                      papel="cliente", cliente_id=cliente.id)
    db.add(usuario)
    db.flush()
    registrar(db, empresa.id, "cliente", f"Cadastrou a loja “{cliente.nome}” pelo link de cadastro", cliente_id=cliente.id,
              usuario=usuario)
    db.commit()
    return _sessao(usuario)


@router.post("/auth/login")
def login(dados: Login, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter_by(email=dados.email.strip().lower()).first()
    if not usuario or not conferir_senha(dados.senha, usuario.senha_hash):
        raise HTTPException(401, "E-mail ou senha incorretos.")
    if not usuario.ativo:
        raise HTTPException(401, "Este acesso foi desativado. Fale com o administrador.")
    if usuario.papel == "cliente":
        cliente = db.get(Cliente, usuario.cliente_id) if usuario.cliente_id else None
        if not cliente or not cliente.ativo:
            raise HTTPException(401, "O acesso desta loja está desativado. Fale com a Monvatti.")
    return _sessao(usuario)


@router.get("/me")
def me(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return {**_usuario_dict(usuario, db), "ia_disponivel": ia.disponivel(),
            "servidor": {"ml_app": bool(config.ML_CLIENT_ID), "shopee_app": bool(config.SHOPEE_PARTNER_ID),
                         "amazon_app": bool(config.AMAZON_LWA_CLIENT_ID)}}


@router.post("/empresa/api-key")
def nova_api_key(usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    """Gera (ou troca) a chave que o servidor MCP usa para agir em nome da
    empresa. É mostrada uma única vez."""
    chave, hash_ = gerar_api_key()
    usuario.empresa.api_key_hash = hash_
    db.commit()
    return {"api_key": chave}
