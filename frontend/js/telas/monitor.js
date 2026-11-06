"use strict";

const _autoAtualizado = new Map();
function podeAutoAtualizar(chave, minutos = 10) {
  const k = `${chave}:${estado.clienteId}`;
  const ultima = _autoAtualizado.get(k) || 0;
  if (Date.now() - ultima < minutos * 60000) return false;
  _autoAtualizado.set(k, Date.now());
  return true;
}
const velho = (iso, horas) => !iso || Date.now() - quando(iso).getTime() > horas * 3600000;

const TIPO_MONITOR = { proprio: ["ok", "meu anúncio"], produto: ["neutro", "produto de catálogo"], concorrente: ["demo", "concorrente"] };
const STATUS_ML = { active: ["ok", "ativo"], paused: ["erro", "pausado"], under_review: ["erro", "em moderação"], closed: ["erro", "finalizado"],
  inactive: ["erro", "inativo"], fora_do_catalogo: ["demo", "fora do catálogo"], sem_ofertas: ["demo", "sem ofertas"] };
const LOGISTICA_ML = { fulfillment: "Full", cross_docking: "Coleta", drop_off: "Agência", xd_drop_off: "Agência", self_service: "Flex", default: "Próprio" };
const TIPO_ANUNCIO_ML = { gold_pro: "Premium", gold_special: "Clássico", free: "Grátis" };
const REPUTACAO_ML = { "5_green": ["ok", "verde"], "4_light_green": ["ok", "verde-clara"], "3_yellow": ["demo", "amarela"],
  "2_orange": ["erro", "laranja"], "1_red": ["erro", "vermelha"] };
const estadoMonitor = { aba: "acompanhados" };

function minigrafico(valores, largura = 110, altura = 28) {
  const v = valores.filter((x) => x != null);
  if (v.length < 2) return '<span class="pequeno suave">—</span>';
  const min = Math.min(...v), max = Math.max(...v), faixa = max - min || 1;
  const pontos = v.map((x, i) => `${(i / (v.length - 1)) * (largura - 4) + 2},${altura - 2 - ((x - min) / faixa) * (altura - 4)}`).join(" ");
  const cor = v[v.length - 1] < v[0] ? "var(--vermelho)" : v[v.length - 1] > v[0] ? "var(--verde)" : "var(--azul)";
  return `<svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Variação de preço">
    <polyline points="${pontos}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const naoDisponivel = (motivo) => `<span class="pequeno suave" title="${h(motivo)}">não disponível</span>`;

const TENDENCIA = { alta: ["ok", "Tendência de alta"], queda: ["erro", "Tendência de queda"], estavel: ["neutro", "Estável"],
  sem_dados: ["neutro", "Sem histórico ainda"] };
const SETA = { subindo: "↑", caindo: "↓", estavel: "→" };

function celulaTendencia(t) {
  if (!t) return "—";
  const [cls, nome] = TENDENCIA[t.resumo] || TENDENCIA.sem_dados;
  const cor = (s) => (s.tipo === "vendas" || s.tipo === "visitas" ? (s.sentido === "subindo" ? "bom" : s.sentido === "caindo" ? "ruim" : "suave") : "suave");
  return `<span class="selo ${cls}">${nome}</span>
    ${t.sinais.map((s) => `<div class="pequeno ${cor(s)}">${SETA[s.sentido] || ""} ${h(s.texto)}</div>`).join("")}
    ${t.desde ? `<div class="pequeno suave">comparado com ${dataCurta(t.desde.slice(0, 10))}</div>` : ""}
    ${t.dica ? `<div class="pequeno suave" title="${h(t.dica)}">${t.fonte_vendas === "extensao" ? "vendas: abra o anúncio com a extensão" : "vendas: sincronize em Gestão"}</div>` : ""}`;
}

async function telaMonitor() {
  const e = estadoMonitor;
  const podeEditar = eEquipe() && estado.usuario.papel !== "consultor";
  $("#tela").innerHTML = `<div class="topo"><div><h1>Radar de anúncios</h1>
    <div class="suave">Acompanhe anúncios de <b>${h(clienteAtual()?.nome)}</b> e produtos de catálogo em que ele disputa venda: preço, posição,
      visitas, vendas, tarifa e alertas. Cada atualização fica guardada no histórico.</div></div>
    <div class="atualizado"><span class="pequeno suave" data-atualizado="radar_anuncios"></span>
    ${podeEditar ? `<button id="mon-todos" class="sec pequeno">${ic("trocar", "p")}Atualizar agora</button>` : ""}</div></div>
    <div class="segmentos" role="tablist" aria-label="Radar de anúncios" style="margin-bottom:16px">
      ${[["acompanhados", "Anúncios acompanhados"], ["precos", "Meus preços publicados"]].map(([v, n]) =>
        `<button type="button" role="tab" data-aba-mon="${v}" class="${e.aba === v ? "ativa" : ""}" aria-selected="${e.aba === v}">${n}</button>`).join("")}</div>
    <div id="mon-corpo"></div>`;
  $$("[data-aba-mon]").forEach((b) => (b.onclick = () => { e.aba = b.dataset.abaMon; telaMonitor(); }));
  if ($("#mon-todos")) $("#mon-todos").onclick = () => comBotao($("#mon-todos"), async () => {
    const r = await api("/api/monitor/atualizar", { method: "POST" });
    toast(`${r.lidos} anúncio(s) atualizado(s).${r.erros.length ? ` ${r.erros.length} com erro.` : ""}`, !!r.erros.length);
    telaMonitor();
  });
  if (e.aba === "precos") return meusPrecos($("#mon-corpo"));
  const todos = await api("/api/monitor");
  const filtroTend = e.tendencia || "todos";
  const lista = todos.filter((m) => filtroTend === "todos" || m.tendencia?.resumo === filtroTend);
  const contaTend = (r) => todos.filter((m) => m.tendencia?.resumo === r).length;
  const alertas = lista.flatMap((m) => m.alertas.map((a) => ({ ...a, m })));
  const nomeMon = Object.fromEntries(lista.map((m) => [m.id, m.apelido || m.item_id]));
  $("#mon-corpo").innerHTML = `
    ${podeEditar ? `<form class="cartao" id="mon-form" style="margin-bottom:16px">
      <div class="linha" style="align-items:flex-end">
        <div style="flex:2;min-width:240px"><label for="mon-link">Link ou código do Mercado Livre</label>
          <input id="mon-link" required placeholder="Link do seu anúncio ou do produto de catálogo (endereço com /p/MLB...)"></div>
        <div style="flex:1;min-width:160px"><label for="mon-apelido">Apelido (opcional)</label><input id="mon-apelido" maxlength="200"></div>
        ${lista.some((m) => m.proprio) ? `<div style="flex:1;min-width:200px"><label for="mon-vinculo">Concorrente de qual anúncio meu? (opcional)</label>
          <select id="mon-vinculo"><option value="">Nenhum</option>${lista.filter((m) => m.proprio).map((m) => `<option value="${m.id}">${h(m.apelido || m.item_id)}</option>`).join("")}</select></div>` : ""}
        <button type="submit" id="mon-add">${ic("olho", "p")}Acompanhar</button></div>
      <p class="pequeno suave" style="margin:10px 0 0">Seus anúncios mostram tudo: preço, visitas, vendas (dos pedidos sincronizados no Financeiro), conversão e tarifa.
        De concorrentes, o Mercado Livre só libera pela API o que aparece no produto de catálogo: preço, frete, tipo de anúncio e vendedor.
        <b>Visitas e vendas de concorrentes não vêm pela API</b>: a tendência de vendas deles sai dos vendidos que a extensão Monvatti Pro lê
        quando você abre o anúncio ou a busca. Deixe aqui produtos com bom preço de compra e espere a tendência de alta: o sino avisa.</p></form>` : ""}
    ${todos.length ? `<div class="segmentos" style="margin-bottom:12px">${[["todos", `Todos (${todos.length})`], ["alta", `Tendência de alta (${contaTend("alta")})`],
      ["queda", `Em queda (${contaTend("queda")})`], ["estavel", `Estáveis (${contaTend("estavel")})`]].map(([v, n]) =>
      `<button type="button" data-tend="${v}" class="${filtroTend === v ? "ativa" : ""}">${n}</button>`).join("")}</div>` : ""}
    ${lista.some((m) => m.demo) ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>Demonstração:</b> sem conta do Mercado Livre conectada, as leituras marcadas são fictícias.</div>` : ""}
    ${alertas.length ? `<section class="cartao" style="margin-bottom:16px"><h2>${ic("alerta", "p")}Alertas</h2>
      ${alertas.map((a) => `<div class="aviso ${a.nivel === "vermelho" ? "vermelho" : "amarelo"} pequeno" style="margin:6px 0">
        <b>${h(a.m.apelido || a.m.item_id)}</b>: ${h(a.texto)}</div>`).join("")}</section>` : ""}
    <div class="cartao">${lista.length ? `<div class="tabela embutida"><table><thead><tr><th style="min-width:260px">Anúncio</th><th class="num">Preço</th><th>Variação</th>
      <th style="min-width:190px">Tendência (7 dias)</th><th>Mercado</th><th style="min-width:190px">Catálogo e preço</th><th class="num">Vendas/dia · mês</th><th class="num">Visitas 30 dias</th><th class="num">Conversão</th><th>Tarifa e logística</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((m) => {
        const d = m.atual?.dados || {};
        const [ct, rt] = TIPO_MONITOR[m.tipo] || ["neutro", m.tipo];
        const ant = m.anterior?.preco, atual = m.atual?.preco;
        const variacao = ant && atual && ant !== atual ? `<div class="pequeno ${atual < ant ? "ruim" : ""}">${atual < ant ? "↓" : "↑"} de ${brl(ant)}</div>` : "";
        const semApi = "O Mercado Livre não libera esse dado de outros vendedores pela API.";
        return `<tr><td><div class="linha" style="gap:10px;flex-wrap:nowrap">
            ${d.foto && urlSegura(d.foto) ? `<img src="${h(d.foto)}" alt="" width="40" height="40" loading="lazy" style="border-radius:6px;border:1px solid var(--borda);object-fit:contain;background:#fff;flex-shrink:0">` : ""}
            <div><b>${h(m.apelido || d.titulo || m.item_id)}</b>${m.demo ? ' <span class="selo demo">demonstração</span>' : ""}
              <div class="pequeno suave"><span class="selo ${ct}">${rt}</span> ${h(m.item_id)}${m.atual ? ` · lido ${tempoRelativo(m.atual.lida_em)}` : ""}</div>
              ${d.avaliacoes?.nota ? `<div class="pequeno">${ic("estrela", "p")} ${String(d.avaliacoes.nota).replace(".", ",")} · ${numero(d.avaliacoes.total)} avaliação(ões)</div>`
                : m.proprio || m.demo ? "" : '<div class="pequeno suave" title="A API só libera avaliações dos anúncios do próprio vendedor">avaliações: não disponível pela API</div>'}</div></div></td>
          <td class="num"><b>${brl(atual)}</b>${variacao}</td>
          <td>${minigrafico(m.precos)}</td>
          <td>${celulaTendencia(m.tendencia)}</td>
          <td class="pequeno">${d.mercado_mediana ? `mediana ${brl(d.mercado_mediana)}<div class="suave">${brl(d.mercado_min)} a ${brl(d.mercado_max)} · ${d.mercado_vendedores} vendedor(es)</div>` : "—"}
            ${d.posicao_preco ? `<div>${d.posicao_preco}º mais barato</div>` : ""}</td>
          <td class="pequeno">${celulaCatalogo(m, d)}${m.vinculado_a_id ? `<div class="suave">concorrente de ${h(nomeMon[m.vinculado_a_id] || "")}</div>` : ""}</td>
          <td class="num">${m.proprio ? (d.vendas_dia != null ? `${String(d.vendas_dia).replace(".", ",")} · ${String(d.vendas_mes).replace(".", ",")}` : `<span class="pequeno suave" title="Vendas vêm dos pedidos sincronizados no módulo Gestão">sem vendas sincronizadas</span>`)
            : m.tendencia?.vendas_dia != null ? `${String(m.tendencia.vendas_dia).replace(".", ",")}/dia<div class="pequeno suave" title="Pelos vendidos públicos que a extensão Monvatti Pro leu">pela extensão</div>` : naoDisponivel(semApi)}</td>
          <td class="num">${m.proprio ? (d.visitas_30d ?? "—") : naoDisponivel(semApi)}</td>
          <td class="num">${m.proprio ? (d.conversao_pct != null ? `${String(d.conversao_pct).replace(".", ",")}%` : "—") : naoDisponivel(semApi)}</td>
          <td class="pequeno">${d.tarifa != null ? `tarifa ${brl(d.tarifa)}<div class="suave">você recebe ${brl(d.voce_recebe)}</div>` : ""}
            ${d.frete_custo != null ? `<div>frete grátis custa ${brl(d.frete_custo)}</div>` : ""}
            ${d.logistica ? `<div>${h(LOGISTICA_ML[d.logistica] || d.logistica)}${d.frete_gratis ? " · frete grátis" : ""}</div>` : ""}
            ${d.tipo_anuncio ? `<div class="suave">${h(TIPO_ANUNCIO_ML[d.tipo_anuncio] || d.tipo_anuncio)}</div>` : ""}</td>
          <td>${m.atual ? seloDe(STATUS_ML, m.atual.status) : '<span class="selo neutro">não lido</span>'}${m.alertas.length ? `<div class="pequeno ruim">${m.alertas.length} alerta(s)</div>` : ""}</td>
          <td style="text-align:right;white-space:nowrap">
            <button type="button" class="sec pequeno" data-mon-hist="${m.id}">${ic("relogio", "p")}Histórico</button>
            ${m.produto_id ? `<a class="botao sec pequeno" href="#/concorrentes/${h(m.produto_id)}">${ic("usuarios", "p")}Concorrentes</a>` : ""}
            ${urlSegura(d.link) ? `<a class="botao sec pequeno" href="${h(d.link)}" target="_blank" rel="noopener" title="Abrir no Mercado Livre">${ic("externo", "p")}</a>` : ""}
            ${podeEditar ? `<button type="button" class="sec pequeno" data-mon-ler="${m.id}" title="Ler de novo agora">${ic("trocar", "p")}</button>
              <button type="button" class="sec pequeno" data-mon-tirar="${m.id}" title="Parar de acompanhar">${ic("lixo", "p")}</button>` : ""}</td></tr>`;
      }).join("")}</tbody></table></div>`
      : todos.length ? vazio("olho", "Nenhum anúncio neste filtro") : vazio("olho", "Nenhum anúncio no radar", podeEditar ? "Cole acima o link de um anúncio do cliente ou de um produto de catálogo. Também dá para mandar produtos do Mapeador para cá." : "A equipe ainda não colocou anúncios no radar.")}</div>`;
  $$("[data-tend]").forEach((b) => (b.onclick = () => { e.tendencia = b.dataset.tend; telaMonitor(); }));
  if (podeEditar && todos.some((m) => velho(m.atual?.lida_em, 6)) && podeAutoAtualizar("monitor")) {
    const b = $("#mon-todos");
    if (b) { b.disabled = true; b.innerHTML = `<span class="girando"></span> Atualizando…`; }
    api("/api/monitor/atualizar", { method: "POST" })
      .then((r) => { if (estado._rotaAtual === "monitor" && r.lidos) telaMonitor(); else if (b) { b.disabled = false; b.innerHTML = `${ic("trocar", "p")}Atualizar agora`; } })
      .catch(() => { if (b) { b.disabled = false; b.innerHTML = `${ic("trocar", "p")}Atualizar agora`; } });
  }
  if ($("#mon-form")) $("#mon-form").onsubmit = (ev) => {
    ev.preventDefault();
    comBotao($("#mon-add"), async () => {
      await api("/api/monitor", { method: "POST", body: { link: $("#mon-link").value, apelido: $("#mon-apelido").value,
        vinculado_a_id: +($("#mon-vinculo")?.value || 0) || null } });
      toast("Anúncio colocado no radar.");
      telaMonitor();
    });
  };
  $$("[data-mon-ler]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await api(`/api/monitor/${b.dataset.monLer}/atualizar`, { method: "POST" });
    telaMonitor();
  })));
  $$("[data-mon-tirar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Parar de acompanhar este anúncio? O histórico dele será apagado.")) return;
    comBotao(b, async () => { await api(`/api/monitor/${b.dataset.monTirar}`, { method: "DELETE" }); telaMonitor(); });
  }));
  $$("[data-mon-hist]").forEach((b) => (b.onclick = () => comBotao(b, () => historicoMonitor(+b.dataset.monHist))));
}

function celulaCatalogo(m, d) {
  if (!m.proprio) return d.preco != null ? `preço dele ${brl(d.preco)}<div class="suave">vendas e posição na busca: não disponível pela API</div>` : "—";
  const c = d.catalogo;
  const linhas = [];
  if (c?.indisponivel) linhas.push(`<span class="suave" title="${h(c.indisponivel)}">disputa de catálogo: não disponível</span>`);
  else if (c?.status) {
    linhas.push(`<span class="selo ${c.ganhando ? "ok" : c.status === "listed" ? "neutro" : "erro"}">${h(c.status_nome)}</span>${c.demo ? ' <span class="selo demo">demo</span>' : ""}`);
    if (!c.ganhando && c.motivos?.length) linhas.push(`<div>motivo: ${h(c.motivos.join(", "))}</div>`);
    if (c.preco_para_ganhar) linhas.push(`<div>para ganhar: <b>${brl(c.preco_para_ganhar)}</b></div>`);
    if (!c.ganhando && c.vencedor_preco) linhas.push(`<div class="suave">vencedor a ${brl(c.vencedor_preco)}</div>`);
    if (!c.ganhando && c.oportunidades?.length) linhas.push(`<div class="suave">o que ajuda a ganhar: ${h(c.oportunidades.join(", ").toLowerCase())}</div>`);
  } else if (!d.produto_id && !m.demo) linhas.push('<span class="suave">fora do catálogo</span>');
  if (d.concorrente_menor_preco) linhas.push(`<div class="suave">concorrente mais barato ${brl(d.concorrente_menor_preco)}</div>`);
  linhas.push(d.preco_minimo ? `<div class="suave">mínimo pela margem ${brl(d.preco_minimo)}</div>`
    : '<div class="suave" title="Cadastre o custo do produto no rascunho ou em Produtos e custos">mínimo pela margem: falta o custo</div>');
  if (c?.preco_para_ganhar && d.preco_minimo && c.preco_para_ganhar < d.preco_minimo) linhas.push('<div class="ruim">ganhar o catálogo dá prejuízo</div>');
  return linhas.join("");
}

async function historicoMonitor(id) {
  const r = await api("/api/monitor/" + id);
  const linhas = r.leituras.slice().reverse();
  const valor = (v) => (typeof v === "number" ? (v > 20 ? brl(v) : String(v)) : v === true ? "sim" : v === false ? "não" : h(STATUS_ML[v]?.[1] || v));
  modal(`<h2>${ic("relogio", "p")}Histórico: ${h(r.apelido || r.item_id)}</h2>
    <div style="margin:8px 0 14px">${minigrafico(r.leituras.map((x) => x.preco), 560, 70)}</div>
    <h3>Linha do tempo das mudanças</h3>
    ${r.mudancas?.length ? `<div class="pilha" style="gap:4px;margin-bottom:14px">${r.mudancas.slice(0, 30).map((x) => `<div class="pequeno">
      <span class="suave">${data(x.quando)}</span> · <b>${h(x.campo)}</b>: ${valor(x.de)} → ${valor(x.para)}${x.demo ? ' <span class="selo demo">demo</span>' : ""}</div>`).join("")}</div>`
      : '<p class="pequeno suave">Nenhuma mudança entre as leituras ainda.</p>'}
    <h3>Leituras</h3>
    ${linhas.length ? `<div class="tabela embutida"><table><thead><tr><th>Leitura</th><th class="num">Preço</th><th>Situação</th>
      ${r.proprio ? '<th class="num">Visitas 30 dias</th><th class="num">Vendas 30 dias</th><th class="num">Conversão</th>' : ""}<th>Mercado</th></tr></thead><tbody>
      ${linhas.map((x) => `<tr><td class="pequeno">${data(x.lida_em)}${x.demo ? ' <span class="selo demo">demo</span>' : ""}</td><td class="num">${brl(x.preco)}</td>
        <td>${seloDe(STATUS_ML, x.status)}</td>
        ${r.proprio ? `<td class="num">${x.visitas_30d ?? "—"}</td><td class="num">${x.vendas_30d ?? "—"}</td>
          <td class="num">${x.dados.conversao_pct != null ? String(x.dados.conversao_pct).replace(".", ",") + "%" : "—"}</td>` : ""}
        <td class="pequeno">${x.dados.mercado_mediana ? `mediana ${brl(x.dados.mercado_mediana)} · ${x.dados.mercado_vendedores} vendedor(es)` : "—"}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="suave">Ainda sem leituras.</p>`}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`).classList.add("largo");
}
