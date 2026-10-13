"""Agente analisador de métricas.

Lê o resultado do mês (vendas sincronizadas, custos, impostos e Ads) e o
compara com o mês anterior. As regras abaixo apontam o que está tirando
lucro e o que fazer; com ANTHROPIC_API_KEY configurada, a IA escreve um
resumo executivo a partir desses mesmos achados (nunca inventa números).
"""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from app.models import Cliente, Usuario
from app.services import acesso, financeiro, ia

log = logging.getLogger(__name__)

TACOS_ALTO_PCT = 15.0
QUEDA_RELEVANTE_PCT = 20.0
QUEDA_PRODUTO_PCT = 40.0
DEVOLUCAO_ALTA_PCT = 5.0
NIVEIS = {"vermelho": 0, "amarelo": 1, "azul": 2, "verde": 3}


def _variacao(atual: float, anterior: float) -> float | None:
    if not anterior:
        return None
    return round((atual - anterior) / abs(anterior) * 100, 1)


def _indicadores(t: dict) -> dict:
    ads = t.get("ads_total", 0)
    return {"faturamento": t.get("total", 0), "pedidos": t.get("pedidos", 0), "unidades": t.get("unidades", 0),
            "ticket_medio": t.get("ticket_medio", 0), "lucro_antes_ads": round(t.get("lucro", 0) + ads, 2),
            "ads": ads, "lucro": t.get("lucro", 0), "margem": t.get("margem", 0), "tacos": t.get("tacos", 0),
            "roas": t.get("roas"), "despesas": t.get("despesas", 0), "resultado": t.get("resultado", 0),
            "margem_resultado": t.get("margem_resultado", 0), "devolucoes": t.get("devolucoes", 0)}


def _achado(nivel: str, titulo: str, texto: str, acao: str = "", itens: list[dict] | None = None, tipo: str = "") -> dict:
    return {"nivel": nivel, "tipo": tipo, "titulo": titulo, "texto": texto, "acao": acao, "itens": itens or []}


def _item(p: dict, **extra) -> dict:
    return {"titulo": p["titulo"], "item_id": p.get("item_id", ""), "sku": p.get("sku", ""), "faturamento": p["total"],
            "lucro": p["lucro"], "ads": p.get("ads", 0), "margem": p.get("margem", 0), **extra}


def achados(atual: dict, anterior: dict | None) -> list[dict]:
    t = atual["totais"]
    produtos = [p for p in atual["por_produto"] if not p["sem_vinculo"] and not p["sem_custo"]]
    saida: list[dict] = []

    if not t["pedidos"]:
        return [_achado("azul", "Sem vendas no período",
                        "Não há vendas sincronizadas neste mês. Sincronize as vendas em Vendas e lucro para o agente analisar.",
                        "Sincronizar as vendas", tipo="sem_dados")]

    incompletos = t["sem_vinculo"] + t["sem_custo"]
    if incompletos:
        pct = t["faturamento_incompleto"] / t["total"] * 100 if t["total"] else 0
        saida.append(_achado(
            "amarelo" if pct < 30 else "vermelho", "Lucro pode estar maior do que o real",
            f"{incompletos} venda(s), {financeiro.brl(t['faturamento_incompleto'])} ({pct:.0f}% do faturamento), estão sem "
            "produto vinculado ou sem custo. Nessas vendas o custo entra como zero.",
            "Cadastrar o custo e vincular os anúncios em Produtos e custos", tipo="dados"))

    prejuizo = sorted((p for p in produtos if p["lucro"] < 0), key=lambda p: p["lucro"])
    so_ads = [p for p in prejuizo if p["ads"] > 0 and p["lucro"] + p["ads"] > 0]
    estrutural = [p for p in prejuizo if p not in so_ads]
    if so_ads:
        perda = sum(p["lucro"] for p in so_ads)
        saida.append(_achado(
            "vermelho", "Ads está transformando lucro em prejuízo",
            f"{len(so_ads)} produto(s) dariam lucro sem publicidade, mas o Ads leva o resultado para "
            f"{financeiro.brl(perda)}.", "Baixar o orçamento ou o ACOS alvo da campanha desses anúncios, ou pausar o Ads neles",
            [_item(p, lucro_sem_ads=round(p["lucro"] + p["ads"], 2)) for p in so_ads[:8]], tipo="ads_prejuizo"))
    if estrutural:
        perda = sum(p["lucro"] for p in estrutural)
        saida.append(_achado(
            "vermelho", "Produtos que dão prejuízo mesmo sem Ads",
            f"{len(estrutural)} produto(s) perderam {financeiro.brl(-perda)} no mês. O problema está no preço, no custo, "
            "na comissão ou no frete.", "Revisar o preço (o Radar mostra o mínimo para a margem) ou negociar o custo",
            [_item(p) for p in estrutural[:8]], tipo="prejuizo"))

    if t.get("ads_sem_venda", 0) > 0:
        saida.append(_achado(
            "amarelo", "Publicidade gasta em dias sem venda",
            f"{financeiro.brl(t['ads_sem_venda'])} de Ads foram gastos em anúncios que não venderam no mesmo dia. "
            "Esse valor sai direto do lucro.", "Conferir em Ads os anúncios com muito clique e pouca conversão",
            tipo="ads_parado"))

    if t["tacos"] >= TACOS_ALTO_PCT:
        roas = f" ROAS de {t['roas']:.1f}." if t.get("roas") else ""
        saida.append(_achado(
            "amarelo", "Peso da publicidade alto",
            f"O Ads consome {t['tacos']:.1f}% do faturamento (TACOS). Acima de {TACOS_ALTO_PCT:g}% costuma comer a margem "
            f"de quase todo produto.{roas}",
            "Concentrar o orçamento nos anúncios com melhor lucro e ROAS", tipo="tacos"))

    baixa = sorted((p for p in produtos if 0 <= p["margem"] < financeiro.MARGEM_BAIXA_PCT and p["unidades"] >= 2),
                   key=lambda p: -p["total"])
    if baixa:
        saida.append(_achado(
            "amarelo", f"Margem abaixo de {financeiro.MARGEM_BAIXA_PCT:g}%",
            f"{len(baixa)} produto(s) vendem, mas sobram menos de {financeiro.MARGEM_BAIXA_PCT:g}% do preço. Qualquer "
            "aumento de frete ou de Ads vira prejuízo.", "Testar um preço um pouco maior ou um kit com mais unidades",
            [_item(p) for p in baixa[:8]], tipo="margem_baixa"))

    if t["pedidos"] and t["devolucoes"] / t["pedidos"] * 100 >= DEVOLUCAO_ALTA_PCT:
        saida.append(_achado(
            "amarelo", "Devoluções acima do normal",
            f"{t['devolucoes']} devolução(ões) em {t['pedidos']} pedidos ({t['devolucoes'] / t['pedidos'] * 100:.0f}%). "
            "Devolução derruba a reputação e custa o frete de volta.",
            "Ler os motivos das reclamações e revisar fotos, medidas e descrição dos anúncios", tipo="devolucao"))

    if anterior and anterior["totais"]["pedidos"]:
        ta = anterior["totais"]
        vf, vl = _variacao(t["total"], ta["total"]), _variacao(t["lucro"], ta["lucro"])
        if vf is not None and vf <= -QUEDA_RELEVANTE_PCT:
            saida.append(_achado(
                "vermelho" if vf <= -40 else "amarelo", "Faturamento caiu em relação ao mês anterior",
                f"{financeiro.brl(t['total'])} contra {financeiro.brl(ta['total'])} ({vf:+.0f}%).",
                "Ver quais produtos pararam de vender (lista abaixo) e a saúde da conta", tipo="queda"))
        if vl is not None and vl <= -QUEDA_RELEVANTE_PCT and ta["lucro"] > 0:
            saida.append(_achado(
                "amarelo", "Lucro depois do Ads caiu",
                f"{financeiro.brl(t['lucro'])} contra {financeiro.brl(ta['lucro'])} no mês anterior ({vl:+.0f}%).",
                "Comparar o gasto de Ads e as margens produto a produto", tipo="queda_lucro"))
        antes = {p["chave"]: p for p in anterior["por_produto"]}
        agora = {p["chave"]: p for p in atual["por_produto"]}
        caiu = []
        for chave, p in sorted(antes.items(), key=lambda kv: -kv[1]["total"])[:15]:
            novo = agora.get(chave, {}).get("total", 0)
            v = _variacao(novo, p["total"])
            if v is not None and v <= -QUEDA_PRODUTO_PCT:
                caiu.append({"titulo": p["titulo"], "item_id": p.get("item_id", ""), "sku": p.get("sku", ""),
                             "faturamento": novo, "faturamento_anterior": p["total"], "variacao": v,
                             "lucro": agora.get(chave, {}).get("lucro", 0)})
        if caiu:
            saida.append(_achado(
                "amarelo", "Produtos que eram fortes e esfriaram",
                f"{len(caiu)} dos produtos que mais venderam no mês anterior caíram {QUEDA_PRODUTO_PCT:g}% ou mais.",
                "Conferir no Radar se apareceu concorrente mais barato e se o anúncio continua ativo e com estoque",
                caiu[:8], tipo="produto_esfriou"))

    campeoes = sorted((p for p in produtos if p["lucro"] > 0), key=lambda p: -p["lucro"])[:5]
    if campeoes:
        saida.append(_achado(
            "verde", "Quem mais dá lucro",
            f"Os {len(campeoes)} produtos abaixo somam {financeiro.brl(sum(p['lucro'] for p in campeoes))} de lucro "
            "depois do Ads.", "Garantir estoque, manter o Ads e testar variações ou kits desses produtos",
            [_item(p) for p in campeoes], tipo="campeoes"))

    saida.sort(key=lambda a: NIVEIS.get(a["nivel"], 9))
    return saida


_SISTEMA = """Você é analista de e-commerce de uma agência que opera contas de clientes no Mercado Livre.
Recebe os indicadores do mês, a comparação com o mês anterior e os achados que as regras já calcularam.
Escreva um resumo executivo em português do Brasil para levar à reunião com o cliente:
- Use SOMENTE os números recebidos. Não invente valores, produtos nem causas que não estejam nos dados.
- "lucro" já é o lucro depois do Ads; "lucro_antes_ads" é antes da publicidade.
- Seja direto: o que aconteceu, o que mais pesa no lucro e as 3 ações mais importantes, em ordem de impacto.
- Sem emojis e sem jargão desnecessário."""

_SCHEMA = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string", "description": "2 a 4 frases sobre o mês"},
        "prioridades": {"type": "array", "items": {"type": "string"}, "description": "até 3 ações, da mais para a menos importante"},
    },
    "required": ["resumo", "prioridades"],
    "additionalProperties": False,
}


def _resumo_regras(ind: dict, var: dict, lista: list[dict]) -> dict:
    partes = [f"Faturamento de {financeiro.brl(ind['faturamento'])} em {ind['pedidos']} pedido(s), "
              f"lucro depois do Ads de {financeiro.brl(ind['lucro'])} ({ind['margem']:.1f}% de margem)."]
    if ind["ads"]:
        partes.append(f"O Ads custou {financeiro.brl(ind['ads'])} ({ind['tacos']:.1f}% do faturamento); "
                      f"antes dele o lucro era {financeiro.brl(ind['lucro_antes_ads'])}.")
    if var.get("faturamento") is not None:
        partes.append(f"Em relação ao mês anterior: faturamento {var['faturamento']:+.0f}%"
                      + (f", lucro {var['lucro']:+.0f}%." if var.get("lucro") is not None else "."))
    prioridades = [a["acao"] for a in lista if a["acao"] and a["nivel"] in ("vermelho", "amarelo")][:3]
    return {"resumo": " ".join(partes), "prioridades": prioridades, "fonte": "regras"}


def _resumo_ia(cliente: Cliente, mes: str, ind: dict, var: dict, lista: list[dict]) -> dict:
    dados = {"cliente": cliente.nome, "mes": mes, "indicadores": ind, "variacao_vs_mes_anterior_pct": var,
             "achados": [{k: a[k] for k in ("nivel", "titulo", "texto", "acao")} | {"itens": a["itens"][:5]} for a in lista]}
    saida = ia._claude_json(_SISTEMA, _SCHEMA, json.dumps(dados, ensure_ascii=False, default=str), max_tokens=3000)
    return {"resumo": saida["resumo"].strip(), "prioridades": [p.strip() for p in saida["prioridades"] if p.strip()][:3],
            "fonte": "ia"}


def analisar(db: Session, cliente: Cliente, mes: str, com_ia: bool = False) -> dict:
    atual = financeiro.resumo(db, cliente, mes)
    mes_ant = financeiro._mes_vizinho(mes, -1)
    anterior = financeiro.resumo(db, cliente, mes_ant)
    ind = _indicadores(atual["totais"])
    ind_ant = _indicadores(anterior["totais"]) if anterior["totais"]["pedidos"] else None
    var = {k: _variacao(ind[k], ind_ant[k]) for k in ("faturamento", "pedidos", "lucro", "lucro_antes_ads", "ads")} if ind_ant else {}
    lista = achados(atual, anterior)
    texto = _resumo_regras(ind, var, lista)
    if com_ia and ind["pedidos"] and ia.disponivel():
        try:
            texto = _resumo_ia(cliente, mes, ind, var, lista)
        except Exception as e:
            log.warning("IA indisponível para a análise: %s", e)
            texto["aviso"] = "A IA não respondeu agora; o resumo abaixo foi feito pelas regras."
    sinc = atual.get("sincronizacao")
    return {"cliente": {"id": cliente.id, "nome": cliente.nome}, "mes": mes, "mes_anterior": mes_ant,
            "indicadores": ind, "anterior": ind_ant, "variacao": var, "achados": lista, "resumo": texto,
            "ia_disponivel": ia.disponivel(), "sincronizacao": sinc,
            "simuladas": atual["totais"].get("simuladas", 0)}


def carteira(db: Session, usuario: Usuario, mes: str) -> list[dict]:
    """Uma linha por cliente que o usuário acompanha, ordenada por quem precisa de atenção primeiro."""
    saida = []
    for cliente in acesso.clientes_acessiveis(db, usuario):
        atual = financeiro.resumo(db, cliente, mes)
        anterior = financeiro.resumo(db, cliente, financeiro._mes_vizinho(mes, -1))
        ind = _indicadores(atual["totais"])
        lista = achados(atual, anterior)
        ta = anterior["totais"]
        saida.append({"cliente": {"id": cliente.id, "nome": cliente.nome}, "indicadores": ind,
                      "variacao_faturamento": _variacao(ind["faturamento"], ta["total"]) if ta["pedidos"] else None,
                      "variacao_lucro": _variacao(ind["lucro"], ta["lucro"]) if ta["pedidos"] else None,
                      "vermelhos": sum(1 for a in lista if a["nivel"] == "vermelho"),
                      "amarelos": sum(1 for a in lista if a["nivel"] == "amarelo"),
                      "principal": next((a["titulo"] for a in lista if a["nivel"] in ("vermelho", "amarelo")), ""),
                      "sincronizado_em": (atual.get("sincronizacao") or {}).get("feita_em")})
    saida.sort(key=lambda c: (-c["vermelhos"], -c["amarelos"], c["indicadores"]["margem"]))
    return saida
