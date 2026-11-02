"use strict";

const ROTULO_STATUS = { rascunho: ["neutro", "Rascunho"], publicado: ["ok", "Publicado"], parcial: ["demo", "Parcial"],
  erro: ["erro", "Com erro"], simulado: ["demo", "Simulado"] };
const seloStatus = (s) => `<span class="selo ${ROTULO_STATUS[s]?.[0] || "neutro"}">${ROTULO_STATUS[s]?.[1] || h(s)}</span>`;

const ABAS_RASCUNHO = [["preparo", "Em preparo", (a) => ["rascunho", "simulado"].includes(a.status) && !a.problema && a.via !== "extensao"],
  ["extensao", "Da extensão", (a) => ["rascunho", "simulado"].includes(a.status) && !a.problema && a.via === "extensao"],
  ["problema", "Com problema", (a) => a.problema], ["publicados", "Publicados", (a) => a.status === "publicado"]];

let _atualizarFila = null;
async function telaRascunhos(abaParam) {
  clearTimeout(_atualizarFila);
  const equipe = eEquipe();
  const [lista, lotes] = await Promise.all([api("/api/anuncios"), equipe ? api("/api/lotes").catch(() => []) : []]);
  if (equipe && !estado.regrasLote) estado.regrasLote = await api("/api/lotes/regras").catch(() => null);
  const regras = estado.regrasLote || { max_anuncios: 20, intervalo_s: 20, limite_diario: 50, parar_apos_falhas: 3 };
  const intervalo = regras.intervalo_s >= 60 ? `${Math.round(regras.intervalo_s / 60)} min` : `${Math.round(regras.intervalo_s)} s`;
  const dicaSel = `Marque os rascunhos prontos para publicar vários de uma vez (até ${regras.max_anuncios}).`;
  const [abaPedida, clientePedido] = String(abaParam || "").split("~");
  abaParam = abaPedida || undefined;
  if (clientePedido && +clientePedido !== estado.clienteId && (estado.usuario.clientes || []).some((c) => c.id === +clientePedido)) {
    trocarCliente(+clientePedido, { navegar: false });
    history.replaceState(null, "", "#/rascunhos/" + (abaParam || ""));
    return telaRascunhos(abaParam);
  }
  const cliente = clienteAtual();
  if (abaParam === "erro") abaParam = "problema";
  const aba = ABAS_RASCUNHO.some(([k]) => k === abaParam) ? abaParam : estado.abaRascunho || "preparo";
  estado.abaRascunho = aba;
  const filtro = ABAS_RASCUNHO.find(([k]) => k === aba)[2];
  const busca = (estado.buscaRascunho || "").toLowerCase();
  const visiveis = lista.filter((a) => filtro(a) && (!busca || (a.titulo || "").toLowerCase().includes(busca)));
  const fila = lotes.filter((l) => ["na_fila", "executando", "interrompido"].includes(l.status));
  const marcavel = equipe && aba !== "publicados";
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${equipe ? "Rascunhos" : "Anúncios da sua loja"}</h1>
    <div class="suave">${equipe ? `Anúncios de <b>${h(cliente?.nome)}</b> copiados ou criados. Marque os prontos e clique em <b>Publicar selecionados</b>;
      o que der errado vai para <b>Com problema</b> com o motivo, para corrigir e tentar de novo.`
      : "Tudo o que a equipe Monvatti preparou para a sua loja, com quem fez e em que pé está."}</div></div>
    ${equipe ? `<button id="novo">${ic("mais")}Criar do zero</button>` : ""}</div>
  ${fila.map((l) => {
    const feitos = l.total - l.contagem.pendente;
    const pct = l.total ? Math.round((feitos / l.total) * 100) : 0;
    return `<div class="cartao fila-rascunhos" style="margin-bottom:12px">
      <div class="linha entre"><div><b>${l.status === "interrompido" ? "Publicação parada" : "Publicando agora"}</b>
        <span class="pequeno suave"> · ${feitos}/${l.total} processado(s) · ${l.plataformas.map((p) => PLAT[p]?.nome || p).join(", ")} · por ${h(l.por)}</span></div>
        <div class="linha" style="flex-wrap:nowrap">
          ${l.status === "interrompido" ? `<button class="pequeno" data-retomar="${l.id}">Retomar</button>` : ""}
          <button class="sec pequeno" data-cancelar="${l.id}">Cancelar</button>
          <button class="sec pequeno" data-detalhe="${l.id}">${ic("olho", "p")}Detalhes</button></div></div>
      ${l.motivo ? `<div class="pequeno erro-texto" style="margin-top:4px">${ic("alerta", "p")} ${h(l.motivo)}</div>` : ""}
      <div class="barra" style="margin-top:8px"><i style="width:${Math.max(pct, 2)}%"></i></div>
      <div class="pequeno suave" style="margin-top:4px">Um anúncio por vez, com pausa entre eles, para o marketplace não ver uma rajada. Pode sair desta tela: a fila continua.</div></div>`;
  }).join("")}
  ${!equipe && lista.some((a) => a.aprovacao === "pendente") ? `<div class="aviso azul">${ic("aprovar", "p")}
    <b>${lista.filter((a) => a.aprovacao === "pendente").length} anúncio(s) aguardando a sua aprovação.</b>
    <a href="#/acompanhamento">Confira a conta de cada um e aprove vários de uma vez</a>. Nada é publicado sem o seu ok.</div>` : ""}
  <div class="abas">${ABAS_RASCUNHO.map(([k, n, f]) => `<button data-aba="${k}" class="${aba === k ? "ativa" : ""}">${n} (${lista.filter(f).length})</button>`).join("")}</div>
  ${marcavel && visiveis.length ? `<div class="barra-lote cartao">
    <label class="linha" style="margin:0;gap:8px"><input type="checkbox" id="sel-todos"> Selecionar todos</label>
    <span class="suave pequeno" id="sel-info">${dicaSel}</span>
    <button id="b-lote" disabled>${ic("publicar", "p")}Publicar selecionados</button>
    ${cliente?.exige_aprovacao ? `<button id="b-pedir-aprov" class="sec" disabled>${ic("aprovar", "p")}Pedir aprovação</button>` : ""}
    <button id="b-excluir" class="sec perigo-txt" disabled>${ic("lixo", "p")}Excluir selecionados</button>
    <span class="pequeno suave" style="flex-basis:100%">Travas: um anúncio por vez, ${intervalo} entre publicações reais, até ${regras.limite_diario} por conta em 24 h,
      para sozinho depois de ${regras.parar_apos_falhas} falhas seguidas ou se o Mercado Livre pausar um anúncio.</span></div>` : ""}
  <div class="cartao">
    ${lista.length > 8 ? `<input type="search" id="busca-rascunho" placeholder="Buscar pelo título…" value="${h(estado.buscaRascunho || "")}" style="max-width:340px;margin-bottom:8px">` : ""}
    ${visiveis.length ? visiveis.map((a) => `
    <div class="lista-item">
      ${marcavel ? `<input type="checkbox" class="sel-lote" value="${a.id}" aria-label="Selecionar ${h(a.titulo)}">` : ""}
      ${urlSegura(a.foto) ? `<img src="${h(a.foto)}" alt="" referrerpolicy="no-referrer">` : semFoto()}
      <div class="info"><b>${h(a.titulo || "(sem título)")}</b>
        <span class="pequeno suave">${brl(a.preco)} · ${a.via === "extensao" ? "copiado pela extensão Monvatti Pro" : a.origem && PLAT[a.origem] ? "copiado de " + PLAT[a.origem].nome : "criado manualmente"}
          ${a.link_origem && urlSegura(a.link_origem) ? ` · <a href="${h(a.link_origem)}" target="_blank" rel="noopener">anúncio original</a>` : ""}
          ${a.criado_por ? ` · por <b>${h(a.criado_por)}</b>` : ""} · salvo ${data(a.atualizado_em)}
          ${a.pedido_id && eTime() ? ` · <a href="#/pedidos/${a.pedido_id}">pedido #${a.pedido_id}</a>` : ""}</span>
        ${a.falha ? `<span class="pequeno erro-texto">${ic("alerta", "p")} <b>Por que falhou:</b> ${h(a.falha)}</span>` : ""}</div>
      ${seloAprovacao(a.aprovacao)}${seloStatus(a.status)}
      ${equipe ? `<div class="linha" style="flex-wrap:nowrap">
          <a class="botao sec pequeno" href="#/editor/${a.id}">${ic("lapis", "p")}${a.problema ? "Corrigir" : "Editar"}</a>
          ${a.problema ? `<button class="pequeno" data-tentar="${a.id}">${ic("trocar", "p")}Tentar de novo</button>` : ""}</div>`
        : `<button class="sec pequeno" data-ver="${a.id}">${ic("olho", "p")}Ver</button>`}
    </div>`).join("") : vazio("rascunhos", aba === "problema" ? "Nenhum rascunho com problema" : aba === "publicados" ? "Nada publicado ainda" : aba === "extensao" ? "Nenhum anúncio trazido pela extensão" : "Nenhum rascunho em preparo",
      aba === "extensao" ? "Na página de um anúncio do Mercado Livre, use Cadastrar no Replique na extensão Monvatti Pro: o anúncio chega aqui." : aba !== "preparo" ? "" : equipe ? `<a href="#/pesquisar">Pesquise um produto</a> e copie um anúncio, ou comece um <a href="#/pedidos">pedido de anúncio</a>.` : "Assim que a equipe começar, os anúncios aparecem aqui.")}</div>`;
  $$("[data-aba]").forEach((b) => (b.onclick = () => { estado.abaRascunho = b.dataset.aba; telaRascunhos(b.dataset.aba); }));
  const campoBusca = $("#busca-rascunho");
  if (campoBusca) campoBusca.oninput = () => {
    estado.buscaRascunho = campoBusca.value;
    clearTimeout(telaRascunhos._t);
    telaRascunhos._t = setTimeout(async () => { await telaRascunhos(aba); const c = $("#busca-rascunho"); c?.focus(); c?.setSelectionRange(c.value.length, c.value.length); }, 300);
  };
  const novo = $("#novo");
  if (novo) novo.onclick = () => comBotao(novo, async () => {
    const a = await api("/api/anuncios", { method: "POST", body: { titulo: "Novo produto" } });
    location.hash = "#/editor/" + a.id;
  });
  $$("[data-ver]").forEach((b) => (b.onclick = () => comBotao(b, () => verAnuncio(+b.dataset.ver))));
  $$("[data-tentar]").forEach((b) => (b.onclick = () => {
    const a = lista.find((x) => x.id === +b.dataset.tentar);
    abrirLote([a.id], a.plataformas_falha);
  }));
  $$("[data-detalhe]").forEach((b) => (b.onclick = () => comBotao(b, () => detalheLote(+b.dataset.detalhe))));
  $$("[data-cancelar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Cancelar esta publicação? O que já foi publicado continua no ar; o restante não será enviado.")) return;
    comBotao(b, async () => { await api(`/api/lotes/${b.dataset.cancelar}/cancelar`, { method: "POST" }); telaRascunhos(aba); });
  }));
  $$("[data-retomar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Retomar? Confira antes o motivo da parada: a fila continua de onde parou.")) return;
    comBotao(b, async () => { await api(`/api/lotes/${b.dataset.retomar}/retomar`, { method: "POST" }); telaRascunhos(aba); });
  }));
  const selecionados = () => $$(".sel-lote:checked").map((c) => +c.value);
  const atualizar = () => {
    const n = selecionados().length;
    $("#b-lote").disabled = !n;
    $("#b-lote").innerHTML = `${ic("publicar", "p")}Publicar selecionados${n ? ` (${n})` : ""}`;
    $("#b-excluir").disabled = !n;
    const bAprov = $("#b-pedir-aprov");
    if (bAprov) { bAprov.disabled = !n; bAprov.innerHTML = `${ic("aprovar", "p")}Pedir aprovação${n ? ` (${n})` : ""}`; }
    $("#b-excluir").innerHTML = `${ic("lixo", "p")}Excluir selecionados${n ? ` (${n})` : ""}`;
    $("#sel-info").textContent = n > regras.max_anuncios ? `${n} selecionados: o máximo de uma vez é ${regras.max_anuncios}.`
      : n ? `${n} rascunho(s) selecionado(s).` : dicaSel;
    $("#sel-info").classList.toggle("aviso-texto", n > regras.max_anuncios);
  };
  $$(".sel-lote").forEach((c) => (c.onchange = atualizar));
  const todos = $("#sel-todos");
  if (todos) todos.onchange = () => { $$(".sel-lote").forEach((c) => (c.checked = todos.checked)); atualizar(); };
  const bLote = $("#b-lote");
  if (bLote) bLote.onclick = () => abrirLote(selecionados());
  const bPedirAprov = $("#b-pedir-aprov");
  if (bPedirAprov) bPedirAprov.onclick = () => comBotao(bPedirAprov, async () => {
    const r = await api("/api/anuncios/aprovacao/solicitar", { method: "POST", body: { ids: selecionados() } });
    if (r.faltando.length) modal(`<h2>${r.pedidos} pedido(s) enviado(s)</h2>
      <p class="pequeno suave">Estes ficaram de fora. Abra no editor, complete e peça de novo:</p>
      ${r.faltando.map((f) => `<div class="lista-item"><div class="info"><b>${h(f.titulo || "(sem título)")}</b><span class="pequeno erro-texto">${h(f.motivo)}</span></div>
        <a class="botao sec pequeno" href="#/editor/${f.id}" data-fechar>${ic("lapis", "p")}Abrir</a></div>`).join("")}
      <div class="linha" style="justify-content:flex-end;margin-top:12px"><button data-fechar>Fechar</button></div>`);
    else toast(`${r.pedidos} pedido(s) de aprovação enviado(s) com a conta de cada anúncio.`);
    telaRascunhos(aba);
  });
  const bExcluir = $("#b-excluir");
  if (bExcluir) bExcluir.onclick = () => {
    const ids = selecionados();
    if (!ids.length || !confirm(`Excluir ${ids.length} rascunho(s) de ${cliente?.nome}? Eles saem da lista de rascunhos. Nada muda nos marketplaces.`)) return;
    comBotao(bExcluir, async () => {
      const r = await api("/api/anuncios/excluir", { method: "POST", body: { ids } });
      toast(`${r.excluidos} rascunho(s) excluído(s).`);
      telaRascunhos(aba);
    });
  };
  if (fila.some((l) => l.status !== "interrompido")) {
    _atualizarFila = setTimeout(() => { if (estado._rotaAtual === "rascunhos" && $("#modal").hidden) telaRascunhos(aba); }, 3000);
  }
}

const SITUACAO = { pronto: ["ok", "pronto"], bloqueado: ["erro", "bloqueado"], pulado: ["demo", "pulado"] };
const STATUS_LOTE = { na_fila: ["neutro", "na fila"], executando: ["neutro", "publicando"], concluido: ["ok", "concluído"],
  interrompido: ["erro", "interrompido"], cancelado: ["demo", "cancelado"] };
const STATUS_ITEM = { pendente: ["neutro", "aguardando"], publicado: ["ok", "publicado"], simulado: ["demo", "simulado"],
  falhou: ["erro", "falhou"], pulado: ["demo", "pulado"] };
const seloDe = (mapa, s) => `<span class="selo ${mapa[s]?.[0] || "neutro"}">${mapa[s]?.[1] || h(s)}</span>`;

function abrirLote(ids, plataformas = null) {
  const maximo = estado.regrasLote?.max_anuncios || 20;
  if (ids.length > maximo) return toast(`O máximo é ${maximo} rascunhos de uma vez. Desmarque alguns.`, true);
  let destinos = ["mercadolivre"];
  try { destinos = JSON.parse(localStorage.getItem("rpq_destinos") || '["mercadolivre"]'); } catch {}
  if (plataformas?.length) destinos = plataformas;
  const m = modal(`<h2>${ic("publicar", "p")}Publicar ${ids.length} rascunho(s)</h2>
    <div class="aviso azul">${ic("loja", "p")} Cliente: <b>${h(clienteAtual()?.nome)}</b></div>
    <label>Publicar em</label>
    <div class="chips" id="lote-plats">${Object.entries(PLAT).map(([k, p]) => `<label class="chip ${destinos.includes(k) ? "marcado" : ""}">
      <input type="checkbox" value="${k}" ${destinos.includes(k) ? "checked" : ""}> ${p.nome}</label>`).join("")}</div>
    <p class="pequeno suave" style="margin-top:12px">Primeiro o Replique confere tudo <b>sem publicar</b>. Depois os anúncios entram numa fila e são
      publicados <b>um por vez</b>, com intervalo, para não parecer publicação em rajada.</p>
    <div id="lote-previa"></div>
    <div class="linha" id="lote-rodape" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button>
      <button id="lote-conferir">${ic("checar", "p")}Conferir antes de publicar</button></div>`);
  $$("#lote-plats input", m).forEach((i) => (i.onchange = () => { i.parentElement.classList.toggle("marcado", i.checked); $("#lote-previa", m).innerHTML = ""; }));
  const plats = () => $$("#lote-plats input:checked", m).map((i) => i.value);
  $("#lote-conferir", m).onclick = () => comBotao($("#lote-conferir", m), async () => {
    if (!plats().length) return toast("Escolha pelo menos uma plataforma.", true);
    const p = await api("/api/lotes/previa", { method: "POST", body: { anuncio_ids: ids, plataformas: plats() } });
    desenharPrevia(m, p, ids);
  });
}

function desenharPrevia(m, p, ids) {
  const plats = Object.keys(p.contas);
  const reais = plats.filter((k) => p.contas[k].real);
  const total = Object.values(p.prontos).reduce((a, b) => a + b, 0);
  $("#lote-previa", m).innerHTML = `
    <h3 style="margin-top:14px">Contas</h3>
    ${plats.map((k) => { const c = p.contas[k]; return `<div class="aviso ${c.real ? "azul" : "amarelo"} pequeno">${selo(k)}
      ${c.real ? `Conta <b>${h(c.apelido)}</b> · ${c.publicadas_24h} publicada(s) nas últimas 24 h de ${c.limite_24h} permitidas`
        : "Modo demonstração: nada será enviado (" + h(c.aviso.replace("Modo demonstração: ", "").replace(/\.$/, "")) + ")"}</div>`; }).join("")}
    ${p.alertas.map((a) => `<div class="aviso amarelo pequeno">${ic("alerta", "p")} ${h(a)}</div>`).join("")}
    <h3 style="margin-top:14px">Conferência <span class="suave pequeno">(${total} publicação(ões) prontas)</span></h3>
    <div class="tabela embutida"><table><thead><tr><th>Rascunho</th>${plats.map((k) => `<th>${h(PLAT[k].nome)}</th>`).join("")}</tr></thead><tbody>
      ${p.itens.map((i) => `<tr><td><b>${h(i.titulo || "(sem título)")}</b>${i.preco != null ? `<div class="pequeno suave">${brl(i.preco)}</div>` : ""}</td>
        ${plats.map((k) => { const s = i.plataformas[k]; return `<td>${seloDe(SITUACAO, s.situacao)}
          ${s.erros.length ? `<div class="pequeno" style="color:var(--vermelho);margin-top:4px">${s.erros.map(h).join("<br>")}</div>` : ""}
          ${s.situacao === "pronto" && s.avisos.length ? `<div class="pequeno suave" style="margin-top:4px" title="${h(s.avisos.join("\n"))}">${s.avisos.length} aviso(s)</div>` : ""}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div>
    <p class="pequeno suave">Travas: até ${p.max_anuncios} rascunhos de uma vez · ${p.intervalo_s} s entre publicações reais · para sozinho após 3 falhas seguidas ou se o ML pausar um anúncio · pula duplicados.</p>
    ${reais.length ? `<label class="confirmacao"><input type="checkbox" id="lote-conferi">
      Conferi que ${reais.map((k) => `<b>${h(p.contas[k].apelido)}</b> (${h(PLAT[k].nome)})`).join(" e ")} ${reais.length > 1 ? "são contas" : "é a conta"} de <b>${h(p.cliente.nome)}</b></label>` : ""}`;
  const rodape = $("#lote-rodape", m);
  rodape.innerHTML = `<button class="sec" data-fechar>Cancelar</button><button id="lote-criar" ${total ? "" : "disabled"}>${ic("publicar", "p")}Colocar ${total} na fila</button>`;
  const conferi = $("#lote-conferi", m), criar = $("#lote-criar", m);
  if (conferi) { criar.disabled = true; conferi.onchange = () => (criar.disabled = !conferi.checked || !total); }
  criar.onclick = () => comBotao(criar, async () => {
    const lote = await api("/api/lotes", { method: "POST", body: { anuncio_ids: ids, plataformas: plats, confirmado: !!conferi?.checked } });
    fecharModal();
    toast(`${lote.total} publicação(ões) na fila. Acompanhe aqui em Rascunhos.`);
    telaRascunhos("preparo");
  });
}

async function detalheLote(id) {
  const l = await api("/api/lotes/" + id);
  modal(`<div class="linha entre"><h2 style="margin:0">Publicação #${l.id}</h2>${seloDe(STATUS_LOTE, l.status)}</div>
    <p class="suave pequeno">por ${h(l.por)} · ${data(l.criado_em)}${l.concluido_em ? " · terminou " + data(l.concluido_em) : ""}</p>
    ${l.motivo ? `<div class="aviso vermelho pequeno">${h(l.motivo)}</div>` : ""}
    <div class="tabela embutida"><table><thead><tr><th>#</th><th>Rascunho</th><th>Plataforma</th><th>Situação</th></tr></thead><tbody>
      ${l.itens.map((i, n) => `<tr><td class="pequeno suave">${n + 1}</td>
        <td><a href="#/editor/${i.anuncio_id}" data-fechar>${h(i.titulo || "(sem título)")}</a>${i.mensagem ? `<div class="pequeno suave">${h(i.mensagem)}</div>` : ""}</td>
        <td>${selo(i.plataforma)}</td><td>${seloDe(STATUS_ITEM, i.status)}${i.processado_em ? `<div class="pequeno suave">${data(i.processado_em)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
}

async function verAnuncio(id) {
  const [a, pubs] = await Promise.all([api("/api/anuncios/" + id), api(`/api/anuncios/${id}/publicacoes`)]);
  modal(`<div class="linha entre"><h2 style="margin:0">${h(a.titulo || "(sem título)")}</h2>${seloStatus(a.status)}</div>
    <p class="suave pequeno">${brl(a.preco)} · estoque ${a.estoque} · criado por ${h(a.criado_por || "—")} em ${data(a.criado_em)}
      ${a.atualizado_por ? ` · última edição de ${h(a.atualizado_por)}` : ""}</p>
    ${a.fotos.length ? `<div class="fotos" style="margin:12px 0">${a.fotos.slice(0, 8).map((f) => urlSegura(f)
      ? `<div class="f"><img src="${h(f)}" alt="" referrerpolicy="no-referrer"></div>` : "").join("")}</div>` : ""}
    ${a.descricao ? `<h3>Descrição</h3><div class="pequeno" style="white-space:pre-wrap;max-height:180px;overflow:auto">${h(a.descricao)}</div>` : ""}
    <h3 style="margin-top:14px">Publicações</h3>
    ${pubs.length ? pubs.map((p) => `<div class="lista-item" style="padding:8px 0">${selo(p.plataforma)}
        <div class="info pequeno"><b>${p.sucesso ? (p.demo ? "Simulado" : "Publicado") : "Não publicado"}</b>
          <span class="suave">${data(p.criada_em)} · por ${h(p.operador || "—")}${p.conta_apelido ? " · conta " + h(p.conta_apelido) : ""}</span></div>
        ${urlSegura(p.link) ? `<a class="botao sec pequeno" href="${h(p.link)}" target="_blank" rel="noopener">Abrir ${ic("externo", "p")}</a>` : ""}</div>`).join("")
      : `<p class="suave pequeno">Ainda não publicado.</p>`}
    ${a.aprovacao_conta ? `<h3 style="margin-top:14px">Quanto este anúncio rende por venda</h3>${contaAprovada(a.aprovacao_conta)}` : ""}
    ${a.aprovacao === "pendente" && estado.usuario.papel === "cliente" ? `<div class="cartao" style="margin-top:14px;background:var(--cartao-2)">
      <h3 style="margin-top:0">${ic("aprovar", "p")} Sua aprovação</h3>
      <p class="pequeno suave">A equipe preparou e precificou este anúncio para a sua loja. Se estiver tudo certo, aprove; se quiser rever algo, questione.</p>
      <textarea id="ap-nota" placeholder="O que quer questionar? (obrigatório para questionar)" style="min-height:70px"></textarea>
      <div class="linha" style="justify-content:flex-end;margin-top:8px"><button class="sec" id="ap-recusar">Questionar</button>
        <button id="ap-aprovar">${ic("aprovar", "p")}Aprovar anúncio</button></div></div>`
      : a.aprovacao ? `<p class="pequeno" style="margin-top:12px">${seloAprovacao(a.aprovacao)} ${a.aprovacao_nota ? h(a.aprovacao_nota) : ""}</p>` : ""}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
  const decidir = (decisao, botao) => comBotao(botao, async () => {
    await api(`/api/anuncios/${id}/aprovacao`, { method: "POST", body: { decisao, nota: $("#ap-nota")?.value || "" } });
    fecharModal();
    toast(decisao === "aprovar" ? "Anúncio aprovado. A equipe já pode publicar." : "Questionamento enviado à equipe.");
    roteador();
  });
  if ($("#ap-aprovar")) {
    $("#ap-aprovar").onclick = () => decidir("aprovar", $("#ap-aprovar"));
    $("#ap-recusar").onclick = () => decidir("recusar", $("#ap-recusar"));
  }
}

const APROVACAO = { pendente: ["neutro", "aguardando aprovação"], aprovado: ["ok", "aprovado pelo lojista"],
  recusado: ["erro", "questionado pelo lojista"] };
const seloAprovacao = (s) => (s && APROVACAO[s] ? `<span class="selo ${APROVACAO[s][0]}">${APROVACAO[s][1]}</span> ` : "");
const pctConta = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10).replace(".", ",") + "%");

function contaAprovada(c) {
  if (!c) return "";
  const linha = (rot, v, extra = "") => `<div class="calc-linha"><span>${rot}${extra ? ` <small class="suave">${extra}</small>` : ""}</span><b>${v}</b></div>`;
  return `<div class="calc-detalhe">
    ${linha("Preço de venda", brl(c.preco))}
    ${linha("Custo do produto", "− " + brl(c.custo))}
    ${linha(`Tarifa ML (${h(c.tipo_nome)})`, "− " + brl(c.tarifa), pctConta(c.tarifa_pct) + (c.taxa_fixa ? ` + ${brl(c.taxa_fixa)} fixa` : ""))}
    ${linha("Frete (parte do vendedor)", "− " + brl(c.frete))}
    ${linha("Imposto", c.imposto ? "− " + brl(c.imposto) : "Isento", c.imposto ? pctConta(c.imposto_pct) : "")}
    ${c.embalagem ? linha("Embalagem", "− " + brl(c.embalagem)) : ""}
    ${linha("Você recebe do Mercado Livre", brl(c.recebe))}
    ${linha("Lucro por venda", `<span class="${c.lucro < 0 ? "negativo" : "positivo"}">${brl(c.lucro)}</span>`)}
    ${linha("Margem", `<span class="${corMargem(c.margem_pct)}">${pctConta(c.margem_pct)}</span>`)}</div>`;
}

function desenharAprovacoes(alvo, lista, aoMudar) {
  if (!lista.length) { alvo.innerHTML = ""; return; }
  const comEmbalagem = lista.some((a) => a.conta?.embalagem);
  const celulas = (c) => !c ? `<td colspan="${comEmbalagem ? 9 : 8}" class="suave pequeno">A equipe ainda vai enviar a conta deste anúncio.</td>` : `
    <td class="num">${brl(c.preco)}</td><td class="num">${brl(c.custo)}</td>
    <td class="num">${brl(c.tarifa)}<br><small class="suave">${h(c.tipo_nome)} · ${pctConta(c.tarifa_pct)}</small></td>
    <td class="num">${brl(c.frete)}</td><td class="num">${brl(c.imposto)}</td>
    ${comEmbalagem ? `<td class="num">${brl(c.embalagem)}</td>` : ""}
    <td class="num">${brl(c.recebe)}</td>
    <td class="num"><b class="${c.lucro < 0 ? "negativo" : "positivo"}">${brl(c.lucro)}</b></td>
    <td class="num"><b class="${corMargem(c.margem_pct)}">${pctConta(c.margem_pct)}</b></td>`;
  alvo.innerHTML = `<section class="cartao" style="margin-bottom:16px;border-left:3px solid var(--azul)">
    <h2>${ic("aprovar", "p")}Aguardando a sua aprovação (${lista.length})</h2>
    <p class="pequeno suave">A equipe preparou e precificou estes anúncios. Confira quanto cada um rende por venda: aprove os que estiverem certos
      ou questione os que quiser rever. O anúncio só é publicado depois do seu ok.</p>
    <div class="barra-lote" style="margin:8px 0">
      <label class="linha" style="margin:0;gap:8px"><input type="checkbox" id="ap-todos"> Selecionar todos</label>
      <button id="ap-aprovar-sel" disabled>${ic("aprovar", "p")}Aprovar selecionados</button>
      <button id="ap-questionar-sel" class="sec" disabled>Questionar selecionados</button></div>
    <div class="tabela embutida"><table><thead><tr><th></th><th>Anúncio</th><th>Preço</th><th>Custo</th><th>Tarifa ML</th><th>Frete</th><th>Imposto</th>
      ${comEmbalagem ? "<th>Embalagem</th>" : ""}<th>Você recebe</th><th>Lucro</th><th>Margem</th></tr></thead><tbody>
      ${lista.map((a) => `<tr><td><input type="checkbox" class="ap-sel" value="${a.id}" aria-label="Selecionar ${h(a.titulo)}"></td>
        <td><div class="linha" style="flex-wrap:nowrap;gap:8px">${urlSegura(a.foto) ? `<img src="${h(a.foto)}" alt="" referrerpolicy="no-referrer" style="width:40px;height:40px;object-fit:cover;border-radius:6px">` : ""}
          <div><b>${h(a.titulo || "(sem título)")}</b><br><button type="button" class="sec pequeno" data-aprovar="${a.id}">${ic("olho", "p")}Ver anúncio</button></div></div></td>
        ${celulas(a.conta)}</tr>`).join("")}</tbody></table></div></section>`;
  const marcados = () => $$(".ap-sel:checked", alvo).map((c) => +c.value);
  const atualizar = () => {
    const n = marcados().length;
    $("#ap-aprovar-sel", alvo).disabled = $("#ap-questionar-sel", alvo).disabled = !n;
    $("#ap-aprovar-sel", alvo).innerHTML = `${ic("aprovar", "p")}Aprovar selecionados${n ? ` (${n})` : ""}`;
    $("#ap-questionar-sel", alvo).textContent = `Questionar selecionados${n ? ` (${n})` : ""}`;
  };
  $$(".ap-sel", alvo).forEach((c) => (c.onchange = atualizar));
  $("#ap-todos", alvo).onchange = (e) => { $$(".ap-sel", alvo).forEach((c) => (c.checked = e.target.checked)); atualizar(); };
  $$("[data-aprovar]", alvo).forEach((b) => (b.onclick = () => comBotao(b, () => verAnuncio(+b.dataset.aprovar))));
  const bAprovar = $("#ap-aprovar-sel", alvo);
  bAprovar.onclick = () => {
    const ids = marcados();
    if (!confirm(`Aprovar ${ids.length} anúncio(s)? A equipe fica liberada para publicar com esses preços.`)) return;
    comBotao(bAprovar, async () => {
      const r = await api("/api/aprovacoes/decidir", { method: "POST", body: { ids, decisao: "aprovar" } });
      toast(`${r.decididos} anúncio(s) aprovado(s). A equipe já pode publicar.`);
      aoMudar();
    });
  };
  $("#ap-questionar-sel", alvo).onclick = () => {
    const ids = marcados();
    const m = modal(`<h2>Questionar ${ids.length} anúncio(s)</h2>
      <p class="pequeno suave">Diga o que quer rever (preço, margem, título, fotos…). A equipe ajusta e manda de novo para você aprovar.</p>
      <textarea id="ap-nota-lote" placeholder="Ex.: a margem ficou baixa, dá para subir o preço?" style="min-height:90px"></textarea>
      <div class="linha" style="justify-content:flex-end;margin-top:12px"><button class="sec" data-fechar>Cancelar</button>
        <button id="ap-enviar">Enviar para a equipe</button></div>`);
    const b = $("#ap-enviar", m);
    b.onclick = () => comBotao(b, async () => {
      await api("/api/aprovacoes/decidir", { method: "POST", body: { ids, decisao: "recusar", nota: $("#ap-nota-lote", m).value } });
      fecharModal();
      toast("Enviado. A equipe vai rever e mandar de novo.");
      aoMudar();
    });
  };
}
