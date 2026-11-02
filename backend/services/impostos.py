"""Imposto de cada venda, conforme o regime tributário do cliente.

- Simples Nacional: uma alíquota efetiva sobre o valor da venda (o DAS já
  inclui ICMS, PIS, COFINS, IRPJ e CSLL).
- Lucro Presumido e Lucro Real: os impostos mudam conforme o estado do
  comprador, então cada venda é calculada separada:
    * ICMS próprio: venda dentro do estado usa a alíquota interna da origem;
      para outro estado usa a interestadual (4% importado; 7% saindo do
      Sul/Sudeste, exceto ES, para N/NE/CO/ES; 12% nos demais casos);
    * DIFAL (consumidor final não contribuinte, que é o caso da maioria das
      vendas em marketplace): alíquota interna do destino − interestadual;
    * PIS/COFINS: 3,65% no Presumido (cumulativo) e 9,25% no Real (não
      cumulativo), com o ICMS fora da base (STF, Tema 69), se marcado;
    * outros sobre a venda: no Presumido, IRPJ + CSLL presumidos do comércio
      (8% × 15% + 12% × 9% = 2,28%). No Real, IRPJ/CSLL incidem sobre o lucro
      do período, não sobre cada venda, e ficam fora da conta;
    * créditos sobre o custo (Lucro Real): ICMS e PIS/COFINS pagos na compra
      e abatidos do imposto da venda.

Alíquotas internas: modais de referência (com FCP quando o estado cobra junto),
editáveis por cliente porque mudam por lei estadual e por produto (NCM).

Planilha de tributação (Real e Presumido): quando o SKU vendido tem regra
importada do sistema de notas do cliente, ela manda no lugar dos valores
gerais: origem (importado → 4%), ICMS próprio, ST (venda no estado sem ICMS
próprio), isenção (CST 40/41), alíquota do destino por estado, FCP, IPI,
PIS, COFINS e créditos da compra.
É uma estimativa gerencial, não substitui a apuração do contador.
"""

from __future__ import annotations

from dataclasses import dataclass

ALIQUOTA_INTERNA = {
    "AC": 19.0, "AL": 20.0, "AM": 20.0, "AP": 18.0, "BA": 20.5, "CE": 20.0, "DF": 20.0, "ES": 17.0,
    "GO": 19.0, "MA": 23.0, "MG": 18.0, "MS": 17.0, "MT": 17.0, "PA": 19.0, "PB": 20.0, "PE": 20.5,
    "PI": 22.5, "PR": 19.5, "RJ": 22.0, "RN": 20.0, "RO": 19.5, "RR": 20.0, "RS": 17.0, "SC": 17.0,
    "SE": 20.0, "SP": 18.0, "TO": 20.0,
}
UFS = tuple(sorted(ALIQUOTA_INTERNA))
SUL_SUDESTE_SEM_ES = {"PR", "SC", "RS", "SP", "RJ", "MG"}
PIS_COFINS_PADRAO = {"presumido": 3.65, "real": 9.25}
OUTROS_PADRAO = {"presumido": 2.28, "real": 0.0}
REGIMES = ("simples", "presumido", "real")
ORIGENS_IMPORTADAS = {"1", "2", "3", "8"}
CST_ST = {"10", "30", "60", "70", "201", "202", "203", "500"}
CST_ISENTO = {"40", "41", "50", "102", "103", "300", "400"}


@dataclass
class Imposto:
    total: float
    icms: float = 0.0
    difal: float = 0.0
    pis_cofins: float = 0.0
    outros: float = 0.0
    credito: float = 0.0
    ipi: float = 0.0
    aliquota_efetiva: float = 0.0
    detalhe: str = ""


def interestadual(origem: str, destino: str, importado: bool) -> float:
    if importado:
        return 4.0
    if origem in SUL_SUDESTE_SEM_ES and destino not in SUL_SUDESTE_SEM_ES:
        return 7.0
    return 12.0


def aliquota_interna(uf: str, cfg) -> float | None:
    proprias = cfg.aliquotas_uf or {}
    if uf in proprias:
        try:
            return float(proprias[uf])
        except (TypeError, ValueError):
            pass
    return ALIQUOTA_INTERNA.get(uf)


def _pct(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".").replace(".", ",") + "%"


def _f(v) -> float | None:
    return None if v is None or v == "" else float(v)


def calcular(cfg, valor: float, uf_destino: str = "", custo: float = 0.0, regra=None) -> Imposto:
    """Imposto de uma venda de `valor` reais para `uf_destino`.
    `custo` (custo total dos produtos vendidos) só entra nos créditos.
    `regra` é a linha da planilha de tributação do SKU (Real e Presumido)."""
    if valor <= 0:
        return Imposto(0.0)
    regime = cfg.regime if cfg.regime in REGIMES else "simples"
    if regime == "simples":
        aliq = float(cfg.aliquota_simples_pct or 0)
        total = valor * aliq / 100
        return Imposto(round(total, 2), aliquota_efetiva=aliq, detalhe=f"Simples Nacional {_pct(aliq)}")

    origem = (cfg.uf_origem or "").upper()
    destino = (uf_destino or "").upper() or origem
    partes = [f"planilha (SKU {regra.sku})"] if regra else []
    icms = difal = 0.0
    cst = (getattr(regra, "cst_icms", "") or "").strip()
    st = bool(regra and (regra.icms_st or cst in CST_ST))
    isento = bool(regra and (cst in CST_ISENTO or _f(regra.icms_pct) == 0))
    importado = (regra.origem in ORIGENS_IMPORTADAS) if regra and regra.origem else cfg.importado
    interna_origem = _f(regra.icms_pct) if regra and _f(regra.icms_pct) is not None else aliquota_interna(origem, cfg)
    if isento:
        partes.append("ICMS isento/não tributado")
    elif origem and interna_origem is not None:
        if destino == origem:
            if st:
                partes.append("ICMS já recolhido por ST")
            else:
                icms = valor * interna_origem / 100
                partes.append(f"ICMS {origem} {_pct(interna_origem)}")
        else:
            inter = interestadual(origem, destino, importado)
            icms = valor * inter / 100
            partes.append(f"ICMS interestadual {origem}→{destino} {_pct(inter)}")
            proprias = (regra.aliquotas_uf or {}) if regra else {}
            interna_destino = _f(proprias.get(destino)) if proprias.get(destino) not in (None, "") else aliquota_interna(destino, cfg)
            fcp = _f(regra.fcp_pct) or 0.0 if regra else 0.0
            if cfg.cobrar_difal and interna_destino is not None and interna_destino + fcp > inter:
                difal = valor * (interna_destino + fcp - inter) / 100
                partes.append(f"DIFAL {destino} {_pct(interna_destino + fcp - inter)}")
    else:
        partes.append("ICMS não calculado: informe o estado de origem")

    ipi_pct = (_f(regra.ipi_pct) or 0.0) if regra else 0.0
    ipi = valor * ipi_pct / 100
    if ipi_pct:
        partes.append(f"IPI {_pct(ipi_pct)}")
    pis_regra = [_f(regra.pis_pct), _f(regra.cofins_pct)] if regra else [None, None]
    if any(v is not None for v in pis_regra):
        pis_pct = sum(v or 0 for v in pis_regra)
    else:
        pis_pct = cfg.pis_cofins_pct if cfg.pis_cofins_pct is not None else PIS_COFINS_PADRAO[regime]
    base_pis = valor - icms if cfg.icms_excluido_pis_cofins else valor
    pis = max(base_pis, 0) * pis_pct / 100
    partes.append(f"PIS/COFINS {_pct(pis_pct)}")
    outros_pct = cfg.outros_pct if cfg.outros_pct is not None else OUTROS_PADRAO[regime]
    outros = valor * outros_pct / 100
    if outros_pct:
        partes.append(f"outros {_pct(outros_pct)}")
    creditos_regra = [_f(regra.credito_icms_pct), _f(regra.credito_pis_cofins_pct)] if regra else [None, None]
    credito_pct = (sum(v or 0 for v in creditos_regra) if any(v is not None for v in creditos_regra)
                   else float(cfg.credito_custo_pct or 0))
    credito = max(custo, 0) * credito_pct / 100
    if credito:
        partes.append(f"crédito na compra −{_pct(credito_pct)} do custo")
    total = max(icms + difal + pis + outros + ipi - credito, 0.0)
    return Imposto(round(total, 2), round(icms, 2), round(difal, 2), round(pis, 2), round(outros, 2), round(credito, 2),
                   round(ipi, 2), round(total / valor * 100, 2), " + ".join(partes))
