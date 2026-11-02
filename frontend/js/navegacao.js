"use strict";

const ALIAS_ROTA = { projeto: "acompanhamento", tarefas: "inicio", lotes: "rascunhos", publicacoes: "anuncios" };
const ROTAS_VENDAS = new Set(["vendas", "lucratividade", "dre", "lucro", "produtos", "despesas", "impostos", "analise"]);
const PERMITIDAS = {
  admin: ["novidades", "inicio", "pedidos", "acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "pesquisar", "rascunhos", "clonador", "fotos", "promocoes", "anuncios", "editor", "full", "contas", "clientes", "config",
    "saude", "perguntas", "radar", "monitor", "concorrentes", "lucro", "produtos", "despesas", "impostos", "analise"],
  operador: ["novidades", "inicio", "pedidos", "acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "pesquisar", "rascunhos", "clonador", "fotos", "promocoes", "anuncios", "editor", "full", "contas", "saude", "perguntas", "radar", "monitor", "concorrentes",
    "lucro", "produtos", "despesas", "impostos", "analise"],
  consultor: ["novidades", "inicio", "pedidos", "acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "rascunhos", "fotos", "promocoes", "anuncios", "full", "saude", "perguntas", "radar", "monitor", "concorrentes", "lucro", "produtos",
    "despesas", "impostos", "analise"],
  cliente: ["novidades", "acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "rascunhos", "anuncios", "full", "contas", "saude", "lucro", "produtos", "despesas", "impostos", "analise"],
};
const INICIAL = { admin: "inicio", operador: "inicio", consultor: "inicio", cliente: "acompanhamento" };
const PRECISA_CLIENTE = new Set(["pesquisar", "rascunhos", "anuncios", "clonador", "vendas", "lucratividade", "dre", "full", "contas", "radar", "monitor", "concorrentes",
  "lucro", "produtos", "despesas", "impostos"]);

window.addEventListener("hashchange", roteador);
window.addEventListener("beforeunload", (e) => { if (estado.sujo) { e.preventDefault(); e.returnValue = ""; } });

async function roteador() {
  let [nome, param] = location.hash.replace(/^#\/?/, "").split("/");
  if (nome === "relatorio") {
    param = param || "relatorio";
    nome = "acompanhamento";
    history.replaceState(null, "", "#/acompanhamento/" + param);
  }
  if (ALIAS_ROTA[nome]) {
    nome = estado.usuario?.papel !== "cliente" && nome === "projeto" ? "inicio" : ALIAS_ROTA[nome];
    param = undefined;
    history.replaceState(null, "", "#/" + nome);
  }
  if (estado.sujo && estado._rotaAtual === "editor" && nome !== "editor") {
    if (!confirm("Há alterações não salvas no rascunho. Sair mesmo assim?")) {
      history.replaceState(null, "", "#/editor/" + estado.anuncio.id);
      return;
    }
    estado.sujo = false;
  }
  if (nome === "convite") return telaConvite(param);
  if (nome === "nova-senha") return telaNovaSenha(param);
  if (nome === "privacidade" || nome === "termos") return telaLegal(nome);
  if (nome === "colaborador") return telaColaborador(param);
  if (nome === "google") return entrarComGoogle(param);
  if (nome === "google-erro") return telaEntrar("login", param);
  if (nome === "nova-agencia" && !estado.usuario) {
    const atual = await sessaoAtual();
    if (!atual) return telaEntrar("agencia");
  }
  if (!estado.usuario) {
    try {
      estado.usuario = await sessaoAtual();
      if (!estado.usuario) throw new Error("sem sessão");
      if (!Array.isArray(estado.usuario.clientes)) {
        estado.usuario = null;
        $("#app").innerHTML = `<div class="entrar" style="grid-template-columns:1fr"><div class="form"><div class="caixa cartao">
          <h2>Reinicie o Replique</h2><p class="suave">A tela foi atualizada, mas o servidor ainda é da versão anterior.
          Feche a janela do <b>iniciar.bat</b> e abra de novo; depois recarregue esta página.</p></div></div></div>`;
        return;
      }
      escolherClienteInicial();
      carregarClientesInfo();
    } catch {}
  }
  if (!estado.usuario) { estado.chatPagina = null; fecharChat(); return telaEntrar(); }
  const papel = estado.usuario.papel;
  const permitidas = rotasLiberadas();
  const rota = permitidas.includes(nome) ? nome : permitidas.includes(INICIAL[papel]) ? INICIAL[papel] : permitidas[0] || "painel";
  if (rota !== nome) history.replaceState(null, "", "#/" + rota);
  if (estado._rotaAtual !== rota && $("#tour") && !$("#tour").hidden) encerrarTour();
  estado._rotaAtual = rota;
  casca(rota);
  try {
    if (PRECISA_CLIENTE.has(rota) && !estado.clienteId) await telaEscolherCliente(rota);
    else await rotas[rota](param);
  } catch (e) {
    if (!estado.usuario) return;
    if (e.status === 409) await telaEscolherCliente(rota);
    else $("#tela").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`;
  }
  animarTela();
  if (TAREFA_POR_TELA[rota] && rota !== "perguntas") mostrarAtualizado(TAREFA_POR_TELA[rota]);
  tourAutomatico(rota);
  ligarChatDaPagina(rota, param);
  atualizarNaoLidas();
  carregarPendencias();
  contarNovidades();
  pedirAceite();
  exigirConfigurar2fa();
}

const FERRAMENTA_DA_ROTA = { editor: "rascunhos", anuncios: "publicacoes", vendas: "lucro", dre: "lucro", lucratividade: "produtos" };
function rotasLiberadas() {
  const u = estado.usuario;
  const base = (PERMITIDAS[u.papel] || []).filter((r) => !ROTAS_VENDAS.has(r) || vendasLiberadas());
  if (u.papel === "admin" || !Array.isArray(u.ferramentas)) return base;
  return base.filter((r) => { const f = FERRAMENTA_DA_ROTA[r] || r; return !TODAS_FERRAMENTAS.has(f) || u.ferramentas.includes(f); });
}
const TODAS_FERRAMENTAS = new Set(["pedidos", "duvidas", "pesquisar", "rascunhos", "publicacoes", "full", "saude", "perguntas", "radar", "monitor", "concorrentes", "clonador", "fotos", "promocoes", "relatorio",
  "lucro", "produtos", "despesas", "impostos", "analise", "painel", "contas"]);

function vendasLiberadas() {
  const u = estado.usuario;
  if (u.papel === "cliente") return !!u.vendas_lucro;
  return !!clienteAtual()?.vendas_lucro;
}

function menuDoPapel() {
  const liberadas = new Set(rotasLiberadas());
  return menuCompleto().map(([id, titulo, icone, itens]) => [id, titulo, icone, itens.filter(([r]) => liberadas.has(r))])
    .filter(([, , , itens]) => itens.length);
}

const MENU_VENDAS = [["vendas", "Resumo de vendas", "painel"], ["lucro", "Vendas e taxas", "cifrao"], ["produtos", "Produtos e custos", "pacote"],
  ["lucratividade", "Lucro por produto", "calculadora"], ["despesas", "Custos da operação", "loja"], ["dre", "Resultado do mês", "relatorio"],
  ["impostos", "Impostos", "calculadora"], ["analise", "Analista de métricas", "brilho"]];

function menuCompleto() {
  const papel = estado.usuario.papel;
  if (papel === "cliente") {
    return [
      ["loja", "Minha loja", "loja", [["painel", "Trabalho nos anúncios", "painel"], ["anuncios", "Meus Anúncios", "publicar"],
        ["rascunhos", "Em preparo", "rascunhos"], ["full", "Estoque Full", "caixa"], ["contas", "Contas", "contas"]]],
      ["acompanhamento", "Acompanhamento", "coracao", [["acompanhamento", "Visão geral", "bussola"], ["saude", "Saúde da conta", "coracao"],
        ["duvidas", "Minhas dúvidas", "balao"], ["novidades", "Novidades", "sino"]]],
      ["vendas", "Vendas e Lucro", "cifrao", MENU_VENDAS],
    ];
  }
  const gestao = [["contas", "Contas do cliente", "contas"]];
  if (papel === "admin") gestao.push(["clientes", "Clientes", "loja"], ["config", "Configurações", "config"]);
  return [
    ["inicio", "Início", "bussola", [["inicio", papel === "admin" ? "Visão geral" : "Minha carteira", "bussola"], ["painel", "Painel", "painel"],
      ["novidades", "Novidades", "sino"]]],
    ["anuncios", "Anúncios", "publicar", [["pedidos", "Pedidos", "pedido"], ["pesquisar", "Pesquisar e copiar", "pesquisar"],
      ["clonador", "Clonador", "copiar"], ["fotos", "Fotos salvas", "imagem"], ["promocoes", "Central de promoções", "etiqueta"], ["rascunhos", "Rascunhos", "rascunhos"], ["anuncios", "Meus Anúncios", "publicar"], ["full", "Estoque Full", "caixa"]]],
    ["mercado", "Radar e mercado", "alvo", [["monitor", "Radar de anúncios", "olho"], ["concorrentes", "Concorrentes", "usuarios"],
      ["radar", "Mapeador de produtos", "alvo"]]],
    ["acompanhamento", "Acompanhamento", "coracao", [["acompanhamento", "Visão geral", "bussola"], ["saude", "Saúde das contas", "coracao"], ["perguntas", "Perguntas", "balao"],
      ["duvidas", "Dúvidas", "balao"]]],
    ["vendas", "Vendas e Lucro", "cifrao", MENU_VENDAS],
    ["gestao", "Gestão", "config", papel === "consultor" ? [] : gestao],
  ].map(([id, t, i, itens]) => [id, t, i, papel === "consultor" ? itens.filter(([r]) => !["pesquisar", "clonador"].includes(r)) : itens]);
}

const ROTA_NO_MENU = { editor: "rascunhos" };

function topicoGuardado() {
  try { return localStorage.getItem("rpq_menu_topico") || ""; } catch { return ""; }
}

function guardarTopicos() {
  const aberto = $(".lateral .topico.aberto")?.dataset.topico || "";
  try { localStorage.setItem("rpq_menu_topico", aberto); } catch {}
}

function abrirTopico(topico, aberto = true) {
  if (!topico) return;
  if (aberto) $$(".lateral .topico.aberto").forEach((t) => { if (t !== topico) abrirTopico(t, false); });
  topico.classList.toggle("aberto", aberto);
  $(".topico-cab", topico).setAttribute("aria-expanded", String(aberto));
}

function menuLateralHtml() {
  const guardado = topicoGuardado();
  return menuDoPapel().map(([id, titulo, icone, itens]) => {
    const aberto = guardado === id;
    return `<div class="topico ${aberto ? "aberto" : ""}" data-topico="${id}">
      <button type="button" class="topico-cab" aria-expanded="${aberto}" aria-controls="topico-${id}" title="${titulo}">
        ${ic(icone)}<span class="rotulo">${titulo}</span><span class="topico-seta">${ic("abaixo", "p")}</span><span class="bolinha" data-contador-topico="${id}" hidden></span></button>
      <div class="topico-itens" id="topico-${id}">
        ${itens.map(([r, rotulo, ico]) => `<a href="#/${r}" data-rota="${r}" title="${rotulo}">${ic(ico)}<span class="rotulo">${rotulo}</span><span class="bolinha" data-contador="${r}" hidden></span></a>`).join("")}
      </div></div>`;
  }).join("");
}

const TITULO_ROTA = { novidades: "Novidades", inicio: "Visão geral", pedidos: "Pedidos de anúncio", acompanhamento: "Acompanhamento", duvidas: "Dúvidas", painel: "Painel", pesquisar: "Pesquisar", rascunhos: "Rascunhos", editor: "Editar anúncio", full: "Estoque Full",
  contas: "Contas", clientes: "Clientes", config: "Configurações", saude: "Saúde das contas", perguntas: "Perguntas",
  radar: "Mapeador de produtos", monitor: "Radar de anúncios", concorrentes: "Análise de concorrentes", anuncios: "Meus Anúncios", clonador: "Clonador de anúncios", fotos: "Fotos salvas", promocoes: "Central de promoções", vendas: "Resumo de vendas", lucratividade: "Lucro por produto", dre: "Resultado do mês", lucro: "Vendas e taxas", produtos: "Produtos e custos", despesas: "Custos da operação", impostos: "Impostos", analise: "Analista de métricas" };

function ligarMenu() {
  $$(".lateral .topico-cab").forEach((b) => (b.onclick = () => {
    const topico = b.closest(".topico");
    abrirTopico(topico, !topico.classList.contains("aberto"));
    guardarTopicos();
  }));
}

function redesenharMenu() {
  const nav = $(".lateral nav");
  if (!nav) return;
  nav.innerHTML = menuLateralHtml();
  ligarMenu();
  estado._ultimaRotaMenu = null;
}

function casca(ativa) {
  const u = estado.usuario;
  if (!$(".casca")) {
    $("#app").innerHTML = `
    <div class="casca">
      <aside class="lateral">
        ${MARCA()}
        <nav aria-label="Menu principal">${menuLateralHtml()}</nav>
        <div class="rodape"><span>Monvatti</span><span>v1.1</span></div>
      </aside>
      <div class="cortina" data-fechar-menu></div>
      <div class="principal">
        <header class="barra-topo">
          <button class="icone so-mobile" id="abrir-menu" aria-label="Abrir menu">${ic("menu")}</button>
          <div id="seletor" class="seletor"></div>
          <div class="migalha"><b id="migalha-atual"></b></div>
          <div class="espaco"></div>
          <button class="icone sino" id="b-sino" title="Notificações" aria-label="Notificações">${ic("sino")}<span class="bolinha" id="sino-contador" hidden></span></button>
          <button class="icone" id="b-ajuda" title="Guia desta tela" aria-label="Guia desta tela">${ic("ajuda")}</button>
          ${botaoTema()}
          <div class="usuario">
            <div class="quem"><b id="quem-nome">${h(u.nome)}</b><span id="quem-sub">${h(PAPEL[u.papel])} · ${h(u.empresa.nome)}</span></div>
            <button class="avatar" id="minha-conta" title="Minha conta: nome, foto e senha" aria-label="Minha conta">${avatarHtml(u.nome, u.foto)}</button>
            <button class="icone" id="sair" title="Sair" aria-label="Sair">${ic("sair")}</button>
          </div>
        </header>
        <main class="conteudo" id="tela"></main>
      </div>
    </div>`;
    $("#sair").onclick = async () => {
      await encerrarSessaoLocal();
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null, naoLidas: null, chatPagina: null });
      fecharChat();
      location.hash = "#/entrar";
      roteador();
    };
    $("#minha-conta").onclick = trocarMinhaSenha;
    $("#b-ajuda").onclick = abrirAjuda;
    $("#abrir-menu").onclick = () => $(".casca").classList.add("menu-aberto");
    ligarMenu();
    $("#b-sino").onclick = abrirNotificacoes;
    $("[data-fechar-menu]").onclick = () => $(".casca").classList.remove("menu-aberto");
    sincronizarTema();
    desenharSeletor();
  }
  $(".casca").classList.remove("menu-aberto");
  const grupoAtivo = ROTA_NO_MENU[ativa] || ativa;
  $$(".lateral nav a").forEach((a) => {
    const on = a.dataset.rota === grupoAtivo;
    a.classList.toggle("ativo", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $$(".lateral .topico").forEach((t) => t.classList.toggle("atual", !!$("a.ativo", t)));
  const topicoAtual = $(".lateral a.ativo")?.closest(".topico");
  if (topicoAtual && ativa !== estado._ultimaRotaMenu) { abrirTopico(topicoAtual); guardarTopicos(); }
  estado._ultimaRotaMenu = ativa;
  $("#migalha-atual").textContent = TITULO_ROTA[ativa] || "";
  desenharContadores();
  document.title = `${TITULO_ROTA[ativa] || "Replique"} · Replique`;
  $("#tela").innerHTML = `<div class="pilha" aria-busy="true">
    <div class="esqueleto" style="height:28px;width:240px"></div>
    <div class="esqueleto" style="height:14px;width:380px;max-width:100%"></div>
    <div class="esqueleto" style="height:160px;margin-top:8px"></div></div>`;
  window.scrollTo({ top: 0 });
}

function aplicarPerfil(dados) {
  Object.assign(estado.usuario, { nome: dados.nome, foto: dados.foto, empresa: dados.empresa || estado.usuario.empresa });
  const u = estado.usuario;
  if ($("#minha-conta")) $("#minha-conta").innerHTML = avatarHtml(u.nome, u.foto);
  if ($("#quem-nome")) $("#quem-nome").textContent = u.nome;
  if ($("#quem-sub")) $("#quem-sub").textContent = `${PAPEL[u.papel]} · ${u.empresa.nome}`;
}

function trocarMinhaSenha() {
  const u = estado.usuario;
  const m = modal(`<h2>${ic("usuarios", "p")}Minha conta</h2>
    <p class="suave pequeno">${h(u.email)} · ${h(PAPEL[u.papel])}${u.papel === "cliente" && clienteAtual() ? ` · ${h(clienteAtual().nome)}` : ""}</p>
    <div class="perfil">
      <span class="avatar avatar-grande" id="mp-avatar">${avatarHtml(u.nome, u.foto)}</span>
      <div class="pilha" style="gap:8px;flex:1;min-width:0">
        <div class="linha">
          <button type="button" class="sec pequeno" id="mp-trocar-foto">${ic("imagem", "p")}${u.foto ? "Trocar foto" : "Enviar foto"}</button>
          ${u.foto ? `<button type="button" class="sec pequeno perigo-txt" id="mp-remover-foto">${ic("lixo", "p")}Remover</button>` : ""}
        </div>
        <span class="pequeno suave">JPG, PNG ou WEBP. A foto é cortada em quadrado.</span>
        <input type="file" id="mp-arquivo" accept="image/jpeg,image/png,image/webp" hidden>
      </div>
    </div>
    <form id="f-perfil" class="linha" style="align-items:flex-end;margin-top:14px">
      <div style="flex:1;min-width:200px"><label for="mp-nome">Seu nome</label><input id="mp-nome" type="text" required minlength="2" maxlength="200" value="${h(u.nome)}"></div>
      <button type="submit" class="sec">${ic("salvar", "p")}Salvar nome</button>
    </form>
    ${u.papel === "admin" ? `<form id="f-empresa" class="linha" style="align-items:flex-end;margin-top:12px">
      <div style="flex:1;min-width:200px"><label for="mp-empresa">Nome da empresa (aparece para a equipe e nos relatórios)</label>
        <input id="mp-empresa" type="text" required minlength="2" maxlength="200" value="${h(u.empresa.nome)}"></div>
      <button type="submit" class="sec">${ic("salvar", "p")}Salvar empresa</button>
    </form>` : ""}
    <h3 style="margin-top:18px">${ic("chave", "p")}Trocar senha</h3>
    <form id="f-senha" class="pilha">
      <div><label for="ms-atual">Senha atual</label><input id="ms-atual" name="atual" type="password" required autocomplete="current-password"></div>
      <div class="grade g2">
        <div><label for="ms-nova">Nova senha</label><input id="ms-nova" name="nova" type="password" minlength="8" required autocomplete="new-password"></div>
        <div><label for="ms-conf">Repita a nova senha</label><input id="ms-conf" type="password" minlength="8" required autocomplete="new-password"></div>
      </div>
      <p class="pequeno suave" style="margin:0">Ao trocar, você continua conectado aqui e as sessões abertas em outros aparelhos são encerradas.</p>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Trocar senha</button></div>
    </form>
    <div id="mp-2fa"></div>
    <div id="mp-privacidade"></div>
    <div class="linha entre" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--borda)">
      <span class="pequeno suave">Esqueceu o Replique aberto em outro computador?</span>
      <button type="button" class="sec pequeno perigo-txt" id="sair-todos">${ic("sair", "p")}Sair de todos os aparelhos</button></div>`);
  const recarregar = (msg) => { toast(msg); trocarMinhaSenha(); };
  privacidadeMinhaConta($("#mp-privacidade", m));
  doisFatoresMinhaConta($("#mp-2fa", m));
  avisarCapsLock(m);
  $("#mp-trocar-foto", m).onclick = () => $("#mp-arquivo", m).click();
  $("#mp-arquivo", m).onchange = () => {
    const arquivo = $("#mp-arquivo", m).files[0];
    if (!arquivo) return;
    comBotao($("#mp-trocar-foto", m), async () => {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      aplicarPerfil(await api("/api/me/foto", { method: "POST", body: fd }));
      recarregar("Foto atualizada.");
    });
  };
  const remover = $("#mp-remover-foto", m);
  if (remover) remover.onclick = () => comBotao(remover, async () => {
    aplicarPerfil(await api("/api/me/foto", { method: "DELETE" }));
    recarregar("Foto removida.");
  });
  $("#f-perfil", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-perfil button", m), async () => {
      aplicarPerfil(await api("/api/me", { method: "PATCH", body: { nome: $("#mp-nome", m).value } }));
      toast("Nome atualizado.");
    });
  };
  const fe = $("#f-empresa", m);
  if (fe) fe.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button", fe), async () => {
      aplicarPerfil(await api("/api/empresa", { method: "PATCH", body: { nome: $("#mp-empresa", m).value } }));
      toast("Nome da empresa atualizado.");
    });
  };
  $("#sair-todos", m).onclick = () => {
    if (!confirm("Encerrar todas as sessões deste acesso, inclusive esta?")) return;
    comBotao($("#sair-todos", m), async () => {
      await api("/api/me/sair-de-todos", { method: "POST" }).catch(() => {});
      fecharModal();
      $("#sair").click();
    });
  };
  $("#f-senha", m).onsubmit = (e) => {
    e.preventDefault();
    if ($("#ms-nova", m).value !== $("#ms-conf", m).value) return toast("As duas senhas novas não são iguais.", true);
    comBotao($("button[type=submit]", m), async () => {
      const r = await api("/api/me/senha", { method: "POST", body: { atual: $("#ms-atual", m).value, nova: $("#ms-nova", m).value } });
      await guardarSessao(r);
      fecharModal();
      toast("Senha trocada.");
    });
  };
}

function pontoML(info) {
  const ml = info?.ml;
  if (!ml) return `<span class="ponto" title="Mercado Livre: carregando"></span>`;
  if (!ml.conectada) return `<span class="ponto off" title="Mercado Livre não conectado"></span>`;
  const expirou = !ml.renovacao_automatica && ml.expira_em * 1000 < Date.now();
  return expirou ? `<span class="ponto alerta" title="Conexão do Mercado Livre expirada"></span>`
    : `<span class="ponto ok" title="Mercado Livre conectado: ${h(ml.apelido)}"></span>`;
}

function desenharSeletor() {
  const alvo = $("#seletor");
  if (!alvo || !estado.usuario) return;
  const estavaAberto = $("#seletor-painel") && !$("#seletor-painel").hidden;
  const termoAnterior = $("#seletor-busca")?.value || "";
  const atual = clienteAtual();
  if (!eTime()) {
    alvo.innerHTML = atual ? `<div class="seletor-btn fixo">${ic("loja", "p")}<span class="nome">${h(atual.nome)}</span></div>` : "";
    return;
  }
  const info = (estado.clientesInfo || []).find((c) => c.id === estado.clienteId);
  alvo.innerHTML = `<button class="seletor-btn" id="seletor-btn" aria-haspopup="listbox" aria-expanded="false" title="Trocar de cliente">
      ${atual ? pontoML(info) : ic("loja", "p")}
      <span class="nome">${atual ? h(atual.nome) : "Escolher cliente"}</span>${ic("abaixo", "p")}</button>
    <div class="seletor-painel" id="seletor-painel" hidden>
      ${atual ? `<button type="button" class="seletor-item seletor-geral" data-sair-cliente>${ic("bussola", "p")}<span class="nome">${eAdmin() ? "Voltar à visão geral" : "Voltar à minha carteira"}</span></button>` : ""}
      <input type="text" id="seletor-busca" placeholder="Buscar cliente…" autocomplete="off" aria-label="Buscar cliente">
      <div class="seletor-lista" id="seletor-lista" role="listbox"></div>
      ${eAdmin() ? `<a href="#/clientes" class="seletor-rodape">${ic("config", "p")}Gerenciar clientes</a>` : ""}
    </div>`;
  const painel = $("#seletor-painel"), btn = $("#seletor-btn"), busca = $("#seletor-busca");
  const listar = () => {
    const termo = busca.value.trim().toLowerCase();
    const todos = estado.usuario.clientes.filter((c) => c.ativo && c.nome.toLowerCase().includes(termo));
    const infos = Object.fromEntries((estado.clientesInfo || []).map((c) => [c.id, c]));
    const porCliente = estado.naoLidas?.por_cliente || {};
    $("#seletor-lista").innerHTML = todos.length ? todos.map((c) => `
      <button type="button" class="seletor-item ${c.id === estado.clienteId ? "atual" : ""}" data-cliente="${c.id}" role="option">
        ${pontoML(infos[c.id])}<span class="nome">${h(c.nome)}</span>${porCliente[c.id] ? `<span class="bolinha" title="Dúvidas não lidas">${porCliente[c.id]}</span>` : ""}
        <span class="suave pequeno">${infos[c.id]?.ml?.apelido ? h(infos[c.id].ml.apelido) : infos[c.id] ? "sem ML" : ""}</span></button>`).join("")
      : `<div class="suave pequeno" style="padding:10px 12px">${estado.usuario.clientes.length ? "Nenhum cliente com esse nome." :
        eAdmin() ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente atribuído a você. Fale com o administrador."}</div>`;
    $$("[data-cliente]", painel).forEach((b) => (b.onclick = () => { fechar(); trocarCliente(+b.dataset.cliente); }));
  };
  const fechar = () => { painel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  const sair = $("[data-sair-cliente]", painel);
  if (sair) sair.onclick = () => { fechar(); trocarCliente(null); };
  const abrir = (termo = "") => {
    painel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    busca.value = termo;
    listar();
    busca.focus();
  };
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!painel.hidden) return fechar();
    abrir();
    carregarClientesInfo();
  };
  busca.oninput = listar;
  busca.onkeydown = (e) => {
    if (e.key === "Enter") $("#seletor-lista [data-cliente]")?.click();
    if (e.key === "Escape") { fechar(); btn.focus(); }
  };
  painel.onclick = (e) => e.stopPropagation();
  if (estavaAberto) abrir(termoAnterior);
}
document.addEventListener("click", () => {
  const p = $("#seletor-painel");
  if (p && !p.hidden) { p.hidden = true; $("#seletor-btn")?.setAttribute("aria-expanded", "false"); }
});

async function telaEscolherCliente(rota) {
  if (!estado.clientesInfo) await carregarClientesInfo();
  const u = estado.usuario;
  const ativos = u.clientes.filter((c) => c.ativo);
  const infos = Object.fromEntries((estado.clientesInfo || []).map((c) => [c.id, c]));
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Escolha o cliente</h1>
    <div class="suave">${TITULO_ROTA[rota]} é feito dentro de um cliente: as pesquisas, os rascunhos e as publicações usam as contas dele.</div></div>
    ${eAdmin() ? `<a class="botao" href="#/clientes">${ic("mais", "p")}Novo cliente</a>` : ""}</div>
  ${ativos.length ? `<div class="cartao"><input type="text" id="busca-cliente" placeholder="Buscar pelo nome…" style="margin-bottom:14px">
    <div class="grade-clientes" id="grade-clientes"></div></div>`
    : `<div class="cartao">${vazio("loja", eAdmin() ? "Nenhum cliente cadastrado" : "Nenhum cliente atribuído a você",
      eAdmin() ? `Cadastre o primeiro cliente em <a href="#/clientes">Clientes</a>.` : "Peça ao administrador para liberar os clientes que você atende.")}</div>`}`;
  const grade = $("#grade-clientes");
  if (!grade) return;
  const desenhar = () => {
    const termo = $("#busca-cliente").value.trim().toLowerCase();
    grade.innerHTML = ativos.filter((c) => c.nome.toLowerCase().includes(termo)).map((c) => `
      <button type="button" class="cartao-cliente" data-escolher="${c.id}">
        <span class="linha">${pontoML(infos[c.id])}<b>${h(c.nome)}</b></span>
        <span class="suave pequeno">${infos[c.id] ? `${infos[c.id].ml?.apelido ? "ML: " + h(infos[c.id].ml.apelido) : "Mercado Livre não conectado"} · ${infos[c.id].publicados} publicado(s)` : ""}</span>
      </button>`).join("") || `<div class="suave">Nenhum cliente com esse nome.</div>`;
    $$("[data-escolher]", grade).forEach((b) => (b.onclick = () => trocarCliente(+b.dataset.escolher)));
  };
  $("#busca-cliente").oninput = desenhar;
  desenhar();
  $("#busca-cliente").focus();
}

const TAREFA_POR_TELA = { saude: "saude", perguntas: "perguntas", monitor: "radar_anuncios", radar: "radar_anuncios",
  concorrentes: "concorrentes", full: "full", lucro: "vendas" };

async function mostrarAtualizado(tarefa) {
  let s;
  try { s = await api("/api/agendador/situacao" + (estado.clienteId && eTime() ? `?cliente_id=${estado.clienteId}` : "")); } catch { return; }
  const hora = (iso) => (iso ? quando(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  const diaHora = (iso) => (iso ? quando(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const t = s.tarefas[tarefa] || {};
  const doCliente = Object.entries(s.cliente || {}).filter(([k]) => k === tarefa || k.startsWith(tarefa + "_")).map(([, v]) => v);
  const lida = doCliente.map((v) => v.lida_em).filter(Boolean).sort().pop() || t.ultima_ok_em;
  const falhando = doCliente.some((v) => v.falhando) || (t.falhas_seguidas || 0) >= 3;
  const hoje = lida && quando(lida).toDateString() === new Date().toDateString();
  const texto = !s.ativo && !t.ultima_ok_em ? "Atualização automática desligada neste servidor"
    : lida ? `Atualizado ${hoje ? "às " + hora(lida) : "em " + diaHora(lida)}${t.proxima_em ? ` · próxima às ${hora(t.proxima_em)}` : ""}` : "Aguardando a primeira atualização automática";
  $$(`[data-atualizado="${tarefa}"]`).forEach((el) => {
    el.innerHTML = `${h(texto)}${falhando ? ` · <span class="falhando" title="${h(doCliente.find((v) => v.erro)?.erro || t.ultimo_erro || "")}">${ic("alerta", "p")} falhando, tenta de novo no próximo ciclo</span>` : ""}`;
  });
}

function animarTela() {
  const t = $("#tela");
  if (!t) return;
  t.classList.remove("entrando");
  void t.offsetWidth;
  t.classList.add("entrando");
}
