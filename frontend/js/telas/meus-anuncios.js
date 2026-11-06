"use strict";

const RISCO = { alto: ["erro", "risco alto"], medio: ["demo", "risco médio"], baixo: ["ok", "risco baixo"] };
const estadoMeus = { dados: null, situacao: {}, situacaoLida: false, visitas: {}, marcados: new Set() };

async function telaMeusAnuncios() {
  const e = estadoMeus;
  e.marcados = new Set();
  e.dados = await api("/api/meus-anuncios");
  e.situacao = {};
  e.situacaoLida = false;
  e.visitas = {};
  const d = e.dados;
  const podeEditar = eEquipe() && estado.usuario.papel !== "consultor";
  const comProblema = estado.pendencias?.rascunhos || 0;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Meus Anúncios</h1>
    <div class="suave">Os anúncios no ar de <b>${h(clienteAtual()?.nome)}</b> no Mercado Livre, na Shopee e na Amazon: situação de agora, preço, estoque,
      visitas, vendas e margem dos últimos ${d.dias} dias, risco e etiquetas.${podeEditar ? " Pausar, reativar, preço e estoque mudam direto no marketplace, sempre com confirmação." : ""}</div></div>
    <div class="linha"><span class="pequeno suave" id="ma-lido"></span>
      <button class="sec pequeno" id="ma-visitas" title="Ler de novo a situação e as visitas">${ic("trocar", "p")}Atualizar agora</button>
      <button class="sec" id="ma-csv">${ic("baixar", "p")}CSV</button></div></div>
    ${comProblema && eEquipe() ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>${comProblema} rascunho(s) com problema na publicação.</b>
      <a href="#/rascunhos/problema">Ver o motivo e corrigir em Rascunhos</a>.</div>` : ""}
    ${!d.vendas_sincronizadas ? `<div class="aviso azul">${ic("alerta", "p")} Vendas e margem aparecem depois de sincronizar os pedidos${vendasLiberadas() ? ` em <a href="#/lucro">Vendas e taxas</a>` : " (módulo Vendas e Lucro, liberado por cliente)"}.</div>` : ""}
    <div id="ma-avisos"></div>
    <div class="grade g4" id="ma-kpis"></div>
    <form class="cartao filtros-meus" style="margin-top:16px">
      <div class="grade g4">
        <div><label for="ma-busca">Busca</label><input id="ma-busca" type="search" placeholder="Título, SKU ou código"></div>
        <div><label for="ma-plat">Plataforma</label><select id="ma-plat"><option value="">Todas</option>
          ${Object.entries(PLAT).map(([k, p]) => `<option value="${k}">${p.nome}</option>`).join("")}</select></div>
        <div><label for="ma-sit">Situação</label><select id="ma-sit"><option value="">Todas</option>
          ${Object.entries(SITUACAO_PUB).map(([k, [, n]]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
        <div><label for="ma-etq">Etiqueta</label><select id="ma-etq"><option value="">Todas</option>
          ${d.etiquetas.map((t) => `<option value="${h(t)}">${h(t)}</option>`).join("")}</select></div>
        <div><label for="ma-risco">Risco</label><select id="ma-risco"><option value="">Qualquer</option>
          <option value="alto">Alto</option><option value="medio">Médio</option><option value="baixo">Baixo</option></select></div>
        <div><label for="ma-margem">Margem</label><select id="ma-margem"><option value="">Qualquer</option>
          <option value="prejuizo">Com prejuízo</option><option value="baixa">Abaixo de 10%</option><option value="sem">Sem venda no período</option></select></div>
        <div><label for="ma-ordem">Ordenar por</label><select id="ma-ordem"><option value="vendas">Mais vendidos</option>
          <option value="margem">Menor margem</option><option value="recente">Publicados há menos tempo</option></select></div>
      </div></form>
    <div class="barra-lote cartao" id="ma-lote" hidden>
      <b id="ma-qtd"></b>
      ${podeEditar ? `<button type="button" class="sec pequeno" id="ma-etiquetar">${ic("lapis", "p")}Etiquetas</button>
        <button type="button" class="sec pequeno" id="ma-pausar">${ic("pausa", "p")}Pausar</button>
        <button type="button" class="sec pequeno" id="ma-ativar">${ic("play", "p")}Ativar</button>
        <button type="button" class="sec pequeno" id="ma-preco-lote">${ic("cifrao", "p")}Preço</button>
        <button type="button" class="sec pequeno" id="ma-estoque-lote">${ic("caixa", "p")}Estoque</button>` : ""}
      <button type="button" class="link-sutil pequeno" id="ma-limpar">limpar seleção</button></div>
    <div class="cartao" id="ma-lista" style="margin-top:16px"></div>`;
  $$(".filtros-meus input, .filtros-meus select").forEach((el) => el.addEventListener(el.type === "search" ? "input" : "change", desenharMeus));
  $("#ma-visitas").onclick = () => comBotao($("#ma-visitas"), () => lerAoVivoMeus(true));
  $("#ma-csv").onclick = () => baixarCsv("meus-anuncios.csv", ["Título", "Plataforma", "Código", "SKU", "Situação", "Preço", "Estoque", "Visitas 30 dias",
    `Vendas ${d.dias} dias`, "Conversão %", "Margem %", "Risco", "Etiquetas", "Link"],
  filtrarMeus().map((x) => { const s = e.situacao[x.publicacao_id] || {}; const v = e.visitas[x.id_externo];
    return [x.titulo, PLAT[x.plataforma]?.nome, x.id_externo, x.sku, (SITUACAO_PUB[s.status] || [])[1] || "", s.preco ?? x.preco, s.estoque ?? x.estoque,
      v ?? "", x.vendas_30d ?? "", v && x.vendas_30d != null ? Math.round((x.vendas_30d / v) * 10000) / 100 : "",
      x.margem_30d ?? "", RISCO[x.risco]?.[1], x.etiquetas.join(", "), x.link]; }));
  $("#ma-limpar").onclick = () => { e.marcados.clear(); desenharMeus(); };
  if ($("#ma-etiquetar")) {
    $("#ma-etiquetar").onclick = () => etiquetarMeus();
    $("#ma-pausar").onclick = () => acaoEmLoteMeus("pausar");
    $("#ma-ativar").onclick = () => acaoEmLoteMeus("ativar");
    $("#ma-preco-lote").onclick = () => precoEstoqueEmLote("preco");
    $("#ma-estoque-lote").onclick = () => precoEstoqueEmLote("estoque");
  }
  desenharMeus();
  await lerAoVivoMeus(false);
}

async function lerAoVivoMeus(avisar) {
  const e = estadoMeus;
  const temMl = e.dados.itens.some((x) => x.plataforma === "mercadolivre" && !x.demo);
  const [situacao, visitas] = await Promise.all([api("/api/publicacoes/situacao").catch(() => ({})),
    temMl ? api("/api/meus-anuncios/visitas", { method: "POST" }).catch(() => ({})) : {}]);
  if (estado._rotaAtual !== "anuncios") return;
  e.situacao = situacao;
  e.visitas = visitas;
  e.situacaoLida = true;
  if (avisar && temMl && !Object.keys(visitas).length) toast("Sem visitas para mostrar: confira a conta do Mercado Livre deste cliente em Contas.", true);
  $("#ma-lido").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const outras = Object.values(situacao).filter((s) => s.outra_conta).length;
  $("#ma-avisos").innerHTML = outras ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>${outras} anúncio(s) foram publicados por outra conta</b>,
    não pela que está conectada agora, então não dá para ver se ainda existem. Para mexer neles pelo Monvatti Radar, reconecte em <a href="#/contas">Contas</a>
    a conta que publicou; se já foram apagados no marketplace, use "Tirar da lista".</div>` : "";
  desenharMeus();
}

function filtrarMeus() {
  const e = estadoMeus;
  const v = (id) => $(id)?.value || "";
  const busca = v("#ma-busca").trim().toLowerCase();
  const lista = e.dados.itens.filter((x) => {
    const s = e.situacao[x.publicacao_id] || {};
    if (busca && !`${x.titulo} ${x.sku} ${x.id_externo}`.toLowerCase().includes(busca)) return false;
    if (v("#ma-plat") && x.plataforma !== v("#ma-plat")) return false;
    if (v("#ma-sit") && s.status !== v("#ma-sit")) return false;
    if (v("#ma-etq") && !x.etiquetas.includes(v("#ma-etq"))) return false;
    if (v("#ma-risco") && x.risco !== v("#ma-risco")) return false;
    if (v("#ma-margem") === "prejuizo" && !(x.margem_30d < 0)) return false;
    if (v("#ma-margem") === "baixa" && !(x.margem_30d < 10)) return false;
    if (v("#ma-margem") === "sem" && x.vendas_30d) return false;
    return true;
  });
  const ordem = {
    vendas: (a, b) => (b.vendas_30d ?? -1) - (a.vendas_30d ?? -1),
    margem: (a, b) => (a.margem_30d ?? Infinity) - (b.margem_30d ?? Infinity),
    recente: (a, b) => new Date(b.publicado_em) - new Date(a.publicado_em),
  }[v("#ma-ordem") || "vendas"];
  return lista.sort(ordem);
}

function desenharMeus() {
  const e = estadoMeus;
  if (!$("#ma-lista")) return;
  const lista = filtrarMeus();
  const ativos = e.dados.itens.filter((x) => e.situacao[x.publicacao_id]?.status === "active").length;
  const vendas = lista.reduce((t, x) => t + (x.vendas_30d || 0), 0);
  const kpi = (r, v, d = "") => `<div class="cartao kpi-bloco"><span class="rotulo">${r}</span><div class="valor">${v}</div>${d ? `<div class="pequeno suave">${d}</div>` : ""}</div>`;
  $("#ma-kpis").innerHTML = kpi("Anúncios", numero(e.dados.itens.length), `${lista.length} com os filtros`)
    + kpi("Ativos agora", e.situacaoLida ? numero(ativos) : "…", "situação lida nos marketplaces")
    + kpi(`Vendas em ${e.dados.dias} dias`, numero(vendas), "unidades, nos anúncios filtrados");
  const podeMarcar = eEquipe() && estado.usuario.papel !== "consultor";
  $("#ma-lote").hidden = !e.marcados.size;
  $("#ma-qtd").textContent = `${e.marcados.size} selecionado(s)`;
  $("#ma-lista").innerHTML = lista.length ? `<div class="tabela embutida"><table><thead><tr>
      ${podeMarcar ? `<th><input type="checkbox" id="ma-todos" aria-label="Selecionar todos" ${lista.every((x) => e.marcados.has(x.publicacao_id)) ? "checked" : ""}></th>` : ""}
      <th style="min-width:260px">Anúncio</th><th>Situação</th><th class="num">Preço</th><th class="num">Estoque</th><th class="num">Visitas</th>
      <th class="num">Vendas</th><th class="num">Conversão</th><th class="num">Margem</th><th>Risco</th><th></th></tr></thead><tbody>
    ${lista.map((x) => {
      const s = e.situacao[x.publicacao_id] || {};
      const vis = e.visitas[x.id_externo];
      const conv = vis && x.vendas_30d != null ? `${String(Math.round((x.vendas_30d / vis) * 10000) / 100).replace(".", ",")}%` : "—";
      return `<tr>${podeMarcar ? `<td><input type="checkbox" data-ma-marcar="${x.publicacao_id}" ${e.marcados.has(x.publicacao_id) ? "checked" : ""} aria-label="Selecionar"></td>` : ""}
        <td><div class="linha" style="gap:10px;flex-wrap:nowrap">
          ${x.foto && urlSegura(x.foto) ? `<img src="${h(x.foto)}" alt="" width="40" height="40" loading="lazy" style="border-radius:6px;border:1px solid var(--borda);object-fit:contain;background:#fff;flex-shrink:0">` : ""}
          <div><b>${h(x.titulo)}</b>${x.demo ? ' <span class="selo demo">simulado</span>' : ""}
            <div class="pequeno suave">${selo(x.plataforma)} ${h(x.id_externo || "")}${x.sku ? ` · SKU ${h(x.sku)}` : ""}</div>
            ${x.etiquetas.length ? `<div class="chips" style="margin-top:4px">${x.etiquetas.map((t) => `<span class="selo neutro">${h(t)}</span>`).join(" ")}</div>` : ""}</div></div></td>
        <td>${s.status ? seloDe(SITUACAO_PUB, s.status) : s.aviso ? `<span class="pequeno suave" title="${h(s.aviso)}">sem leitura</span>` : '<span class="pequeno suave">…</span>'}</td>
        <td class="num">${brl(s.preco ?? x.preco)}</td><td class="num">${s.estoque ?? x.estoque ?? "—"}</td>
        <td class="num">${x.plataforma === "mercadolivre" ? (vis ?? "—") : '<span class="pequeno suave" title="A API dessa plataforma não entrega visitas por anúncio aqui">—</span>'}</td>
        <td class="num">${x.vendas_30d ?? "—"}</td>
        <td class="num">${conv}</td>
        <td class="num ${x.margem_30d < 0 ? "ruim" : ""}">${x.margem_30d != null ? `${String(x.margem_30d).replace(".", ",")}%` : "—"}
          ${x.margem_incompleta ? '<div class="pequeno suave" title="Há venda sem custo ou sem produto vinculado">parcial</div>' : ""}</td>
        <td><span class="selo ${RISCO[x.risco][0]}" title="${h(x.motivos_risco.join("\n"))}">${RISCO[x.risco][1]}</span></td>
        <td style="text-align:right"><div class="acoes-linha" style="justify-content:flex-end">
          ${podeMarcar && (s.acoes || []).includes("pausar") ? `<button type="button" class="sec pequeno" data-ma-acao="pausar" data-pub="${x.publicacao_id}" title="Pausar no marketplace">${ic("pausa", "p")}Pausar</button>` : ""}
          ${podeMarcar && (s.acoes || []).includes("reativar") ? `<button type="button" class="sec pequeno" data-ma-acao="reativar" data-pub="${x.publicacao_id}" title="Reativar no marketplace">${ic("play", "p")}Reativar</button>` : ""}
          ${podeMarcar && s.edita_preco ? `<button type="button" class="sec pequeno" data-ma-preco="${x.publicacao_id}" title="Mudar preço e estoque direto no marketplace">Preço e estoque</button>` : ""}
          ${podeMarcar && (s.outra_conta || ["closed", "deleted"].includes(s.status)) ? `<button type="button" class="sec pequeno" data-ma-tirar="${x.publicacao_id}" title="Some da lista. Não mexe no marketplace.">Tirar da lista</button>` : ""}
          ${s.outra_conta ? `<span class="selo demo" title="${h(s.aviso || "")}">outra conta</span>` : ""}
          ${eTime() ? `<button type="button" class="sec pequeno icone-so" data-ma-modelo="${x.anuncio_id}" title="Aprovar como modelo: a IA usa este título e descrição como referência" aria-label="Aprovar como modelo">${ic("estrela", "p")}</button>` : ""}
          ${eEquipe() ? `<a class="botao sec pequeno icone-so" href="#/editor/${x.anuncio_id}" title="Abrir o rascunho" aria-label="Abrir o rascunho">${ic("lapis", "p")}</a>` : ""}
          ${urlSegura(s.link || x.link) ? `<a class="botao sec pequeno icone-so" href="${h(s.link || x.link)}" target="_blank" rel="noopener" title="Abrir no marketplace" aria-label="Abrir no marketplace">${ic("externo", "p")}</a>` : ""}</div></td></tr>`;
    }).join("")}</tbody></table></div>`
    : vazio("publicar", e.dados.itens.length ? "Nada com esses filtros" : "Nenhum anúncio publicado ainda",
      e.dados.itens.length ? "" : `Publique pelos <a href="#/rascunhos">Rascunhos</a>: marque os prontos e clique em Publicar selecionados.`);
  $$("[data-ma-marcar]").forEach((c) => (c.onchange = () => {
    const id = +c.dataset.maMarcar;
    c.checked ? e.marcados.add(id) : e.marcados.delete(id);
    desenharMeus();
  }));
  $$("[data-ma-acao]").forEach((b) => (b.onclick = () => {
    const acao = b.dataset.maAcao;
    if (CONFIRMA_ACAO[acao] && !confirm(CONFIRMA_ACAO[acao])) return;
    if (acao === "reativar" && !confirm("Reativar o anúncio? Ele volta a aparecer para os compradores na hora.")) return;
    comBotao(b, async () => {
      const r = await api(`/api/publicacoes/${b.dataset.pub}/acao`, { method: "POST", body: { acao } });
      toast(`${r.simulado ? "Demonstração: nada foi enviado. " : ""}Anúncio ${SITUACAO_PUB[r.status]?.[1] || r.status}.`);
      await lerAoVivoMeus(false);
    });
  }));
  $$("[data-ma-modelo]").forEach((b) => (b.onclick = () => aprovarComoModelo(+b.dataset.maModelo, b)));
  $$("[data-ma-preco]").forEach((b) => (b.onclick = () => {
    const x = e.dados.itens.find((i) => i.publicacao_id === +b.dataset.maPreco);
    precoEstoque(x, e.situacao[x.publicacao_id] || {}, () => lerAoVivoMeus(false));
  }));
  $$("[data-ma-tirar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Tirar este anúncio da lista? Nada é alterado no marketplace, e o rascunho volta para Em preparo se não tiver outro anúncio no ar.")) return;
    comBotao(b, async () => { await api(`/api/publicacoes/${b.dataset.maTirar}/tirar-da-lista`, { method: "POST" }); toast("Tirado da lista."); telaMeusAnuncios(); });
  }));
  if ($("#ma-todos")) $("#ma-todos").onchange = () => {
    lista.forEach((x) => ($("#ma-todos").checked ? e.marcados.add(x.publicacao_id) : e.marcados.delete(x.publicacao_id)));
    desenharMeus();
  };
}

function precoEstoque(x, s, depois) {
  const m = modal(`<h2>Preço e estoque</h2>
    <p>${selo(x.plataforma)} ${h(x.titulo || x.id_externo)}</p>
    ${s.variacoes ? `<div class="aviso amarelo pequeno">Este anúncio tem variações. Preço e estoque de variações são alterados no próprio marketplace.</div>` : ""}
    <div class="grade g2">
      <div class="campo"><label for="pe-preco">Preço (R$)</label><input id="pe-preco" type="number" min="0.01" step="0.01" value="${s.preco ?? x.preco ?? ""}"></div>
      <div class="campo"><label for="pe-estoque">Estoque</label><input id="pe-estoque" type="number" min="0" step="1" value="${s.estoque ?? ""}"></div>
    </div>
    <p class="pequeno suave">A mudança vale na hora para os compradores${x.demo || s.simulado ? " (este anúncio é de demonstração: nada é enviado)" : ""}.</p>
    <label class="confirmacao"><input type="checkbox" id="pe-conferi"> Conferi o novo preço e o estoque deste anúncio</label>
    <div class="linha" style="justify-content:flex-end"><button class="sec" data-fechar>Cancelar</button><button id="pe-salvar" disabled>Salvar no marketplace</button></div>`);
  $("#pe-conferi", m).onchange = (ev) => ($("#pe-salvar", m).disabled = !ev.target.checked);
  $("#pe-salvar", m).onclick = () => comBotao($("#pe-salvar", m), async () => {
    const lido = (id) => { const v = $(id, m).value.trim(); return v === "" ? null : Number(v); };
    const corpo = { preco: lido("#pe-preco"), estoque: lido("#pe-estoque") };
    if (corpo.preco === (s.preco ?? x.preco ?? null)) corpo.preco = null;
    if (corpo.estoque === (s.estoque ?? null)) corpo.estoque = null;
    if (corpo.preco === null && corpo.estoque === null) return toast("Nada mudou.", true);
    const r = await api(`/api/publicacoes/${x.publicacao_id}/preco-estoque`, { method: "POST", body: corpo });
    fecharModal();
    toast(`${r.simulado ? "Demonstração: nada foi enviado. " : ""}Preço e estoque atualizados.`);
    depois?.();
  });
}

function etiquetarMeus() {
  const e = estadoMeus;
  const m = modal(`<h2>${ic("lapis", "p")}Etiquetas de ${e.marcados.size} anúncio(s)</h2>
    <form id="ma-form-etq" class="pilha">
      <div><label for="ma-add">Adicionar etiqueta</label><input id="ma-add" maxlength="30" list="ma-etq-lista" placeholder="Ex.: campanha natal, revisar foto">
        <datalist id="ma-etq-lista">${e.dados.etiquetas.map((t) => `<option value="${h(t)}">`).join("")}</datalist></div>
      ${e.dados.etiquetas.length ? `<div><label>Remover etiqueta</label><div class="chips">${e.dados.etiquetas.map((t) =>
        `<label class="chip"><input type="checkbox" name="remover" value="${h(t)}"> ${h(t)}</label>`).join("")}</div></div>` : ""}
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Aplicar</button></div></form>`);
  $("#ma-form-etq", m).onsubmit = (ev) => {
    ev.preventDefault();
    comBotao($("#ma-form-etq button[type=submit]", m), async () => {
      await api("/api/meus-anuncios/etiquetas", { method: "PUT", body: { publicacao_ids: [...e.marcados],
        adicionar: $("#ma-add", m).value ? [$("#ma-add", m).value] : [], remover: $$("[name=remover]:checked", m).map((c) => c.value) } });
      fecharModal();
      toast("Etiquetas aplicadas.");
      telaMeusAnuncios();
    });
  };
}

const MAX_LOTE_PRECO = 50;
const QUEDA_ALERTA_PCT = 15;

function precoEstoqueEmLote(campo) {
  const e = estadoMeus;
  const alvos = [...e.marcados].map((id) => e.dados.itens.find((x) => x.publicacao_id === id))
    .filter((x) => x && (e.situacao[x.publicacao_id] || {}).edita_preco && !(e.situacao[x.publicacao_id] || {}).variacoes);
  const fora = e.marcados.size - alvos.length;
  if (!alvos.length) return toast("Nenhum dos selecionados aceita mudar preço ou estoque por aqui (confira a situação; anúncios com variações mudam no marketplace).", true);
  if (alvos.length > MAX_LOTE_PRECO) return toast(`Mude no máximo ${MAX_LOTE_PRECO} anúncios por vez.`, true);
  const preco = campo === "preco";
  const atual = (x) => { const s = e.situacao[x.publicacao_id] || {}; return preco ? s.preco ?? x.preco : s.estoque; };
  const m = modal(`<h2>${ic(preco ? "cifrao" : "caixa", "p")}${preco ? "Preço" : "Estoque"} de ${alvos.length} anúncio(s)</h2>
    ${fora ? `<div class="aviso amarelo pequeno">${fora} selecionado(s) ficam de fora: sem situação lida, com variações ou numa plataforma que não aceita a mudança por aqui.</div>` : ""}
    <div class="grade g2">
      ${preco ? `<div><label for="pl-modo">Como mudar</label><select id="pl-modo"><option value="pct">Percentual (+ sobe, − desce)</option><option value="valor">Mesmo preço para todos</option></select></div>
        <div><label for="pl-valor">Valor</label><input id="pl-valor" type="number" step="0.01" placeholder="ex.: -5 para baixar 5%"></div>`
        : `<div><label for="pl-modo">Como mudar</label><select id="pl-modo"><option value="valor">Mesmo estoque para todos</option><option value="soma">Somar (ou tirar) unidades</option></select></div>
        <div><label for="pl-valor">Valor</label><input id="pl-valor" type="number" step="1" placeholder="ex.: 10"></div>`}
    </div>
    <div id="pl-previa" style="margin-top:12px"></div>
    <label class="confirmacao" id="pl-conf-rotulo" hidden><input type="checkbox" id="pl-conferi"> <span id="pl-conf-texto"></span></label>
    <div class="linha" style="justify-content:flex-end;margin-top:12px"><button class="sec" data-fechar>Cancelar</button><button id="pl-aplicar" disabled>Aplicar no marketplace</button></div>`);
  m.classList.add("largo");
  let novos = [];
  const calcular = () => {
    const v = parseFloat($("#pl-valor", m).value);
    const modo = $("#pl-modo", m).value;
    if (Number.isNaN(v)) { $("#pl-previa", m).innerHTML = ""; $("#pl-conf-rotulo", m).hidden = true; $("#pl-aplicar", m).disabled = true; novos = []; return; }
    novos = alvos.map((x) => {
      const de = atual(x);
      let para = preco ? (modo === "pct" ? Math.round((de || 0) * (1 + v / 100) * 100) / 100 : v) : (modo === "soma" ? (de || 0) + Math.round(v) : Math.round(v));
      if (!preco) para = Math.max(0, para);
      const queda = preco && de ? ((de - para) / de) * 100 : 0;
      return { x, de, para, queda, invalido: preco ? !(para > 0) : para < 0 };
    });
    const grandes = novos.filter((n) => n.queda >= QUEDA_ALERTA_PCT).length;
    const prejuizo = novos.filter((n) => preco && n.x.margem_30d != null && n.x.margem_30d < Math.abs(Math.min(0, (n.para - n.de) / (n.de || 1) * 100))).length;
    $("#pl-previa", m).innerHTML = `<div class="tabela embutida" style="max-height:300px;overflow:auto"><table><thead><tr><th>Anúncio</th><th class="num">Agora</th><th class="num">Fica</th></tr></thead><tbody>
      ${novos.map((n) => `<tr><td>${selo(n.x.plataforma)} ${h(n.x.titulo)}${n.x.demo ? ' <span class="selo demo">demonstração</span>' : ""}</td>
        <td class="num">${preco ? brl(n.de) : n.de ?? "—"}</td>
        <td class="num ${n.invalido || n.queda >= QUEDA_ALERTA_PCT ? "ruim" : ""}"><b>${preco ? brl(n.para) : n.para}</b>${n.queda >= QUEDA_ALERTA_PCT ? `<div class="pequeno">−${Math.round(n.queda)}%</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      ${grandes ? `<div class="aviso amarelo pequeno">${grandes} anúncio(s) caem ${QUEDA_ALERTA_PCT}% ou mais. Queda brusca de preço pode virar prejuízo e chama a atenção do marketplace.</div>` : ""}
      ${prejuizo ? `<div class="aviso vermelho pequeno">${prejuizo} anúncio(s) podem passar a dar prejuízo pela margem dos últimos 30 dias.</div>` : ""}`;
    const invalidos = novos.some((n) => n.invalido);
    $("#pl-conf-rotulo", m).hidden = invalidos;
    $("#pl-conf-texto", m).textContent = `Conferi os ${novos.length} novos ${preco ? "preços" : "estoques"} de ${clienteAtual()?.nome || "este cliente"}${grandes ? ", inclusive as quedas grandes" : ""}`;
    $("#pl-conferi", m).checked = false;
    $("#pl-aplicar", m).disabled = true;
  };
  $("#pl-valor", m).oninput = calcular;
  $("#pl-modo", m).onchange = calcular;
  $("#pl-conferi", m).onchange = (ev) => ($("#pl-aplicar", m).disabled = !ev.target.checked || !novos.length);
  $("#pl-aplicar", m).onclick = () => comBotao($("#pl-aplicar", m), async () => {
    let ok = 0;
    const falhas = [];
    for (const n of novos) {
      if (n.para === n.de) continue;
      try {
        await api(`/api/publicacoes/${n.x.publicacao_id}/preco-estoque`, { method: "POST", body: preco ? { preco: n.para, estoque: null } : { preco: null, estoque: n.para } });
        ok++;
      } catch (err) { falhas.push(`${n.x.titulo}: ${err.message}`); }
      await new Promise((r) => setTimeout(r, 800));
    }
    fecharModal();
    toast(`${ok} anúncio(s) atualizado(s).${falhas.length ? ` ${falhas.length} falha(s): ${falhas.slice(0, 2).join("; ")}` : ""}`, !!falhas.length);
    await lerAoVivoMeus(false);
  });
}

async function acaoEmLoteMeus(acao) {
  const e = estadoMeus;
  const nome = acao === "pausar" ? "pausar" : "ativar";
  const nomeApi = acao === "pausar" ? "pausar" : "reativar";
  const alvo = [...e.marcados].filter((id) => (e.situacao[id]?.acoes || []).includes(nomeApi));
  if (!alvo.length) return toast(`Nenhum dos selecionados pode ${nome} agora (confira a situação de cada um).`, true);
  if (!confirm(`${acao === "pausar" ? "Pausar" : "Ativar"} ${alvo.length} anúncio(s) nos marketplaces? Os compradores veem a mudança na hora. Um por vez, com pausa entre eles.`)) return;
  let ok = 0;
  const falhas = [];
  for (const id of alvo) {
    const item = e.dados.itens.find((x) => x.publicacao_id === id);
    try {
      await api(`/api/publicacoes/${id}/acao`, { method: "POST", body: { acao: nomeApi } });
      ok++;
    } catch (err) {
      falhas.push(`${item.titulo}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  toast(`${ok} anúncio(s) ${acao === "pausar" ? "pausado(s)" : "ativado(s)"}.${falhas.length ? ` ${falhas.length} falha(s).` : ""}`, !!falhas.length);
  telaMeusAnuncios();
}
