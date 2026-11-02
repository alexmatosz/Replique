"use strict";

const estadoCaixa = { filtro: null, cliente: "" };

async function telaDuvidas() {
  const equipe = eTime();
  estadoCaixa.filtro ||= equipe ? "aguardando" : "todas";
  const abas = equipe ? [["aguardando", "Aguardando resposta"], ["nao_lidas", "Não lidas"], ["todas", "Abertas"], ["resolvidas", "Resolvidas"]]
    : [["todas", "Abertas"], ["nao_lidas", "Não lidas"], ["resolvidas", "Resolvidas"]];
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${equipe ? "Dúvidas dos clientes" : "Minhas dúvidas"}</h1>
    <div class="suave">${equipe ? "Perguntas que os clientes fizeram em cada página do sistema. Responda por aqui ou na própria página."
      : "As perguntas que você fez nas páginas do sistema e as respostas da equipe. Para perguntar algo novo, use o botão de dúvidas na página do assunto."}</div></div>
    ${equipe ? `<select id="cx-cliente" aria-label="Cliente" style="width:auto"><option value="">Todos os clientes</option>
      ${estado.usuario.clientes.filter((c) => c.ativo).map((c) => `<option value="${c.id}" ${String(c.id) === estadoCaixa.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select>` : ""}</div>
  <div class="abas" id="cx-abas">${abas.map(([k, r]) => `<button type="button" data-filtro="${k}" class="${estadoCaixa.filtro === k ? "ativa" : ""}">${r}</button>`).join("")}</div>
  <div class="cartao" id="cx-lista"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  $$("#cx-abas [data-filtro]").forEach((b) => (b.onclick = () => {
    estadoCaixa.filtro = b.dataset.filtro;
    $$("#cx-abas button").forEach((x) => x.classList.toggle("ativa", x === b));
    carregarCaixa();
  }));
  if ($("#cx-cliente")) $("#cx-cliente").onchange = (e) => { estadoCaixa.cliente = e.target.value; carregarCaixa(); };
  await carregarCaixa();
}

async function carregarCaixa() {
  const alvo = $("#cx-lista");
  if (!alvo) return;
  const qs = new URLSearchParams({ filtro: estadoCaixa.filtro });
  if (estadoCaixa.cliente) qs.set("cliente_id", estadoCaixa.cliente);
  const lista = await api("/api/conversas?" + qs);
  const equipe = eTime();
  alvo.innerHTML = lista.length ? lista.map((c) => `
    <div class="lista-item conversa-item ${c.nao_lidas ? "nao-lida" : ""}">
      <span class="feed-ic">${ic(c.ref_tipo === "tarefa" ? "relogio" : "balao", "p")}</span>
      <div class="info">
        <b>${equipe ? h(c.cliente_nome) + " · " : ""}${h(c.pagina_nome)}${c.titulo ? " · " + h(c.titulo) : ""}</b>
        <span class="pequeno suave">${c.ultima ? `${h(c.ultima.autor)}: ${h(c.ultima.texto)}` : ""}</span>
        <div class="pequeno suave">${tempoRelativo(c.atualizada_em)}
          ${c.aguardando && equipe ? ' · <span class="selo demo">aguardando resposta</span>' : ""}${c.resolvida ? ' · <span class="selo ok">resolvida</span>' : ""}</div>
      </div>
      ${contadorHtml(c.nao_lidas)}
      <div class="linha" style="flex-wrap:nowrap">
        <button type="button" class="sec pequeno" data-ir="${c.id}" title="Abrir a página do assunto">${ic("externo", "p")}Página</button>
        <button type="button" class="pequeno" data-abrir="${c.id}">${ic("balao", "p")}${equipe ? "Responder" : "Abrir"}</button></div>
    </div>`).join("")
    : vazio("balao", estadoCaixa.filtro === "aguardando" ? "Nenhuma dúvida esperando resposta" : "Nenhuma conversa aqui",
      equipe ? "Quando um cliente perguntar algo em uma página, a dúvida aparece nesta lista." : "");
  const porId = Object.fromEntries(lista.map((c) => [c.id, c]));
  $$("[data-abrir]", alvo).forEach((b) => (b.onclick = () => {
    const c = porId[b.dataset.abrir];
    abrirChat({ conversa_id: c.id, cliente_id: c.cliente_id, pagina: c.pagina, ref_tipo: c.ref_tipo, ref_id: c.ref_id });
  }));
  $$("[data-ir]", alvo).forEach((b) => (b.onclick = () => {
    const c = porId[b.dataset.ir];
    if (eTime() && c.cliente_id !== estado.clienteId) trocarCliente(c.cliente_id, { navegar: false });
    const destino = c.pagina === "editor" && c.ref_id ? `editor/${c.ref_id}` : ["geral", "projeto", "tarefas"].includes(c.pagina) ? "painel" : c.pagina;
    location.hash = "#/" + destino;
  }));
}
