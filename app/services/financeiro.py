"""Lucro real das vendas (o "quanto ficou no bolso" do mês).

1. Catálogo de produtos do cliente, com custo e embalagem. Pode ser importado
   dos anúncios do Mercado Livre ou cadastrado à mão.
2. `sincronizar` puxa do ML, para o mês:
   - pedidos: comissão (order_items[].sale_fee), reembolsos dos pagamentos,
     a parte dos cupons e campanhas paga pelo ML (/orders/{id}/discounts) e
     frete pago pelo vendedor (/shipments/{id}/costs → senders[].cost), além do
     estado do comprador (decide ICMS/DIFAL no Presumido e no Real);
   - reclamações (/post-purchase/v1/claims/search): devolvida, reembolsada,
     coberta pelo ML ou ainda aberta, e o frete da devolução;
   - publicidade (Product Ads): gasto de cada anúncio em cada dia.
3. Cada venda chega ao produto (nesta ordem):
   a) vínculo feito à mão com a variação do anúncio;
   b) vínculo feito à mão com o anúncio (todas as variações);
   c) SKU da venda igual ao SKU do produto.
   Sem nenhum dos três, a venda fica "sem vínculo" e a tela oferece vincular.
4. `resumo` calcula na hora, venda a venda:
      lucro = (venda − reembolso + bônus do ML) − comissão − frete − frete da devolução
              − publicidade − imposto − custo − embalagem
   Nada disso fica gravado na venda: corrigir um custo ou um vínculo atualiza
   também os meses já sincronizados.

Rateios:
- frete de carrinho: um envio leva vários pedidos; o custo do envio fica
  inteiro em cada linha e é dividido pelo valor, para não contar duas vezes;
- publicidade: o gasto de um anúncio num dia é dividido entre as vendas desse
  anúncio nesse dia. Gasto em dia sem venda aparece à parte ("Ads sem venda")
  e também sai do lucro do mês.
"""

from __future__ import annotations

import hashlib
import logging
import random
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import config
from app.marketplaces.base import ErroMarketplace
from app.marketplaces.registry import obter_adaptador
from app.models import (
    Cliente, ConfigFinanceira, DespesaOperacional, GastoAds, Produto, RegraTributaria, SincronizacaoVendas, Usuario, Venda,
    VinculoAnuncio,
)
from app.services import impostos, vendas_amazon, vendas_shopee
from app.services.auditoria import registrar

log = logging.getLogger(__name__)

FUSO_BR = timezone(timedelta(hours=-3))
STATUS_VALIDOS = {"paid", "partially_paid", "partially_refunded"}
DEVOLUCAO_COM_PERDA = {"devolvida", "reembolsada"}
MARGEM_BAIXA_PCT = 10.0
REEMBOLSO = {"payment_refunded", "partial_refunded", "reimbursed", "item_returned", "charged_back"}


def chave_sku(v: str | None) -> str:
    return (v or "").strip().upper()


def _num(v) -> float:
    return float(v or 0)


def config_de(db: Session, cliente: Cliente) -> ConfigFinanceira:
    cfg = db.get(ConfigFinanceira, cliente.id)
    if not cfg:
        cfg = ConfigFinanceira(cliente_id=cliente.id, empresa_id=cliente.empresa_id, regime="simples",
                               aliquota_simples_pct=6.0, uf_origem="", credito_custo_pct=0.0, importado=False,
                               cobrar_difal=True, icms_excluido_pis_cofins=True, aliquotas_uf={}, custo_por="sku",
                               embalagem_padrao=0.0, devolucao_volta_estoque=True)
        db.add(cfg)
        db.flush()
    return cfg


def config_dict(cfg: ConfigFinanceira) -> dict:
    return {"regime": cfg.regime, "aliquota_simples_pct": cfg.aliquota_simples_pct, "uf_origem": cfg.uf_origem,
            "pis_cofins_pct": cfg.pis_cofins_pct, "outros_pct": cfg.outros_pct,
            "credito_custo_pct": cfg.credito_custo_pct, "importado": bool(cfg.importado),
            "cobrar_difal": bool(cfg.cobrar_difal), "icms_excluido_pis_cofins": bool(cfg.icms_excluido_pis_cofins),
            "aliquotas_uf": cfg.aliquotas_uf or {}, "embalagem_padrao": cfg.embalagem_padrao or 0,
            "devolucao_volta_estoque": cfg.devolucao_volta_estoque is not False,
            "padroes": {"aliquota_interna": impostos.ALIQUOTA_INTERNA, "pis_cofins": impostos.PIS_COFINS_PADRAO,
                        "outros": impostos.OUTROS_PADRAO}}


def salvar_config(db: Session, cliente: Cliente, dados: dict, usuario: Usuario) -> ConfigFinanceira:
    cfg = config_de(db, cliente)
    regime = dados.get("regime", cfg.regime)
    if regime not in impostos.REGIMES:
        raise ValueError("Regime deve ser Simples Nacional, Lucro Presumido ou Lucro Real.")
    uf = (dados.get("uf_origem") or "").upper()
    if uf and uf not in impostos.ALIQUOTA_INTERNA:
        raise ValueError("Estado de origem inválido.")
    if regime != "simples" and not uf:
        raise ValueError("No Lucro Presumido e no Real, informe o estado de onde a mercadoria sai.")
    proprias = {}
    for k, v in (dados.get("aliquotas_uf") or {}).items():
        k = str(k).upper()
        if k in impostos.ALIQUOTA_INTERNA and v not in (None, ""):
            v = float(v)
            if not 0 <= v <= 40:
                raise ValueError(f"Alíquota de {k} fora do intervalo (0 a 40%).")
            if v != impostos.ALIQUOTA_INTERNA[k]:
                proprias[k] = v
    cfg.regime, cfg.uf_origem, cfg.aliquotas_uf = regime, uf, proprias
    for campo in ("aliquota_simples_pct", "credito_custo_pct", "embalagem_padrao"):
        if dados.get(campo) is not None:
            setattr(cfg, campo, float(dados[campo]))
    for campo in ("pis_cofins_pct", "outros_pct"):
        if campo in dados:
            setattr(cfg, campo, None if dados[campo] in (None, "") else float(dados[campo]))
    for campo in ("importado", "cobrar_difal", "icms_excluido_pis_cofins", "devolucao_volta_estoque"):
        if campo in dados and dados[campo] is not None:
            setattr(cfg, campo, bool(dados[campo]))
    nomes = {"simples": "Simples Nacional", "presumido": "Lucro Presumido", "real": "Lucro Real"}
    registrar(db, cliente.empresa_id, "financeiro", f"Atualizou os impostos da loja ({nomes[regime]})",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return cfg


@dataclass
class Casamento:
    produto: Produto
    unidades: int
    via: str


class Catalogo:
    """Produtos e vínculos de um cliente, carregados uma vez por cálculo."""

    def __init__(self, db: Session, cliente_id: int):
        self.produtos = {p.id: p for p in db.query(Produto).filter_by(cliente_id=cliente_id)}
        self.por_sku = {chave_sku(p.sku): p for p in self.produtos.values() if chave_sku(p.sku)}
        self.vinculos = {(v.item_id, v.variacao_id or ""): v for v in db.query(VinculoAnuncio).filter_by(cliente_id=cliente_id)}
        self.regras = {chave_sku(r.sku): r for r in db.query(RegraTributaria).filter_by(cliente_id=cliente_id)}

    def regra(self, casamento, sku: str):
        """Linha da planilha de tributação: pelo SKU do produto do catálogo ou pelo SKU da venda."""
        if casamento and chave_sku(casamento.produto.sku) in self.regras:
            return self.regras[chave_sku(casamento.produto.sku)]
        return self.regras.get(chave_sku(sku))

    def casar(self, item_id: str, variacao_id: str, sku: str) -> Casamento | None:
        for chave in ((item_id, variacao_id or ""), (item_id, "")):
            v = self.vinculos.get(chave)
            if v and v.produto_id in self.produtos:
                return Casamento(self.produtos[v.produto_id], max(1, v.unidades or 1), "vinculo")
        p = self.por_sku.get(chave_sku(sku))
        return Casamento(p, 1, "sku") if p else None


def produto_dict(p: Produto) -> dict:
    return {"id": p.id, "sku": p.sku, "nome": p.nome, "custo": p.custo, "embalagem": p.embalagem, "foto": p.foto,
            "origem": p.origem}


def listar_produtos(db: Session, cliente: Cliente) -> dict:
    """Catálogo com os anúncios ligados a cada produto e a lista de anúncios
    vendidos que ainda não chegam a nenhum produto."""
    cfg = config_de(db, cliente)
    cat = Catalogo(db, cliente.id)
    anuncios: dict[int, dict] = defaultdict(dict)
    for v in cat.vinculos.values():
        if v.produto_id in cat.produtos:
            anuncios[v.produto_id][(v.item_id, v.variacao_id)] = {"item_id": v.item_id, "variacao_id": v.variacao_id,
                                                                   "titulo": v.titulo, "via": "vinculo", "unidades": v.unidades}
    sem_vinculo: dict[tuple, dict] = {}
    vendas_por_produto: dict[int, int] = defaultdict(int)
    for v in db.query(Venda).filter(Venda.cliente_id == cliente.id).order_by(Venda.data_venda.desc()):
        valida = v.status in STATUS_VALIDOS
        c = cat.casar(v.item_id, v.variacao_id, v.sku)
        if c:
            if c.via == "sku":
                anuncios[c.produto.id].setdefault((v.item_id, v.variacao_id), {
                    "item_id": v.item_id, "variacao_id": v.variacao_id, "titulo": v.titulo, "variacao": v.variacao,
                    "via": "sku", "unidades": 1})
            if valida:
                vendas_por_produto[c.produto.id] += v.quantidade
            continue
        linha = sem_vinculo.setdefault((v.item_id, v.variacao_id), {
            "item_id": v.item_id, "variacao_id": v.variacao_id, "titulo": v.titulo, "variacao": v.variacao, "sku": v.sku,
            "vendas": 0, "faturamento": 0.0, "simulada": bool(v.simulada)})
        if valida:
            linha["vendas"] += v.quantidade
            linha["faturamento"] = round(linha["faturamento"] + v.total, 2)
    historico = historico_de_precos(db, cliente, cfg, cat)
    produtos = [{**produto_dict(p), "anuncios": list(anuncios[p.id].values()), "vendidas": vendas_por_produto[p.id],
                 "historico": historico.get(p.id)} for p in cat.produtos.values()]
    produtos.sort(key=lambda x: (x["custo"] is not None, -x["vendidas"], x["nome"].lower()))
    mes = datetime.now(FUSO_BR).strftime("%Y-%m")
    return {"produtos": produtos, "sem_vinculo": sorted(sem_vinculo.values(), key=lambda x: -x["faturamento"]),
            "embalagem_padrao": cfg.embalagem_padrao or 0,
            "sem_custo": sum(1 for p in produtos if p["custo"] is None),
            "precificacao": {"taxa_operacional": taxa_operacional(db, cliente, mes),
                             "padrao": {"comissao_pct": config.ML_COMISSAO_PCT_PADRAO,
                                        "imposto_pct": impostos.calcular(cfg, 100.0, cfg.uf_origem).total}}}


def historico_de_precos(db: Session, cliente: Cliente, cfg: ConfigFinanceira, cat: Catalogo, dias: int = 90) -> dict[int, dict]:
    """Por produto, o que as vendas dos últimos `dias` custaram em % do preço
    (comissão, imposto, publicidade) e em R$ por unidade (frete). É a base do
    preço mínimo: cada produto usa a própria realidade, não uma média geral."""
    fim = datetime.now(FUSO_BR)
    linhas, _, _ = _calcular_periodo(db, cliente, cfg, cat, fim - timedelta(days=dias), fim)
    soma: dict[int, dict] = defaultdict(lambda: defaultdict(float))
    for x in linhas:
        if not x["valida"] or not x["produto"] or x["simulada"]:
            continue
        s = soma[x["produto"]["id"]]
        s["unidades"] += x["quantidade"] * x["produto"]["unidades"]
        s["receita"] += x["total"] - x["reembolso"]
        for campo in ("comissao", "imposto", "ads"):
            s[campo] += x[campo]
        s["frete"] += x["frete"] + x["frete_devolucao"]
    saida = {}
    for pid, s in soma.items():
        if s["unidades"] and s["receita"] > 0:
            saida[pid] = {"unidades": int(s["unidades"]), "preco_medio": round(s["receita"] / s["unidades"], 2),
                          "comissao_pct": round(s["comissao"] / s["receita"] * 100, 2),
                          "imposto_pct": round(s["imposto"] / s["receita"] * 100, 2),
                          "ads_pct": round(s["ads"] / s["receita"] * 100, 2),
                          "frete_unidade": round(s["frete"] / s["unidades"], 2), "dias": dias}
    return saida


def _validar_valores(custo, embalagem):
    for nome, valor in (("custo", custo), ("embalagem", embalagem)):
        if valor is not None and not 0 <= valor <= 1_000_000:
            raise ValueError(f"Valor de {nome} inválido.")


def salvar_produto(db: Session, cliente: Cliente, dados: dict, usuario: Usuario, produto_id: int | None = None) -> Produto:
    nome, sku = (dados.get("nome") or "").strip()[:300], (dados.get("sku") or "").strip()[:80]
    if not nome:
        raise ValueError("Dê um nome ao produto.")
    _validar_valores(dados.get("custo"), dados.get("embalagem"))
    if sku:
        outro = next((p for p in db.query(Produto).filter_by(cliente_id=cliente.id)
                      if chave_sku(p.sku) == chave_sku(sku) and p.id != produto_id), None)
        if outro:
            raise ValueError(f"O SKU {sku} já é do produto “{outro.nome}”.")
    if produto_id:
        p = _produto(db, cliente, produto_id)
    else:
        p = Produto(empresa_id=cliente.empresa_id, cliente_id=cliente.id, origem=dados.get("origem") or "manual")
        db.add(p)
    p.nome, p.sku, p.custo, p.embalagem = nome, sku, dados.get("custo"), dados.get("embalagem")
    p.foto = (dados.get("foto") or p.foto or "")[:500]
    p.atualizado_por_id = usuario.id
    db.flush()
    registrar(db, cliente.empresa_id, "financeiro", f"{'Editou' if produto_id else 'Cadastrou'} o produto “{nome}”",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return p


def _produto(db: Session, cliente: Cliente, produto_id: int) -> Produto:
    p = db.get(Produto, produto_id)
    if not p or p.cliente_id != cliente.id:
        raise LookupError("Produto não encontrado.")
    return p


def excluir_produto(db: Session, cliente: Cliente, produto_id: int, usuario: Usuario) -> None:
    p = _produto(db, cliente, produto_id)
    db.query(VinculoAnuncio).filter_by(cliente_id=cliente.id, produto_id=p.id).delete()
    registrar(db, cliente.empresa_id, "financeiro", f"Excluiu o produto “{p.nome}”", cliente_id=cliente.id, usuario=usuario)
    db.delete(p)
    db.commit()


def salvar_custos(db: Session, cliente: Cliente, itens: list[dict], usuario: Usuario) -> int:
    """Edição rápida de custo/embalagem de vários produtos."""
    alterados = 0
    for it in itens:
        p = _produto(db, cliente, int(it.get("id") or 0))
        _validar_valores(it.get("custo"), it.get("embalagem"))
        if (p.custo, p.embalagem) != (it.get("custo"), it.get("embalagem")):
            p.custo, p.embalagem, p.atualizado_por_id = it.get("custo"), it.get("embalagem"), usuario.id
            alterados += 1
    if alterados:
        registrar(db, cliente.empresa_id, "financeiro", f"Atualizou o custo de {alterados} produto(s)",
                  cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return alterados


def vincular(db: Session, cliente: Cliente, dados: dict, usuario: Usuario) -> VinculoAnuncio:
    """Liga um anúncio (ou só uma variação) a um produto do catálogo."""
    item_id = (dados.get("item_id") or "").strip()[:40]
    if not item_id:
        raise ValueError("Informe o anúncio.")
    p = _produto(db, cliente, int(dados.get("produto_id") or 0))
    unidades = int(dados.get("unidades") or 1)
    if not 1 <= unidades <= 100:
        raise ValueError("Unidades por venda deve ser de 1 a 100.")
    variacao = "" if dados.get("todas_variacoes") else (dados.get("variacao_id") or "").strip()[:40]
    v = db.query(VinculoAnuncio).filter_by(cliente_id=cliente.id, plataforma="mercadolivre", item_id=item_id,
                                           variacao_id=variacao).first()
    if not v:
        v = VinculoAnuncio(cliente_id=cliente.id, plataforma="mercadolivre", item_id=item_id, variacao_id=variacao)
        db.add(v)
    v.produto_id, v.unidades, v.criado_por_id = p.id, unidades, usuario.id
    v.titulo = (dados.get("titulo") or v.titulo or "")[:300]
    registrar(db, cliente.empresa_id, "financeiro",
              f"Vinculou o anúncio {item_id} ao produto “{p.nome}”" + (f" ({unidades} unid. por venda)" if unidades > 1 else ""),
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return v


def desvincular(db: Session, cliente: Cliente, item_id: str, variacao_id: str, usuario: Usuario) -> None:
    n = db.query(VinculoAnuncio).filter_by(cliente_id=cliente.id, item_id=item_id, variacao_id=variacao_id or "").delete()
    if not n:
        raise LookupError("Vínculo não encontrado.")
    registrar(db, cliente.empresa_id, "financeiro", f"Desfez o vínculo do anúncio {item_id}", cliente_id=cliente.id,
              usuario=usuario)
    db.commit()


def importar_do_ml(db: Session, cliente: Cliente, usuario: Usuario) -> dict:
    """Traz os anúncios ativos para o catálogo: um produto por SKU; anúncio
    sem SKU vira um produto próprio já vinculado ao anúncio/variação."""
    ml, aviso = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    if ml.demo:
        anuncios = [{"item_id": item, "variacao_id": "", "variacao": "", "titulo": titulo, "sku": sku, "foto": ""}
                    for titulo, sku, _preco, item in _PRODUTOS_DEMO[:5]]
    else:
        try:
            anuncios = ml.anuncios_para_catalogo()
        except ErroMarketplace as e:
            raise ValueError(e.mensagem)
    cat = Catalogo(db, cliente.id)
    criados = vinculados = ja_tinha = 0
    for a in anuncios:
        nome = a["titulo"] + (f" ({a['variacao']})" if a.get("variacao") else "")
        if cat.casar(a["item_id"], a["variacao_id"], a["sku"]):
            ja_tinha += 1
            continue
        p = Produto(empresa_id=cliente.empresa_id, cliente_id=cliente.id, sku=a["sku"], nome=nome[:300],
                    foto=(a.get("foto") or "")[:500], origem="mercadolivre", atualizado_por_id=usuario.id)
        db.add(p)
        db.flush()
        cat.produtos[p.id] = p
        if a["sku"]:
            cat.por_sku[chave_sku(a["sku"])] = p
        else:
            v = VinculoAnuncio(cliente_id=cliente.id, plataforma="mercadolivre", item_id=a["item_id"],
                               variacao_id=a["variacao_id"], produto_id=p.id, unidades=1, titulo=a["titulo"][:300],
                               criado_por_id=usuario.id)
            db.add(v)
            cat.vinculos[(v.item_id, v.variacao_id)] = v
            vinculados += 1
        criados += 1
    registrar(db, cliente.empresa_id, "financeiro", f"Importou {criados} produto(s) dos anúncios do Mercado Livre",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return {"anuncios": len(anuncios), "criados": criados, "vinculados": vinculados, "ja_cadastrados": ja_tinha,
            "demo": ml.demo, "aviso": aviso if ml.demo else ""}


def limites_do_mes(mes: str) -> tuple[datetime, datetime]:
    """Início e fim do mês no horário de Brasília (datas com fuso)."""
    try:
        ano, m = (int(x) for x in mes.split("-"))
        ini = datetime(ano, m, 1, tzinfo=FUSO_BR)
    except ValueError:
        raise ValueError("Mês inválido (use AAAA-MM).")
    fim = datetime(ano + (m == 12), m % 12 + 1, 1, tzinfo=FUSO_BR) - timedelta(seconds=1)
    return ini, fim


def _utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc)


def _dia_br(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(FUSO_BR).strftime("%Y-%m-%d")


def _data_ml(texto: str | None) -> datetime | None:
    try:
        return _utc(datetime.fromisoformat(texto)) if texto else None
    except ValueError:
        return None


def _vendas_do_mes(db: Session, cliente_id: int, mes: str, plataforma: str = "mercadolivre"):
    ini, fim = limites_do_mes(mes)
    return (db.query(Venda).filter(Venda.cliente_id == cliente_id, Venda.plataforma == plataforma,
                                   Venda.data_venda >= _utc(ini), Venda.data_venda <= _utc(fim)))


def linhas_do_pedido(pedido: dict) -> list[dict]:
    """Converte um pedido do ML nas linhas de venda (uma por anúncio/variação)."""
    itens = pedido.get("order_items") or []
    pagos = [p for p in pedido.get("payments") or [] if p.get("status") in ("approved", "refunded", "partially_refunded")]
    tarifa_pagamentos = round(sum(_num(p.get("marketplace_fee")) for p in pagos), 2)
    reembolsado = round(sum(_num(p.get("transaction_amount_refunded")) for p in pagos), 2)
    total_pedido = sum(_num(oi.get("unit_price")) * int(oi.get("quantity") or 1) for oi in itens) or 1
    data = _data_ml(pedido.get("date_created")) or _data_ml(pedido.get("date_closed")) or datetime.now(timezone.utc)
    saida = []
    for oi in itens:
        item = oi.get("item") or {}
        qtd = int(oi.get("quantity") or 1)
        unit, tarifa = _num(oi.get("unit_price")), _num(oi.get("sale_fee"))
        comissao = tarifa * qtd
        if len(itens) == 1 and qtd > 1 and tarifa_pagamentos and abs(tarifa_pagamentos - tarifa) < 0.02:
            comissao = tarifa
        variacao = " · ".join(f"{a.get('name')}: {a.get('value_name')}" for a in item.get("variation_attributes") or []
                              if a.get("value_name"))
        total = round(unit * qtd, 2)
        saida.append({
            "pedido_id": str(pedido.get("id")), "pacote_id": str(pedido.get("pack_id") or ""),
            "envio_id": str((pedido.get("shipping") or {}).get("id") or ""), "item_id": str(item.get("id") or ""),
            "variacao_id": str(item.get("variation_id") or ""),
            "sku": str(item.get("seller_sku") or item.get("seller_custom_field") or "")[:80],
            "titulo": str(item.get("title") or "")[:300], "variacao": variacao[:200], "quantidade": qtd,
            "preco_unitario": unit, "total": total, "comissao": round(comissao, 2),
            "reembolso": round(min(reembolsado * total / total_pedido, total), 2),
            "status": str(pedido.get("status") or ""), "data_venda": data})
    return saida


def situacao_da_reclamacao(r: dict) -> tuple[str, bool]:
    """(situação da devolução, produto voltou?) a partir de uma reclamação do ML."""
    tem_devolucao = r.get("type") in ("returns", "return") or any(
        (e if isinstance(e, str) else (e or {}).get("type", "")) == "return" for e in r.get("related_entities") or [])
    if r.get("status") != "closed":
        return "aberta", tem_devolucao
    res = r.get("resolution") or {}
    if res.get("applied_coverage"):
        return "coberta", tem_devolucao
    if res.get("reason") in REEMBOLSO and "complainant" in (res.get("benefited") or []):
        voltou = tem_devolucao or res.get("reason") == "item_returned"
        return ("devolvida" if voltou else "reembolsada"), voltou
    return "", False


def _dados_do_envio(ml, envio_id: str) -> dict:
    try:
        info = ml.envio(envio_id)
        info["frete"] = ml.custo_envio_vendedor(envio_id)
        return info
    except ErroMarketplace as e:
        log.info("Envio %s sem dados: %s", envio_id, e.mensagem)
        return {"erro": e.mensagem}


def sincronizar(db: Session, cliente: Cliente, mes: str, plataforma: str = "mercadolivre") -> dict:
    if plataforma == "shopee":
        return sincronizar_shopee(db, cliente, mes)
    if plataforma == "amazon":
        return sincronizar_amazon(db, cliente, mes)
    if plataforma != "mercadolivre":
        raise ValueError("Plataforma sem sincronização de vendas.")
    ini, fim = limites_do_mes(mes)
    agora = datetime.now(FUSO_BR)
    if ini > agora:
        raise ValueError("Este mês ainda não começou.")
    ate = min(fim, agora)
    ml, aviso = obter_adaptador(db, cliente.id, "mercadolivre", "publicar")
    avisos: list[str] = []
    if ml.demo:
        demo = _dados_demo(cliente, mes, ate)
        linhas, envios, reclamacoes, gastos = demo["linhas"], demo["envios"], demo["reclamacoes"], demo["ads"]
        avisos.append(f"{aviso.rstrip('.')}. As vendas abaixo são fictícias.")
    else:
        try:
            pedidos = ml.pedidos(ini, ate)
        except ErroMarketplace as e:
            raise ValueError(e.mensagem)
        linhas = [linha for p in pedidos for linha in linhas_do_pedido(p)]
        envios = {}
        db.query(Venda).filter(Venda.cliente_id == cliente.id, Venda.demo.is_(True)).delete()
        db.query(GastoAds).filter(GastoAds.cliente_id == cliente.id, GastoAds.simulado.is_(False),
                                  GastoAds.item_id.like("MLB-DEMO%")).delete(synchronize_session=False)
        try:
            reclamacoes = ml.reclamacoes(ini, agora)
        except ErroMarketplace as e:
            reclamacoes = None
            avisos.append(f"Não consegui ler as reclamações/devoluções: {e.mensagem}")
        gastos = _ler_ads(ml, ini, ate, avisos)

    existentes = {(v.pedido_id, v.item_id, v.variacao_id): v for v in _vendas_do_mes(db, cliente.id, mes)
                  if not v.simulada}
    ja_lidos = {v.envio_id for v in existentes.values() if v.frete_envio is not None and v.uf_destino}
    faltam = sorted({linha["envio_id"] for linha in linhas if linha["envio_id"]} - ja_lidos - set(envios))
    if faltam and not ml.demo:
        with ThreadPoolExecutor(max_workers=6) as pool:
            envios.update(zip(faltam, pool.map(lambda e: _dados_do_envio(ml, e), faltam)))
    erros_envio = sum(1 for e in envios.values() if e.get("erro"))
    if erros_envio:
        avisos.append(f"{erros_envio} envio(s) sem custo de frete no momento. Sincronize de novo mais tarde.")

    bonus: dict[str, dict[str, float]] = {}
    novos = sorted({linha["pedido_id"] for linha in linhas} - {k[0] for k in existentes})
    if novos and not ml.demo:
        with ThreadPoolExecutor(max_workers=6) as pool:
            bonus.update(zip(novos, pool.map(ml.bonus_do_pedido, novos)))

    vistos = set()
    for linha in linhas:
        chave = (linha["pedido_id"], linha["item_id"], linha["variacao_id"])
        vistos.add(chave)
        v = existentes.get(chave)
        if not v:
            v = Venda(empresa_id=cliente.empresa_id, cliente_id=cliente.id, plataforma="mercadolivre", demo=ml.demo,
                      simulada=False, devolucao="", reclamacao_id="")
            db.add(v)
            existentes[chave] = v
        for campo, valor in linha.items():
            setattr(v, campo, valor)
        if linha["pedido_id"] in bonus:
            v.bonus_ml = bonus[linha["pedido_id"]].pop(linha["item_id"], 0.0)
        env = envios.get(linha["envio_id"])
        if env and not env.get("erro"):
            v.frete_envio, v.uf_destino, v.logistica = env["frete"], env.get("uf", ""), env.get("logistica", "")
        elif not linha["envio_id"]:
            v.frete_envio = 0.0
    for chave, v in existentes.items():
        if chave not in vistos and not v.demo and v.status != "cancelled":
            v.status = "cancelled"

    if reclamacoes is not None:
        _aplicar_reclamacoes(ml, list(existentes.values()), reclamacoes, avisos)
    if gastos is not None:
        _gravar_ads(db, cliente, ini, ate, gastos, "mercadolivre")

    sinc = db.query(SincronizacaoVendas).filter_by(cliente_id=cliente.id, plataforma="mercadolivre", mes=mes).first()
    if not sinc:
        sinc = SincronizacaoVendas(cliente_id=cliente.id, plataforma="mercadolivre", mes=mes)
        db.add(sinc)
    sinc.pedidos, sinc.demo, sinc.avisos = len({linha["pedido_id"] for linha in linhas}), ml.demo, avisos
    sinc.feita_em = datetime.now(timezone.utc)
    db.commit()
    return {"pedidos": sinc.pedidos, "linhas": len(linhas), "demo": ml.demo, "avisos": avisos,
            "reclamacoes": len(reclamacoes or []), "dias_com_ads": len(gastos or [])}


def _ler_ads(ml, ini: datetime, ate: datetime, avisos: list[str]) -> list[dict] | None:
    try:
        anunciante = ml.anunciante_ads()
        if not anunciante:
            avisos.append("A conta não usa Product Ads (ou a publicidade não está ativada em Meu perfil > Publicidade): "
                          "o lucro está sem gasto de publicidade.")
            return []
        return ml.gastos_ads(anunciante, ini.strftime("%Y-%m-%d"), ate.strftime("%Y-%m-%d"))
    except ErroMarketplace as e:
        avisos.append(f"Não consegui ler o gasto de publicidade: {e.mensagem}")
        return None


def _gravar_ads(db: Session, cliente: Cliente, ini: datetime, ate: datetime, gastos: list[dict],
                plataforma: str = "mercadolivre") -> None:
    """Substitui o gasto de publicidade da plataforma no período (menos os simulados)."""
    de, ate_dia = ini.strftime("%Y-%m-%d"), ate.strftime("%Y-%m-%d")
    db.query(GastoAds).filter(GastoAds.cliente_id == cliente.id, GastoAds.plataforma == plataforma,
                              GastoAds.data >= de, GastoAds.data <= ate_dia,
                              GastoAds.simulado.is_(False)).delete(synchronize_session=False)
    somados: dict[tuple, dict] = {}
    for g in gastos:
        s = somados.setdefault((g["data"], g["item_id"]), {"custo": 0.0, "receita": 0.0, "unidades": 0})
        s["custo"] += g["custo"]
        s["receita"] += g.get("receita", 0)
        s["unidades"] += g.get("unidades", 0)
    for (data, item), s in somados.items():
        db.add(GastoAds(cliente_id=cliente.id, plataforma=plataforma, data=data, item_id=item,
                        custo=round(s["custo"], 2), receita_ads=round(s["receita"], 2), unidades_ads=s["unidades"],
                        simulado=False))


def sincronizar_shopee(db: Session, cliente: Cliente, mes: str) -> dict:
    """Pedidos, taxas e Ads da loja Shopee do cliente no mês."""
    ini, fim = limites_do_mes(mes)
    agora = datetime.now(FUSO_BR)
    if ini > agora:
        raise ValueError("Este mês ainda não começou.")
    ate = min(fim, agora)
    loja, aviso = obter_adaptador(db, cliente.id, "shopee", "publicar")
    if loja.demo or not hasattr(loja, "pedidos"):
        motivo = aviso or "loja não conectada"
        raise ValueError(f"Não dá para puxar as vendas da Shopee: {motivo}. Conecte a loja em Contas.")
    try:
        pedidos = loja.pedidos(ini, ate)
    except ErroMarketplace as e:
        raise ValueError(e.mensagem)
    avisos: list[str] = []
    sem_extrato = sum(1 for p in pedidos if p.get("escrow_erro"))
    if sem_extrato:
        avisos.append(f"{sem_extrato} pedido(s) ainda sem extrato de pagamento na Shopee: taxas e frete ficam pendentes. "
                      "Sincronize de novo mais tarde.")
    linhas = [linha for p in pedidos if p.get("order_status") != "UNPAID" for linha in vendas_shopee.linhas_do_pedido(p)]
    _gravar_linhas(db, cliente, mes, "shopee", linhas)
    try:
        gastos = loja.gastos_ads(ini, ate)
    except ErroMarketplace as e:
        gastos = None
        avisos.append(f"Não consegui ler o gasto de Shopee Ads: {e.mensagem}")
    if gastos is not None:
        _gravar_ads(db, cliente, ini, ate, gastos, "shopee")
        if gastos:
            avisos.append("A Shopee informa o gasto de Ads da loja por dia, sem separar por produto: ele entra no "
                          "lucro do mês, não no de cada venda.")
    return _fechar_sincronizacao(db, cliente, mes, "shopee", linhas, avisos, gastos)


def _gravar_linhas(db: Session, cliente: Cliente, mes: str, plataforma: str, linhas: list[dict],
                   marcar_canceladas: bool = True) -> dict[tuple, Venda]:
    """Cria ou atualiza as vendas do mês da plataforma. Venda que sumiu da lista vira cancelada."""
    existentes = {(v.pedido_id, v.item_id, v.variacao_id): v for v in _vendas_do_mes(db, cliente.id, mes, plataforma)
                  if not v.simulada}
    vistos = set()
    for linha in linhas:
        chave = (linha["pedido_id"], linha["item_id"], linha["variacao_id"])
        vistos.add(chave)
        v = existentes.get(chave)
        if not v:
            v = Venda(empresa_id=cliente.empresa_id, cliente_id=cliente.id, plataforma=plataforma, demo=False,
                      simulada=False, reclamacao_id="", produto_voltou=False)
            db.add(v)
            existentes[chave] = v
        for campo, valor in linha.items():
            if campo == "frete_envio" and valor is None and v.frete_envio is not None:
                continue
            setattr(v, campo, valor)
    if marcar_canceladas:
        for chave, v in existentes.items():
            if chave not in vistos and v.status != "cancelled":
                v.status = "cancelled"
    return existentes


def _fechar_sincronizacao(db: Session, cliente: Cliente, mes: str, plataforma: str, linhas: list[dict],
                          avisos: list[str], gastos: list[dict] | None) -> dict:
    sinc = db.query(SincronizacaoVendas).filter_by(cliente_id=cliente.id, plataforma=plataforma, mes=mes).first()
    if not sinc:
        sinc = SincronizacaoVendas(cliente_id=cliente.id, plataforma=plataforma, mes=mes)
        db.add(sinc)
    sinc.pedidos, sinc.demo, sinc.avisos = len({linha["pedido_id"] for linha in linhas}), False, avisos
    sinc.feita_em = datetime.now(timezone.utc)
    db.commit()
    return {"pedidos": sinc.pedidos, "linhas": len(linhas), "demo": False, "avisos": avisos, "reclamacoes": 0,
            "dias_com_ads": len(gastos or []), "plataforma": plataforma}


def sincronizar_amazon(db: Session, cliente: Cliente, mes: str) -> dict:
    """Vendas enviadas, reembolsos e Sponsored Products da conta Amazon no mês (Finances API)."""
    ini, fim = limites_do_mes(mes)
    agora = datetime.now(FUSO_BR)
    if ini > agora:
        raise ValueError("Este mês ainda não começou.")
    conta, aviso = obter_adaptador(db, cliente.id, "amazon", "vendas")
    if conta.demo or not hasattr(conta, "eventos_financeiros"):
        motivo = aviso or "conta não conectada"
        raise ValueError(f"Não dá para puxar as vendas da Amazon: {motivo}. Conecte a conta em Contas.")
    try:
        eventos = conta.eventos_financeiros(ini, min(fim, agora))
    except ErroMarketplace as e:
        raise ValueError(e.mensagem)
    linhas = vendas_amazon.linhas_de_envios(eventos["vendas"])
    existentes = _gravar_linhas(db, cliente, mes, "amazon", linhas, marcar_canceladas=False)
    avisos = ["A Amazon informa a venda quando ela é enviada: a data é a do lançamento no financeiro, e os "
              "eventos não trazem o estado do comprador (o imposto usa as alíquotas gerais)."]
    fora_do_mes = 0
    for (pedido, sku), valor in vendas_amazon.reembolsos(eventos["reembolsos"]).items():
        v = existentes.get((pedido, sku, ""))
        if not v:
            fora_do_mes += 1
            continue
        v.reembolso = round(min(valor, v.total), 2)
        v.devolucao = "reembolsada"
    if fora_do_mes:
        avisos.append(f"{fora_do_mes} reembolso(s) do mês são de vendas de meses anteriores: sincronize aquele mês "
                      "para a devolução entrar na conta.")
    gastos = vendas_amazon.gastos_ads(eventos["ads"])
    _gravar_ads(db, cliente, ini, min(fim, agora), gastos, "amazon")
    if gastos:
        avisos.append("Sponsored Products entra pelo valor cobrado na fatura de publicidade, no dia da cobrança.")
    return _fechar_sincronizacao(db, cliente, mes, "amazon", linhas, avisos, gastos)


def _aplicar_reclamacoes(ml, vendas: list[Venda], reclamacoes: list[dict], avisos: list[str]) -> None:
    por_pedido, por_envio = defaultdict(list), defaultdict(list)
    for v in vendas:
        por_pedido[v.pedido_id].append(v)
        if v.envio_id:
            por_envio[v.envio_id].append(v)
    for r in sorted(reclamacoes, key=lambda r: str(r.get("date_created") or "")):
        rid, recurso = str(r.get("resource_id") or ""), r.get("resource")
        alvo = por_pedido.get(rid, []) if recurso in ("order", None) else por_envio.get(rid, []) if recurso == "shipment" else []
        situacao, voltou = situacao_da_reclamacao(r)
        for v in alvo:
            v.devolucao, v.produto_voltou, v.reclamacao_id = situacao, voltou, str(r.get("id") or "")
            if situacao in DEVOLUCAO_COM_PERDA and not _num(v.reembolso):
                parcial = (r.get("resolution") or {}).get("reason") == "partial_refunded"
                if not parcial:
                    v.reembolso = v.total
    faltam = sorted({v.pedido_id for v in vendas if v.devolucao == "devolvida" and v.frete_devolucao is None and not v.demo})
    if faltam:
        def ler(pid):
            try:
                return pid, ml.frete_devolucao(pid)
            except ErroMarketplace as e:
                log.info("Frete de devolução do pedido %s: %s", pid, e.mensagem)
                return pid, None
        with ThreadPoolExecutor(max_workers=4) as pool:
            for pid, valor in pool.map(ler, faltam):
                if valor is None:
                    continue
                linhas = por_pedido[pid]
                base = sum(v.total for v in linhas) or 1
                for v in linhas:
                    v.frete_devolucao = round(valor * v.total / base, 2)
    for v in vendas:
        if v.demo and v.devolucao == "devolvida" and v.frete_devolucao is None:
            v.frete_devolucao = 22.9


def simular_venda(db: Session, cliente: Cliente, dados: dict, usuario: Usuario) -> Venda:
    """Venda lançada à mão para ver como o cálculo fica (fica marcada como
    simulação e pode ser apagada)."""
    qtd = int(dados.get("quantidade") or 1)
    preco = float(dados.get("preco") or 0)
    if preco <= 0 or not 1 <= qtd <= 1000:
        raise ValueError("Informe preço e quantidade válidos.")
    uf = (dados.get("uf") or "").upper()
    if uf and uf not in impostos.ALIQUOTA_INTERNA:
        raise ValueError("Estado do comprador inválido.")
    sku = (dados.get("sku") or "").strip()[:80]
    item_id = (dados.get("item_id") or "").strip()[:40]
    if not item_id:
        cat = Catalogo(db, cliente.id)
        p = cat.por_sku.get(chave_sku(sku))
        vinc = next((v for v in cat.vinculos.values() if p and v.produto_id == p.id), None)
        item_id = vinc.item_id if vinc else f"SIM-{hashlib.sha1((sku or dados.get('titulo') or 'x').encode()).hexdigest()[:8].upper()}"
    total = round(preco * qtd, 2)
    comissao = dados.get("comissao")
    if comissao is None:
        comissao = total * float(dados.get("comissao_pct") or 16) / 100 + float(dados.get("taxa_fixa") or 0) * qtd
    agora = datetime.now(timezone.utc)
    n = db.query(Venda).filter_by(cliente_id=cliente.id, simulada=True).count() + 1
    v = Venda(empresa_id=cliente.empresa_id, cliente_id=cliente.id, plataforma="mercadolivre",
              pedido_id=f"SIMULADA-{n}-{int(agora.timestamp())}", pacote_id="", envio_id="", item_id=item_id,
              variacao_id="", sku=sku, titulo=(dados.get("titulo") or sku or "Venda simulada")[:300], variacao="",
              quantidade=qtd, preco_unitario=preco, total=total, comissao=round(float(comissao), 2),
              frete_envio=float(dados.get("frete") or 0), logistica="", uf_destino=uf, status="paid", data_venda=agora,
              demo=False, simulada=True, reembolso=0.0, devolucao="", produto_voltou=False, reclamacao_id="")
    devolucao = dados.get("devolucao") or ""
    if devolucao in ("devolvida", "reembolsada", "aberta"):
        v.devolucao, v.produto_voltou = devolucao, devolucao == "devolvida"
        if devolucao != "aberta":
            v.reembolso = total
            v.frete_devolucao = float(dados.get("frete_devolucao") or 0)
    db.add(v)
    ads = float(dados.get("ads") or 0)
    if ads > 0:
        dia = _dia_br(agora)
        g = db.query(GastoAds).filter_by(cliente_id=cliente.id, plataforma="mercadolivre", data=dia, item_id=item_id).first()
        if not g:
            g = GastoAds(cliente_id=cliente.id, plataforma="mercadolivre", data=dia, item_id=item_id, custo=0.0,
                         receita_ads=0.0, unidades_ads=0, simulado=True)
            db.add(g)
        g.custo = round((g.custo or 0) + ads, 2)
    registrar(db, cliente.empresa_id, "financeiro", f"Lançou uma venda simulada de {brl(total)}", cliente_id=cliente.id,
              usuario=usuario)
    db.commit()
    return v


def apagar_simulacoes(db: Session, cliente: Cliente) -> int:
    n = db.query(Venda).filter(Venda.cliente_id == cliente.id, Venda.simulada.is_(True)).delete()
    db.query(GastoAds).filter(GastoAds.cliente_id == cliente.id, GastoAds.simulado.is_(True)).delete()
    db.commit()
    return n


CATEGORIAS_DESPESA = {
    "aluguel": "Aluguel e condomínio", "energia": "Energia, água e internet", "pessoal": "Salários, pró-labore e encargos",
    "sistemas": "Sistemas e aplicativos", "contador": "Contador", "logistica": "Logística (Full, coleta, motoboy)",
    "marketing": "Marketing fora do ML", "outros": "Outros",
}


def _mes_vizinho(mes: str, passo: int) -> str:
    ano, m = (int(x) for x in mes.split("-"))
    total = ano * 12 + (m - 1) + passo
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def despesas_do_mes(db: Session, cliente_id: int, mes: str) -> list[DespesaOperacional]:
    return [d for d in db.query(DespesaOperacional).filter_by(cliente_id=cliente_id)
            if (d.fixa and d.mes_inicio <= mes and (not d.mes_fim or d.mes_fim >= mes)) or (not d.fixa and d.mes_inicio == mes)]


def despesa_dict(d: DespesaOperacional) -> dict:
    return {"id": d.id, "descricao": d.descricao, "categoria": d.categoria, "valor": d.valor, "fixa": d.fixa,
            "mes_inicio": d.mes_inicio, "mes_fim": d.mes_fim}


def listar_despesas(db: Session, cliente: Cliente, mes: str) -> dict:
    limites_do_mes(mes)
    itens = sorted(despesas_do_mes(db, cliente.id, mes), key=lambda d: (d.categoria, d.descricao.lower()))
    por_categoria: dict[str, float] = defaultdict(float)
    for d in itens:
        por_categoria[d.categoria] += d.valor
    return {"mes": mes, "itens": [despesa_dict(d) for d in itens], "total": round(sum(d.valor for d in itens), 2),
            "por_categoria": {k: round(v, 2) for k, v in por_categoria.items()}, "categorias": CATEGORIAS_DESPESA,
            "taxa": taxa_operacional(db, cliente, mes)}


def salvar_despesa(db: Session, cliente: Cliente, dados: dict, usuario: Usuario, despesa_id: int | None = None) -> DespesaOperacional:
    descricao = (dados.get("descricao") or "").strip()[:200]
    valor = float(dados.get("valor") or 0)
    if not descricao:
        raise ValueError("Descreva a despesa (ex.: aluguel do galpão).")
    if not 0 < valor <= 10_000_000:
        raise ValueError("Informe o valor da despesa.")
    categoria = dados.get("categoria") if dados.get("categoria") in CATEGORIAS_DESPESA else "outros"
    mes = dados.get("mes_inicio") or ""
    limites_do_mes(mes)
    if despesa_id:
        d = db.get(DespesaOperacional, despesa_id)
        if not d or d.cliente_id != cliente.id:
            raise LookupError("Despesa não encontrada.")
    else:
        d = DespesaOperacional(empresa_id=cliente.empresa_id, cliente_id=cliente.id, criado_por_id=usuario.id, mes_inicio=mes)
        db.add(d)
    d.descricao, d.categoria, d.valor, d.fixa = descricao, categoria, round(valor, 2), bool(dados.get("fixa", True))
    registrar(db, cliente.empresa_id, "financeiro", f"{'Editou' if despesa_id else 'Lançou'} a despesa “{descricao}” ({brl(valor)})",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return d


def excluir_despesa(db: Session, cliente: Cliente, despesa_id: int, mes: str, usuario: Usuario) -> str:
    """Despesa fixa que já valia em meses anteriores é ENCERRADA (deixa de valer
    a partir de `mes`), para não mudar o resultado dos meses passados. Nos
    demais casos, apaga."""
    d = db.get(DespesaOperacional, despesa_id)
    if not d or d.cliente_id != cliente.id:
        raise LookupError("Despesa não encontrada.")
    limites_do_mes(mes)
    descricao = d.descricao
    if d.fixa and d.mes_inicio < mes:
        d.mes_fim = _mes_vizinho(mes, -1)
        acao = "encerrada"
    else:
        db.delete(d)
        acao = "excluida"
    registrar(db, cliente.empresa_id, "financeiro", f"{'Encerrou' if acao == 'encerrada' else 'Excluiu'} a despesa “{descricao}”",
              cliente_id=cliente.id, usuario=usuario)
    db.commit()
    return acao


def _faturamento_liquido_por_mes(db: Session, cliente_id: int, meses: list[str]) -> dict[str, float]:
    ini, _ = limites_do_mes(min(meses))
    _, fim = limites_do_mes(max(meses))
    saida = {m: 0.0 for m in meses}
    for v in (db.query(Venda).filter(Venda.cliente_id == cliente_id, Venda.data_venda >= _utc(ini),
                                     Venda.data_venda <= _utc(fim), Venda.simulada.isnot(True))):
        if _valida(v):
            data = v.data_venda if v.data_venda.tzinfo else v.data_venda.replace(tzinfo=timezone.utc)
            m = data.astimezone(FUSO_BR).strftime("%Y-%m")
            if m in saida:
                saida[m] += v.total - min(_num(v.reembolso), v.total)
    return saida


def taxa_operacional(db: Session, cliente: Cliente, mes: str) -> dict:
    """Quanto do faturamento o custo operacional consome (%).

    Usa a média dos 3 meses anteriores que tiveram vendas: o mês em andamento
    já tem todas as despesas e só parte das vendas, e daria um percentual
    inflado. Sem histórico, usa o próprio mês. É esse percentual que vai em
    cima de cada venda e entra na conta do preço."""
    anteriores = [_mes_vizinho(mes, -i) for i in (3, 2, 1)]
    fat = _faturamento_liquido_por_mes(db, cliente.id, anteriores + [mes])
    usados = [m for m in anteriores if fat[m] > 0]
    base = "media"
    if not usados:
        usados, base = ([mes] if fat[mes] > 0 else []), "mes"
    despesas = sum(sum(d.valor for d in despesas_do_mes(db, cliente.id, m)) for m in usados)
    faturamento = sum(fat[m] for m in usados)
    pct = round(despesas / faturamento * 100, 2) if faturamento else 0.0
    return {"pct": pct, "meses": usados, "base": base if usados else "", "despesas": round(despesas, 2),
            "faturamento": round(faturamento, 2)}


def _valida(v: Venda) -> bool:
    """Entra na conta do mês: pedido pago, ou devolvido/reembolsado (a perda
    da devolução é do mês da venda, mesmo que o ML tenha cancelado o pedido)."""
    return v.status in STATUS_VALIDOS or (v.devolucao or "") in DEVOLUCAO_COM_PERDA


def calcular_linhas(cfg: ConfigFinanceira, vendas: list[Venda], cat: Catalogo, ads: dict[tuple, float]) -> tuple[list[dict], dict]:
    """(linhas calculadas, gasto de ads por (dia, anúncio) que não teve venda)."""
    validas = [v for v in vendas if _valida(v)]
    total_por_envio: dict[str, float] = defaultdict(float)
    vendas_do_dia: dict[tuple, float] = defaultdict(float)
    for v in validas:
        if v.envio_id:
            total_por_envio[v.envio_id] += v.total
        vendas_do_dia[(_dia_br(v.data_venda), v.item_id)] += v.total
    ads_sem_venda = {k: c for k, c in ads.items() if k not in vendas_do_dia}
    volta_estoque = cfg.devolucao_volta_estoque is not False
    saida = []
    for v in vendas:
        valida = _valida(v)
        dev = v.devolucao or ""
        reembolso = min(_num(v.reembolso), v.total) if valida else 0.0
        fator = (v.total - reembolso) / v.total if v.total else 0
        bonus = round(_num(v.bonus_ml) * fator, 2) if valida else 0.0
        frete = 0.0
        if valida and v.frete_envio:
            base = total_por_envio.get(v.envio_id) or v.total
            frete = v.frete_envio * (v.total / base if base else 1)
        chave_dia = (_dia_br(v.data_venda), v.item_id)
        ads_venda = ads.get(chave_dia, 0) * v.total / vendas_do_dia[chave_dia] if valida and vendas_do_dia.get(chave_dia) else 0.0
        c = cat.casar(v.item_id, v.variacao_id, v.sku)
        unidades = v.quantidade * (c.unidades if c else 1)
        custo = c.produto.custo * unidades if c and c.produto.custo is not None else None
        if custo is not None and dev == "devolvida" and v.produto_voltou and volta_estoque:
            custo = 0.0
        emb_unit = c.produto.embalagem if c and c.produto.embalagem is not None else (cfg.embalagem_padrao or 0)
        embalagem = emb_unit * unidades
        comissao = v.comissao * fator
        regra = cat.regra(c, v.sku) if cfg.regime != "simples" else None
        imp = impostos.calcular(cfg, v.total - reembolso + bonus, v.uf_destino, custo or 0, regra)
        frete_dev = _num(v.frete_devolucao) if valida else 0.0
        receita = v.total - reembolso + bonus
        lucro = receita - comissao - frete - frete_dev - ads_venda - imp.total - (custo or 0) - embalagem
        saida.append({
            "id": v.id, "plataforma": v.plataforma or "mercadolivre", "pedido_id": v.pedido_id, "data": v.data_venda, "item_id": v.item_id, "variacao_id": v.variacao_id,
            "sku": v.sku, "titulo": v.titulo, "variacao": v.variacao, "quantidade": v.quantidade,
            "preco_unitario": v.preco_unitario, "total": v.total, "reembolso": round(reembolso, 2), "bonus_ml": bonus,
            "comissao": round(comissao, 2), "frete": round(frete, 2), "frete_pendente": valida and v.frete_envio is None,
            "frete_devolucao": round(frete_dev, 2), "ads": round(ads_venda, 2),
            "imposto": imp.total, "imposto_detalhe": imp.detalhe, "sem_regra_fiscal": cfg.regime != "simples" and regra is None, "custo": custo, "embalagem": round(embalagem, 2),
            "produto": {"id": c.produto.id, "nome": c.produto.nome, "sku": c.produto.sku, "via": c.via,
                        "unidades": c.unidades} if c else None,
            "lucro": round(lucro, 2), "margem": round(lucro / v.total * 100, 1) if v.total else 0.0,
            "uf": v.uf_destino, "logistica": v.logistica, "status": v.status, "valida": valida,
            "devolucao": dev, "produto_voltou": bool(v.produto_voltou), "simulada": bool(v.simulada), "demo": bool(v.demo),
            "sem_vinculo": c is None, "sem_custo": c is not None and c.produto.custo is None})
    return saida, ads_sem_venda


CAMPOS_SOMA = ("total", "reembolso", "bonus_ml", "comissao", "frete", "frete_devolucao", "ads", "imposto", "custo", "embalagem", "lucro")
CAMPOS_OPERACIONAL = ("operacional", "lucro_final")


def _somar(linhas: list[dict]) -> dict:
    campos = CAMPOS_SOMA + (CAMPOS_OPERACIONAL if linhas and "operacional" in linhas[0] else ())
    s = {k: round(sum(x[k] or 0 for x in linhas), 2) for k in campos}
    s["margem"] = round(s["lucro"] / s["total"] * 100, 1) if s["total"] else 0.0
    if "lucro_final" in s:
        s["margem_final"] = round(s["lucro_final"] / s["total"] * 100, 1) if s["total"] else 0.0
    return s


def _calcular_periodo(db: Session, cliente: Cliente, cfg: ConfigFinanceira, cat: Catalogo, ini: datetime, fim: datetime):
    """(linhas, ads sem venda, gastos de ads) das vendas entre `ini` e `fim`."""
    vendas = (db.query(Venda).filter(Venda.cliente_id == cliente.id,
                                     Venda.data_venda >= _utc(ini), Venda.data_venda <= _utc(fim))
              .order_by(Venda.data_venda.desc()).all())
    gastos = (db.query(GastoAds).filter(GastoAds.cliente_id == cliente.id, GastoAds.data >= ini.strftime("%Y-%m-%d"),
                                        GastoAds.data <= fim.strftime("%Y-%m-%d")).all())
    ads = defaultdict(float)
    for g in gastos:
        ads[(g.data, g.item_id)] += g.custo or 0
    linhas, ads_sem_venda = calcular_linhas(cfg, vendas, cat, ads)
    return linhas, ads_sem_venda, gastos


def resumo(db: Session, cliente: Cliente, mes: str) -> dict:
    cfg = config_de(db, cliente)
    ini, fim = limites_do_mes(mes)
    cat = Catalogo(db, cliente.id)
    linhas, ads_sem_venda, gastos = _calcular_periodo(db, cliente, cfg, cat, ini, fim)
    taxa = taxa_operacional(db, cliente, mes)
    for x in linhas:
        x["operacional"] = round((x["total"] - x["reembolso"]) * taxa["pct"] / 100, 2) if x["valida"] else 0.0
        x["lucro_final"] = round(x["lucro"] - x["operacional"], 2)
        x["margem_final"] = round(x["lucro_final"] / x["total"] * 100, 1) if x["total"] else 0.0
    validas = [x for x in linhas if x["valida"]]
    canceladas = [x for x in linhas if not x["valida"]]
    tot = _somar(validas)
    ads_parado = round(sum(ads_sem_venda.values()), 2)
    tot["ads_sem_venda"] = ads_parado
    tot["ads_total"] = round(tot["ads"] + ads_parado, 2)
    tot["lucro"] = round(tot["lucro"] - ads_parado, 2)
    tot["margem"] = round(tot["lucro"] / tot["total"] * 100, 1) if tot["total"] else 0.0
    receita_ads = round(sum(g.receita_ads or 0 for g in gastos), 2)
    pedidos = len({x["pedido_id"] for x in validas})
    tot.update({
        "pedidos": pedidos, "unidades": sum(x["quantidade"] for x in validas),
        "ticket_medio": round(tot["total"] / pedidos, 2) if pedidos else 0.0,
        "tacos": round(tot["ads_total"] / tot["total"] * 100, 1) if tot["total"] else 0.0,
        "receita_ads": receita_ads, "roas": round(receita_ads / tot["ads_total"], 2) if tot["ads_total"] and receita_ads else None,
        "sem_vinculo": sum(1 for x in validas if x["sem_vinculo"]),
        "sem_custo": sum(1 for x in validas if x["sem_custo"]),
        "faturamento_incompleto": round(sum(x["total"] for x in validas if x["sem_vinculo"] or x["sem_custo"]), 2),
        "frete_pendente": sum(1 for x in validas if x["frete_pendente"]),
        "devolucoes": sum(1 for x in validas if x["devolucao"] in DEVOLUCAO_COM_PERDA),
        "reclamacoes_abertas": len({x["pedido_id"] for x in linhas if x["devolucao"] == "aberta"}),
        "simuladas": sum(1 for x in linhas if x["simulada"]),
        "canceladas": len({x["pedido_id"] for x in canceladas}),
        "valor_cancelado": round(sum(x["total"] for x in canceladas), 2)})
    despesas = despesas_do_mes(db, cliente.id, mes)
    receita = round(tot["total"] - tot["reembolso"] + tot["bonus_ml"], 2)
    tot["despesas"] = round(sum(d.valor for d in despesas), 2)
    tot["resultado"] = round(tot["lucro"] - tot["despesas"], 2)
    tot["margem_resultado"] = round(tot["resultado"] / receita * 100, 1) if receita else 0.0
    contribuicao = tot["lucro"] / receita if receita else 0
    tot["ponto_equilibrio"] = round(tot["despesas"] / contribuicao, 2) if contribuicao > 0 and tot["despesas"] else None
    tot["operacional_rateado"] = round(sum(x["operacional"] for x in validas), 2)

    grupos: dict[str, list[dict]] = defaultdict(list)
    for x in validas:
        grupos[f"p{x['produto']['id']}" if x["produto"] else f"a{x['item_id']}:{x['variacao_id']}"].append(x)
    por_produto = []
    for chave, xs in grupos.items():
        s = _somar(xs)
        prod = xs[0]["produto"]
        por_produto.append({"chave": chave, "produto": prod, "titulo": prod["nome"] if prod else xs[0]["titulo"],
                            "sku": prod["sku"] if prod else xs[0]["sku"], "item_id": xs[0]["item_id"],
                            "variacao_id": xs[0]["variacao_id"], "variacao": xs[0]["variacao"],
                            "anuncios": len({x["item_id"] for x in xs}), "unidades": sum(x["quantidade"] for x in xs),
                            "sem_vinculo": prod is None, "sem_custo": any(x["sem_custo"] for x in xs), **s})
    por_produto.sort(key=lambda p: -p["total"])

    alertas = []
    if tot["sem_vinculo"]:
        alertas.append({"tipo": "vinculo", "nivel": "amarelo",
                        "texto": f"{tot['sem_vinculo']} venda(s) de anúncio sem produto vinculado. Sem o produto não há custo, "
                                 "e o lucro aparece maior do que o real."})
    if tot["sem_custo"]:
        alertas.append({"tipo": "custo", "nivel": "amarelo",
                        "texto": f"{tot['sem_custo']} venda(s) de produto sem custo cadastrado."})
    if tot["frete_pendente"]:
        alertas.append({"tipo": "frete", "nivel": "amarelo",
                        "texto": f"{tot['frete_pendente']} venda(s) ainda sem o custo do frete. Sincronize de novo mais tarde."})
    if cfg.regime != "simples":
        sem_regra = sum(1 for x in validas if x["sem_regra_fiscal"])
        if not cat.regras:
            alertas.append({"tipo": "tributacao", "nivel": "amarelo",
                            "texto": "No Lucro Real e no Presumido, importe a planilha de tributação do sistema de notas: sem ela o "
                                     "imposto usa só os valores gerais e pode ficar diferente do real."})
        elif sem_regra:
            alertas.append({"tipo": "tributacao", "nivel": "amarelo",
                            "texto": f"{sem_regra} venda(s) de SKU que não está na planilha de tributação: usei os valores gerais."})
    if cfg.regime != "simples" and not cfg.uf_origem:
        alertas.append({"tipo": "impostos", "nivel": "amarelo", "texto": "Informe o estado de origem para calcular o ICMS."})
    if tot["reclamacoes_abertas"]:
        alertas.append({"tipo": "reclamacao", "nivel": "amarelo",
                        "texto": f"{tot['reclamacoes_abertas']} venda(s) com reclamação aberta: se virar devolução, o lucro cai."})
    prejuizo = [p for p in por_produto if p["lucro"] < 0 and not p["sem_custo"] and not p["sem_vinculo"]]
    if prejuizo:
        alertas.append({"tipo": "prejuizo", "nivel": "vermelho", "texto": f"{len(prejuizo)} produto(s) deram prejuízo no mês."})
    if tot["simuladas"]:
        alertas.append({"tipo": "simulacao", "nivel": "azul",
                        "texto": f"{tot['simuladas']} venda(s) simulada(s) entram nesta conta. Apague as simulações antes de "
                                 "usar os números."})

    sincs = {s.plataforma: s for s in db.query(SincronizacaoVendas).filter_by(cliente_id=cliente.id, mes=mes)}
    sinc = sincs.get("mercadolivre")
    por_plataforma = defaultdict(lambda: {"pedidos": set(), "total": 0.0, "lucro": 0.0})
    for x in validas:
        pp = por_plataforma[x["plataforma"]]
        pp["pedidos"].add(x["pedido_id"])
        pp["total"] += x["total"]
        pp["lucro"] += x["lucro"]
    return {"mes": mes, "totais": tot, "vendas": linhas, "por_produto": por_produto, "alertas": alertas,
            "config": {"regime": cfg.regime, "uf_origem": cfg.uf_origem},
            "produtos": [{"id": p.id, "nome": p.nome, "sku": p.sku} for p in sorted(cat.produtos.values(), key=lambda p: p.nome.lower())],
            "margem_baixa_pct": MARGEM_BAIXA_PCT, "taxa_operacional": taxa,
            "despesas": [despesa_dict(d) for d in despesas], "categorias_despesa": CATEGORIAS_DESPESA,
            "sincronizacao": {"feita_em": sinc.feita_em, "demo": sinc.demo, "avisos": sinc.avisos or [],
                              "pedidos": sinc.pedidos} if sinc else None,
            "sincronizacoes": {k: {"feita_em": x.feita_em, "demo": x.demo, "avisos": x.avisos or [], "pedidos": x.pedidos}
                               for k, x in sincs.items()},
            "por_plataforma": {k: {"pedidos": len(v["pedidos"]), "total": round(v["total"], 2), "lucro": round(v["lucro"], 2)}
                               for k, v in por_plataforma.items()}}


def brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


_PRODUTOS_DEMO = [
    ("Garrafa Térmica Inox 1 Litro", "GARRAFA-1L", 89.9, "MLB-DEMO-101"),
    ("Kit 3 Potes Herméticos de Vidro", "POTE-VIDRO-3", 64.9, "MLB-DEMO-102"),
    ("Luminária de Mesa LED Recarregável", "LUMI-LED", 119.0, "MLB-DEMO-103"),
    ("Organizador de Gaveta 6 Divisórias", "", 39.9, "MLB-DEMO-104"),
    ("Mochila Impermeável para Notebook 15,6", "MOCHILA-15", 159.9, "MLB-DEMO-105"),
    ("Caneca Térmica 500 ml com Tampa", "CANECA-500", 54.9, "MLB-DEMO-106"),
]
_UFS_DEMO = ["SP", "SP", "SP", "RJ", "MG", "PR", "RS", "BA", "PE", "GO", "SC", "CE"]


def _dados_demo(cliente: Cliente, mes: str, ate: datetime) -> dict:
    """Vendas, reclamações e publicidade fictícias e estáveis por cliente e
    mês (conta não conectada)."""
    ini, _ = limites_do_mes(mes)
    rng = random.Random(int(hashlib.sha256(f"vendas{cliente.id}{mes}".encode()).hexdigest(), 16))
    dias = max(1, (ate - ini).days + 1)
    linhas, envios, reclamacoes, ads = [], {}, [], []
    for n in range(rng.randint(25, 45)):
        titulo, sku, preco, item = rng.choice(_PRODUTOS_DEMO)
        qtd = 1 if rng.random() < 0.85 else 2
        pedido, envio = f"DEMO-{cliente.id}-{mes}-{n}", f"ENV-DEMO-{cliente.id}-{mes}-{n}"
        data = ini + timedelta(days=rng.randrange(dias), hours=rng.randint(8, 22), minutes=rng.randint(0, 59))
        linhas.append({"pedido_id": pedido, "pacote_id": "", "envio_id": envio, "item_id": item, "variacao_id": "",
                       "sku": sku, "titulo": titulo, "variacao": "", "quantidade": qtd, "preco_unitario": preco,
                       "total": round(preco * qtd, 2), "comissao": round(preco * qtd * 0.16 + (6.75 if preco < 79 else 0), 2),
                       "reembolso": 0.0, "status": "paid", "data_venda": _utc(min(data, ate))})
        envios[envio] = {"uf": rng.choice(_UFS_DEMO), "logistica": "cross_docking",
                         "frete": round(rng.uniform(18, 32), 2) if preco >= 79 else 0.0}
    if len(linhas) > 3:
        reclamacoes.append({"id": f"R-{linhas[1]['pedido_id']}", "resource": "order", "resource_id": linhas[1]["pedido_id"],
                            "type": "returns", "status": "closed", "date_created": "",
                            "resolution": {"reason": "item_returned", "benefited": ["complainant"], "applied_coverage": False}})
        reclamacoes.append({"id": f"R-{linhas[2]['pedido_id']}", "resource": "order", "resource_id": linhas[2]["pedido_id"],
                            "type": "mediations", "status": "opened", "date_created": ""})
    for d in range(dias):
        dia = (ini + timedelta(days=d)).strftime("%Y-%m-%d")
        for _t, _s, _p, item in _PRODUTOS_DEMO[:3]:
            if rng.random() < 0.8:
                ads.append({"data": dia, "item_id": item, "custo": round(rng.uniform(3, 12), 2),
                            "receita": round(rng.uniform(0, 120), 2), "unidades": rng.randint(0, 1)})
    return {"linhas": linhas, "envios": envios, "reclamacoes": reclamacoes, "ads": ads}

