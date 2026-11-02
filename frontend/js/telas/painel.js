"use strict";

const ROTULO_ACAO = { pesquisa: "Pesquisa", copia: "Cópia", criacao: "Criação", edicao: "Edição", exclusao: "Exclusão",
  publicacao: "Publicação", conta: "Conta", cliente: "Cliente", usuario: "Acesso", lote: "Lote", financeiro: "Financeiro",
  projeto: "Projeto", tarefa: "Tarefa", tarefa_interna: "Tarefa interna", reuniao: "Reunião" };
const ICONE_ACAO = { pesquisa: "pesquisar", copia: "copiar", criacao: "mais", edicao: "lapis", exclusao: "lixo",
  publicacao: "publicar", conta: "contas", cliente: "loja", usuario: "usuarios", lote: "pacote", financeiro: "cifrao",
  projeto: "checar", tarefa: "relogio", tarefa_interna: "relogio", reuniao: "balao" };
const tempoRelativo = (v) => {
  const s = (Date.now() - quando(v).getTime()) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `há ${Math.floor(s / 86400)} d`;
  return data(v);
};
const numero = (n) => Number(n || 0).toLocaleString("pt-BR");
const estadoPainel = { dias: 30, cliente: "", usuario: "" };

async function telaPainel() {
  const papel = estado.usuario.papel;
  const ehCliente = papel === "cliente";
  const [usuarios] = await Promise.all([eAdmin() ? api("/api/empresa/usuarios") : Promise.resolve([])]);
  const f = estadoPainel;
  f.usuarios = usuarios.filter((u) => u.papel !== "cliente");
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${ehCliente ? "Acompanhamento" : "Painel"}</h1>
    <div class="suave">${ehCliente ? `O trabalho da equipe Monvatti na loja <b>${h(clienteAtual()?.nome)}</b>.`
      : papel === "admin" ? "Quantos anúncios foram feitos, para quais clientes e por qual operador." : "Os números dos clientes que você atende."}</div></div>
    <div class="linha filtros">
      <select id="f-dias" aria-label="Período">${[[7, "Últimos 7 dias"], [30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [365, "Último ano"]]
        .map(([v, r]) => `<option value="${v}" ${f.dias === v ? "selected" : ""}>${r}</option>`).join("")}</select>
      ${ehCliente ? "" : `<select id="f-cliente" aria-label="Cliente"><option value="">Todos os clientes</option>
        ${estado.usuario.clientes.map((c) => `<option value="${c.id}" ${String(c.id) === f.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select>`}
      ${eAdmin() ? `<select id="f-usuario" aria-label="Operador"><option value="">Toda a equipe</option>
        ${usuarios.filter((u) => u.papel !== "cliente").map((u) => `<option value="${u.id}" ${String(u.id) === f.usuario ? "selected" : ""}>${h(u.nome)}</option>`).join("")}</select>` : ""}
    </div></div>
  <div id="painel-corpo"><div class="grade g4">${'<div class="esqueleto" style="height:104px"></div>'.repeat(4)}</div></div>`;
  const recarregar = () => {
    f.dias = +$("#f-dias").value;
    f.cliente = $("#f-cliente")?.value || "";
    f.usuario = $("#f-usuario")?.value || "";
    desenharPainel();
  };
  $$(".filtros select").forEach((s) => (s.onchange = recarregar));
  await desenharPainel();
}

async function desenharPainel() {
  const f = estadoPainel;
  const ehCliente = estado.usuario.papel === "cliente";
  const qs = new URLSearchParams({ dias: f.dias });
  if (f.cliente) qs.set("cliente_id", f.cliente);
  if (f.usuario) qs.set("usuario_id", f.usuario);
  const p = await api("/api/painel?" + qs);
  const t = p.totais;
  const maxDia = Math.max(1, ...p.por_dia.map((d) => d.publicados + d.simulados));
  const temSimulado = p.por_dia.some((d) => d.simulados);
  const semML = p.por_cliente.filter((c) => c.ativo && !c.ml?.conectada);
  const semOperador = eAdmin() ? p.por_cliente.filter((c) => c.ativo && !c.com_operador) : [];
  const kpi = (rotulo, valor, detalhe = "", icone = "painel") => `<div class="cartao kpi-bloco">
      <div class="linha entre"><span class="rotulo">${rotulo}</span><span class="kpi-ic">${ic(icone, "p")}</span></div>
      <div class="valor">${valor}</div>${detalhe ? `<div class="pequeno suave">${detalhe}</div>` : ""}</div>`;
  $("#painel-corpo").innerHTML = `
    <div class="grade g4">
      ${kpi("Anúncios publicados", numero(t.publicados), `nos últimos ${p.dias} dias`, "publicar")}
      ${kpi("Rascunhos criados", numero(t.rascunhos), "copiados ou criados do zero", "rascunhos")}
      ${kpi("Falhas de publicação", numero(t.falhas), t.simulados ? `${numero(t.simulados)} simulação(ões) em modo demonstração` : "recusados pela checagem ou pelo marketplace", "alerta")}
      ${ehCliente ? kpi("Pessoas da equipe", numero(p.por_usuario.length), "trabalharam na sua loja", "usuarios")
        : kpi("Clientes com ML conectado", `${t.clientes_com_ml}<span class="de">/${t.clientes}</span>`, `${numero(t.operadores_ativos)} pessoa(s) da equipe ativas no período`, "loja")}
    </div>
    ${semOperador.length ? `<div class="aviso azul linha entre" style="margin-top:16px"><span>${ic("usuarios", "p")} <b>${semOperador.length} cliente(s) sem operador</b>
      ${semOperador.some((c) => c.origem === "convite") ? "(inclui lojas que se cadastraram pelo link)" : ""}: ${semOperador.slice(0, 6).map((c) => h(c.nome)).join(", ")}${semOperador.length > 6 ? "…" : ""}.</span>
      <a class="botao sec pequeno" href="#/clientes">Atribuir operadores</a></div>` : ""}
    ${!ehCliente && semML.length ? `<div class="aviso amarelo" style="margin-top:16px">${ic("alerta", "p")} <b>${semML.length} cliente(s) sem o Mercado Livre conectado:</b>
      ${semML.slice(0, 8).map((c) => h(c.nome)).join(", ")}${semML.length > 8 ? "…" : ""}. Sem a conta, a pesquisa e a publicação ficam em modo demonstração.</div>` : ""}
    <div class="cartao" style="margin-top:16px">
      <div class="linha entre"><h2 style="margin:0">${ic("publicar", "p")}Publicações por dia</h2><span class="suave pequeno">${numero(t.publicados)} no período</span></div>
      <div class="barras" role="img" aria-label="Publicações por dia">${p.por_dia.map((d) => {
        const total = d.publicados + d.simulados;
        return `<div class="barra-dia" title="${new Date(d.dia + "T12:00").toLocaleDateString("pt-BR")}: ${d.publicados} publicada(s)${d.simulados ? `, ${d.simulados} simulada(s)` : ""}">
          <div class="pilha-barra" style="height:${total ? Math.max(6, (total / maxDia) * 100) : 2}%">
            ${total ? `${d.simulados ? `<i class="sim" style="flex:${d.simulados}"></i>` : ""}${d.publicados ? `<i style="flex:${d.publicados}"></i>` : ""}` : '<i class="zero"></i>'}</div></div>`;
      }).join("")}</div>
      <div class="linha entre pequeno suave"><span>${new Date(p.por_dia[0].dia + "T12:00").toLocaleDateString("pt-BR")}</span>
        ${temSimulado ? '<span class="legenda"><i></i>publicadas <i class="sim"></i>simuladas (modo demonstração)</span>' : ""}<span>hoje</span></div>
    </div>
    <div class="grade ${ehCliente ? "" : "g2"}" style="margin-top:16px">
      ${ehCliente ? "" : `<section class="cartao"><h2>${ic("loja", "p")}Por cliente</h2>
        ${p.por_cliente.length ? `<div class="tabela rolagem-y"><table><thead><tr><th>Cliente</th><th class="num">Rascunhos</th><th class="num">Publicados</th><th class="num">Falhas</th><th>Última atividade</th></tr></thead><tbody>
          ${p.por_cliente.map((c) => `<tr><td><div class="linha" style="gap:8px;flex-wrap:nowrap">${pontoML(c)}<a href="#" data-trabalhar="${c.id}">${h(c.nome)}</a></div>
              <div class="pequeno suave">${c.ml?.conectada ? "ML: " + h(c.ml.apelido) : "ML não conectado"}${c.ativo ? "" : " · inativo"}</div></td>
            <td class="num">${numero(c.rascunhos)}</td><td class="num"><b>${numero(c.publicados)}</b></td>
            <td class="num ${c.falhas ? "ruim" : ""}">${numero(c.falhas)}</td>
            <td class="pequeno suave">${c.ultima_atividade ? tempoRelativo(c.ultima_atividade) : "—"}</td></tr>`).join("")}
          </tbody></table></div>` : vazio("loja", "Nenhum cliente", eAdmin() ? `Cadastre em <a href="#/clientes">Clientes</a>.` : "")}</section>`}
      <section class="cartao"><h2>${ic("usuarios", "p")}${ehCliente ? "Quem trabalhou na sua loja" : "Por pessoa da equipe"}</h2>
        ${p.por_usuario.length ? `<div class="tabela rolagem-y"><table><thead><tr><th>Nome</th><th class="num">Rascunhos</th><th class="num">Publicados</th><th class="num">Falhas</th></tr></thead><tbody>
          ${p.por_usuario.map((u) => `<tr><td><b>${h(u.nome)}</b><div class="pequeno suave">${h(PAPEL[u.papel] || "Automação")}</div></td>
            <td class="num">${numero(u.rascunhos)}</td><td class="num"><b>${numero(u.publicados)}</b></td>
            <td class="num ${u.falhas ? "ruim" : ""}">${numero(u.falhas)}</td></tr>`).join("")}
          </tbody></table></div>` : vazio("usuarios", "Nenhuma atividade no período")}</section>
    </div>
    <section class="cartao" style="margin-top:16px">
      <div class="linha entre"><h2 style="margin:0">${ic("atividade", "p")}Atividades recentes</h2>
        <div class="linha" style="gap:8px">
          <button type="button" class="sec pequeno" id="todas-atividades">Ver todas</button>
          <button type="button" class="sec pequeno" id="alternar-feed" aria-controls="feed-caixa"></button></div></div>
      <div id="feed-caixa" class="rolagem-y" style="margin-top:12px"><div id="feed" class="feed"></div></div>
    </section>`;
  $$("[data-trabalhar]").forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const id = +a.dataset.trabalhar;
    if (estado.usuario.clientes.some((c) => c.id === id && c.ativo)) { trocarCliente(id, { navegar: false }); location.hash = "#/rascunhos"; }
  }));
  const mostrarFeed = (aberto) => {
    $("#feed-caixa").hidden = !aberto;
    $("#alternar-feed").textContent = aberto ? "Ocultar" : "Mostrar";
    $("#alternar-feed").setAttribute("aria-expanded", String(aberto));
    try { localStorage.setItem("rpq_feed_aberto", aberto ? "1" : "0"); } catch {}
  };
  let feedAberto = false;
  try { feedAberto = localStorage.getItem("rpq_feed_aberto") === "1"; } catch {}
  mostrarFeed(feedAberto);
  $("#alternar-feed").onclick = () => mostrarFeed($("#feed-caixa").hidden);
  $("#todas-atividades").onclick = () => verTodasAtividades();
  await carregarFeed();
}

const ATIVIDADES_RECENTES = 8;

function diaDaAtividade(v) {
  const d = new Date(v);
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function cartaoAtividade(a) {
  const ehCliente = estado.usuario.papel === "cliente";
  const oQue = h(a.descricao.charAt(0).toLowerCase() + a.descricao.slice(1));
  return `<div class="feed-item atividade-cartao">
    <span class="feed-ic acao-${h(a.acao)}">${ic(ICONE_ACAO[a.acao] || "atividade", "p")}</span>
    <div class="info"><div class="atividade-linha" title="${h(a.ator)} ${oQue}"><b>${h(a.ator)}</b> ${oQue}</div>
      <div class="pequeno suave atividade-linha">${!ehCliente && a.cliente_nome ? h(a.cliente_nome) + " · " : ""}${ROTULO_ACAO[a.acao] || h(a.acao)}
        ${a.detalhes?.link && urlSegura(a.detalhes.link) ? ` · <a href="${h(a.detalhes.link)}" target="_blank" rel="noopener">abrir ${ic("externo", "p")}</a>` : ""}</div></div>
    <span class="pequeno suave atividade-hora" title="${data(a.criada_em)}">${tempoRelativo(a.criada_em)}</span>
  </div>`;
}

function atividadesPorDia(lista, ultimoDia = "") {
  let dia = ultimoDia;
  return lista.map((a) => {
    const d = diaDaAtividade(a.criada_em);
    const cab = d !== dia ? `<div class="feed-dia">${h(d)}</div>` : "";
    dia = d;
    return cab + cartaoAtividade(a);
  }).join("");
}

async function carregarFeed() {
  const f = estadoPainel;
  const feed = $("#feed");
  if (!feed) return;
  const qs = new URLSearchParams({ limite: ATIVIDADES_RECENTES });
  if (f.cliente) qs.set("cliente_id", f.cliente);
  if (f.usuario) qs.set("usuario_id", f.usuario);
  const lista = await api("/api/atividades?" + qs);
  feed.innerHTML = lista.length ? atividadesPorDia(lista) : vazio("atividade", "Nenhuma atividade ainda");
}

function verTodasAtividades() {
  const f = estadoPainel;
  const ehCliente = estado.usuario.papel === "cliente";
  const m = modal(`<h2>${ic("atividade", "p")}Todas as atividades</h2>
    <div class="grade g4 filtros-atividade">
      ${ehCliente ? "" : `<div><label for="ta-cliente">Cliente</label><select id="ta-cliente"><option value="">Todos</option>
        ${estado.usuario.clientes.map((c) => `<option value="${c.id}" ${String(c.id) === f.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select></div>`}
      ${eAdmin() ? `<div><label for="ta-pessoa">Pessoa</label><select id="ta-pessoa"><option value="">Toda a equipe</option>
        ${(f.usuarios || []).map((u) => `<option value="${u.id}" ${String(u.id) === f.usuario ? "selected" : ""}>${h(u.nome)}</option>`).join("")}</select></div>` : ""}
      <div><label for="ta-tipo">Tipo</label><select id="ta-tipo"><option value="">Todos</option>
        ${Object.entries(ROTULO_ACAO).filter(([k]) => !ehCliente || !["pesquisa", "cliente", "usuario", "tarefa_interna", "reuniao"].includes(k))
          .map(([k, r]) => `<option value="${k}">${r}</option>`).join("")}</select></div>
      <div><label>Período</label><div class="linha" style="gap:6px;flex-wrap:nowrap">
        <input type="date" id="ta-desde" aria-label="De"><input type="date" id="ta-ate" aria-label="Até"></div></div>
    </div>
    <div id="ta-lista" class="feed rolagem-y" style="margin-top:14px;max-height:55vh"></div>
    <div class="linha" style="justify-content:center;margin-top:10px"><button type="button" class="sec pequeno" id="ta-mais" hidden>Carregar mais</button></div>`);
  m.classList.add("largo");
  let ultimoId = null, ultimoDia = "";
  const carregar = async (reiniciar) => {
    const qs = new URLSearchParams({ limite: 40 });
    const v = (id) => $(id, m)?.value || "";
    if (v("#ta-cliente")) qs.set("cliente_id", v("#ta-cliente"));
    if (v("#ta-pessoa")) qs.set("usuario_id", v("#ta-pessoa"));
    if (v("#ta-tipo")) qs.set("acao", v("#ta-tipo"));
    if (v("#ta-desde")) qs.set("desde", v("#ta-desde"));
    if (v("#ta-ate")) qs.set("ate", v("#ta-ate"));
    if (!reiniciar && ultimoId) qs.set("antes_de", ultimoId);
    if (reiniciar) { ultimoId = null; ultimoDia = ""; }
    const lista = await api("/api/atividades?" + qs);
    const html = atividadesPorDia(lista, ultimoDia);
    if (reiniciar) $("#ta-lista", m).innerHTML = html || vazio("atividade", "Nada com esses filtros");
    else $("#ta-lista", m).insertAdjacentHTML("beforeend", html);
    if (lista.length) { ultimoId = lista[lista.length - 1].id; ultimoDia = diaDaAtividade(lista[lista.length - 1].criada_em); }
    $("#ta-mais", m).hidden = lista.length < 40;
  };
  $$(".filtros-atividade select, .filtros-atividade input", m).forEach((el) => (el.onchange = () => carregar(true)));
  $("#ta-mais", m).onclick = () => comBotao($("#ta-mais", m), () => carregar(false));
  carregar(true);
}
