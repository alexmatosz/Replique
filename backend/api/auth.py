import logging

from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import exigir_admin, usuario_atual
from backend.api.limites import acesso_local, cadastros_ip, consumir, falhas_login, falhas_login_ip, ip_do_cliente, uso_uploads
from backend.banco.db import get_db
from backend.banco.models import Cliente, Empresa, Usuario
from backend.security import conferir_senha, criar_token_sessao, gerar_api_key, hash_senha, precisa_rehash, senha_fraca, senha_proibida_no_login
from backend.services import ferramentas as permissoes
from backend.services import acesso, acessos, ia
from backend.services.auditoria import registrar

router = APIRouter(prefix="/api", tags=["auth"])


class Cadastro(BaseModel):
    empresa: str = Field(min_length=2, max_length=200)
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    senha: str = Field(min_length=8, max_length=200)
    aceite_termos: bool = False


class Login(BaseModel):
    email: str
    senha: str


class CadastroLojista(BaseModel):
    loja: str = Field(min_length=2, max_length=200)
    documento: str = Field(default="", max_length=30)
    nome: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    senha: str = Field(min_length=8, max_length=200)
    aceite_termos: bool = False


def aplicar_aceite(usuario: Usuario, aceitou: bool) -> None:
    if aceitou:
        from datetime import datetime, timezone
        usuario.termos_versao, usuario.termos_aceitos_em = config.TERMOS_VERSAO, datetime.now(timezone.utc)


log = logging.getLogger("replique.acesso")
SENHA_COMUM = "Essa senha é muito comum. Use pelo menos 8 caracteres misturando palavras, números ou símbolos."


def _sessao(u: Usuario) -> dict:
    return {"token": criar_token_sessao(u.id, u.empresa_id, u.sessao_versao or 0), "usuario": _usuario_dict(u)}


def _usuario_dict(u: Usuario, db: Session | None = None) -> dict:
    saida = {"id": u.id, "nome": u.nome, "email": u.email, "papel": u.papel, "cliente_id": u.cliente_id, "foto": u.foto or "",
             "empresa": {"id": u.empresa.id, "nome": u.empresa.nome, "plano": u.empresa.plano,
                         "tem_api_key": bool(u.empresa.api_key_hash)},
             "ferramentas": sorted(permissoes.liberadas(u.papel, u.empresa.ferramentas_off)),
             "termos_pendentes": u.termos_versao != config.TERMOS_VERSAO, "termos_versao": config.TERMOS_VERSAO,
             "dois_fatores": bool(u.totp_ativo), "precisa_2fa": bool(u.empresa.exigir_2fa) and u.papel in acesso.EQUIPE and not u.totp_ativo,
             "inatividade_min": config.SESSAO_INATIVIDADE_MIN}
    if db is not None:
        if u.papel == "cliente" and u.cliente_id:
            loja = db.get(Cliente, u.cliente_id)
            saida["ferramentas"] = sorted(permissoes.liberadas(u.papel, u.empresa.ferramentas_off,
                                                               loja.ferramentas_off if loja else None))
            saida["vendas_lucro"] = bool(loja and loja.vendas_lucro)
        saida["clientes"] = [{"id": c.id, "nome": c.nome, "ativo": bool(c.ativo),
                              "exige_aprovacao": bool(c.exige_aprovacao), "vendas_lucro": bool(c.vendas_lucro)}
                             for c in acesso.clientes_acessiveis(db, u, incluir_inativos=True)]
    return saida


@router.post("/auth/cadastro")
def cadastro(dados: Cadastro, request: Request, db: Session = Depends(get_db)):
    """Cria uma AGÊNCIA nova. Fechado por padrão. Com o banco vazio, só vale
    no próprio computador do servidor: se o site fosse para a internet antes
    de você criar a conta, um estranho viraria o administrador. Num servidor,
    crie o primeiro admin com `python scripts/criar_admin.py`."""
    if not config.PERMITIR_CADASTRO_AGENCIA:
        if db.query(Empresa).first():
            raise HTTPException(403, "O cadastro de novas agências está fechado. Lojista: use o link de cadastro da sua agência.")
        if not acesso_local(request):
            raise HTTPException(403, "O primeiro administrador é criado no servidor: rode  python scripts/criar_admin.py  "
                                     "ou abra o Replique no computador onde ele está instalado.")
    ip = ip_do_cliente(request)
    cadastros_ip.conferir(ip)
    cadastros_ip.registrar(ip)
    email = dados.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "E-mail inválido.")
    if senha_fraca(dados.senha, (email, dados.nome, dados.empresa)):
        raise HTTPException(400, SENHA_COMUM)
    if db.query(Usuario).filter_by(email=email).first():
        raise HTTPException(400, "Já existe uma conta com esse e-mail.")
    empresa = Empresa(nome=dados.empresa.strip())
    db.add(empresa)
    db.flush()
    usuario = Usuario(empresa_id=empresa.id, nome=dados.nome.strip(), email=email,
                      senha_hash=hash_senha(dados.senha), papel="admin")
    aplicar_aceite(usuario, dados.aceite_termos)
    db.add(usuario)
    db.flush()
    acessos.registrar(db, request, "cadastro", usuario)
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
def cadastro_lojista(token: str, dados: CadastroLojista, request: Request, db: Session = Depends(get_db)):
    """O lojista cria a própria loja DENTRO da empresa que enviou o link. Ela
    aparece para o admin como cliente novo, ainda sem operador."""
    ip = ip_do_cliente(request)
    cadastros_ip.conferir(ip)
    empresa = _empresa_do_convite(db, token)
    cadastros_ip.registrar(ip)
    email = dados.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "E-mail inválido.")
    if senha_fraca(dados.senha, (email, dados.nome, dados.loja)):
        raise HTTPException(400, SENHA_COMUM)
    if db.query(Usuario).filter_by(email=email).first():
        raise HTTPException(400, "Já existe um acesso com esse e-mail. Use Entrar.")
    cliente = Cliente(empresa_id=empresa.id, nome=dados.loja.strip(), documento=dados.documento.strip(), origem="convite")
    db.add(cliente)
    db.flush()
    usuario = Usuario(empresa_id=empresa.id, nome=dados.nome.strip(), email=email, senha_hash=hash_senha(dados.senha),
                      papel="cliente", cliente_id=cliente.id)
    aplicar_aceite(usuario, dados.aceite_termos)
    db.add(usuario)
    db.flush()
    acessos.registrar(db, request, "cadastro", usuario)
    registrar(db, empresa.id, "cliente", f"Cadastrou a loja “{cliente.nome}” pelo link de cadastro", cliente_id=cliente.id,
              usuario=usuario)
    db.commit()
    return _sessao(usuario)


@router.post("/auth/login")
def login(dados: Login, request: Request, db: Session = Depends(get_db)):
    email = dados.email.strip().lower()
    ip = ip_do_cliente(request)
    falhas_login.conferir("email:" + email)
    falhas_login_ip.conferir("ip:" + ip)
    usuario = db.query(Usuario).filter_by(email=email).first()
    if not conferir_senha(dados.senha, usuario.senha_hash if usuario else None) or not usuario:
        falhas_login.registrar("email:" + email)
        falhas_login_ip.registrar("ip:" + ip)
        log.warning("Login recusado a partir de %s", ip)
        acessos.registrar(db, request, "login_falha", usuario, email, sucesso=False)
        if usuario and falhas_login.quantos("email:" + email) == falhas_login.maximo:
            from backend.services import conta
            conta.avisar(db, usuario, "Tentativas de senha errada na sua conta",
                         f"Houve {falhas_login.maximo} tentativas de entrar com senha errada (último endereço: {ip}). "
                         "A entrada ficou bloqueada por 15 minutos.")
        db.commit()
        raise HTTPException(401, "E-mail ou senha incorretos.")
    falhas_login.limpar("email:" + email)
    if precisa_rehash(usuario.senha_hash):
        usuario.senha_hash = hash_senha(dados.senha)
    if senha_proibida_no_login(dados.senha) and ip not in ("127.0.0.1", "::1", "testclient"):
        raise HTTPException(403, "Por segurança, esta senha é fraca demais para entrar pela internet. "
                                 "Troque a senha no computador onde o Replique está instalado e tente de novo.")
    if not usuario.ativo:
        raise HTTPException(401, "Este acesso foi desativado. Fale com o administrador.")
    if usuario.papel == "cliente":
        cliente = db.get(Cliente, usuario.cliente_id) if usuario.cliente_id else None
        if not cliente or not cliente.ativo:
            raise HTTPException(401, "O acesso desta loja está desativado. Fale com a Monvatti.")
    from backend.services import conta
    return conta.finalizar_login(db, request, usuario)


class TrocaSenha(BaseModel):
    atual: str
    nova: str = Field(min_length=8, max_length=200)


@router.post("/me/senha")
def trocar_minha_senha(dados: TrocaSenha, request: Request, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Troca a própria senha. As outras sessões abertas são encerradas; esta recebe um token novo."""
    if not conferir_senha(dados.atual, usuario.senha_hash):
        raise HTTPException(400, "A senha atual está incorreta.")
    if senha_fraca(dados.nova, (usuario.email, usuario.nome, usuario.empresa.nome)):
        raise HTTPException(400, "Essa senha é muito comum. Use pelo menos 8 caracteres misturando palavras, números ou símbolos.")
    if dados.nova == dados.atual:
        raise HTTPException(400, "A nova senha precisa ser diferente da atual.")
    usuario.senha_hash = hash_senha(dados.nova)
    usuario.sessao_versao = (usuario.sessao_versao or 0) + 1
    acessos.registrar(db, request, "senha_trocada", usuario)
    from backend.services import conta
    conta.avisar(db, usuario, "Sua senha foi trocada", "A senha do seu acesso ao Replique acabou de ser trocada em Minha conta.")
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} trocou a própria senha", cliente_id=usuario.cliente_id,
              usuario=usuario)
    db.commit()
    return _sessao(usuario)


@router.post("/me/sair-de-todos")
def sair_de_todos(request: Request, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Encerra TODAS as sessões deste acesso (inclusive esta). Use se esqueceu
    o Replique aberto num computador ou suspeita que alguém pegou seu acesso."""
    usuario.sessao_versao = (usuario.sessao_versao or 0) + 1
    acessos.registrar(db, request, "sair_todos", usuario)
    registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} encerrou todas as próprias sessões",
              cliente_id=usuario.cliente_id, usuario=usuario)
    db.commit()
    return {"ok": True}


class MeuPerfil(BaseModel):
    nome: str = Field(min_length=2, max_length=200)


class DadosEmpresa(BaseModel):
    nome: str = Field(min_length=2, max_length=200)


_MAX_FOTO_PERFIL = 8 * 1024 * 1024


def _apagar_foto_antiga(usuario: Usuario):
    from backend.services.fotos import apagar
    if not usuario.foto:
        return
    try:
        apagar(usuario.foto, usuario.empresa_id)
    except OSError:
        pass


@router.patch("/me")
def editar_meu_perfil(dados: MeuPerfil, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Cada pessoa troca o próprio nome de exibição."""
    nome = dados.nome.strip()
    if len(nome) < 2:
        raise HTTPException(400, "Informe o seu nome.")
    if nome != usuario.nome:
        registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} passou a se chamar {nome}", cliente_id=usuario.cliente_id,
                  usuario=usuario)
        usuario.nome = nome
    db.commit()
    return _usuario_dict(usuario, db)


@router.post("/me/foto")
async def enviar_minha_foto(arquivo: UploadFile = File(...), usuario: Usuario = Depends(usuario_atual),
                            db: Session = Depends(get_db)):
    """Foto de perfil: recortada em quadrado, reduzida e regravada em JPG (some
    qualquer dado escondido no arquivo original)."""
    from PIL import Image, ImageOps
    consumir(uso_uploads, usuario.id)
    conteudo = bytearray()
    while pedaco := await arquivo.read(256 * 1024):
        conteudo += pedaco
        if len(conteudo) > _MAX_FOTO_PERFIL:
            raise HTTPException(400, "Imagem maior que 8 MB.")
    try:
        with Image.open(BytesIO(bytes(conteudo))) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img = ImageOps.fit(img, (320, 320), Image.LANCZOS)
            saida = BytesIO()
            img.save(saida, "JPEG", quality=88)
    except Exception:
        raise HTTPException(400, "Não consegui ler essa imagem. Envie uma foto JPG, PNG ou WEBP.")
    from backend.services.fotos import guardar
    url = guardar(usuario.empresa_id, saida.getvalue(), ".jpg")
    _apagar_foto_antiga(usuario)
    usuario.foto = url
    db.commit()
    return _usuario_dict(usuario, db)


@router.delete("/me/foto")
def remover_minha_foto(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _apagar_foto_antiga(usuario)
    usuario.foto = ""
    db.commit()
    return _usuario_dict(usuario, db)


@router.patch("/empresa")
def editar_empresa(dados: DadosEmpresa, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    """Nome da agência que aparece no topo e nos relatórios."""
    nome = dados.nome.strip()
    if nome != usuario.empresa.nome:
        registrar(db, usuario.empresa_id, "usuario", f"Renomeou a empresa de “{usuario.empresa.nome}” para “{nome}”", usuario=usuario)
        usuario.empresa.nome = nome
    db.commit()
    return _usuario_dict(usuario, db)


@router.get("/me")
def me(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    from backend.services import gerador_fotos
    return {**_usuario_dict(usuario, db), "ia_disponivel": ia.disponivel(),
            "imagens_ia": gerador_fotos.provedor(),
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
