"use strict";

async function telaConcorrentes(produtoId) {
  const podeEditar = eEquipe() && estado.usuario.papel !== "consultor";
  if (produtoId && /^MLB\d+$/i.test(produtoId)) return comparativoConcorrentes(produtoId.toUpperCase(), podeEditar);
  const [lista, monitorados] = await Promise.all([api("/api/concorrentes"), api("/api/monitor")]);
  const produtos = monitorados.filter((m) => m.produto_id);
  $("#tela").innerHTML = `<div class="topo"><div><h1>Análise de concorrentes</h1>
    <div class="suave">Quem disputa venda com <b>${h(clienteAtual()?.nome)}</b>: preços, tipo de anúncio, frete, reputação e a sua posição em cada produto de catálogo.</div></div></div>
    <form class="cartao" id="cc-form" style="margin-bottom:16px"><div class="linha" style="align-items:flex-end">
      <div style="flex:1;min-width:260px"><label for="cc-link">Analisar um produto</label>
        <input id="cc-link" required placeholder="Cole o link do produto de catálogo (endereço com /p/MLB...) ou o código"></div>
      <button type="submit">${ic("usuarios", "p")}Comparar vendedores</button></div></form>
    ${produtos.length ? `<section class="cartao" style="margin-bottom:16px"><h2>${ic("olho", "p")}Produtos no Radar de anúncios</h2>
      <div class="grade-nichos">${produtos.map((m) => `<a class="nicho" href="#/concorrentes/${h(m.produto_id)}"><b>${h(m.apelido || m.produto_id)}</b>
        <span class="pequeno suave">${m.atual?.dados?.mercado_vendedores ?? "?"} vendedor(es) · mediana ${brl(m.atual?.dados?.mercado_mediana)}</span></a>`).join("")}</div></section>` : ""}
    <section class="cartao"><div class="linha entre"><h2 style="margin:0">${ic("usuarios", "p")}Concorrentes cadastrados</h2>
      ${podeEditar ? `<form id="cc-vend" class="linha" style="gap:6px"><input id="cc-vend-id" placeholder="ID do vendedor" inputmode="numeric" style="width:160px" required>
        <button type="submit" class="sec pequeno">${ic("mais", "p")}Cadastrar</button></form>` : ""}</div>
      ${lista.length ? `<div class="grade-nichos" style="margin-top:12px">${lista.map((c) => {
        const [cr, rr] = REPUTACAO_ML[c.dados.reputacao] || ["neutro", "sem reputação"];
        return `<div class="nicho" style="cursor:default"><div class="linha entre" style="width:100%"><b>${h(c.apelido)}</b>
            ${podeEditar ? `<button type="button" class="link-sutil pequeno" data-cc-tirar="${c.id}">remover</button>` : ""}</div>
          <span class="pequeno"><span class="selo ${cr}">reputação ${rr}</span>${c.dados.medalha ? ` <span class="selo neutro">${h(c.dados.medalha)}</span>` : ""}${c.demo ? ' <span class="selo demo">demonstração</span>' : ""}</span>
          <span class="pequeno suave">${c.dados.vendas_total != null ? `${numero(c.dados.vendas_total)} vendas no histórico · ` : ""}${h([c.dados.cidade, c.dados.uf].filter(Boolean).join(" - "))}</span>
          <span class="pequeno suave">${c.anuncios_no_radar} anúncio(s) dele no radar${urlSegura(c.dados.link) ? ` · <a href="${h(c.dados.link)}" target="_blank" rel="noopener">perfil ${ic("externo", "p")}</a>` : ""}</span></div>`;
      }).join("")}</div>`
      : vazio("usuarios", "Nenhum concorrente cadastrado", "Abra a comparação de um produto e clique em Cadastrar ao lado do vendedor, ou informe o ID do vendedor acima.")}</section>`;
  $("#cc-form").onsubmit = (ev) => {
    ev.preventDefault();
    const m = $("#cc-link").value.match(/MLB-?\d+/i);
    if (!m) return toast("Não achei o código MLB do produto no texto.", true);
    location.hash = "#/concorrentes/" + m[0].replace("-", "").toUpperCase();
  };
  if ($("#cc-vend")) $("#cc-vend").onsubmit = (ev) => {
    ev.preventDefault();
    comBotao($("#cc-vend button"), async () => {
      await api("/api/concorrentes", { method: "POST", body: { vendedor_id: $("#cc-vend-id").value } });
      toast("Concorrente cadastrado.");
      telaConcorrentes();
    });
  };
  $$("[data-cc-tirar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Tirar este vendedor da lista de concorrentes?")) return;
    comBotao(b, async () => { await api(`/api/concorrentes/${b.dataset.ccTirar}`, { method: "DELETE" }); telaConcorrentes(); });
  }));
}

async function comparativoConcorrentes(produtoId, podeEditar) {
  const c = await api(`/api/concorrentes/produto/${produtoId}`);
  const f = c.faixa;
  $("#tela").innerHTML = `<div class="topo"><div><a href="#/concorrentes" class="pequeno">${ic("voltar", "p")} Análise de concorrentes</a>
      <h1 style="margin-top:6px">${h(c.produto.nome || produtoId)}</h1>
      <div class="suave">${c.total} oferta(s) neste produto de catálogo${urlSegura(c.produto.link) ? ` · <a href="${h(c.produto.link)}" target="_blank" rel="noopener">ver no Mercado Livre ${ic("externo", "p")}</a>` : ""}</div></div>
    <div class="linha">${podeEditar ? `<button class="sec" id="cc-radar">${ic("olho", "p")}Acompanhar no radar</button>` : ""}
      <button id="cc-resumo">${ic("brilho", "p")}Resumo da estratégia</button></div></div>
    ${c.demo ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>Demonstração:</b> sem conta do Mercado Livre conectada, estas ofertas são fictícias.</div>` : ""}
    <div id="cc-resumo-caixa"></div>
    ${f.minimo != null ? `<section class="cartao" style="margin-bottom:16px"><h2>${ic("cifrao", "p")}Faixa de preço do mercado</h2>
      <div class="faixa-preco"><div class="faixa-trilho">${f.meu_pct != null ? `<span class="faixa-eu" style="left:${f.meu_pct}%" title="Você: ${brl(f.meu_preco)}"></span>` : ""}</div>
        <div class="linha entre pequeno"><span>mínimo ${brl(f.minimo)}</span><span>mediana ${brl(f.mediana)}</span><span>máximo ${brl(f.maximo)}</span></div></div>
      <p class="pequeno" style="margin:8px 0 0">${f.minha_posicao ? `Você vende a <b>${brl(f.meu_preco)}</b> e está em <b>${f.minha_posicao}º</b> lugar no preço entre ${c.total}.`
        : "O cliente não tem oferta neste produto (ou a conta dele não está conectada)."}</p></section>` : ""}
    <section class="cartao" style="margin-bottom:16px"><h2>${ic("usuarios", "p")}Comparativo lado a lado</h2>
      <p class="pequeno suave" style="margin-top:0">${h(c.sem_api)} A posição é pelo preço, do mais barato para o mais caro.</p>
      ${c.ofertas.length ? `<div class="tabela embutida"><table><thead><tr><th class="num">Posição</th><th>Vendedor</th><th class="num">Preço</th><th>Tipo</th><th>Frete</th>
        <th>Reputação</th><th class="num">Vendas</th><th class="num">Visitas</th><th></th></tr></thead><tbody>
        ${c.ofertas.map((o) => {
          const [cr, rr] = REPUTACAO_ML[o.vendedor.reputacao] || ["neutro", "—"];
          return `<tr class="${o.sou_eu ? "destaque" : ""}"><td class="num">${o.posicao}º</td>
            <td><b>${h(o.vendedor.apelido || o.vendedor_id)}</b>${o.sou_eu ? ' <span class="selo ok">você</span>' : ""}${o.cadastrado ? ' <span class="selo neutro">concorrente</span>' : ""}${o.loja_oficial ? ' <span class="selo neutro">loja oficial</span>' : ""}
              <div class="pequeno suave">${h(o.item_id || "")}</div></td>
            <td class="num"><b>${brl(o.preco)}</b></td><td>${h(o.tipo_anuncio)}</td>
            <td class="pequeno">${h(o.logistica)}${o.frete_gratis ? "<div class=\"suave\">frete grátis</div>" : ""}</td>
            <td><span class="selo ${cr}">${rr}</span>${o.vendedor.medalha ? `<div class="pequeno suave">${h(o.vendedor.medalha)}</div>` : ""}</td>
            <td class="num">${naoDisponivel(c.sem_api)}</td><td class="num">${naoDisponivel(c.sem_api)}</td>
            <td style="text-align:right">${podeEditar && !o.sou_eu && !o.cadastrado && o.vendedor_id ? `<button type="button" class="sec pequeno" data-cc-cad="${h(o.vendedor_id)}">${ic("mais", "p")}Concorrente</button>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>` : vazio("usuarios", "Nenhuma oferta ativa neste produto")}</section>
    <section class="cartao"><h2>${ic("relogio", "p")}Linha do tempo de preços</h2>
      ${c.linha_do_tempo.length ? `<div class="feed rolagem-y">${c.linha_do_tempo.map((ev) => `<div class="feed-item"><span class="feed-ic">${ic("cifrao", "p")}</span>
        <div class="info"><b>${h(ev.vendedor || ev.vendedor_id)}</b> ${ev.para == null ? `saiu do produto (estava a ${brl(ev.de)})` : `mudou de ${brl(ev.de)} para <b>${brl(ev.para)}</b>`}
          <div class="pequeno suave">${data(ev.em)}</div></div></div>`).join("")}</div>`
        : `<p class="pequeno suave">As mudanças aparecem aqui quando o produto está no Radar de anúncios e é lido mais de uma vez.</p>`}</section>`;
  if ($("#cc-radar")) $("#cc-radar").onclick = () => comBotao($("#cc-radar"), async () => {
    await api("/api/monitor", { method: "POST", body: { produto_id: produtoId, apelido: c.produto.nome || "", origem: "concorrentes" } });
    toast("Produto colocado no Radar de anúncios.");
  });
  $("#cc-resumo").onclick = () => comBotao($("#cc-resumo"), async () => {
    const r = await api(`/api/concorrentes/produto/${produtoId}/resumo`, { method: "POST" });
    $("#cc-resumo-caixa").innerHTML = `<section class="cartao" style="margin-bottom:16px"><div class="linha entre"><h2 style="margin:0">${ic("brilho", "p")}Resumo da estratégia</h2>
      <span class="selo neutro">${r.fonte === "ia" ? "escrito pela IA com os dados coletados" : "regras automáticas (sem IA configurada)"}</span></div>
      <p>${h(r.resumo)}</p>${r.recomendacoes.length ? `<ul>${r.recomendacoes.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}</section>`;
  });
  $$("[data-cc-cad]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await api("/api/concorrentes", { method: "POST", body: { vendedor_id: b.dataset.ccCad } });
    toast("Vendedor cadastrado como concorrente.");
    comparativoConcorrentes(produtoId, podeEditar);
  })));
}
