"""Extensão Monvatti Pro para o Mercado Livre: liberação pelo administrador e
rotas usadas pela extensão (autenticadas pelo navegador ligado)."""

import re
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.api.deps import exigir_admin
from backend.api.limites import consumir, uso_pesquisa
from backend.banco.db import get_db
from backend.banco.models import Cliente, ContaMarketplace, DispositivoExtensao, Usuario
from backend.services import acesso, estudo_mercado, extensao
from backend.services.auditoria import registrar
from backend.services.extensao import ExtensaoNegada

router = APIRouter(prefix="/api/extensao", tags=["extensao"])


class Liberacao(BaseModel):
    liberada: bool


class Pareamento(BaseModel):
    codigo: str = Field(min_length=10, max_length=600)
    chave: str = Field(min_length=32, max_length=200)
    navegador: str = Field(default="", max_length=300)


class Pagina(BaseModel):
    conta_ml: str = Field(default="", max_length=30)
    pagina: dict


class Copia(Pagina):
    cliente_id: int


class FotosDaPagina(Pagina):
    cliente_id: int | None = None


class Precificacao(BaseModel):
    conta_ml: str = Field(default="", max_length=30)
    preco: float = Field(gt=0, le=10_000_000)
    categoria_id: str = Field(max_length=30)
    tipo: str = Field(default="gold_special", max_length=30)
    vendedor_id: str = Field(default="", max_length=30, pattern=r"^\d*$")
    item_id: str = Field(default="", max_length=30, pattern=r"^(MLB\d+)?$")


class Estudo(BaseModel):
    pesquisa: str = Field(default="", max_length=200)
    filtro: str = Field(default="", max_length=200)
    imposto: float = Field(default=extensao.IMPOSTO_PADRAO, ge=0, le=100)
    itens: list[dict] = Field(min_length=1, max_length=estudo_mercado.MAX_ANUNCIOS)


class Busca(BaseModel):
    conta_ml: str = Field(default="", max_length=30)
    itens: list[dict] = Field(max_length=100)


def _negar(e: ExtensaoNegada):
    raise HTTPException(403, str(e))


def usuario_da_extensao(authorization: str = Header(default=""), x_extensao_chave: str = Header(default=""),
                        db: Session = Depends(get_db)) -> Usuario:
    try:
        return extensao.autenticar(db, authorization.removeprefix("Bearer ").strip(), x_extensao_chave)
    except ExtensaoNegada as e:
        raise HTTPException(401, str(e))


@router.get("/admin")
def painel(usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    pessoas = (db.query(Usuario).filter(Usuario.empresa_id == usuario.empresa_id, Usuario.papel.in_(acesso.EQUIPE))
               .order_by(Usuario.nome).all())
    dispositivos = {d.usuario_id: d for d in db.query(DispositivoExtensao)
                    .filter_by(empresa_id=usuario.empresa_id, ativo=True)}
    estudo = db.query(Cliente).filter_by(empresa_id=usuario.empresa_id, estudo=True).order_by(Cliente.nome).all()
    contas = {c.cliente_id: c for c in db.query(ContaMarketplace).filter(
        ContaMarketplace.cliente_id.in_([c.id for c in estudo] or [0]), ContaMarketplace.plataforma == "mercadolivre",
        ContaMarketplace.ativa.is_(True))}
    return {"pessoas": [{"id": p.id, "nome": p.nome, "email": p.email, "papel": p.papel, "ativo": bool(p.ativo),
                         "liberada": bool(p.extensao_liberada),
                         "navegador": ({"id": d.id, "nome": d.navegador, "desde": d.criado_em, "ultimo_uso": d.ultimo_uso_em}
                                       if (d := dispositivos.get(p.id)) else None)} for p in pessoas],
            "estudo": [{"id": c.id, "nome": c.nome, "conta_ml": contas[c.id].apelido if c.id in contas else ""}
                       for c in estudo]}


@router.put("/admin/usuarios/{usuario_id}")
def liberar(usuario_id: int, dados: Liberacao, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    p = db.get(Usuario, usuario_id)
    if not p or p.empresa_id != usuario.empresa_id or p.papel not in acesso.EQUIPE:
        raise HTTPException(404, "Pessoa da equipe não encontrada.")
    p.extensao_liberada = dados.liberada
    if not dados.liberada:
        for d in db.query(DispositivoExtensao).filter_by(usuario_id=p.id, ativo=True):
            d.ativo = False
    registrar(db, usuario.empresa_id, "usuario",
              f"{'Liberou' if dados.liberada else 'Bloqueou'} a extensão Monvatti Pro para {p.nome}", usuario=usuario)
    db.commit()
    return {"liberada": bool(p.extensao_liberada)}


@router.post("/admin/usuarios/{usuario_id}/codigo")
def codigo(usuario_id: int, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    p = db.get(Usuario, usuario_id)
    if not p or p.empresa_id != usuario.empresa_id or p.papel not in acesso.EQUIPE:
        raise HTTPException(404, "Pessoa da equipe não encontrada.")
    try:
        return {"codigo": extensao.gerar_codigo(db, usuario, p), "validade_min": extensao.VALIDADE_CODIGO_S // 60}
    except ExtensaoNegada as e:
        _negar(e)


@router.delete("/admin/dispositivos/{dispositivo_id}")
def desligar(dispositivo_id: int, usuario: Usuario = Depends(exigir_admin), db: Session = Depends(get_db)):
    d = db.get(DispositivoExtensao, dispositivo_id)
    if not d or d.empresa_id != usuario.empresa_id:
        raise HTTPException(404, "Navegador não encontrado.")
    d.ativo = False
    dono = db.get(Usuario, d.usuario_id)
    registrar(db, usuario.empresa_id, "usuario", f"Desligou o navegador da extensão de {dono.nome if dono else '?'}",
              usuario=usuario)
    db.commit()
    return {"ok": True}


@router.get("/versao")
def versao():
    return {"versao": extensao.versao_arquivos()}


@router.post("/parear")
def parear(dados: Pareamento, db: Session = Depends(get_db)):
    try:
        return {"token": extensao.parear(db, dados.codigo, dados.chave, dados.navegador)}
    except ExtensaoNegada as e:
        _negar(e)


@router.get("/eu")
def eu(conta_ml: str = "", usuario: Usuario = Depends(usuario_da_extensao), db: Session = Depends(get_db)):
    return {"nome": usuario.nome, "papel": usuario.papel, "conta": extensao.situacao_conta(db, usuario, conta_ml),
            "clientes": extensao.clientes_para_copiar(db, usuario), "imposto_padrao": extensao.IMPOSTO_PADRAO}


@router.post("/anuncio")
def anuncio(dados: Pagina, usuario: Usuario = Depends(usuario_da_extensao), db: Session = Depends(get_db)):
    try:
        cliente_estudo = extensao.exigir_conta_estudo(db, usuario, dados.conta_ml)
        consumir(uso_pesquisa, usuario.id)
        return extensao.analisar(db, usuario, cliente_estudo, dados.pagina)
    except ExtensaoNegada as e:
        _negar(e)


@router.post("/tarifas")
def tarifas(dados: Precificacao, usuario: Usuario = Depends(usuario_da_extensao), db: Session = Depends(get_db)):
    try:
        cliente_estudo = extensao.exigir_conta_estudo(db, usuario, dados.conta_ml)
        return extensao.custos_de_venda(db, cliente_estudo, dados.preco, dados.categoria_id, dados.tipo,
                                         dados.vendedor_id, dados.item_id)
    except ExtensaoNegada as e:
        _negar(e)


@router.post("/busca")
def busca(dados: Busca, usuario: Usuario = Depends(usuario_da_extensao), db: Session = Depends(get_db)):
    try:
        cliente_estudo = extensao.exigir_conta_estudo(db, usuario, dados.conta_ml)
        consumir(uso_pesquisa, usuario.id)
        return extensao.analisar_busca(db, usuario, cliente_estudo, dados.itens)
    except ExtensaoNegada as e:
        _negar(e)


@router.post("/copiar")
def copiar(dados: Copia, tarefas: BackgroundTasks, usuario: Usuario = Depends(usuario_da_extensao), db: Session = Depends(get_db)):
    try:
        r = extensao.copiar(db, usuario, dados.cliente_id, dados.pagina, com_fotos=False)
    except ExtensaoNegada as e:
        _negar(e)
    tarefas.add_task(extensao.fotos_da_copia, usuario.id, dados.pagina, r["cliente_id"])
    return r


@router.post("/fotos")
def salvar_fotos(dados: FotosDaPagina, usuario: Usuario = Depends(usuario_da_extensao), db: Session = Depends(get_db)):
    try:
        return extensao.salvar_fotos(db, usuario, dados.pagina, dados.cliente_id)
    except ExtensaoNegada as e:
        _negar(e)


@router.post("/estudo")
def estudo(dados: Estudo, usuario: Usuario = Depends(usuario_da_extensao), db: Session = Depends(get_db)):
    conteudo = estudo_mercado.planilha(dados.pesquisa, dados.filtro, dados.imposto, dados.itens)
    nome = re.sub(r"[^a-z0-9]+", "-", (dados.pesquisa or "busca").lower()).strip("-")[:50] or "busca"
    registrar(db, usuario.empresa_id, "usuario", f"Gerou estudo de mercado “{dados.pesquisa or 'busca'}” "
              f"com {len(dados.itens)} anúncios pela extensão", usuario=usuario)
    db.commit()
    return Response(conteudo, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="estudo-{nome}-{date.today():%Y-%m-%d}.xlsx"'})
