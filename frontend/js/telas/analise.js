"use strict";

const estadoAnalise = { aba: "cliente" };
const NIVEL_ANALISE = { vermelho: ["erro", "Urgente"], amarelo: ["demo", "Atenção"], azul: ["neutro", "Info"], verde: ["ok", "Bom"] };

function variacaoHtml(v, sufixo = " vs. mês anterior") {
  if (v == null) return '<span class="suave">sem mês anterior</span>';
  return `<span class="${v >= 0 ? "positivo" : "negativo"}">${v > 0 ? "+" : ""}${pct(v)}</span>${sufixo}`;
}

function htmlAchado(a) {
  const [selo, rotulo] = NIVEL_ANALISE[a.nivel] || ["neutro", ""];
  const extra = a.itens.some((i) => i.lucro_sem_ads != null) ? ["Lucro sem Ads", "lucro_sem_ads"]
    : a.itens.some((i) => i.variacao != null) ? ["Mês anterior", "faturamento_anterior"] : null;
  return `<div class="cartao achado ${a.nivel}">
    <span class="selo ${selo}">${rotulo}</span>
    <h3 style="margin:8px 0 4px">${h(a.titulo)}</h3><div class="suave">${h(a.texto)}</div>
    ${a.acao ? `<div class="achado-acao">${ic("seta", "p")}<span><b>O que fazer:</b> ${h(a.acao)}</span></div>` : ""}
    ${a.itens.length ? `<div class="tabela" style="margin-top:10px"><table><thead><tr><th>Produto</th><th>Faturamento</th>
      ${extra ? `<th>${extra[0]}</th>` : ""}<th>Ads</th><th>Lucro</th></tr></thead><tbody>${a.itens.map((i) => `<tr>
        <td>${h(i.titulo)}<div class="pequeno suave">${h(i.item_id || "")}${i.sku ? ` · SKU ${h(i.sku)}` : ""}</div></td>
        <td>${brl(i.faturamento)}${i.variacao != null ? `<div class="pequeno negativo">${pct(i.variacao)}</div>` : ""}</td>
        ${extra ? `<td>${brl(i[extra[1]])}</td>` : ""}<td>${i.ads != null ? brl(i.ads) : "—"}</td>
        <td class="${i.lucro < 0 ? "negativo" : ""}">${brl(i.lucro)}${i.margem != null && i.faturamento ? `<div class="pequeno suave">${pct(i.margem)}</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : ""}</div>`;
}

async function telaAnalise(mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const time = eTime();
  if (!time) estadoAnalise.aba = "cliente";
  else if (!estado.clienteId) estadoAnalise.aba = "carteira";
  const abas = time ? `<div class="abas" style="margin-bottom:16px">
      <button data-aba-an="cliente" class="${estadoAnalise.aba === "cliente" ? "ativa" : ""}" ${estado.clienteId ? "" : "disabled"}>${h(clienteAtual()?.nome || "Cliente")}</button>
      <button data-aba-an="carteira" class="${estadoAnalise.aba === "carteira" ? "ativa" : ""}">Todos os clientes</button></div>` : "";
  const topo = (extra = "") => `<div class="topo"><div><h1>Analista de métricas</h1>
      <div class="suave">Lê as vendas, os custos e a publicidade e aponta o que está tirando lucro, comparando com o mês anterior.
        Os números vêm de Vendas e lucro: sincronize as vendas antes.</div></div>
    <div class="linha" style="flex-wrap:wrap"><select id="an-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select>${extra}</div></div>${abas}`;
  const ligar = () => {
    $("#an-mes").onchange = (e) => telaAnalise(e.target.value);
    $$("[data-aba-an]").forEach((b) => (b.onclick = () => { estadoAnalise.aba = b.dataset.abaAn; telaAnalise(mes); }));
  };

  if (estadoAnalise.aba === "carteira") {
    const lista = await api(`/api/analise/carteira?mes=${mes}`);
    $("#tela").innerHTML = topo() + `<div class="cartao">${lista.length ? `<div class="tabela"><table><thead><tr><th>Cliente</th>
      <th>Faturamento</th><th>Lucro antes do Ads</th><th>Ads</th><th>Lucro depois do Ads</th><th>Principal ponto</th><th></th></tr></thead><tbody>
      ${lista.map((c) => { const i = c.indicadores; return `<tr>
        <td><b>${h(c.cliente.nome)}</b><div class="pequeno suave">${c.sincronizado_em ? `sincronizado ${data(c.sincronizado_em)}` : "vendas não sincronizadas"}</div></td>
        <td>${brl(i.faturamento)}<div class="pequeno">${c.variacao_faturamento != null ? variacaoHtml(c.variacao_faturamento, "") : ""}</div></td>
        <td>${brl(i.lucro_antes_ads)}</td><td>${brl(i.ads)}<div class="pequeno suave">${i.faturamento ? pct(i.tacos) : ""}</div></td>
        <td class="${i.lucro < 0 ? "negativo" : ""}"><b>${brl(i.lucro)}</b><div class="pequeno suave">${i.faturamento ? `margem ${pct(i.margem)}` : ""}</div></td>
        <td>${c.vermelhos ? `<span class="selo erro">${c.vermelhos} urgente(s)</span> ` : ""}${c.amarelos ? `<span class="selo demo">${c.amarelos} atenção</span>` : ""}
          <div class="pequeno suave">${h(c.principal || (i.pedidos ? "Nada crítico" : ""))}</div></td>
        <td style="text-align:right"><button class="sec pequeno" data-ver-cliente="${c.cliente.id}">Analisar</button></td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("brilho", "Nenhum cliente para analisar", "Os clientes que você acompanha aparecem aqui.")}</div>`;
    ligar();
    $$("[data-ver-cliente]").forEach((b) => (b.onclick = () => {
      trocarCliente(+b.dataset.verCliente, { navegar: false });
      estadoAnalise.aba = "cliente";
      telaAnalise(mes);
    }));
    return;
  }

  const r = await api(`/api/financeiro/analise?mes=${mes}`);
  const i = r.indicadores, v = r.variacao, res = r.resumo;
  const kpi = (rotulo, valor, detalhe, cls = "") => `<div class="cartao kpi-bloco"><span class="rotulo">${rotulo}</span>
      <div class="valor ${cls}">${valor}</div><div class="pequeno suave">${detalhe}</div></div>`;
  $("#tela").innerHTML = topo(r.ia_disponivel && i.pedidos ? `<button id="an-ia">${ic("brilho", "p")}Resumo com IA</button>` : "") + `
    ${r.simuladas ? `<div class="aviso azul">${numero(r.simuladas)} venda(s) simulada(s) entram nesta análise.</div>` : ""}
    <div class="cartao resumo-analise">
      <div class="linha entre"><h2 style="margin:0">${ic("brilho", "p")}Resumo do mês</h2>
        <span class="selo ${res.fonte === "ia" ? "ok" : "neutro"}" id="an-fonte">${res.fonte === "ia" ? "escrito pela IA" : "regras"}</span></div>
      <p style="margin:10px 0 0" id="an-texto">${h(res.resumo)}</p>
      <ol class="prioridades" id="an-prioridades" ${res.prioridades.length ? "" : "hidden"}>${res.prioridades.map((p) => `<li>${h(p)}</li>`).join("")}</ol>
      ${r.sincronizacao ? `<p class="pequeno suave" style="margin:10px 0 0">Vendas sincronizadas ${data(r.sincronizacao.feita_em)}
        ${r.sincronizacao.demo ? ' <span class="selo demo">demonstração</span>' : ""}</p>`
        : `<p class="pequeno" style="margin:10px 0 0">As vendas são atualizadas sozinhas a cada hora. <a href="#/lucro/${mes}">Ver vendas e taxas</a></p>`}
    </div>
    ${i.pedidos ? `<div class="grade g4" style="margin-top:16px">
      ${kpi("Faturamento", brl(i.faturamento), variacaoHtml(v.faturamento))}
      ${kpi("Lucro antes do Ads", brl(i.lucro_antes_ads), variacaoHtml(v.lucro_antes_ads), i.lucro_antes_ads < 0 ? "negativo" : "")}
      ${kpi("Publicidade", brl(i.ads), `${pct(i.tacos)} do faturamento${i.roas ? ` · ROAS ${String(i.roas).replace(".", ",")}` : ""}`)}
      ${kpi("Lucro depois do Ads", brl(i.lucro), `margem ${pct(i.margem)} · ${variacaoHtml(v.lucro, "")}`, i.lucro < 0 ? "negativo" : "positivo")}
    </div>` : ""}
    <div class="achados">${r.achados.map(htmlAchado).join("")}</div>`;
  ligar();
  const botaoIa = $("#an-ia");
  if (botaoIa) botaoIa.onclick = () => comBotao(botaoIa, async () => {
    const novo = (await api(`/api/financeiro/analise?mes=${mes}&ia=true`)).resumo;
    $("#an-texto").textContent = novo.resumo;
    $("#an-fonte").className = `selo ${novo.fonte === "ia" ? "ok" : "neutro"}`;
    $("#an-fonte").textContent = novo.fonte === "ia" ? "escrito pela IA" : "regras";
    $("#an-prioridades").innerHTML = novo.prioridades.map((p) => `<li>${h(p)}</li>`).join("");
    $("#an-prioridades").hidden = !novo.prioridades.length;
    if (novo.aviso) toast(novo.aviso, true);
  });
}
