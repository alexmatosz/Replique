"""Fluxo principal do Replique: pesquisar → copiar → editar → publicar.

Usado tanto pela API web (app/api) quanto pelo servidor MCP (mcp_server.py),
para que as duas portas de entrada se comportem exatamente igual.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

from app.marketplaces.base import LIMITE_TITULO, PLATAFORMAS, ErroMarketplace
from app.marketplaces.registry import obter_adaptador
from app.models import Anuncio, Cliente, Pesquisa, Publicacao, Usuario
from app.services.auditoria import registrar
from app.services.conteudo import palavras_proibidas_no_titulo
from app.services.fotos import FotoInvalida, validar_foto

log = logging.getLogger(__name__)

CAMPOS_EDITAVEIS = {
    "titulo", "descricao", "preco", "estoque", "condicao", "marca", "modelo", "gtin", "sku",
    "peso_kg", "dimensoes_cm", "fotos", "atributos", "por_plataforma", "custo", "imposto_pct",
}
# Tamanho máximo de cada texto (o banco não impõe; sem isso um rascunho vira um arquivo de megabytes)
_MAX_TEXTO = {"titulo": 300, "descricao": 50_000, "marca": 120, "modelo": 120, "gtin": 40, "sku": 80}
# Mudar estes campos exige nova aprovação do lojista
_CAMPOS_DO_CONTEUDO = CAMPOS_EDITAVEIS - {"custo", "imposto_pct", "por_plataforma"}


def _tamanho_json(valor) -> int:
    return len(json.dumps(valor, ensure_ascii=False, default=str))


def bloqueio_aprovacao(db: Session, anuncio: Anuncio) -> str:
    """Motivo pelo qual o rascunho não pode ser publicado ainda ("" = liberado)."""
    cliente = db.get(Cliente, anuncio.cliente_id) if anuncio.cliente_id else None
    if not cliente or not cliente.exige_aprovacao or anuncio.aprovacao == "aprovado":
        return ""
    if anuncio.aprovacao == "recusado":
        return "O lojista recusou este anúncio" + (f": {anuncio.aprovacao_nota}" if anuncio.aprovacao_nota else ".")
    if anuncio.aprovacao == "pendente":
        return "Aguardando a aprovação do lojista."
    return "Este cliente aprova cada anúncio antes da publicação: peça a aprovação do lojista."


def validar_plataformas(plataformas: list[str] | None) -> list[str]:
    plataformas = [p.strip().lower() for p in (plataformas or []) if p and p.strip()]
    invalidas = [p for p in plataformas if p not in PLATAFORMAS]
    if invalidas:
        raise ValueError(f"Plataforma(s) desconhecida(s): {', '.join(invalidas)}. Use: {', '.join(PLATAFORMAS)}.")
    if not plataformas:
        raise ValueError("Selecione pelo menos uma plataforma.")
    return list(dict.fromkeys(plataformas))


# ---------------------------------------------------------------- pesquisa
def pesquisar(db: Session, cliente: Cliente, termo: str, plataformas: list[str],
              limite: int = 20, usuario: Usuario | None = None, categoria_ml: str | None = None,
              todas_marcas: bool = False) -> Pesquisa:
    """Pesquisa com as contas do CLIENTE (o ranking do ML exige o login dele)."""
    termo = (termo or "").strip()
    if len(termo) < 2:
        raise ValueError("Digite o nome do produto para pesquisar.")
    plataformas = validar_plataformas(plataformas)
    adaptadores = {p: obter_adaptador(db, cliente.id, p, "pesquisar") for p in plataformas}

    def rodar(p):
        adaptador, aviso = adaptadores[p]
        try:
            if p == "mercadolivre" and not adaptador.demo:
                itens = adaptador.pesquisar(termo, limite, categoria_id=categoria_ml, todas_marcas=todas_marcas)
            else:
                itens = adaptador.pesquisar(termo, limite)
            return p, [r.to_dict() for r in itens], aviso
        except ErroMarketplace as e:
            return p, [], e.mensagem
        except Exception as e:  # uma plataforma com problema não derruba as outras
            log.exception("Falha pesquisando %s", p)
            return p, [], f"Erro inesperado ao consultar {PLATAFORMAS[p]}: {e}"

    with ThreadPoolExecutor(max_workers=len(plataformas)) as pool:
        saidas = list(pool.map(rodar, plataformas))

    resultados, avisos = [], []
    for p, itens, aviso in saidas:
        resultados.extend(itens)
        if aviso:
            avisos.append({"plataforma": p, "mensagem": aviso})
    resultados.sort(key=lambda r: r["popularidade"], reverse=True)
    for i, r in enumerate(resultados, start=1):
        r["posicao_geral"] = i

    meta = {p: adaptador.meta for p, (adaptador, _) in adaptadores.items() if getattr(adaptador, "meta", None)}
    pesquisa = Pesquisa(empresa_id=cliente.empresa_id, cliente_id=cliente.id,
                        usuario_id=usuario.id if usuario else None, termo=termo,
                        plataformas=plataformas, resultados=resultados, avisos=avisos, meta=meta)
    db.add(pesquisa)
    registrar(db, cliente.empresa_id, "pesquisa", f"Pesquisou “{termo}” ({len(resultados)} resultados)",
              cliente_id=cliente.id, usuario=usuario, plataformas=plataformas)
    db.commit()
    return pesquisa


def resumo_mercado(resultados: list[dict]) -> dict:
    """Faixa de preço e líder de cada plataforma, para ajudar na decisão."""
    resumo = {}
    for p in PLATAFORMAS:
        itens = [r for r in resultados if r["plataforma"] == p]
        precos = sorted(r["preco"] for r in itens if r.get("preco"))
        if not itens:
            continue
        completos = [r for r in itens if not r.get("extra", {}).get("restrito")]
        resumo[p] = {
            "quantidade": len(itens),
            "preco_min": precos[0] if precos else None,
            "preco_mediano": precos[len(precos) // 2] if precos else None,
            "preco_max": precos[-1] if precos else None,
            "lider": (completos or itens)[0]["titulo"],
            "demo": any(r.get("demo") for r in itens),
        }
    return resumo


# ---------------------------------------------------------------- cópia
def copiar(db: Session, cliente: Cliente, plataforma: str, id_externo: str, tipo: str = "ITEM",
           resultado: dict | None = None, usuario: Usuario | None = None) -> Anuncio:
    """Traz um anúncio da plataforma para dentro do Replique como rascunho do cliente."""
    plataforma = validar_plataformas([plataforma])[0]
    adaptador, _ = obter_adaptador(db, cliente.id, plataforma, "copiar")
    if id_externo.startswith("DEMO-") and not adaptador.demo:
        # resultado de demonstração antigo: continua em modo demonstração
        from app.marketplaces.demo import DemoMarketplace
        adaptador = DemoMarketplace(plataforma)
    copia = adaptador.obter_anuncio(id_externo, tipo)

    resultado = resultado or {}
    fotos_origem = _fotos_seguras([f for f in copia.fotos if f] or ([resultado["imagem"]] if resultado.get("imagem") else []),
                                  cliente.empresa_id)
    anuncio = Anuncio(
        empresa_id=cliente.empresa_id, cliente_id=cliente.id,
        criado_por_id=usuario.id if usuario else None, atualizado_por_id=usuario.id if usuario else None,
        # resultado "restrito" (o ML não libera os dados) não tem título de verdade
        titulo=copia.titulo or ("" if resultado.get("extra", {}).get("restrito") else resultado.get("titulo", "")),
        descricao=copia.descricao,
        preco=copia.preco or resultado.get("preco") or 0,
        fotos=list(fotos_origem),
        atributos=copia.atributos, marca=copia.marca, modelo=copia.modelo, gtin=copia.gtin,
        condicao=copia.condicao or "new",
        por_plataforma=copia.por_plataforma,
        origem={
            "plataforma": plataforma, "id_externo": id_externo, "tipo": tipo,
            "link": copia.link or resultado.get("link", ""),
            "titulo_original": copia.titulo,
            "popularidade": resultado.get("popularidade"), "sinal": resultado.get("origem_sinal"),
            "demo": copia.demo,
            # referência para a nota de risco (foto/texto ainda iguais aos do concorrente?)
            "fotos_originais": fotos_origem, "descricao_original": (copia.descricao or "")[:5000],
            "preco_original": copia.preco or resultado.get("preco") or 0,
        },
    )
    db.add(anuncio)
    db.flush()
    registrar(db, cliente.empresa_id, "copia", f"Copiou de {PLATAFORMAS[plataforma]}: “{anuncio.titulo or id_externo}”",
              cliente_id=cliente.id, usuario=usuario, anuncio_id=anuncio.id, plataforma=plataforma,
              id_externo=id_externo)
    db.commit()
    return anuncio


def _fotos_seguras(fotos: list, empresa_id: int) -> list[str]:
    """Fotos vindas de um marketplace: descarta o que não for um endereço válido."""
    saida = []
    for f in fotos[:20]:
        try:
            saida.append(validar_foto(f, empresa_id))
        except FotoInvalida:
            continue
    return saida


def criar_em_branco(db: Session, cliente: Cliente, dados: dict, usuario: Usuario | None = None) -> Anuncio:
    anuncio = Anuncio(empresa_id=cliente.empresa_id, cliente_id=cliente.id, origem={"plataforma": "manual"},
                      criado_por_id=usuario.id if usuario else None)
    db.add(anuncio)
    db.flush()
    registrar(db, cliente.empresa_id, "criacao", f"Criou o rascunho “{dados.get('titulo') or 'sem título'}”",
              cliente_id=cliente.id, usuario=usuario, anuncio_id=anuncio.id)
    editar(db, anuncio, dados, usuario, registrar_edicao=False)
    return anuncio


# ---------------------------------------------------------------- edição
def editar(db: Session, anuncio: Anuncio, dados: dict, usuario: Usuario | None = None,
           registrar_edicao: bool = True) -> Anuncio:
    desconhecidos = set(dados) - CAMPOS_EDITAVEIS
    if desconhecidos:
        raise ValueError(f"Campos não editáveis: {', '.join(sorted(desconhecidos))}")
    for campo, valor in dados.items():
        if campo in _MAX_TEXTO:
            valor = "" if valor is None else str(valor)
            if len(valor) > _MAX_TEXTO[campo]:
                raise ValueError(f"O campo {campo} passa de {_MAX_TEXTO[campo]} caracteres.")
        elif campo in ("atributos", "dimensoes_cm", "por_plataforma"):
            if valor is not None and not isinstance(valor, dict):
                raise ValueError(f"O campo {campo} deve ser um objeto.")
            if _tamanho_json(valor or {}) > 100_000 or len(valor or {}) > 200:
                raise ValueError(f"O campo {campo} está grande demais.")
        elif campo in ("custo", "imposto_pct"):
            valor = float(valor) if valor not in (None, "") else None
            if valor is not None and (valor < 0 or (campo == "imposto_pct" and valor > 100)):
                raise ValueError("Custo e imposto não podem ser negativos (imposto até 100%).")
        if campo == "preco":
            valor = float(valor or 0)
            if valor < 0:
                raise ValueError("Preço não pode ser negativo.")
        elif campo == "estoque":
            valor = int(valor or 0)
        elif campo == "peso_kg":
            valor = float(valor) if valor not in (None, "") else None
        elif campo == "condicao" and valor not in ("new", "used"):
            raise ValueError("Condição deve ser 'new' (novo) ou 'used' (usado).")
        elif campo == "fotos":
            try:
                valor = [validar_foto(f, anuncio.empresa_id) for f in valor or [] if str(f).strip()]
            except FotoInvalida as e:
                raise ValueError(str(e)) from e
            if len(valor) > 20:
                raise ValueError("No máximo 20 fotos por anúncio.")
        elif campo == "por_plataforma":
            # mescla por plataforma para não apagar a configuração das outras
            atual = dict(anuncio.por_plataforma or {})
            for p, cfg in (valor or {}).items():
                atual[p] = {**atual.get(p, {}), **(cfg or {})}
            valor = atual
        setattr(anuncio, campo, valor)
    anuncio.atualizado_por_id = usuario.id if usuario else None
    if anuncio.aprovacao == "aprovado" and set(dados) & _CAMPOS_DO_CONTEUDO:
        # o lojista aprovou a versão anterior, não esta
        anuncio.aprovacao, anuncio.aprovacao_em = "", None
        registrar(db, anuncio.empresa_id, "aprovacao", f"“{anuncio.titulo or 'sem título'}” mudou depois de aprovado: "
                  "precisa de nova aprovação do lojista", cliente_id=anuncio.cliente_id, usuario=usuario, anuncio_id=anuncio.id)
    if registrar_edicao and dados:
        registrar(db, anuncio.empresa_id, "edicao", f"Editou “{anuncio.titulo or 'sem título'}”",
                  cliente_id=anuncio.cliente_id, usuario=usuario, anuncio_id=anuncio.id, campos=sorted(dados))
    db.commit()
    return anuncio


def checar(anuncio: Anuncio, plataformas: list[str]) -> dict:
    """Checagem antes de publicar. `erros` impedem a publicação naquela
    plataforma; `avisos` são recomendações."""
    saida = {}
    fotos_copiadas = anuncio.origem.get("plataforma") not in (None, "manual") and not any(
        f.startswith("/uploads/") for f in anuncio.fotos or [])
    for p in plataformas:
        erros, avisos = [], []
        if not anuncio.titulo.strip():
            erros.append("Título vazio.")
        elif len(anuncio.titulo) > LIMITE_TITULO[p]:
            avisos.append(f"Título tem {len(anuncio.titulo)} caracteres; {PLATAFORMAS[p]} aceita {LIMITE_TITULO[p]} "
                          "— será cortado automaticamente.")
        if proibidas := palavras_proibidas_no_titulo(anuncio.titulo):
            avisos.append(f"Palavras que costumam ser penalizadas no título: {', '.join(proibidas)}.")
        if anuncio.preco <= 0:
            erros.append("Informe o preço.")
        if not anuncio.fotos:
            erros.append("Adicione pelo menos uma foto.")
        elif len(anuncio.fotos) < 3:
            avisos.append("Anúncios com 3 fotos ou mais vendem mais.")
        if fotos_copiadas:
            avisos.append("As fotos ainda são as do anúncio copiado. Troque por fotos próprias: usar foto de outro "
                          "vendedor pode gerar denúncia e pausa do anúncio.")
        if anuncio.titulo.strip() and anuncio.titulo.strip() == (anuncio.origem or {}).get("titulo_original"):
            avisos.append("O título está idêntico ao do concorrente. Use 'Melhorar com IA' ou ajuste o texto.")
        if len(anuncio.descricao or "") < 80:
            avisos.append("Descrição curta: detalhe o produto para reduzir perguntas e devoluções.")
        if p == "mercadolivre":
            cfg_ml = (anuncio.por_plataforma or {}).get("mercadolivre", {})
            if cfg_ml.get("catalog_product_id"):
                onde = {"lista": "só na lista geral", "catalogo": "só no catálogo"}.get(
                    cfg_ml.get("modo_catalogo"), "na lista geral e no catálogo")
                avisos.append(f"Será publicado {onde} (produto {cfg_ml['catalog_product_id']}). Confirme que a "
                              "ficha do catálogo é exatamente o seu produto.")
        if p == "shopee" and not anuncio.peso_kg:
            erros.append("A Shopee exige o peso (kg).")
        if p == "amazon":
            cfg = (anuncio.por_plataforma or {}).get("amazon", {})
            if cfg.get("asin"):
                avisos.append(f"Será criada uma oferta no produto já existente (ASIN {cfg['asin']}). Na Amazon, "
                              "título e fotos são os do catálogo; você concorre por preço.")
            elif not anuncio.gtin:
                avisos.append("Sem EAN/GTIN a Amazon pode exigir isenção de código de barras (GTIN exemption).")
        saida[p] = {"erros": erros, "avisos": avisos, "pode_publicar": not erros}
    return saida


# ---------------------------------------------------------------- publicação
def publicar(db: Session, anuncio: Anuncio, plataformas: list[str], usuario: Usuario | None = None) -> list[Publicacao]:
    """Publica SEMPRE nas contas do cliente dono do rascunho, nunca no cliente
    que estiver selecionado na tela."""
    plataformas = validar_plataformas(plataformas)
    if not anuncio.cliente_id:
        raise ValueError("Este rascunho não está ligado a nenhum cliente.")
    if motivo := bloqueio_aprovacao(db, anuncio):
        raise ValueError(motivo)
    verificacao = checar(anuncio, plataformas)
    publicacoes = []
    for p in plataformas:
        pub = Publicacao(empresa_id=anuncio.empresa_id, cliente_id=anuncio.cliente_id, anuncio_id=anuncio.id,
                         plataforma=p, usuario_id=usuario.id if usuario else None)
        if not verificacao[p]["pode_publicar"]:
            pub.mensagem = "Não publicado: " + " ".join(verificacao[p]["erros"])
        else:
            adaptador, aviso = obter_adaptador(db, anuncio.cliente_id, p, "publicar")
            pub.conta_apelido = adaptador.conta_info.get("apelido", "")
            pub.conta_id_externo = adaptador.conta_info.get("id_externo", "")
            try:
                r = adaptador.publicar(anuncio)
                pub.sucesso, pub.demo, pub.id_externo = r.sucesso, r.demo, r.id_externo
                pub.link, pub.mensagem, pub.detalhes = r.link, r.mensagem, r.detalhes
                if aviso and r.demo:
                    pub.mensagem += f" ({aviso})"
            except ErroMarketplace as e:
                pub.mensagem, pub.detalhes = e.mensagem, e.detalhes
            except Exception as e:
                log.exception("Falha publicando %s", p)
                pub.mensagem = f"Erro inesperado ao publicar em {PLATAFORMAS[p]}: {e}"
        db.add(pub)
        publicacoes.append(pub)
        feito = ("Publicou" if not pub.demo else "Simulou a publicação de") if pub.sucesso else "Tentou publicar"
        registrar(db, anuncio.empresa_id, "publicacao",
                  f"{feito} “{anuncio.titulo or 'sem título'}” em {PLATAFORMAS[p]}"
                  + (f" (conta {pub.conta_apelido})" if pub.conta_apelido else "")
                  + ("" if pub.sucesso else f": {pub.mensagem[:200]}"),
                  cliente_id=anuncio.cliente_id, usuario=usuario, anuncio_id=anuncio.id, plataforma=p,
                  sucesso=pub.sucesso, demo=pub.demo, id_externo=pub.id_externo, link=pub.link)

    reais = [x for x in publicacoes if not x.demo]
    if publicacoes and all(x.sucesso for x in publicacoes):
        anuncio.status = "publicado" if reais else "simulado"
    elif any(x.sucesso for x in publicacoes):
        anuncio.status = "parcial"
    else:
        anuncio.status = "erro"
    db.commit()
    return publicacoes
