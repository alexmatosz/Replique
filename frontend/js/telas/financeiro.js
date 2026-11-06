"use strict";

const SITUACAO_PUB = { active: ["ok", "ativo"], paused: ["demo", "pausado"], closed: ["erro", "finalizado"], deleted: ["erro", "excluído"],
  under_review: ["demo", "em revisão"], inactive: ["demo", "inativo"] };
const ACAO_PUB = { pausar: ["pausa", "Pausar"], reativar: ["play", "Reativar"], finalizar: ["x", "Finalizar"], excluir: ["lixo2", "Excluir"] };
const CONFIRMA_ACAO = {
  pausar: "Pausar o anúncio? Ele some das buscas até ser reativado.",
  finalizar: "Finalizar o anúncio? Ele sai do ar e NÃO pode ser reativado (seria preciso publicar de novo).",
  excluir: "Excluir o anúncio no marketplace? Ele é apagado da conta do vendedor. Não tem volta.",
};

const pct = (v) => `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const REGIME = { simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real" };
const DEVOLUCAO = { aberta: ["demo", "reclamação aberta"], devolvida: ["erro", "devolvida"], reembolsada: ["erro", "reembolsada"],
  coberta: ["neutro", "coberta pelo ML"] };
const NOME_UF = { AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
  PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins" };
const SUL_SUDESTE_SEM_ES = new Set(["PR", "SC", "RS", "SP", "RJ", "MG"]);
const interestadualUF = (origem, destino, importado) => (importado ? 4 : SUL_SUDESTE_SEM_ES.has(origem) && !SUL_SUDESTE_SEM_ES.has(destino) ? 7 : 12);
const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const estadoLucro = { aba: "produtos", busca: "", comOperacional: false, plataforma: "mercadolivre" };
const NOME_PLATAFORMA = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon" };
const margemSalva = () => { try { return localStorage.getItem("rpq_margem") || "15"; } catch { return "15"; } };
const numOuNulo = (v) => (v === "" || v == null ? null : Number(v));
const seloDevolucao = (d) => (d && DEVOLUCAO[d] ? ` <span class="selo ${DEVOLUCAO[d][0]}">${DEVOLUCAO[d][1]}</span>` : "");

function seloMargem(x, minima) {
  if (x.sem_vinculo) return '<span class="selo demo" title="O anúncio não está ligado a nenhum produto">sem vínculo</span>';
  if (x.sem_custo) return '<span class="selo neutro" title="O produto está sem custo cadastrado">sem custo</span>';
  if (x.lucro < 0) return `<span class="selo erro">${pct(x.margem)}</span>`;
  return `<span class="selo ${x.margem < minima ? "demo" : "ok"}">${pct(x.margem)}</span>`;
}

function abrirVincular(a, produtos, depois) {
  const m = modal(`<h2>${ic("contas", "p")}Vincular anúncio a um produto</h2>
    <div class="cartao" style="padding:12px 14px;margin-bottom:14px"><b>${h(a.titulo)}</b>
      <div class="pequeno suave">${a.variacao ? `${h(a.variacao)} · ` : ""}Anúncio ${h(a.item_id)} · ${a.sku ? `SKU <b>${h(a.sku)}</b> (não cadastrado)` : "sem SKU no anúncio"}</div></div>
    ${produtos.length ? `<form id="f-vinc" class="pilha">
      <div><label for="v-busca">Produto do catálogo</label>
        <input id="v-busca" type="search" placeholder="Filtrar por nome ou SKU" style="margin-bottom:6px">
        <select id="v-prod" name="produto_id" size="6" required>${produtos.map((p) => `<option value="${p.id}">${h(p.nome)}${p.sku ? ` · SKU ${h(p.sku)}` : ""}</option>`).join("")}</select></div>
      <div class="grade g2"><div><label for="v-un">Unidades do produto em cada venda</label>
        <input id="v-un" name="unidades" type="number" min="1" max="100" value="1"><div class="pequeno suave">Kit com 3 unidades = 3. O custo é multiplicado.</div></div>
        ${a.variacao_id ? `<label class="linha" style="gap:6px;font-weight:500;align-self:center;margin:0"><input type="checkbox" name="todas" style="width:auto">
          Vale para todas as variações do anúncio</label>` : ""}</div>
      <div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <button type="button" class="sec" id="v-novo">${ic("mais", "p")}Criar produto novo com este anúncio</button>
        <span class="linha" style="gap:8px"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Vincular</button></span></div>
    </form>` : `<p class="suave">Ainda não há produtos no catálogo. Crie o produto a partir deste anúncio.</p>
      <div class="linha" style="justify-content:flex-end;gap:8px"><button type="button" class="sec" data-fechar>Cancelar</button>
        <button type="button" id="v-novo">${ic("mais", "p")}Criar produto com este anúncio</button></div>`}`);
  $("#v-novo", m).onclick = () => abrirProduto(null, depois, {
    nome: a.titulo + (a.variacao ? ` (${a.variacao})` : ""), sku: a.sku || "",
    vincular_item_id: a.item_id, vincular_variacao_id: a.variacao_id || "", vincular_titulo: a.titulo, vincular_sku: a.sku || "" });
  const f = $("#f-vinc", m);
  if (!f) return;
  const busca = $("#v-busca", m), sel = $("#v-prod", m);
  const sugestao = produtos.find((p) => a.sku && p.sku && p.sku.toLowerCase().includes(a.sku.toLowerCase().slice(0, 4)));
  if (sugestao) sel.value = sugestao.id;
  busca.oninput = () => {
    const t = busca.value.trim().toLowerCase();
    [...sel.options].forEach((o) => (o.hidden = t && !o.textContent.toLowerCase().includes(t)));
  };
  busca.focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", f), async () => {
      if (!sel.value) throw new Error("Escolha o produto.");
      await api("/api/financeiro/vinculos", { method: "POST", body: {
        item_id: a.item_id, variacao_id: a.variacao_id || "", todas_variacoes: Boolean(f.todas?.checked),
        produto_id: Number(sel.value), unidades: Number(f.unidades.value || 1), titulo: a.titulo } });
      toast("Anúncio vinculado. As vendas dele já usam o custo do produto.");
      fecharModal();
      await depois();
    });
  };
}

function abrirProduto(p, depois, previa = {}) {
  const d = p || previa;
  const m = modal(`<h2>${ic("pacote", "p")}${p ? "Editar produto" : "Novo produto"}</h2>
    <form id="f-prod" class="pilha">
      <div><label for="p-nome">Nome</label><input id="p-nome" name="nome" type="text" required maxlength="300" value="${h(d.nome || "")}"></div>
      <div class="grade g3">
        <div><label for="p-sku">SKU</label><input id="p-sku" name="sku" type="text" maxlength="80" value="${h(d.sku || "")}"></div>
        <div><label for="p-custo">Custo por unidade (R$)</label><input id="p-custo" name="custo" type="number" step="0.01" min="0" value="${h(d.custo ?? "")}"></div>
        <div><label for="p-emb">Embalagem (R$)</label><input id="p-emb" name="embalagem" type="number" step="0.01" min="0" value="${h(d.embalagem ?? "")}"
          placeholder="padrão"></div></div>
      <div class="grade g2">
        <div><label for="p-preco">Preço de venda (R$)</label><input id="p-preco" name="preco" type="number" step="0.01" min="0" value="${h(d.preco ?? "")}"
          placeholder="opcional"><div class="pequeno suave">Referência para comparar com o preço real das vendas.</div></div>
        <div><label for="p-imp">Imposto do produto (%)</label><input id="p-imp" name="imposto_pct" type="number" step="0.01" min="0" max="60" value="${h(d.imposto_pct ?? "")}"
          placeholder="o do regime"><div class="pequeno suave">Vazio usa o regime em Impostos. Preenchido, vale só para este produto.</div></div></div>
      <div><div class="linha entre"><label style="margin:0">Custos extras por unidade</label>
          <button type="button" class="sec pequeno" id="p-extra-add">${ic("mais", "p")}Adicionar</button></div>
        <div class="pequeno suave">Etiqueta, brinde, manual, frete da compra, montagem... tudo o que sai a cada unidade vendida.</div>
        <div id="p-extras" class="pilha" style="gap:6px;margin-top:6px"></div></div>
      <div class="cartao pequeno" style="padding:10px 12px" id="p-total"></div>
      <div class="aviso azul pequeno" style="margin:0">Toda venda com o <b>mesmo SKU</b> é ligada a este produto automaticamente, em qualquer anúncio.
        ${previa.vincular_item_id ? `O anúncio <b>${h(previa.vincular_item_id)}</b> ${previa.vincular_sku ? "também" : "não tem SKU e"} será vinculado a ele.` : ""}</div>
      <div class="linha" style="justify-content:flex-end;gap:8px"><button type="button" class="sec" data-fechar>Cancelar</button>
        <button type="submit">${ic("salvar", "p")}Salvar</button></div>
    </form>`);
  const caixaExtras = $("#p-extras", m);
  const linhaExtra = (x = {}) => {
    const div = document.createElement("div");
    div.className = "linha";
    div.style.gap = "6px";
    div.innerHTML = `<input type="text" data-extra-desc maxlength="80" placeholder="Descrição" value="${h(x.descricao || "")}" aria-label="Descrição do custo extra">
      <input type="number" data-extra-valor step="0.01" min="0" placeholder="R$" value="${h(x.valor ?? "")}" style="width:110px" aria-label="Valor por unidade">
      <button type="button" class="sec pequeno" data-extra-tirar title="Tirar este custo">${ic("lixo", "p")}</button>`;
    $("[data-extra-tirar]", div).onclick = () => { div.remove(); somar(); };
    caixaExtras.appendChild(div);
  };
  const lerExtras = () => $$("#p-extras > div", m).map((d) => ({ descricao: $("[data-extra-desc]", d).value.trim(), valor: numOuNulo($("[data-extra-valor]", d).value) }))
    .filter((x) => x.descricao || x.valor != null);
  const somar = () => {
    const custo = numOuNulo($("#p-custo", m).value), emb = numOuNulo($("#p-emb", m).value) || 0;
    const extras = lerExtras().reduce((s, x) => s + (x.valor || 0), 0);
    $("#p-total", m).innerHTML = custo == null
      ? '<span class="suave">Informe o custo para ver o custo total por unidade.</span>'
      : `Custo total por unidade: <b>${brl(custo + emb + extras)}</b> <span class="suave">(produto ${brl(custo)} + embalagem ${brl(emb)} + extras ${brl(extras)}).
        Comissão, frete, Ads e imposto entram em cada venda, pelo que o marketplace cobrou.</span>`;
  };
  (d.custos_extras || []).forEach(linhaExtra);
  $("#p-extra-add", m).onclick = () => { linhaExtra(); $("#p-extras > div:last-child [data-extra-desc]", m).focus(); };
  $("#f-prod", m).addEventListener("input", somar);
  somar();
  $("#p-custo", m).focus();
  $("#f-prod", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", m), async () => {
      const f = e.target;
      const extras = lerExtras();
      if (extras.some((x) => x.valor == null)) throw new Error("Informe o valor de cada custo extra (ou tire a linha).");
      const corpo = { nome: f.nome.value, sku: f.sku.value, custo: numOuNulo(f.custo.value), embalagem: numOuNulo(f.embalagem.value),
        preco: numOuNulo(f.preco.value), imposto_pct: numOuNulo(f.imposto_pct.value), custos_extras: extras };
      if (!p) Object.assign(corpo, { vincular_item_id: previa.vincular_item_id || "", vincular_variacao_id: previa.vincular_variacao_id || "",
        vincular_titulo: previa.vincular_titulo || "", vincular_sku: previa.vincular_sku || "" });
      await api(p ? `/api/financeiro/produtos/${p.id}` : "/api/financeiro/produtos", { method: p ? "PUT" : "POST", body: corpo });
      toast(p ? "Produto salvo." : "Produto cadastrado.");
      fecharModal();
      await depois();
    });
  };
}

function abrirCalculo(x, taxa) {
  const linha = (rotulo, valor, nota = "", forte = false) => `<div class="fluxo-linha extrato ${forte ? "resultado" : ""}"><span>${rotulo}
      ${nota ? `<div class="pequeno suave">${nota}</div>` : ""}</span><b>${valor < 0 ? "− " : ""}${brl(Math.abs(valor))}</b></div>`;
  const prod = x.produto;
  modal(`<h2>${ic("calculadora", "p")}Cálculo da venda</h2>
    <div class="pequeno suave" style="margin-top:-6px">${data(x.data)} · pedido ${h(x.pedido_id)}${x.uf ? ` · comprador de ${h(x.uf)}` : ""}
      ${x.simulada ? ' <span class="selo neutro">simulada</span>' : ""}${seloDevolucao(x.devolucao)}</div>
    <div class="cartao" style="padding:12px 14px;margin:12px 0"><b>${h(x.titulo)}</b>
      <div class="pequeno suave">${x.variacao ? `${h(x.variacao)} · ` : ""}${x.sku ? `SKU ${h(x.sku)} · ` : "sem SKU · "}anúncio ${h(x.item_id)}</div>
      <div class="pequeno" style="margin-top:6px">${prod ? `Produto: <b>${h(prod.nome)}</b> ${prod.via === "sku" ? "(ligado pelo SKU)" : "(vínculo com o anúncio)"}
        ${prod.unidades > 1 ? ` · kit de ${prod.unidades} unidades` : ""}` : '<span class="selo demo">sem vínculo</span> nenhum produto do catálogo; o custo ficou de fora'}</div></div>
    <div class="fluxo">
      ${linha(`Venda (${numero(x.quantidade)} × ${brl(x.preco_unitario)})`, x.total)}
      ${x.reembolso ? linha("Reembolso ao comprador", -x.reembolso, "comissão e imposto acompanham o reembolso") : ""}
      ${x.bonus_ml ? linha("Bônus do Mercado Livre", x.bonus_ml, "parte do cupom ou da campanha paga pelo ML") : ""}
      ${linha("Comissão do Mercado Livre", -x.comissao)}
      ${linha("Frete pago pelo vendedor", -x.frete, x.frete_pendente ? "o ML ainda não informou" : "")}
      ${x.frete_devolucao ? linha("Frete da devolução", -x.frete_devolucao) : ""}
      ${linha("Publicidade (Ads)", -x.ads, "gasto do anúncio no dia, dividido entre as vendas do dia")}
      ${linha("Impostos", -x.imposto, h(x.imposto_detalhe))}
      ${linha("Custo do produto", -(x.custo || 0), x.custo == null ? "sem produto ou sem custo cadastrado" : x.devolucao === "devolvida" && x.produto_voltou && !x.custo ? "o produto voltou para o estoque" : "")}
      ${linha("Embalagem", -x.embalagem)}
      ${x.extras ? linha("Custos extras do produto", -x.extras, "etiqueta, brinde e outros cadastrados no produto") : ""}
      ${linha(`Lucro da venda · margem ${pct(x.margem)}`, x.lucro, "o que a venda deixou antes das despesas fixas", true)}
      ${linha(`Custo operacional (${pct(taxa.pct)} do valor)`, -x.operacional, taxa.pct ? "aluguel, energia, equipe... rateados pelo faturamento" : "cadastre as despesas em Custo operacional")}
      ${linha(`Lucro depois da operação · margem ${pct(x.margem_final)}`, x.lucro_final, "", true)}
    </div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Fechar</button></div>`);
}

async function telaLucro(mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const r = await api(`/api/financeiro/lucro?mes=${mes}`);
  const t = r.totais, sinc = r.sincronizacao;
  const recarregar = () => telaLucro(mes);
  const kpi = (rotulo, valor, detalhe, icone, cls = "") => `<div class="cartao kpi-bloco">
      <div class="linha entre"><span class="rotulo">${rotulo}</span><span class="kpi-ic">${ic(icone, "p")}</span></div>
      <div class="valor ${cls}">${valor}</div><div class="pequeno suave">${detalhe}</div></div>`;
  const barra = (rotulo, valor, cls = "") => {
    const parte = t.total ? Math.min(Math.abs(valor) / t.total * 100, 100) : 0;
    return `<div class="fluxo-linha ${cls}"><span>${rotulo}</span>
      <div class="fluxo-barra"><i style="width:${parte.toFixed(1)}%"></i></div>
      <b>${valor < 0 ? "− " : ""}${brl(Math.abs(valor))}</b><span class="suave">${t.total ? pct(Math.abs(valor) / t.total * 100) : "—"}</span></div>`;
  };
  const ACAO_ALERTA = { vinculo: ["#/produtos", "Vincular agora"], custo: ["#/produtos", "Cadastrar custos"], impostos: ["#/impostos", "Configurar"],
    tributacao: ["#/impostos", "Importar planilha"] };
  const temDados = sinc || r.vendas.length;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Vendas e lucro</h1>
      <div class="suave">Quanto ficou no bolso de <b>${h(clienteAtual()?.nome)}</b> no Mercado Livre, na Shopee e na Amazon, venda a venda: comissão, frete,
        publicidade e devoluções cobrados pelo marketplace, impostos (${h(REGIME[r.config.regime])}), custo, embalagem e custos extras do produto.</div></div>
    <div class="linha" style="flex-wrap:wrap"><select id="l-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select>
      <select id="l-plat" aria-label="Plataforma" style="width:auto"><option value="mercadolivre">Mercado Livre</option>
        <option value="shopee" ${estadoLucro.plataforma === "shopee" ? "selected" : ""}>Shopee</option>
        <option value="amazon" ${estadoLucro.plataforma === "amazon" ? "selected" : ""}>Amazon</option></select>
      <span class="pequeno suave" data-atualizado="vendas"></span>
      <button id="l-sinc" class="sec pequeno" title="Puxar agora os pedidos desta plataforma">${ic("trocar", "p")}Atualizar agora</button>
      ${estado.usuario.papel !== "consultor" ? `<button id="l-simular" class="sec pequeno" title="Lança uma venda de teste para ver como o cálculo fica">${ic("calculadora", "p")}Simular uma venda</button>` : ""}</div></div>
    ${Object.entries(r.sincronizacoes || {}).map(([plat, x]) => `<p class="pequeno suave" style="margin:2px 0">${NOME_PLATAFORMA[plat] || h(plat)}:
      sincronizado ${data(x.feita_em)} · ${numero(x.pedidos)} pedido(s)${x.demo ? ' <span class="selo demo">demonstração</span>' : ""}
      ${r.por_plataforma?.[plat] ? ` · ${brl(r.por_plataforma[plat].total)} faturados, ${brl(r.por_plataforma[plat].lucro)} de lucro nas vendas` : ""}</p>`).join("")}
    ${Object.values(r.sincronizacoes || {}).flatMap((x) => x.avisos || []).map((a) => `<div class="aviso amarelo">${h(a)}</div>`).join("")}
    ${!temDados ? `<div class="cartao">${vazio("cifrao", "Vendas deste mês ainda não sincronizadas",
      "Escolha a plataforma e clique em Sincronizar vendas para puxar os pedidos.")}</div>` : `
    ${r.alertas.map((a) => `<div class="aviso ${a.nivel} linha entre" style="gap:10px"><span>${h(a.texto)}</span>
      ${ACAO_ALERTA[a.tipo] ? `<a href="${ACAO_ALERTA[a.tipo][0]}">${ACAO_ALERTA[a.tipo][1]}</a>` : ""}
      ${a.tipo === "simulacao" ? '<button class="sec pequeno" id="l-apagar-sim">Apagar simulações</button>' : ""}</div>`).join("")}
    <div class="grade g4">
      ${kpi("Faturamento", brl(t.total), `${numero(t.pedidos)} pedido(s) · ${numero(t.unidades)} unid. · ticket ${brl(t.ticket_medio)}`, "cifrao")}
      ${kpi("Lucro das vendas", brl(t.lucro), `margem de ${pct(t.margem)}${t.sem_vinculo || t.sem_custo ? " · incompleto: há vendas sem custo" : ""}`,
        "calculadora", t.lucro < 0 ? "negativo" : "positivo")}
      ${kpi("Resultado do mês", brl(t.resultado), t.despesas
        ? `${t.resultado < 0 ? "no vermelho" : "no azul"} depois de ${brl(t.despesas)} de despesas${t.ponto_equilibrio ? ` · equilíbrio em ${brl(t.ponto_equilibrio)} de vendas` : ""}`
        : '<a href="#/despesas">Cadastre as despesas da operação</a> para ver o resultado real', "atividade", t.resultado < 0 ? "negativo" : "positivo")}
      ${kpi("Publicidade", brl(t.ads_total), `${pct(t.tacos)} do faturamento (TACoS)${t.roas ? ` · ROAS ${String(t.roas).replace(".", ",")}` : ""}`, "alvo")}
    </div>
    <div class="cartao" style="margin-top:16px"><h3 style="margin-top:0">Para onde foi o dinheiro</h3>
      <div class="fluxo">
        ${barra("Vendas", t.total, "entrada")}
        ${t.reembolso ? barra(`Reembolsos (${numero(t.devolucoes)} devolução(ões))`, -t.reembolso) : ""}
        ${t.bonus_ml ? barra("Bônus do ML (cupons e campanhas)", t.bonus_ml) : ""}
        ${barra("Comissão do Mercado Livre", -t.comissao)}
        ${barra("Frete pago pelo vendedor", -t.frete)}
        ${t.frete_devolucao ? barra("Frete de devoluções", -t.frete_devolucao) : ""}
        ${barra("Publicidade (Ads)", -t.ads_total)}
        ${barra("Impostos", -t.imposto)}
        ${barra("Custo dos produtos", -t.custo)}
        ${barra("Embalagem", -t.embalagem)}
        ${t.extras ? barra("Custos extras dos produtos", -t.extras) : ""}
        ${t.tarifas_fatura ? barra("Outras tarifas da fatura do ML (a conferir)", -t.tarifas_fatura) : ""}
        ${barra("Lucro das vendas", t.lucro, t.lucro < 0 ? "resultado negativo" : "resultado")}
        ${barra(`Custo operacional (${numero(r.despesas.length)} despesa(s) do mês)`, -t.despesas)}
        ${barra("Resultado do mês", t.resultado, t.resultado < 0 ? "resultado negativo" : "resultado")}
      </div>
      <p class="pequeno suave" style="margin-bottom:0">${t.despesas ? `Para ficar no zero a zero com as despesas deste mês, a loja precisa vender
        ${t.ponto_equilibrio ? `<b>${brl(t.ponto_equilibrio)}</b> no mês, mantendo a margem atual` : "com margem positiva: hoje cada venda não cobre nem os próprios custos"}.
        Em cada venda, o custo operacional entra como <b>${pct(r.taxa_operacional.pct)}</b> do valor
        (${r.taxa_operacional.base === "media" ? `média de ${r.taxa_operacional.meses.length} mês(es) anterior(es)` : "base: este mês"}).`
        : 'Sem despesas cadastradas neste mês: o resultado é igual ao lucro das vendas. <a href="#/despesas">Cadastrar despesas</a>.'}</p>
      ${t.ads_sem_venda ? `<p class="pequeno suave" style="margin-bottom:0">Da publicidade, ${brl(t.ads_sem_venda)} foram gastos em dias em que o anúncio
        não vendeu: sai do lucro do mês, mas não de uma venda específica.</p>` : ""}
      ${r.tarifas_fatura?.length ? `<details class="pequeno" style="margin-top:8px"><summary>Tarifas da fatura do ML fora das vendas (${numero(r.tarifas_fatura.length)}) · possível erro, a conferir com a fatura</summary>
        ${r.tarifas_fatura.map((x) => `<div class="linha entre" style="padding:4px 0;border-bottom:1px solid var(--borda)"><span>${x.data ? data(x.data) + " · " : ""}${h(x.descricao)}</span>
          <b class="${x.valor < 0 ? "positivo" : ""}">${x.valor < 0 ? "+ " : "− "}${brl(Math.abs(x.valor))}</b></div>`).join("")}</details>` : ""}
      ${t.canceladas ? `<p class="pequeno suave" style="margin-bottom:0">${numero(t.canceladas)} pedido(s) cancelado(s) no mês
        (${brl(t.valor_cancelado)}), fora da conta.</p>` : ""}
    </div>
    <div class="cartao" style="margin-top:16px">
      <div class="linha entre" style="flex-wrap:wrap;gap:10px">
        <div class="abas" style="margin-bottom:0;border:none">
          <button data-aba="produtos" class="${estadoLucro.aba === "produtos" ? "ativa" : ""}">Por produto (${r.por_produto.length})</button>
          <button data-aba="vendas" class="${estadoLucro.aba === "vendas" ? "ativa" : ""}">Por venda (${r.vendas.length})</button></div>
        <div class="linha" style="gap:8px;flex-wrap:wrap">
          <select id="l-visao" aria-label="Qual lucro mostrar" style="width:auto">
            <option value="">Lucro da venda</option>
            <option value="op" ${estadoLucro.comOperacional ? "selected" : ""}>Lucro depois do custo operacional (${pct(r.taxa_operacional.pct)})</option></select>
          <input id="l-busca" type="search" placeholder="Filtrar por produto, SKU ou pedido" value="${h(estadoLucro.busca)}" style="max-width:260px"></div>
      </div>
      <div id="l-tabela" style="margin-top:14px"></div>
    </div>`}`;
  $("#l-mes").onchange = () => { location.hash = "#/lucro/" + $("#l-mes").value; };
  $("#l-plat").onchange = () => { estadoLucro.plataforma = $("#l-plat").value; };
  $("#l-sinc").onclick = () => comBotao($("#l-sinc"), async () => {
    const s = await api(`/api/financeiro/sincronizar?mes=${mes}&plataforma=${$("#l-plat").value}`, { method: "POST" });
    toast(`${numero(s.pedidos)} pedido(s) sincronizado(s)${s.demo ? " (demonstração)" : ""}.`);
    await recarregar();
  });
  if ($("#l-simular")) $("#l-simular").onclick = () => simularVenda(mes, recarregar);
  const apagarSim = $("#l-apagar-sim");
  if (apagarSim) apagarSim.onclick = () => comBotao(apagarSim, async () => {
    const x = await api("/api/financeiro/simulacoes", { method: "DELETE" });
    toast(`${x.apagadas} venda(s) simulada(s) apagada(s).`);
    await recarregar();
  });
  if (!temDados) return;
  const anuncioDe = (x) => ({ item_id: x.item_id, variacao_id: x.variacao_id, variacao: x.variacao, titulo: x.titulo, sku: x.sku });
  const desenhar = () => {
    const termo = estadoLucro.busca.trim().toLowerCase();
    const bate = (x) => !termo || [x.titulo, x.sku, x.item_id, x.pedido_id, x.variacao, x.produto?.nome].some((v) => String(v || "").toLowerCase().includes(termo));
    const min = r.margem_baixa_pct;
    const ver = (x) => (estadoLucro.comOperacional ? { ...x, lucro: x.lucro_final, margem: x.margem_final } : x);
    const botaoVincular = (i) => `<button class="sec pequeno" data-vincular="${i}">Vincular</button>`;
    if (estadoLucro.aba === "produtos") {
      const lista = r.por_produto.filter(bate);
      $("#l-tabela").innerHTML = lista.length ? `<div class="tabela-margem"><table><thead><tr><th>Produto</th><th>Unid.</th><th>Vendas</th>
        <th>ML (comissão + fretes)</th><th>Ads</th><th>Imposto</th><th title="custo do produto + embalagem + custos extras">Custo + emb.</th><th>Lucro</th><th>Margem</th></tr></thead><tbody>
        ${lista.map((p, i) => `<tr><td>${h(p.titulo)}<div class="pequeno suave">${p.sem_vinculo
          ? `anúncio ${h(p.item_id)}${p.variacao ? ` · ${h(p.variacao)}` : ""}${p.sku ? ` · SKU ${h(p.sku)}` : ""} · ${botaoVincular(i)}`
          : `${p.sku ? `SKU ${h(p.sku)}` : "sem SKU"}${p.anuncios > 1 ? ` · ${p.anuncios} anúncios` : ""}`}</div></td>
          <td>${numero(p.unidades)}</td><td>${brl(p.total)}${p.reembolso ? `<div class="pequeno negativo">− ${brl(p.reembolso)} reemb.</div>` : ""}</td>
          <td>${brl(p.comissao + p.frete + p.frete_devolucao)}</td><td>${brl(p.ads)}</td><td>${brl(p.imposto)}</td>
          <td>${p.sem_vinculo || p.sem_custo ? "—" : brl(p.custo + p.embalagem + (p.extras || 0))}</td><td class="${ver(p).lucro < 0 ? "negativo" : ""}"><b>${brl(ver(p).lucro)}</b></td>
          <td>${seloMargem(ver(p), min)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="suave pequeno">Nada encontrado.</p>';
      $$("[data-vincular]").forEach((b) => (b.onclick = () => abrirVincular(anuncioDe(lista[+b.dataset.vincular]), r.produtos, recarregar)));
    } else {
      const lista = r.vendas.filter(bate);
      $("#l-tabela").innerHTML = lista.length ? `<div class="tabela-margem"><table><thead><tr><th>Data</th><th>Venda</th><th>UF</th><th>Qtd</th>
        <th>Valor</th><th>Comissão</th><th>Frete</th><th>Ads</th><th>Imposto</th><th>Custo + emb.</th><th>Lucro</th><th>Margem</th><th></th></tr></thead><tbody>
        ${lista.map((x, i) => `<tr class="${x.valida ? "" : "cancelada"}"><td>${data(x.data)}</td>
          <td>${h(x.titulo)}${x.plataforma && x.plataforma !== "mercadolivre" ? ` <span class="selo ${x.plataforma}">${NOME_PLATAFORMA[x.plataforma] || h(x.plataforma)}</span>` : ""}${x.simulada ? ' <span class="selo neutro">simulada</span>' : ""}${seloDevolucao(x.devolucao)}
            <div class="pequeno suave">${x.variacao ? `${h(x.variacao)} · ` : ""}${x.sku ? `SKU ${h(x.sku)}` : "sem SKU"} ·
              ${x.produto ? `produto <b>${h(x.produto.nome)}</b>${x.produto.unidades > 1 ? ` (kit ${x.produto.unidades})` : ""}` : `sem vínculo · ${botaoVincular(i)}`}</div></td>
          <td>${h(x.uf) || "—"}</td><td>${numero(x.quantidade)}</td>
          <td>${brl(x.total)}${x.reembolso ? `<div class="pequeno negativo">− ${brl(x.reembolso)}</div>` : ""}</td><td>${brl(x.comissao)}</td>
          <td>${x.frete_pendente ? '<span class="suave" title="O Mercado Livre ainda não informou o custo do envio">pendente</span>' : brl(x.frete)}
            ${x.frete_devolucao ? `<div class="pequeno negativo">+ ${brl(x.frete_devolucao)} devol.</div>` : ""}</td>
          <td>${brl(x.ads)}</td><td title="${h(x.imposto_detalhe)}">${brl(x.imposto)}</td><td>${x.custo == null ? "—" : brl(x.custo + x.embalagem + (x.extras || 0))}</td>
          <td class="${ver(x).lucro < 0 && x.valida ? "negativo" : ""}">${x.valida ? `<b>${brl(ver(x).lucro)}</b>` : "—"}</td>
          <td>${x.valida ? seloMargem(ver(x), min) : '<span class="selo neutro">cancelada</span>'}</td>
          <td>${x.valida ? `<button class="sec pequeno" data-calculo="${i}">Ver cálculo</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="suave pequeno">Nada encontrado.</p>';
      $$("[data-vincular]").forEach((b) => (b.onclick = () => abrirVincular(anuncioDe(lista[+b.dataset.vincular]), r.produtos, recarregar)));
      $$("[data-calculo]").forEach((b) => (b.onclick = () => abrirCalculo(lista[+b.dataset.calculo], r.taxa_operacional)));
    }
  };
  $$("[data-aba]").forEach((b) => (b.onclick = () => {
    estadoLucro.aba = b.dataset.aba;
    $$("[data-aba]").forEach((o) => o.classList.toggle("ativa", o === b));
    desenhar();
  }));
  $("#l-busca").oninput = (e) => { estadoLucro.busca = e.target.value; desenhar(); };
  $("#l-visao").onchange = (e) => { estadoLucro.comOperacional = e.target.value === "op"; desenhar(); };
  desenhar();
}

async function telaProdutos() {
  const [cat, cfg] = await Promise.all([api("/api/financeiro/produtos"), api("/api/financeiro/config")]);
  const num = (v) => (v == null ? "" : String(v));
  const listaSimples = cat.produtos.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku }));
  const prec = cat.precificacao;
  const sv = cat.sem_vinculo;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Produtos e custos</h1>
    <div class="suave">O catálogo de <b>${h(clienteAtual()?.nome)}</b>: quanto cada produto custa e quanto gasta de embalagem.
      As vendas do Mercado Livre chegam aos produtos sozinhas pelo SKU.</div></div>
    <div class="linha" style="flex-wrap:wrap"><button class="sec" id="p-importar">${ic("enviar", "p")}Importar do Mercado Livre</button>
      <button id="p-novo">${ic("mais", "p")}Novo produto</button></div></div>

  <div class="cartao passos-vinculo">
    <div><b>1. Pelo SKU (automático)</b><span class="pequeno suave">A venda com o SKU igual ao do produto entra no custo dele, em qualquer anúncio ou variação.</span></div>
    <div><b>2. Pelo vínculo</b><span class="pequeno suave">Anúncio sem SKU ou com SKU diferente: vincule uma vez e as próximas vendas já entram.</span></div>
    <div><b>3. Kit</b><span class="pequeno suave">No vínculo, diga quantas unidades do produto saem em cada venda. O custo é multiplicado.</span></div>
  </div>

  ${sv.length ? `<div class="cartao" style="margin-top:16px;border-color:var(--amarelo)">
    <h3 style="margin-top:0">${ic("alerta", "p")}Anúncios vendidos sem vínculo (${sv.length})</h3>
    <p class="pequeno suave">Essas vendas ainda não sabem o custo do produto, então o lucro delas aparece maior do que o real.</p>
    <div class="tabela-margem"><table><thead><tr><th>Anúncio</th><th>SKU na venda</th><th>Vendidas</th><th>Faturamento</th><th></th></tr></thead><tbody>
      ${sv.map((a, i) => `<tr><td>${h(a.titulo)}${a.simulada ? ' <span class="selo neutro">simulada</span>' : ""}
        <div class="pequeno suave">${a.variacao ? `${h(a.variacao)} · ` : ""}anúncio ${h(a.item_id)}</div></td>
        <td>${a.sku ? `${h(a.sku)} <span class="pequeno suave">(não cadastrado)</span>` : '<span class="suave">sem SKU</span>'}</td>
        <td>${numero(a.vendas)}</td><td>${brl(a.faturamento)}</td>
        <td style="text-align:right;white-space:nowrap"><button class="sec pequeno" data-sv-vincular="${i}">Vincular</button>
          <button class="pequeno" data-sv-criar="${i}">Criar produto</button></td></tr>`).join("")}</tbody></table></div>
  </div>` : ""}

  <div class="cartao" style="margin-top:16px">
    <div class="linha entre" style="flex-wrap:wrap;gap:10px"><h3 style="margin:0">Produtos (${cat.produtos.length})</h3>
      <div class="linha" style="gap:14px;flex-wrap:wrap">
        <label class="linha pequeno" style="gap:6px;font-weight:500;margin:0">Margem desejada (%)
          <input id="p-margem" type="number" step="0.5" min="0" max="60" value="${h(margemSalva())}" style="width:70px"></label>
        <label class="linha pequeno" style="gap:6px;font-weight:500;margin:0">Embalagem padrão (R$)
          <input id="p-emb-padrao" type="number" step="0.01" min="0" value="${num(cfg.embalagem_padrao)}" style="width:90px"></label></div></div>
    <details class="pequeno" style="margin-top:10px"><summary>Como o preço mínimo é calculado</summary>
      <p class="suave" style="margin:8px 0 0">Preço mínimo = (custo + embalagem + custos extras + frete por unidade) ÷ (1 − comissão − imposto − publicidade
        − custo operacional − margem desejada). Comissão, imposto, publicidade e frete saem das vendas do próprio produto nos últimos 90 dias;
        sem vendas, usa comissão de ${pct(prec.padrao.comissao_pct)}, o imposto da loja e frete zero (marcado como estimativa).
        Se o produto tem imposto próprio, vale o dele.
        O custo operacional é <b>${pct(prec.taxa_operacional.pct)}</b> do preço: as despesas da operação divididas pelo faturamento
        ${prec.taxa_operacional.meses.length ? `(${prec.taxa_operacional.meses.join(", ")})` : "(cadastre as despesas em Custo operacional)"}.
        Acima de R$ 79 o frete grátis é obrigatório: se o preço mínimo passar desse valor, confira o frete.</p></details>
    ${cat.produtos.length ? `<div class="linha entre" style="margin:12px 0 8px;flex-wrap:wrap;gap:8px">
        <input id="p-busca" type="search" placeholder="Filtrar por nome ou SKU" style="max-width:280px">
        <label class="linha pequeno" style="gap:6px;font-weight:500;margin:0"><input type="checkbox" id="p-sem" style="width:auto"> Só sem custo (${cat.sem_custo})</label></div>
      <div class="tabela-margem"><table><thead><tr><th>Produto</th><th>Anúncios ligados</th><th>Vendidas</th><th>Custo (R$)</th><th>Embalagem (R$)</th>
        <th title="Preço médio por unidade nos últimos 90 dias">Preço médio</th><th>Preço mínimo</th><th></th></tr></thead>
      <tbody>${cat.produtos.map((p, i) => `<tr data-linha="${i}"><td><b>${h(p.nome)}</b><div class="pequeno suave">${p.sku ? `SKU ${h(p.sku)}` : "sem SKU (só por vínculo)"}${p.extras_unidade ? ` · extras ${brl(p.extras_unidade)}/unid.` : ""}${p.imposto_pct != null ? ` · imposto próprio ${pct(p.imposto_pct)}` : ""}${p.preco != null ? ` · preço ${brl(p.preco)}` : ""}</div></td>
        <td>${p.anuncios.length ? `<details><summary class="pequeno">${p.anuncios.length} anúncio(s)</summary>${p.anuncios.map((a) => `<div class="pequeno anuncio-ligado">
            ${h(a.item_id)}${a.variacao ? ` · ${h(a.variacao)}` : ""} · ${a.via === "sku" ? "pelo SKU" : `vínculo${a.unidades > 1 ? ` (kit ${a.unidades})` : ""}
            <button type="button" class="link-btn" data-desvincular="${h(a.item_id)}" data-variacao="${h(a.variacao_id || "")}">desfazer</button>`}</div>`).join("")}</details>`
          : '<span class="pequeno suave">nenhum ainda</span>'}</td>
        <td>${numero(p.vendidas)}</td>
        <td><input type="number" step="0.01" min="0" data-custo value="${num(p.custo)}" style="width:110px" aria-label="Custo de ${h(p.nome)}"></td>
        <td><input type="number" step="0.01" min="0" data-emb value="${num(p.embalagem)}" placeholder="${h(num(cfg.embalagem_padrao))}" style="width:100px"
          aria-label="Embalagem de ${h(p.nome)}"></td>
        <td>${p.historico ? brl(p.historico.preco_medio) : '<span class="suave">—</span>'}</td><td data-preco-min></td>
        <td style="white-space:nowrap;text-align:right"><button class="sec pequeno" data-editar="${i}" title="Editar">${ic("lapis")}</button>
          <button class="sec pequeno perigo-txt" data-excluir="${i}" title="Excluir">${ic("lixo")}</button></td></tr>`).join("")}</tbody></table></div>
      <div class="linha" style="justify-content:flex-end;margin-top:12px"><button id="p-salvar">${ic("salvar", "p")}Salvar custos</button></div>`
      : vazio("pacote", "Nenhum produto cadastrado", "Importe os anúncios do Mercado Livre ou cadastre à mão. Custo e embalagem são por unidade.")}
  </div>`;

  const recarregar = () => telaProdutos();
  $("#p-novo").onclick = () => abrirProduto(null, recarregar);
  $("#p-importar").onclick = () => comBotao($("#p-importar"), async () => {
    const r = await api("/api/financeiro/produtos/importar", { method: "POST" });
    toast(`${r.criados} produto(s) novo(s) de ${r.anuncios} anúncio(s)${r.ja_cadastrados ? `; ${r.ja_cadastrados} já estavam no catálogo` : ""}${r.demo ? " (demonstração)" : ""}.`);
    await recarregar();
  });
  $$("[data-sv-vincular]").forEach((b) => (b.onclick = () => abrirVincular(sv[+b.dataset.svVincular], listaSimples, recarregar)));
  $$("[data-sv-criar]").forEach((b) => (b.onclick = () => {
    const a = sv[+b.dataset.svCriar];
    abrirProduto(null, recarregar, { nome: a.titulo + (a.variacao ? ` (${a.variacao})` : ""), sku: a.sku, vincular_item_id: a.item_id,
      vincular_variacao_id: a.variacao_id, vincular_titulo: a.titulo, vincular_sku: a.sku });
  }));
  $("#p-emb-padrao").onchange = async (e) => {
    const { padroes, ...corpo } = cfg;
    try {
      await api("/api/financeiro/config", { method: "PUT", body: { ...corpo, embalagem_padrao: Number(e.target.value || 0) } });
      $$("[data-emb]").forEach((i) => (i.placeholder = e.target.value));
      toast("Embalagem padrão salva. Vale para produtos sem embalagem própria.");
    } catch (err) { toast(err.message, true); }
  };
  $$("[data-desvincular]").forEach((b) => (b.onclick = async () => {
    try {
      await api(`/api/financeiro/vinculos?item_id=${encodeURIComponent(b.dataset.desvincular)}&variacao_id=${encodeURIComponent(b.dataset.variacao)}`, { method: "DELETE" });
      toast("Vínculo desfeito.");
      await recarregar();
    } catch (err) { toast(err.message, true); }
  }));
  if (!cat.produtos.length) return;
  $$("[data-editar]").forEach((b) => (b.onclick = () => abrirProduto(cat.produtos[+b.dataset.editar], recarregar)));
  $$("[data-excluir]").forEach((b) => (b.onclick = async () => {
    const p = cat.produtos[+b.dataset.excluir];
    if (!confirm(`Excluir “${p.nome}”? Os vínculos dele também saem e as vendas ficam sem custo.`)) return;
    try { await api(`/api/financeiro/produtos/${p.id}`, { method: "DELETE" }); toast("Produto excluído."); await recarregar(); }
    catch (err) { toast(err.message, true); }
  }));
  const filtrar = () => {
    const termo = $("#p-busca").value.trim().toLowerCase(), so = $("#p-sem").checked;
    $$("[data-linha]").forEach((tr) => {
      const p = cat.produtos[+tr.dataset.linha];
      tr.hidden = Boolean((termo && !`${p.nome} ${p.sku}`.toLowerCase().includes(termo)) || (so && $("[data-custo]", tr).value !== ""));
    });
  };
  $("#p-busca").oninput = filtrar;
  $("#p-sem").onchange = filtrar;
  const precos = () => {
    const margem = Number($("#p-margem").value || 0), embPadrao = Number($("#p-emb-padrao").value || 0);
    try { localStorage.setItem("rpq_margem", String(margem)); } catch {}
    $$("[data-linha]").forEach((tr) => {
      const p = cat.produtos[+tr.dataset.linha], hist = p.historico;
      const custo = numOuNulo($("[data-custo]", tr).value), emb = numOuNulo($("[data-emb]", tr).value) ?? embPadrao;
      const cel = $("[data-preco-min]", tr);
      if (custo == null) { cel.innerHTML = '<span class="suave">informe o custo</span>'; return; }
      const imposto = p.imposto_pct != null ? p.imposto_pct : hist ? hist.imposto_pct : prec.padrao.imposto_pct;
      const pcts = (hist ? hist.comissao_pct + hist.ads_pct : prec.padrao.comissao_pct) + imposto + prec.taxa_operacional.pct + margem;
      const extras = p.extras_unidade || 0;
      const base = custo + emb + extras + (hist ? hist.frete_unidade : 0);
      if (pcts >= 100) { cel.innerHTML = '<span class="negativo pequeno">impossível: os percentuais passam de 100%</span>'; return; }
      const minimo = base / (1 - pcts / 100);
      const abaixo = hist && hist.preco_medio < minimo;
      cel.innerHTML = `<b class="${abaixo ? "negativo" : ""}">${brl(minimo)}</b>${hist ? "" : '<div class="pequeno suave">estimativa</div>'}
        ${abaixo ? '<div class="pequeno negativo">vendendo abaixo</div>' : ""}`;
      cel.title = `(${brl(custo)} custo + ${brl(emb)} embalagem${extras ? ` + ${brl(extras)} extras` : ""}${hist ? ` + ${brl(hist.frete_unidade)} frete` : ""}) ÷ (1 − ${pct(pcts)})`;
    });
  };
  $("#p-margem").oninput = precos;
  $$("[data-custo], [data-emb]").forEach((i) => i.addEventListener("input", precos));
  precos();
  $("#p-salvar").onclick = () => comBotao($("#p-salvar"), async () => {
    const itens = $$("[data-linha]").map((tr) => {
      const p = cat.produtos[+tr.dataset.linha];
      const custo = numOuNulo($("[data-custo]", tr).value), embalagem = numOuNulo($("[data-emb]", tr).value);
      return custo !== p.custo || embalagem !== p.embalagem ? { id: p.id, custo, embalagem } : null;
    }).filter(Boolean);
    if (!itens.length) return toast("Nenhum custo alterado.");
    const r = await api("/api/financeiro/custos", { method: "PUT", body: { itens } });
    toast(`${r.alterados} custo(s) salvo(s). O lucro de todos os meses já usa os valores novos.`);
    await recarregar();
  });
}

async function telaDespesas(mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const d = await api(`/api/financeiro/despesas?mes=${mes}`);
  const recarregar = () => telaDespesas(mes);
  const tx = d.taxa;
  const opcoesCat = (sel) => Object.entries(d.categorias).map(([v, n]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${h(n)}</option>`).join("");
  $("#tela").innerHTML = `<div class="topo"><div><h1>Custo operacional</h1>
    <div class="suave">Tudo o que <b>${h(clienteAtual()?.nome)}</b> gasta para a operação rodar e que não sai de uma venda específica:
      aluguel, energia, equipe, sistemas, contador. Sai do lucro das vendas para dar o resultado real do mês.</div></div>
    <select id="d-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select></div>
  <div class="grade g3">
    <div class="cartao kpi-bloco"><span class="rotulo">Despesas do mês</span><div class="valor">${brl(d.total)}</div>
      <div class="pequeno suave">${numero(d.itens.length)} lançamento(s)</div></div>
    <div class="cartao kpi-bloco"><span class="rotulo">Custo operacional sobre as vendas</span><div class="valor">${pct(tx.pct)}</div>
      <div class="pequeno suave">${tx.meses.length ? `${brl(tx.despesas)} ÷ ${brl(tx.faturamento)} vendidos (${tx.meses.join(", ")})` : "precisa de vendas sincronizadas"}</div></div>
    <div class="cartao kpi-bloco"><span class="rotulo">Em cada R$ 100 vendidos</span><div class="valor">${brl(tx.pct)}</div>
      <div class="pequeno suave">vão para pagar a operação. Esse valor entra no preço mínimo dos produtos.</div></div>
  </div>
  <form class="cartao" id="f-desp" style="margin-top:16px">
    <h3 style="margin-top:0">Lançar despesa</h3>
    <div class="grade g4">
      <div><label for="d-desc">Descrição</label><input id="d-desc" name="descricao" type="text" maxlength="200" required placeholder="Ex.: aluguel do galpão"></div>
      <div><label for="d-cat">Categoria</label><select id="d-cat" name="categoria">${opcoesCat("aluguel")}</select></div>
      <div><label for="d-valor">Valor no mês (R$)</label><input id="d-valor" name="valor" type="number" step="0.01" min="0.01" required></div>
      <div><label for="d-tipo">Repetição</label><select id="d-tipo" name="fixa"><option value="1">Fixa: todo mês a partir de agora</option>
        <option value="0">Só neste mês</option></select></div>
    </div>
    <div class="linha" style="justify-content:flex-end;margin-top:10px"><button type="submit">${ic("mais", "p")}Lançar</button></div>
  </form>
  <div class="cartao" style="margin-top:16px">${d.itens.length ? `<div class="tabela-margem"><table><thead><tr><th>Despesa</th><th>Categoria</th>
      <th>Repetição</th><th>Valor</th><th></th></tr></thead><tbody>${d.itens.map((x, i) => `<tr><td><b>${h(x.descricao)}</b></td>
      <td>${h(d.categorias[x.categoria] || x.categoria)}</td>
      <td class="pequeno">${x.fixa ? `fixa desde ${h(x.mes_inicio)}${x.mes_fim ? ` até ${h(x.mes_fim)}` : ""}` : "só neste mês"}</td>
      <td><input type="number" step="0.01" min="0.01" value="${x.valor}" data-valor="${i}" style="width:120px" aria-label="Valor de ${h(x.descricao)}"></td>
      <td style="text-align:right;white-space:nowrap"><button class="sec pequeno perigo-txt" data-remover="${i}"
        title="${x.fixa && x.mes_inicio < mes ? "Encerra a partir deste mês (os meses anteriores continuam com ela)" : "Excluir"}">
        ${x.fixa && x.mes_inicio < mes ? "Encerrar" : ic("lixo")}</button></td></tr>`).join("")}
      <tr><td colspan="3"><b>Total</b></td><td><b>${brl(d.total)}</b></td><td></td></tr></tbody></table></div>
      <p class="pequeno suave" style="margin-bottom:0">Mudar o valor de uma despesa fixa muda todos os meses em que ela vale. Se o valor mudou só
        a partir de agora, encerre a antiga e lance a nova.</p>`
    : vazio("loja", "Nenhuma despesa neste mês", "Lance aluguel, energia, salários, sistemas e o que mais a operação gasta todo mês.")}</div>`;
  $("#d-mes").onchange = () => { location.hash = "#/despesas/" + $("#d-mes").value; };
  $("#f-desp").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", e.target), async () => {
      const f = e.target;
      await api("/api/financeiro/despesas", { method: "POST", body: { descricao: f.descricao.value, categoria: f.categoria.value,
        valor: Number(f.valor.value), fixa: f.fixa.value === "1", mes_inicio: mes } });
      toast("Despesa lançada.");
      await recarregar();
    });
  };
  $$("[data-valor]").forEach((inp) => (inp.onchange = async () => {
    const x = d.itens[+inp.dataset.valor];
    try {
      await api(`/api/financeiro/despesas/${x.id}`, { method: "PUT", body: { ...x, valor: Number(inp.value), mes_inicio: x.mes_inicio } });
      toast("Valor atualizado.");
      await recarregar();
    } catch (err) { toast(err.message, true); }
  }));
  $$("[data-remover]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const x = d.itens[+b.dataset.remover];
    const r = await api(`/api/financeiro/despesas/${x.id}?mes=${mes}`, { method: "DELETE" });
    toast(r.acao === "encerrada" ? "Despesa encerrada a partir deste mês." : "Despesa excluída.");
    await recarregar();
  })));
}

const fmtPct = (v) => (v == null ? "—" : String(v).replace(".", ",") + "%");

async function desenharTributacao(regime) {
  const sec = $("#trib");
  if (!sec) return;
  const pode = eEquipe() || estado.usuario.papel === "cliente";
  let d;
  try { d = await api("/api/financeiro/tributacao"); } catch (e) { sec.innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  const busca = (estado.buscaTrib || "").trim().toLowerCase();
  const filtradas = d.regras.filter((r) => !busca || `${r.sku} ${r.descricao} ${r.ncm}`.toLowerCase().includes(busca));
  sec.innerHTML = `<div class="linha entre" style="gap:10px;flex-wrap:wrap"><div><h2 style="margin:0">${ic("relatorio", "p")}Planilha de tributação</h2>
      <div class="pequeno suave">${d.total ? `<b>${numero(d.total)} SKU(s)</b> com regra fiscal · importada em ${data(d.importado_em)}` : "Nenhuma planilha importada ainda."}</div></div>
    <div class="linha">
      ${pode ? `<button class="sec pequeno" id="trib-ml" title="Puxa NCM, origem, CST e alíquotas cadastrados no Faturador do Mercado Livre">${ic("baixar", "p")}Buscar no Faturador do ML</button>` : ""}
      <button class="sec pequeno" id="trib-modelo">${ic("baixar", "p")}Baixar modelo</button>
      ${pode ? `<button class="pequeno" id="trib-importar">${ic("enviar", "p")}${d.total ? "Importar nova planilha" : "Importar planilha"}</button>` : ""}
      ${pode && d.total ? `<button class="sec pequeno perigo-txt" id="trib-apagar">${ic("lixo", "p")}Apagar</button>` : ""}</div></div>
    ${regime === "simples" ? `<div class="aviso azul pequeno" style="margin-top:10px">No Simples Nacional o imposto é a alíquota única do DAS e a planilha não é usada.
      Ela vale quando o regime é Lucro Real ou Presumido.</div>` : !d.total ? `<div class="aviso amarelo pequeno" style="margin-top:10px">No ${h(REGIME[regime])} o imposto
      depende de cada produto. Exporte do sistema onde a loja emite a nota (Bling, Tiny, Omie, ou a planilha do contador) a lista de produtos com os dados fiscais
      e importe aqui. Sem ela o lucro usa só os valores gerais acima.</div>` : ""}
    <p class="pequeno suave" style="margin-top:10px"><b>Emite nota pelo Mercado Livre?</b> Use <b>Buscar no Faturador do ML</b>: o Monvatti Radar puxa a ficha fiscal
      de cada SKU (NCM, origem, CST/CSOSN) e as alíquotas das regras tributárias cadastradas lá. Só completa o que estiver vazio: o que veio da planilha continua valendo.
      <b>Emite por Bling, Tiny ou outro sistema?</b> Importe a planilha de produtos desse sistema.</p>
    <p class="pequeno suave" style="margin-top:6px">Uma linha por SKU. O Monvatti Radar reconhece as colunas pelo nome: SKU, NCM, Origem, CST/CSOSN, Alíquota de ICMS,
      ICMS ST, FCP, IPI, PIS, COFINS, créditos de ICMS e PIS/COFINS na compra e, se tiver, uma coluna por estado de destino (ex.: “ICMS SP”). Aceita .xlsx e .csv.
      A venda usa a regra do SKU; o que não estiver na planilha usa os valores gerais.</p>
    <input type="file" id="trib-arquivo" accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    <div id="trib-previa"></div>
    ${d.total ? `<input type="search" id="trib-busca" placeholder="Buscar SKU, descrição ou NCM…" value="${h(estado.buscaTrib || "")}" style="max-width:340px;margin:6px 0">
      <div class="tabela" style="margin:0 -20px -20px"><table class="tabela-trib"><thead><tr><th>SKU</th><th>NCM</th><th>Origem</th><th>CST</th>
        <th class="num">ICMS</th><th>ST</th><th class="num">IPI</th><th class="num">PIS</th><th class="num">COFINS</th><th class="num">Créditos</th><th>Destino</th>${pode ? "<th></th>" : ""}</tr></thead><tbody>
        ${filtradas.slice(0, 200).map((r) => `<tr><td><b>${h(r.sku)}</b><div class="pequeno suave corta-trib">${h(r.descricao)}</div></td>
          <td>${h(r.ncm) || "—"}</td><td>${h(r.origem) || "—"}</td><td>${h(r.cst_icms) || "—"}</td>
          <td class="num">${fmtPct(r.icms_pct)}${r.fcp_pct ? `<div class="pequeno suave">FCP ${fmtPct(r.fcp_pct)}</div>` : ""}</td>
          <td>${r.icms_st ? '<span class="selo neutro">ST</span>' : ""}</td>
          <td class="num">${fmtPct(r.ipi_pct)}</td><td class="num">${fmtPct(r.pis_pct)}</td><td class="num">${fmtPct(r.cofins_pct)}</td>
          <td class="num pequeno">${r.credito_icms_pct != null || r.credito_pis_cofins_pct != null ? `ICMS ${fmtPct(r.credito_icms_pct)}<br>PIS/COF ${fmtPct(r.credito_pis_cofins_pct)}` : "—"}</td>
          <td class="pequeno">${Object.keys(r.aliquotas_uf || {}).length ? h(Object.entries(r.aliquotas_uf).map(([u, v]) => `${u} ${fmtPct(v)}`).join(" · ")) : "—"}</td>
          ${pode ? `<td><button class="icone" data-apagar-regra="${r.id}" title="Apagar esta linha" aria-label="Apagar esta linha">${ic("lixo")}</button></td>` : ""}</tr>`).join("")}
      </tbody></table>${filtradas.length > 200 ? `<p class="pequeno suave" style="padding:8px 20px">Mostrando 200 de ${numero(filtradas.length)}. Use a busca.</p>` : ""}</div>` : ""}`;
  $("#trib-modelo").onclick = () => comBotao($("#trib-modelo"), () => baixarArquivo("/api/financeiro/tributacao/modelo.csv", "modelo-planilha-tributacao.csv"));
  const doMl = $("#trib-ml");
  if (doMl) doMl.onclick = () => comBotao(doMl, async () => {
    const r = await api("/api/financeiro/tributacao/mercadolivre", { method: "POST" });
    const partes = [`${r.consultados} SKU(s) consultados`, `${r.novos} novo(s)`, `${r.completados} completado(s)`];
    if (r.sem_ficha) partes.push(`${r.sem_ficha} sem ficha fiscal no ML`);
    toast(partes.join(" · ") + (r.regras_ml ? ` · ${r.regras_ml} regra(s) tributária(s) lida(s)` : ""));
    if (!r.novos && !r.completados) toast("Nenhum SKU tem ficha fiscal no Faturador do Mercado Livre. Se a loja emite nota por outro sistema, importe a planilha dele.", true);
    desenharTributacao(regime);
  });
  const imp = $("#trib-importar"), arq = $("#trib-arquivo");
  if (imp) imp.onclick = () => arq.click();
  arq.onchange = () => { const f = arq.files[0]; arq.value = ""; if (f) previaTributacao(f, null, regime); };
  const apagar = $("#trib-apagar");
  if (apagar) apagar.onclick = () => {
    if (!confirm("Apagar a planilha de tributação inteira? O lucro volta a usar só os valores gerais.")) return;
    comBotao(apagar, async () => { await api("/api/financeiro/tributacao", { method: "DELETE" }); toast("Planilha apagada."); desenharTributacao(regime); });
  };
  $$("[data-apagar-regra]", sec).forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await api("/api/financeiro/tributacao/" + b.dataset.apagarRegra, { method: "DELETE" });
    desenharTributacao(regime);
  })));
  const campoBusca = $("#trib-busca");
  if (campoBusca) campoBusca.oninput = () => {
    estado.buscaTrib = campoBusca.value;
    clearTimeout(desenharTributacao._t);
    desenharTributacao._t = setTimeout(async () => { await desenharTributacao(regime); const c = $("#trib-busca"); c?.focus(); c?.setSelectionRange(c.value.length, c.value.length); }, 250);
  };
}

async function previaTributacao(arquivo, mapa, regime) {
  const alvo = $("#trib-previa");
  alvo.innerHTML = `<div class="carregando"><span class="girando"></span> Lendo ${h(arquivo.name)}…</div>`;
  const fd = new FormData();
  fd.append("arquivo", arquivo);
  if (mapa) fd.append("mapa", JSON.stringify(mapa));
  let p;
  try { p = await api("/api/financeiro/tributacao/previa", { method: "POST", body: fd }); }
  catch (e) { alvo.innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  const opcoes = (sel) => `<option value="">— não usar —</option>${p.cabecalho.map((c, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${h(c || `coluna ${i + 1}`)}</option>`).join("")}`;
  const colunasUf = Object.entries(p.mapa.ufs);
  alvo.innerHTML = `<div class="trib-previa">
    <div class="linha entre"><b>${ic("relatorio", "p")}${h(arquivo.name)}</b><button type="button" class="icone" id="trib-cancelar" title="Cancelar" aria-label="Cancelar">${ic("x")}</button></div>
    ${p.avisos.map((a) => `<div class="aviso amarelo pequeno">${h(a)}</div>`).join("")}
    <p class="pequeno"><b>${numero(p.total)} SKU(s)</b> na planilha${p.skus_loja ? ` · ${numero(p.casam)} de ${numero(p.skus_loja)} SKUs da loja encontrados` : ""}.
      ${p.faltam_total ? `<span class="aviso-texto">Faltam ${numero(p.faltam_total)} SKU(s) que a loja vende: ${h(p.faltam.slice(0, 8).join(", "))}${p.faltam_total > 8 ? "…" : ""}</span>` : ""}</p>
    <details ${p.avisos.length ? "open" : ""}><summary class="pequeno">Conferir as colunas reconhecidas</summary>
      <div class="grade-mapa">${Object.entries(p.campos).map(([k, n]) => `<label>${h(n)}<select data-campo="${k}">${opcoes(p.mapa.campos[k])}</select></label>`).join("")}</div>
      ${colunasUf.length ? `<p class="pequeno suave">Alíquota por estado de destino: ${colunasUf.map(([uf, i]) => `${uf} (${h(p.cabecalho[i])})`).join(", ")}</p>` : ""}
    </details>
    ${p.amostra.length ? `<div class="tabela embutida" style="margin-top:8px"><table class="tabela-trib"><thead><tr><th>SKU</th><th>Origem</th><th>CST</th><th class="num">ICMS</th><th>ST</th>
      <th class="num">IPI</th><th class="num">PIS</th><th class="num">COFINS</th></tr></thead><tbody>
      ${p.amostra.map((r) => `<tr><td><b>${h(r.sku)}</b><div class="pequeno suave corta-trib">${h(r.descricao)}</div></td><td>${h(r.origem) || "—"}</td><td>${h(r.cst_icms) || "—"}</td>
        <td class="num">${fmtPct(r.icms_pct)}</td><td>${r.icms_st ? "sim" : ""}</td><td class="num">${fmtPct(r.ipi_pct)}</td><td class="num">${fmtPct(r.pis_pct)}</td>
        <td class="num">${fmtPct(r.cofins_pct)}</td></tr>`).join("")}</tbody></table></div>
      <p class="pequeno suave">Primeiras ${p.amostra.length} linhas, como o Monvatti Radar entendeu.</p>` : ""}
    <label class="confirmacao" style="margin:8px 0"><input type="checkbox" id="trib-substituir" checked> Substituir a planilha atual (SKUs que não estão no arquivo novo são apagados)</label>
    <div class="linha" style="justify-content:flex-end"><button class="sec" id="trib-reler">Reler com estas colunas</button>
      <button id="trib-confirmar" ${p.total && p.mapa.campos.sku != null ? "" : "disabled"}>${ic("salvar", "p")}Importar ${numero(p.total)} SKU(s)</button></div></div>`;
  const lerMapa = () => ({ campos: Object.fromEntries($$("[data-campo]", alvo).filter((s) => s.value !== "").map((s) => [s.dataset.campo, +s.value])),
    ufs: p.mapa.ufs });
  $("#trib-cancelar").onclick = () => (alvo.innerHTML = "");
  $("#trib-reler").onclick = () => previaTributacao(arquivo, lerMapa(), regime);
  $("#trib-confirmar").onclick = () => comBotao($("#trib-confirmar"), async () => {
    const fd2 = new FormData();
    fd2.append("arquivo", arquivo);
    fd2.append("mapa", JSON.stringify(lerMapa()));
    fd2.append("substituir", $("#trib-substituir").checked ? "true" : "false");
    const r = await api("/api/financeiro/tributacao/importar", { method: "POST", body: fd2 });
    toast(`Planilha importada: ${r.novos} novo(s), ${r.atualizados} atualizado(s)${r.removidos ? `, ${r.removidos} removido(s)` : ""}. O lucro já usa as regras novas.`);
    desenharTributacao(regime);
  });
}

async function telaImpostos() {
  const cfg = await api("/api/financeiro/config");
  const pad = cfg.padroes;
  const num = (v) => (v == null ? "" : String(v));
  const marcar = (nome, rotulo) => `<label class="linha" style="gap:6px;font-weight:500;margin:0">
    <input type="checkbox" name="${nome}" ${cfg[nome] ? "checked" : ""} style="width:auto"> ${rotulo}</label>`;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Impostos</h1>
    <div class="suave">Regime tributário de <b>${h(clienteAtual()?.nome)}</b>, usado no lucro de cada venda.</div></div>
    <a class="botao sec" href="#/lucro">${ic("cifrao", "p")}Ver vendas e lucro</a></div>
  <form class="cartao" id="f-imp">
    <div class="grade g3">
      <div><label for="i-regime">Regime tributário</label><select id="i-regime" name="regime">
        ${Object.entries(REGIME).map(([v, n]) => `<option value="${v}" ${cfg.regime === v ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div data-regime="simples"><label for="i-simples">Alíquota efetiva do Simples (%)</label>
        <input id="i-simples" name="aliquota_simples_pct" type="number" step="0.01" min="0" max="40" value="${num(cfg.aliquota_simples_pct)}"></div>
      <div data-regime="lucro"><label for="i-uf">Estado de onde a mercadoria sai</label><select id="i-uf" name="uf_origem">
        <option value="">Escolha</option>${UFS.map((u) => `<option ${cfg.uf_origem === u ? "selected" : ""}>${u}</option>`).join("")}</select></div>
    </div>
    <p class="pequeno suave" data-regime="simples">No Simples, o DAS já inclui ICMS, PIS, COFINS, IRPJ e CSLL. Use a alíquota efetiva da faixa atual
      (a do extrato do PGDAS), não a nominal da tabela.</p>
    <div data-regime="lucro">
      <p class="pequeno suave">No Presumido e no Real o imposto muda conforme o estado do comprador, então cada venda é calculada separada:
        ICMS interno quando o comprador é do mesmo estado; para outro estado, ICMS interestadual (7% ou 12%, 4% se importado)
        mais o DIFAL do estado de destino. Em branco, vale o padrão do regime. Estes são os <b>valores gerais</b>: para cada produto vale
        a <b>planilha de tributação</b> abaixo, quando o SKU estiver nela.</p>
      <div class="grade g3">
        <div><label for="i-pis">PIS/COFINS (%)</label><input id="i-pis" name="pis_cofins_pct" type="number" step="0.01" min="0" max="30" value="${num(cfg.pis_cofins_pct)}"></div>
        <div><label for="i-outros">Outros sobre a venda (%)</label><input id="i-outros" name="outros_pct" type="number" step="0.01" min="0" max="30"
          value="${num(cfg.outros_pct)}"><div class="pequeno suave" data-regime="presumido">IRPJ + CSLL presumidos (comércio: 2,28%).</div></div>
        <div><label for="i-cred">Créditos na compra (% do custo)</label><input id="i-cred" name="credito_custo_pct" type="number" step="0.01" min="0" max="40"
          value="${num(cfg.credito_custo_pct)}"><div class="pequeno suave">ICMS e PIS/COFINS da nota de compra que abatem o imposto.</div></div>
      </div>
      <div class="linha" style="flex-wrap:wrap;gap:18px;margin-top:12px">
        ${marcar("cobrar_difal", "Recolher DIFAL (consumidor final de outro estado)")}
        ${marcar("importado", "Mercadoria importada (interestadual de 4%)")}
        ${marcar("icms_excluido_pis_cofins", "Excluir o ICMS da base do PIS/COFINS")}
      </div>
      <div class="icms-uf">
        <div class="linha entre" style="gap:10px">
          <div><h3 style="margin:0">ICMS e DIFAL por estado de destino</h3>
            <div class="pequeno suave">Quanto de ICMS sai em cada venda, conforme o estado do comprador (consumidor final). A alíquota interna
              de cada estado é editável: ajuste quando o seu produto tem alíquota diferente da padrão (já inclui o FCP nos estados que cobram junto).</div></div>
          <label class="linha pequeno" style="gap:6px;margin:0;font-weight:500;white-space:nowrap">Simular venda de R$
            <input id="icms-valor" type="number" min="1" step="1" value="100" style="width:96px"></label>
        </div>
        <div class="tabela" style="margin:12px 0 0"><table class="tabela-icms"><thead><tr><th>Destino</th><th>Operação</th>
          <th class="num">ICMS da origem</th><th class="num">Interna do destino</th><th class="num">DIFAL</th><th class="num">Carga de ICMS</th>
          <th class="num">Em R$ <span id="icms-valor-rot">100</span></th></tr></thead>
          <tbody>${UFS.map((u) => `<tr data-linha-uf="${u}"><td><b>${u}</b> <span class="pequeno suave">${NOME_UF[u]}</span></td>
            <td class="pequeno" data-c="op"></td><td class="num" data-c="origem"></td>
            <td class="num"><input type="number" step="0.01" min="0" max="40" data-uf="${u}" value="${num(cfg.aliquotas_uf[u] ?? pad.aliquota_interna[u])}"
              aria-label="Alíquota interna de ${u}" class="icms-input"></td>
            <td class="num" data-c="difal"></td><td class="num" data-c="carga"></td><td class="num" data-c="reais"></td></tr>`).join("")}</tbody></table></div>
        <p class="pequeno suave" style="margin:8px 0 0">Interestadual: 4% para importados; 7% saindo do Sul/Sudeste (menos ES) para Norte, Nordeste,
          Centro-Oeste e ES; 12% nos demais casos. DIFAL = interna do destino − interestadual, pago ao estado do comprador.
          Produtos com regra própria na planilha abaixo (ST, isenção, alíquota diferente) usam a regra do SKU.</p>
      </div>
      <p class="pequeno suave">No Lucro Real, IRPJ e CSLL são calculados sobre o lucro do período e não entram por venda.
        É uma estimativa gerencial: confirme as alíquotas com o contador.</p>
    </div>
    <h3>Devoluções</h3>
    ${marcar("devolucao_volta_estoque", "Quando o produto volta na devolução, ele retorna ao estoque (o custo não é perda)")}
    <p class="pequeno suave">Desmarque se os produtos devolvidos costumam voltar sem condição de venda.</p>
    <div class="linha" style="justify-content:flex-end;margin-top:8px"><button type="submit">${ic("salvar", "p")}Salvar</button></div>
  </form>
  <section class="cartao" id="trib" style="margin-top:16px"><div class="carregando"><span class="girando"></span> Carregando a planilha de tributação…</div></section>`;
  const f = $("#f-imp");
  const mostrarRegime = () => {
    const reg = f.regime.value;
    $$("[data-regime]", f).forEach((el) => {
      const alvo = el.dataset.regime;
      el.hidden = !(alvo === reg || (alvo === "lucro" && reg !== "simples"));
    });
    if (reg !== "simples") {
      f.pis_cofins_pct.placeholder = `padrão ${String(pad.pis_cofins[reg]).replace(".", ",")}`;
      f.outros_pct.placeholder = `padrão ${String(pad.outros[reg]).replace(".", ",")}`;
    }
  };
  const desenharIcms = () => {
    const origem = f.uf_origem.value;
    const valor = Math.max(Number($("#icms-valor").value) || 0, 0);
    $("#icms-valor-rot").textContent = valor.toLocaleString("pt-BR");
    $$("[data-linha-uf]", f).forEach((tr) => {
      const uf = tr.dataset.linhaUf;
      const interna = Number($("[data-uf]", tr).value || 0);
      const c = (k) => $(`[data-c="${k}"]`, tr);
      tr.classList.toggle("origem", uf === origem);
      if (!origem) { ["op", "origem", "difal", "carga", "reais"].forEach((k) => (c(k).textContent = k === "op" ? "escolha a origem" : "—")); return; }
      let inter, difal = 0, op;
      if (uf === origem) { inter = interna; op = "venda dentro do estado"; }
      else {
        inter = interestadualUF(origem, uf, f.importado.checked);
        op = `interestadual ${origem}→${uf}`;
        difal = f.cobrar_difal.checked ? Math.max(interna - inter, 0) : 0;
      }
      const carga = inter + difal;
      c("op").textContent = op;
      c("origem").textContent = fmtPct(Math.round(inter * 100) / 100);
      c("difal").textContent = uf === origem ? "—" : f.cobrar_difal.checked ? fmtPct(Math.round(difal * 100) / 100) : "não recolhe";
      c("carga").innerHTML = `<b>${fmtPct(Math.round(carga * 100) / 100)}</b>`;
      c("reais").textContent = brl((valor * carga) / 100);
    });
  };
  ["uf_origem", "importado", "cobrar_difal"].forEach((n) => f[n].addEventListener("change", desenharIcms));
  $$(".icms-input", f).forEach((i) => i.addEventListener("input", desenharIcms));
  $("#icms-valor").addEventListener("input", desenharIcms);
  desenharIcms();
  f.regime.onchange = () => { mostrarRegime(); desenharTributacao(f.regime.value); };
  mostrarRegime();
  desenharTributacao(cfg.regime);
  f.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", f), async () => {
      await api("/api/financeiro/config", { method: "PUT", body: {
        regime: f.regime.value, aliquota_simples_pct: numOuNulo(f.aliquota_simples_pct.value) ?? 0, uf_origem: f.uf_origem.value,
        pis_cofins_pct: numOuNulo(f.pis_cofins_pct.value), outros_pct: numOuNulo(f.outros_pct.value),
        credito_custo_pct: numOuNulo(f.credito_custo_pct.value) ?? 0, importado: f.importado.checked, cobrar_difal: f.cobrar_difal.checked,
        icms_excluido_pis_cofins: f.icms_excluido_pis_cofins.checked, devolucao_volta_estoque: f.devolucao_volta_estoque.checked,
        aliquotas_uf: Object.fromEntries($$("[data-uf]", f).map((i) => [i.dataset.uf, numOuNulo(i.value)])),
        embalagem_padrao: cfg.embalagem_padrao } });
      toast("Impostos salvos. O lucro de todos os meses já usa os valores novos.");
    });
  };
}
