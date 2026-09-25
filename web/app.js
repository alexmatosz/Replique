/* Replique — interface web (sem build: HTML + JS puro). */
"use strict";

const PLAT = {
  mercadolivre: { nome: "Mercado Livre", limite: 60 },
  shopee: { nome: "Shopee", limite: 120 },
  amazon: { nome: "Amazon", limite: 200 },
};
const estado = { usuario: null, pesquisa: null, filtro: "todas", soCompletos: false, anuncio: null, sujo: false,
  clienteId: null, clientesInfo: null };
const PAPEL = { admin: "Administrador", operador: "Operador", cliente: "Cliente" };
const eAdmin = () => estado.usuario?.papel === "admin";
const eEquipe = () => ["admin", "operador"].includes(estado.usuario?.papel);

// ---------------------------------------------------------------- utilitários
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
// o servidor grava em UTC; datas sem fuso ("2026-09-25T03:29:00") são UTC, não horário local
const quando = (v) => new Date(typeof v === "string" && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? v + "Z" : v);
const data = (v) => (v ? quando(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const selo = (p) => `<span class="selo ${h(p)}">${h(PLAT[p]?.nome || p)}</span>`;
const urlSegura = (u) => (/^(https?:\/\/|\/)/i.test(u || "") ? u : "");

// ---------------------------------------------------------------- ícones (traços no estilo Lucide, ISC)
const ICONES = {
  pesquisar: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  rascunhos: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  publicar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  contas: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  config: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  mais: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  esquerda: '<path d="m15 18-6-6 6-6"/>',
  direita: '<path d="m9 18 6-6-6-6"/>',
  voltar: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  externo: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  estrela: '<path d="M11.52 2.3a.53.53 0 0 1 .96 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.02a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.9l5.16-.76a2.12 2.12 0 0 0 1.6-1.16z"/>',
  enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  lixo: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  salvar: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  varinha: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  checar: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  copiar: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  imagem: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  pacote: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  chave: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 5.74"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  caminho: '<path d="m9 18 6-6-6-6"/>',
  abaixo: '<path d="m6 9 6 6 6-6"/>',
  painel: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  loja: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  olho: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  lapis: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  atividade: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  trocar: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
};
const ic = (nome, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ""}</svg>`;
const vazio = (icone, titulo, texto = "") => `<div class="vazio">${ic(icone, "g")}<b>${titulo}</b>${texto ? `<span>${texto}</span>` : ""}</div>`;
const semFoto = () => `<div class="sem-foto">${ic("imagem")}</div>`;
const MARCA = (sub = "por Monvatti") => `<a href="#/" class="marca"><img src="/static/marca.svg" alt="" width="34" height="34"><div class="marca-texto"><b>Replique</b><small>${sub}</small></div></a>`;

// ---------------------------------------------------------------- tema claro / escuro
const escuroDoSistema = matchMedia("(prefers-color-scheme: dark)");
function temaAtual() {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || t === "light" ? t : escuroDoSistema.matches ? "dark" : "light";
}
function sincronizarTema() {
  const escuro = temaAtual() === "dark";
  document.documentElement.classList.toggle("escuro", escuro);
  $$(".tema-btn").forEach((b) => {
    b.title = escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro";
    b.setAttribute("aria-label", b.title);
  });
}
function alternarTema() {
  const novo = temaAtual() === "dark" ? "light" : "dark";
  const aplicar = () => {
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem("rpq_tema", novo); } catch { /* armazenamento bloqueado */ }
    sincronizarTema();
  };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(aplicar);
  else aplicar();
}
const botaoTema = () => `<button type="button" class="tema-btn" data-tema>${ic("sol", "sol")}${ic("lua", "lua")}</button>`;
document.addEventListener("click", (e) => { if (e.target.closest("[data-tema]")) alternarTema(); });
escuroDoSistema.addEventListener("change", sincronizarTema);
sincronizarTema();

function toast(msg, erro = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast mostrar" + (erro ? " erro" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = "toast"), erro ? 6000 : 3000);
}

async function api(caminho, opcoes = {}) {
  const headers = { ...(opcoes.headers || {}) };
  const token = localStorage.getItem("rpq_token");
  if (token) headers.Authorization = "Bearer " + token;
  // cliente em que a equipe está trabalhando (o servidor confere se o usuário tem acesso)
  if (estado.clienteId && !headers["X-Cliente"]) headers["X-Cliente"] = String(estado.clienteId);
  let body = opcoes.body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const r = await fetch(caminho, { ...opcoes, headers, body });
  if (r.status === 401 && !caminho.startsWith("/api/auth")) {
    localStorage.removeItem("rpq_token");
    estado.usuario = null;
    location.hash = "#/entrar";
    throw new Error("Sessão expirada. Entre novamente.");
  }
  const dados = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) {
    const msg = Array.isArray(dados?.detail) ? dados.detail.map((d) => d.msg).join("; ") : dados?.detail || "Erro " + r.status;
    const erro = new Error(msg);
    erro.status = r.status;
    throw erro;
  }
  return dados;
}

// ---------------------------------------------------------------- cliente ativo
const clienteAtual = () => (estado.usuario?.clientes || []).find((c) => c.id === estado.clienteId) || null;

function escolherClienteInicial() {
  const u = estado.usuario;
  if (u.papel === "cliente") { estado.clienteId = u.cliente_id; return; }
  let salvo = null;
  try { salvo = +localStorage.getItem("rpq_cliente") || null; } catch { /* sem armazenamento */ }
  u.clientes = u.clientes || [];
  const ativos = u.clientes.filter((c) => c.ativo);
  estado.clienteId = u.clientes.some((c) => c.id === salvo && c.ativo) ? salvo : ativos.length === 1 ? ativos[0].id : null;
}

function trocarCliente(id, { navegar = true } = {}) {
  if (id === estado.clienteId) return;
  estado.clienteId = id;
  try { localStorage.setItem("rpq_cliente", String(id)); } catch { /* sem armazenamento */ }
  estado.pesquisa = null;
  desenharSeletor();
  if (!navegar) return;
  const rota = estado._rotaAtual;
  if (rota === "editor") location.hash = "#/rascunhos";
  else roteador();
  toast(`Trabalhando agora em: ${clienteAtual()?.nome || "cliente"}`);
}

async function carregarClientesInfo() {
  if (!eEquipe()) return;
  try {
    estado.clientesInfo = await api("/api/clientes");
    desenharSeletor();
  } catch { /* o seletor funciona sem os detalhes */ }
}

async function comBotao(botao, fn) {
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = `<span class="girando"></span> ${original}`;
  try { return await fn(); }
  catch (e) { toast(e.message, true); }
  finally { botao.disabled = false; botao.innerHTML = original; }
}

function modal(html) {
  const fundo = $("#modal");
  $(".modal", fundo).innerHTML = html;
  fundo.hidden = false;
  return $(".modal", fundo);
}
function fecharModal() { $("#modal").hidden = true; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.dataset.fechar !== undefined) fecharModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

// ---------------------------------------------------------------- roteamento
const rotas = {
  entrar: telaEntrar, painel: telaPainel, pesquisar: telaPesquisar, rascunhos: telaRascunhos, editor: telaEditor, lotes: telaLotes,
  publicacoes: telaPublicacoes, contas: telaContas, clientes: telaClientes, config: telaConfig,
};
// o que cada papel pode abrir (o servidor confere de novo em cada chamada)
const PERMITIDAS = {
  admin: ["painel", "pesquisar", "rascunhos", "editor", "lotes", "publicacoes", "contas", "clientes", "config"],
  operador: ["painel", "pesquisar", "rascunhos", "editor", "lotes", "publicacoes", "contas"],
  cliente: ["painel", "rascunhos", "publicacoes", "contas"],
};
const INICIAL = { admin: "painel", operador: "pesquisar", cliente: "painel" };
// telas que trabalham dentro de um cliente (o editor usa o cliente dono do rascunho)
const PRECISA_CLIENTE = new Set(["pesquisar", "rascunhos", "lotes", "publicacoes", "contas"]);

window.addEventListener("hashchange", roteador);
window.addEventListener("beforeunload", (e) => { if (estado.sujo) { e.preventDefault(); e.returnValue = ""; } });

async function roteador() {
  const [nome, param] = location.hash.replace(/^#\/?/, "").split("/");
  if (estado.sujo && estado._rotaAtual === "editor" && nome !== "editor") {
    if (!confirm("Há alterações não salvas no rascunho. Sair mesmo assim?")) {
      history.replaceState(null, "", "#/editor/" + estado.anuncio.id);
      return;
    }
    estado.sujo = false;
  }
  if (nome === "convite") return telaConvite(param);
  if (nome === "nova-agencia" && !localStorage.getItem("rpq_token")) return telaEntrar("agencia");
  if (!estado.usuario && localStorage.getItem("rpq_token")) {
    try {
      estado.usuario = await api("/api/me");
      if (!Array.isArray(estado.usuario.clientes)) {
        // servidor de uma versão anterior (antes dos clientes): precisa ser reiniciado
        estado.usuario = null;
        $("#app").innerHTML = `<div class="entrar" style="grid-template-columns:1fr"><div class="form"><div class="caixa cartao">
          <h2>Reinicie o Replique</h2><p class="suave">A tela foi atualizada, mas o servidor ainda é da versão anterior.
          Feche a janela do <b>iniciar.bat</b> e abra de novo; depois recarregue esta página.</p></div></div></div>`;
        return;
      }
      escolherClienteInicial();
      carregarClientesInfo();
    } catch { /* token inválido */ }
  }
  if (!estado.usuario) return telaEntrar();
  const papel = estado.usuario.papel;
  const rota = PERMITIDAS[papel].includes(nome) ? nome : INICIAL[papel];
  if (rota !== nome && nome && nome !== "entrar") history.replaceState(null, "", "#/" + rota);
  estado._rotaAtual = rota;
  casca(rota);
  try {
    if (PRECISA_CLIENTE.has(rota) && !estado.clienteId) await telaEscolherCliente(rota);
    else await rotas[rota](param);
  } catch (e) {
    if (e.status === 409) await telaEscolherCliente(rota);
    else $("#tela").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`;
  }
  animarTela();
}

function menuDoPapel() {
  const papel = estado.usuario.papel;
  if (papel === "cliente") {
    return [["Minha loja", [["painel", "Acompanhamento", "painel"], ["rascunhos", "Anúncios", "rascunhos"],
      ["publicacoes", "Publicações", "publicar"], ["contas", "Contas", "contas"]]]];
  }
  const menu = [
    ["Anúncios", [["pesquisar", "Pesquisar", "pesquisar"], ["rascunhos", "Rascunhos", "rascunhos"],
      ["lotes", "Publicação em lote", "pacote"], ["publicacoes", "Publicações", "publicar"]]],
    ["Gestão", [["painel", "Painel", "painel"], ["contas", "Contas do cliente", "contas"]]],
  ];
  if (papel === "admin") menu[1][1].push(["clientes", "Clientes", "loja"], ["config", "Configurações", "config"]);
  return menu;
}
const TITULO_ROTA = { painel: "Painel", pesquisar: "Pesquisar", rascunhos: "Rascunhos", editor: "Editar anúncio", lotes: "Publicação em lote", publicacoes: "Publicações",
  contas: "Contas", clientes: "Clientes", config: "Configurações" };

// A casca (menu + barra do topo) é desenhada uma vez; depois só troca o item ativo e o conteúdo.
function casca(ativa) {
  const u = estado.usuario;
  if (!$(".casca")) {
    const iniciais = (u.nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
    $("#app").innerHTML = `
    <div class="casca">
      <aside class="lateral">
        ${MARCA()}
        <nav aria-label="Menu principal">${menuDoPapel().map(([grupo, itens]) => `<div class="grupo-rotulo"><span class="rotulo">${grupo}</span></div>
          ${itens.map(([r, rotulo, icone]) => `<a href="#/${r}" data-rota="${r}" title="${rotulo}">${ic(icone)}<span class="rotulo">${rotulo}</span></a>`).join("")}`).join("")}</nav>
        <div class="rodape"><span>Monvatti</span><span>v1.1</span></div>
      </aside>
      <div class="cortina" data-fechar-menu></div>
      <div class="principal">
        <header class="barra-topo">
          <button class="icone so-mobile" id="abrir-menu" aria-label="Abrir menu">${ic("menu")}</button>
          <div id="seletor" class="seletor"></div>
          <div class="migalha"><b id="migalha-atual"></b></div>
          <div class="espaco"></div>
          ${botaoTema()}
          <div class="usuario">
            <div class="quem"><b>${h(u.nome)}</b><span>${h(PAPEL[u.papel])} · ${h(u.empresa.nome)}</span></div>
            <button class="avatar" id="minha-conta" title="Minha conta: trocar senha" aria-label="Minha conta">${h(iniciais)}</button>
            <button class="icone" id="sair" title="Sair" aria-label="Sair">${ic("sair")}</button>
          </div>
        </header>
        <main class="conteudo" id="tela"></main>
      </div>
    </div>`;
    $("#sair").onclick = () => {
      localStorage.removeItem("rpq_token");
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null });
      location.hash = "#/entrar";
      roteador();
    };
    $("#minha-conta").onclick = trocarMinhaSenha;
    $("#abrir-menu").onclick = () => $(".casca").classList.add("menu-aberto");
    $("[data-fechar-menu]").onclick = () => $(".casca").classList.remove("menu-aberto");
    sincronizarTema();
    desenharSeletor();
  }
  $(".casca").classList.remove("menu-aberto");
  const grupoAtivo = ativa === "editor" ? "rascunhos" : ativa;
  $$(".lateral nav a").forEach((a) => {
    const on = a.dataset.rota === grupoAtivo;
    a.classList.toggle("ativo", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("#migalha-atual").textContent = TITULO_ROTA[ativa] || "";
  document.title = `${TITULO_ROTA[ativa] || "Replique"} · Replique`;
  $("#tela").innerHTML = `<div class="pilha" aria-busy="true">
    <div class="esqueleto" style="height:28px;width:240px"></div>
    <div class="esqueleto" style="height:14px;width:380px;max-width:100%"></div>
    <div class="esqueleto" style="height:160px;margin-top:8px"></div></div>`;
  window.scrollTo({ top: 0 });
}

function trocarMinhaSenha() {
  const u = estado.usuario;
  const m = modal(`<h2>${ic("chave", "p")}Minha conta</h2>
    <p class="suave pequeno">${h(u.nome)} · ${h(u.email)} · ${h(PAPEL[u.papel])}</p>
    <form id="f-senha" class="pilha">
      <div><label for="ms-atual">Senha atual</label><input id="ms-atual" name="atual" type="password" required autocomplete="current-password"></div>
      <div class="grade g2">
        <div><label for="ms-nova">Nova senha</label><input id="ms-nova" name="nova" type="password" minlength="8" required autocomplete="new-password"></div>
        <div><label for="ms-conf">Repita a nova senha</label><input id="ms-conf" type="password" minlength="8" required autocomplete="new-password"></div>
      </div>
      <p class="pequeno suave" style="margin:0">Ao trocar, você continua conectado aqui e as sessões abertas em outros aparelhos são encerradas.</p>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Trocar senha</button></div>
    </form>`);
  $("#ms-atual", m).focus();
  $("#f-senha", m).onsubmit = (e) => {
    e.preventDefault();
    if ($("#ms-nova", m).value !== $("#ms-conf", m).value) return toast("As duas senhas novas não são iguais.", true);
    comBotao($("button[type=submit]", m), async () => {
      const r = await api("/api/me/senha", { method: "POST", body: { atual: $("#ms-atual", m).value, nova: $("#ms-nova", m).value } });
      localStorage.setItem("rpq_token", r.token);
      fecharModal();
      toast("Senha trocada.");
    });
  };
}

// ---------------------------------------------------------------- seletor de cliente (topo)
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
  // redesenhar (ex.: chegou a situação do ML) não pode fechar o painel aberto
  const estavaAberto = $("#seletor-painel") && !$("#seletor-painel").hidden;
  const termoAnterior = $("#seletor-busca")?.value || "";
  const atual = clienteAtual();
  if (!eEquipe()) {
    alvo.innerHTML = atual ? `<div class="seletor-btn fixo">${ic("loja", "p")}<span class="nome">${h(atual.nome)}</span></div>` : "";
    return;
  }
  const info = (estado.clientesInfo || []).find((c) => c.id === estado.clienteId);
  alvo.innerHTML = `<button class="seletor-btn" id="seletor-btn" aria-haspopup="listbox" aria-expanded="false" title="Trocar de cliente">
      ${atual ? pontoML(info) : ic("loja", "p")}
      <span class="nome">${atual ? h(atual.nome) : "Escolher cliente"}</span>${ic("abaixo", "p")}</button>
    <div class="seletor-painel" id="seletor-painel" hidden>
      <input type="text" id="seletor-busca" placeholder="Buscar cliente…" autocomplete="off" aria-label="Buscar cliente">
      <div class="seletor-lista" id="seletor-lista" role="listbox"></div>
      ${eAdmin() ? `<a href="#/clientes" class="seletor-rodape">${ic("config", "p")}Gerenciar clientes</a>` : ""}
    </div>`;
  const painel = $("#seletor-painel"), btn = $("#seletor-btn"), busca = $("#seletor-busca");
  const listar = () => {
    const termo = busca.value.trim().toLowerCase();
    const todos = estado.usuario.clientes.filter((c) => c.ativo && c.nome.toLowerCase().includes(termo));
    const infos = Object.fromEntries((estado.clientesInfo || []).map((c) => [c.id, c]));
    $("#seletor-lista").innerHTML = todos.length ? todos.map((c) => `
      <button type="button" class="seletor-item ${c.id === estado.clienteId ? "atual" : ""}" data-cliente="${c.id}" role="option">
        ${pontoML(infos[c.id])}<span class="nome">${h(c.nome)}</span>
        <span class="suave pequeno">${infos[c.id]?.ml?.apelido ? h(infos[c.id].ml.apelido) : infos[c.id] ? "sem ML" : ""}</span></button>`).join("")
      : `<div class="suave pequeno" style="padding:10px 12px">${estado.usuario.clientes.length ? "Nenhum cliente com esse nome." :
        eAdmin() ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente atribuído a você. Fale com o administrador."}</div>`;
    $$("[data-cliente]", painel).forEach((b) => (b.onclick = () => { fechar(); trocarCliente(+b.dataset.cliente); }));
  };
  const fechar = () => { painel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
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
    carregarClientesInfo(); // situação do ML sempre atual ao abrir
  };
  busca.oninput = listar;
  busca.onkeydown = (e) => {
    if (e.key === "Enter") $("#seletor-lista [data-cliente]")?.click();
    if (e.key === "Escape") { fechar(); btn.focus(); }
  };
  painel.onclick = (e) => e.stopPropagation();
  if (estavaAberto) abrir(termoAnterior);
}
// clicar fora fecha o seletor
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

function animarTela() {
  const t = $("#tela");
  if (!t) return;
  t.classList.remove("entrando");
  void t.offsetWidth; // reinicia a animação
  t.classList.add("entrando");
}

// ---------------------------------------------------------------- entrar
function telaEntrar(modo = "login") {
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("por Monvatti")}
      <div>
        <h1>Descubra o que mais vende e publique em minutos.</h1>
        <p>Pesquise os anúncios líderes, copie o melhor e publique no Mercado Livre, na Shopee e na Amazon a partir de um só lugar.</p>
        <ol class="passos">
          ${["Digite o produto e escolha as plataformas", "Veja os anúncios que mais vendem", "Copie o melhor para o Replique",
            "Edite título, fotos e características", "Publique nos marketplaces"].map((t, i) => `<li><span>${i + 1}</span>${t}</li>`).join("")}
        </ol>
      </div>
      <div class="credito">© ${new Date().getFullYear()} Monvatti · Todos os direitos reservados</div>
    </div>
    <div class="form">${botaoTema()}<div class="caixa">
      <h2>${modo === "agencia" ? "Criar uma nova agência" : "Acesse sua conta"}</h2>
      <div class="suave">${modo === "agencia"
        ? "Cria uma empresa nova e separada no Replique. Lojista: use o link de cadastro que a sua agência enviou."
        : "Entre com o e-mail e a senha do seu acesso."}</div>
      <div style="height:18px"></div>
      <form id="f-login" class="pilha" ${modo === "agencia" ? "hidden" : ""}>
        <div><label for="le">E-mail</label><input id="le" type="email" name="email" required autocomplete="email"></div>
        <div><label for="ls">Senha</label><input id="ls" type="password" name="senha" required autocomplete="current-password"></div>
        <button type="submit">Entrar</button>
        <p class="pequeno suave" style="margin:4px 0 0">É lojista e ainda não tem acesso? Peça à Monvatti o <b>link de cadastro</b> da sua loja.</p>
      </form>
      <form id="f-cadastro" class="pilha" ${modo === "agencia" ? "" : "hidden"}>
        <div><label for="ce">Nome da empresa</label><input id="ce" type="text" name="empresa" required></div>
        <div><label for="cn">Seu nome</label><input id="cn" type="text" name="nome" required autocomplete="name"></div>
        <div><label for="cm">E-mail</label><input id="cm" type="email" name="email" required autocomplete="email"></div>
        <div><label for="cs">Senha (mín. 8 caracteres)</label><input id="cs" type="password" name="senha" minlength="8" required autocomplete="new-password"></div>
        <button type="submit">Criar agência</button>
        <a href="#/entrar" class="pequeno" style="text-align:center">Já tenho acesso</a>
      </form>
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Entrar · Replique";
  const enviar = (id, rota) => ($(id).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button", e.target), async () => {
      const r = await api(rota, { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      localStorage.setItem("rpq_token", r.token);
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null });
      location.hash = "#/";
      roteador();
    });
  });
  enviar("#f-login", "/api/auth/login");
  enviar("#f-cadastro", "/api/auth/cadastro");
}

// ---------------------------------------------------------------- cadastro do lojista (link da agência)
async function telaConvite(token) {
  let empresa = "";
  try { empresa = (await api("/api/convite/" + encodeURIComponent(token || ""))).empresa; }
  catch (e) { empresa = null; }
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("por Monvatti")}
      <div>
        <h1>Cadastre sua loja${empresa ? ` com a ${h(empresa)}` : ""}.</h1>
        <p>Depois do cadastro você conecta a sua conta do Mercado Livre e acompanha, por aqui, cada anúncio que a equipe criar para a sua loja.</p>
        <ol class="passos">
          ${["Cadastre a loja e o seu acesso", "Conecte o Mercado Livre (sem passar a sua senha a ninguém)",
            "A equipe cria e publica os anúncios", "Você acompanha tudo em tempo real"].map((t, i) => `<li><span>${i + 1}</span>${t}</li>`).join("")}
        </ol>
      </div>
      <div class="credito">© ${new Date().getFullYear()} Monvatti · Todos os direitos reservados</div>
    </div>
    <div class="form">${botaoTema()}<div class="caixa">
      ${empresa === null ? `<h2>Link inválido</h2><p class="suave">Este link de cadastro não existe ou foi trocado. Peça um link novo à equipe.</p>
        <a class="botao" href="#/entrar">Ir para o login</a>` : `
      <h2>Cadastro da loja</h2>
      <div class="suave">Leva menos de um minuto.</div>
      <div style="height:18px"></div>
      <form id="f-convite" class="pilha">
        <div><label for="cv-loja">Nome da loja</label><input id="cv-loja" type="text" name="loja" required></div>
        <div><label for="cv-doc">CNPJ ou CPF <span class="suave">(opcional)</span></label><input id="cv-doc" type="text" name="documento"></div>
        <div><label for="cv-nome">Seu nome</label><input id="cv-nome" type="text" name="nome" required autocomplete="name"></div>
        <div><label for="cv-email">E-mail</label><input id="cv-email" type="email" name="email" required autocomplete="email"></div>
        <div><label for="cv-senha">Senha (mín. 8 caracteres)</label><input id="cv-senha" type="password" name="senha" minlength="8" required autocomplete="new-password"></div>
        <button type="submit">Criar minha loja</button>
        <a href="#/entrar" class="pequeno" style="text-align:center">Já tenho acesso</a>
      </form>`}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Cadastro da loja · Replique";
  const f = $("#f-convite");
  if (!f) return;
  $("#cv-loja").focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", f), async () => {
      const r = await api("/api/convite/" + encodeURIComponent(token), { method: "POST", body: Object.fromEntries(new FormData(f)) });
      localStorage.setItem("rpq_token", r.token);
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null, boasVindas: true });
      location.hash = "#/contas";
    });
  };
}

// ---------------------------------------------------------------- pesquisar
async function telaPesquisar(pesquisaId) {
  const escolhidas = JSON.parse(localStorage.getItem("rpq_plats") || '["mercadolivre","shopee","amazon"]');
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Pesquisar produtos</h1><div class="suave">Veja os anúncios que mais vendem e copie o melhor para editar e publicar. A pesquisa usa as contas de <b>${h(clienteAtual()?.nome)}</b> e os rascunhos ficam nesse cliente.</div></div></div>
  <form class="cartao pilha" id="f-pesquisa">
    <div class="linha" style="align-items:flex-end">
      <div style="flex:1;min-width:240px"><label for="termo">Nome do produto</label>
        <input id="termo" type="text" name="termo" placeholder="Ex.: garrafa térmica inox 1 litro" required value="${h(estado.pesquisa?.termo || "")}"></div>
      <div><label for="limite">Resultados por plataforma</label>
        <select id="limite" name="limite"><option>10</option><option selected>20</option><option>40</option></select></div>
      <button type="submit" id="b-pesquisar">${ic("pesquisar")}Pesquisar</button>
    </div>
    <div><label>Plataformas</label><div class="chips">
      ${Object.entries(PLAT).map(([k, p]) => `<label class="chip ${escolhidas.includes(k) ? "marcado" : ""}"><input type="checkbox" name="plataformas" value="${k}" ${escolhidas.includes(k) ? "checked" : ""}> ${p.nome}</label>`).join("")}
    </div></div>
  </form>
  <div id="resultado" style="margin-top:20px"></div>
  <div class="cartao" style="margin-top:20px"><h2>${ic("relogio", "p")}Pesquisas recentes</h2><div id="historico" class="suave">Carregando…</div></div>`;

  $$(".chip input").forEach((c) => (c.onchange = () => c.parentElement.classList.toggle("marcado", c.checked)));
  $("#f-pesquisa").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const plataformas = fd.getAll("plataformas");
    if (!plataformas.length) return toast("Escolha pelo menos uma plataforma.", true);
    localStorage.setItem("rpq_plats", JSON.stringify(plataformas));
    executarPesquisa({ termo: fd.get("termo"), plataformas, limite: +fd.get("limite") });
  };

  if (pesquisaId && (!estado.pesquisa || estado.pesquisa.id != pesquisaId)) {
    estado.pesquisa = await api("/api/pesquisas/" + pesquisaId);
    $("#termo").value = estado.pesquisa.termo;
  }
  if (estado.pesquisa && pesquisaId) desenharResultados();
  carregarHistorico();
}

function executarPesquisa(corpo) {
  $("#resultado").innerHTML = `<div class="carregando"><span class="girando"></span> Consultando ${corpo.plataformas.map((p) => PLAT[p].nome).join(", ")}… (o Mercado Livre pode levar até ~20 s)</div>`;
  let ok = false;
  return comBotao($("#b-pesquisar"), async () => {
    estado.pesquisa = await api("/api/pesquisas", { method: "POST", body: corpo });
    estado.pesquisa.limite = corpo.limite;
    estado.filtro = "todas";
    history.replaceState(null, "", "#/pesquisar/" + estado.pesquisa.id);
    desenharResultados();
    carregarHistorico();
    ok = true;
  }).then(() => { if (!ok) $("#resultado").innerHTML = ""; });
}

function barraCategoriasML(p) {
  const m = p.meta?.mercadolivre;
  if (!m || !m.categorias_sugeridas?.length) return "";
  const usadas = new Set((m.categorias_usadas || []).map((c) => c.category_id));
  const b = m.busca || {};
  const faixaBusca = b.modo === "exata"
    ? `<div class="aviso azul pequeno linha entre" style="margin-bottom:12px">
        <span>${ic("pesquisar", "p")} <b>Busca exata no Mercado Livre:</b> só produtos da marca <b>${h(b.marca)}</b>, na ordem em que o ML os posiciona.
          ${b.fontes?.busca === -1 ? " A busca do ML não respondeu para esta conta; usei o ranking e o catálogo." : ""}</span>
        <button class="sec pequeno" id="todas-marcas">Ver mais vendidos de todas as marcas</button></div>`
    : b.sem_resultado_marca
      ? `<div class="aviso amarelo pequeno">Não encontrei anúncios da marca <b>${h(b.sem_resultado_marca)}</b> no Mercado Livre; mostrando os mais vendidos da categoria.</div>`
      : "";
  return `${faixaBusca}<div class="cartao" style="margin-bottom:16px;padding:12px 16px">
    <div class="linha">${selo("mercadolivre")}<span class="pequeno"><b>Categoria do ranking:</b> ${(m.categorias_usadas || []).map((c) => h(c.category_name)).join(" + ") || "—"}</span></div>
    <div class="linha pequeno" style="margin-top:8px"><span class="suave">Não é o produto certo? Trocar para:</span>
      ${m.categorias_sugeridas.filter((c) => !usadas.has(c.category_id)).map((c) =>
        `<button class="sec pequeno" data-cat-ml="${h(c.category_id)}" title="${h(c.domain_name || "")}">${h(c.category_name)} <span class="suave">${h(c.domain_name || "")}</span></button>`).join("")}
    </div></div>`;
}

async function carregarHistorico() {
  const lista = await api("/api/pesquisas");
  $("#historico").innerHTML = lista.length
    ? `<div class="linha">${lista.map((p) => `<a class="botao sec pequeno" href="#/pesquisar/${p.id}">${h(p.termo)} <span class="suave pequeno">· ${p.quantidade} · ${data(p.criada_em)}</span></a>`).join("")}</div>`
    : "Nenhuma pesquisa ainda.";
}

function desenharResultados() {
  const p = estado.pesquisa;
  const plats = [...new Set(p.resultados.map((r) => r.plataforma))];
  const restritos = p.resultados.filter((r) => r.extra?.restrito).length;
  const itens = p.resultados.filter((r) => (estado.filtro === "todas" || r.plataforma === estado.filtro)
    && !(estado.soCompletos && r.extra?.restrito));
  const avisos = p.avisos.map((a) => `<div class="aviso ${a.mensagem.startsWith("Modo demonstração") ? "amarelo" : "vermelho"}">${selo(a.plataforma)} ${h(a.mensagem)}
      ${a.mensagem.startsWith("Modo demonstração") ? ` — <a href="#/contas">conectar conta</a>` : ""}</div>`).join("");
  const resumo = Object.entries(p.resumo).map(([pl, r]) => `
    <div class="cartao kpi"><div class="linha entre">${selo(pl)}${r.demo ? '<span class="selo demo">demonstração</span>' : ""}</div>
      <div class="rotulo">Faixa de preço dos mais vendidos</div>
      <div class="valor">${brl(r.preco_min)} – ${brl(r.preco_max)}</div>
      <div class="pequeno">Mediana: <b>${brl(r.preco_mediano)}</b> · ${r.quantidade} anúncios</div>
      <div class="pequeno suave" style="margin-top:6px">Líder: ${h(r.lider)}</div></div>`).join("");

  $("#resultado").innerHTML = `
    ${avisos}
    ${resumo ? `<div class="grade g${Math.min(3, Object.keys(p.resumo).length)}" style="margin-bottom:18px">${resumo}</div>` : ""}
    ${barraCategoriasML(p)}
    ${p.resultados.length ? `
    <div class="abas">
      <button data-f="todas" class="${estado.filtro === "todas" ? "ativa" : ""}">Todas (${p.resultados.length})</button>
      ${plats.map((pl) => `<button data-f="${pl}" class="${estado.filtro === pl ? "ativa" : ""}">${PLAT[pl].nome} (${p.resultados.filter((r) => r.plataforma === pl).length})</button>`).join("")}
    </div>
    <p class="suave pequeno">Ordenado por <b>popularidade</b> (0–100): posição no ranking oficial de mais vendidos (Mercado Livre), quantidade vendida (Shopee) ou ranking de vendas (Amazon).</p>
    ${restritos ? `<div class="aviso azul pequeno">${restritos} resultado(s) do Mercado Livre são anúncios de vendedores cujos detalhes (título, foto, preço) a API do ML não libera para outros apps. Eles aparecem com a posição no ranking, visitas e link.
      <label style="display:inline;font-weight:600;margin-left:8px"><input type="checkbox" id="so-completos" ${estado.soCompletos ? "checked" : ""}> mostrar só os completos</label></div>` : ""}
    <div class="resultados">${itens.map(cartaoProduto).join("")}</div>` : `<div class="cartao">${vazio("pesquisar", "Nenhum resultado", "Tente outro termo ou outras plataformas.")}</div>`}`;
  $$("#resultado .produto").forEach((el, i) => (el.style.animationDelay = Math.min(i, 12) * 25 + "ms"));

  $$("#resultado .abas button").forEach((b) => (b.onclick = () => { estado.filtro = b.dataset.f; desenharResultados(); }));
  const so = $("#so-completos");
  if (so) so.onchange = () => { estado.soCompletos = so.checked; desenharResultados(); };
  $$("#resultado [data-cat-ml]").forEach((b) => (b.onclick = () =>
    executarPesquisa({ termo: p.termo, plataformas: p.plataformas, limite: p.limite || 20, categoria_ml: b.dataset.catMl,
      todas_marcas: p.meta?.mercadolivre?.busca?.modo !== "exata" })));
  const tm = $("#todas-marcas");
  if (tm) tm.onclick = () => executarPesquisa({ termo: p.termo, plataformas: p.plataformas, limite: p.limite || 20, todas_marcas: true });
  $$("#resultado [data-copiar]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const r = p.resultados[+b.dataset.copiar];
    const a = await api("/api/anuncios/copiar", { method: "POST", body: { plataforma: r.plataforma, id_externo: r.id_externo, tipo: r.tipo, pesquisa_id: p.id } });
    toast("Anúncio copiado para o Replique. Agora é só editar.");
    location.hash = "#/editor/" + a.id;
  })));
}

function cartaoProduto(r) {
  const idx = estado.pesquisa.resultados.indexOf(r);
  const img = urlSegura(r.imagem);
  const restrito = !!r.extra?.restrito;
  const metricas = [
    r.vendidos != null ? `${Number(r.vendidos).toLocaleString("pt-BR")} vendidos` : "",
    r.avaliacao ? `${ic("estrela", "p cheio")} ${r.avaliacao}` : "",
    r.extra?.preco_max && r.extra.preco_max > r.preco ? `até ${brl(r.extra.preco_max)}` : "",
  ].filter(Boolean).join(" · ");
  return `<article class="cartao produto">
    <div class="foto">${img ? `<img src="${h(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="pequeno" style="padding:12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px">${ic("imagem", "g")}${restrito ? "Foto não liberada pela API do ML" : "Sem foto"}</span>`}
      <span class="posicao">#${r.posicao_geral}</span>${selo(r.plataforma)}</div>
    <div class="corpo">
      <div class="titulo ${restrito ? "suave" : ""}" title="${h(r.titulo)}">${h(r.titulo)}</div>
      ${r.extra?.trecho ? `<div class="pequeno" style="font-style:italic">“${h(r.extra.trecho)}”</div>` : ""}
      <div class="preco">${restrito ? '<span class="pequeno suave">preço no anúncio</span>' : brl(r.preco)}</div>
      <div class="pequeno suave">${h(r.origem_sinal)}${metricas ? "<br>" + metricas : ""}</div>
      <div title="Popularidade ${r.popularidade}"><div class="barra"><i style="width:${Math.max(3, r.popularidade)}%"></i></div></div>
      ${r.demo ? '<span class="selo demo" style="align-self:flex-start">demonstração</span>' : ""}
      <div class="acoes">
        <button data-copiar="${idx}" ${restrito ? 'class="sec" title="Cria um rascunho com o link (e a descrição, quando liberada); você completa título, fotos e preço"' : ""}>${ic("copiar", "p")}Copiar</button>
        ${urlSegura(r.link) ? `<a class="botao ${restrito ? "" : "sec"}" href="${h(r.link)}" target="_blank" rel="noopener" title="Ver anúncio original" aria-label="Ver anúncio original">${restrito ? "Abrir no ML " : ""}${ic("externo", "p")}</a>` : ""}
      </div>
    </div></article>`;
}

// ---------------------------------------------------------------- rascunhos
const ROTULO_STATUS = { rascunho: ["neutro", "Rascunho"], publicado: ["ok", "Publicado"], parcial: ["demo", "Parcial"],
  erro: ["erro", "Com erro"], simulado: ["demo", "Simulado"] };
const seloStatus = (s) => `<span class="selo ${ROTULO_STATUS[s]?.[0] || "neutro"}">${ROTULO_STATUS[s]?.[1] || h(s)}</span>`;

async function telaRascunhos() {
  const lista = await api("/api/anuncios");
  const equipe = eEquipe();
  const cliente = clienteAtual();
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${equipe ? "Rascunhos" : "Anúncios da sua loja"}</h1>
    <div class="suave">${equipe ? `Anúncios de <b>${h(cliente?.nome)}</b>, copiados ou criados, prontos para editar e publicar.`
      : "Tudo o que a equipe Monvatti preparou para a sua loja, com quem fez e em que pé está."}</div></div>
    ${equipe ? `<button id="novo">${ic("mais")}Criar do zero</button>` : ""}</div>
  ${equipe && lista.length ? `<div class="barra-lote cartao">
    <label class="linha" style="margin:0;gap:8px"><input type="checkbox" id="sel-todos"> Selecionar todos</label>
    <span class="suave pequeno" id="sel-info">Marque os rascunhos para publicar vários de uma vez (até 20 por lote).</span>
    <button id="b-lote" disabled>${ic("pacote", "p")}Publicar em lote</button></div>` : ""}
  <div class="cartao">${lista.length ? lista.map((a) => `
    <div class="lista-item">
      ${equipe ? `<input type="checkbox" class="sel-lote" value="${a.id}" aria-label="Selecionar ${h(a.titulo)}">` : ""}
      ${urlSegura(a.foto) ? `<img src="${h(a.foto)}" alt="" referrerpolicy="no-referrer">` : semFoto()}
      <div class="info"><b>${h(a.titulo || "(sem título)")}</b>
        <span class="pequeno suave">${brl(a.preco)} · ${a.origem && PLAT[a.origem] ? "copiado de " + PLAT[a.origem].nome : "criado manualmente"}
          ${a.criado_por ? ` · por <b>${h(a.criado_por)}</b>` : ""} · ${data(a.atualizado_em)}</span></div>
      ${seloStatus(a.status)}
      ${equipe ? `<a class="botao sec pequeno" href="#/editor/${a.id}">${ic("lapis", "p")}Editar</a>`
        : `<button class="sec pequeno" data-ver="${a.id}">${ic("olho", "p")}Ver</button>`}
    </div>`).join("") : vazio("rascunhos", "Nenhum anúncio ainda",
      equipe ? `<a href="#/pesquisar">Pesquise um produto</a> e copie um anúncio para começar.` : "Assim que a equipe começar, os anúncios aparecem aqui.")}</div>`;
  const novo = $("#novo");
  if (novo) novo.onclick = () => comBotao(novo, async () => {
    const a = await api("/api/anuncios", { method: "POST", body: { titulo: "Novo produto" } });
    location.hash = "#/editor/" + a.id;
  });
  $$("[data-ver]").forEach((b) => (b.onclick = () => comBotao(b, () => verAnuncio(+b.dataset.ver))));
  const selecionados = () => $$(".sel-lote:checked").map((c) => +c.value);
  const atualizar = () => {
    const n = selecionados().length;
    $("#b-lote").disabled = !n;
    $("#b-lote").innerHTML = `${ic("pacote", "p")}Publicar em lote${n ? ` (${n})` : ""}`;
    $("#sel-info").textContent = n > 20 ? `${n} selecionados: o máximo por lote é 20.`
      : n ? `${n} rascunho(s) selecionado(s).` : "Marque os rascunhos para publicar vários de uma vez (até 20 por lote).";
    $("#sel-info").classList.toggle("aviso-texto", n > 20);
  };
  $$(".sel-lote").forEach((c) => (c.onchange = atualizar));
  const todos = $("#sel-todos");
  if (todos) todos.onchange = () => { $$(".sel-lote").forEach((c) => (c.checked = todos.checked)); atualizar(); };
  const bLote = $("#b-lote");
  if (bLote) bLote.onclick = () => abrirLote(selecionados());
}

// ---------------------------------------------------------------- publicação em lote
const SITUACAO = { pronto: ["ok", "pronto"], bloqueado: ["erro", "bloqueado"], pulado: ["demo", "pulado"] };
const STATUS_LOTE = { na_fila: ["neutro", "na fila"], executando: ["neutro", "publicando"], concluido: ["ok", "concluído"],
  interrompido: ["erro", "interrompido"], cancelado: ["demo", "cancelado"] };
const STATUS_ITEM = { pendente: ["neutro", "aguardando"], publicado: ["ok", "publicado"], simulado: ["demo", "simulado"],
  falhou: ["erro", "falhou"], pulado: ["demo", "pulado"] };
const seloDe = (mapa, s) => `<span class="selo ${mapa[s]?.[0] || "neutro"}">${mapa[s]?.[1] || h(s)}</span>`;

function abrirLote(ids) {
  if (ids.length > 20) return toast("O máximo é 20 rascunhos por lote. Desmarque alguns.", true);
  const destinos = JSON.parse(localStorage.getItem("rpq_destinos") || '["mercadolivre"]');
  const m = modal(`<h2>${ic("pacote", "p")}Publicar ${ids.length} rascunho(s) em lote</h2>
    <div class="aviso azul">${ic("loja", "p")} Cliente: <b>${h(clienteAtual()?.nome)}</b></div>
    <label>Publicar em</label>
    <div class="chips" id="lote-plats">${Object.entries(PLAT).map(([k, p]) => `<label class="chip ${destinos.includes(k) ? "marcado" : ""}">
      <input type="checkbox" value="${k}" ${destinos.includes(k) ? "checked" : ""}> ${p.nome}</label>`).join("")}</div>
    <p class="pequeno suave" style="margin-top:12px">Primeiro o Replique confere tudo <b>sem publicar</b>. Depois os anúncios entram numa fila e são
      publicados <b>um por vez</b>, com intervalo, para não parecer publicação em rajada.</p>
    <div id="lote-previa"></div>
    <div class="linha" id="lote-rodape" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button>
      <button id="lote-conferir">${ic("checar", "p")}Conferir lote</button></div>`);
  $$("#lote-plats input", m).forEach((i) => (i.onchange = () => { i.parentElement.classList.toggle("marcado", i.checked); $("#lote-previa", m).innerHTML = ""; }));
  const plats = () => $$("#lote-plats input:checked", m).map((i) => i.value);
  $("#lote-conferir", m).onclick = () => comBotao($("#lote-conferir", m), async () => {
    if (!plats().length) return toast("Escolha pelo menos uma plataforma.", true);
    const p = await api("/api/lotes/previa", { method: "POST", body: { anuncio_ids: ids, plataformas: plats() } });
    desenharPrevia(m, p, ids);
  });
}

function desenharPrevia(m, p, ids) {
  const plats = Object.keys(p.contas);
  const reais = plats.filter((k) => p.contas[k].real);
  const total = Object.values(p.prontos).reduce((a, b) => a + b, 0);
  $("#lote-previa", m).innerHTML = `
    <h3 style="margin-top:14px">Contas</h3>
    ${plats.map((k) => { const c = p.contas[k]; return `<div class="aviso ${c.real ? "azul" : "amarelo"} pequeno">${selo(k)}
      ${c.real ? `Conta <b>${h(c.apelido)}</b> · ${c.publicadas_24h} publicada(s) nas últimas 24 h de ${c.limite_24h} permitidas`
        : "Modo demonstração: nada será enviado (" + h(c.aviso.replace("Modo demonstração: ", "").replace(/\.$/, "")) + ")"}</div>`; }).join("")}
    ${p.alertas.map((a) => `<div class="aviso amarelo pequeno">${ic("alerta", "p")} ${h(a)}</div>`).join("")}
    <h3 style="margin-top:14px">Conferência <span class="suave pequeno">(${total} publicação(ões) prontas)</span></h3>
    <div class="tabela embutida"><table><thead><tr><th>Rascunho</th>${plats.map((k) => `<th>${h(PLAT[k].nome)}</th>`).join("")}</tr></thead><tbody>
      ${p.itens.map((i) => `<tr><td><b>${h(i.titulo || "(sem título)")}</b>${i.preco != null ? `<div class="pequeno suave">${brl(i.preco)}</div>` : ""}</td>
        ${plats.map((k) => { const s = i.plataformas[k]; return `<td>${seloDe(SITUACAO, s.situacao)}
          ${s.erros.length ? `<div class="pequeno" style="color:var(--vermelho);margin-top:4px">${s.erros.map(h).join("<br>")}</div>` : ""}
          ${s.situacao === "pronto" && s.avisos.length ? `<div class="pequeno suave" style="margin-top:4px" title="${h(s.avisos.join("\n"))}">${s.avisos.length} aviso(s)</div>` : ""}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div>
    <p class="pequeno suave">Travas: até ${p.max_anuncios} rascunhos por lote · ${p.intervalo_s} s entre publicações reais · para sozinho após 3 falhas seguidas ou se o ML pausar um anúncio · pula duplicados.</p>
    ${reais.length ? `<label class="confirmacao"><input type="checkbox" id="lote-conferi">
      Conferi que ${reais.map((k) => `<b>${h(p.contas[k].apelido)}</b> (${h(PLAT[k].nome)})`).join(" e ")} ${reais.length > 1 ? "são contas" : "é a conta"} de <b>${h(p.cliente.nome)}</b></label>` : ""}`;
  const rodape = $("#lote-rodape", m);
  rodape.innerHTML = `<button class="sec" data-fechar>Cancelar</button><button id="lote-criar" ${total ? "" : "disabled"}>${ic("publicar", "p")}Colocar ${total} na fila</button>`;
  const conferi = $("#lote-conferi", m), criar = $("#lote-criar", m);
  if (conferi) { criar.disabled = true; conferi.onchange = () => (criar.disabled = !conferi.checked || !total); }
  criar.onclick = () => comBotao(criar, async () => {
    const lote = await api("/api/lotes", { method: "POST", body: { anuncio_ids: ids, plataformas: plats, confirmado: !!conferi?.checked } });
    fecharModal();
    toast(`Lote #${lote.id} na fila: ${lote.total} publicação(ões).`);
    location.hash = "#/lotes";
  });
}

let _atualizarLotes = null;
async function telaLotes() {
  clearTimeout(_atualizarLotes);
  const lista = await api("/api/lotes");
  if (estado._rotaAtual !== "lotes") return;
  const ativo = lista.some((l) => ["na_fila", "executando"].includes(l.status));
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Publicação em lote</h1>
    <div class="suave">Lotes de <b>${h(clienteAtual()?.nome)}</b>. Para criar um, marque os rascunhos em <a href="#/rascunhos">Rascunhos</a> e clique em Publicar em lote.</div></div>
    <a class="botao sec" href="#/rascunhos">${ic("rascunhos", "p")}Ir para rascunhos</a></div>
  <div class="cartao">${lista.length ? lista.map((l) => {
    const feitos = l.total - l.contagem.pendente;
    const pct = l.total ? Math.round((feitos / l.total) * 100) : 0;
    return `<div class="lote-linha">
      <div class="info"><div class="linha" style="gap:8px"><b>Lote #${l.id}</b>${seloDe(STATUS_LOTE, l.status)}
          ${l.plataformas.map((p) => selo(p)).join("")}</div>
        <div class="pequeno suave">por ${h(l.por)} · ${data(l.criado_em)} · ${feitos}/${l.total} processada(s)
          ${l.contagem.publicado ? ` · <b style="color:var(--verde)">${l.contagem.publicado} publicada(s)</b>` : ""}
          ${l.contagem.simulado ? ` · ${l.contagem.simulado} simulada(s)` : ""}
          ${l.contagem.falhou ? ` · <b style="color:var(--vermelho)">${l.contagem.falhou} falha(s)</b>` : ""}
          ${l.contagem.pulado ? ` · ${l.contagem.pulado} pulada(s)` : ""}</div>
        ${l.motivo ? `<div class="pequeno" style="color:var(--vermelho);margin-top:4px">${ic("alerta", "p")} ${h(l.motivo)}</div>` : ""}
        <div class="barra" style="margin-top:8px"><i style="width:${Math.max(pct, 2)}%"></i></div></div>
      <div class="linha" style="flex-wrap:nowrap">
        ${["na_fila", "executando", "interrompido"].includes(l.status) ? `<button class="sec pequeno" data-cancelar="${l.id}">Cancelar</button>` : ""}
        ${l.status === "interrompido" ? `<button class="pequeno" data-retomar="${l.id}">Retomar</button>` : ""}
        <button class="sec pequeno" data-detalhe="${l.id}">${ic("olho", "p")}Detalhes</button></div></div>`;
  }).join("") : vazio("pacote", "Nenhum lote ainda", `Marque vários rascunhos em <a href="#/rascunhos">Rascunhos</a> para publicar em lote.`)}</div>`;
  $$("[data-detalhe]").forEach((b) => (b.onclick = () => comBotao(b, () => detalheLote(+b.dataset.detalhe))));
  $$("[data-cancelar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Cancelar este lote? O que já foi publicado continua no ar; o restante não será enviado.")) return;
    comBotao(b, async () => { await api(`/api/lotes/${b.dataset.cancelar}/cancelar`, { method: "POST" }); telaLotes(); });
  }));
  $$("[data-retomar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Retomar o lote? Confira antes o motivo da parada: ele continua de onde parou.")) return;
    comBotao(b, async () => { await api(`/api/lotes/${b.dataset.retomar}/retomar`, { method: "POST" }); telaLotes(); });
  }));
  if (ativo) _atualizarLotes = setTimeout(() => { if (estado._rotaAtual === "lotes" && $("#modal").hidden) telaLotes(); }, 3000);
}

async function detalheLote(id) {
  const l = await api("/api/lotes/" + id);
  modal(`<div class="linha entre"><h2 style="margin:0">Lote #${l.id}</h2>${seloDe(STATUS_LOTE, l.status)}</div>
    <p class="suave pequeno">por ${h(l.por)} · ${data(l.criado_em)}${l.concluido_em ? " · terminou " + data(l.concluido_em) : ""}</p>
    ${l.motivo ? `<div class="aviso vermelho pequeno">${h(l.motivo)}</div>` : ""}
    <div class="tabela embutida"><table><thead><tr><th>#</th><th>Rascunho</th><th>Plataforma</th><th>Situação</th></tr></thead><tbody>
      ${l.itens.map((i, n) => `<tr><td class="pequeno suave">${n + 1}</td>
        <td><a href="#/editor/${i.anuncio_id}" data-fechar>${h(i.titulo || "(sem título)")}</a>${i.mensagem ? `<div class="pequeno suave">${h(i.mensagem)}</div>` : ""}</td>
        <td>${selo(i.plataforma)}</td><td>${seloDe(STATUS_ITEM, i.status)}${i.processado_em ? `<div class="pequeno suave">${data(i.processado_em)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
}

// Visão de leitura (lojista): o anúncio e o histórico de publicação.
async function verAnuncio(id) {
  const [a, pubs] = await Promise.all([api("/api/anuncios/" + id), api(`/api/anuncios/${id}/publicacoes`)]);
  modal(`<div class="linha entre"><h2 style="margin:0">${h(a.titulo || "(sem título)")}</h2>${seloStatus(a.status)}</div>
    <p class="suave pequeno">${brl(a.preco)} · estoque ${a.estoque} · criado por ${h(a.criado_por || "—")} em ${data(a.criado_em)}
      ${a.atualizado_por ? ` · última edição de ${h(a.atualizado_por)}` : ""}</p>
    ${a.fotos.length ? `<div class="fotos" style="margin:12px 0">${a.fotos.slice(0, 8).map((f) => urlSegura(f)
      ? `<div class="f"><img src="${h(f)}" alt="" referrerpolicy="no-referrer"></div>` : "").join("")}</div>` : ""}
    ${a.descricao ? `<h3>Descrição</h3><div class="pequeno" style="white-space:pre-wrap;max-height:180px;overflow:auto">${h(a.descricao)}</div>` : ""}
    <h3 style="margin-top:14px">Publicações</h3>
    ${pubs.length ? pubs.map((p) => `<div class="lista-item" style="padding:8px 0">${selo(p.plataforma)}
        <div class="info pequeno"><b>${p.sucesso ? (p.demo ? "Simulado" : "Publicado") : "Não publicado"}</b>
          <span class="suave">${data(p.criada_em)} · por ${h(p.operador || "—")}${p.conta_apelido ? " · conta " + h(p.conta_apelido) : ""}</span></div>
        ${urlSegura(p.link) ? `<a class="botao sec pequeno" href="${h(p.link)}" target="_blank" rel="noopener">Abrir ${ic("externo", "p")}</a>` : ""}</div>`).join("")
      : `<p class="suave pequeno">Ainda não publicado.</p>`}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
}

// ---------------------------------------------------------------- editor
async function telaEditor(id) {
  estado.anuncio = await api("/api/anuncios/" + id);
  estado.sujo = false;
  const a = estado.anuncio;
  // o seletor passa a mostrar o cliente dono do rascunho (é nas contas dele que se publica)
  if (a.cliente_id && a.cliente_id !== estado.clienteId) trocarCliente(a.cliente_id, { navegar: false });
  const o = a.origem || {};
  const destinos = JSON.parse(localStorage.getItem("rpq_destinos") || '["mercadolivre","shopee","amazon"]');
  $("#tela").innerHTML = `
  <div class="topo">
    <div><a href="#/rascunhos" class="voltar">${ic("voltar", "p")}Rascunhos</a><h1>Editar anúncio</h1>
      <div class="pequeno" style="margin:2px 0 4px"><span class="chip-cliente">${ic("loja", "p")}${h(a.cliente_nome)}</span>
        ${a.criado_por ? `<span class="suave">criado por ${h(a.criado_por)}${a.atualizado_por && a.atualizado_por !== a.criado_por ? ` · editado por ${h(a.atualizado_por)}` : ""}</span>` : ""}</div>
      ${o.plataforma && PLAT[o.plataforma] ? `<div class="suave pequeno">Copiado de ${selo(o.plataforma)} ${o.sinal ? "· " + h(o.sinal) : ""} ${urlSegura(o.link) ? `· <a href="${h(o.link)}" target="_blank" rel="noopener">ver original ${ic("externo", "p")}</a>` : ""} ${o.demo ? '<span class="selo demo">demonstração</span>' : ""}</div>` : ""}
    </div>
    <div class="linha"><button class="sec perigo-txt" id="b-excluir">${ic("lixo", "p")}Excluir</button><button class="sec" id="b-ia">${ic("varinha", "p")}Melhorar com IA</button><button id="b-salvar">${ic("salvar", "p")}Salvar</button></div>
  </div>
  <div class="editor">
    <div class="pilha">
      <section class="cartao">
        <h2>Fotos <span class="suave pequeno">(a primeira é a capa · mín. 500px, ideal 1200×1200)</span></h2>
        <div class="fotos" id="fotos"></div>
        <input type="file" id="arquivo" accept="image/jpeg,image/png,image/webp" multiple hidden>
      </section>
      <section class="cartao">
        <div class="campo"><label for="titulo">Título</label><input id="titulo" type="text" value="${h(a.titulo)}" maxlength="250"><div class="contador" id="contador"></div></div>
        <div class="grade g4">
          <div class="campo"><label for="preco">Preço (R$)</label><input id="preco" type="number" step="0.01" min="0" value="${a.preco || ""}"></div>
          <div class="campo"><label for="estoque">Estoque</label><input id="estoque" type="number" min="0" value="${a.estoque ?? 1}"></div>
          <div class="campo"><label for="condicao">Condição</label><select id="condicao"><option value="new">Novo</option><option value="used" ${a.condicao === "used" ? "selected" : ""}>Usado</option></select></div>
          <div class="campo"><label for="sku">SKU</label><input id="sku" type="text" value="${h(a.sku)}"></div>
          <div class="campo"><label for="marca">Marca</label><input id="marca" type="text" value="${h(a.marca)}"></div>
          <div class="campo"><label for="modelo">Modelo</label><input id="modelo" type="text" value="${h(a.modelo)}"></div>
          <div class="campo"><label for="gtin">EAN / GTIN</label><input id="gtin" type="text" inputmode="numeric" value="${h(a.gtin)}"></div>
          <div class="campo"><label for="peso">Peso (kg)</label><input id="peso" type="number" step="0.001" min="0" value="${a.peso_kg ?? ""}"></div>
        </div>
        <div class="grade g3">
          ${["comprimento", "largura", "altura"].map((d) => `<div class="campo"><label for="d-${d}">${d[0].toUpperCase() + d.slice(1)} (cm)</label><input id="d-${d}" type="number" step="0.1" min="0" value="${a.dimensoes_cm?.[d] ?? ""}"></div>`).join("")}
        </div>
        <div class="campo"><label for="descricao">Descrição</label><textarea id="descricao">${h(a.descricao)}</textarea>
          <div class="contador"><span id="cont-desc"></span><span>Texto puro: HTML, links e emojis são removidos ao publicar.</span></div></div>
      </section>
      <section class="cartao">
        <div class="linha entre"><h2>Características</h2><button class="sec pequeno" id="b-attr">${ic("mais", "p")}Adicionar</button></div>
        <p class="suave pequeno" style="margin-top:-6px">Use os nomes que o marketplace pede (ex.: “Cor”, “Material”, “Voltagem”). Quando faltar um atributo obrigatório, o Replique avisa o nome exato.</p>
        <table><thead><tr><th style="width:40%">Nome</th><th>Valor</th><th></th></tr></thead><tbody id="attrs"></tbody></table>
      </section>
      <section class="cartao">
        <h2>Ajustes por plataforma</h2>
        <div class="abas" id="abas-plat">${Object.entries(PLAT).map(([k, p], i) => `<button data-p="${k}" class="${i ? "" : "ativa"}">${p.nome}</button>`).join("")}</div>
        <div id="cfg-plat"></div>
      </section>
    </div>
    <aside class="pilha lateral-editor">
      <section class="cartao">
        <h2>Publicar em</h2>
        <div class="chips" id="destinos">${Object.entries(PLAT).map(([k, p]) => `<label class="chip ${destinos.includes(k) ? "marcado" : ""}"><input type="checkbox" value="${k}" ${destinos.includes(k) ? "checked" : ""}> ${p.nome}</label>`).join("")}</div>
        <div class="linha" style="margin-top:14px"><button class="sec" id="b-checar">${ic("checar", "p")}Checar</button><button id="b-publicar">${ic("publicar", "p")}Publicar</button></div>
        <div id="checagem" style="margin-top:14px"></div>
      </section>
      <section class="cartao"><h2>${ic("relogio", "p")}Histórico de publicação</h2><div id="hist-pub" class="pequeno suave">Carregando…</div></section>
    </aside>
  </div>`;

  desenharFotos();
  desenharAtributos();
  desenharCfgPlataforma("mercadolivre");
  atualizarContadores();
  carregarHistPublicacao();

  $$("#tela input, #tela textarea, #tela select").forEach((el) => el.addEventListener("input", () => {
    if (!el.closest("#destinos")) estado.sujo = true;
  }));
  $("#titulo").addEventListener("input", atualizarContadores);
  $("#descricao").addEventListener("input", atualizarContadores);
  $$("#destinos input").forEach((c) => (c.onchange = () => {
    c.parentElement.classList.toggle("marcado", c.checked);
    localStorage.setItem("rpq_destinos", JSON.stringify(destinosMarcados()));
    atualizarContadores();
  }));
  $$("#abas-plat button").forEach((b) => (b.onclick = () => {
    coletarCfgPlataforma();
    $$("#abas-plat button").forEach((x) => x.classList.toggle("ativa", x === b));
    desenharCfgPlataforma(b.dataset.p);
  }));
  $("#b-attr").onclick = () => { coletarAtributos(); estado.anuncio.atributos[""] = ""; desenharAtributos(true); };
  $("#b-salvar").onclick = () => comBotao($("#b-salvar"), async () => { await salvar(); toast("Rascunho salvo."); });
  $("#b-excluir").onclick = async () => {
    if (!confirm("Excluir este rascunho? Anúncios já publicados nos marketplaces não são afetados.")) return;
    await api("/api/anuncios/" + a.id, { method: "DELETE" });
    estado.sujo = false;
    location.hash = "#/rascunhos";
  };
  $("#b-ia").onclick = () => comBotao($("#b-ia"), melhorarComIA);
  $("#b-checar").onclick = () => comBotao($("#b-checar"), checar);
  $("#b-publicar").onclick = () => comBotao($("#b-publicar"), publicar);
  $("#arquivo").onchange = (e) => enviarFotos([...e.target.files]);
}

const destinosMarcados = () => $$("#destinos input:checked").map((c) => c.value);

function atualizarContadores() {
  const t = $("#titulo").value;
  const plats = destinosMarcados().length ? destinosMarcados() : Object.keys(PLAT);
  $("#contador").innerHTML = `<span>${t.length} caracteres</span>` + plats.map((p) =>
    `<span class="${t.length > PLAT[p].limite ? "estourou" : ""}">${PLAT[p].nome}: máx. ${PLAT[p].limite}</span>`).join("");
  $("#cont-desc").textContent = $("#descricao").value.length + " caracteres";
}

function desenharFotos() {
  const fotos = estado.anuncio.fotos;
  $("#fotos").innerHTML = fotos.map((f, i) => `
    <div class="f">${urlSegura(f) ? `<img src="${h(f)}" alt="Foto ${i + 1}" referrerpolicy="no-referrer">` : ""}
      ${i === 0 ? '<span class="selo neutro capa">capa</span>' : ""}
      <div class="ctrl">
        <button data-mover="${i}" data-d="-1" title="Mover para a esquerda" aria-label="Mover para a esquerda">${ic("esquerda", "p")}</button>
        <button data-remover="${i}" title="Remover" aria-label="Remover foto">${ic("x", "p")}</button>
        <button data-mover="${i}" data-d="1" title="Mover para a direita" aria-label="Mover para a direita">${ic("direita", "p")}</button>
      </div></div>`).join("") +
    `<div class="adicionar" id="add-arquivo" tabindex="0" role="button">${ic("enviar")}Enviar fotos</div>
     <div class="adicionar" id="add-url" tabindex="0" role="button">${ic("contas")}Colar link</div>`;
  $$("[data-remover]").forEach((b) => (b.onclick = () => { fotos.splice(+b.dataset.remover, 1); estado.sujo = true; desenharFotos(); }));
  $$("[data-mover]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.mover, j = i + +b.dataset.d;
    if (j < 0 || j >= fotos.length) return;
    [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
    estado.sujo = true;
    desenharFotos();
  }));
  $("#add-arquivo").onclick = () => $("#arquivo").click();
  $("#add-url").onclick = () => {
    const url = prompt("Cole o link direto da imagem (https://…). Evite Google Drive e Dropbox: os marketplaces não aceitam links com redirecionamento.");
    if (!url) return;
    if (!/^https:\/\//i.test(url.trim())) return toast("O link precisa começar com https://", true);
    fotos.push(url.trim());
    estado.sujo = true;
    desenharFotos();
  };
}

async function enviarFotos(arquivos) {
  for (const arq of arquivos) {
    const fd = new FormData();
    fd.append("arquivo", arq);
    try {
      const r = await api("/api/uploads", { method: "POST", body: fd });
      estado.anuncio.fotos.push(r.url);
      estado.sujo = true;
      if (r.aviso) toast(r.aviso, true);
    } catch (e) { toast(`${arq.name}: ${e.message}`, true); }
  }
  $("#arquivo").value = "";
  desenharFotos();
}

function desenharAtributos(focarUltimo = false) {
  const linhas = Object.entries(estado.anuncio.atributos || {});
  $("#attrs").innerHTML = linhas.map(([k, v]) => `<tr>
    <td><input type="text" class="a-nome" value="${h(k)}" aria-label="Nome da característica"></td>
    <td><input type="text" class="a-valor" value="${h(v)}" aria-label="Valor"></td>
    <td style="width:40px"><button class="icone" data-x aria-label="Remover característica">${ic("x", "p")}</button></td></tr>`).join("")
    || `<tr><td colspan="3" class="suave pequeno">Nenhuma característica.</td></tr>`;
  $$("#attrs [data-x]").forEach((b) => (b.onclick = () => { b.closest("tr").remove(); estado.sujo = true; }));
  $$("#attrs input").forEach((el) => el.addEventListener("input", () => (estado.sujo = true)));
  if (focarUltimo) $$("#attrs .a-nome").pop()?.focus();
}

function coletarAtributos() {
  const attrs = {};
  $$("#attrs tr").forEach((tr) => {
    const nome = $(".a-nome", tr)?.value.trim();
    if (nome) attrs[nome] = $(".a-valor", tr).value.trim();
  });
  estado.anuncio.atributos = attrs;
}

function desenharCfgPlataforma(p) {
  const cfg = (estado.anuncio.por_plataforma ||= {})[p] ||= {};
  const campo = (id, rotulo, valor, dica = "", tipo = "text") => `<div class="campo"><label for="${id}">${rotulo}</label>
    <input id="${id}" type="${tipo}" value="${h(valor ?? "")}" data-cfg="${id.replace("c-", "")}">${dica ? `<div class="contador">${dica}</div>` : ""}</div>`;
  let html = "";
  if (p === "mercadolivre") {
    html = `${cfg.aviso_copia ? `<div class="aviso amarelo">${h(cfg.aviso_copia)}</div>` : ""}<div class="grade g2">
      <div>${campo("c-category_id", "Categoria (ID)", cfg.category_id, "Vazio = o Replique descobre pelo título.")}
        <button class="sec pequeno" id="b-sug-cat">Sugerir categoria</button><div id="sug-cat" class="pequeno" style="margin-top:6px"></div></div>
      <div class="campo"><label for="c-listing_type_id">Tipo de anúncio</label>
        <select id="c-listing_type_id" data-cfg="listing_type_id">
          <option value="gold_special">Clássico</option>
          <option value="gold_pro" ${cfg.listing_type_id === "gold_pro" ? "selected" : ""}>Premium (parcelado sem juros)</option>
        </select></div>
      <div class="campo"><label for="c-garantia_tipo">Garantia</label>
        <select id="c-garantia_tipo" data-cfg="garantia_tipo">
          ${["", "Garantia do vendedor", "Garantia de fábrica", "Sem garantia"].map((g) => `<option value="${g}" ${cfg.garantia_tipo === g ? "selected" : ""}>${g || "(não informar)"}</option>`).join("")}
        </select></div>
      ${campo("c-garantia_tempo", "Tempo de garantia", cfg.garantia_tempo, 'Ex.: "90 dias", "12 meses"')}
    </div>
    <div class="linha entre" style="margin-top:6px"><h3 style="margin:0">Catálogo do Mercado Livre</h3>
      <button class="sec pequeno" id="b-cat-buscar">Procurar no catálogo</button></div>
    <div id="cat-ml" style="margin:8px 0 16px">${cfg.catalog_product_id ? `<span class="suave pequeno">Carregando produto ${h(cfg.catalog_product_id)}…</span>`
      : `<div class="aviso amarelo pequeno" style="margin:0">Sem produto de catálogo: será publicado só na lista geral. Clique em <b>Procurar no catálogo</b> para ver se ele existe.</div>`}</div>
    <div class="linha entre" style="margin-top:6px"><h3 style="margin:0">Atributos obrigatórios da categoria</h3>
      <button class="sec pequeno" id="b-attr-ml">Atualizar</button></div>
    <div id="attr-ml" class="pequeno suave" style="margin-top:8px">Carregando…</div>`;
  } else if (p === "shopee") {
    html = `<div class="grade g2">
      ${campo("c-category_id", "Categoria (ID)", cfg.category_id, "Vazio = a Shopee sugere pela API.")}
      ${campo("c-brand_id", "Marca (brand_id)", cfg.brand_id, "Vazio = sem marca registrada na Shopee.")}
    </div>${cfg.aviso_copia ? `<div class="aviso amarelo">${h(cfg.aviso_copia)}</div>` : ""}
    <p class="suave pequeno">A Shopee exige o peso. Dimensões ajudam no cálculo de frete.</p>`;
  } else {
    const temAsin = !!cfg.asin;
    html = `${temAsin ? `<div class="campo"><label for="c-modo">Como anunciar</label>
        <select id="c-modo" data-cfg="modo">
          <option value="oferta">Oferta no produto existente (ASIN ${h(cfg.asin)}) — recomendado</option>
          <option value="listagem" ${cfg.modo === "listagem" ? "selected" : ""}>Criar produto novo (exige marca própria / GTIN)</option>
        </select>
        <div class="contador">A Amazon não permite duplicar um produto que já existe no catálogo: o normal é vender no mesmo ASIN, concorrendo por preço.</div></div>` : ""}
      ${campo("c-product_type", "Tipo de produto (productType)", cfg.product_type, "Vazio = o Replique pergunta à Amazon pelo título.")}
      <div class="campo"><label for="c-atributos">Atributos da Amazon (um por linha, nome_oficial=valor)</label>
        <textarea id="c-atributos" style="min-height:90px" placeholder="color=Preto&#10;material=Aço inoxidável">${h(Object.entries(cfg.atributos || {}).map(([k, v]) => k + "=" + v).join("\n"))}</textarea>
        <div class="contador">Use os nomes oficiais do productType (ex.: color, material, item_type_keyword). A Amazon avisa quais faltam.</div></div>`;
  }
  $("#cfg-plat").innerHTML = html;
  $("#cfg-plat").dataset.p = p;
  $$("#cfg-plat input, #cfg-plat select, #cfg-plat textarea").forEach((el) => el.addEventListener("input", () => (estado.sujo = true)));
  if (p === "mercadolivre") {
    carregarAtributosML();
    if (cfg.catalog_product_id) buscarCatalogoML(false);
    $("#b-cat-buscar").onclick = () => comBotao($("#b-cat-buscar"), async () => { await salvar(); await buscarCatalogoML(true); });
    $("#b-attr-ml").onclick = () => comBotao($("#b-attr-ml"), async () => { await salvar(); await carregarAtributosML(); });
  }
  const sug = $("#b-sug-cat");
  if (sug) sug.onclick = () => comBotao(sug, async () => {
    const lista = await api("/api/mercadolivre/categorias?q=" + encodeURIComponent($("#titulo").value));
    $("#sug-cat").innerHTML = lista.length ? lista.map((c) => `<button class="sec pequeno" data-cat="${h(c.category_id)}" style="margin:2px">${h(c.category_name)} <span class="suave">${h(c.category_id)}</span></button>`).join("") : "Nenhuma sugestão.";
    $$("#sug-cat [data-cat]").forEach((b) => (b.onclick = () => { $("#c-category_id").value = b.dataset.cat; estado.sujo = true; }));
  });
}

async function buscarCatalogoML(mostrarCandidatos) {
  const alvo = $("#cat-ml");
  if (!alvo) return;
  let r;
  try { r = await api(`/api/anuncios/${estado.anuncio.id}/mercadolivre/catalogo/buscar`, { method: "POST", body: {} }); }
  catch (e) { alvo.innerHTML = `<div class="aviso amarelo pequeno" style="margin:0">${h(e.message)}</div>`; return; }
  if (!$("#cat-ml")) return;
  const cfg = estado.anuncio.por_plataforma.mercadolivre ||= {};
  const modo = cfg.modo_catalogo || "ambos";
  const cartao = (c, atual) => `<div class="lista-item" style="padding:8px 0">
      ${urlSegura(c.foto) ? `<img src="${h(c.foto)}" alt="" referrerpolicy="no-referrer">` : semFoto()}
      <div class="info"><b title="${h(c.nome)}">${h(c.nome)}</b>
        <span class="pequeno suave">${h(c.id)} · ${c.marca ? "Marca " + h(c.marca) + " · " : ""}${c.modelo ? "Modelo " + h(c.modelo) : ""}${c.gtin ? " · GTIN " + h(c.gtin) : ""}${c.por_gtin ? " · <b>mesmo GTIN</b>" : ""}</span></div>
      <a class="botao sec pequeno" href="${h(c.link)}" target="_blank" rel="noopener">ver ${ic("externo", "p")}</a>
      ${atual ? '<button class="sec pequeno" id="cat-remover">Não é este</button>' : `<button class="pequeno" data-usar-cat="${h(c.id)}">Usar este</button>`}
    </div>`;
  const outros = r.candidatos.filter((c) => !r.atual || c.id !== r.atual.id);
  alvo.innerHTML = `${r.atual ? `
      <div class="aviso verde pequeno" style="margin:0 0 6px">Este produto tem catálogo. <b>Confira se a ficha é exatamente o seu produto</b> (marca, modelo, voltagem, cor): se o comprador receber algo diferente, o ML pode abrir reclamação e bloquear sua conta para o catálogo.</div>
      ${cartao(r.atual, true)}
      <div class="campo" style="margin-top:8px"><label for="c-modo_catalogo">Onde publicar</label>
        <select id="c-modo_catalogo" data-cfg="modo_catalogo">
          <option value="ambos" ${modo === "ambos" ? "selected" : ""}>Lista geral + Catálogo (recomendado: dois anúncios ligados, mesmo preço e estoque)</option>
          <option value="lista" ${modo === "lista" ? "selected" : ""}>Só na lista geral (meu anúncio próprio)</option>
          <option value="catalogo" ${modo === "catalogo" ? "selected" : ""}>Só no catálogo (página do produto)</option>
        </select></div>
      <button class="sec pequeno" id="cat-entrar" title="Para um anúncio que já foi publicado só na lista geral">Colocar anúncio já publicado no catálogo</button>`
    : `<div class="aviso amarelo pequeno" style="margin:0">Nenhum produto de catálogo associado: será publicado só na lista geral.</div>`}
    ${mostrarCandidatos || !r.atual ? `<div class="pequeno suave" style="margin-top:10px">${outros.length ? `Produtos de catálogo parecidos (busca: “${h(r.busca)}”):` : `Nenhum produto de catálogo encontrado para “${h(r.busca)}”.`}</div>
      ${outros.map((c) => cartao(c, false)).join("")}` : ""}`;
  $$("[data-usar-cat]", alvo).forEach((b) => (b.onclick = () => {
    coletarCfgPlataforma();
    estado.anuncio.por_plataforma.mercadolivre.catalog_product_id = b.dataset.usarCat;
    estado.anuncio.por_plataforma.mercadolivre.modo_catalogo = "ambos";
    estado.sujo = true;
    comBotao(b, async () => { await salvar(); desenharCfgPlataforma("mercadolivre"); toast("Produto de catálogo associado."); });
  }));
  const rem = $("#cat-remover", alvo);
  if (rem) rem.onclick = () => {
    coletarCfgPlataforma();
    estado.anuncio.por_plataforma.mercadolivre.catalog_product_id = "";
    estado.anuncio.por_plataforma.mercadolivre.modo_catalogo = "lista";
    estado.sujo = true;
    comBotao(rem, async () => { await salvar(); desenharCfgPlataforma("mercadolivre"); });
  };
  const sel = $("#c-modo_catalogo", alvo);
  if (sel) sel.addEventListener("input", () => (estado.sujo = true));
  const entrar = $("#cat-entrar", alvo);
  if (entrar) entrar.onclick = () => comBotao(entrar, async () => {
    if (!confirm("Criar a publicação de catálogo ligada ao anúncio já publicado deste rascunho? Ela fica visível aos compradores.")) return;
    await salvar();
    const res = await api(`/api/anuncios/${estado.anuncio.id}/mercadolivre/catalogo/entrar`, { method: "POST" });
    toast(res.mensagem);
    carregarHistPublicacao();
  });
}

async function carregarAtributosML() {
  const alvo = $("#attr-ml");
  if (!alvo) return;
  let r;
  try { r = await api(`/api/anuncios/${estado.anuncio.id}/mercadolivre/atributos`); }
  catch (e) { alvo.innerHTML = `<div class="aviso amarelo">${h(e.message)}</div>`; return; }
  if (!$("#attr-ml")) return; // o usuário trocou de aba enquanto carregava
  const origem = { informado: ["ok", "preenchido"], dados: ["neutro", "campo Marca/Modelo"], deduzido: ["demo", "deduzido do título"], faltando: ["erro", "falta"] };
  const linhas = r.obrigatorios.filter((a) => !["BRAND", "MODEL"].includes(a.id)).map((a, i) => {
    const lista = a.opcoes.length ? `list="ml-op-${i}"` : "";
    return `<tr><td style="width:38%"><b>${h(a.nome)}</b>${a.unidade ? ` <span class="suave">(${h(a.unidade)})</span>` : ""}</td>
      <td>${a.tipo === "list" && a.opcoes.length
        ? `<select data-attr-ml="${h(a.nome)}"><option value="">— escolha —</option>${a.opcoes.map((o) => `<option ${o === a.valor ? "selected" : ""}>${h(o)}</option>`).join("")}</select>`
        : `<input type="text" data-attr-ml="${h(a.nome)}" value="${h(a.valor)}" ${lista} placeholder="${a.opcoes.length ? "digite ou escolha" : ""}">
           ${a.opcoes.length ? `<datalist id="ml-op-${i}">${a.opcoes.map((o) => `<option value="${h(o)}">`).join("")}</datalist>` : ""}`}</td>
      <td style="width:130px"><span class="selo ${origem[a.origem][0]}">${origem[a.origem][1]}</span></td></tr>`;
  }).join("");
  const marcaModelo = r.obrigatorios.filter((a) => ["BRAND", "MODEL"].includes(a.id) && !a.valor).map((a) => a.nome);
  alvo.className = "";
  alvo.innerHTML = `<div class="aviso ${r.faltando ? "vermelho" : "verde"}" style="margin:0 0 8px">Categoria <b>${h(r.category_name)}</b> (${h(r.category_id)}):
      ${r.faltando ? `${r.faltando} obrigatório(s) sem valor` : "todos os obrigatórios preenchidos"}.
      ${marcaModelo.length ? ` Preencha também ${marcaModelo.map(h).join(" e ")} nos campos acima.` : ""}</div>
    ${linhas ? `<table><tbody>${linhas}</tbody></table>` : ""}`;
  $$("[data-attr-ml]", alvo).forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
    // grava na tabela de características com o nome exato da categoria
    coletarAtributos();
    if (el.value.trim()) estado.anuncio.atributos[el.dataset.attrMl] = el.value.trim();
    else delete estado.anuncio.atributos[el.dataset.attrMl];
    desenharAtributos();
    estado.sujo = true;
  }));
}

function coletarCfgPlataforma() {
  const p = $("#cfg-plat").dataset.p;
  if (!p) return;
  const cfg = estado.anuncio.por_plataforma[p] ||= {};
  $$("#cfg-plat [data-cfg]").forEach((el) => (cfg[el.dataset.cfg] = el.value.trim()));
  const ta = $("#c-atributos");
  if (ta) {
    cfg.atributos = {};
    ta.value.split("\n").forEach((l) => {
      const [k, ...v] = l.split("=");
      if (k.trim() && v.length) cfg.atributos[k.trim()] = v.join("=").trim();
    });
  }
}

async function salvar() {
  coletarAtributos();
  coletarCfgPlataforma();
  const num = (id) => ($(id).value === "" ? null : Number($(id).value));
  const dims = {};
  ["comprimento", "largura", "altura"].forEach((d) => { const v = num("#d-" + d); if (v) dims[d] = v; });
  const a = estado.anuncio;
  estado.anuncio = await api("/api/anuncios/" + a.id, {
    method: "PATCH",
    body: {
      titulo: $("#titulo").value.trim(), descricao: $("#descricao").value, preco: num("#preco") || 0,
      estoque: num("#estoque") ?? 1, condicao: $("#condicao").value, marca: $("#marca").value.trim(),
      modelo: $("#modelo").value.trim(), gtin: $("#gtin").value.trim(), sku: $("#sku").value.trim(),
      peso_kg: num("#peso"), dimensoes_cm: dims, fotos: a.fotos, atributos: a.atributos, por_plataforma: a.por_plataforma,
    },
  });
  estado.sujo = false;
}

async function melhorarComIA() {
  await salvar();
  const plats = destinosMarcados();
  const s = await api(`/api/anuncios/${estado.anuncio.id}/ia`, { method: "POST", body: { plataformas: plats.length ? plats : ["mercadolivre"] } });
  const m = modal(`<h2>${s.fonte === "ia" ? "Sugestões da IA" : "Sugestões automáticas"}</h2>
    ${s.fonte !== "ia" ? `<div class="aviso amarelo">${h(s.observacoes)}</div>` : s.observacoes ? `<div class="aviso azul">${h(s.observacoes)}</div>` : ""}
    <label>Escolha um título</label>
    <div class="pilha" style="margin-bottom:14px">${s.titulos.map((t, i) => `<label class="chip ${i ? "" : "marcado"}" style="border-radius:10px;font-weight:500"><input type="radio" name="tit" value="${h(t)}" ${i ? "" : "checked"}> ${h(t)} <span class="suave pequeno">(${t.length})</span></label>`).join("")}</div>
    ${s.palavras_chave?.length ? `<p class="pequeno"><b>Palavras-chave:</b> ${s.palavras_chave.map(h).join(", ")}</p>` : ""}
    <label for="ia-desc">Descrição sugerida</label><textarea id="ia-desc">${h(s.descricao)}</textarea>
    <div class="linha" style="margin-top:14px;justify-content:flex-end">
      <button class="sec" data-fechar>Cancelar</button>
      <button class="sec" id="ia-so-titulo">Aplicar só o título</button>
      <button id="ia-tudo">Aplicar título e descrição</button></div>`);
  $$("input[name=tit]", m).forEach((r) => (r.onchange = () => $$(".chip", m).forEach((c) => c.classList.toggle("marcado", $("input", c).checked))));
  const aplicar = (comDesc) => {
    $("#titulo").value = $("input[name=tit]:checked", m).value;
    if (comDesc) $("#descricao").value = $("#ia-desc", m).value;
    estado.sujo = true;
    atualizarContadores();
    fecharModal();
    toast("Aplicado. Revise e clique em Salvar.");
  };
  $("#ia-so-titulo", m).onclick = () => aplicar(false);
  $("#ia-tudo", m).onclick = () => aplicar(true);
}

function htmlChecagem(res) {
  return Object.entries(res).map(([p, r]) => `<div style="margin-bottom:10px">${selo(p)} ${r.pode_publicar ? '<span class="selo ok">pronto</span>' : '<span class="selo erro">bloqueado</span>'}
    ${r.erros.map((e) => `<div class="aviso vermelho" style="margin:6px 0 0">${h(e)}</div>`).join("")}
    ${r.avisos.map((e) => `<div class="aviso amarelo" style="margin:6px 0 0">${h(e)}</div>`).join("")}</div>`).join("");
}

async function checar() {
  const plats = destinosMarcados();
  if (!plats.length) return toast("Marque pelo menos uma plataforma.", true);
  await salvar();
  const res = await api(`/api/anuncios/${estado.anuncio.id}/checar`, { method: "POST", body: { plataformas: plats } });
  if (plats.includes("mercadolivre")) {
    $("#checagem").innerHTML = htmlChecagem(res) + '<div class="pequeno suave"><span class="girando"></span> Validando no Mercado Livre…</div>';
    try {
      const v = await api(`/api/anuncios/${estado.anuncio.id}/mercadolivre/validar`, { method: "POST" });
      const ml = res.mercadolivre;
      ml.erros.push(...v.erros.map((e) => "Mercado Livre: " + e));
      ml.avisos.push(...v.avisos.map((e) => "Mercado Livre: " + e));
      const onde = { ambos: "lista geral + catálogo", lista: "lista geral", catalogo: "catálogo" }[v.modo];
      if (!v.erros.length) ml.avisos.unshift(`Validado pelo Mercado Livre (${onde}, categoria ${v.categoria}): seria aceito.`);
      ml.pode_publicar = !ml.erros.length;
    } catch (e) {
      res.mercadolivre.avisos.push("Não validei no Mercado Livre: " + e.message);
    }
  }
  $("#checagem").innerHTML = htmlChecagem(res);
}

async function publicar() {
  const plats = destinosMarcados();
  if (!plats.length) return toast("Marque pelo menos uma plataforma.", true);
  await salvar();
  const a = estado.anuncio;
  // contas do cliente DONO do rascunho (é para lá que vai a publicação)
  const [contas, chk] = await Promise.all([
    api("/api/contas", { headers: { "X-Cliente": String(a.cliente_id) } }),
    api(`/api/anuncios/${a.id}/checar`, { method: "POST", body: { plataformas: plats } }),
  ]);
  const real = Object.fromEntries(contas.map((c) => [c.plataforma, c]));
  const m = modal(`<h2>Publicar “${h(a.titulo)}”</h2>
    <div class="aviso azul" style="font-size:.95rem">${ic("loja", "p")} Cliente: <b>${h(a.cliente_nome)}</b></div>
    <p>Preço ${brl(a.preco)} · estoque ${a.estoque} · ${a.fotos.length} foto(s)</p>
    ${plats.map((p) => `<div class="aviso ${real[p].publicacao_real ? "azul" : "amarelo"}">${selo(p)} ${real[p].publicacao_real
      ? `Será publicado <b>de verdade</b> na conta <b>${h(real[p].apelido || real[p].id_externo)}</b> e ficará visível para compradores.`
      : "Modo demonstração (" + h(real[p].motivo_publicacao) + "): nada será enviado."}</div>`).join("")}
    ${htmlChecagem(chk)}
    ${plats.some((p) => real[p].publicacao_real) ? `<label class="confirmacao"><input type="checkbox" id="conferi">
      Conferi que esta é a conta de <b>${h(a.cliente_nome)}</b></label>` : ""}
    <div class="linha" style="margin-top:14px;justify-content:flex-end"><button class="sec" data-fechar>Cancelar</button><button id="confirmar">Confirmar publicação</button></div>`);
  const conferi = $("#conferi", m);
  if (conferi) {
    $("#confirmar", m).disabled = true;
    conferi.onchange = () => ($("#confirmar", m).disabled = !conferi.checked);
  }
  $("#confirmar", m).onclick = () => comBotao($("#confirmar", m), async () => {
    const r = await api(`/api/anuncios/${a.id}/publicar`, { method: "POST", body: { plataformas: plats } });
    modal(`<h2>Resultado</h2>${r.publicacoes.map((p) => `<div class="aviso ${p.sucesso ? (p.demo ? "amarelo" : "verde") : "vermelho"}">
        ${selo(p.plataforma)} ${h(p.mensagem)} ${urlSegura(p.link) ? `<br><a href="${h(p.link)}" target="_blank" rel="noopener">Abrir anúncio ${ic("externo", "p")}</a>` : ""}</div>`).join("")}
      <div class="linha" style="justify-content:flex-end"><button data-fechar>Fechar</button></div>`);
    carregarHistPublicacao();
  });
}

const seloPub = (p) => `<span class="selo ${p.sucesso ? (p.demo ? "demo" : "ok") : "erro"}">${p.sucesso ? (p.demo ? "simulado" : "publicado") : "falhou"}</span>`;

async function carregarHistPublicacao() {
  const lista = await api(`/api/anuncios/${estado.anuncio.id}/publicacoes`);
  $("#hist-pub").innerHTML = lista.length ? lista.map((p) => `<div style="margin-bottom:10px">${selo(p.plataforma)} ${seloPub(p)}
    <span class="suave">${data(p.criada_em)} · ${h(p.operador || "—")}${p.conta_apelido ? " · conta " + h(p.conta_apelido) : ""}</span><br>${h(p.mensagem)}
    ${urlSegura(p.link) ? ` <a href="${h(p.link)}" target="_blank" rel="noopener">abrir ${ic("externo", "p")}</a>` : ""}</div>`).join("") : "Ainda não publicado.";
}

// ---------------------------------------------------------------- publicações
async function telaPublicacoes() {
  const lista = await api("/api/publicacoes");
  const equipe = eEquipe();
  $("#tela").innerHTML = `<div class="topo"><div><h1>Publicações</h1>
    <div class="suave">Tudo o que foi enviado aos marketplaces para <b>${h(clienteAtual()?.nome)}</b>, com quem enviou e em qual conta.</div></div></div>
  <div class="cartao">${lista.length ? `<div class="tabela"><table><thead><tr><th>Quando</th><th>Anúncio</th><th>Plataforma</th><th>Por</th><th>Resultado</th><th></th></tr></thead><tbody>
    ${lista.map((p) => `<tr><td class="pequeno">${data(p.criada_em)}</td>
      <td>${equipe ? `<a href="#/editor/${p.anuncio_id}">${h(p.titulo)}</a>` : `<a href="#" data-ver="${p.anuncio_id}">${h(p.titulo)}</a>`}
        <div class="pequeno suave">${h(p.mensagem)}</div></td>
      <td>${selo(p.plataforma)}${p.conta_apelido ? `<div class="pequeno suave">${h(p.conta_apelido)}</div>` : ""}</td>
      <td class="pequeno">${h(p.operador || "—")}</td>
      <td>${seloPub(p)}</td>
      <td>${urlSegura(p.link) ? `<a href="${h(p.link)}" target="_blank" rel="noopener">abrir ${ic("externo", "p")}</a>` : ""}</td></tr>`).join("")}
    </tbody></table></div>` : vazio("publicar", "Nada publicado ainda", "Os envios aos marketplaces aparecem aqui.")}</div>`;
  $$("[data-ver]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); verAnuncio(+b.dataset.ver); }));
}

// ---------------------------------------------------------------- contas
async function telaContas() {
  const contas = await api("/api/contas");
  const pode = ["admin", "cliente"].includes(estado.usuario.papel);
  const bloq = pode ? "" : "disabled";
  const cliente = clienteAtual();
  const st = (ok, motivo) => ok ? '<span class="selo ok">conectado</span>' : `<span class="selo demo" title="${h(motivo)}">demonstração</span>`;
  const quem = (x) => x.conectada && x.apelido ? `<p class="pequeno">Conta: <b>${h(x.apelido)}</b>${x.id_externo ? ` (ID ${h(x.id_externo)})` : ""}
    ${x.conectada_por ? ` · conectada por ${h(x.conectada_por)}` : ""}${x.conectada_em ? ` em ${data(x.conectada_em)}` : ""}</p>` : "";
  const c = Object.fromEntries(contas.map((x) => [x.plataforma, x]));
  setTimeout(() => (estado.boasVindas = false), 0);
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Contas de ${h(cliente?.nome)}</h1>
    <div class="suave">${estado.usuario.papel === "cliente"
      ? "Autorize aqui as contas da sua loja. A equipe Monvatti nunca precisa da sua senha dos marketplaces."
      : "Contas de vendedor deste cliente. Enquanto uma plataforma não estiver conectada, o Replique funciona em modo demonstração."}</div></div></div>
  ${estado.boasVindas ? `<div class="aviso verde">${ic("checar", "p")} <b>Loja cadastrada!</b> Agora conecte o seu Mercado Livre abaixo (passos 1 a 3). A equipe Monvatti já vê a sua loja e vai atribuir quem vai atender você.</div>` : ""}
  ${pode ? "" : `<div class="aviso amarelo">${ic("escudo", "p")} Quem conecta as contas é o próprio cliente (pelo login dele) ou um administrador. Operadores só usam as contas já conectadas.</div>`}
  <div class="pilha">
    <section class="cartao">
      <div class="linha entre"><h2>${selo("mercadolivre")} Mercado Livre</h2><div>Pesquisa ${st(c.mercadolivre.pesquisa_real, c.mercadolivre.motivo_pesquisa)} · Publicação ${st(c.mercadolivre.publicacao_real, c.mercadolivre.motivo_publicacao)}</div></div>
      ${quem(c.mercadolivre)}
      ${c.mercadolivre.expira_em ? (c.mercadolivre.renovacao_automatica
        ? '<div class="aviso verde pequeno">Renovação automática ativa: a conexão se mantém sozinha.</div>'
        : (c.mercadolivre.expira_em * 1000 < Date.now()
          ? '<div class="aviso vermelho pequeno"><b>Conexão expirada.</b> Reconecte abaixo (passos 1 a 3).</div>'
          : `<div class="aviso amarelo pequeno">Conexão válida até <b>${new Date(c.mercadolivre.expira_em * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</b>.
             Sem renovação automática, porque o app no DevCenter não tem acesso off-line; depois disso, reconecte aqui. Veja no README como ativar.</div>`)) : ""}
      <ol class="pequeno"><li>Clique em <b>Autorizar no Mercado Livre</b> e entre com a conta de vendedor <b>de ${h(cliente?.nome)}</b>.</li>
        <li>Depois de autorizar, você cai numa página que mostra o <b>código</b>. Copie a URL inteira.</li>
        <li>Cole abaixo e clique em Conectar. Se a URL for de uma autorização gerada para outro cliente, o Replique recusa.</li></ol>
      <div class="linha"><button class="sec" data-autorizar="mercadolivre" ${bloq}>1. Autorizar no Mercado Livre ${ic("externo", "p")}</button></div>
      <div class="linha" style="margin-top:10px"><input type="text" id="ml-code" placeholder="2. Cole aqui a URL" style="flex:1;min-width:240px" ${bloq}>
        <button id="ml-conectar" ${bloq}>3. Conectar</button>${c.mercadolivre.conectada && pode ? `<button class="sec" data-desc="mercadolivre">Desconectar</button>` : ""}</div>
    </section>

    <section class="cartao">
      <div class="linha entre"><h2>${selo("shopee")} Shopee</h2><div>Pesquisa ${st(c.shopee.pesquisa_real, c.shopee.motivo_pesquisa)} · Publicação ${st(c.shopee.publicacao_real, c.shopee.motivo_publicacao)}</div></div>
      ${quem(c.shopee)}
      <p class="pequeno suave">${c.shopee.shopee_afiliados_empresa ? "A pesquisa usa a API de Afiliados da Monvatti, que vale para todos os clientes."
        : "A pesquisa de mais vendidos usa a API de Afiliados da Monvatti" + (eAdmin() ? ", configurada em <a href=\"#/config\">Configurações</a>." : ", ainda não configurada.")}</p>
      <h3>Publicação (loja do cliente)</h3>
      <ol class="pequeno"><li>Clique em <b>Autorizar loja</b> e entre com a conta de vendedor.</li>
        <li>Copie a URL inteira da página final (ela contém <code>code=</code> e <code>shop_id=</code>).</li><li>Cole abaixo e conecte.</li></ol>
      <button class="sec" data-autorizar="shopee" ${bloq}>Autorizar loja ${ic("externo", "p")}</button>
      <div class="linha" style="margin-top:10px"><input type="text" id="sp-code" placeholder="Cole aqui a URL" style="flex:1;min-width:200px" ${bloq}>
        <button id="sp-conectar" ${bloq}>Conectar</button>${c.shopee.conectada && pode ? `<button class="sec" data-desc="shopee">Desconectar</button>` : ""}</div>
    </section>

    <section class="cartao">
      <div class="linha entre"><h2>${selo("amazon")} Amazon</h2><div>Pesquisa ${st(c.amazon.pesquisa_real, c.amazon.motivo_pesquisa)} · Publicação ${st(c.amazon.publicacao_real, c.amazon.motivo_publicacao)}</div></div>
      ${quem(c.amazon)}
      <p class="pequeno suave">No Seller Central, autorize o aplicativo Replique (Aplicativos e serviços › Gerenciar suas aplicações) e copie o <b>refresh token</b>. O <b>Seller ID</b> (Merchant Token) fica em Configurações › Informações da conta.</p>
      <div class="grade g2">
        <div class="campo"><label for="az-rt">Refresh token</label><input id="az-rt" type="password" autocomplete="off" placeholder="Atzr|..." ${bloq}></div>
        <div class="campo"><label for="az-seller">Seller ID</label><input id="az-seller" type="text" value="${h(c.amazon.id_externo)}" ${bloq}></div>
      </div>
      <div class="linha"><button id="az-conectar" ${bloq}>Salvar</button>${c.amazon.conectada && pode ? `<button class="sec" data-desc="amazon">Desconectar</button>` : ""}</div>
    </section>
  </div>`;
  if (!pode) return;

  $$("[data-autorizar]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const r = await api(`/api/contas/${b.dataset.autorizar}/autorizar`);
    window.open(r.url, "_blank", "noopener");
  })));
  const acao = (id, rota, corpo, msg) => ($(id).onclick = () => comBotao($(id), async () => {
    const r = await api(rota, { method: "POST", body: corpo() });
    toast(typeof msg === "function" ? msg(r) : msg);
    carregarClientesInfo();
    telaContas();
  }));
  acao("#ml-conectar", "/api/contas/mercadolivre/conectar", () => ({ texto: $("#ml-code").value }),
    (r) => `Mercado Livre (${r.apelido}) conectado a ${r.cliente}.`);
  acao("#sp-conectar", "/api/contas/shopee/conectar", () => ({ texto: $("#sp-code").value }), "Loja Shopee conectada!");
  acao("#az-conectar", "/api/contas/amazon/conectar", () => ({ refresh_token: $("#az-rt").value, seller_id: $("#az-seller").value }), "Amazon salva!");
  $$("[data-desc]").forEach((b) => (b.onclick = async () => {
    if (!confirm(`Desconectar ${PLAT[b.dataset.desc].nome} de ${cliente?.nome}? Os anúncios já publicados continuam no ar.`)) return;
    await api("/api/contas/" + b.dataset.desc, { method: "DELETE" });
    carregarClientesInfo();
    telaContas();
  }));
}

// ---------------------------------------------------------------- painel
const ROTULO_ACAO = { pesquisa: "Pesquisa", copia: "Cópia", criacao: "Criação", edicao: "Edição", exclusao: "Exclusão",
  publicacao: "Publicação", conta: "Conta", cliente: "Cliente", usuario: "Acesso", lote: "Lote" };
const ICONE_ACAO = { pesquisa: "pesquisar", copia: "copiar", criacao: "mais", edicao: "lapis", exclusao: "lixo",
  publicacao: "publicar", conta: "contas", cliente: "loja", usuario: "usuarios", lote: "pacote" };
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
    <div class="grade ${ehCliente ? "" : "g2"}" style="margin-top:16px;align-items:start">
      ${ehCliente ? "" : `<section class="cartao"><h2>${ic("loja", "p")}Por cliente</h2>
        ${p.por_cliente.length ? `<div class="tabela"><table><thead><tr><th>Cliente</th><th class="num">Rascunhos</th><th class="num">Publicados</th><th class="num">Falhas</th><th>Última atividade</th></tr></thead><tbody>
          ${p.por_cliente.map((c) => `<tr><td><div class="linha" style="gap:8px;flex-wrap:nowrap">${pontoML(c)}<a href="#" data-trabalhar="${c.id}">${h(c.nome)}</a></div>
              <div class="pequeno suave">${c.ml?.conectada ? "ML: " + h(c.ml.apelido) : "ML não conectado"}${c.ativo ? "" : " · inativo"}</div></td>
            <td class="num">${numero(c.rascunhos)}</td><td class="num"><b>${numero(c.publicados)}</b></td>
            <td class="num ${c.falhas ? "ruim" : ""}">${numero(c.falhas)}</td>
            <td class="pequeno suave">${c.ultima_atividade ? tempoRelativo(c.ultima_atividade) : "—"}</td></tr>`).join("")}
          </tbody></table></div>` : vazio("loja", "Nenhum cliente", eAdmin() ? `Cadastre em <a href="#/clientes">Clientes</a>.` : "")}</section>`}
      <section class="cartao"><h2>${ic("usuarios", "p")}${ehCliente ? "Quem trabalhou na sua loja" : "Por pessoa da equipe"}</h2>
        ${p.por_usuario.length ? `<div class="tabela"><table><thead><tr><th>Nome</th><th class="num">Rascunhos</th><th class="num">Publicados</th><th class="num">Falhas</th></tr></thead><tbody>
          ${p.por_usuario.map((u) => `<tr><td><b>${h(u.nome)}</b><div class="pequeno suave">${h(PAPEL[u.papel] || "Automação")}</div></td>
            <td class="num">${numero(u.rascunhos)}</td><td class="num"><b>${numero(u.publicados)}</b></td>
            <td class="num ${u.falhas ? "ruim" : ""}">${numero(u.falhas)}</td></tr>`).join("")}
          </tbody></table></div>` : vazio("usuarios", "Nenhuma atividade no período")}</section>
    </div>
    <section class="cartao" style="margin-top:16px">
      <div class="linha entre"><h2 style="margin:0">${ic("atividade", "p")}Atividades</h2>
        <select id="f-acao" aria-label="Tipo de atividade" style="width:auto"><option value="">Todas</option>
          ${Object.entries(ROTULO_ACAO).filter(([k]) => !ehCliente || !["pesquisa", "cliente", "usuario"].includes(k))
            .map(([k, r]) => `<option value="${k}">${r}</option>`).join("")}</select></div>
      <div id="feed" class="feed" style="margin-top:12px"></div>
      <div class="linha" style="justify-content:center"><button class="sec pequeno" id="mais-feed" hidden>Carregar mais</button></div>
    </section>`;
  $$("[data-trabalhar]").forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const id = +a.dataset.trabalhar;
    if (estado.usuario.clientes.some((c) => c.id === id && c.ativo)) { trocarCliente(id, { navegar: false }); location.hash = "#/rascunhos"; }
  }));
  $("#f-acao").onchange = () => carregarFeed(true);
  $("#mais-feed").onclick = () => comBotao($("#mais-feed"), () => carregarFeed(false));
  await carregarFeed(true);
}

async function carregarFeed(reiniciar) {
  const f = estadoPainel;
  const feed = $("#feed");
  if (!feed) return;
  const qs = new URLSearchParams({ limite: 30 });
  if (f.cliente) qs.set("cliente_id", f.cliente);
  if (f.usuario) qs.set("usuario_id", f.usuario);
  if ($("#f-acao").value) qs.set("acao", $("#f-acao").value);
  if (!reiniciar && feed.dataset.ultimo) qs.set("antes_de", feed.dataset.ultimo);
  const lista = await api("/api/atividades?" + qs);
  const ehCliente = estado.usuario.papel === "cliente";
  const html = lista.map((a) => `<div class="feed-item">
      <span class="feed-ic acao-${h(a.acao)}">${ic(ICONE_ACAO[a.acao] || "atividade", "p")}</span>
      <div class="info"><div><b>${h(a.ator)}</b> ${h(a.descricao.charAt(0).toLowerCase() + a.descricao.slice(1))}</div>
        <div class="pequeno suave">${!ehCliente && a.cliente_nome ? h(a.cliente_nome) + " · " : ""}${ROTULO_ACAO[a.acao] || h(a.acao)} · <span title="${data(a.criada_em)}">${tempoRelativo(a.criada_em)}</span>
          ${a.detalhes?.link && urlSegura(a.detalhes.link) ? ` · <a href="${h(a.detalhes.link)}" target="_blank" rel="noopener">abrir ${ic("externo", "p")}</a>` : ""}</div></div>
    </div>`).join("");
  if (reiniciar) feed.innerHTML = html || vazio("atividade", "Nenhuma atividade ainda");
  else feed.insertAdjacentHTML("beforeend", html);
  if (lista.length) feed.dataset.ultimo = lista[lista.length - 1].id;
  $("#mais-feed").hidden = lista.length < 30;
}

// ---------------------------------------------------------------- clientes (admin)
const linkConvite = (token) => `${location.origin}/#/convite/${token}`;

async function telaClientes() {
  const [clientes, usuarios, convite] = await Promise.all([api("/api/clientes"), api("/api/empresa/usuarios"), api("/api/empresa/convite")]);
  estado.clientesInfo = clientes;
  const operadores = usuarios.filter((u) => u.papel === "operador" && u.ativo);
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
    <div class="tabela"><table><thead><tr><th>Cliente</th><th>Mercado Livre</th><th>Operadores</th><th class="num">Rascunhos</th><th class="num">Publicados</th><th></th></tr></thead>
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
      <td class="pequeno">${c.operadores.length ? h(c.operadores.join(", ")) : '<span class="aviso-texto">nenhum operador</span>'}</td>
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
      const ops = (await api("/api/empresa/usuarios")).filter((u) => u.papel === "operador" && u.ativo);
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
      <div class="linha" style="grid-column:1/-1;justify-content:flex-end"><button type="submit" class="sec pequeno">${ic("salvar", "p")}Salvar dados</button></div>
    </form>
    <h3 style="margin-top:8px">${ic("usuarios", "p")} Operadores que atendem este cliente</h3>
    <p class="pequeno suave" style="margin-top:-4px">Administradores atendem todos. Operador só vê os clientes marcados aqui.</p>
    <div class="chips" id="gc-ops">${operadores.length ? operadores.map((u) => `<label class="chip ${c.operadores.includes(u.id) ? "marcado" : ""}">
        <input type="checkbox" value="${u.id}" ${c.operadores.includes(u.id) ? "checked" : ""}> ${h(u.nome)}</label>`).join("")
      : '<span class="suave pequeno">Nenhum operador cadastrado. Crie em Configurações.</span>'}</div>
    ${operadores.length ? `<div class="linha" style="justify-content:flex-end;margin-top:8px"><button class="sec pequeno" id="gc-salvar-ops">${ic("salvar", "p")}Salvar operadores</button></div>` : ""}
    <h3 style="margin-top:8px">${ic("escudo", "p")} Login do cliente</h3>
    <p class="pequeno suave" style="margin-top:-4px">O lojista entra com este acesso, autoriza as contas dos marketplaces e acompanha o trabalho. Ele não edita nem publica.</p>
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
    <div class="linha entre" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--borda)">
      <button class="sec pequeno ${c.ativo ? "perigo-txt" : ""}" id="gc-ativo">${c.ativo ? "Desativar cliente" : "Reativar cliente"}</button>
      <button data-fechar>Fechar</button></div>`);
  const recarregar = async (msg) => {
    toast(msg);
    await atualizarMe();
    if (estado._rotaAtual === "clientes") await telaClientes();
    gerirCliente(id, operadores);
  };
  $$("#gc-ops input", m).forEach((i) => (i.onchange = () => i.parentElement.classList.toggle("marcado", i.checked)));
  $("#f-dados", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-dados button", m), async () => {
      await api("/api/clientes/" + id, { method: "PATCH", body: Object.fromEntries(new FormData(e.target)) });
      await recarregar("Dados salvos.");
    });
  };
  const salvarOps = $("#gc-salvar-ops", m);
  if (salvarOps) salvarOps.onclick = () => comBotao(salvarOps, async () => {
    await api(`/api/clientes/${id}/operadores`, { method: "PUT", body: { ids: $$("#gc-ops input:checked", m).map((i) => +i.value) } });
    await recarregar("Operadores atualizados.");
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

// ---------------------------------------------------------------- configurações (admin)
async function telaConfig() {
  const u = estado.usuario;
  const [usuarios, clientes, contas] = await Promise.all([api("/api/empresa/usuarios"), api("/api/clientes"),
    estado.clienteId ? api("/api/contas").catch(() => []) : Promise.resolve([])]);
  const equipe = usuarios.filter((x) => x.papel !== "cliente");
  const nomeCliente = Object.fromEntries(clientes.map((c) => [c.id, c.nome]));
  const afiliados = contas.find((c) => c.plataforma === "shopee")?.shopee_afiliados_empresa;
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Configurações</h1><div class="suave">${h(u.empresa.nome)} · plano ${h(u.empresa.plano)}</div></div></div>
  <div class="pilha">
    <section class="cartao"><div class="linha entre"><h2 style="margin:0">${ic("usuarios", "p")}Equipe</h2>
        <button class="pequeno" id="b-novo-usuario">${ic("mais", "p")}Novo acesso</button></div>
      <p class="pequeno suave">Administradores veem e administram todos os clientes. Operadores só trabalham nos clientes atribuídos a eles. Logins de cliente são criados em <a href="#/clientes">Clientes</a>.</p>
      <div class="tabela" style="margin:0 -20px -20px"><table><thead><tr><th>Nome</th><th>Papel</th><th>Clientes</th><th>Situação</th><th></th></tr></thead><tbody>
        ${equipe.map((x) => `<tr class="${x.ativo ? "" : "inativo"}"><td><b>${h(x.nome)}</b><div class="pequeno suave">${h(x.email)}</div></td>
          <td>${h(PAPEL[x.papel])}</td>
          <td class="pequeno">${x.papel === "admin" ? '<span class="suave">todos</span>' : x.clientes.length
            ? h(x.clientes.slice(0, 3).map((id) => nomeCliente[id] || "?").join(", ")) + (x.clientes.length > 3 ? ` +${x.clientes.length - 3}` : "") : '<span class="aviso-texto">nenhum</span>'}</td>
          <td>${x.ativo ? '<span class="selo ok">ativo</span>' : '<span class="selo erro">desativado</span>'}</td>
          <td style="text-align:right;white-space:nowrap">${x.id === u.id ? '<span class="suave pequeno">você</span>' : `
            ${x.papel === "operador" ? `<button class="sec pequeno" data-clientes-op="${x.id}">Clientes</button>` : ""}
            <button class="sec pequeno" data-senha="${x.id}">Senha</button>
            <button class="sec pequeno" data-ativar="${x.id}" data-ativo="${x.ativo ? 1 : 0}">${x.ativo ? "Desativar" : "Reativar"}</button>`}</td></tr>`).join("")}
      </tbody></table></div></section>
    <section class="cartao"><h2>${selo("shopee")} API de Afiliados da Shopee <span class="suave pequeno">(vale para todos os clientes)</span></h2>
      <p class="pequeno suave">A Shopee só mostra produtos de outros vendedores pela API de Afiliados. Cadastre a Monvatti em <a href="https://affiliate.shopee.com.br/open_api" target="_blank" rel="noopener">affiliate.shopee.com.br</a> › Open API e copie o AppId e o Secret.
        ${afiliados ? " <b>Já configurada</b>; preencha para trocar." : ""}</p>
      <div class="grade g3" style="align-items:end">
        <div><label for="sp-app">AppId</label><input id="sp-app" type="text"></div>
        <div><label for="sp-secret">Secret</label><input id="sp-secret" type="password" autocomplete="off"></div>
        <div><button id="sp-afil">${ic("salvar", "p")}Salvar</button></div></div></section>
    <section class="cartao"><h2>${ic("varinha", "p")}Inteligência artificial</h2>${u.ia_disponivel
      ? '<div class="aviso verde">IA ativa: o botão “Melhorar com IA” reescreve título e descrição com Claude.</div>'
      : '<div class="aviso amarelo">IA desativada. O administrador do servidor precisa configurar <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code>. Sem ela, o Replique usa regras automáticas de título e descrição.</div>'}</section>
    <section class="cartao"><h2>${ic("chave", "p")}Usar pelo Claude (MCP)</h2>
      <p class="pequeno">Com o servidor MCP do Replique, você pede ao Claude em linguagem natural: <i>“para o cliente X, pesquise garrafa térmica no Mercado Livre, copie o mais vendido, melhore o título e me mostre antes de publicar”</i>. As ações aparecem no Painel como “Claude (MCP)”.</p>
      <div class="linha"><button id="b-chave">${u.empresa.tem_api_key ? "Gerar nova chave (a antiga para de funcionar)" : "Gerar chave MCP"}</button></div>
      <div id="chave" style="margin-top:10px"></div></section>
  </div>`;
  $("#b-novo-usuario").onclick = () => formNovoUsuario(clientes);
  $$("[data-ativar]").forEach((b) => (b.onclick = () => {
    const ativo = b.dataset.ativo === "1";
    if (ativo && !confirm("Desativar este acesso? A pessoa sai na hora e não consegue mais entrar. O histórico dela continua.")) return;
    comBotao(b, async () => {
      await api("/api/empresa/usuarios/" + b.dataset.ativar, { method: "PATCH", body: { ativo: !ativo } });
      toast(ativo ? "Acesso desativado." : "Acesso reativado.");
      telaConfig();
    });
  }));
  $$("[data-senha]").forEach((b) => (b.onclick = () => {
    const senha = prompt("Nova senha (mínimo 8 caracteres):");
    if (!senha) return;
    comBotao(b, async () => {
      await api("/api/empresa/usuarios/" + b.dataset.senha, { method: "PATCH", body: { senha } });
      toast("Senha redefinida.");
    });
  }));
  $$("[data-clientes-op]").forEach((b) => (b.onclick = () => clientesDoOperador(equipe.find((x) => x.id === +b.dataset.clientesOp), clientes)));
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
        <div><label for="nu-p">Papel</label><select id="nu-p" name="papel"><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>
      </div>
      <div id="nu-clientes"><label>Clientes que ele atende</label>${listaClientesMarcaveis(clientes, [])}</div>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Criar acesso</button></div>
    </form>`);
  ligarFiltroMarcaveis(m);
  $("#nu-p", m).onchange = () => ($("#nu-clientes", m).hidden = $("#nu-p", m).value !== "operador");
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
    <p class="pequeno suave">O operador só vê, pesquisa e publica nos clientes marcados.</p>
    ${listaClientesMarcaveis(clientes, op.clientes)}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button><button id="salvar-clientes-op">Salvar</button></div>`);
  ligarFiltroMarcaveis(m);
  $("#salvar-clientes-op", m).onclick = () => comBotao($("#salvar-clientes-op", m), async () => {
    await api(`/api/empresa/usuarios/${op.id}/clientes`, { method: "PUT", body: { ids: $$(".marcavel input:checked", m).map((i) => +i.value) } });
    toast("Clientes do operador atualizados.");
    fecharModal();
    telaConfig();
  });
}

roteador();
