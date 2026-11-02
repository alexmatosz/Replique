"""Extensão Monvatti para o Mercado Livre (estudo de anúncios).

Regras:
- Só usa quem o administrador liberou, e em um navegador só por pessoa.
- O estudo roda apenas com contas de estudo (clientes internos marcados como
  "estudo"). Se o navegador estiver logado numa conta de cliente ou numa conta
  que o Replique não conhece, a extensão fica bloqueada.
- As chamadas à API saem pelo token da conta de estudo, nunca pelo de cliente.
- Vendas de concorrente são estimativas a partir do número público do ML
  ("+50 mil vendidos"); a tela diz isso.
"""

import hashlib
import re
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import httpx

from sqlalchemy.orm import Session

from backend.config import BASE_DIR
from backend.marketplaces.base import ErroMarketplace
from backend.marketplaces.registry import obter_adaptador
from backend.banco.models import Cliente, ContaMarketplace, DispositivoExtensao, LeituraEstudo, Usuario, agora
from backend.security import criar_assinado, hash_token, ler_assinado
from backend.services import acesso, pastas_fotos, replique
from backend.services.auditoria import registrar

VALIDADE_CODIGO_S = 15 * 60
VALIDADE_TOKEN_S = 90 * 24 * 3600
IMPOSTO_PADRAO = 7.0
FATOR_PATAMAR = 1.5525
DIAS_MES = 30.44
_TIPOS = {"gold_pro": "Premium", "gold_special": "Clássico", "free": "Grátis"}
_LOGISTICAS = {"fulfillment": "Full", "self_service": "Flex", "cross_docking": "Coleta", "drop_off": "Correios",
               "xd_drop_off": "Places"}


class ExtensaoNegada(Exception):
    pass


def gerar_codigo(db: Session, admin: Usuario, usuario: Usuario) -> str:
    if not usuario.extensao_liberada:
        raise ExtensaoNegada("Libere a extensão para esta pessoa antes de gerar o código.")
    registrar(db, admin.empresa_id, "usuario", f"Gerou um código para ligar a extensão de {usuario.nome}", usuario=admin)
    db.commit()
    return criar_assinado("extensao_par", {"u": usuario.id, "e": usuario.empresa_id, "n": secrets.token_hex(4)},
                          VALIDADE_CODIGO_S)


def dispositivo_ativo(db: Session, usuario_id: int) -> DispositivoExtensao | None:
    return (db.query(DispositivoExtensao).filter_by(usuario_id=usuario_id, ativo=True)
            .order_by(DispositivoExtensao.id.desc()).first())


def parear(db: Session, codigo: str, chave: str, navegador: str) -> str:
    dados = ler_assinado(codigo.strip(), "extensao_par")
    if not dados:
        raise ExtensaoNegada("Código inválido ou vencido. Peça um novo ao administrador.")
    usuario = db.get(Usuario, dados["u"])
    if not usuario or usuario.empresa_id != dados["e"] or not usuario.ativo or not usuario.extensao_liberada:
        raise ExtensaoNegada("Esta pessoa não está liberada para usar a extensão.")
    if len(chave) < 32:
        raise ExtensaoNegada("Chave do navegador inválida. Reinstale a extensão.")
    atual = dispositivo_ativo(db, usuario.id)
    if atual and atual.chave_hash != hash_token(chave):
        raise ExtensaoNegada("Já existe um navegador ligado para esta pessoa. O administrador precisa desligar o "
                             "anterior em Configurações › Extensão Monvatti.")
    if not atual:
        atual = DispositivoExtensao(empresa_id=usuario.empresa_id, usuario_id=usuario.id, chave_hash=hash_token(chave),
                                    navegador=navegador[:300])
        db.add(atual)
        db.flush()
        registrar(db, usuario.empresa_id, "usuario", f"{usuario.nome} ligou a extensão em um navegador", usuario=usuario)
    atual.ultimo_uso_em = agora()
    db.commit()
    return criar_assinado("extensao", {"u": usuario.id, "d": atual.id, "v": usuario.sessao_versao or 0},
                          VALIDADE_TOKEN_S)


def autenticar(db: Session, token: str, chave: str) -> Usuario:
    dados = ler_assinado(token, "extensao")
    if not dados:
        raise ExtensaoNegada("Extensão desconectada. Ligue de novo com um código do administrador.")
    usuario = db.get(Usuario, dados["u"])
    disp = db.get(DispositivoExtensao, dados["d"])
    if not usuario or not usuario.ativo or dados.get("v", 0) != (usuario.sessao_versao or 0):
        raise ExtensaoNegada("Seu acesso ao Replique mudou. Ligue a extensão de novo.")
    if not usuario.extensao_liberada:
        raise ExtensaoNegada("A extensão não está liberada para você. Fale com o administrador.")
    if not disp or not disp.ativo or disp.usuario_id != usuario.id or disp.chave_hash != hash_token(chave or ""):
        raise ExtensaoNegada("Este navegador não está autorizado. A extensão só funciona no navegador ligado pelo administrador.")
    disp.ultimo_uso_em = agora()
    db.commit()
    return usuario


def _contas_ml(db: Session, empresa_id: int) -> list[tuple[ContaMarketplace, Cliente]]:
    return (db.query(ContaMarketplace, Cliente).join(Cliente, Cliente.id == ContaMarketplace.cliente_id)
            .filter(ContaMarketplace.empresa_id == empresa_id, ContaMarketplace.plataforma == "mercadolivre",
                    ContaMarketplace.ativa.is_(True), Cliente.ativo.is_(True)).all())


def situacao_conta(db: Session, usuario: Usuario, conta_ml: str) -> dict:
    """Confere a conta logada no navegador. Libera só conta de estudo ou navegador deslogado."""
    conta_ml = re.sub(r"\D", "", conta_ml or "")
    contas = _contas_ml(db, usuario.empresa_id)
    estudo = [(c, cl) for c, cl in contas if cl.estudo]
    if not estudo:
        return {"liberado": False, "motivo": "Nenhuma conta de estudo conectada. Marque um cliente interno como "
                                             "“estudo” e conecte a conta do Mercado Livre dele."}
    if not conta_ml:
        return {"liberado": True, "conta": "deslogado", "cliente_estudo_id": estudo[0][1].id}
    for c, cl in contas:
        if c.id_externo == conta_ml:
            if cl.estudo:
                return {"liberado": True, "conta": c.apelido or conta_ml, "cliente_estudo_id": cl.id}
            return {"liberado": False, "motivo": f"Este navegador está logado na conta de um cliente ({cl.nome}). "
                                                 "O estudo só pode ser feito nas contas de estudo."}
    esperadas = ", ".join(f"{c.apelido or c.id_externo} (ID {c.id_externo}, cliente {cl.nome})" for c, cl in estudo)
    return {"liberado": False, "motivo": f"Este navegador está logado na conta do Mercado Livre de ID {conta_ml}, que não "
                                         f"está conectada a nenhum cliente de estudo desta empresa. Contas de estudo: "
                                         f"{esperadas}. Entre com uma delas ou conecte a conta {conta_ml} num cliente "
                                         "marcado como estudo."}


def exigir_conta_estudo(db: Session, usuario: Usuario, conta_ml: str) -> int:
    s = situacao_conta(db, usuario, conta_ml)
    if not s["liberado"]:
        raise ExtensaoNegada(s["motivo"])
    return s["cliente_estudo_id"]


def versao_arquivos() -> str:
    """Impressão digital dos arquivos da extensão: muda quando o código dela muda."""
    pasta = BASE_DIR / "extensao"
    h = hashlib.sha256()
    for arq in sorted(pasta.glob("*")):
        if arq.suffix in {".js", ".json", ".html", ".css"}:
            h.update(arq.name.encode() + arq.read_bytes())
    return h.hexdigest()[:16]


_AVALIACOES_URL = "https://www.mercadolivre.com.br/noindex/catalog/reviews/{item}/search"
_NAVEGADOR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/131.0 Safari/537.36", "Accept": "application/json"}


def avaliacao_mais_antiga(item_id: str, paginas: int = 7) -> str | None:
    """Data da avaliação de comprador mais antiga do anúncio (lista pública da página).

    O ML só entrega 20 por vez e na ordem de relevância; as antigas sobem nas primeiras páginas,
    então lemos as primeiras páginas em paralelo e ficamos com a menor data."""
    def pagina(offset: int) -> list[str]:
        try:
            r = httpx.get(_AVALIACOES_URL.format(item=item_id), headers=_NAVEGADOR, timeout=12,
                          params={"objectId": item_id, "siteId": "MLB", "isItem": "true", "offset": offset, "limit": 20})
        except httpx.HTTPError:
            return []
        return re.findall(r'"created_date"\s*:\s*"(20\d\d-\d\d-\d\dT[\d:]+)', r.text) if r.status_code < 400 else []
    with ThreadPoolExecutor(paginas) as ex:
        datas = [d for lista in ex.map(pagina, range(0, paginas * 20, 20)) for d in lista]
    return min(datas) + "Z" if datas else None


def numero_vendidos(texto: str) -> tuple[int | None, bool]:
    """'+50 mil vendidos' -> (50000, True); '37 vendidos' -> (37, False)."""
    t = (texto or "").lower().replace("\xa0", " ")
    m = re.search(r"(\+)?\s*([\d.,]+)\s*(mil|mi)?\s*vendid", t)
    if not m:
        return None, False
    n = float(m.group(2).replace(".", "").replace(",", "."))
    n *= {"mil": 1000, "mi": 1_000_000}.get(m.group(3) or "", 1)
    return int(n), bool(m.group(1))


def estimar_vendas(vendidos: int | None, patamar: bool) -> int | None:
    """O número público é um piso ("+50 mil" = pelo menos 50 mil): estima o total real em 1,5525 × o piso."""
    if vendidos is None or not patamar:
        return vendidos
    return round(vendidos * FATOR_PATAMAR)


def _dias_desde(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return max((datetime.now(timezone.utc) - d).days, 1)


def _iso(valor: str | None) -> str | None:
    """Normaliza datas do ML (às vezes com nanossegundos) para ISO que o navegador entende."""
    if not valor:
        return None
    try:
        return datetime.fromisoformat(re.sub(r"(\.\d{6})\d+", r"\1", str(valor))).isoformat()
    except ValueError:
        return None


def metricas(vendidos: int | None, patamar: bool, preco: float | None, visitas: int | None,
             dias_vida: int | None, dias_anuncio: int | None = None, hoje: date | None = None) -> dict:
    """Vendas por dia/mês usam a idade mais antiga (anúncio ou catálogo); o ritmo usa a idade do anúncio
    (40% das vendas estimadas no último terço de vida). Os períodos saem do ritmo atual."""
    estimadas = estimar_vendas(vendidos, patamar)
    dias_anuncio = dias_anuncio or dias_vida
    saida = {"vendidos": vendidos, "patamar": patamar, "vendas_estimadas": estimadas, "visitas": visitas,
             "dias": dias_vida, "vendas_dia": None, "vendas_mes": None, "ritmo_mes": None, "conversao_pct": None,
             "faturamento": None, "periodos": None}
    if vendidos == 0:
        saida["vendas_dia"] = saida["vendas_mes"] = 0
    elif vendidos is not None and dias_vida:
        saida["vendas_dia"] = round(vendidos / dias_vida)
        saida["vendas_mes"] = int(vendidos / dias_vida * 30)
    if estimadas is not None and dias_anuncio:
        terco_meses = max(dias_anuncio / DIAS_MES / 3, 1 / DIAS_MES)
        saida["ritmo_mes"] = round(estimadas * 0.4 / terco_meses)
    if vendidos is not None and visitas:
        saida["conversao_pct"] = round(vendidos / visitas * 100, 2)
    if vendidos is not None and preco:
        saida["faturamento"] = round(vendidos * preco, 2)
    if saida["ritmo_mes"] is not None:
        por_dia = saida["ritmo_mes"] / 30
        dia_do_mes = (hoje or date.today()).day
        saida["periodos"] = {
            "total": {"vendas": vendidos, "faturamento": saida["faturamento"]},
            **{chave: {"vendas": round(por_dia * n), "faturamento": round(por_dia * n * preco, 2) if preco else None}
               for chave, n in (("d30", 30), ("d7", 7), ("mes", min(dia_do_mes, (dias_anuncio or 30))))}}
    return saida


def _tarifas(adaptador, preco: float, categoria: str) -> dict:
    saida = {}
    todas = adaptador.tarifas_de_venda(preco, categoria) if preco else {}
    for tipo in ("gold_special", "gold_pro"):
        t = todas.get(tipo)
        if t and "sale_fee_amount" in t:
            detalhes = t.get("sale_fee_details") or {}
            saida[tipo] = {"comissao": float(t.get("sale_fee_amount") or 0) - float(detalhes.get("fixed_fee") or 0),
                           "taxa_fixa": float(detalhes.get("fixed_fee") or 0),
                           "pct": float(detalhes.get("percentage_fee") or 0)}
    return saida


def _frete(adaptador, preco: float, categoria: str, tipo: str, vendedor_id: str = "", item_id: str = "") -> dict | None:
    """Frete do próprio anúncio (peso real, pelo vendedor dele); sem isso, a medida típica da categoria."""
    if not preco:
        return None
    if vendedor_id and item_id:
        f = adaptador.frete_do_anuncio(vendedor_id, item_id, preco)
        if f:
            return {**f, "fonte": "anuncio"}
    if not categoria:
        return None
    medidas = adaptador.medidas_da_categoria(categoria)
    custo = adaptador.custo_frete_gratis(preco, medidas, tipo) if medidas else None
    return {"custo": custo, "peso_g": None, "fonte": "categoria"} if custo is not None else None


def custos_de_venda(db: Session, cliente_estudo_id: int, preco: float, categoria: str, tipo: str,
                    vendedor_id: str = "", item_id: str = "") -> dict:
    """Comissão, taxa fixa e frete do ML para um preço (usado pela calculadora quando o preço muda)."""
    if not preco or preco <= 0:
        raise ExtensaoNegada("Informe um preço de venda maior que zero.")
    if not re.fullmatch(r"MLB\d+", categoria or ""):
        raise ExtensaoNegada("Categoria do anúncio não encontrada. Abra a página de um anúncio.")
    adaptador, aviso = obter_adaptador(db, cliente_estudo_id, "mercadolivre", "pesquisar")
    if aviso:
        raise ExtensaoNegada("A conta de estudo não está conectada ao Mercado Livre. Conecte em Contas.")
    try:
        frete = _frete(adaptador, preco, categoria, tipo or "gold_special", vendedor_id, item_id)
        return {"preco": preco, "tarifas": _tarifas(adaptador, preco, categoria),
                "frete": frete["custo"] if frete else None, "frete_peso_g": frete["peso_g"] if frete else None}
    except ErroMarketplace as e:
        raise ExtensaoNegada(e.mensagem) from e


def _vendedor(adaptador, seller_id: str) -> dict:
    if not seller_id:
        return {}
    r = adaptador._get(f"/users/{seller_id}")
    if r.status_code >= 400:
        return {"id": seller_id}
    u = r.json()
    rep = u.get("seller_reputation") or {}
    return {"id": seller_id, "apelido": u.get("nickname", ""), "termometro": rep.get("level_id") or "",
            "medalha": rep.get("power_seller_status") or "",
            "vendas_total": (rep.get("transactions") or {}).get("total"),
            "cidade": (u.get("address") or {}).get("city", ""),
            "uf": str((u.get("address") or {}).get("state", "")).removeprefix("BR-")}


def _texto(v, n: int) -> str:
    return str(v or "")[:n]


def _num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def analisar(db: Session, usuario: Usuario, cliente_estudo_id: int, pagina: dict) -> dict:
    """Métricas do anúncio aberto no navegador: o que a página mostra + o que a API libera."""
    item_id = _texto(pagina.get("item_id"), 40).upper()
    if not re.fullmatch(r"MLB\d{6,}", item_id):
        raise ExtensaoNegada("Não achei o código do anúncio (MLB…) nesta página.")
    produto_id = _texto(pagina.get("produto_id"), 40).upper()
    adaptador, aviso = obter_adaptador(db, cliente_estudo_id, "mercadolivre", "pesquisar")
    if aviso:
        raise ExtensaoNegada("A conta de estudo não está conectada ao Mercado Livre. Conecte em Contas.")
    vendidos, patamar = numero_vendidos(_texto(pagina.get("vendidos_texto"), 60))
    if vendidos is None and _num(pagina.get("vendidos")) is not None:
        vendidos, patamar = int(_num(pagina.get("vendidos"))), True
    preco = _num(pagina.get("preco"))
    categoria = _texto(pagina.get("categoria_id"), 30)
    tipo = _texto(pagina.get("tipo_anuncio"), 30) or "gold_special"
    vendedor_id = re.sub(r"\D", "", _texto(pagina.get("vendedor_id"), 30))
    criado_em = None
    visitas = None
    try:
        r = adaptador._get(f"/items/{item_id}")
        if r.status_code < 400:
            it = r.json()
            criado_em = it.get("date_created") or it.get("start_time")
            categoria = categoria or it.get("category_id") or ""
            tipo = it.get("listing_type_id") or tipo
            preco = preco or _num(it.get("price"))
            vendedor_id = vendedor_id or str(it.get("seller_id") or "")
        v = adaptador._get("/visits/items", {"ids": item_id})
        if v.status_code < 400:
            visitas = int((v.json() or {}).get(item_id) or 0)
        perguntas = adaptador.primeira_pergunta(item_id)
        catalogo_criado = None
        if produto_id:
            p = adaptador._get(f"/products/{produto_id}")
            if p.status_code < 400:
                catalogo_criado = p.json().get("date_created")
        tarifas = _tarifas(adaptador, preco or 0, categoria)
        frete = _frete(adaptador, preco or 0, categoria, tipo, vendedor_id, item_id)
        vendedor = _vendedor(adaptador, vendedor_id)
    except ErroMarketplace as e:
        raise ExtensaoNegada(e.mensagem) from e
    except httpx.HTTPError as e:
        raise ExtensaoNegada("O Mercado Livre não respondeu agora. Recarregue a página em alguns segundos.") from e
    primeira_pergunta = _iso(perguntas.get("primeira"))
    primeira_avaliacao = None if criado_em else _iso(avaliacao_mais_antiga(item_id))
    evidencias = sorted(((d, f) for d, f in ((primeira_avaliacao, "avaliacao"), (primeira_pergunta, "pergunta")) if d),
                        key=lambda x: -(_dias_desde(x[0]) or 0))
    if criado_em:
        no_ar_desde, fonte_data = criado_em, "anuncio"
    elif evidencias:
        no_ar_desde, fonte_data = evidencias[0]
    elif catalogo_criado:
        no_ar_desde, fonte_data = catalogo_criado, "catalogo"
    else:
        no_ar_desde, fonte_data = None, None
    dias_anuncio = _dias_desde(no_ar_desde)
    dias_vida = max(dias_anuncio or 0, _dias_desde(catalogo_criado) or 0) or None
    saida = {"item_id": item_id, "produto_id": produto_id, "titulo": _texto(pagina.get("titulo"), 300),
             "preco": preco, "categoria_id": categoria, "tipo_id": tipo, "tipo_anuncio": _TIPOS.get(tipo, tipo),
             "logistica": _LOGISTICAS.get(_texto(pagina.get("logistica"), 30), _texto(pagina.get("logistica"), 30)),
             "estoque": _num(pagina.get("estoque")), "criado_em": criado_em, "no_ar_desde": no_ar_desde,
             "data_aproximada": not criado_em and bool(no_ar_desde), "fonte_data": fonte_data,
             "dias_anuncio": dias_anuncio, "primeira_pergunta": primeira_pergunta, "primeira_avaliacao": primeira_avaliacao, "perguntas": perguntas.get("total"),
             "visitas_liberadas": visitas is not None, "catalogo_criado_em": catalogo_criado,
             "dias_catalogo": _dias_desde(catalogo_criado), "tarifas": tarifas,
             "frete": frete["custo"] if frete else None, "frete_peso_g": frete["peso_g"] if frete else None,
             "frete_fonte": frete["fonte"] if frete else None, "vendedor": vendedor,
             "imposto_padrao": IMPOSTO_PADRAO, **metricas(vendidos, patamar, preco, visitas, dias_vida, dias_anuncio)}
    _guardar_leitura(db, usuario, saida, _texto(pagina.get("vendidos_texto"), 40), pagina.get("patrocinado"))
    saida["historico"] = historico(db, usuario.empresa_id, item_id)
    return saida


def _guardar_leitura(db: Session, usuario: Usuario, m: dict, vendidos_texto: str, patrocinado) -> None:
    hoje = date.today()
    leitura = db.query(LeituraEstudo).filter_by(empresa_id=usuario.empresa_id, item_id=m["item_id"], dia=hoje).first()
    if not leitura:
        leitura = LeituraEstudo(empresa_id=usuario.empresa_id, item_id=m["item_id"], dia=hoje)
        db.add(leitura)
    leitura.usuario_id = usuario.id
    leitura.produto_id = m["produto_id"]
    leitura.titulo = m["titulo"]
    leitura.vendidos = m["vendidos"]
    leitura.vendidos_texto = vendidos_texto
    leitura.preco = m["preco"]
    leitura.visitas = m["visitas"]
    if patrocinado is not None:
        leitura.patrocinado = bool(patrocinado)
    leitura.dados = {"vendedor": m["vendedor"].get("apelido", ""), "logistica": m["logistica"], "tipo": m["tipo_anuncio"]}
    leitura.lida_em = agora()
    db.commit()


def historico(db: Session, empresa_id: int, item_id: str, limite: int = 90) -> list[dict]:
    linhas = (db.query(LeituraEstudo).filter_by(empresa_id=empresa_id, item_id=item_id)
              .order_by(LeituraEstudo.dia.desc()).limit(limite).all())
    return [{"dia": x.dia.isoformat(), "vendidos": x.vendidos, "vendidos_texto": x.vendidos_texto, "preco": x.preco,
             "visitas": x.visitas, "patrocinado": x.patrocinado} for x in reversed(linhas)]


def _id_anuncio(valor) -> str:
    item_id = _texto(valor, 40).upper()
    return item_id if re.fullmatch(r"MLB\d{9,10}", item_id) else ""


def analisar_busca(db: Session, usuario: Usuario, cliente_estudo_id: int, itens: list[dict]) -> dict:
    """Dados de cada anúncio de uma página de busca (como os cartões do Avant) e as taxas da categoria.

    Cada anúncio custa algumas chamadas (avaliações, perguntas, tarifa, frete); o que já foi lido hoje
    vem do banco. Vendedor só aparece quando o anúncio tem pergunta (é de onde sai o id do vendedor)."""
    adaptador, aviso = obter_adaptador(db, cliente_estudo_id, "mercadolivre", "pesquisar")
    if aviso:
        raise ExtensaoNegada("A conta de estudo não está conectada ao Mercado Livre. Conecte em Contas.")
    hoje = date.today()
    validos = []
    for it in itens[:100]:
        item_id = _id_anuncio(it.get("item_id"))
        if item_id and item_id not in {v["item_id"] for v in validos}:
            validos.append({**it, "item_id": item_id})
    guardadas = {l.item_id: l for l in db.query(LeituraEstudo).filter(
        LeituraEstudo.empresa_id == usuario.empresa_id, LeituraEstudo.dia == hoje,
        LeituraEstudo.item_id.in_([v["item_id"] for v in validos] or [""]))}
    vendedores: dict[str, dict] = {}
    tarifas_cache: dict[tuple, dict] = {}

    def tarifas(preco: float, categoria: str) -> dict:
        chave = (categoria, round(preco, 2))
        if chave not in tarifas_cache:
            tarifas_cache[chave] = _tarifas(adaptador, preco, categoria) if preco and categoria else {}
        return tarifas_cache[chave]

    def coletar(it: dict) -> dict:
        antes = (guardadas.get(it["item_id"]).dados or {}).get("busca") if guardadas.get(it["item_id"]) else None
        novo_vendedor = re.sub(r"[^0-9]", "", _texto(it.get("vendedor_id"), 30))
        if (antes and antes.get("preco") == _num(it.get("preco")) and "catalogo_criado" in antes
                and (not novo_vendedor or antes.get("vendedor_id") == novo_vendedor)):
            return antes
        vendedor_id = re.sub(r"\D", "", _texto(it.get("vendedor_id"), 30))
        produto_id = _texto(it.get("produto_id"), 40).upper()
        vendedores_catalogo = catalogo_criado = None
        try:
            perguntas = adaptador.primeira_pergunta(it["item_id"])
            vendedor_id = vendedor_id or perguntas.get("vendedor_id") or ""
            frete = adaptador.frete_do_anuncio(vendedor_id, it["item_id"], _num(it.get("preco"))) if vendedor_id else None
            if re.fullmatch(r"MLB\d+", produto_id):
                r = adaptador._get(f"/products/{produto_id}/items", {"limit": 1})
                if r.status_code < 400:
                    vendedores_catalogo = (r.json().get("paging") or {}).get("total")
                p = adaptador._get(f"/products/{produto_id}")
                if p.status_code < 400:
                    catalogo_criado = p.json().get("date_created")
        except (ErroMarketplace, httpx.HTTPError):
            perguntas, frete = {}, None
        return {"preco": _num(it.get("preco")), "primeira_avaliacao": _iso(avaliacao_mais_antiga(it["item_id"], paginas=3)),
                "primeira_pergunta": _iso(perguntas.get("primeira")), "perguntas": perguntas.get("total"),
                "vendedor_id": vendedor_id, "frete": frete["custo"] if frete else None,
                "vendedores_catalogo": vendedores_catalogo, "catalogo_criado": catalogo_criado}

    with ThreadPoolExecutor(16) as ex:
        coletados = list(ex.map(coletar, validos))
    for vid in {c["vendedor_id"] for c in coletados if c["vendedor_id"]}:
        try:
            vendedores[vid] = _vendedor(adaptador, vid)
        except (ErroMarketplace, httpx.HTTPError):
            vendedores[vid] = {"id": vid}
    categorias: dict[str, dict] = {}
    saida = []
    for it, c in zip(validos, coletados):
        preco = _num(it.get("preco"))
        categoria = _texto(it.get("categoria_id"), 30)
        vendidos, patamar = numero_vendidos(_texto(it.get("vendidos_texto"), 60))
        if vendidos is None:
            vendidos, patamar = 0, False
        datas = [d for d in (c["primeira_avaliacao"], c["primeira_pergunta"]) if d]
        no_ar_desde = max(datas, key=lambda d: _dias_desde(d) or 0) if datas else _iso(c.get("catalogo_criado"))
        dias = _dias_desde(no_ar_desde)
        dias_vida = max(dias or 0, _dias_desde(c.get("catalogo_criado")) or 0) or None
        try:
            t = tarifas(preco or 0, categoria)
        except (ErroMarketplace, httpx.HTTPError):
            t = {}
        if categoria and t and categoria not in categorias:
            categorias[categoria] = {k: v["pct"] for k, v in t.items()}
        m = metricas(vendidos, patamar, preco, None, dias_vida, dias)
        saida.append({"item_id": it["item_id"], "no_ar_desde": no_ar_desde, "dias": dias,
                      "fonte_data": "avaliacao" if no_ar_desde and no_ar_desde == c["primeira_avaliacao"] else
                                    "pergunta" if no_ar_desde and no_ar_desde == c["primeira_pergunta"] else
                                    ("catalogo" if no_ar_desde else None),
                      "perguntas": c["perguntas"], "frete": c["frete"], "tarifas": t,
                      "vendedores_catalogo": c.get("vendedores_catalogo"),
                      "tipo": _texto(it.get("tipo"), 30), "logistica": _texto(it.get("logistica"), 30),
                      "vendedor": vendedores.get(c["vendedor_id"], {}), **m})
        leitura = guardadas.get(it["item_id"])
        if not leitura:
            leitura = LeituraEstudo(empresa_id=usuario.empresa_id, item_id=it["item_id"], dia=hoje, usuario_id=usuario.id,
                                    titulo=_texto(it.get("titulo"), 300), produto_id=_texto(it.get("produto_id"), 40).upper())
            db.add(leitura)
            guardadas[it["item_id"]] = leitura
        if vendidos is not None:
            leitura.vendidos, leitura.vendidos_texto = vendidos, _texto(it.get("vendidos_texto"), 40)
        leitura.preco = preco or leitura.preco
        leitura.patrocinado = bool(it.get("patrocinado")) or bool(leitura.patrocinado)
        leitura.dados = {**(leitura.dados or {}), "busca": c}
    db.commit()
    return {"itens": saida, "categorias": categorias}


def clientes_para_copiar(db: Session, usuario: Usuario) -> list[dict]:
    if not acesso.pode_editar(usuario):
        return []
    return [{"id": c.id, "nome": c.nome} for c in acesso.clientes_acessiveis(db, usuario) if not c.estudo]


def copiar(db: Session, usuario: Usuario, cliente_id: int, pagina: dict, com_fotos: bool = True) -> dict:
    """Leva o anúncio aberto para um rascunho do cliente (fotos e texto como base para editar).
    com_fotos=False deixa a pasta de Fotos salvas para depois (ver fotos_da_copia), e o rascunho sai na hora."""
    if not acesso.pode_editar(usuario):
        raise ExtensaoNegada("Só administradores e operadores criam rascunhos.")
    if not acesso.pode_ver(db, usuario, cliente_id):
        raise ExtensaoNegada("Você não atende este cliente.")
    cliente = db.get(Cliente, cliente_id)
    if cliente.estudo:
        raise ExtensaoNegada("Cliente de estudo não recebe rascunhos. Escolha um cliente real.")
    fotos = [f for f in (pagina.get("fotos") or []) if isinstance(f, str) and f.startswith("https://")][:12]
    brutos = pagina.get("atributos") if isinstance(pagina.get("atributos"), dict) else {}
    atributos = {_texto(k, 80): _texto(v, 200) for k, v in list(brutos.items())[:80]}
    dados = {"titulo": _texto(pagina.get("titulo"), 300), "descricao": _texto(pagina.get("descricao"), 50_000),
             "preco": _num(pagina.get("preco")) or 0, "fotos": fotos,
             "marca": _texto(atributos.get("Marca"), 120), "modelo": _texto(atributos.get("Modelo"), 120)}
    try:
        anuncio = replique.criar_em_branco(db, cliente, dados, usuario)
    except ValueError as e:
        raise ExtensaoNegada(str(e)) from e
    anuncio.origem = {"plataforma": "mercadolivre", "via": "extensao", "item_id": _texto(pagina.get("item_id"), 40),
                      "produto_id": _texto(pagina.get("produto_id"), 40), "link": _texto(pagina.get("link"), 500),
                      "atributos_pagina": atributos}
    db.commit()
    pasta_id = None
    if com_fotos:
        try:
            pasta, _, _ = pastas_fotos.salvar(db, usuario, pagina, cliente.id)
            db.commit()
            pasta_id = pasta.id
        except Exception:
            db.rollback()
    return {"anuncio_id": anuncio.id, "cliente_id": cliente.id, "titulo": anuncio.titulo, "pasta_id": pasta_id,
            "fotos_depois": not com_fotos}


def fotos_da_copia(usuario_id: int, pagina: dict, cliente_id: int) -> None:
    """Depois da resposta: baixa as fotos do anúncio copiado para Fotos salvas (falha não afeta o rascunho)."""
    from backend.banco.db import SessionLocal
    with SessionLocal() as db:
        usuario = db.get(Usuario, usuario_id)
        if not usuario:
            return
        try:
            pastas_fotos.salvar(db, usuario, pagina, cliente_id)
            db.commit()
        except Exception:
            db.rollback()


def salvar_fotos(db: Session, usuario: Usuario, pagina: dict, cliente_id: int | None = None) -> dict:
    """Guarda as fotos do anúncio aberto numa pasta do Replique (tela Fotos salvas)."""
    try:
        pasta, novas, falhas = pastas_fotos.salvar(db, usuario, pagina, cliente_id)
    except ValueError as e:
        raise ExtensaoNegada(str(e)) from e
    db.commit()
    return {"pasta_id": pasta.id, "titulo": pasta.titulo, "novas": novas, "falhas": falhas, "total": len(pasta.fotos or [])}
