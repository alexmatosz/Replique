"use strict";

async function cartaoFaturamento(mes) {
  const alvo = $("#vg-faturamento");
  if (!alvo) return;
  let f;
  try { f = await api(`/api/faturamento-geral?mes=${mes}`); }
  catch (e) { alvo.innerHTML = `<div class="aviso vermelho pequeno">${h(e.message)}</div>`; return; }
  if (!$("#vg-faturamento")) return;
  const recorte = estado.recorteFat || "assessoria";
  const r = recorte === "assessoria" ? f.assessoria : f.mes_recorte;
  const plats = Object.keys(f.plataformas);
  const top = r.clientes.filter((c) => c.total > 0);
  const nomeMes = new Date(f.mes + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  alvo.innerHTML = `<div class="linha entre"><h2 style="margin:0">${ic("cifrao", "p")}${eAdmin() ? "Faturamento dos clientes com a Monvatti" : "Faturamento dos seus clientes"}</h2>
      <div class="linha" style="gap:8px"><div class="segmentos">${[["assessoria", "Desde o início da assessoria"], ["mes", "No mês"]].map(([v, n]) =>
        `<button type="button" data-recorte="${v}" class="${recorte === v ? "ativa" : ""}">${n}</button>`).join("")}</div>
        ${recorte === "mes" ? `<input type="month" id="vg-mes" value="${h(f.mes)}" style="max-width:180px" aria-label="Mês">` : ""}</div></div>
    <div class="grade g4" style="margin-top:12px">
      <div class="kpi-bloco"><span class="rotulo">${recorte === "assessoria" ? "Total com a Monvatti" : `Total em ${nomeMes}`}</span><div class="valor">${brl(r.total)}</div>
        <div class="pequeno suave">${numero(r.pedidos)} pedido(s), todos os canais</div></div>
      ${plats.map((p) => `<div class="kpi-bloco"><span class="rotulo">${h(f.plataformas[p])}</span><div class="valor">${brl(r.por_plataforma[p])}</div>
        <div class="pequeno suave">${r.total ? pct(r.por_plataforma[p] / r.total * 100) : "—"} do total</div></div>`).join("")}</div>
    ${top.length ? `<div class="tabela" style="margin-top:12px"><table><thead><tr><th>Cliente</th>${recorte === "assessoria" ? "<th>Assessorado desde</th>" : ""}
      ${plats.map((p) => `<th class="num">${h(f.plataformas[p])}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
      ${top.map((c) => `<tr><td><b>${h(c.nome)}</b></td>
        ${recorte === "assessoria" ? `<td class="pequeno">${new Date(c.inicio + "T12:00:00").toLocaleDateString("pt-BR")}${c.primeira_venda && c.primeira_venda > c.inicio
          ? `<div class="suave" title="As vendas anteriores a essa data ainda não foram sincronizadas em Gestão">vendas sincronizadas desde ${new Date(c.primeira_venda + "T12:00:00").toLocaleDateString("pt-BR")}</div>` : ""}</td>` : ""}
        ${plats.map((p) => `<td class="num">${c[p] ? brl(c[p]) : "—"}</td>`).join("")}<td class="num"><b>${brl(c.total)}</b></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="pequeno suave" style="margin-top:12px">Nenhuma venda sincronizada ${recorte === "assessoria" ? "desde o início da assessoria" : "neste mês"}.</p>`}
    <p class="pequeno suave">Soma o que cada cliente vendeu no Mercado Livre, na Shopee e na Amazon ${recorte === "assessoria"
      ? "desde que a Monvatti começou a assessorá-lo (a data do cadastro, ou a informada em Clientes)" : "no mês escolhido"}: pedidos pagos, já sem reembolsos e sem simulações,
      pelas vendas sincronizadas em Gestão.${f.sem_vendas_lucro ? ` ${numero(f.sem_vendas_lucro)} cliente(s) estão sem o módulo Gestão ligado e não entram na conta.` : ""}</p>`;
  $$("[data-recorte]", alvo).forEach((b) => (b.onclick = () => { estado.recorteFat = b.dataset.recorte; cartaoFaturamento(f.mes); }));
  if ($("#vg-mes")) $("#vg-mes").onchange = (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) cartaoFaturamento(e.target.value); };
}

const pctN = (v) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);
const varHtml = (v, inverso = false) => (v == null ? '<span class="pequeno suave">sem mês anterior</span>'
  : `<span class="pequeno ${(v < 0) !== inverso ? "ruim" : "bom"}">${v > 0 ? "↑" : v < 0 ? "↓" : "→"} ${pctN(Math.abs(v))} vs. mês anterior</span>`);
const seletorMes = (id, mes) => `<select id="${id}" aria-label="Mês" style="width:auto">${mesesRecentes().map(([v, n]) =>
  `<option value="${v}" ${v === mes ? "selected" : ""}>${n}</option>`).join("")}</select>`;
const estadoGestao = { aba: "cliente" };

async function telaGestaoVendas(mesParam) {
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : mesesRecentes()[0][0];
  const e = estadoGestao;
  const equipe = eTime();
  $("#tela").innerHTML = `<div class="topo"><div><h1>Gestão de vendas e rentabilidade</h1>
    <div class="suave">Quanto ${equipe ? `<b>${h(clienteAtual()?.nome)}</b>` : "a loja"} vende, quanto custa vender em cada canal e quanto sobra, comparando com o mês anterior.
      Os números são os mesmos de <a href="#/lucro">Vendas e taxas</a>.</div></div>
    <div class="linha">${seletorMes("gv-mes", mes)}</div></div>
    ${equipe ? `<div class="segmentos" style="margin-bottom:16px">${[["cliente", "Este cliente"], ["todos", "Todos os clientes"]].map(([v, n]) =>
      `<button type="button" data-gv-aba="${v}" class="${e.aba === v ? "ativa" : ""}">${n}</button>`).join("")}</div>` : ""}
    <div id="gv-corpo"><div class="esqueleto" style="height:200px"></div></div>`;
  $("#gv-mes").onchange = () => { location.hash = `#/vendas/${$("#gv-mes").value}`; };
  $$("[data-gv-aba]").forEach((b) => (b.onclick = () => { e.aba = b.dataset.gvAba; telaGestaoVendas(mes); }));
  if (equipe && e.aba === "todos") return carteiraGestao(mes);
  const g = await api(`/api/financeiro/gestao?mes=${mes}`);
  const i = g.indicadores;
  const kpi = (rot, k, fmt, inverso) => `<div class="cartao kpi-bloco"><span class="rotulo">${rot}</span><div class="valor">${fmt(i[k].atual)}</div>${varHtml(i[k].variacao, inverso)}</div>`;
  const canais = Object.entries(g.canais);
  $("#gv-corpo").innerHTML = `
    ${g.incompleto ? `<div class="aviso amarelo">${ic("alerta", "p")} ${g.sem_custo + g.sem_vinculo} venda(s) sem custo ou sem produto vinculado: o lucro e a margem estão maiores que o real.
      Cadastre em <a href="#/produtos">Produtos e custos</a>.</div>` : ""}
    ${g.simuladas ? `<div class="aviso azul">${ic("alerta", "p")} Há vendas simuladas neste mês.</div>` : ""}
    <div class="grade g4">${kpi("Faturamento", "total", brl)}${kpi("Pedidos", "pedidos", numero)}${kpi("Lucro", "lucro", brl)}${kpi("Margem", "margem", pct)}</div>
    <div class="grade g4" style="margin-top:16px">${kpi("Ticket médio", "ticket_medio", brl)}${kpi("Tarifas do marketplace", "comissao", brl, true)}
      ${kpi("Frete pago", "frete", brl, true)}${kpi("Publicidade", "ads_total", brl, true)}</div>
    <section class="cartao" style="margin-top:16px"><h2>${ic("loja", "p")}Por canal</h2>
      ${canais.length ? `<div class="tabela embutida"><table><thead><tr><th>Canal</th><th class="num">Faturamento</th><th class="num">Pedidos</th><th class="num">Ticket</th>
        <th class="num">Tarifas</th><th class="num">Frete</th><th class="num">Custo</th><th class="num">Ads</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody>
        ${canais.map(([k, c]) => `<tr><td>${selo(k)}<div>${varHtml(c.variacao_total)}</div></td><td class="num">${brl(c.total)}</td><td class="num">${c.pedidos}</td>
          <td class="num">${brl(c.ticket_medio)}</td><td class="num">${brl(c.comissao)}</td><td class="num">${brl(c.frete)}</td><td class="num">${brl(c.custo)}</td>
          <td class="num">${brl(c.ads)}</td><td class="num"><b>${brl(c.lucro)}</b></td><td class="num ${c.margem < 0 ? "ruim" : ""}">${pctN(c.margem)}</td></tr>`).join("")}</tbody></table></div>`
        : vazio("loja", "Nenhuma venda no mês", `As vendas são atualizadas sozinhas a cada hora; veja em <a href="#/lucro">Vendas e taxas</a>.`)}</section>
    ${g.achados.length ? `<section class="cartao" style="margin-top:16px"><div class="linha entre"><h2 style="margin:0">${ic("brilho", "p")}Alertas do analista</h2>
      <a href="#/analise/${mes}" class="pequeno">ver análise completa</a></div><div class="achados">${g.achados.map(htmlAchado).join("")}</div></section>` : ""}
    <section class="cartao" style="margin-top:16px"><div class="linha entre"><h2 style="margin:0">${ic("pacote", "p")}Por produto e curva ABC</h2>
      <button class="sec pequeno" id="gv-csv">${ic("enviar", "p")}CSV</button></div>
      <p class="pequeno suave">A = produtos que somam os primeiros 80% do faturamento; B = os próximos 15%; C = o resto.</p>
      ${g.produtos.length ? `<div class="tabela embutida"><table><thead><tr><th>Classe</th><th>Produto</th><th class="num">Unidades</th><th class="num">Faturamento</th>
        <th class="num">% do total</th><th class="num">Acumulado</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody>
        ${g.produtos.map((p) => `<tr><td><span class="selo ${p.classe === "A" ? "ok" : p.classe === "B" ? "neutro" : "demo"}">${p.classe}</span></td>
          <td><b>${h(p.titulo)}</b>${p.sku ? `<div class="pequeno suave">SKU ${h(p.sku)}</div>` : ""}${p.sem_custo || p.sem_vinculo ? '<div class="pequeno suave">sem custo: lucro parcial</div>' : ""}</td>
          <td class="num">${p.unidades}</td><td class="num">${brl(p.total)}</td><td class="num">${pctN(p.participacao)}</td><td class="num">${pctN(p.acumulado)}</td>
          <td class="num">${brl(p.lucro)}</td><td class="num ${p.lucro < 0 ? "ruim" : ""}">${pctN(p.margem)}</td></tr>`).join("")}</tbody></table></div>`
        : vazio("pacote", "Sem vendas no mês")}</section>`;
  if ($("#gv-csv")) $("#gv-csv").onclick = () => baixarCsv(`curva-abc-${mes}.csv`, ["Classe", "Produto", "SKU", "Unidades", "Faturamento", "% do total", "Acumulado %", "Lucro", "Margem %"],
    g.produtos.map((p) => [p.classe, p.titulo, p.sku, p.unidades, p.total, p.participacao, p.acumulado, p.lucro, p.margem]));
}

async function carteiraGestao(mes) {
  const lista = await api(`/api/analise/carteira?mes=${mes}`);
  $("#gv-corpo").innerHTML = `<div class="cartao">${lista.length ? `<div class="tabela embutida"><table><thead><tr><th>Cliente</th><th class="num">Faturamento</th>
    <th class="num">Pedidos</th><th class="num">Lucro</th><th class="num">Margem</th><th>Ponto de atenção</th><th></th></tr></thead><tbody>
    ${lista.map((c) => `<tr><td><b>${h(c.cliente.nome)}</b>${c.sincronizado_em ? "" : '<div class="pequeno suave">vendas não sincronizadas</div>'}</td>
      <td class="num">${brl(c.indicadores.faturamento)}<div>${varHtml(c.variacao_faturamento)}</div></td><td class="num">${c.indicadores.pedidos}</td>
      <td class="num">${brl(c.indicadores.lucro)}<div>${varHtml(c.variacao_lucro)}</div></td><td class="num ${c.indicadores.margem < 0 ? "ruim" : ""}">${pctN(c.indicadores.margem)}</td>
      <td class="pequeno">${c.vermelhos ? `<span class="selo erro">${c.vermelhos}</span> ` : ""}${c.amarelos ? `<span class="selo demo">${c.amarelos}</span> ` : ""}${h(c.principal || "—")}</td>
      <td><button type="button" class="sec pequeno" data-gv-cliente="${c.cliente.id}">Abrir</button></td></tr>`).join("")}</tbody></table></div>`
    : vazio("loja", "Nenhum cliente")}</div>`;
  $$("[data-gv-cliente]").forEach((b) => (b.onclick = () => {
    estadoGestao.aba = "cliente";
    trocarCliente(+b.dataset.gvCliente, { navegar: false });
    telaGestaoVendas(mes);
  }));
}

const estadoLucr = { margem: 15 };

async function telaLucratividade() {
  const e = estadoLucr;
  const r = await api(`/api/financeiro/lucratividade?margem=${e.margem}`);
  const plats = Object.keys(PLAT);
  $("#tela").innerHTML = `<div class="topo"><div><h1>Minha lucratividade</h1>
    <div class="suave">Custo de cada produto, a margem real dos últimos ${r.dias} dias por canal e o preço mínimo para a margem que você quer.
      Quando o produto ainda não vendeu num canal, a conta usa a tarifa padrão dele e o imposto configurado (marcado como estimativa).</div></div>
    <div class="linha"><label class="linha" style="gap:6px;margin:0">Margem desejada
      <input type="number" id="lc-margem" min="0" max="90" step="1" value="${r.margem_alvo}" style="width:80px"> %</label>
      <a class="botao sec" href="#/produtos">${ic("pacote", "p")}Custos e planilha</a></div></div>
    ${r.sem_custo ? `<div class="aviso amarelo">${ic("alerta", "p")} ${r.sem_custo} produto(s) sem custo cadastrado: sem custo não dá para calcular margem nem preço mínimo.
      Cadastre ou importe por planilha em <a href="#/produtos">Produtos e custos</a>.</div>` : ""}
    ${r.com_prejuizo ? `<div class="aviso vermelho">${ic("alerta", "p")} <b>${r.com_prejuizo} produto(s) com prejuízo</b> em algum canal no preço médio vendido. Estão no topo da lista.</div>` : ""}
    <div class="cartao">${r.produtos.length ? `<div class="tabela embutida"><table><thead><tr><th>Produto</th><th class="num">Custo</th>
      ${plats.map((p) => `<th>${PLAT[p].nome}</th>`).join("")}<th></th></tr></thead><tbody>
      ${r.produtos.map((p, n) => `<tr class="${p.prejuizo ? "destaque-ruim" : ""}"><td><b>${h(p.nome)}</b>${p.sku ? `<div class="pequeno suave">SKU ${h(p.sku)}</div>` : ""}
          <div class="pequeno suave">${p.unidades} vendida(s) em ${r.dias} dias</div></td>
        <td class="num">${p.custo != null ? brl(p.custo) : '<span class="selo demo">sem custo</span>'}</td>
        ${plats.map((k) => { const c = p.canais[k];
          return `<td class="pequeno">${c.margem != null ? `<b class="${c.margem < 0 ? "ruim" : ""}">${pctN(c.margem)}</b> a ${brl(c.preco_medio)}` : '<span class="suave">sem vendas</span>'}
            ${c.preco_minimo ? `<div>mínimo ${brl(c.preco_minimo)}</div>` : ""}
            <div class="suave">${c.fonte === "vendas" ? "das suas vendas" : c.fonte === "mercado_livre" ? "comissão e frete do ML" : "estimativa: sem vendas e sem leitura do ML"}</div></td>`; }).join("")}
        <td>${p.custo != null ? `<button type="button" class="sec pequeno" data-lc-sim="${n}">${ic("calculadora", "p")}Simular</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("pacote", "Nenhum produto cadastrado", `Cadastre ou importe em <a href="#/produtos">Produtos e custos</a>.`)}</div>`;
  $("#lc-margem").onchange = () => { e.margem = Math.min(90, Math.max(0, +$("#lc-margem").value || 0)); telaLucratividade(); };
  $$("[data-lc-sim]").forEach((b) => (b.onclick = () => simularLucro(r.produtos[+b.dataset.lcSim], r.margem_alvo)));
}

function simularLucro(p, margemAlvo) {
  const plats = Object.keys(PLAT);
  const m = modal(`<h2>${ic("calculadora", "p")}E se… ${h(p.nome)}</h2>
    <p class="pequeno suave">Mude preço, frete ou custo e veja o lucro por unidade em cada canal. Tarifa, imposto e Ads usam o percentual
      ${"de cada canal"} (das suas vendas ou a estimativa). Nada é salvo.</p>
    <div class="grade g4"><div><label for="sm-custo">Custo</label><input type="number" id="sm-custo" step="0.01" min="0" value="${p.custo}"></div>
      <div><label for="sm-emb">Embalagem</label><input type="number" id="sm-emb" step="0.01" min="0" value="${p.embalagem}"></div></div>
    <div class="tabela embutida" style="margin-top:12px"><table><thead><tr><th>Canal</th><th>Preço</th><th>Frete por unidade</th><th class="num">Lucro por unidade</th>
      <th class="num">Margem</th><th class="num">Mínimo p/ ${margemAlvo}%</th></tr></thead><tbody>
      ${plats.map((k) => { const c = p.canais[k];
        return `<tr data-sm="${k}"><td>${selo(k)}<div class="pequeno suave">tarifa ${pctN(c.comissao_pct)} · imposto ${pctN(c.imposto_pct)}${c.ads_pct ? ` · Ads ${pctN(c.ads_pct)}` : ""}</div></td>
          <td><input type="number" step="0.01" min="0" data-sm-preco value="${c.preco_medio || c.preco_minimo || ""}" style="width:110px"></td>
          <td><input type="number" step="0.01" min="0" data-sm-frete value="${c.frete_unidade}" style="width:100px"></td>
          <td class="num" data-sm-lucro></td><td class="num" data-sm-margem></td><td class="num" data-sm-min></td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
  m.classList.add("largo");
  const calcular = () => {
    const custo = +$("#sm-custo", m).value || 0, emb = +$("#sm-emb", m).value || 0;
    $$("[data-sm]", m).forEach((tr) => {
      const c = { ...p.canais[tr.dataset.sm], frete_unidade: +$("[data-sm-frete]", tr).value || 0 };
      const preco = +$("[data-sm-preco]", tr).value || 0;
      const varPct = (c.comissao_pct + c.imposto_pct + c.ads_pct) / 100;
      const lucro = preco * (1 - varPct) - c.frete_unidade - c.taxa_fixa - custo - emb;
      const minimo = 1 - varPct - margemAlvo / 100 > 0 ? (custo + emb + c.frete_unidade + c.taxa_fixa) / (1 - varPct - margemAlvo / 100) : null;
      $("[data-sm-lucro]", tr).innerHTML = preco ? `<b class="${lucro < 0 ? "ruim" : ""}">${brl(lucro)}</b>` : "—";
      $("[data-sm-margem]", tr).textContent = preco ? pctN(Math.round((lucro / preco) * 1000) / 10) : "—";
      $("[data-sm-min]", tr).textContent = minimo ? brl(minimo) : "—";
    });
  };
  $$("input", m).forEach((i) => (i.oninput = calcular));
  calcular();
}

async function telaDre(mesParam) {
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : mesesRecentes()[0][0];
  const d = await api(`/api/financeiro/dre?mes=${mes}&meses=3`);
  const LINHAS = [["receita_bruta", "Receita bruta", "forte"], ["devolucoes", "(−) Devoluções e reembolsos"], ["bonus", "(+) Bônus do marketplace"],
    ["impostos", "(−) Impostos sobre a venda"], ["receita_liquida", "= Receita líquida", "forte"], ["cmv", "(−) Custo das mercadorias"],
    ["tarifas", "(−) Tarifas do marketplace"], ["frete", "(−) Frete"], ["ads", "(−) Publicidade (Ads)"],
    ...(d.colunas.some((c) => c.linhas.tarifas_fatura) ? [["tarifas_fatura", "(−) Outras tarifas da fatura do ML · a conferir"]] : []),
    ["margem_contribuicao", "= Margem de contribuição", "forte"], ["despesas", "(−) Despesas operacionais"], ["resultado", "= Resultado: o que sobrou no bolso", "forte"]];
  const nomeMes = (m) => mesesRecentes(24).find(([v]) => v === m)?.[1] || m;
  const canais = Object.entries(d.por_canal);
  $("#tela").innerHTML = `<div class="topo nao-imprimir"><div><h1>Resultado do mês</h1>
    <div class="suave">O DRE simplificado da loja, comparado com os meses anteriores e por canal: de onde vem o dinheiro, para onde vai e o que sobrou (ou faltou) no bolso. Passe o mouse no nome da linha para ver de onde sai cada número.</div></div>
    <div class="linha">${seletorMes("dre-mes", mes)}<button class="sec" id="dre-csv">${ic("enviar", "p")}CSV</button>
      <button class="sec" id="dre-pdf">${ic("relatorio", "p")}PDF</button></div></div>
    <h1 class="so-impressao">DRE simplificado · ${h(clienteAtual()?.nome || "")} · ${h(nomeMes(mes))}</h1>
    ${d.avisos.map((a) => `<div class="aviso amarelo">${ic("alerta", "p")} ${h(a)}</div>`).join("")}
    <section class="cartao"><div class="tabela embutida"><table class="tabela-dre"><thead><tr><th>Linha</th>
      ${d.colunas.map((c) => `<th class="num">${h(nomeMes(c.mes))}${c.incompleto ? ' <span class="selo demo" title="Há vendas sem custo cadastrado">incompleto</span>' : ""}</th>`).join("")}
      <th class="num">% da receita líquida</th></tr></thead><tbody>
      ${LINHAS.map(([k, nome, forte]) => { const ult = d.colunas[d.colunas.length - 1].linhas;
        return `<tr class="${forte ? "linha-forte" : ""}"><td title="${h(d.origem[k] || "")}">${nome}</td>
          ${d.colunas.map((c) => `<td class="num ${c.linhas[k] < 0 && forte ? "ruim" : ""}">${brl(c.linhas[k])}</td>`).join("")}
          <td class="num pequeno suave">${ult.receita_liquida ? pctN(Math.round((ult[k] / ult.receita_liquida) * 1000) / 10) : "—"}</td></tr>`; }).join("")}
      <tr class="linha-forte"><td>Margem líquida</td>${d.colunas.map((c) => `<td class="num">${pctN(c.linhas.margem_liquida)}</td>`).join("")}<td></td></tr>
    </tbody></table></div></section>
    <div class="grade g2" style="margin-top:16px;align-items:start">
      <section class="cartao"><h2>${ic("loja", "p")}Por canal em ${h(nomeMes(mes))}</h2>
        <p class="pequeno suave">Até a margem de contribuição. As despesas operacionais não são divididas entre os canais.</p>
        ${canais.length ? `<div class="tabela embutida"><table><thead><tr><th>Linha</th>${canais.map(([k]) => `<th class="num">${PLAT[k]?.nome || h(k)}</th>`).join("")}</tr></thead><tbody>
          ${LINHAS.filter(([k]) => !["despesas", "resultado"].includes(k)).map(([k, nome, forte]) => `<tr class="${forte ? "linha-forte" : ""}"><td>${nome}</td>
            ${canais.map(([, c]) => `<td class="num">${brl(c[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : vazio("loja", "Sem vendas no mês")}</section>
      <section class="cartao"><h2>${ic("loja", "p")}Despesas operacionais</h2>
        ${Object.keys(d.despesas_por_categoria).length ? Object.entries(d.despesas_por_categoria).map(([c, v]) => `<div class="linha entre" style="padding:6px 0;border-bottom:1px solid var(--borda)">
          <span>${h(c)}</span><b>${brl(v)}</b></div>`).join("") : `<p class="pequeno suave">Nenhuma despesa cadastrada. Cadastre em <a href="#/despesas/${mes}">Custo operacional</a>.</p>`}</section>
    </div>`;
  $("#dre-mes").onchange = () => { location.hash = `#/dre/${$("#dre-mes").value}`; };
  $("#dre-pdf").onclick = () => window.print();
  $("#dre-csv").onclick = () => baixarCsv(`dre-${mes}.csv`, ["Linha", ...d.colunas.map((c) => c.mes), "Origem do número"],
    [...LINHAS.map(([k, nome]) => [nome, ...d.colunas.map((c) => c.linhas[k]), d.origem[k] || ""]),
      ["Margem líquida %", ...d.colunas.map((c) => c.linhas.margem_liquida), "Resultado ÷ receita líquida"]]);
}

function mesesRecentes(n = 12) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })];
  });
}

async function desenharRelatorio(alvo, mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const cid = estado.usuario.papel === "cliente" ? estado.usuario.cliente_id : estado.clienteId;
  const r = await api(`/api/relatorios/${cid}?mes=${mes}`);
  const nomeMes = meses.find(([v]) => v === mes)?.[1] || mes;
  const n = r.numeros;
  const s = r.saude;
  const [corS, rotS] = NIVEL_SAUDE[s.nivel] || NIVEL_SAUDE.nunca;
  alvo.innerHTML = `<div class="linha entre nao-imprimir" style="margin-bottom:12px"><div class="suave">Resumo do trabalho na loja de <b>${h(r.cliente.nome)}</b>,
      pronto para enviar ao cliente (Imprimir → Salvar como PDF).</div>
    <div class="linha"><select id="r-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select>
      <button id="r-imprimir">${ic("imprimir", "p")}Imprimir / PDF</button></div></div>
  <article class="cartao relatorio">
    <header class="linha entre"><div class="linha" style="gap:10px"><img src="/static/monvatti-v.png" alt="Monvatti" width="36" height="36">
      <div><b>Monvatti Radar</b><div class="pequeno suave">Relatório mensal · Monvatti</div></div></div>
      <div style="text-align:right"><h1 style="margin:0">${h(r.cliente.nome)}</h1>
      <span class="suave">${h(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1))}</span></div></header>
    <div class="grade g4 kpis-relatorio">
      ${[["Anúncios publicados", n.publicados], ["Rascunhos criados", n.rascunhos_criados], ["Perguntas respondidas", n.perguntas_respondidas],
        ["Preços ajustados", n.precos_ajustados]].map(([rot, v]) => `<div class="kpi-rel"><b>${v}</b><span>${rot}</span></div>`).join("")}
    </div>
    <div class="grade g2" style="margin-top:18px">
      <section><h3>Publicações por marketplace</h3>${Object.keys(r.por_plataforma).length ? Object.entries(r.por_plataforma).map(([p, v]) =>
        `<div class="linha entre barra-rel"><span>${h(p)}</span><b>${v}</b></div>`).join("") : '<p class="suave pequeno">Nenhuma publicação no mês.</p>'}
        ${n.lotes ? `<p class="pequeno suave">${n.lotes} publicação(ões) em lote.</p>` : ""}</section>
      <section><h3>Saúde da conta no Mercado Livre</h3><p><span class="selo-nivel ${corS}">${rotS}</span>
        ${s.dados?.termometro_nome ? ` termômetro ${h(s.dados.termometro_nome)}` : ""}</p>
        ${(s.dados?.metricas || []).map((mt) => `<div class="linha entre pequeno"><span>${h(mt.nome)}</span><b>${(mt.taxa * 100).toFixed(2).replace(".", ",")}%</b></div>`).join("")}
        ${s.criada_em ? `<p class="pequeno suave">Verificado em ${data(s.criada_em)}.</p>` : '<p class="pequeno suave">Ainda não verificado.</p>'}</section>
    </div>
    ${Object.keys(r.por_pessoa).length ? `<section style="margin-top:18px"><h3>Quem trabalhou na loja</h3><p class="pequeno">${Object.entries(r.por_pessoa)
      .map(([p, v]) => `${h(p)} (${v} ações)`).join(" · ")}</p></section>` : ""}
    <section style="margin-top:18px"><h3>Anúncios publicados</h3>${r.publicacoes.length ? `<table><thead><tr><th>Anúncio</th><th>Marketplace</th><th>Data</th></tr></thead>
      <tbody>${r.publicacoes.map((p) => `<tr><td>${urlSegura(p.link) ? `<a href="${h(p.link)}" target="_blank" rel="noopener">${h(p.titulo)}</a>` : h(p.titulo)}</td>
        <td>${h(p.plataforma)}</td><td>${data(p.data)}</td></tr>`).join("")}</tbody></table>` : '<p class="suave pequeno">Nenhum anúncio publicado neste mês.</p>'}</section>
    <footer class="pequeno suave" style="margin-top:18px">Gerado pelo Monvatti Radar em ${data(r.gerado_em)}.</footer>
  </article>`;
  $("#r-mes").onchange = () => { location.hash = "#/acompanhamento/" + $("#r-mes").value; };
  $("#r-imprimir").onclick = () => window.print();
}
