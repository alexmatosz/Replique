"use strict";

const dataCurta = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

async function telaFull() {
  $("#tela").innerHTML = `<div class="topo"><div><h1>Estoque Full</h1>
    <div class="suave">Unidades de <b>${h(clienteAtual()?.nome)}</b> nos centros do Mercado Livre, com o custo parado e aviso do que vai
      gerar custo de armazenamento até o fim do mês que vem.</div>
    <div class="pequeno suave">Estoque e entradas vêm da API oficial do Mercado Livre. O tempo no Full é calculado pelas entradas (as unidades mais antigas
      saem primeiro). A tarifa de armazenagem não vem pela API: informe em Custos do Full. Produto há 2 meses ou mais no Full gera aviso no sino.</div></div>
    <div class="linha">${eEquipe() || estado.usuario.papel === "cliente" ? `<button class="sec" id="full-config">${ic("ajustes", "p")}Custos do Full</button>` : ""}
      <span class="pequeno suave" data-atualizado="full"></span>
      <button class="sec pequeno" id="full-recarregar">${ic("trocar", "p")}Atualizar agora</button></div></div>
  <div id="full-corpo"><div class="carregando"><span class="girando"></span> Lendo o estoque no Full e as entradas dos últimos 12 meses…</div></div>`;
  let d;
  try { d = await api("/api/financeiro/estoque-full"); }
  catch (e) { $("#full-corpo").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  if (estado._rotaAtual !== "full") return;
  $("#full-recarregar").onclick = () => comBotao($("#full-recarregar"), telaFull);
  const cfg = $("#full-config");
  if (cfg) cfg.onclick = () => configurarFull(d);
  const t = d.totais;
  const filtro = estado.filtroFull || "todos";
  const itens = d.itens.filter((x) => filtro === "todos" || (filtro === "alerta" ? x.alertas.length : x.nivel === "ok"));
  $("#full-corpo").innerHTML = `
    ${d.demo ? `<div class="aviso amarelo">${h(d.aviso)} Os números abaixo são de demonstração.</div>` : ""}
    ${!d.tem_vendas && !d.demo ? `<div class="aviso azul pequeno">Sincronize as vendas em <a href="#/lucro">Gestão › Vendas e taxas</a> para o Monvatti Radar saber o ritmo de venda
      de cada anúncio. Sem isso a projeção supõe que nada vai vender.</div>` : ""}
    <div class="grade g4 kpis" style="margin-bottom:16px">
      <div class="cartao kpi"><div class="rotulo">No Full agora</div><div class="valor">${numero(t.unidades)} un.</div>
        <div class="pequeno suave">${numero(t.anuncios)} anúncio(s)</div></div>
      <div class="cartao kpi"><div class="rotulo">Dinheiro parado no Full</div><div class="valor">${brl(t.valor_parado)}</div>
        <div class="pequeno suave">${t.sem_custo ? `${t.sem_custo} sem custo cadastrado · <a href="#/produtos">cadastrar</a>` : "pelo custo dos produtos"}</div></div>
      <div class="cartao kpi ${t.acima_limite ? "alerta" : ""}"><div class="rotulo">Vão passar de ${d.limite_dias} dias até ${dataCurta(d.ate)}</div>
        <div class="valor ${t.acima_limite ? "negativo" : ""}">${numero(t.acima_limite)} un.</div>
        <div class="pequeno suave">armazenamento prolongado custa mais</div></div>
      <div class="cartao kpi"><div class="rotulo">Armazenagem até ${dataCurta(d.ate)}</div>
        <div class="valor">${t.armazenagem_estimada != null ? brl(t.armazenagem_estimada) : "—"}</div>
        <div class="pequeno suave">${d.custo_unidade_mes ? `estimativa a ${brl(d.custo_unidade_mes)} por unidade ao mês` : `<a href="#" id="full-config-2">informe o custo por unidade</a> para estimar`}</div></div>
    </div>
    <div class="segmentos" style="margin-bottom:12px">${[["todos", `Todos (${d.itens.length})`], ["alerta", `Com aviso (${t.com_alerta})`], ["ok", "Sem aviso"]].map(([v, n]) =>
      `<button type="button" data-filtro-full="${v}" class="${filtro === v ? "ativa" : ""}">${n}</button>`).join("")}</div>
    <div class="cartao">${itens.length ? `<div class="tabela"><table class="tabela-full"><thead><tr><th>Anúncio</th><th class="num">No Full</th>
      <th class="num" title="Média dos últimos 30 dias">Vende/dia</th><th class="num">Dura</th><th>Mais antiga</th><th class="num">Custo parado</th>
      <th class="num" title="Unidades que ainda vão estar no Full no fim do mês que vem, no ritmo atual">Sobra em ${dataCurta(d.ate)}</th></tr></thead><tbody>
      ${itens.map((x) => `<tr class="nivel-${x.nivel}"><td><div class="linha" style="gap:10px;flex-wrap:nowrap">
          ${urlSegura(x.foto) ? `<img src="${h(x.foto)}" alt="" width="40" height="40" class="mini-foto" referrerpolicy="no-referrer">` : ""}
          <div style="min-width:0"><b class="corta">${urlSegura(x.link) ? `<a href="${h(x.link)}" target="_blank" rel="noopener">${h(x.titulo)}</a>` : h(x.titulo)}</b>
          <div class="pequeno suave">${h(x.item_id)}${x.variacao ? ` · ${h(x.variacao)}` : ""}${x.sku ? ` · SKU ${h(x.sku)}` : ""}</div>
          ${x.alertas.map((a) => `<div class="pequeno ${x.nivel === "vermelho" ? "erro-texto" : "aviso-texto"}">${ic("alerta", "p")} ${h(a)}</div>`).join("")}</div></div></td>
        <td class="num"><b>${x.erro ? "—" : numero(x.total)}</b>${x.indisponivel ? `<div class="pequeno suave">${numero(x.indisponivel)} indisp.</div>` : ""}</td>
        <td class="num">${x.vendas_dia ? String(x.vendas_dia).replace(".", ",") : "0"}</td>
        <td class="num">${x.cobertura_dias != null ? `${numero(x.cobertura_dias)} dias` : x.total ? "sem venda" : "—"}</td>
        <td>${x.entrada_mais_antiga ? `${dataCurta(x.entrada_mais_antiga)}<div class="pequeno suave">${numero(x.idade_dias)} dias</div>` : x.total ? '<span class="pequeno suave">há mais de 12 meses</span>' : "—"}</td>
        <td class="num">${x.valor_parado != null ? brl(x.valor_parado) : '<span class="pequeno suave">sem custo</span>'}</td>
        <td class="num">${numero(x.projecao.restantes)}${x.projecao.acima_limite ? `<div class="pequeno negativo">${numero(x.projecao.acima_limite)} acima de ${d.limite_dias} dias</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("caixa", d.itens.length ? "Nada nesta seleção" : "Nenhum anúncio no Full", d.itens.length ? "" : "Quando a conta tiver anúncios no Full, eles aparecem aqui.")}</div>
    <p class="pequeno suave">A idade vem das entradas no Full dos últimos 12 meses (o ML despacha primeiro as unidades mais antigas). A projeção usa a média de vendas
      dos últimos 30 dias. O Mercado Livre não informa a tarifa de armazenagem pela API: confira o valor por unidade na fatura do Full e ajuste em <b>Custos do Full</b>.</p>`;
  $$("[data-filtro-full]").forEach((b) => (b.onclick = () => { estado.filtroFull = b.dataset.filtroFull; telaFull(); }));
  const cfg2 = $("#full-config-2");
  if (cfg2) cfg2.onclick = (e) => { e.preventDefault(); configurarFull(d); };
}

function configurarFull(d) {
  const m = modal(`<h2>${ic("ajustes", "p")}Custos do Full</h2>
    <p class="pequeno suave" style="margin-top:-6px">Usados só para a estimativa e os avisos desta tela.</p>
    <div class="grade g2">
      <div><label for="cf-custo">Armazenagem por unidade ao mês (R$)</label><input id="cf-custo" type="number" step="0.01" min="0" value="${d.custo_unidade_mes || ""}" placeholder="ex.: 0,90">
        <div class="pequeno suave">Média da fatura do Full: total de armazenagem ÷ unidades.</div></div>
      <div><label for="cf-dias">Avisar quando passar de (dias no Full)</label><input id="cf-dias" type="number" min="30" max="720" value="${d.limite_dias}">
        <div class="pequeno suave">Prazo a partir do qual o ML cobra armazenamento prolongado.</div></div></div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button><button id="cf-salvar">Salvar</button></div>`);
  $("#cf-salvar", m).onclick = () => comBotao($("#cf-salvar", m), async () => {
    await api("/api/financeiro/estoque-full/config", { method: "PUT", body: { custo_unidade_mes: +$("#cf-custo", m).value || 0, dias_prolongado: +$("#cf-dias", m).value || 180 } });
    fecharModal();
    toast("Custos do Full salvos.");
    telaFull();
  });
}
