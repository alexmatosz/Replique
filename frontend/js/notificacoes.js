"use strict";

async function carregarPendencias() {
  if (!estado.usuario) return;
  if (!eTime()) return atualizarSino();
  const qs = estado.clienteId ? `?cliente_id=${estado.clienteId}` : "";
  try { estado.pendencias = await api("/api/pendencias" + qs); } catch { return; }
  desenharSino(estado.pendencias.notificacoes || 0);
  desenharContadores();
}

function desenharSino(n) {
  const b = $("#sino-contador");
  if (b) { b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
}

async function atualizarSino() {
  try { desenharSino((await api("/api/notificacoes/contagem")).nao_lidas); } catch {}
}

const estadoSino = { cliente: "", soNaoLidas: false };

async function abrirNotificacoes() {
  const ativos = (estado.usuario.clientes || []).filter((c) => c.ativo);
  const m = modal(`<div class="linha entre" style="padding-right:36px"><h2 style="margin:0">${ic("sino", "p")}Notificações</h2>
      <button type="button" class="sec pequeno" id="nt-todas">Marcar todas como lidas</button></div>
    <div class="linha" style="margin:10px 0">
      ${ativos.length > 1 ? `<select id="nt-cliente" aria-label="Cliente" style="width:auto"><option value="">Todos os clientes</option>
        ${ativos.map((c) => `<option value="${c.id}" ${String(c.id) === estadoSino.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select>` : ""}
      <label class="linha" style="margin:0;gap:6px"><input type="checkbox" id="nt-nao-lidas" ${estadoSino.soNaoLidas ? "checked" : ""}> Só não lidas</label></div>
    <div id="nt-lista" class="lista-notificacoes"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`);
  const carregar = async () => {
    const qs = new URLSearchParams();
    if (estadoSino.cliente) qs.set("cliente_id", estadoSino.cliente);
    if (estadoSino.soNaoLidas) qs.set("nao_lidas", "true");
    const r = await api("/api/notificacoes?" + qs);
    $("#nt-lista", m).innerHTML = r.itens.length ? r.itens.map((n) => `<button type="button" class="notificacao ${n.lida ? "" : "nao-lida"}" data-nt="${n.id}">
        <span class="feed-ic">${ic(ICONE_NOTIFICACAO[n.tipo] || "alerta", "p")}</span>
        <span class="info"><b>${h(n.titulo)}</b>${n.texto ? `<span class="pequeno suave">${h(n.texto)}</span>` : ""}
          <span class="pequeno suave">${h(n.tipo_nome)}${n.cliente ? " · " + h(n.cliente) : ""} · ${tempoRelativo(n.criada_em)}${n.demo ? ' · <span class="selo demo">demonstração</span>' : ""}</span></span>
        ${n.lida ? "" : '<span class="ponto-nao-lida" aria-label="não lida"></span>'}</button>`).join("")
      : vazio("sino", "Nenhuma notificação", "Avisos de pedidos atrasados, anúncios com problema, catálogo, concorrentes, saúde da conta e Full aparecem aqui.");
    const porId = Object.fromEntries(r.itens.map((n) => [n.id, n]));
    $$("[data-nt]", m).forEach((b) => (b.onclick = async () => {
      const n = porId[b.dataset.nt];
      await api("/api/notificacoes/lidas", { method: "POST", body: { ids: [n.id] } }).catch(() => {});
      fecharModal();
      atualizarSino();
      if (n.cliente_id && eTime() && n.cliente_id !== estado.clienteId) trocarCliente(n.cliente_id, { navegar: false });
      if (n.link) { if (location.hash === n.link) roteador(); else location.hash = n.link; }
    }));
  };
  if ($("#nt-cliente", m)) $("#nt-cliente", m).onchange = (e) => { estadoSino.cliente = e.target.value; carregar(); };
  $("#nt-nao-lidas", m).onchange = (e) => { estadoSino.soNaoLidas = e.target.checked; carregar(); };
  $("#nt-todas", m).onclick = () => comBotao($("#nt-todas", m), async () => {
    await api("/api/notificacoes/lidas", { method: "POST", body: { ids: null } });
    await carregar();
    atualizarSino();
  });
  await carregar();
}

const ICONE_NOTIFICACAO = { pedido_atrasado: "relogio", pedido_parado: "pausa", pedido_novo: "pedido", anuncio_problema: "alerta",
  catalogo_perdido: "alvo", concorrente_preco: "cifrao", saude_risco: "coracao", full_parado: "caixa", agendador_falha: "trocar",
  ia_limite: "brilho", relatorio_mes: "relatorio" };
