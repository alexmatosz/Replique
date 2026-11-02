"use strict";

const linkConvite = (token) => `${location.origin}/#/convite/${token}`;

async function telaClientes() {
  const [clientes, usuarios, convite] = await Promise.all([api("/api/clientes"), api("/api/empresa/usuarios"), api("/api/empresa/convite")]);
  estado.clientesInfo = clientes;
  const operadores = usuarios.filter((u) => ATRIBUIVEIS.includes(u.papel) && u.ativo);
  const semOperador = clientes.filter((c) => c.ativo && !c.operadores.length);
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Clientes</h1>
    <div class="suave">Cada cliente tem as próprias contas de marketplace, rascunhos e publicações. ${clientes.filter((c) => c.ativo).length} ativo(s).</div></div>
    <button id="novo-cliente">${ic("mais")}Novo cliente</button></div>
  <section class="cartao convite" style="margin-bottom:16px">
    <div class="linha entre"><h2 style="margin:0">${ic("contas", "p")}Link de cadastro para lojistas</h2>
      <button class="sec pequeno" id="trocar-link" title="Use se o link vazou: o atual para de funcionar">Gerar outro link</button></div>
    <p class="pequeno suave" style="margin:6px 0 10px">Envie este link ao lojista. Ele cria a loja e o próprio login, conecta o Mercado Livre e a loja aparece aqui como <b>novo</b>. Aí é só atribuir o operador.</p>
    <div class="linha"><input type="text" id="link-convite" readonly value="${h(linkConvite(convite.token))}" style="flex:1;min-width:260px;font-family:inherit">
      <button id="copiar-link">${ic("copiar", "p")}Copiar link</button></div>
    ${location.hostname === "127.0.0.1" || location.hostname === "localhost" ? `<p class="pequeno aviso-texto" style="margin:8px 0 0">${ic("alerta", "p")} Este endereço só abre neste computador. Para o lojista abrir de fora, o Replique precisa estar hospedado num domínio (ex.: replique.monvatti.com.br).</p>` : ""}
  </section>
  ${semOperador.length ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>${semOperador.length} cliente(s) sem operador:</b> ${semOperador.slice(0, 6).map((c) => h(c.nome)).join(", ")}${semOperador.length > 6 ? "…" : ""}.
    Clique em <b>Gerenciar</b> para atribuir quem vai atender.</div>` : ""}
  <div class="cartao">
    ${clientes.length ? `<input type="text" id="busca-clientes" placeholder="Buscar cliente…" style="margin-bottom:14px;max-width:360px">
    <div class="tabela"><table><thead><tr><th>Cliente</th><th>Mercado Livre</th><th>Equipe</th><th class="num">Rascunhos</th><th class="num">Publicados</th><th></th></tr></thead>
      <tbody id="linhas-clientes"></tbody></table></div>`
      : vazio("loja", "Nenhum cliente ainda", "Cadastre o primeiro cliente: depois crie o login dele para que ele autorize a conta do Mercado Livre.")}
  </div>`;
  $("#novo-cliente").onclick = () => formNovoCliente();
  ligarConvite();
  const corpo = $("#linhas-clientes");
  if (!corpo) return;
  const desenhar = () => {
    const termo = $("#busca-clientes").value.trim().toLowerCase();
    corpo.innerHTML = clientes.filter((c) => c.nome.toLowerCase().includes(termo)).map((c) => `<tr class="${c.ativo ? "" : "inativo"}">
      <td><b>${h(c.nome)}</b> ${c.origem === "convite" && !c.operadores.length ? '<span class="selo neutro">novo · cadastro próprio</span>' : ""}
        ${c.ativo ? "" : ' <span class="selo erro">inativo</span>'}
        <div class="pequeno suave">${c.documento ? h(c.documento) + " · " : ""}desde ${quando(c.criado_em).toLocaleDateString("pt-BR")}</div></td>
      <td><div class="linha" style="gap:8px;flex-wrap:nowrap">${pontoML(c)}<span class="pequeno">${c.ml?.conectada ? h(c.ml.apelido) : "não conectado"}</span></div></td>
      <td class="pequeno">${c.operadores.length ? h(c.operadores.join(", ")) : '<span class="aviso-texto">nenhum operador</span>'}
        ${c.consultores?.length ? `<div class="suave">consultor: ${h(c.consultores.join(", "))}</div>` : ""}</td>
      <td class="num">${numero(c.rascunhos)}</td><td class="num"><b>${numero(c.publicados)}</b></td>
      <td style="text-align:right;white-space:nowrap">${c.ativo ? `<button class="sec pequeno" data-usar="${c.id}">${ic("trocar", "p")}Trabalhar</button>` : ""}
        <button class="sec pequeno" data-gerir="${c.id}">${ic("config", "p")}Gerenciar</button></td></tr>`).join("")
      || `<tr><td colspan="6" class="suave">Nenhum cliente com esse nome.</td></tr>`;
    $$("[data-usar]", corpo).forEach((b) => (b.onclick = () => { trocarCliente(+b.dataset.usar, { navegar: false }); location.hash = "#/rascunhos"; }));
    $$("[data-gerir]", corpo).forEach((b) => (b.onclick = () => comBotao(b, () => gerirCliente(+b.dataset.gerir, operadores))));
  };
  $("#busca-clientes").oninput = desenhar;
  desenhar();
}

function ligarConvite() {
  const copiar = $("#copiar-link");
  if (!copiar) return;
  copiar.onclick = async () => {
    const campo = $("#link-convite");
    try { await navigator.clipboard.writeText(campo.value); } catch { campo.select(); document.execCommand("copy"); }
    toast("Link copiado. Envie ao lojista.");
  };
  $("#trocar-link").onclick = () => {
    if (!confirm("Gerar outro link? O link atual para de funcionar (quem já se cadastrou não é afetado).")) return;
    comBotao($("#trocar-link"), async () => {
      const r = await api("/api/empresa/convite", { method: "POST" });
      $("#link-convite").value = linkConvite(r.token);
      toast("Novo link gerado. O anterior foi desativado.");
    });
  };
}

async function atualizarMe() {
  const me = await api("/api/me");
  estado.usuario = me;
  if (!me.clientes.some((c) => c.id === estado.clienteId && c.ativo)) escolherClienteInicial();
  await carregarClientesInfo();
  desenharSeletor();
}

function formNovoCliente() {
  const m = modal(`<h2>Novo cliente</h2>
    <form id="f-cliente" class="pilha">
      <div class="grade g2"><div><label for="nc-nome">Nome da loja</label><input id="nc-nome" name="nome" type="text" required></div>
        <div><label for="nc-doc">CNPJ/CPF <span class="suave">(opcional)</span></label><input id="nc-doc" name="documento" type="text"></div></div>
      <div class="aviso azul pequeno" style="margin:0">Depois de cadastrar, crie o <b>login do cliente</b>: é com ele que o lojista entra e autoriza a conta do Mercado Livre, sem passar a senha para a equipe.</div>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Cadastrar</button></div>
    </form>`);
  $("#nc-nome", m).focus();
  $("#f-cliente", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", m), async () => {
      const r = await api("/api/clientes", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      await atualizarMe();
      toast(`Cliente ${r.nome} cadastrado.`);
      fecharModal();
      if (estado._rotaAtual === "clientes") await telaClientes();
      const ops = (await api("/api/empresa/usuarios")).filter((u) => ATRIBUIVEIS.includes(u.papel) && u.ativo);
      gerirCliente(r.id, ops);
    });
  };
}

async function gerirCliente(id, operadores) {
  const c = await api("/api/clientes/" + id);
  const m = modal(`<div class="linha entre"><h2 style="margin:0">${h(c.nome)}</h2>${c.ativo ? '<span class="selo ok">ativo</span>' : '<span class="selo erro">inativo</span>'}</div>
    <p class="suave pequeno">Cliente desde ${data(c.criado_em)} · Mercado Livre: ${c.ml?.conectada ? `<b>${h(c.ml.apelido)}</b>` : "não conectado"}</p>
    <form id="f-dados" class="grade g2" style="align-items:end">
      <div><label for="gc-nome">Nome</label><input id="gc-nome" name="nome" type="text" value="${h(c.nome)}" required></div>
      <div><label for="gc-doc">CNPJ/CPF</label><input id="gc-doc" name="documento" type="text" value="${h(c.documento)}"></div>
      <div><label for="gc-inicio">Início da assessoria</label><input id="gc-inicio" type="date" value="${h(c.inicio_assessoria || "")}">
        <div class="pequeno suave">Conta o faturamento com a Monvatti a partir desta data.</div></div><div></div>
      <label class="confirmacao" style="grid-column:1/-1;margin:0"><input type="checkbox" id="gc-aprovacao" ${c.exige_aprovacao ? "checked" : ""}>
        O lojista aprova cada anúncio antes da publicação</label>
      <label class="confirmacao" style="grid-column:1/-1;margin:0"><input type="checkbox" id="gc-vendas" ${c.vendas_lucro ? "checked" : ""}>
        <span><b>Liberar o módulo Vendas e Lucro</b> <span class="pequeno suave">· vendas, custos, resultado do mês e analista. Desligado, o cliente
        e a equipe não veem essas telas e o Replique não sincroniza vendas dele (não gasta chamadas de API).</span></span></label>
      <label class="confirmacao" style="grid-column:1/-1;margin:0"><input type="checkbox" id="gc-estudo" ${c.estudo ? "checked" : ""}>
        <span><b>Cliente interno de estudo</b> <span class="pequeno suave">· a conta do Mercado Livre dele é usada só pela extensão Monvatti Pro para estudar
        concorrentes. Não recebe rascunhos nem publicações.</span></span></label>
      <div class="linha" style="grid-column:1/-1;justify-content:space-between"><button type="button" class="sec pequeno" id="gc-padrao">${ic("brilho", "p")}Padrão da casa deste cliente</button>
        <button type="submit" class="sec pequeno">${ic("salvar", "p")}Salvar dados</button></div>
    </form>
    <h3 style="margin-top:8px">${ic("usuarios", "p")} Equipe que atende este cliente</h3>
    <p class="pequeno suave" style="margin-top:-4px">Administradores atendem todos. Operadores e consultores só veem os clientes marcados aqui.</p>
    <div class="chips" id="gc-ops">${operadores.length ? operadores.map((u) => `<label class="chip ${c.operadores.includes(u.id) ? "marcado" : ""}">
        <input type="checkbox" value="${u.id}" ${c.operadores.includes(u.id) ? "checked" : ""}> ${h(u.nome)} <span class="suave pequeno">${h(PAPEL[u.papel])}</span></label>`).join("")
      : '<span class="suave pequeno">Nenhum operador cadastrado. Crie em Configurações.</span>'}</div>
    ${operadores.length ? `<div class="linha" style="justify-content:flex-end;margin-top:8px"><button class="sec pequeno" id="gc-salvar-ops">${ic("salvar", "p")}Salvar equipe</button></div>` : ""}
    <h3 style="margin-top:8px">${ic("escudo", "p")} Login do cliente</h3>
    <p class="pequeno suave" style="margin-top:-4px">O lojista entra com este acesso, acompanha o projeto, tira dúvidas em cada página, autoriza as contas dos marketplaces e aprova os anúncios. Ele não publica.</p>
    ${c.logins.length ? c.logins.map((u) => `<div class="lista-item" style="padding:8px 0"><div class="info"><b>${h(u.nome)}</b><span class="pequeno suave">${h(u.email)}</span></div>
        ${u.ativo ? '<span class="selo ok">ativo</span>' : '<span class="selo erro">desativado</span>'}
        <button class="sec pequeno" data-alternar="${u.id}" data-ativo="${u.ativo ? 1 : 0}">${u.ativo ? "Desativar" : "Reativar"}</button></div>`).join("")
      : '<p class="pequeno suave">Nenhum login criado ainda.</p>'}
    <form id="f-login-cliente" class="grade g3" style="align-items:end;margin-top:8px">
      <div><label for="lc-n">Nome</label><input id="lc-n" name="nome" type="text" required></div>
      <div><label for="lc-e">E-mail</label><input id="lc-e" name="email" type="email" required></div>
      <div><label for="lc-s">Senha inicial</label><input id="lc-s" name="senha" type="password" minlength="8" required></div>
      <div class="linha" style="grid-column:1/-1;justify-content:flex-end"><button type="submit" class="pequeno">${ic("mais", "p")}Criar login do cliente</button></div>
    </form>
    ${c.ferramentas ? `<h3 style="margin-top:14px">${ic("ajustes", "p")} Ferramentas do login do cliente</h3>
    <p class="pequeno suave" style="margin-top:-4px">Escolha o que este lojista pode usar sozinho. Desmarcado some do menu dele e é bloqueado no servidor.
      As ferramentas que a função Cliente não tem em Configurações não aparecem aqui.</p>
    <div class="chips chips-pequenos" id="gc-ferr">${c.ferramentas.possiveis.map((f) => {
      const on = !c.ferramentas.desligadas.includes(f.id);
      return `<label class="chip ${on ? "marcado" : ""}"><input type="checkbox" value="${f.id}" ${on ? "checked" : ""}> ${h(f.nome)}</label>`;
    }).join("")}</div>
    <div class="linha" style="justify-content:flex-end;margin-top:8px"><button class="sec pequeno" id="gc-salvar-ferr">${ic("salvar", "p")}Salvar ferramentas</button></div>` : ""}
    <div class="linha entre" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--borda)">
      <button class="sec pequeno ${c.ativo ? "perigo-txt" : ""}" id="gc-ativo">${c.ativo ? "Desativar cliente" : "Reativar cliente"}</button>
      <button data-fechar>Fechar</button></div>`);
  const recarregar = async (msg) => {
    toast(msg);
    await atualizarMe();
    if (estado._rotaAtual === "clientes") await telaClientes();
    gerirCliente(id, operadores);
  };
  $$("#gc-ops input, #gc-ferr input", m).forEach((i) => (i.onchange = () => i.parentElement.classList.toggle("marcado", i.checked)));
  const salvarFerr = $("#gc-salvar-ferr", m);
  if (salvarFerr) salvarFerr.onclick = () => comBotao(salvarFerr, async () => {
    await api("/api/clientes/" + id, { method: "PATCH", body: { ferramentas_off: $$("#gc-ferr input", m).filter((i) => !i.checked).map((i) => i.value) } });
    await recarregar("Ferramentas do cliente salvas. O lojista vê a mudança ao recarregar a página.");
  });
  $("#gc-padrao", m).onclick = () => formPadraoCasa(id, `de ${c.nome}`);
  $("#f-dados", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-dados button", m), async () => {
      await api("/api/clientes/" + id, { method: "PATCH", body: { ...Object.fromEntries(new FormData(e.target)),
        exige_aprovacao: $("#gc-aprovacao", m).checked, vendas_lucro: $("#gc-vendas", m).checked, estudo: $("#gc-estudo", m).checked,
        inicio_assessoria: $("#gc-inicio", m).value || null } });
      const info = (estado.usuario.clientes || []).find((x) => x.id === id);
      if (info) info.vendas_lucro = $("#gc-vendas", m).checked;
      const ci = (estado.clientesInfo || []).find((x) => x.id === id);
      if (ci) ci.vendas_lucro = $("#gc-vendas", m).checked;
      redesenharMenu();
      await recarregar("Dados salvos.");
    });
  };
  const salvarOps = $("#gc-salvar-ops", m);
  if (salvarOps) salvarOps.onclick = () => comBotao(salvarOps, async () => {
    await api(`/api/clientes/${id}/operadores`, { method: "PUT", body: { ids: $$("#gc-ops input:checked", m).map((i) => +i.value) } });
    await recarregar("Equipe do cliente atualizada.");
  });
  $("#f-login-cliente", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-login-cliente button", m), async () => {
      await api(`/api/clientes/${id}/logins`, { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      await recarregar("Login criado. Envie o e-mail e a senha inicial ao cliente.");
    });
  };
  $$("[data-alternar]", m).forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await api("/api/empresa/usuarios/" + b.dataset.alternar, { method: "PATCH", body: { ativo: b.dataset.ativo !== "1" } });
    await recarregar("Acesso atualizado.");
  })));
  $("#gc-ativo", m).onclick = () => {
    if (c.ativo && !confirm(`Desativar ${c.nome}? Os logins do cliente param de funcionar e ele some do seletor da equipe. Nada é apagado.`)) return;
    comBotao($("#gc-ativo", m), async () => {
      await api("/api/clientes/" + id, { method: "PATCH", body: { ativo: !c.ativo } });
      await recarregar(c.ativo ? "Cliente desativado." : "Cliente reativado.");
    });
  };
}

const PAPEIS_FERRAMENTAS = ["operador", "consultor", "cliente"];

async function desenharFerramentas() {
  const sec = $("#sec-ferramentas");
  if (!sec) return;
  let d;
  try { d = await api("/api/empresa/ferramentas"); } catch (e) { sec.innerHTML += `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  const grupos = [...new Set(d.ferramentas.map((f) => f.grupo))];
  sec.innerHTML = `<div class="linha entre"><h2 style="margin:0">${ic("ajustes", "p")}Ferramentas de cada função</h2>
      <button class="pequeno" id="ferr-salvar">${ic("salvar", "p")}Salvar ferramentas</button></div>
    <p class="pequeno suave">Marque o que cada função pode usar. O que ficar desmarcado some do menu e é bloqueado no servidor.
      Administradores sempre têm todas. Traço significa que a ferramenta não faz sentido para a função (ex.: o consultor não publica).</p>
    <div class="tabela" style="margin:0 -20px -20px"><table class="tabela-ferramentas"><thead><tr><th>Ferramenta</th>
      ${PAPEIS_FERRAMENTAS.map((p) => `<th class="centro">${PAPEL[p]}<div><button type="button" class="link-sutil" data-todas="${p}">marcar todas</button></div></th>`).join("")}</tr></thead><tbody>
      ${grupos.map((g) => `<tr class="grupo"><td colspan="${PAPEIS_FERRAMENTAS.length + 1}">${h(g)}</td></tr>
        ${d.ferramentas.filter((f) => f.grupo === g).map((f) => `<tr><td>${h(f.nome)}</td>
          ${PAPEIS_FERRAMENTAS.map((p) => d.papeis[p].possiveis.includes(f.id)
            ? `<td class="centro"><input type="checkbox" data-papel-f="${p}" value="${f.id}" ${d.papeis[p].liberadas.includes(f.id) ? "checked" : ""}
                aria-label="${h(f.nome)} para ${PAPEL[p]}"></td>`
            : '<td class="centro suave">—</td>').join("")}</tr>`).join("")}`).join("")}
    </tbody></table></div>`;
  $$("[data-todas]", sec).forEach((b) => (b.onclick = () => {
    const caixas = $$(`[data-papel-f="${b.dataset.todas}"]`, sec);
    const todas = caixas.every((c) => c.checked);
    caixas.forEach((c) => (c.checked = !todas));
  }));
  $("#ferr-salvar", sec).onclick = () => comBotao($("#ferr-salvar", sec), async () => {
    const desligadas = Object.fromEntries(PAPEIS_FERRAMENTAS.map((p) => [p, $$(`[data-papel-f="${p}"]`, sec).filter((c) => !c.checked).map((c) => c.value)]));
    await api("/api/empresa/ferramentas", { method: "PUT", body: { desligadas } });
    toast("Ferramentas salvas. Quem estiver com o Replique aberto vê a mudança ao recarregar a página.");
  });
}
