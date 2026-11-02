"use strict";

async function telaInicio() {
  const papel = estado.usuario.papel;
  const v = await api("/api/visao-geral");
  const t = v.totais;
  const kpi = (rotulo, valor, detalhe = "", icone = "painel", classe = "") => `<div class="cartao kpi-bloco">
      <div class="linha entre"><span class="rotulo">${rotulo}</span><span class="kpi-ic">${ic(icone, "p")}</span></div>
      <div class="valor ${classe}">${valor}</div>${detalhe ? `<div class="pequeno suave">${detalhe}</div>` : ""}</div>`;
  const pedidosTitulo = papel === "operador" ? "Meus pedidos" : "Pedidos que criei";
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${papel === "admin" ? "Visão geral" : "Minha carteira"}</h1>
    <div class="suave">${papel === "admin" ? "Toda a operação: clientes, pedidos de anúncio, rascunhos com problema e dúvidas. Para trabalhar em um cliente, escolha-o na lista ou no seletor do topo."
      : papel === "consultor" ? "Os clientes sob sua responsabilidade, os pedidos de anúncio que você passou à equipe e as dúvidas dos clientes."
      : "Os clientes atribuídos a você e os pedidos de anúncio que estão com você."}</div></div>
    <div class="linha">${papel !== "operador" ? `<button type="button" id="vg-novo-pedido">${ic("mais", "p")}Novo pedido</button>` : ""}
      ${papel === "admin" ? `<a class="botao sec" href="#/clientes">${ic("loja", "p")}Clientes</a>` : ""}</div></div>
  <div class="grade g4">
    ${kpi("Clientes", numero(t.clientes), papel === "admin" ? `${numero(t.usuarios || 0)} acesso(s) ativo(s)` : "na sua carteira", "loja")}
    ${kpi("Pedidos em aberto", numero(t.pedidos_abertos), t.pedidos_atrasados ? `<span class="ruim">${numero(t.pedidos_atrasados)} atrasado(s)</span>` : "nenhum atrasado", "pedido")}
    ${kpi("Rascunhos com problema", numero(t.rascunhos_problema), "falharam na publicação", "alerta", t.rascunhos_problema ? "negativo" : "")}
    ${v.usa_duvidas ? kpi("Dúvidas sem resposta", numero(t.aguardando_resposta), `${numero(t.duvidas_nao_lidas)} mensagem(ns) não lida(s) para você`, "balao", t.aguardando_resposta ? "negativo" : "")
      : kpi("Publicados em 30 dias", numero(t.publicados_30d), "anúncios no ar", "publicar")}
  </div>
  <section class="cartao" id="vg-faturamento" style="margin-top:16px"><div class="carregando"><span class="girando"></span> Somando o faturamento…</div></section>
  ${v.sem_equipe.length ? `<div class="aviso azul linha entre" style="margin-top:16px"><span>${ic("usuarios", "p")} <b>${v.sem_equipe.length} cliente(s) sem consultor nem operador:</b>
    ${v.sem_equipe.slice(0, 6).map(h).join(", ")}${v.sem_equipe.length > 6 ? "…" : ""}.</span><a class="botao sec pequeno" href="#/clientes">Atribuir equipe</a></div>` : ""}
  ${v.meus_pedidos.length ? `<section class="cartao" style="margin-top:16px"><div class="linha entre"><h2 style="margin:0">${ic("pedido", "p")}${pedidosTitulo}</h2>
      <a href="#/pedidos" class="pequeno">ver todos</a></div>
    <div style="margin-top:8px">${v.meus_pedidos.map(linhaPedido).join("")}</div></section>` : ""}
  <section class="cartao" style="margin-top:16px">
    <div class="linha entre"><h2 style="margin:0">${ic("loja", "p")}${papel === "admin" ? "Clientes" : "Meus clientes"}</h2>
      <input type="text" id="vg-busca" placeholder="Buscar cliente…" style="max-width:260px"></div>
    ${v.clientes.length ? `<div class="tabela" style="margin-top:14px"><table><thead><tr><th>Cliente</th><th>Equipe</th>
      <th class="num">Pedidos</th><th class="num">Rascunhos</th><th class="num">Publicados 30 d</th>${v.usa_duvidas ? '<th class="num">Dúvidas</th>' : ""}<th>Última atividade</th><th></th></tr></thead>
      <tbody id="vg-linhas"></tbody></table></div>`
      : vazio("loja", papel === "admin" ? "Nenhum cliente cadastrado" : "Nenhum cliente atribuído a você",
        papel === "admin" ? `Cadastre em <a href="#/clientes">Clientes</a>.` : "Peça ao administrador para atribuir os clientes que você atende.")}
  </section>
  ${v.equipe.length ? `<section class="cartao" style="margin-top:16px"><h2>${ic("usuarios", "p")}Equipe</h2>
    <div class="tabela"><table><thead><tr><th>Pessoa</th><th class="num">Clientes</th><th class="num">Pedidos em aberto</th><th class="num">Atrasados</th><th class="num">Publicados 30 d</th></tr></thead><tbody>
    ${v.equipe.map((p) => `<tr><td><div class="linha" style="gap:10px;flex-wrap:nowrap"><span class="avatar pequeno-avatar">${avatarHtml(p.nome, p.foto)}</span>
      <div><b>${h(p.nome)}</b><div class="pequeno suave">${h(PAPEL[p.papel] || p.papel)}</div></div></div></td>
      <td class="num">${numero(p.clientes)}</td><td class="num">${numero(p.pedidos_abertos)}</td>
      <td class="num ${p.pedidos_atrasados ? "ruim" : ""}">${numero(p.pedidos_atrasados)}</td><td class="num">${numero(p.publicados_30d)}</td></tr>`).join("")}
    </tbody></table></div></section>` : ""}`;
  if ($("#vg-novo-pedido")) $("#vg-novo-pedido").onclick = () => formPedido(null, () => telaInicio());
  const hoje = new Date();
  cartaoFaturamento(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const corpo = $("#vg-linhas");
  if (corpo) {
    const desenhar = () => {
      const termo = $("#vg-busca").value.trim().toLowerCase();
      corpo.innerHTML = v.clientes.filter((c) => c.nome.toLowerCase().includes(termo)).map((c) => `<tr>
        <td><b>${h(c.nome)}</b></td>
        <td class="pequeno">${c.consultores.length ? `<div>consultor: ${h(c.consultores.join(", "))}</div>` : ""}${c.operadores.length ? `<div class="suave">operador: ${h(c.operadores.join(", "))}</div>` : ""}
          ${!c.consultores.length && !c.operadores.length ? '<span class="aviso-texto">sem equipe</span>' : ""}</td>
        <td class="num">${numero(c.pedidos_abertos)}${c.pedidos_atrasados ? `<div class="pequeno ruim">${c.pedidos_atrasados} atrasado(s)</div>` : ""}</td>
        <td class="num">${numero(c.rascunhos_preparo)}${c.rascunhos_problema ? `<div class="pequeno ruim">${c.rascunhos_problema} com problema</div>` : ""}</td>
        <td class="num">${numero(c.publicados_30d)}</td>
        ${v.usa_duvidas ? `<td class="num">${c.aguardando_resposta ? `<span class="selo demo" title="Dúvidas esperando resposta">${c.aguardando_resposta}</span> ` : ""}${contadorHtml(c.duvidas_nao_lidas)}${!c.aguardando_resposta && !c.duvidas_nao_lidas ? "—" : ""}</td>` : ""}
        <td class="pequeno suave">${c.ultima_atividade ? tempoRelativo(c.ultima_atividade) : "—"}</td>
        <td style="text-align:right"><button type="button" class="sec pequeno" data-entrar="${c.id}">${ic("direita", "p")}Abrir</button></td></tr>`).join("")
        || `<tr><td colspan="8" class="suave">Nenhum cliente com esse nome.</td></tr>`;
      $$("[data-entrar]", corpo).forEach((b) => (b.onclick = () => entrarNoCliente(+b.dataset.entrar)));
    };
    $("#vg-busca").oninput = desenhar;
    desenhar();
  }
}

function entrarNoCliente(id, rota = "rascunhos") {
  trocarCliente(id, { navegar: false });
  if (location.hash === "#/" + rota) roteador(); else location.hash = "#/" + rota;
}
