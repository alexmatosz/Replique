"use strict";

const temFerramenta = (f) => eAdmin() || (estado.usuario?.ferramentas || []).includes(f);
const usaDuvidas = () => temFerramenta("duvidas");
const dataDia = (iso) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "");
const hojeIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const contadorHtml = (n, titulo = "Mensagens não lidas") => (n ? `<span class="bolinha" title="${titulo}">${n > 99 ? "99+" : n}</span>` : "");
const barraProgresso = (pct) => `<div class="progresso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;

let _pollNaoLidas = null;
async function atualizarNaoLidas() {
  if (!estado.usuario || !usaDuvidas()) { estado.naoLidas = null; desenharContadores(); return; }
  const qs = estado.clienteId && eTime() ? `?cliente_id=${estado.clienteId}` : "";
  try { estado.naoLidas = await api("/api/conversas/nao-lidas" + qs); } catch { return; }
  desenharContadores();
  if (!_pollNaoLidas) _pollNaoLidas = setInterval(() => { if (estado.usuario && !document.hidden) { atualizarNaoLidas(); carregarPendencias(); } }, 45000);
}

function naoLidasDaPagina() {
  const ctx = estado.chatPagina;
  const n = estado.naoLidas;
  if (!ctx || !n) return 0;
  if (ctx.ref_tipo) return n.por_ref?.[`${ctx.ref_tipo}:${ctx.ref_id}`] || 0;
  return n.por_pagina?.[ctx.pagina] || 0;
}

function desenharContadores() {
  const n = estado.naoLidas || {};
  const por = n.por_pagina || {};
  $$("[data-contador]").forEach((el) => {
    const r = el.dataset.contador;
    const v = (r === "duvidas" ? n.total || 0 : (por[r] || 0) + (r === "rascunhos" ? por.editor || 0 : 0)) + (estado.pendencias?.[r] || 0)
      + (r === "novidades" ? estado.novidadesNovas || 0 : 0);
    el.hidden = !v;
    el.textContent = v > 99 ? "99+" : v;
  });
  $$("[data-contador-topico]").forEach((el) => {
    const v = $$("[data-contador]", el.closest(".topico")).reduce((t, b) => t + (b.hidden ? 0 : parseInt(b.textContent, 10) || 0), 0);
    el.hidden = !v;
    el.textContent = v > 99 ? "99+" : v;
  });
  const btn = $("#seletor-btn");
  if (btn) {
    $(".bolinha", btn)?.remove();
    const outros = (n.total || 0) - (estado.clienteId ? n.por_cliente?.[estado.clienteId] || 0 : 0);
    if (outros > 0 && estado.clienteId) btn.insertAdjacentHTML("beforeend", contadorHtml(outros, "Dúvidas não lidas em outros clientes"));
  }
  const cc = $("#chat-contador");
  if (cc) { const v = naoLidasDaPagina(); cc.hidden = !v; cc.textContent = v; }
  $$("[data-ref-contador]").forEach((el) => {
    const v = n.por_ref?.[el.dataset.refContador] || 0;
    el.hidden = !v;
    el.textContent = v;
  });
}

const chat = { ctx: null, timer: null, carregando: false };
const PAGINAS_SEM_CHAT = new Set(["inicio", "pedidos", "acompanhamento", "duvidas", "clientes", "config", "entrar"]);

function garantirChat() {
  if ($("#chat")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <button type="button" class="chat-botao" id="chat-abrir" hidden>${ic("balao")}<span id="chat-rotulo">Dúvidas sobre esta página</span><span class="bolinha" id="chat-contador" hidden></span></button>
    <aside class="chat" id="chat" hidden aria-label="Conversa">
      <header class="chat-topo"><div class="info"><b id="chat-titulo">Dúvidas</b><div class="pequeno suave" id="chat-sub"></div></div>
        <button type="button" class="icone" id="chat-fechar" aria-label="Fechar conversa" title="Fechar">${ic("x")}</button></header>
      <div class="chat-msgs" id="chat-msgs" aria-live="polite"></div>
      <form class="chat-form" id="chat-form">
        <label for="chat-texto" class="so-leitor">Mensagem</label>
        <textarea id="chat-texto" rows="3" maxlength="4000" placeholder="Escreva sua dúvida…" required></textarea>
        <div class="linha entre"><span class="pequeno suave" id="chat-dica"></span>
          <div class="linha"><button type="button" class="sec pequeno" id="chat-resolver" hidden></button>
            <button type="submit" class="pequeno">${ic("enviar", "p")}Enviar</button></div></div>
      </form>
    </aside>`);
  $("#chat-abrir").onclick = () => estado.chatPagina && abrirChat({ ...estado.chatPagina });
  $("#chat-fechar").onclick = fecharChat;
  $("#chat-texto").onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#chat-form").requestSubmit(); };
  $("#chat-form").onsubmit = (e) => {
    e.preventDefault();
    const texto = $("#chat-texto").value.trim();
    if (!texto || !chat.ctx) return;
    comBotao($("#chat-form button[type=submit]"), async () => {
      const c = chat.ctx;
      const r = await api("/api/conversas/mensagens", { method: "POST", body: { cliente_id: c.cliente_id, pagina: c.pagina,
        ref_tipo: c.ref_tipo || "", ref_id: c.ref_id || 0, texto } });
      $("#chat-texto").value = "";
      chat.ctx.conversa_id = r.id;
      desenharChat(r, true);
      atualizarNaoLidas();
      if (estado._rotaAtual === "duvidas") carregarCaixa();
    });
  };
  $("#chat-resolver").onclick = () => comBotao($("#chat-resolver"), async () => {
    const resolvida = $("#chat-resolver").dataset.resolvida !== "1";
    await api(`/api/conversas/${chat.ctx.conversa_id}/resolver`, { method: "POST", body: { resolvida } });
    toast(resolvida ? "Dúvida marcada como resolvida." : "Dúvida reaberta.");
    await carregarChat(true);
    if (estado._rotaAtual === "duvidas") carregarCaixa();
  });
}

function ligarChatDaPagina(rota, param) {
  garantirChat();
  fecharChat();
  const u = estado.usuario;
  const cliente_id = u?.papel === "cliente" ? u.cliente_id : estado.clienteId;
  const ok = u && usaDuvidas() && !PAGINAS_SEM_CHAT.has(rota) && cliente_id;
  estado.chatPagina = ok ? { pagina: rota, cliente_id, ref_tipo: rota === "editor" && +param ? "anuncio" : "",
    ref_id: rota === "editor" ? +param || 0 : 0, titulo: TITULO_ROTA[rota] || rota } : null;
  $("#chat-abrir").hidden = !ok;
  if (ok) $("#chat-rotulo").textContent = eTime() ? `Conversa com ${clienteAtual()?.nome || "o cliente"}` : "Dúvidas sobre esta página";
  desenharContadores();
}

function abrirChat(ctx) {
  garantirChat();
  fecharModal();
  chat.ctx = ctx;
  $("#chat").hidden = false;
  $("#chat-abrir").hidden = true;
  $("#chat-msgs").innerHTML = `<div class="carregando"><span class="girando"></span> Carregando…</div>`;
  carregarChat(true);
  clearInterval(chat.timer);
  chat.timer = setInterval(() => { if (!document.hidden) carregarChat(false); }, 20000);
  setTimeout(() => $("#chat-texto")?.focus(), 50);
}

function fecharChat() {
  clearInterval(chat.timer);
  chat.ctx = null;
  if ($("#chat")) $("#chat").hidden = true;
  if ($("#chat-abrir")) $("#chat-abrir").hidden = !estado.chatPagina;
}

async function carregarChat(rolar) {
  const c = chat.ctx;
  if (!c || chat.carregando) return;
  chat.carregando = true;
  try {
    const r = c.conversa_id ? await api(`/api/conversas/${c.conversa_id}`)
      : await api("/api/conversas/abrir?" + new URLSearchParams({ pagina: c.pagina, cliente_id: c.cliente_id || "",
        ref_tipo: c.ref_tipo || "", ref_id: c.ref_id || 0 }));
    if (chat.ctx !== c) return;
    if (r.id) c.conversa_id = r.id;
    desenharChat(r, rolar);
    atualizarNaoLidas();
  } catch (e) {
    if (chat.ctx === c) $("#chat-msgs").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`;
  } finally { chat.carregando = false; }
}

function desenharChat(r, rolar) {
  const caixa = $("#chat-msgs");
  const noFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 40;
  const equipe = eTime();
  const nomeCliente = equipe ? (estado.usuario.clientes.find((x) => x.id === r.cliente_id)?.nome || "Cliente") : "";
  $("#chat-titulo").textContent = r.titulo ? `${r.pagina_nome} · ${r.titulo}` : r.pagina_nome;
  $("#chat-sub").textContent = equipe ? `${nomeCliente}${r.resolvida ? " · resolvida" : ""}` : r.resolvida ? "Resolvida pela equipe" : "A equipe Monvatti responde por aqui";
  $("#chat-dica").textContent = equipe ? "O cliente vê a resposta nesta mesma página." : "Ctrl+Enter envia";
  $("#chat-texto").placeholder = equipe ? "Responder ao cliente…" : "Escreva sua dúvida…";
  const resolver = $("#chat-resolver");
  resolver.hidden = !(equipe && r.id);
  resolver.dataset.resolvida = r.resolvida ? "1" : "0";
  resolver.innerHTML = r.resolvida ? `${ic("desfazer", "p")}Reabrir` : `${ic("checar", "p")}Resolvida`;
  let separou = false;
  caixa.innerHTML = r.mensagens.length ? r.mensagens.map((m) => {
    const nova = r.lida_ate != null && !separou && !m.minha && m.id > r.lida_ate;
    if (nova) separou = true;
    return `${nova ? '<div class="chat-novas"><span>Novas mensagens</span></div>' : ""}
      <div class="msg ${m.minha ? "minha" : ""} ${m.papel === "cliente" ? "do-cliente" : ""}">
        <div class="msg-autor">${m.minha ? "Você" : h(m.autor)} <span class="suave">· ${h(PAPEL[m.papel] || "")} · ${tempoRelativo(m.criada_em)}</span></div>
        <div class="msg-texto">${h(m.texto)}</div></div>`;
  }).join("") : vazio("balao", equipe ? "Nenhuma mensagem ainda" : "Ficou com alguma dúvida?",
    equipe ? "Escreva para o cliente: ele vê a mensagem nesta página." : "Escreva aqui. A dúvida fica ligada a esta página e a equipe responde por aqui mesmo.");
  if (rolar || noFim) caixa.scrollTop = caixa.scrollHeight;
}
