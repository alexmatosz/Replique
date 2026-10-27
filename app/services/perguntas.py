"""Perguntas de compradores no Mercado Livre: a IA escreve, o operador aprova.

Toda resposta passa por uma trava: telefone, e-mail, link ou convite para
negociar fora do Mercado Livre são proibidos e geram punição na conta.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.marketplaces.base import ErroMarketplace
from app.marketplaces.registry import obter_adaptador
from app.models import Anuncio, Cliente, Publicacao, Usuario
from app.services import ia
from app.services.auditoria import registrar

MAX_RESPOSTA = 2000
_PROIBIDO = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "e-mail"),
    (re.compile(r"https?://|www\.|\.com(\.br)?\b", re.I), "link"),
    (re.compile(r"(\d[\s.\-()]*){8,}"), "telefone ou número longo"),
    (re.compile(r"\b(whats\s?app|wpp|zap|telegram|instagram|insta|facebook|tiktok|pix direto)\b", re.I),
     "contato ou rede social"),
    (re.compile(r"\b(fora do mercado ?livre|me chama no|chama no privado|meu n[uú]mero)\b", re.I),
     "negociação fora do Mercado Livre"),
]


def conferir_resposta(texto: str) -> str:
    texto = (texto or "").strip()
    if len(texto) < 2:
        raise ValueError("Escreva a resposta.")
    if len(texto) > MAX_RESPOSTA:
        raise ValueError(f"A resposta passa de {MAX_RESPOSTA} caracteres.")
    if "[complete" in texto:
        raise ValueError("Complete o trecho entre colchetes antes de enviar.")
    for padrao, nome in _PROIBIDO:
        if padrao.search(texto):
            raise ValueError(f"A resposta tem {nome}. O Mercado Livre proíbe isso nas respostas e pune a conta.")
    return texto


def _adaptador(db: Session, cliente: Cliente):
    adaptador, aviso = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    return adaptador, aviso


def _demo() -> list[dict]:
    return [
        {"id": 1001, "texto": "Serve em voltagem 220v?", "item_id": "MLB-DEMO-1", "data": "2026-09-27T10:12:00Z",
         "titulo": "Garrafa Térmica Inox 1 Litro (demonstração)"},
        {"id": 1002, "texto": "Tem pronta entrega na cor preta?", "item_id": "MLB-DEMO-2", "data": "2026-09-27T09:40:00Z",
         "titulo": "Fone Bluetooth (demonstração)"},
    ]


def listar(db: Session, cliente: Cliente) -> dict:
    adaptador, aviso = _adaptador(db, cliente)
    if adaptador.demo:
        return {"demo": True, "aviso": aviso, "perguntas": _demo()}
    try:
        brutas = adaptador.perguntas_pendentes()
        titulos = {i["id"]: i for i in adaptador.itens(list({q["item_id"] for q in brutas if q.get("item_id")}))}
    except ErroMarketplace as e:
        raise ValueError(e.mensagem) from e
    return {"demo": False, "aviso": "", "perguntas": [
        {"id": q["id"], "texto": q.get("text", ""), "item_id": q.get("item_id"), "data": q.get("date_created"),
         "titulo": titulos.get(q.get("item_id"), {}).get("title", ""),
         "link": titulos.get(q.get("item_id"), {}).get("permalink", "")} for q in brutas]}


def central(clientes: list[Cliente], ao_vivo: bool = False) -> dict:
    """Perguntas sem resposta de vários clientes de uma vez (central do operador).
    Clientes sem a conta do ML conectada não entram na lista; só são contados."""
    from concurrent.futures import ThreadPoolExecutor

    from app.db import SessionLocal

    def ler(cliente: Cliente) -> dict:
        with SessionLocal() as db:
            from app import config
            from app.services.agendador import leitura
            guardada = leitura(db, "perguntas", cliente.id)
            if not ao_vivo and guardada and guardada.dados and not guardada.erro and guardada.lida_em and                     (datetime.now(timezone.utc) - (guardada.lida_em if guardada.lida_em.tzinfo else guardada.lida_em.replace(tzinfo=timezone.utc))
                     ).total_seconds() < config.AGENDA_PERGUNTAS_MIN * 120:
                return {"id": cliente.id, "nome": cliente.nome, "perguntas": guardada.dados.get("perguntas", []),
                        "lida_em": guardada.lida_em}
            adaptador, _ = _adaptador(db, cliente)
            if adaptador.demo or getattr(adaptador, "sem_conta", False):
                return {"id": cliente.id, "nome": cliente.nome, "sem_conta": True, "perguntas": []}
            try:
                r = listar(db, cliente)
                return {"id": cliente.id, "nome": cliente.nome, "perguntas": r["perguntas"], "lida_em": datetime.now(timezone.utc)}
            except ValueError as e:
                return {"id": cliente.id, "nome": cliente.nome, "erro": str(e), "perguntas": []}

    with ThreadPoolExecutor(max_workers=6) as pool:
        lidos = list(pool.map(ler, clientes))
    perguntas = sorted(({**q, "cliente_id": c["id"], "cliente_nome": c["nome"]} for c in lidos for q in c["perguntas"]),
                       key=lambda q: q.get("data") or "", reverse=True)
    return {"perguntas": perguntas,
            "clientes": [{k: c.get(k) for k in ("id", "nome", "erro", "sem_conta", "lida_em")} | {"pendentes": len(c["perguntas"])}
                         for c in lidos],
            "sem_conta": sum(1 for c in lidos if c.get("sem_conta"))}


def _dados_do_anuncio(db: Session, cliente: Cliente, item_id: str, adaptador) -> dict:
    """O que a IA pode usar: o rascunho que gerou o anúncio (se foi publicado
    pelo Replique) ou os dados do próprio anúncio no ML."""
    pub = (db.query(Publicacao).filter_by(cliente_id=cliente.id, plataforma="mercadolivre", id_externo=item_id, sucesso=True)
           .order_by(Publicacao.id.desc()).first())
    a = db.get(Anuncio, pub.anuncio_id) if pub else None
    if a:
        return {"titulo": a.titulo, "descricao": (a.descricao or "")[:4000], "preco": a.preco, "estoque": a.estoque,
                "marca": a.marca, "modelo": a.modelo, "condicao": a.condicao, "caracteristicas": a.atributos,
                "peso_kg": a.peso_kg, "dimensoes_cm": a.dimensoes_cm}
    if adaptador.demo:
        return {}
    try:
        item = adaptador.item(item_id)
        desc = adaptador._get(f"/items/{item_id}/description")
        return {"titulo": item.get("title"), "preco": item.get("price"), "estoque": item.get("available_quantity"),
                "condicao": item.get("condition"),
                "caracteristicas": {x.get("name"): x.get("value_name") for x in item.get("attributes") or [] if x.get("value_name")},
                "descricao": (desc.json().get("plain_text", "") if desc.status_code < 400 else "")[:4000]}
    except ErroMarketplace:
        return {}


def sugerir(db: Session, cliente: Cliente, question_id: int, texto: str, item_id: str) -> dict:
    adaptador, _ = _adaptador(db, cliente)
    dados = _dados_do_anuncio(db, cliente, item_id, adaptador)
    saida = ia.responder_pergunta(texto, dados)
    try:
        conferir_resposta(saida["resposta"])
    except ValueError as e:
        if "[complete" not in saida["resposta"]:
            saida["aviso"] = f"Revise antes de enviar: {e}"
    return saida


def responder(db: Session, cliente: Cliente, question_id: int, texto: str, usuario: Usuario | None) -> dict:
    texto = conferir_resposta(texto)
    adaptador, _ = _adaptador(db, cliente)
    if adaptador.demo:
        registrar(db, cliente.empresa_id, "pergunta", f"Simulou a resposta à pergunta {question_id}",
                  cliente_id=cliente.id, usuario=usuario)
        db.commit()
        return {"ok": True, "simulado": True}
    try:
        pergunta = adaptador.pergunta(str(question_id))
        if str(pergunta.get("seller_id")) != adaptador._user_id():
            raise ValueError("Esta pergunta não é da conta deste cliente.")
        adaptador.responder_pergunta(question_id, texto)
    except ErroMarketplace as e:
        raise ValueError(e.mensagem) from e
    registrar(db, cliente.empresa_id, "pergunta", f"Respondeu uma pergunta no Mercado Livre: “{pergunta.get('text', '')[:120]}”",
              cliente_id=cliente.id, usuario=usuario, item_id=pergunta.get("item_id"))
    db.commit()
    return {"ok": True, "simulado": False}
