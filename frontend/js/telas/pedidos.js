"use strict";

const STATUS_PEDIDO = { pendente: ["neutro", "Pendente"], andamento: ["azul", "Em andamento"], rascunho_pronto: ["demo", "Rascunho pronto"],
  publicado: ["ok", "Publicado"], problema: ["erro", "Com problema"] };
const seloPedido = (p) => `<span class="selo ${STATUS_PEDIDO[p.status]?.[0] || "neutro"}">${STATUS_PEDIDO[p.status]?.[1] || h(p.status)}</span>`
  + (p.atrasado ? ' <span class="selo erro">atrasado</span>' : p.parado ? ' <span class="selo demo">parado</span>' : "");

function legendaHtml(texto) {
  const linhas = h(texto || "").split(/\r?\n/);
  let html = "", lista = false;
  for (const bruta of linhas) {
    const linha = bruta.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const item = linha.match(/^\s*(?:-|•|\*)\s+(.*)$/);
    if (item) { if (!lista) { html += "<ul>"; lista = true; } html += `<li>${item[1]}</li>`; continue; }
    if (lista) { html += "</ul>"; lista = false; }
    html += linha.trim() ? `<p>${linha}</p>` : "";
  }
  return (lista ? html + "</ul>" : html) || '<p class="suave">Sem instruções.</p>';
}

function linhaPedido(p) {
  return `<a class="lista-item linha-pedido" href="#/pedidos/${p.id}">
    <div class="info"><b>#${p.id} · ${h(p.resumo || "(sem descrição)")}</b>
      <span class="pequeno suave">${h(p.cliente)} · ${p.marketplaces.map((m) => PLAT[m]?.nome || m).join(", ")} · ${p.quantidade} anúncio(s)
        · ${p.operador ? h(p.operador) : "sem operador"}${p.prazo ? ` · prazo ${dataDia(p.prazo)}` : ""}</span></div>
    ${seloPedido(p)}</a>`;
}

const estadoPedidos = { aba: null, cliente: "" };

async function telaPedidos(param) {
  if (+param) return telaPedido(+param);
  const papel = estado.usuario.papel;
  const pede = papel !== "operador";
  const abas = papel === "operador" ? [["meus", "Meus pedidos"], ["abertos", "Abertos da equipe"], ["publicado", "Publicados"]]
    : [["abertos", "Abertos"], ["painel", "Painel"], ["publicado", "Publicados"], ["todos", "Todos"]];
  if (!abas.some(([k]) => k === estadoPedidos.aba)) estadoPedidos.aba = abas[0][0];
  const ativos = estado.usuario.clientes.filter((c) => c.ativo);
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Pedidos de anúncio</h1>
    <div class="suave">${pede ? "Peça anúncios ao operador: cliente, marketplaces, produto e as instruções de como publicar. Quando o anúncio é publicado, o pedido fecha sozinho."
      : "Os anúncios que o consultor pediu. Abra o pedido, leia as instruções e clique em Começar: o rascunho já nasce ligado ao pedido."}</div></div>
    <div class="linha"><select id="pd-cliente" aria-label="Cliente" style="width:auto"><option value="">Todos os clientes</option>
      ${ativos.map((c) => `<option value="${c.id}" ${String(c.id) === estadoPedidos.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select>
      ${pede ? `<button type="button" id="pd-novo">${ic("mais", "p")}Novo pedido</button>` : ""}</div></div>
  <div class="abas" id="pd-abas">${abas.map(([k, n]) => `<button type="button" data-aba="${k}" class="${estadoPedidos.aba === k ? "ativa" : ""}">${n}</button>`).join("")}</div>
  <div id="pd-corpo"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  $$("#pd-abas [data-aba]").forEach((b) => (b.onclick = () => { estadoPedidos.aba = b.dataset.aba; telaPedidos(); }));
  $("#pd-cliente").onchange = (e) => { estadoPedidos.cliente = e.target.value; telaPedidos(); };
  if ($("#pd-novo")) $("#pd-novo").onclick = () => formPedido(null, () => telaPedidos());
  const corpo = $("#pd-corpo");
  if (estadoPedidos.aba === "painel") {
    const p = await api("/api/pedidos/painel");
    const tabela = (titulo, linhas) => `<section class="cartao"><h2>${titulo}</h2>${linhas.length ? `<div class="tabela embutida"><table><thead><tr><th>Nome</th>
      <th class="num">Em aberto</th><th class="num">Atrasados</th><th class="num">Com problema</th><th class="num">Publicados 30 d</th></tr></thead><tbody>
      ${linhas.map((g) => `<tr><td><b>${h(g.nome)}</b></td><td class="num">${numero(g.abertos)}</td><td class="num ${g.atrasados ? "ruim" : ""}">${numero(g.atrasados)}</td>
        <td class="num">${numero(g.por_status.problema || 0)}</td><td class="num">${numero(g.publicados_30d)}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="suave pequeno">Nenhum pedido ainda.</p>'}</section>`;
    corpo.innerHTML = `<div class="grade g4">
        <div class="cartao kpi-bloco"><span class="rotulo">Em aberto</span><div class="valor">${numero(p.totais.abertos)}</div></div>
        <div class="cartao kpi-bloco"><span class="rotulo">Atrasados</span><div class="valor ${p.totais.atrasados ? "negativo" : ""}">${numero(p.totais.atrasados)}</div></div>
        <div class="cartao kpi-bloco"><span class="rotulo">Com problema</span><div class="valor">${numero(p.totais.problema)}</div></div>
        <div class="cartao kpi-bloco"><span class="rotulo">Publicados em 30 dias</span><div class="valor">${numero(p.totais.publicados_30d)}</div></div></div>
      <section class="cartao" style="margin-top:16px"><h2>${ic("alerta", "p")}Atrasados</h2>
        ${p.atrasados.length ? p.atrasados.map(linhaPedido).join("") : '<p class="suave pequeno">Nenhum pedido atrasado.</p>'}</section>
      <div class="grade g2" style="margin-top:16px;align-items:start">${tabela("Por operador", p.por_operador)}${tabela("Por cliente", p.por_cliente)}</div>`;
    return;
  }
  const qs = new URLSearchParams();
  if (estadoPedidos.aba === "meus") { qs.set("meus", "true"); qs.set("status", "abertos"); }
  else if (estadoPedidos.aba !== "todos") qs.set("status", estadoPedidos.aba);
  if (estadoPedidos.cliente) qs.set("cliente_id", estadoPedidos.cliente);
  const lista = await api("/api/pedidos?" + qs);
  corpo.innerHTML = `<div class="cartao">${lista.length ? lista.map(linhaPedido).join("")
    : vazio("pedido", estadoPedidos.aba === "publicado" ? "Nenhum pedido publicado ainda" : "Nenhum pedido aqui",
      pede ? "Clique em Novo pedido para passar um anúncio ao operador." : "Quando o consultor pedir um anúncio para você, ele aparece aqui.")}</div>`;
}

async function telaPedido(id) {
  const p = await api("/api/pedidos/" + id);
  const papel = estado.usuario.papel;
  const responsavel = papel === "admin" || (papel === "operador" && p.operador_id === estado.usuario.id);
  const pede = papel !== "operador";
  const fechado = p.status === "publicado";
  $("#tela").innerHTML = `
  <div class="topo"><div><a href="#/pedidos" class="pequeno">${ic("voltar", "p")} Pedidos</a>
    <h1>Pedido #${p.id} · ${h(p.cliente)}</h1>
    <div class="linha" style="gap:8px">${seloPedido(p)}${p.marketplaces.map((m) => selo(m)).join("")}</div></div>
    <div class="linha">${pede && !fechado ? `<button type="button" class="sec" id="pp-editar">${ic("lapis", "p")}Editar</button>` : ""}
      ${responsavel && !fechado && !p.rascunhos.length ? `<button type="button" id="pp-comecar">${ic("play", "p")}Começar</button>` : ""}
      ${responsavel && !fechado && p.rascunhos.length && p.status !== "rascunho_pronto" ? `<button type="button" class="sec" id="pp-pronto">${ic("checar", "p")}Rascunho pronto</button>` : ""}</div></div>
  ${p.status === "problema" && p.motivo ? `<div class="aviso vermelho">${ic("alerta", "p")} <b>Problema na publicação:</b> ${h(p.motivo)}</div>` : ""}
  <div class="pedido-grade">
    <div class="pilha">
      <section class="cartao"><h2>${ic("pacote", "p")}Produto</h2>
        ${p.produto_link ? `<p><b>Link:</b> ${urlSegura(p.produto_link) ? `<a href="${h(p.produto_link)}" target="_blank" rel="noopener noreferrer">${h(p.produto_link)} ${ic("externo", "p")}</a>` : h(p.produto_link)}</p>` : ""}
        ${p.produto_texto ? `<div class="pequeno" style="white-space:pre-wrap">${h(p.produto_texto)}</div>` : ""}
        <dl class="pedido-dados">
          <div><dt>Quantidade</dt><dd>${p.quantidade} anúncio(s)</dd></div>
          <div><dt>Prazo</dt><dd class="${p.atrasado ? "ruim" : ""}">${p.prazo ? dataDia(p.prazo) : "sem prazo"}</dd></div>
          <div><dt>Operador</dt><dd>${h(p.operador || "—")}</dd></div>
          <div><dt>Pedido por</dt><dd>${h(p.criado_por || "—")} · ${data(p.criado_em)}</dd></div>
        </dl></section>
      <section class="cartao"><h2>${ic("rascunhos", "p")}Rascunhos deste pedido <span class="suave pequeno">${p.publicados}/${p.quantidade} no ar</span></h2>
        ${p.rascunhos.length ? p.rascunhos.map((a) => `<div class="lista-item"><div class="info"><b>${h(a.titulo || "(sem título)")}</b></div>${seloStatus(a.status)}
          ${eEquipe() ? `<a class="botao sec pequeno" href="#/editor/${a.id}" data-cliente="${p.cliente_id}">${ic("lapis", "p")}Abrir</a>` : ""}</div>`).join("")
          : `<p class="suave pequeno">${responsavel ? "Clique em <b>Começar</b>: o rascunho é criado já ligado a este pedido (cópia do link do Mercado Livre quando houver)." : "O operador ainda não começou."}</p>`}
        ${responsavel && !fechado && p.rascunhos.length && p.rascunhos.length < p.quantidade ? `<button type="button" class="sec pequeno" id="pp-mais">${ic("mais", "p")}Criar mais um rascunho</button>` : ""}
      </section>
    </div>
    <aside class="cartao legenda-pedido" aria-label="Instruções do pedido"><h2>${ic("texto", "p")}Instruções</h2><div class="legenda-texto">${legendaHtml(p.legenda)}</div></aside>
  </div>`;
  $$("[data-cliente]").forEach((a) => (a.onclick = () => trocarCliente(+a.dataset.cliente, { navegar: false })));
  const comecar = (botao) => comBotao(botao, async () => {
    const r = await api(`/api/pedidos/${p.id}/comecar`, { method: "POST" });
    if (r.aviso) toast(r.aviso, true); else toast("Rascunho criado e ligado ao pedido.");
    trocarCliente(p.cliente_id, { navegar: false });
    location.hash = "#/editor/" + r.anuncio_id;
  });
  if ($("#pp-comecar")) $("#pp-comecar").onclick = () => comecar($("#pp-comecar"));
  if ($("#pp-mais")) $("#pp-mais").onclick = () => comecar($("#pp-mais"));
  if ($("#pp-pronto")) $("#pp-pronto").onclick = () => comBotao($("#pp-pronto"), async () => {
    await api(`/api/pedidos/${p.id}/pronto`, { method: "POST" });
    toast("Pedido marcado como rascunho pronto. Quem pediu foi avisado.");
    telaPedido(p.id);
  });
  if ($("#pp-editar")) $("#pp-editar").onclick = () => formPedido(p, () => telaPedido(p.id));
}

function inserirMarcacao(campo, tipo) {
  const ini = campo.selectionStart, fim = campo.selectionEnd, v = campo.value;
  if (tipo === "negrito") {
    const sel = v.slice(ini, fim) || "texto";
    campo.value = `${v.slice(0, ini)}**${sel}**${v.slice(fim)}`;
    campo.setSelectionRange(ini + 2, ini + 2 + sel.length);
  } else {
    const comeco = v.lastIndexOf("\n", ini - 1) + 1;
    campo.value = `${v.slice(0, comeco)}- ${v.slice(comeco)}`;
    campo.setSelectionRange(ini + 2, fim + 2);
  }
  campo.focus();
  campo.dispatchEvent(new Event("input"));
}

async function formPedido(p, depois) {
  const ativos = estado.usuario.clientes.filter((c) => c.ativo);
  const clienteId = p?.cliente_id || estado.clienteId || ativos[0]?.id;
  if (!clienteId) return toast("Nenhum cliente disponível para pedir anúncio.", true);
  const m = modal(`<h2>${ic("pedido", "p")}${p ? `Editar pedido #${p.id}` : "Novo pedido de anúncio"}</h2>
    <form id="f-pedido" class="pilha">
      <div class="grade g2">
        <div><label for="fp-cliente">Cliente</label><select id="fp-cliente" ${p ? "disabled" : ""}>${ativos.map((c) => `<option value="${c.id}" ${c.id === clienteId ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select></div>
        <div><label for="fp-operador">Operador responsável</label><select id="fp-operador" required><option value="">Carregando…</option></select></div>
      </div>
      <div><label>Marketplaces</label><div class="chips" id="fp-plats">${Object.entries(PLAT).map(([k, x]) => {
        const marcado = p ? p.marketplaces.includes(k) : k === "mercadolivre";
        return `<label class="chip ${marcado ? "marcado" : ""}"><input type="checkbox" value="${k}" ${marcado ? "checked" : ""}> ${x.nome}</label>`; }).join("")}</div></div>
      <div><label for="fp-link">Produto por link</label><input id="fp-link" type="url" maxlength="1000" placeholder="https://www.mercadolivre.com.br/… (copiado automaticamente quando for do Mercado Livre)" value="${h(p?.produto_link || "")}"></div>
      <div><label for="fp-texto">ou produto por texto</label><textarea id="fp-texto" maxlength="5000" rows="3" placeholder="Nome do produto, marca, modelo, medidas, o que vem na caixa…">${h(p?.produto_texto || "")}</textarea></div>
      <div class="grade g2">
        <div><label for="fp-qtd">Quantidade de anúncios</label><input id="fp-qtd" type="number" min="1" max="50" value="${p?.quantidade || 1}" required></div>
        <div><label for="fp-prazo">Prazo</label><input id="fp-prazo" type="date" value="${p?.prazo || ""}"></div>
      </div>
      <div><div class="linha entre"><label for="fp-legenda" style="margin:0">Legenda: como e o que fazer na publicação</label>
        <div class="linha" style="gap:4px"><button type="button" class="sec pequeno" data-marca="negrito" title="Negrito"><b>N</b></button>
          <button type="button" class="sec pequeno" data-marca="lista" title="Item de lista">• Lista</button></div></div>
        <textarea id="fp-legenda" maxlength="10000" rows="8" placeholder="Ex.: **Use** as fotos que o cliente mandou no drive&#10;- título com a capacidade em litros&#10;- anúncio Premium com frete grátis">${h(p?.legenda || "")}</textarea>
        <div class="pequeno suave">Use **texto** para negrito e comece a linha com "- " para lista.</div>
        <div class="legenda-previa legenda-texto" id="fp-previa"></div></div>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button>
        <button type="submit">${p ? "Salvar" : "Criar pedido"}</button></div>
    </form>`);
  m.classList.add("largo");
  const leg = $("#fp-legenda", m);
  const previa = () => ($("#fp-previa", m).innerHTML = leg.value.trim() ? legendaHtml(leg.value) : "");
  leg.oninput = previa;
  previa();
  $$("[data-marca]", m).forEach((b) => (b.onclick = () => inserirMarcacao(leg, b.dataset.marca)));
  $$("#fp-plats input", m).forEach((i) => (i.onchange = () => i.parentElement.classList.toggle("marcado", i.checked)));
  const carregarOperadores = async () => {
    const sel = $("#fp-operador", m);
    const lista = await api(`/api/pedidos/operadores?cliente_id=${$("#fp-cliente", m).value}`);
    sel.innerHTML = lista.length ? `<option value="">Escolha…</option>` + lista.map((o) => `<option value="${o.id}" ${o.id === p?.operador_id ? "selected" : ""}>${h(o.nome)}${o.papel === "admin" ? " (administrador)" : ""}</option>`).join("")
      : `<option value="">Nenhum operador atende este cliente</option>`;
    if (lista.length === 1 && !p) sel.value = lista[0].id;
  };
  $("#fp-cliente", m).onchange = carregarOperadores;
  await carregarOperadores();
  $("#f-pedido", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-pedido button[type=submit]", m), async () => {
      const corpo = { marketplaces: $$("#fp-plats input:checked", m).map((i) => i.value), produto_link: $("#fp-link", m).value.trim(),
        produto_texto: $("#fp-texto", m).value.trim(), quantidade: +$("#fp-qtd", m).value || 1, legenda: leg.value,
        operador_id: +$("#fp-operador", m).value || null };
      if (!corpo.operador_id) return toast("Escolha o operador responsável.", true);
      if (!corpo.marketplaces.length) return toast("Escolha pelo menos um marketplace.", true);
      const prazo = $("#fp-prazo", m).value;
      const r = p ? await api(`/api/pedidos/${p.id}`, { method: "PATCH", body: { ...corpo, prazo: prazo || null, sem_prazo: !prazo } })
        : await api("/api/pedidos", { method: "POST", body: { ...corpo, cliente_id: +$("#fp-cliente", m).value, prazo: prazo || null } });
      fecharModal();
      toast(p ? "Pedido atualizado." : `Pedido #${r.id} criado. ${h(r.operador)} foi avisado.`);
      depois?.(r);
    });
  };
}
