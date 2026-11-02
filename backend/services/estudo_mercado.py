"""Planilha de estudo de mercado gerada pela extensão a partir de uma busca do Mercado Livre.

Segue a calculadora da Monvatti (Calculadora ML / SHOPEE): o cliente preenche o custo e a margem
sai sozinha pela mesma fórmula (preço − custo − comissão − taxa fixa − frete − imposto)."""

from datetime import date
from io import BytesIO

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

MAX_ANUNCIOS = 200

_REAL = '[$R$ -416]#,##0.00'
_ESCURO = PatternFill("solid", fgColor="434343")
_CINZA = PatternFill("solid", fgColor="F3F3F3")
_ENTRADA = PatternFill("solid", fgColor="FFF2CC")
_AZUL = PatternFill("solid", fgColor="0B50F5")
_BORDA = Border(*(Side(style="thin", color="D9D9D9"),) * 4)

COLUNAS = [
    ("Produto", 58), ("Venda/dia", 10), ("Venda/mês", 11), ("Rec. COMPRA", 12), ("Preço de venda", 14),
    ("Custo do Produto", 15), ("Comissão %", 11), ("Taxa fixa", 10), ("Frete", 10), ("Imposto %", 10),
    ("Margem %", 10), ("Margem R$", 12), ("Total da compra", 15), ("Tipo", 10), ("Logística", 10),
    ("Criado em (aprox.)", 14), ("Link do anúncio", 50),
]

COMO_LER = [
    ("Venda/dia e Venda/mês", "Vendidos públicos ÷ dias desde a data mais antiga encontrada (criação do anúncio, do catálogo, "
                              "1ª avaliação ou 1ª pergunta). Venda/mês = venda/dia × 30. É a média desde o início. "
                              "Fica 0 quando a página não mostra vendidos e “sem data” quando o anúncio vende mas não tem "
                              "avaliação, pergunta nem catálogo para saber desde quando."),
    ("Preço de venda", "Preço atual do anúncio no momento do estudo."),
    ("Custo do Produto", "Preencha com o custo do cliente. Enquanto estiver em branco, a margem fica em branco."),
    ("Rec. COMPRA", "Quantidade que o cliente pretende comprar. O Total da compra = quantidade × custo."),
    ("Comissão % e Taxa fixa", "Tabela oficial de tarifas do Mercado Livre para a categoria e o preço, no tipo do anúncio "
                               "(Clássico ou Premium)."),
    ("Frete", "Frete grátis que o vendedor do anúncio paga, calculado pelo Mercado Livre com o peso cadastrado. "
              "Em branco quando o Mercado Livre não devolveu."),
    ("Imposto %", "Vem da célula amarela no topo (imposto do cliente) e vale para todas as linhas. "
                  "Para um produto com alíquota diferente, digite o valor direto na linha."),
    ("Margem R$", "Preço − custo − preço × comissão − taxa fixa − frete − preço × imposto."),
    ("Margem %", "Margem R$ ÷ preço. Verde a partir de 15%, amarelo de 10% a 14,99%, vermelho abaixo de 10%."),
    ("Criado em (aprox.)", "O Mercado Livre não libera a data de criação de anúncio de outro vendedor; usamos a avaliação "
                           "de comprador mais antiga ou a 1ª pergunta. O anúncio foi criado antes dessa data."),
    ("Fonte", "Dados públicos da página e da API oficial do Mercado Livre, lidos pela conta de estudo da Monvatti."),
]


def _num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _venda(v):
    n = _num(v)
    return "sem data" if n is None else n


def _txt(v, n: int = 300) -> str:
    return str(v or "")[:n]


def planilha(pesquisa: str, filtro: str, imposto_pct: float, itens: list[dict]) -> bytes:
    """Monta o .xlsx do estudo. Cada item já vem com os números que a extensão mostrou na busca."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Estudo"
    ultima = get_column_letter(len(COLUNAS))
    ws.merge_cells(f"A1:{ultima}1")
    ws["A1"] = f"Estudo de mercado · {pesquisa or 'busca do Mercado Livre'}"
    ws["A1"].font = Font(bold=True, size=14, color="FFFFFF")
    ws["A1"].fill = _AZUL
    ws["A1"].alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[1].height = 28
    ws.merge_cells(f"A2:{ultima}2")
    ws["A2"] = (f"Gerado em {date.today():%d/%m/%Y} pela extensão Monvatti Pro · {len(itens)} anúncios"
                + (f" · filtro: {filtro}" if filtro else "")
                + " · Preencha a coluna amarela “Custo do Produto” e a margem é calculada sozinha.")
    ws["A2"].font = Font(italic=True, color="5F6B85")
    ws["A2"].alignment = Alignment(indent=1)
    ws["A3"] = "Imposto do cliente (vale para todas as linhas; troque aqui se precisar)"
    ws["A3"].font = Font(bold=True, color="434343")
    ws["A3"].alignment = Alignment(horizontal="right", indent=1)
    ws["B3"] = (imposto_pct or 0) / 100
    ws["B3"].number_format = "0.00%"
    ws["B3"].fill = _ENTRADA
    ws["B3"].font = Font(bold=True, size=12)
    ws["B3"].border = Border(*(Side(style="medium", color="A15C07"),) * 4)
    ws["B3"].alignment = Alignment(horizontal="center")
    ws.row_dimensions[3].height = 22

    cab = 4
    for i, (nome, largura) in enumerate(COLUNAS, start=1):
        c = ws.cell(row=cab, column=i, value=nome)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = _ENTRADA if nome in ("Custo do Produto", "Rec. COMPRA") else _ESCURO
        if nome in ("Custo do Produto", "Rec. COMPRA"):
            c.font = Font(bold=True, color="434343")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = _BORDA
        ws.column_dimensions[get_column_letter(i)].width = largura
    ws.row_dimensions[cab].height = 30

    for n, it in enumerate(itens[:MAX_ANUNCIOS]):
        r = cab + 1 + n
        link = _txt(it.get("link"), 500)
        valores = [
            _txt(it.get("titulo")), _venda(it.get("vendas_dia")), _venda(it.get("vendas_mes")), None, _num(it.get("preco")),
            None, (_num(it.get("comissao_pct")) or 0) / 100 if it.get("comissao_pct") is not None else None,
            _num(it.get("taxa_fixa")), _num(it.get("frete")), "=$B$3",
            f'=IF(OR(F{r}="",E{r}=0,L{r}=""),"",L{r}/E{r})',
            f'=IF(OR(F{r}="",E{r}=""),"",E{r}-F{r}-E{r}*G{r}-H{r}-I{r}-E{r}*J{r})',
            f'=IF(OR(D{r}="",F{r}=""),"",D{r}*F{r})',
            _txt(it.get("tipo"), 20), _txt(it.get("logistica"), 20), _txt(it.get("criado_em"), 12), link,
        ]
        for col, v in enumerate(valores, start=1):
            c = ws.cell(row=r, column=col, value=v)
            c.border = _BORDA
            c.fill = _ENTRADA if col in (4, 6) else (_CINZA if n % 2 else PatternFill())
        for col in range(1, len(COLUNAS) + 1):
            ws.cell(row=r, column=col).alignment = Alignment(vertical="center", wrap_text=False)
        ws.row_dimensions[r].height = 20
        for col in (2, 3):
            if ws.cell(row=r, column=col).value == "sem data":
                ws.cell(row=r, column=col).font = Font(italic=True, color="8A94AB")
        if link:
            ws.cell(row=r, column=1).hyperlink = link
            ws.cell(row=r, column=1).font = Font(color="0B50F5", underline="single")
            ws.cell(row=r, column=17).hyperlink = link
            ws.cell(row=r, column=17).font = Font(color="0B50F5", underline="single")
        for col, fmt in ((2, "#,##0"), (3, "#,##0"), (4, "#,##0"), (5, _REAL), (6, _REAL), (7, "0.0%"), (8, _REAL),
                         (9, _REAL), (10, "0.0%"), (11, "0.00%"), (12, _REAL), (13, _REAL)):
            ws.cell(row=r, column=col).number_format = fmt
        for col in (2, 3, 7, 10, 11, 14, 15, 16):
            ws.cell(row=r, column=col).alignment = Alignment(horizontal="center", vertical="center")
        ws.cell(row=r, column=11).font = Font(bold=True)
        ws.cell(row=r, column=12).font = Font(bold=True)

    fim = cab + max(len(itens[:MAX_ANUNCIOS]), 1)
    faixa = f"K{cab + 1}:K{fim}"
    ws.conditional_formatting.add(faixa, FormulaRule(formula=[f'AND(K{cab + 1}<>"",K{cab + 1}>=0.15)'],
                                                     fill=PatternFill("solid", fgColor="D9EAD3"), font=Font(bold=True, color="0F8A5F")))
    ws.conditional_formatting.add(faixa, FormulaRule(formula=[f'AND(K{cab + 1}<>"",K{cab + 1}>=0.1,K{cab + 1}<0.15)'],
                                                     fill=PatternFill("solid", fgColor="FFF2CC"), font=Font(bold=True, color="A15C07")))
    ws.conditional_formatting.add(faixa, FormulaRule(formula=[f'AND(K{cab + 1}<>"",K{cab + 1}<0.1)'],
                                                     fill=PatternFill("solid", fgColor="F4CCCC"), font=Font(bold=True, color="D4343B")))
    ws.conditional_formatting.add(f"L{cab + 1}:L{fim}", CellIsRule(operator="lessThan", formula=["0"], font=Font(bold=True, color="D4343B")))
    validacao = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                               error="Informe um valor maior ou igual a zero.", errorTitle="Valor inválido")
    ws.add_data_validation(validacao)
    validacao.add(f"D{cab + 1}:D{fim}")
    validacao.add(f"F{cab + 1}:F{fim}")
    validacao.add("B3")
    ws.freeze_panes = f"B{cab + 1}"
    ws.auto_filter.ref = f"A{cab}:{ultima}{fim}"

    guia = wb.create_sheet("Como ler")
    guia.column_dimensions["A"].width = 24
    guia.column_dimensions["B"].width = 110
    guia["A1"] = "Como ler o estudo"
    guia["A1"].font = Font(bold=True, size=13, color="0B50F5")
    for i, (campo, texto) in enumerate(COMO_LER, start=3):
        guia.cell(row=i, column=1, value=campo).font = Font(bold=True)
        guia.cell(row=i, column=2, value=texto).alignment = Alignment(wrap_text=True, vertical="top")
        guia.cell(row=i, column=1).alignment = Alignment(vertical="top")

    saida = BytesIO()
    wb.save(saida)
    return saida.getvalue()
