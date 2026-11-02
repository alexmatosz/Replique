"use strict";

async function telaClonador() {
  const lista = await api("/api/clonador/origens");
  const marcados = new Set();
  const clientes = (estado.usuario.clientes || []).filter((c) => c.ativo);
  $("#tela").innerHTML = `<div class="topo"><div><h1>Clonador de anúncios</h1>
    <div class="suave">Cria <b>rascunhos</b> a partir dos anúncios de <b>${h(clienteAtual()?.nome)}</b>: para outro marketplace, para outro cliente ou com variações
      (cor, tamanho, kit). Nada é publicado: cada clone passa pela checagem, pela nota de risco, pela aprovação do lojista (quando o cliente exige) e pela conferência da conta.</div></div></div>
    <div class="grade g2" style="align-items:start">
      <section class="cartao"><div class="linha entre"><h2 style="margin:0">${ic("rascunhos", "p")}1. Escolha os anúncios</h2><span class="pequeno suave" id="cl-qtd">0 selecionado(s)</span></div>
        <input id="cl-busca" type="search" placeholder="Buscar pelo título" style="margin:12px 0">
        <div id="cl-lista" class="rolagem-y" style="max-height:460px"></div></section>
      <section class="cartao"><h2>${ic("copiar", "p")}2. Para onde clonar</h2>
        <form id="cl-form" class="pilha">
          <div><label for="cl-plat">Marketplace de destino</label><select id="cl-plat">
            ${Object.entries(PLAT).map(([k, p]) => `<option value="${k}">${p.nome}</option>`).join("")}</select>
            <p class="pequeno suave" style="margin:4px 0 0">O título é cortado no limite da plataforma. No Mercado Livre, a categoria é sugerida pela API; nas outras, você escolhe no editor.</p></div>
          <div><label for="cl-cliente">Cliente de destino</label><select id="cl-cliente">
            ${clientes.map((c) => `<option value="${c.id}" ${c.id === estado.clienteId ? "selected" : ""}>${h(c.nome)}${c.id === estado.clienteId ? " (este)" : ""}</option>`).join("")}</select></div>
          <div><label for="cl-var">Variações (opcional, uma por linha)</label>
            <textarea id="cl-var" placeholder="Azul\nVermelho\nKit com 2" style="min-height:90px"></textarea>
            <p class="pequeno suave" style="margin:4px 0 0">Cada variação vira um rascunho com o texto no fim do título e no SKU. Até 10.</p></div>
          <button type="submit" id="cl-criar">${ic("copiar", "p")}Criar rascunhos</button>
        </form>
        <div id="cl-resultado"></div></section>
    </div>`;
  const desenhar = () => {
    const busca = $("#cl-busca").value.trim().toLowerCase();
    const filtrada = lista.filter((a) => !busca || (a.titulo || "").toLowerCase().includes(busca));
    $("#cl-lista").innerHTML = filtrada.length ? filtrada.map((a) => `<label class="lista-item" style="cursor:pointer;padding:8px 0">
        <input type="checkbox" data-cl="${a.id}" ${marcados.has(a.id) ? "checked" : ""} style="width:auto">
        ${a.foto && urlSegura(a.foto) ? `<img src="${h(a.foto)}" alt="" width="36" height="36" loading="lazy" style="border-radius:6px;object-fit:contain;background:#fff;border:1px solid var(--borda)">` : ""}
        <div class="info"><b>${h(a.titulo || "(sem título)")}</b><span class="pequeno suave">${brl(a.preco)} · ${seloStatus(a.status)}
          ${a.publicado_em.length ? ` · no ar em ${a.publicado_em.map((p) => PLAT[p]?.nome || p).join(", ")}` : ""}
          ${a.rascunho_apagado ? ' · <span class="selo neutro" title="O rascunho foi apagado, mas o anúncio publicado guardou o conteúdo">rascunho apagado</span>' : ""}</span></div></label>`).join("")
      : vazio("rascunhos", lista.length ? "Nada com essa busca" : "Este cliente ainda não tem anúncios", lista.length ? "" : `Comece em <a href="#/pesquisar">Pesquisar</a>.`);
    $$("[data-cl]").forEach((c) => (c.onchange = () => {
      c.checked ? marcados.add(+c.dataset.cl) : marcados.delete(+c.dataset.cl);
      $("#cl-qtd").textContent = `${marcados.size} selecionado(s)`;
    }));
  };
  $("#cl-busca").oninput = desenhar;
  desenhar();
  $("#cl-form").onsubmit = (ev) => {
    ev.preventDefault();
    if (!marcados.size) return toast("Escolha pelo menos um anúncio.", true);
    const variacoes = $("#cl-var").value.split("\n").map((v) => v.trim()).filter(Boolean);
    const total = marcados.size * Math.max(1, variacoes.length);
    if (!confirm(`Criar ${total} rascunho(s) em ${PLAT[$("#cl-plat").value].nome}? Nada será publicado.`)) return;
    comBotao($("#cl-criar"), async () => {
      const r = await api("/api/clonador", { method: "POST", body: { anuncio_ids: [...marcados], plataforma: $("#cl-plat").value,
        cliente_destino_id: +$("#cl-cliente").value, variacoes } });
      const outro = +$("#cl-cliente").value !== estado.clienteId;
      $("#cl-resultado").innerHTML = `<div class="aviso azul" style="margin-top:14px"><b>${r.criados.length} rascunho(s) criado(s) em ${h(r.cliente_destino)}.</b>
        ${outro ? " Para editar, troque para esse cliente no seletor do topo." : ""}</div>
        <div class="rolagem-y">${r.criados.map((c) => `<div class="lista-item" style="padding:8px 0"><div class="info">
          ${outro ? `<b>${h(c.titulo)}</b>` : `<a href="#/editor/${c.id}"><b>${h(c.titulo)}</b></a>`}
          ${c.avisos.length ? `<span class="pequeno suave">${c.avisos.map(h).join(" · ")}</span>` : ""}</div></div>`).join("")}</div>`;
      toast("Rascunhos criados. Revise antes de publicar.");
    });
  };
}
