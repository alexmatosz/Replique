"""Servidor MCP do Replique.

MCP (Model Context Protocol) é o "plugue" padrão que deixa um assistente de
IA — Claude Desktop, Claude Code e outros — usar ferramentas de um sistema.
Com este servidor, você conversa com o Claude e ele opera o Replique:

    "Pesquise 'garrafa térmica' no Mercado Livre e na Shopee, copie o mais
     vendido, melhore o título e me mostre antes de publicar."

Ele usa exatamente as mesmas regras da tela web (app/services/replique.py).

Como rodar: veja a seção "Usar pelo Claude (MCP)" no README.md.
A empresa é identificada pela variável REPLIQUE_API_KEY (gerada em
Configurações na tela web). Cada operação é feita para um CLIENTE da empresa
(listar_clientes); as ações ficam na auditoria como "Claude (MCP)".
"""

import os
import sys
from pathlib import Path

# O Claude Desktop pode iniciar este arquivo a partir de qualquer pasta.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import functools  # noqa: E402

from mcp.server import MCPServer  # noqa: E402
from mcp.server.mcpserver.exceptions import ToolError  # noqa: E402
from mcp.types import ToolAnnotations  # noqa: E402

from app.db import SessionLocal, init_db
from app.marketplaces.base import ErroMarketplace
from app.models import Anuncio, Cliente, Empresa, Publicacao
from app.security import hash_api_key
from app.services import replique

init_db()

mcp = MCPServer(
    name="replique",
    title="Replique — Monvatti",
    instructions=(
        "Replique pesquisa os anúncios que mais vendem no Mercado Livre, Shopee e Amazon, copia um deles "
        "como rascunho, permite editar e publica nas lojas dos CLIENTES da empresa. Comece por "
        "listar_clientes e confirme com o usuário para qual cliente está trabalhando: pesquisa, cópia e "
        "rascunhos são sempre de um cliente, e a publicação vai para a conta do cliente dono do rascunho. "
        "Fluxo: pesquisar_mais_vendidos → "
        "copiar_anuncio → ver_rascunho/editar_rascunho → checar_rascunho (+ validar_no_mercadolivre e "
        "buscar_catalogo_mercadolivre para o ML) → publicar_rascunho. "
        "Ao copiar, reescreva título e descrição com palavras próprias (não publique texto idêntico ao do "
        "concorrente) e lembre o usuário de trocar as fotos por fotos próprias. "
        "Nunca chame publicar_rascunho com confirmar=true sem o usuário ter aprovado explicitamente a "
        "publicação daquele rascunho naquelas plataformas. Resultados com demo=true são fictícios "
        "(plataforma não conectada) — deixe isso claro ao usuário."
    ),
)


def ferramenta(**opcoes):
    """@mcp.tool que devolve ao Claude a mensagem dos erros esperados.

    O SDK MCP esconde o texto de exceções comuns (só diz "Error executing
    tool"); ToolError é repassado. Assim o Claude consegue explicar ao
    usuário o que falta (ex: "A Shopee exige o peso").
    """
    def decorar(fn):
        @functools.wraps(fn)
        def envolvida(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except ErroMarketplace as e:
                raise ToolError(e.mensagem) from e
            except ValueError as e:
                raise ToolError(str(e)) from e
        return mcp.tool(**opcoes)(envolvida)
    return decorar


def _empresa_id(db) -> int:
    chave = os.getenv("REPLIQUE_API_KEY", "").strip()
    if not chave:
        raise ToolError("REPLIQUE_API_KEY não definida. Gere a chave em Configurações no Replique.")
    empresa = db.query(Empresa).filter_by(api_key_hash=hash_api_key(chave), ativa=True).first()
    if not empresa:
        raise ToolError("REPLIQUE_API_KEY inválida ou empresa inativa.")
    return empresa.id


def _cliente(db, empresa_id: int, cliente_id: int | None) -> Cliente:
    """Cliente informado, ou o único cliente ativo quando a empresa só tem um."""
    ativos = db.query(Cliente).filter_by(empresa_id=empresa_id, ativo=True).order_by(Cliente.nome).all()
    if cliente_id is None:
        if len(ativos) == 1:
            return ativos[0]
        opcoes = ", ".join(f"{c.id} = {c.nome}" for c in ativos[:40]) or "nenhum cliente cadastrado"
        raise ToolError(f"Informe cliente_id (use listar_clientes). Clientes: {opcoes}.")
    cliente = next((c for c in ativos if c.id == cliente_id), None)
    if not cliente:
        raise ToolError(f"Cliente {cliente_id} não encontrado ou inativo.")
    return cliente


def _rascunho(db, empresa_id: int, anuncio_id: int) -> Anuncio:
    a = db.get(Anuncio, anuncio_id)
    if not a or a.empresa_id != empresa_id or a.excluido_em:
        raise ValueError(f"Rascunho {anuncio_id} não encontrado.")
    return a


def _resumo_anuncio(a: Anuncio) -> dict:
    return {
        "id": a.id, "status": a.status, "titulo": a.titulo, "preco": a.preco, "estoque": a.estoque,
        "condicao": a.condicao, "marca": a.marca, "modelo": a.modelo, "gtin": a.gtin, "sku": a.sku,
        "peso_kg": a.peso_kg, "dimensoes_cm": a.dimensoes_cm, "fotos": a.fotos, "atributos": a.atributos,
        "descricao": a.descricao, "por_plataforma": a.por_plataforma, "origem": a.origem,
        "cliente_id": a.cliente_id,
    }


@ferramenta(annotations=ToolAnnotations(read_only_hint=True))
def listar_clientes() -> list[dict]:
    """Lista os clientes ativos da empresa (id e nome) e a conta do Mercado Livre conectada de cada um."""
    from app.marketplaces.registry import conta_do_cliente
    with SessionLocal() as db:
        eid = _empresa_id(db)
        saida = []
        for c in db.query(Cliente).filter_by(empresa_id=eid, ativo=True).order_by(Cliente.nome):
            conta = conta_do_cliente(db, c.id, "mercadolivre")
            saida.append({"id": c.id, "nome": c.nome, "mercadolivre": conta.apelido if conta else ""})
        return saida


@ferramenta(annotations=ToolAnnotations(read_only_hint=True))
def status_contas(cliente_id: int | None = None) -> list[dict]:
    """Mostra quais marketplaces do cliente estão conectados de verdade e quais estão em modo demonstração."""
    from app.marketplaces.registry import _pronta, credenciais
    with SessionLocal() as db:
        cliente = _cliente(db, _empresa_id(db), cliente_id)
        saida = []
        for p in ("mercadolivre", "shopee", "amazon"):
            _, cred = credenciais(db, cliente.id, p)
            ok_p, motivo_p = _pronta(p, cred, "pesquisar")
            ok_pub, motivo_pub = _pronta(p, cred, "publicar")
            saida.append({"plataforma": p, "pesquisa_real": ok_p, "motivo_pesquisa": motivo_p,
                          "publicacao_real": ok_pub, "motivo_publicacao": motivo_pub})
        return saida


@ferramenta(annotations=ToolAnnotations(read_only_hint=False, open_world_hint=True))
def pesquisar_mais_vendidos(termo: str, plataformas: list[str], limite: int = 10,
                            categoria_ml: str | None = None, todas_marcas: bool = False,
                            cliente_id: int | None = None) -> dict:
    """Pesquisa os anúncios que mais vendem para um produto.

    termo: nome do produto (ex: "fone bluetooth jbl").
    cliente_id: cliente para quem se pesquisa (listar_clientes); a pesquisa usa as contas dele.
    plataformas: qualquer combinação de "mercadolivre", "shopee", "amazon".
    limite: quantos resultados por plataforma (1-50).
    categoria_ml: ID de categoria do Mercado Livre para forçar (use um dos IDs de
      meta.mercadolivre.categorias_sugeridas se a categoria escolhida não fizer sentido).
    Com marca no termo ("furadeira vonder"), o Mercado Livre faz busca EXATA: só vem aquela
    marca, na ordem em que o ML a posiciona (meta.mercadolivre.busca.modo == "exata").
    todas_marcas=true desliga isso e traz os mais vendidos da categoria de todas as marcas.
    Resultados do ML com extra.restrito=true são anúncios cujos dados o ML não libera
    (só posição, visitas e link); prefira copiar os do tipo PRODUCT, que vêm completos.
    Retorna os resultados ordenados por popularidade (0-100, comparável entre plataformas),
    com a origem do sinal (posição no ranking de mais vendidos, vendas ou sales rank)
    e um resumo de faixa de preço por plataforma. Guarde pesquisa_id para copiar_anuncio.
    """
    with SessionLocal() as db:
        cliente = _cliente(db, _empresa_id(db), cliente_id)
        p = replique.pesquisar(db, cliente, termo, plataformas, max(1, min(limite, 50)),
                               categoria_ml=categoria_ml, todas_marcas=todas_marcas)
        campos = ("posicao_geral", "plataforma", "id_externo", "tipo", "titulo", "preco", "popularidade",
                  "origem_sinal", "vendidos", "avaliacao", "link", "demo", "extra")
        return {"pesquisa_id": p.id, "cliente": {"id": cliente.id, "nome": cliente.nome}, "avisos": p.avisos, "resumo": replique.resumo_mercado(p.resultados),
                "meta": p.meta or {},
                "resultados": [{c: r.get(c) for c in campos} for r in p.resultados]}


@ferramenta()
def copiar_anuncio(plataforma: str, id_externo: str, tipo: str = "ITEM", pesquisa_id: int | None = None,
                   cliente_id: int | None = None) -> dict:
    """Copia um anúncio (de um resultado da pesquisa) para dentro do Replique como rascunho editável do cliente.

    Use plataforma, id_externo e tipo exatamente como vieram em pesquisar_mais_vendidos, e o mesmo cliente_id.
    """
    with SessionLocal() as db:
        cliente = _cliente(db, _empresa_id(db), cliente_id)
        resultado = None
        if pesquisa_id:
            from app.models import Pesquisa
            pq = db.get(Pesquisa, pesquisa_id)
            if pq and pq.cliente_id == cliente.id:
                resultado = next((r for r in pq.resultados if r["id_externo"] == id_externo), None)
        return _resumo_anuncio(replique.copiar(db, cliente, plataforma, id_externo, tipo, resultado))


@ferramenta(annotations=ToolAnnotations(read_only_hint=True))
def listar_rascunhos(cliente_id: int | None = None) -> list[dict]:
    """Lista os rascunhos/anúncios do cliente, do mais recente para o mais antigo."""
    with SessionLocal() as db:
        cliente = _cliente(db, _empresa_id(db), cliente_id)
        q = (db.query(Anuncio).filter(Anuncio.cliente_id == cliente.id, Anuncio.excluido_em.is_(None))
             .order_by(Anuncio.atualizado_em.desc()).limit(50))
        return [{"id": a.id, "titulo": a.titulo, "preco": a.preco, "status": a.status,
                 "origem": a.origem.get("plataforma")} for a in q]


@ferramenta(annotations=ToolAnnotations(read_only_hint=True))
def ver_rascunho(anuncio_id: int) -> dict:
    """Mostra todos os campos de um rascunho."""
    with SessionLocal() as db:
        return _resumo_anuncio(_rascunho(db, _empresa_id(db), anuncio_id))


@ferramenta(annotations=ToolAnnotations(idempotent_hint=True))
def editar_rascunho(
    anuncio_id: int,
    titulo: str | None = None,
    descricao: str | None = None,
    preco: float | None = None,
    estoque: int | None = None,
    condicao: str | None = None,
    marca: str | None = None,
    modelo: str | None = None,
    gtin: str | None = None,
    sku: str | None = None,
    peso_kg: float | None = None,
    fotos: list[str] | None = None,
    atributos: dict | None = None,
    por_plataforma: dict | None = None,
) -> dict:
    """Edita um rascunho. Só os campos informados mudam.

    fotos: lista COMPLETA de URLs, na ordem (a primeira é a capa).
    atributos: dicionário COMPLETO de características, ex {"Cor": "Preto", "Material": "Aço"}.
    por_plataforma: ajustes por plataforma, mesclados com os atuais, ex
      {"mercadolivre": {"category_id": "MLB1234", "listing_type_id": "gold_special",
                        "catalog_product_id": "MLB24076624", "modo_catalogo": "ambos"},
       "shopee": {"category_id": 100001}, "amazon": {"product_type": "BOTTLE", "atributos": {"color": "Preto"}}}.
    condicao: "new" ou "used".
    """
    campos = {k: v for k, v in dict(titulo=titulo, descricao=descricao, preco=preco, estoque=estoque,
                                     condicao=condicao, marca=marca, modelo=modelo, gtin=gtin, sku=sku,
                                     peso_kg=peso_kg, fotos=fotos, atributos=atributos,
                                     por_plataforma=por_plataforma).items() if v is not None}
    with SessionLocal() as db:
        a = _rascunho(db, _empresa_id(db), anuncio_id)
        replique.editar(db, a, campos)
        return _resumo_anuncio(a)


def _ml_real(db, anuncio: Anuncio):
    """Mercado Livre com a conta do cliente dono do rascunho."""
    from app.marketplaces.registry import obter_adaptador
    adaptador, aviso = obter_adaptador(db, anuncio.cliente_id, "mercadolivre", "publicar")
    if adaptador.demo:
        raise ToolError(f"Mercado Livre não conectado ({aviso}). Conecte em Contas no Replique.")
    return adaptador


@ferramenta(annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True))
def validar_no_mercadolivre(anuncio_id: int) -> dict:
    """Pergunta ao próprio Mercado Livre se o rascunho seria aceito, SEM publicar.
    Funciona em qualquer categoria e aponta atributos condicionais (ex.: GTIN).
    Use antes de publicar_rascunho no Mercado Livre."""
    with SessionLocal() as db:
        a = _rascunho(db, _empresa_id(db), anuncio_id)
        r = _ml_real(db, a).validar(a)
        db.commit()  # cache das fotos enviadas
        return r


@ferramenta(annotations=ToolAnnotations(read_only_hint=True, open_world_hint=True))
def buscar_catalogo_mercadolivre(anuncio_id: int, termo: str | None = None) -> dict:
    """Procura o produto no catálogo do Mercado Livre (por GTIN e por texto no domínio da categoria).

    Para associar, use editar_rascunho com por_plataforma={"mercadolivre": {"catalog_product_id": ID,
    "modo_catalogo": "ambos"|"lista"|"catalogo"}}. "ambos" publica na lista geral e no catálogo, ligados.
    Só associe quando marca, modelo e ficha técnica forem exatamente o produto do usuário (produto
    diferente gera reclamação e bloqueio no catálogo) — confirme com o usuário.
    """
    with SessionLocal() as db:
        a = _rascunho(db, _empresa_id(db), anuncio_id)
        return _ml_real(db, a).buscar_catalogo(a, termo)


@ferramenta(annotations=ToolAnnotations(read_only_hint=True))
def checar_rascunho(anuncio_id: int, plataformas: list[str]) -> dict:
    """Confere se o rascunho pode ser publicado em cada plataforma (erros bloqueiam; avisos são dicas)."""
    with SessionLocal() as db:
        a = _rascunho(db, _empresa_id(db), anuncio_id)
        return replique.checar(a, replique.validar_plataformas(plataformas))


@ferramenta(annotations=ToolAnnotations(destructive_hint=False, open_world_hint=True))
def publicar_rascunho(anuncio_id: int, plataformas: list[str], confirmar: bool = False) -> dict:
    """Publica o rascunho nas lojas do usuário nas plataformas escolhidas.

    Isto cria anúncios REAIS e visíveis para compradores quando a plataforma está conectada, nas contas
    do cliente dono do rascunho (a prévia mostra qual).
    Só passe confirmar=true depois que o usuário aprovar explicitamente. Com confirmar=false,
    retorna apenas a checagem do que aconteceria.
    """
    with SessionLocal() as db:
        a = _rascunho(db, _empresa_id(db), anuncio_id)
        plataformas = replique.validar_plataformas(plataformas)
        if not confirmar:
            cliente = db.get(Cliente, a.cliente_id)
            return {"publicado": False, "mensagem": "Prévia apenas. Peça a aprovação do usuário e chame de novo "
                                                    "com confirmar=true.",
                    "cliente": {"id": cliente.id, "nome": cliente.nome} if cliente else None,
                    "checagem": replique.checar(a, plataformas)}
        pubs: list[Publicacao] = replique.publicar(db, a, plataformas)
        return {"status": a.status, "publicacoes": [
            {"plataforma": p.plataforma, "sucesso": p.sucesso, "demo": p.demo, "id_externo": p.id_externo,
             "link": p.link, "mensagem": p.mensagem} for p in pubs]}


if __name__ == "__main__":
    transporte = sys.argv[1] if len(sys.argv) > 1 else "stdio"
    mcp.run(transport=transporte)
