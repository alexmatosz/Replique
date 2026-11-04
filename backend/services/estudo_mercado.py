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
    ("Produto", 58), ("Vendidos", 11), ("Venda/dia", 10), ("Venda/mês", 11), ("Rec. COMPRA", 12), ("Preço de venda", 14),
    ("Custo do Produto", 15), ("Comissão %", 11), ("Taxa fixa", 10), ("Frete", 10), ("Imposto %", 10),
    ("Margem %", 10), ("Margem R$", 12), ("Total da compra", 15), ("Tipo", 10), ("Logística", 14), ("Catálogo", 10),
    ("Criado em (aprox.)", 14), ("Link do anúncio", 50),
]
L = {nome: get_column_letter(i) for i, (nome, _) in enumerate(COLUNAS, start=1)}
N = {nome: i for i, (nome, _) in enumerate(COLUNAS, start=1)}
ENTRADAS = ("Custo do Produto", "Rec. COMPRA")

COMO_LER = [
    ("Vendidos", "Número público de vendidos que o Mercado Livre mostra no anúncio. Com “+” na frente (ex.: +1000) é um piso: "
                 "o anúncio vendeu pelo menos isso."),
    ("Venda/dia e Venda/mês", "Vendidos públicos ÷ dias desde a data mais antiga encontrada (criação do anúncio, do catálogo, "
                              "1ª avaliação ou 1ª pergunta). Venda/dia com uma casa decimal (0,5 = uma venda a cada dois dias); venda/mês = vendidos ÷ dias × 30. É a média desde o início. "
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
    ("Logística", "Forma de envio principal do anúncio (Full, Coleta, Correios, Places). “+ Flex” quando ele também entrega pelo Flex."),
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


def _vendidos(it: dict):
    n = _num(it.get("vendidos"))
    return int(n) if n is not None else None


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
        entrada = nome in ENTRADAS
        c.font = Font(bold=True, color="434343" if entrada else "FFFFFF")
        c.fill = _ENTRADA if entrada else _ESCURO
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = _BORDA
        ws.column_dimensions[get_column_letter(i)].width = largura
    ws.row_dimensions[cab].height = 30

    for n, it in enumerate(itens[:MAX_ANUNCIOS]):
        r = cab + 1 + n
        link = _txt(it.get("link"), 500)
        preco, custo, qtd = f"{L['Preço de venda']}{r}", f"{L['Custo do Produto']}{r}", f"{L['Rec. COMPRA']}{r}"
        margem_rs = f"{L['Margem R$']}{r}"
        comissao = it.get("comissao_pct")
        valores = {
            "Produto": _txt(it.get("titulo")), "Vendidos": _vendidos(it), "Venda/dia": _venda(it.get("vendas_dia")),
            "Venda/mês": _venda(it.get("vendas_mes")), "Rec. COMPRA": None, "Preço de venda": _num(it.get("preco")),
            "Custo do Produto": None, "Comissão %": (_num(comissao) or 0) / 100 if comissao is not None else None,
            "Taxa fixa": _num(it.get("taxa_fixa")), "Frete": _num(it.get("frete")), "Imposto %": "=$B$3",
            "Margem %": f'=IF(OR({custo}="",{preco}=0,{margem_rs}=""),"",{margem_rs}/{preco})',
            "Margem R$": (f'=IF(OR({custo}="",{preco}=""),"",{preco}-{custo}-{preco}*{L["Comissão %"]}{r}'
                          f'-{L["Taxa fixa"]}{r}-{L["Frete"]}{r}-{preco}*{L["Imposto %"]}{r})'),
            "Total da compra": f'=IF(OR({qtd}="",{custo}=""),"",{qtd}*{custo})',
            "Tipo": _txt(it.get("tipo"), 20), "Logística": _txt(it.get("logistica"), 30), "Catálogo": _txt(it.get("catalogo"), 5),
            "Criado em (aprox.)": _txt(it.get("criado_em"), 12), "Link do anúncio": link,
        }
        for nome, v in valores.items():
            c = ws.cell(row=r, column=N[nome], value=v)
            c.border = _BORDA
            c.fill = _ENTRADA if nome in ENTRADAS else (_CINZA if n % 2 else PatternFill())
            c.alignment = Alignment(vertical="center", wrap_text=False)
        ws.row_dimensions[r].height = 20
        for nome in ("Venda/dia", "Venda/mês"):
            if ws.cell(row=r, column=N[nome]).value == "sem data":
                ws.cell(row=r, column=N[nome]).font = Font(italic=True, color="8A94AB")
        if link:
            for nome in ("Produto", "Link do anúncio"):
                ws.cell(row=r, column=N[nome]).hyperlink = link
                ws.cell(row=r, column=N[nome]).font = Font(color="0B50F5", underline="single")
        for nome, fmt in (("Vendidos", "#,##0"), ("Venda/dia", "#,##0.0"), ("Venda/mês", "#,##0"), ("Rec. COMPRA", "#,##0"),
                          ("Preço de venda", _REAL), ("Custo do Produto", _REAL), ("Comissão %", "0.0%"), ("Taxa fixa", _REAL),
                          ("Frete", _REAL), ("Imposto %", "0.0%"), ("Margem %", "0.00%"), ("Margem R$", _REAL),
                          ("Total da compra", _REAL)):
            ws.cell(row=r, column=N[nome]).number_format = fmt
        if _txt(it.get("vendidos_texto"), 40).strip().startswith("+"):
            ws.cell(row=r, column=N["Vendidos"]).number_format = '"+"#,##0'
        for nome in ("Vendidos", "Venda/dia", "Venda/mês", "Comissão %", "Imposto %", "Margem %", "Tipo", "Logística", "Catálogo",
                     "Criado em (aprox.)"):
            ws.cell(row=r, column=N[nome]).alignment = Alignment(horizontal="center", vertical="center")
        ws.cell(row=r, column=N["Margem %"]).font = Font(bold=True)
        ws.cell(row=r, column=N["Margem R$"]).font = Font(bold=True)

    fim = cab + max(len(itens[:MAX_ANUNCIOS]), 1)
    k = f"{L['Margem %']}{cab + 1}"
    faixa = f"{L['Margem %']}{cab + 1}:{L['Margem %']}{fim}"
    ws.conditional_formatting.add(faixa, FormulaRule(formula=[f'AND({k}<>"",{k}>=0.15)'],
                                                     fill=PatternFill("solid", fgColor="D9EAD3"), font=Font(bold=True, color="0F8A5F")))
    ws.conditional_formatting.add(faixa, FormulaRule(formula=[f'AND({k}<>"",{k}>=0.1,{k}<0.15)'],
                                                     fill=PatternFill("solid", fgColor="FFF2CC"), font=Font(bold=True, color="A15C07")))
    ws.conditional_formatting.add(faixa, FormulaRule(formula=[f'AND({k}<>"",{k}<0.1)'],
                                                     fill=PatternFill("solid", fgColor="F4CCCC"), font=Font(bold=True, color="D4343B")))
    ws.conditional_formatting.add(f"{L['Margem R$']}{cab + 1}:{L['Margem R$']}{fim}",
                                  CellIsRule(operator="lessThan", formula=["0"], font=Font(bold=True, color="D4343B")))
    validacao = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                               error="Informe um valor maior ou igual a zero.", errorTitle="Valor inválido")
    ws.add_data_validation(validacao)
    for nome in ENTRADAS:
        validacao.add(f"{L[nome]}{cab + 1}:{L[nome]}{fim}")
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
