"use strict";

async function telaConfig() {
  const u = estado.usuario;
  const [usuarios, clientes, contas, convites] = await Promise.all([api("/api/empresa/usuarios"), api("/api/clientes"),
    estado.clienteId ? api("/api/contas").catch(() => []) : Promise.resolve([]), api("/api/empresa/convites").catch(() => [])]);
  const equipe = usuarios.filter((x) => x.papel !== "cliente");
  const nomeCliente = Object.fromEntries(clientes.map((c) => [c.id, c.nome]));
  const afiliados = contas.find((c) => c.plataforma === "shopee")?.shopee_afiliados_empresa;
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Configurações</h1><div class="suave">${h(u.empresa.nome)} · plano ${h(u.empresa.plano)}</div></div></div>
  <div class="pilha">
    <section class="cartao"><div class="linha entre"><h2 style="margin:0">${ic("usuarios", "p")}Equipe</h2>
        <div class="linha"><button class="sec pequeno" id="b-novo-usuario">${ic("mais", "p")}Criar com senha</button>
          <button class="pequeno" id="b-convidar">${ic("envelope", "p")}Convidar por e-mail</button></div></div>
      <p class="pequeno suave">Troque a função de cada pessoa direto na coluna <b>Função</b>. <b>Administrador</b>: acesso a tudo. <b>Operador</b>: cria e publica anúncios e acompanha as contas dos clientes atribuídos a ele.
        <b>Consultor</b>: acompanha o que o operador faz nos clientes atribuídos (painel, publicações, saúde, vendas e relatórios), sem editar, para levar às reuniões.
        Logins de cliente são criados em <a href="#/clientes">Clientes</a>.</p>
      <div class="tabela" style="margin:0 -20px -20px"><table><thead><tr><th>Nome</th><th>Função</th><th>Clientes</th><th>Situação</th><th></th></tr></thead><tbody>
        ${equipe.map((x) => `<tr class="${x.ativo ? "" : "inativo"}"><td><b>${h(x.nome)}</b><div class="pequeno suave">${h(x.email)}</div></td>
          <td>${x.id === u.id ? h(PAPEL[x.papel]) : `<select class="papel-inline" data-papel-inline="${x.id}" aria-label="Função de ${h(x.nome)}">
            ${["operador", "consultor", "admin"].map((p) => `<option value="${p}" ${p === x.papel ? "selected" : ""}>${PAPEL[p]}</option>`).join("")}</select>`}</td>
          <td class="pequeno">${x.papel === "admin" ? '<span class="suave">todos</span>' : x.clientes.length
            ? h(x.clientes.slice(0, 3).map((id) => nomeCliente[id] || "?").join(", ")) + (x.clientes.length > 3 ? ` +${x.clientes.length - 3}` : "") : '<span class="aviso-texto">nenhum</span>'}</td>
          <td>${x.ativo ? '<span class="selo ok">ativo</span>' : '<span class="selo erro">desativado</span>'}</td>
          <td style="text-align:right;white-space:nowrap">${x.id === u.id ? '<span class="suave pequeno">você</span>' : `
            ${ATRIBUIVEIS.includes(x.papel) ? `<button class="sec pequeno" data-clientes-op="${x.id}">Clientes</button>` : ""}
            <button class="sec pequeno" data-senha="${x.id}" title="Gera um link para a pessoa criar a própria senha">Link de senha</button>
            <button class="sec pequeno" data-sessoes="${x.id}" title="Desconecta a pessoa de todos os aparelhos">Sessões</button>
            ${x.dois_fatores ? `<button class="sec pequeno" data-zerar-2fa="${x.id}" title="Para quem perdeu o celular e os códigos">Zerar 2 etapas</button>` : ""}
            <button class="sec pequeno" data-ativar="${x.id}" data-ativo="${x.ativo ? 1 : 0}">${x.ativo ? "Desativar" : "Reativar"}</button>`}</td></tr>`).join("")}
      </tbody></table></div></section>
    <section class="cartao" id="sec-ferramentas"><h2>${ic("ajustes", "p")}Ferramentas de cada função</h2>
      <div class="carregando"><span class="girando"></span> Carregando…</div></section>
    <section class="cartao" id="sec-ia"><h2>${ic("brilho", "p")}IA e Padrão da casa</h2>
      <div class="carregando"><span class="girando"></span> Carregando…</div></section>
    <section class="cartao" id="sec-extensao"><h2>${ic("pesquisar", "p")}Extensão Monvatti Pro</h2>
      <div class="carregando"><span class="girando"></span> Carregando…</div></section>
    <section class="cartao" id="sec-seguranca"><h2>${ic("chave", "p")}Segurança dos acessos</h2>
      <div class="carregando"><span class="girando"></span> Carregando…</div></section>
    <section class="cartao" id="sec-lgpd"><h2>${ic("escudo", "p")}Privacidade (LGPD) e registro de acessos</h2>
      <div class="carregando"><span class="girando"></span> Carregando…</div></section>
    ${convites.length ? `<section class="cartao"><h2>${ic("envelope", "p")}Convites aguardando</h2>
      ${convites.map((c) => `<div class="lista-item" style="padding:8px 0"><div class="info"><b>${h(c.nome)}</b>
        <span class="pequeno suave">${h(c.email)} · ${h(PAPEL[c.papel])} · vale até ${data(c.expira_em)}</span></div>
        <button class="sec pequeno perigo-txt" data-cancelar-convite="${c.id}">Cancelar</button></div>`).join("")}
      <p class="pequeno suave" style="margin:8px 0 0">Para reenviar, convide o mesmo e-mail de novo: o link anterior deixa de valer.</p></section>` : ""}
    <section class="cartao"><h2>${selo("shopee")} API de Afiliados da Shopee <span class="suave pequeno">(vale para todos os clientes)</span></h2>
      <p class="pequeno suave">A Shopee só mostra produtos de outros vendedores pela API de Afiliados. Cadastre a Monvatti em <a href="https://affiliate.shopee.com.br/open_api" target="_blank" rel="noopener">affiliate.shopee.com.br</a> › Open API e copie o AppId e o Secret.
        ${afiliados ? " <b>Já configurada</b>; preencha para trocar." : ""}</p>
      <div class="grade g3" style="align-items:end">
        <div><label for="sp-app">AppId</label><input id="sp-app" type="text"></div>
        <div><label for="sp-secret">Secret</label><input id="sp-secret" type="password" autocomplete="off"></div>
        <div><button id="sp-afil">${ic("salvar", "p")}Salvar</button></div></div></section>
    <section class="cartao"><h2>${ic("chave", "p")}Usar pelo Claude (MCP)</h2>
      <p class="pequeno">Com o servidor MCP do Replique, você pede ao Claude em linguagem natural: <i>“para o cliente X, pesquise garrafa térmica no Mercado Livre, copie o mais vendido, melhore o título e me mostre antes de publicar”</i>. As ações aparecem no Painel como “Claude (MCP)”.</p>
      <div class="linha"><button id="b-chave">${u.empresa.tem_api_key ? "Gerar nova chave (a antiga para de funcionar)" : "Gerar chave MCP"}</button></div>
      <div id="chave" style="margin-top:10px"></div></section>
  </div>`;
  $("#b-novo-usuario").onclick = () => formNovoUsuario(clientes);
  $("#b-convidar").onclick = () => formConvite(clientes);
  $$("[data-cancelar-convite]").forEach((b) => (b.onclick = () => {
    if (!confirm("Cancelar este convite? O link enviado deixa de funcionar.")) return;
    comBotao(b, async () => {
      await api("/api/empresa/convites/" + b.dataset.cancelarConvite, { method: "DELETE" });
      toast("Convite cancelado.");
      telaConfig();
    });
  }));
  $$("[data-ativar]").forEach((b) => (b.onclick = () => {
    const ativo = b.dataset.ativo === "1";
    if (ativo && !confirm("Desativar este acesso? A pessoa sai na hora e não consegue mais entrar. O histórico dela continua.")) return;
    comBotao(b, async () => {
      await api("/api/empresa/usuarios/" + b.dataset.ativar, { method: "PATCH", body: { ativo: !ativo } });
      toast(ativo ? "Acesso desativado." : "Acesso reativado.");
      telaConfig();
    });
  }));
  $$("[data-senha]").forEach((b) => (b.onclick = () => comBotao(b, () => linkDeSenha(+b.dataset.senha, equipe.find((x) => x.id === +b.dataset.senha)?.nome || ""))));
  $$("[data-sessoes]").forEach((b) => (b.onclick = () => {
    if (!confirm("Desconectar esta pessoa de todos os aparelhos agora? Ela precisa entrar de novo.")) return;
    comBotao(b, async () => { await api(`/api/empresa/usuarios/${b.dataset.sessoes}/encerrar-sessoes`, { method: "POST" }); toast("Sessões encerradas."); });
  }));
  $$("[data-zerar-2fa]").forEach((b) => (b.onclick = () => {
    if (!confirm("Desligar a verificação em duas etapas desta pessoa? Faça isso só depois de confirmar quem ela é (por telefone ou pessoalmente).")) return;
    comBotao(b, async () => { await api(`/api/empresa/usuarios/${b.dataset.zerar2fa}/2fa/reset`, { method: "POST" }); toast("Desligada. A pessoa configura de novo ao entrar."); });
  }));
  $$("[data-clientes-op]").forEach((b) => (b.onclick = () => clientesDoOperador(equipe.find((x) => x.id === +b.dataset.clientesOp), clientes)));
  $$("[data-papel-inline]").forEach((sel) => (sel.onchange = async () => {
    const x = equipe.find((y) => y.id === +sel.dataset.papelInline);
    const novo = sel.value;
    if (!confirm(`Mudar ${x.nome} de ${PAPEL[x.papel]} para ${PAPEL[novo]}? A pessoa precisa entrar de novo e passa a ver as ferramentas da nova função.`)) {
      sel.value = x.papel;
      return;
    }
    sel.disabled = true;
    try {
      await api("/api/empresa/usuarios/" + x.id, { method: "PATCH", body: { papel: novo } });
      toast(`${x.nome} agora é ${PAPEL[novo].toLowerCase()}.`);
      telaConfig();
    } catch (e) { toast(e.message, true); sel.value = x.papel; sel.disabled = false; }
  }));
  desenharFerramentas();
  $("#sp-afil").onclick = () => comBotao($("#sp-afil"), async () => {
    await api("/api/contas/shopee/afiliados", { method: "POST", body: { app_id: $("#sp-app").value, secret: $("#sp-secret").value } });
    toast("API de Afiliados salva para todos os clientes.");
    telaConfig();
  });
  const b = $("#b-chave");
  b.onclick = () => comBotao(b, async () => {
    if (u.empresa.tem_api_key && !confirm("Gerar nova chave? A chave atual deixará de funcionar.")) return;
    const r = await api("/api/empresa/api-key", { method: "POST" });
    u.empresa.tem_api_key = true;
    $("#chave").innerHTML = `<div class="aviso azul">Copie agora. Ela <b>não será mostrada de novo</b>:</div><pre class="mono">${h(r.api_key)}</pre>`;
  });
  carregarSecaoIa().catch(() => {});
  carregarSecaoLgpd().catch(() => {});
  carregarSecaoSeguranca().catch(() => {});
  carregarSecaoExtensao().catch(() => {});
}

function listaClientesMarcaveis(clientes, marcados) {
  return `<input type="text" class="busca-marcaveis" placeholder="Filtrar clientes…" style="margin-bottom:8px">
    <div class="marcaveis">${clientes.filter((c) => c.ativo).map((c) => `<label class="marcavel" data-nome="${h(c.nome.toLowerCase())}">
      <input type="checkbox" value="${c.id}" ${marcados.includes(c.id) ? "checked" : ""}> ${h(c.nome)}</label>`).join("")
      || '<span class="suave pequeno">Nenhum cliente cadastrado ainda.</span>'}</div>`;
}
function ligarFiltroMarcaveis(raiz) {
  const busca = $(".busca-marcaveis", raiz);
  if (busca) busca.oninput = () => $$(".marcavel", raiz).forEach((l) => (l.hidden = !l.dataset.nome.includes(busca.value.trim().toLowerCase())));
}

function formNovoUsuario(clientes) {
  const m = modal(`<h2>Novo acesso da equipe</h2>
    <form id="f-usuario" class="pilha">
      <div class="grade g2">
        <div><label for="nu-n">Nome</label><input id="nu-n" name="nome" type="text" required></div>
        <div><label for="nu-e">E-mail</label><input id="nu-e" name="email" type="email" required></div>
        <div><label for="nu-s">Senha inicial</label><input id="nu-s" name="senha" type="password" minlength="8" required></div>
        <div><label for="nu-p">Papel</label><select id="nu-p" name="papel"><option value="operador">Operador</option><option value="consultor">Consultor</option><option value="admin">Administrador</option></select></div>
      </div>
      <div id="nu-clientes"><label>Clientes que ele atende</label>${listaClientesMarcaveis(clientes, [])}</div>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Criar acesso</button></div>
    </form>`);
  ligarFiltroMarcaveis(m);
  $("#nu-p", m).onchange = () => ($("#nu-clientes", m).hidden = !ATRIBUIVEIS.includes($("#nu-p", m).value));
  $("#f-usuario", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", m), async () => {
      const corpo = Object.fromEntries(new FormData(e.target));
      corpo.clientes = $$("#nu-clientes input:checked", m).map((i) => +i.value);
      await api("/api/empresa/usuarios", { method: "POST", body: corpo });
      toast("Acesso criado. Envie o e-mail e a senha inicial para a pessoa.");
      fecharModal();
      telaConfig();
    });
  };
}

function clientesDoOperador(op, clientes) {
  const m = modal(`<h2>Clientes de ${h(op.nome)}</h2>
    <p class="pequeno suave">${op.papel === "consultor" ? "O consultor só acompanha os clientes marcados." : "O operador só vê, pesquisa e publica nos clientes marcados."}</p>
    ${listaClientesMarcaveis(clientes, op.clientes)}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button><button id="salvar-clientes-op">Salvar</button></div>`);
  ligarFiltroMarcaveis(m);
  $("#salvar-clientes-op", m).onclick = () => comBotao($("#salvar-clientes-op", m), async () => {
    await api(`/api/empresa/usuarios/${op.id}/clientes`, { method: "PUT", body: { ids: $$(".marcavel input:checked", m).map((i) => +i.value) } });
    toast("Clientes atualizados.");
    fecharModal();
    telaConfig();
  });
}

function formConvite(clientes) {
  const m = modal(`<h2>${ic("envelope", "p")}Convidar para a equipe</h2>
    <p class="pequeno suave" style="margin-top:-6px">A pessoa recebe um link por e-mail, válido por alguns dias e de uso único, e cria o acesso
      com a conta Google desse e-mail ou com uma senha.</p>
    <form id="f-convite-eq" class="pilha">
      <div class="grade g2">
        <div><label for="ce-nome">Nome</label><input id="ce-nome" name="nome" type="text" required></div>
        <div><label for="ce-email">E-mail</label><input id="ce-email" name="email" type="email" required></div>
      </div>
      <div><label for="ce-papel">Papel</label><select id="ce-papel" name="papel"><option value="operador">Operador (cria e publica nos clientes marcados)</option>
        <option value="consultor">Consultor (acompanha os clientes marcados, sem editar)</option>
        <option value="admin">Administrador (todos os clientes e configurações)</option></select></div>
      <div id="ce-clientes"><label>Clientes que vai atender</label>${listaClientesMarcaveis(clientes, [])}</div>
      <label class="confirmacao" style="margin:0"><input type="checkbox" id="ce-enviar" checked> Enviar o convite por e-mail agora</label>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button>
        <button type="submit">${ic("envelope", "p")}Convidar</button></div>
    </form>`);
  ligarFiltroMarcaveis(m);
  $("#ce-papel", m).onchange = () => ($("#ce-clientes", m).hidden = !ATRIBUIVEIS.includes($("#ce-papel", m).value));
  $("#f-convite-eq", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", m), async () => {
      const corpo = { ...Object.fromEntries(new FormData(e.target)), enviar_email: $("#ce-enviar", m).checked,
        clientes: $$("#ce-clientes .marcavel input:checked", m).map((i) => +i.value) };
      const r = await api("/api/empresa/convites", { method: "POST", body: corpo });
      mostrarConviteCriado(r);
      if (estado._rotaAtual === "config") telaConfig();
    });
  };
}

function mostrarConviteCriado(r, aoFechar = null) {
  const m = modal(`<h2>${ic("envelope", "p")}Convite criado</h2>
    ${r.email_enviado ? `<div class="aviso verde">E-mail enviado para <b>${h(r.email)}</b>.</div>`
      : `<div class="aviso amarelo">O e-mail não foi enviado (${h(r.motivo)}). Copie o link abaixo e mande para <b>${h(r.email)}</b>.</div>`}
    <label for="link-convite-criado">Link do convite (só aparece agora)</label>
    <div class="linha"><input id="link-convite-criado" type="text" readonly value="${h(r.url)}" style="flex:1">
      <button class="sec" id="copiar-convite">Copiar</button></div>
    <p class="pequeno suave">Vale até ${data(r.expira_em)} e só pode ser usado uma vez, pelo e-mail convidado.</p>
    <div class="linha" style="justify-content:flex-end"><button id="convite-ok">Fechar</button></div>`);
  $("#copiar-convite", m).onclick = async () => {
    try { await navigator.clipboard.writeText(r.url); toast("Link copiado."); }
    catch { $("#link-convite-criado", m).select(); toast("Selecione e copie com Ctrl+C.", true); }
  };
  $("#convite-ok", m).onclick = () => { fecharModal(); if (aoFechar) aoFechar(); };
}

async function carregarSecaoIa() {
  const alvo = $("#sec-ia");
  if (!alvo) return;
  const [s, lista] = await Promise.all([api("/api/ia/situacao"), api("/api/exemplos")]);
  const nomeImg = { openai: "OpenAI", gemini: "Google Gemini" }[s.imagem];
  alvo.innerHTML = `<h2>${ic("brilho", "p")}IA e Padrão da casa</h2>
    <div class="grade g2">
      <div class="aviso ${s.texto ? "azul" : "amarelo"}" style="margin:0"><b>Texto (títulos, descrições, respostas):</b>
        ${s.texto ? `ligado, modelo <b>${h(s.modelo_texto)}</b>. Análises e resumos usam <b>${h(s.modelo_analise)}</b>.`
          : `desligado. Sem a chave, o Replique escreve pelas regras automáticas (tira palavras proibidas, corrige maiúsculas e o tamanho).
            Para ligar: crie uma chave em console.anthropic.com, coloque no arquivo <code>.env</code> como <code>ANTHROPIC_API_KEY=…</code> e reinicie o iniciar.bat.`}</div>
      <div class="aviso ${s.imagem ? "azul" : "amarelo"}" style="margin:0"><b>Fotos geradas:</b>
        ${s.imagem ? `ligado, <b>${nomeImg}</b>, modelo <b>${h(s.modelo_imagem)}</b>.${s.provedor_escolhido ? "" : " Escolhido automaticamente pela chave que existe; para fixar, use IMAGENS_PROVEDOR."}`
          : `desligado. Sem a chave, saem só o fundo branco (quando a foto já tem fundo liso), os destaques e a ficha técnica.
            Para ligar: crie uma chave na OpenAI (platform.openai.com) ou no Google AI Studio (aistudio.google.com), coloque no <code>.env</code>
            como <code>OPENAI_API_KEY=…</code> ou <code>GEMINI_API_KEY=…</code> e reinicie o iniciar.bat. Com as duas, escolha em <code>IMAGENS_PROVEDOR</code>.`}</div>
    </div>
    <div class="linha entre" style="margin-top:14px"><div><b>Padrão da casa da agência</b>
      <div class="pequeno suave">Fórmula de título, modelo de descrição, tom de voz, palavras proibidas e obrigatórias e estilo das fotos. A IA segue este guia;
        cada cliente pode ter o próprio em Clientes › Gerenciar.</div></div>
      <button type="button" class="sec" id="b-padrao-agencia">${ic("lapis", "p")}Editar padrão</button></div>
    <h3 style="margin-top:16px">Uso de IA neste mês</h3>
    ${s.uso_clientes?.length ? `<div class="tabela embutida"><table><thead><tr><th>Cliente</th><th class="num">Chamadas de texto</th><th class="num">Imagens</th></tr></thead><tbody>
      ${s.uso_clientes.map((x) => `<tr><td>${h(x.cliente)}</td>
        <td class="num ${x.pct_chamadas >= 80 ? "ruim" : ""}">${numero(x.chamadas)} / ${numero(x.limite_chamadas)}</td>
        <td class="num ${x.pct_imagens >= 80 ? "ruim" : ""}">${numero(x.imagens)} / ${numero(x.limite_imagens)}</td></tr>`).join("")}</tbody></table></div>
      <p class="pequeno suave">Limites por cliente e mês em <code>IA_LIMITE_CHAMADAS_MES</code> e <code>IA_LIMITE_IMAGENS_MES</code>; aviso a partir de ${"80"}% no sino.</p>`
      : '<p class="pequeno suave">Nenhum uso de IA neste mês.</p>'}
    <h3 style="margin-top:16px">Exemplos aprovados <span class="suave pequeno">(a IA usa até 3 da mesma categoria como referência)</span></h3>
    ${lista.length ? lista.slice(0, 15).map((e) => `<div class="lista-item" style="padding:8px 0"><div class="info"><b>${h(e.titulo)}</b>
        <span class="pequeno suave">${h(e.origem_nome)}${e.categoria ? " · categoria " + h(e.categoria) : ""} · ${data(e.criado_em)}</span></div>
        <button type="button" class="sec pequeno" data-tirar-exemplo="${e.id}">Tirar</button></div>`).join("")
      : '<p class="pequeno suave">Nenhum ainda. Em Meus Anúncios, use "Aprovar como modelo" num anúncio bom; no editor, depois de ajustar um texto da IA, use "Salvar como exemplo".</p>'}`;
  $("#b-padrao-agencia").onclick = () => formPadraoCasa(null, "da agência");
  $$("[data-tirar-exemplo]", alvo).forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await api(`/api/exemplos/${b.dataset.tirarExemplo}`, { method: "DELETE" });
    toast("Exemplo retirado.");
    carregarSecaoIa();
  })));
}

async function formPadraoCasa(clienteId, rotulo) {
  const r = await api("/api/padrao-casa" + (clienteId ? `?cliente_id=${clienteId}` : ""));
  const p = r.padrao;
  const lista = (v) => (v || []).join(", ");
  const m = modal(`<h2>${ic("brilho", "p")}Padrão da casa ${h(rotulo)}</h2>
    ${clienteId ? `<div class="aviso azul pequeno">O que ficar em branco vem do padrão da agência. Palavras proibidas e obrigatórias se somam às da agência.</div>` : ""}
    <form id="f-padrao" class="pilha">
      <div><label>Fórmula de título por marketplace</label>
        <div class="grade g3">${Object.entries(PLAT).map(([k, x]) => `<div><label for="pc-t-${k}" class="pequeno">${x.nome}</label>
          <input id="pc-t-${k}" data-formula="${k}" maxlength="300" value="${h(p.titulo_formula[k] || "")}" placeholder="Produto + Marca + Modelo + Diferencial"></div>`).join("")}</div></div>
      <div><label for="pc-desc">Modelo de descrição</label><textarea id="pc-desc" rows="6" maxlength="3000" placeholder="Abertura de 1 frase&#10;• Características&#10;Na caixa:&#10;Garantia:">${h(p.modelo_descricao)}</textarea></div>
      <div><label for="pc-tom">Tom de voz</label><input id="pc-tom" maxlength="500" value="${h(p.tom_voz)}" placeholder="ex.: direto e técnico, sem exageros"></div>
      <div class="grade g2">
        <div><label for="pc-proib">Palavras proibidas (separe por vírgula)</label><textarea id="pc-proib" rows="2">${h(lista(p.palavras_proibidas))}</textarea></div>
        <div><label for="pc-obrig">Palavras obrigatórias (separe por vírgula)</label><textarea id="pc-obrig" rows="2">${h(lista(p.palavras_obrigatorias))}</textarea></div>
      </div>
      <div><label>Estilo das fotos</label><div class="grade g2">
        <div><label for="pc-fundo" class="pequeno">Fundo (ficha técnica)</label><input id="pc-fundo" data-foto="fundo" maxlength="300" value="${h(p.fotos.fundo)}" placeholder="ex.: fundo cinza claro liso"></div>
        <div><label for="pc-cena" class="pequeno">Cenário padrão (foto em contexto)</label><input id="pc-cena" data-foto="cenario" maxlength="300" value="${h(p.fotos.cenario)}" placeholder="ex.: cozinha clara, luz natural"></div>
        <div><label for="pc-selos" class="pequeno">Selos usados pela casa</label><input id="pc-selos" data-foto="selos" maxlength="300" value="${h(p.fotos.selos)}" placeholder="ex.: Frete grátis, Garantia de 1 ano"></div>
        <div><label for="pc-dest" class="pequeno">O que destacar nas fotos</label><input id="pc-dest" data-foto="destaques" maxlength="300" value="${h(p.fotos.destaques)}" placeholder="ex.: medidas e material primeiro"></div>
      </div></div>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Salvar padrão</button></div>
    </form>`);
  m.classList.add("largo");
  $("#f-padrao", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-padrao button[type=submit]", m), async () => {
      const separar = (v) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
      await api("/api/padrao-casa" + (clienteId ? `?cliente_id=${clienteId}` : ""), { method: "PUT", body: {
        titulo_formula: Object.fromEntries($$("[data-formula]", m).map((i) => [i.dataset.formula, i.value])),
        modelo_descricao: $("#pc-desc", m).value, tom_voz: $("#pc-tom", m).value,
        palavras_proibidas: separar($("#pc-proib", m).value), palavras_obrigatorias: separar($("#pc-obrig", m).value),
        fotos: Object.fromEntries($$("[data-foto]", m).map((i) => [i.dataset.foto, i.value])) } });
      fecharModal();
      toast("Padrão da casa salvo. As próximas gerações da IA já seguem este guia.");
    });
  };
}

async function aprovarComoModelo(anuncioId, botao, extra = {}) {
  await comBotao(botao, async () => {
    await api(`/api/anuncios/${anuncioId}/exemplo`, { method: "POST", body: extra });
    toast(extra.origem === "editado" ? "Salvo como exemplo. A IA vai usar este texto como referência." : "Aprovado como modelo. A IA vai usar este anúncio como referência na mesma categoria.");
  });
}
