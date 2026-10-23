"use strict";

const PLAT = {
  mercadolivre: { nome: "Mercado Livre", limite: 60 },
  shopee: { nome: "Shopee", limite: 120 },
  amazon: { nome: "Amazon", limite: 200 },
};
const estado = { usuario: null, pesquisa: null, filtro: "todas", soCompletos: false, anuncio: null, sujo: false,
  clienteId: null, clientesInfo: null };
const PAPEL = { admin: "Administrador", operador: "Operador", consultor: "Consultor", cliente: "Cliente" };
const eAdmin = () => estado.usuario?.papel === "admin";
const eEquipe = () => ["admin", "operador"].includes(estado.usuario?.papel);
const eTime = () => ["admin", "operador", "consultor"].includes(estado.usuario?.papel);
const ATRIBUIVEIS = ["operador", "consultor"];

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const quando = (v) => new Date(typeof v === "string" && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? v + "Z" : v);
const data = (v) => (v ? quando(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const selo = (p) => `<span class="selo ${h(p)}">${h(PLAT[p]?.nome || p)}</span>`;
const urlSegura = (u) => (/^(https?:\/\/|\/)/i.test(u || "") ? u : "");
const iniciaisDe = (nome) => (nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
const avatarHtml = (nome, foto) => (/^\/uploads\//.test(foto || "") ? `<img src="${h(foto)}" alt="">` : h(iniciaisDe(nome)));

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
  olhoFechado: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="m2 2 20 20"/>',
  envelope: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  pausa: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  lixo2: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  lapis: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  atividade: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  trocar: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  coracao: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  balao: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  relatorio: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 18v-2"/><path d="M12 18v-4"/><path d="M16 18v-6"/>',
  brilho: '<path d="M9.94 14.06 7 21l-2.94-6.94L-2.88 11 4.06 8.06 7 1.12l2.94 6.94L16.88 11Z" transform="translate(3 1) scale(.9)"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  aprovar: '<path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/>',
  cifrao: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  calculadora: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  imprimir: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
};
Object.assign(ICONES, {
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  texto: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  seta: '<path d="M5 19 19 5"/><path d="M9 5h10v10"/>',
  quadrado: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  circulo: '<circle cx="12" cy="12" r="9"/>',
  desfazer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  refazer: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  redimensionar: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  etiqueta: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  ponteiro: '<path d="M4.04 4.04a.5.5 0 0 1 .65-.65l15.5 6.35a.5.5 0 0 1-.07.95l-6.2 1.6a2 2 0 0 0-1.43 1.43l-1.6 6.2a.5.5 0 0 1-.95.07Z"/>',
  camadas: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  recortar: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  bussola: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.8 5.4a2 2 0 0 1-1.28 1.28l-5.4 1.8 1.8-5.4a2 2 0 0 1 1.28-1.28Z"/>',
  caixa: '<path d="M2 7h20v4H2z"/><path d="M4 11v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/><path d="M10 15h4"/>',
  filtro: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  pincel: '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
  marcador: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  borracha: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  linha: '<path d="M5 19 19 5"/>',
  colar: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  girar: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  espelhar: '<path d="M12 3v18"/><path d="M8 7 3 12l5 5V7z"/><path d="m16 7 5 5-5 5V7z"/>',
  magica: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  ajustes: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
});
const ic = (nome, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ""}</svg>`;
const vazio = (icone, titulo, texto = "") => `<div class="vazio">${ic(icone, "g")}<b>${titulo}</b>${texto ? `<span>${texto}</span>` : ""}</div>`;
const semFoto = () => `<div class="sem-foto">${ic("imagem")}</div>`;
const MARCA = (sub = "Replique · gestão de anúncios") => `<a href="#/" class="marca"><img src="/static/monvatti-v.png" alt="Monvatti" width="34" height="34"><div class="marca-texto"><b>Monvatti</b><small>${sub}</small></div></a>`;

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
    try { localStorage.setItem("rpq_tema", novo); } catch {}
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

const clienteAtual = () => (estado.usuario?.clientes || []).find((c) => c.id === estado.clienteId) || null;

const guardaCliente = () => (eAdmin() ? sessionStorage : localStorage);

function escolherClienteInicial() {
  const u = estado.usuario;
  if (u.papel === "cliente") { estado.clienteId = u.cliente_id; return; }
  let salvo = null;
  try { salvo = +guardaCliente().getItem("rpq_cliente") || null; } catch {}
  u.clientes = u.clientes || [];
  const ativos = u.clientes.filter((c) => c.ativo);
  const unico = u.papel !== "admin" && ativos.length === 1 ? ativos[0].id : null;
  estado.clienteId = u.clientes.some((c) => c.id === salvo && c.ativo) ? salvo : unico;
}

function trocarCliente(id, { navegar = true } = {}) {
  if (id === estado.clienteId) return;
  estado.clienteId = id;
  try { id ? guardaCliente().setItem("rpq_cliente", String(id)) : guardaCliente().removeItem("rpq_cliente"); } catch {}
  estado.pesquisa = null;
  desenharSeletor();
  atualizarNaoLidas();
  if (!navegar) return;
  const rota = estado._rotaAtual;
  if (!id) { if (rota === "inicio") roteador(); else location.hash = "#/inicio"; return; }
  if (rota === "editor") location.hash = "#/rascunhos";
  else roteador();
  toast(`Trabalhando agora em: ${clienteAtual()?.nome || "cliente"}`);
}

async function carregarClientesInfo() {
  if (!eTime()) return;
  try {
    estado.clientesInfo = await api("/api/clientes");
    desenharSeletor();
  } catch {}
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
  $(".modal", fundo).className = "modal";
  $(".modal", fundo).innerHTML = `<button type="button" class="icone modal-x" data-fechar aria-label="Fechar" title="Fechar (Esc)">${ic("x")}</button>` + html;
  fundo.hidden = false;
  return $(".modal", fundo);
}
function fecharModal() { $("#modal").hidden = true; }
$("#modal").addEventListener("mousedown", (e) => { fecharModal.cliqueFora = e.target.id === "modal"; });
$("#modal").addEventListener("click", (e) => {
  if (e.target.closest("[data-fechar]") || (e.target.id === "modal" && fecharModal.cliqueFora)) fecharModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("#tour") && !$("#tour").hidden) return encerrarTour();
  fecharModal();
});

const rotas = {
  entrar: telaEntrar, inicio: telaInicio, projeto: telaProjeto, tarefas: telaTarefas, duvidas: telaDuvidas, painel: telaPainel, pesquisar: telaPesquisar, rascunhos: telaRascunhos, editor: telaEditor, lotes: telaLotes,
  publicacoes: telaPublicacoes, full: telaFull, contas: telaContas, clientes: telaClientes, config: telaConfig,
  saude: telaSaude, perguntas: telaPerguntas, radar: telaRadar, relatorio: telaRelatorio, lucro: telaLucro, produtos: telaProdutos, despesas: telaDespesas, impostos: telaImpostos, analise: telaAnalise,
};
const PERMITIDAS = {
  admin: ["inicio", "projeto", "tarefas", "duvidas", "painel", "pesquisar", "rascunhos", "editor", "lotes", "publicacoes", "full", "contas", "clientes", "config",
    "saude", "perguntas", "radar", "relatorio", "lucro", "produtos", "despesas", "impostos", "analise"],
  operador: ["inicio", "projeto", "tarefas", "duvidas", "painel", "pesquisar", "rascunhos", "editor", "lotes", "publicacoes", "full", "contas", "saude", "perguntas", "radar", "relatorio",
    "lucro", "produtos", "despesas", "impostos", "analise"],
  consultor: ["inicio", "projeto", "tarefas", "duvidas", "painel", "rascunhos", "lotes", "publicacoes", "full", "saude", "perguntas", "radar", "relatorio", "lucro", "produtos",
    "despesas", "impostos", "analise"],
  cliente: ["projeto", "duvidas", "painel", "rascunhos", "publicacoes", "full", "contas", "saude", "relatorio", "lucro", "produtos", "despesas", "impostos", "analise"],
};
const INICIAL = { admin: "inicio", operador: "inicio", consultor: "inicio", cliente: "projeto" };
const PRECISA_CLIENTE = new Set(["projeto", "pesquisar", "rascunhos", "lotes", "publicacoes", "full", "contas", "radar", "relatorio",
  "lucro", "produtos", "despesas", "impostos"]);

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
  if (nome === "colaborador") return telaColaborador(param);
  if (nome === "google") return entrarComGoogle(param);
  if (nome === "google-erro") return telaEntrar("login", param);
  if (nome === "nova-agencia" && !estado.usuario) {
    const token = localStorage.getItem("rpq_token");
    const valido = token && (await fetch("/api/me", { headers: { Authorization: "Bearer " + token } }).catch(() => null))?.ok;
    if (!valido) { localStorage.removeItem("rpq_token"); return telaEntrar("agencia"); }
  }
  if (!estado.usuario && localStorage.getItem("rpq_token")) {
    try {
      estado.usuario = await api("/api/me");
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
  if (rota !== nome && nome && nome !== "entrar") history.replaceState(null, "", "#/" + rota);
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
  tourAutomatico(rota);
  ligarChatDaPagina(rota, param);
  atualizarNaoLidas();
}

const FERRAMENTA_DA_ROTA = { editor: "rascunhos", tarefas: "projeto" };
function rotasLiberadas() {
  const u = estado.usuario;
  const base = PERMITIDAS[u.papel] || [];
  if (u.papel === "admin" || !Array.isArray(u.ferramentas)) return base;
  return base.filter((r) => { const f = FERRAMENTA_DA_ROTA[r] || r; return !TODAS_FERRAMENTAS.has(f) || u.ferramentas.includes(f); });
}
const TODAS_FERRAMENTAS = new Set(["projeto", "duvidas", "pesquisar", "rascunhos", "lotes", "publicacoes", "full", "saude", "perguntas", "radar", "relatorio",
  "lucro", "produtos", "despesas", "impostos", "analise", "painel", "contas"]);

function menuDoPapel() {
  const liberadas = new Set(rotasLiberadas());
  return menuCompleto().map(([grupo, itens]) => [grupo, itens.filter(([r]) => liberadas.has(r))]).filter(([, itens]) => itens.length);
}

function menuCompleto() {
  const papel = estado.usuario.papel;
  if (papel === "cliente") {
    return [["Meu projeto", [["projeto", "Andamento do projeto", "checar"], ["duvidas", "Minhas dúvidas", "balao"]]],
      ["Minha loja", [["painel", "Trabalho nos anúncios", "painel"], ["rascunhos", "Anúncios", "rascunhos"],
      ["publicacoes", "Meus anúncios", "publicar"], ["full", "Estoque Full", "caixa"], ["saude", "Saúde da conta", "coracao"],
      ["relatorio", "Relatório do mês", "relatorio"], ["contas", "Contas", "contas"]]],
      ["Financeiro", [["lucro", "Vendas e lucro", "cifrao"], ["produtos", "Produtos e custos", "pacote"], ["despesas", "Custo operacional", "loja"], ["impostos", "Impostos", "calculadora"], ["analise", "Analista de métricas", "brilho"]]]];
  }
  const menu = [
    ["Operação", [["inicio", papel === "admin" ? "Visão geral" : "Minha carteira", "bussola"], ["projeto", "Projeto do cliente", "checar"],
      ["tarefas", "Tarefas", "relogio"], ["duvidas", "Dúvidas dos clientes", "balao"]]],
    ["Anúncios", [["pesquisar", "Pesquisar", "pesquisar"], ["rascunhos", "Rascunhos", "rascunhos"],
      ["lotes", "Publicação em lote", "pacote"], ["publicacoes", "Publicações", "publicar"], ["full", "Estoque Full", "caixa"]]],
    ["Acompanhamento", [["saude", "Saúde das contas", "coracao"], ["perguntas", "Central de perguntas", "balao"],
      ["radar", "Radar de mercado", "alvo"], ["relatorio", "Relatório do mês", "relatorio"]]],
    ["Financeiro", [["analise", "Analista de métricas", "brilho"], ["lucro", "Vendas e lucro", "cifrao"], ["produtos", "Produtos e custos", "pacote"], ["despesas", "Custo operacional", "loja"], ["impostos", "Impostos", "calculadora"]]],
    ["Gestão", [["painel", "Painel", "painel"], ["contas", "Contas do cliente", "contas"]]],
  ];
  if (papel === "admin") menu[4][1].push(["clientes", "Clientes", "loja"], ["config", "Configurações", "config"]);
  if (papel === "consultor") {
    menu[1][1] = menu[1][1].filter(([r]) => r !== "pesquisar");
    menu[4][1] = menu[4][1].filter(([r]) => r !== "contas");
  }
  return menu;
}
const TITULO_ROTA = { inicio: "Visão geral", projeto: "Projeto", tarefas: "Tarefas", duvidas: "Dúvidas", painel: "Painel", pesquisar: "Pesquisar", rascunhos: "Rascunhos", editor: "Editar anúncio", lotes: "Publicação em lote", publicacoes: "Publicações", full: "Estoque Full",
  contas: "Contas", clientes: "Clientes", config: "Configurações", saude: "Saúde das contas", perguntas: "Perguntas",
  radar: "Radar de mercado", relatorio: "Relatório do mês", lucro: "Vendas e lucro", produtos: "Produtos e custos", despesas: "Custo operacional", impostos: "Impostos", analise: "Analista de métricas" };

function casca(ativa) {
  const u = estado.usuario;
  if (!$(".casca")) {
    $("#app").innerHTML = `
    <div class="casca">
      <aside class="lateral">
        ${MARCA()}
        <nav aria-label="Menu principal">${menuDoPapel().map(([grupo, itens]) => `<div class="grupo-rotulo"><span class="rotulo">${grupo}</span></div>
          ${itens.map(([r, rotulo, icone]) => `<a href="#/${r}" data-rota="${r}" title="${rotulo}">${ic(icone)}<span class="rotulo">${rotulo}</span><span class="bolinha" data-contador="${r}" hidden></span></a>`).join("")}`).join("")}</nav>
        <div class="rodape"><span>Monvatti</span><span>v1.1</span></div>
      </aside>
      <div class="cortina" data-fechar-menu></div>
      <div class="principal">
        <header class="barra-topo">
          <button class="icone so-mobile" id="abrir-menu" aria-label="Abrir menu">${ic("menu")}</button>
          <div id="seletor" class="seletor"></div>
          <div class="migalha"><b id="migalha-atual"></b></div>
          <div class="espaco"></div>
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
    $("#sair").onclick = () => {
      localStorage.removeItem("rpq_token");
      try { sessionStorage.removeItem("rpq_cliente"); } catch {}
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null, naoLidas: null, chatPagina: null });
      fecharChat();
      location.hash = "#/entrar";
      roteador();
    };
    $("#minha-conta").onclick = trocarMinhaSenha;
    $("#b-ajuda").onclick = abrirAjuda;
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
    <div class="linha entre" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--borda)">
      <span class="pequeno suave">Esqueceu o Replique aberto em outro computador?</span>
      <button type="button" class="sec pequeno perigo-txt" id="sair-todos">${ic("sair", "p")}Sair de todos os aparelhos</button></div>`);
  const recarregar = (msg) => { toast(msg); trocarMinhaSenha(); };
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
      localStorage.setItem("rpq_token", r.token);
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

function animarTela() {
  const t = $("#tela");
  if (!t) return;
  t.classList.remove("entrando");
  void t.offsetWidth;
  t.classList.add("entrando");
}

const ERROS_GOOGLE = {
  "sem-acesso": "Esta conta Google não tem acesso ao Replique. Peça ao administrador um convite para o seu e-mail.",
  "outro-email": "Você entrou no Google com um e-mail diferente do convidado. Use a conta Google do e-mail que recebeu o convite.",
  "outra-conta": "Este acesso já está ligado a outra conta Google. Entre com ela, ou com e-mail e senha.",
  "ja-ligada": "Esta conta Google já está ligada a outro acesso do Replique.",
  convite: "O convite não vale mais (usado, cancelado ou expirado). Peça um novo ao administrador.",
  desativado: "Este acesso está desativado. Fale com o administrador.",
  cancelado: "O login com Google foi cancelado.",
  sessao: "O login com Google expirou ou foi aberto em outro navegador. Tente de novo.",
  google: "O Google não confirmou a conta. Tente de novo.",
  indisponivel: "O login com Google ainda não foi configurado no servidor.",
};
const LOGO_GOOGLE = `<svg class="logo-google" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

async function mostrarBotaoGoogle(alvo, href, texto = "Entrar com Google") {
  if (!alvo) return;
  try {
    const o = await api("/api/auth/opcoes");
    if (o.google) alvo.innerHTML = `<a class="botao botao-google" href="${h(href)}">${LOGO_GOOGLE}${texto}</a>
      <div class="ou"><span>ou</span></div>`;
  } catch {}
}

async function entrarComGoogle(ticket) {
  try {
    const r = await api("/api/auth/google/entrar", { method: "POST", body: { ticket: ticket || "" } });
    localStorage.setItem("rpq_token", r.token);
    Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null });
    history.replaceState(null, "", "#/");
    roteador();
  } catch (e) {
    telaEntrar("login", "sessao");
  }
}

function telaEntrar(modo = "login", erroGoogle = "") {
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("Replique · gestão de anúncios para marketplaces")}
      <div>
        <div class="selo-topo"><i>MONVATTI</i>Operação de marketplaces em um só lugar</div>
        <h1>Anúncios que vendem, <em>lucro que aparece.</em></h1>
        <p>Pesquise o que mais vende, publique em minutos e acompanhe a saúde das contas e o lucro de cada cliente.</p>
        <div class="recursos">
          ${[["pesquisar", "Pesquisa do que mais vende", "Anúncios líderes, preço, Full e visitas"],
            ["publicar", "Publicação com segurança", "Checagem de risco e limite por conta antes de ir ao ar"],
            ["cifrao", "Lucro real por venda", "Taxas, frete, impostos e Ads descontados"]]
            .map(([i, t, d]) => `<div>${ic(i)}<div><b>${t}</b><span>${d}</span></div></div>`).join("")}
        </div>
        <div class="canais">Integra com <span>Mercado Livre</span><span>Shopee</span><span>Amazon</span></div>
      </div>
      <div class="credito">© ${new Date().getFullYear()} Monvatti · Todos os direitos reservados</div>
    </div>
    <div class="form">${botaoTema()}<div class="caixa">
      <div class="caixa-topo"><img src="/static/monvatti-v.png" alt="" width="34" height="34"><div><b>Replique</b><small>by Monvatti</small></div></div>
      <h2>${modo === "agencia" ? "Criar uma nova agência" : "Bem-vindo de volta"}</h2>
      <div class="suave">${modo === "agencia"
        ? "Cria uma empresa nova e separada no Replique. Lojista: use o link de cadastro que a sua agência enviou."
        : "Entre com o e-mail e a senha do seu acesso."}</div>
      <div style="height:18px"></div>
      ${erroGoogle ? `<div class="aviso vermelho">${h(ERROS_GOOGLE[erroGoogle] || "Não foi possível entrar com Google.")}</div>` : ""}
      ${modo === "agencia" ? "" : '<div id="google-login"></div>'}
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
      <div class="rodape-caixa">${ic("escudo")}Conexão protegida. A Monvatti nunca pede a sua senha do marketplace.</div>
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
  if (erroGoogle) history.replaceState(null, "", "#/entrar");
  mostrarBotaoGoogle($("#google-login"), "/api/auth/google/iniciar");
}

async function telaConvite(token) {
  let empresa = "";
  try { empresa = (await api("/api/convite/" + encodeURIComponent(token || ""))).empresa; }
  catch (e) { empresa = null; }
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("Replique · gestão de anúncios para marketplaces")}
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

async function telaPesquisar(pesquisaId) {
  const termoInicial = estado.termoSugerido || estado.pesquisa?.termo || "";
  estado.termoSugerido = "";
  const escolhidas = JSON.parse(localStorage.getItem("rpq_plats") || '["mercadolivre","shopee","amazon"]');
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Pesquisar produtos</h1><div class="suave">Digite o produto (quanto mais exato, melhor: marca e modelo) e veja os anúncios
    que o vendem, com preço, Full, vendedor e visitas. Copie o melhor para editar e publicar. A pesquisa usa as contas de
    <b>${h(clienteAtual()?.nome)}</b> e os rascunhos ficam nesse cliente.</div></div>
    <button class="sec" id="b-recentes">${ic("relogio", "p")}Pesquisas recentes</button></div>
  <form class="cartao link-anuncio" id="f-link">
    <div class="linha" style="gap:8px;flex-wrap:nowrap">${ic("externo", "p")}
      <input id="link-ml" type="text" placeholder="Cole aqui o link de um anúncio ou produto do Mercado Livre (ou o código MLB)" autocomplete="off" aria-label="Link do anúncio">
      <button type="submit" class="sec" id="b-link">Puxar anúncio</button></div>
  </form>
  <form class="cartao pilha" id="f-pesquisa">
    <div class="linha" style="align-items:flex-end">
      <div style="flex:1;min-width:240px"><label for="termo">Nome do produto</label>
        <input id="termo" type="text" name="termo" placeholder="Ex.: garrafa térmica inox 1 litro" required value="${h(termoInicial)}"></div>
      <div><label for="modo-ml">Buscar no Mercado Livre</label>
        <select id="modo-ml" name="modo"><option value="anuncios">Catálogo: produtos e todos os anúncios deles</option>
          <option value="ranking" ${modoSalvo() === "ranking" ? "selected" : ""}>Mais vendidos: catálogo e lista geral</option></select></div>
      <div><label for="limite">Resultados por plataforma</label>
        <select id="limite" name="limite"><option>10</option><option selected>20</option><option>40</option></select></div>
      <button type="submit" id="b-pesquisar">${ic("pesquisar")}Pesquisar</button>
    </div>
    <div><label>Plataformas</label><div class="chips">
      ${Object.entries(PLAT).map(([k, p]) => `<label class="chip ${escolhidas.includes(k) ? "marcado" : ""}"><input type="checkbox" name="plataformas" value="${k}" ${escolhidas.includes(k) ? "checked" : ""}> ${p.nome}</label>`).join("")}
    </div></div>
  </form>
  <div id="resultado" style="margin-top:20px"></div>`;

  $$(".chip input").forEach((c) => (c.onchange = () => c.parentElement.classList.toggle("marcado", c.checked)));
  $("#b-recentes").onclick = () => abrirRecentes();
  $("#f-link").onsubmit = (e) => {
    e.preventDefault();
    const url = $("#link-ml").value.trim();
    if (!url) return toast("Cole o link do anúncio.", true);
    comBotao($("#b-link"), () => puxarLink(url));
  };
  $("#f-pesquisa").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const plataformas = fd.getAll("plataformas");
    if (!plataformas.length) return toast("Escolha pelo menos uma plataforma.", true);
    localStorage.setItem("rpq_plats", JSON.stringify(plataformas));
    try { localStorage.setItem("rpq_modo", fd.get("modo")); } catch {}
    executarPesquisa({ termo: fd.get("termo"), plataformas, limite: +fd.get("limite"), modo: fd.get("modo") });
  };

  if (pesquisaId && (!estado.pesquisa || estado.pesquisa.id != pesquisaId)) {
    estado.pesquisa = await api("/api/pesquisas/" + pesquisaId);
    $("#termo").value = estado.pesquisa.termo;
  }
  if (estado.pesquisa && pesquisaId) desenharResultados();
}

const modoSalvo = () => { try { return localStorage.getItem("rpq_modo") || "anuncios"; } catch { return "anuncios"; } };

function executarPesquisa(corpo) {
  $("#resultado").innerHTML = `<div class="carregando"><span class="girando"></span> Consultando ${corpo.plataformas.map((p) => PLAT[p].nome).join(", ")}… (o Mercado Livre pode levar até ~20 s)</div>`;
  let ok = false;
  return comBotao($("#b-pesquisar"), async () => {
    estado.pesquisa = await api("/api/pesquisas", { method: "POST", body: corpo });
    estado.pesquisa.limite = corpo.limite;
    estado.filtro = "todas";
    history.replaceState(null, "", "#/pesquisar/" + estado.pesquisa.id);
    desenharResultados();
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

async function abrirRecentes() {
  const m = modal(`<div class="carregando"><span class="girando"></span> Carregando…</div>`);
  const desenhar = async () => {
    const lista = await api("/api/pesquisas");
    m.innerHTML = `<button type="button" class="icone modal-x" data-fechar aria-label="Fechar" title="Fechar (Esc)">${ic("x")}</button>
      <h2>${ic("relogio", "p")}Pesquisas recentes</h2>
      <p class="pequeno suave" style="margin-top:-6px">As últimas 30 pesquisas de <b>${h(clienteAtual()?.nome)}</b>. Clique para abrir de novo sem gastar outra consulta.</p>
      ${lista.length ? `<div class="recentes">${lista.map((p) => `<div class="recente">
          <a href="#/pesquisar/${p.id}" data-fechar><b>${h(p.termo)}</b><span class="pequeno suave">${p.quantidade} resultado(s) · ${data(p.criada_em)}</span></a>
          <button type="button" class="icone" data-apagar="${p.id}" title="Apagar esta pesquisa" aria-label="Apagar esta pesquisa">${ic("lixo")}</button></div>`).join("")}</div>
        <div class="linha entre" style="margin-top:14px"><button class="sec pequeno perigo-txt" id="apagar-todas">${ic("lixo", "p")}Apagar todas</button>
          <button data-fechar>Fechar</button></div>`
      : `${vazio("relogio", "Nenhuma pesquisa recente")}<div class="linha" style="justify-content:flex-end"><button data-fechar>Fechar</button></div>`}`;
    $$("[data-apagar]", m).forEach((b) => (b.onclick = () => comBotao(b, async () => {
      await api("/api/pesquisas/" + b.dataset.apagar, { method: "DELETE" });
      if (estado.pesquisa?.id === +b.dataset.apagar) estado.pesquisa = null;
      await desenhar();
    })));
    const todas = $("#apagar-todas", m);
    if (todas) todas.onclick = () => {
      if (!confirm("Apagar todas as pesquisas recentes deste cliente?")) return;
      comBotao(todas, async () => {
        await api("/api/pesquisas", { method: "DELETE" });
        estado.pesquisa = null;
        toast("Pesquisas recentes apagadas.");
        await desenhar();
      });
    };
  };
  try { await desenhar(); } catch (e) { m.innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; }
}

const FILTROS_ANUNCIO = [["full", "No Full"], ["fora_full", "Fora do Full"], ["frete_gratis", "Frete grátis"],
  ["classico", "Clássico"], ["premium", "Premium"], ["lojas_oficiais", "Loja oficial"]];
const ORDENS_RESULTADO = [["relevancia", "Relevância"], ["preco", "Menor preço"], ["anuncios", "Mais anúncios"], ["full", "Mais anúncios no Full"]];
const filtrosPesquisa = () => (estado.filtrosPesquisa ||= { tipo: "todos", marcados: [], ordem: "relevancia" });

function passaFiltros(r) {
  const f = filtrosPesquisa();
  const catalogo = r.tipo === "PRODUCT";
  if (f.tipo === "catalogo" && !catalogo) return false;
  if (f.tipo === "lista" && catalogo) return false;
  if (!f.marcados.length || r.plataforma !== "mercadolivre") return true;
  const x = r.extra || {};
  if (x.fonte !== "anuncios" && !x.anuncios) return false;
  return f.marcados.every((k) => (x[k] || 0) > 0);
}

function ordenarResultados(itens) {
  const o = filtrosPesquisa().ordem;
  if (o === "relevancia") return itens;
  const val = (r) => o === "preco" ? (r.preco ?? Infinity) : -((r.extra || {})[o === "full" ? "full" : "anuncios"] || 0);
  return [...itens].sort((a, b) => val(a) - val(b));
}

function barraFiltros(p) {
  const f = filtrosPesquisa();
  const temML = p.resultados.some((r) => r.plataforma === "mercadolivre");
  if (!temML) return "";
  const listaGeral = p.resultados.filter((r) => r.plataforma === "mercadolivre" && r.tipo !== "PRODUCT").length;
  const porAnuncio = p.meta?.mercadolivre?.busca?.modo === "anuncios";
  if (porAnuncio) f.tipo = "todos";
  return `<div class="filtros cartao">
    <div class="linha" style="gap:6px">${ic("filtro", "p")}<b class="pequeno">Filtrar</b></div>
    ${porAnuncio ? "" : `<div class="segmentos" role="group" aria-label="Tipo de anúncio">
      ${[["todos", "Todos"], ["catalogo", "Catálogo"], ["lista", `Lista geral${listaGeral ? ` (${listaGeral})` : ""}`]].map(([v, n]) =>
        `<button type="button" data-tipo="${v}" class="${f.tipo === v ? "ativa" : ""}">${n}</button>`).join("")}</div>`}
    <div class="chips chips-pequenos">${FILTROS_ANUNCIO.map(([k, n]) => `<label class="chip ${f.marcados.includes(k) ? "marcado" : ""}">
      <input type="checkbox" data-filtro="${k}" ${f.marcados.includes(k) ? "checked" : ""}> ${n}</label>`).join("")}</div>
    ${`<label class="linha pequeno" style="gap:6px;margin:0 0 0 auto;font-weight:500">Ordenar <select id="ordem-res" style="width:auto">
      ${ORDENS_RESULTADO.map(([v, n]) => `<option value="${v}" ${f.ordem === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>`}
  </div>
  ${f.tipo === "lista" && !listaGeral ? `<div class="aviso azul pequeno">A busca por <b>Catálogo</b> só traz produtos de catálogo. Para ver anúncios da lista geral,
    pesquise em <b>Mais vendidos: catálogo e lista geral</b>. A API do Mercado Livre não libera busca livre de anúncios para apps de terceiros,
    então a lista geral aparece pelo ranking de mais vendidos da categoria.</div>` : ""}`;
}

function desenharResultados() {
  const p = estado.pesquisa;
  const plats = [...new Set(p.resultados.map((r) => r.plataforma))];
  const restritos = p.resultados.filter((r) => r.extra?.restrito).length;
  const filtrados = p.resultados.filter(passaFiltros);
  const itens = ordenarResultados(filtrados.filter((r) => (estado.filtro === "todas" || r.plataforma === estado.filtro)
    && !(estado.soCompletos && r.extra?.restrito)));
  const avisos = p.avisos.map((a) => `<div class="aviso ${a.mensagem.startsWith("Modo demonstração") ? "amarelo" : "vermelho"}">${selo(a.plataforma)} ${h(a.mensagem)}
      ${a.mensagem.startsWith("Modo demonstração") ? ` — <a href="#/contas">conectar conta</a>` : ""}</div>`).join("");
  const resumo = Object.entries(p.resumo).map(([pl, r]) => `
    <div class="cartao kpi"><div class="linha entre">${selo(pl)}${r.demo ? '<span class="selo demo">demonstração</span>' : ""}</div>
      <div class="rotulo">Faixa de preço encontrada</div>
      <div class="valor">${brl(r.preco_min)} – ${brl(r.preco_max)}</div>
      <div class="pequeno">Mediana: <b>${brl(r.preco_mediano)}</b> · ${r.quantidade} anúncios</div>
      <div class="pequeno suave" style="margin-top:6px">Líder: ${h(r.lider)}</div></div>`).join("");
  const modoAnuncios = p.meta?.mercadolivre?.busca?.modo === "anuncios";

  $("#resultado").innerHTML = `
    ${avisos}
    ${resumo ? `<div class="grade g${Math.min(3, Object.keys(p.resumo).length)}" style="margin-bottom:18px">${resumo}</div>` : ""}
    ${faixaInterpretacao(p)}
    ${barraCategoriasML(p)}
    ${p.resultados.length ? `
    ${barraFiltros(p)}
    <div class="abas">
      <button data-f="todas" class="${estado.filtro === "todas" ? "ativa" : ""}">Todas (${filtrados.length})</button>
      ${plats.map((pl) => `<button data-f="${pl}" class="${estado.filtro === pl ? "ativa" : ""}">${PLAT[pl].nome} (${filtrados.filter((r) => r.plataforma === pl).length})</button>`).join("")}
    </div>
    ${modoAnuncios ? `<p class="suave pequeno">${selo("mercadolivre")} Cada cartão é um produto diferente do catálogo do ML (as versões dele, como voltagem e cor, ficam juntas).
      Clique em <b>Ver anúncios</b> para comparar vendedor, preço, Full e visitas e copiar o que preferir.</p>`
      : `<p class="suave pequeno">Ordenado por <b>relevância</b> (0–100): posição na busca ou no ranking do Mercado Livre, quantidade vendida (Shopee) ou ranking de vendas (Amazon).</p>`}
    ${restritos ? `<div class="aviso azul pequeno">${restritos} resultado(s) do Mercado Livre são anúncios da lista geral cujos detalhes (título, foto, preço) a API do ML não libera para outros apps. Eles aparecem com a posição no ranking, visitas e link.
      <label style="display:inline;font-weight:600;margin-left:8px"><input type="checkbox" id="so-completos" ${estado.soCompletos ? "checked" : ""}> mostrar só os completos</label></div>` : ""}
    ${itens.length ? gradeResultados(itens, modoAnuncios && filtrosPesquisa().ordem === "relevancia")
      : `<div class="cartao">${vazio("filtro", "Nenhum resultado com esses filtros", "Tire algum filtro para ver mais.")}</div>`}`
    : `<div class="cartao">${vazio("pesquisar", "Nenhum resultado", "Tente outro termo ou outras plataformas.")}</div>`}`;
  $$("#resultado .produto").forEach((el, i) => (el.style.animationDelay = Math.min(i, 12) * 25 + "ms"));

  $$("#resultado .abas button").forEach((b) => (b.onclick = () => { estado.filtro = b.dataset.f; desenharResultados(); }));
  $$("#resultado [data-tipo]").forEach((b) => (b.onclick = () => { filtrosPesquisa().tipo = b.dataset.tipo; desenharResultados(); }));
  $$("#resultado [data-filtro]").forEach((c) => (c.onchange = () => {
    const f = filtrosPesquisa();
    f.marcados = c.checked ? [...f.marcados, c.dataset.filtro] : f.marcados.filter((k) => k !== c.dataset.filtro);
    desenharResultados();
  }));
  const ordem = $("#ordem-res");
  if (ordem) ordem.onchange = () => { filtrosPesquisa().ordem = ordem.value; desenharResultados(); };
  const so = $("#so-completos");
  if (so) so.onchange = () => { estado.soCompletos = so.checked; desenharResultados(); };
  $$("#resultado [data-cat-ml]").forEach((b) => (b.onclick = () =>
    executarPesquisa({ termo: p.termo, plataformas: p.plataformas, limite: p.limite || 20, modo: "ranking", categoria_ml: b.dataset.catMl,
      todas_marcas: p.meta?.mercadolivre?.busca?.modo !== "exata" })));
  const tm = $("#todas-marcas");
  if (tm) tm.onclick = () => executarPesquisa({ termo: p.termo, plataformas: p.plataformas, limite: p.limite || 20, modo: "ranking", todas_marcas: true });
  $$("#resultado [data-anuncios]").forEach((b) => (b.onclick = () => abrirAnunciosDoProduto(p.resultados[+b.dataset.anuncios], p)));
  $$("#resultado [data-copiar]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const r = p.resultados[+b.dataset.copiar];
    const a = await api("/api/anuncios/copiar", { method: "POST", body: { plataforma: r.plataforma, id_externo: r.id_externo, tipo: r.tipo, pesquisa_id: p.id } });
    toast("Anúncio copiado para os rascunhos. Ele fica salvo para você terminar quando quiser.");
    location.hash = "#/editor/" + a.id;
  })));
  const corrigir = $("#corrigir-termo");
  if (corrigir) corrigir.onclick = () => {
    const campo = $("#termo");
    campo.value = corrigir.dataset.termo;
    campo.focus();
    campo.select();
    campo.scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

function gradeResultados(itens, separar) {
  const ml = (r) => r.plataforma === "mercadolivre" && r.extra?.correspondencia;
  const parecidos = separar ? itens.filter((r) => ml(r) && r.extra.correspondencia === "parecido") : [];
  if (!parecidos.length) return `<div class="resultados">${itens.map(cartaoProduto).join("")}</div>`;
  const exatos = itens.filter((r) => !parecidos.includes(r));
  return `${exatos.length ? `<div class="resultados">${exatos.map(cartaoProduto).join("")}</div>`
      : `<div class="aviso amarelo pequeno">Não achei no catálogo do Mercado Livre um produto que bata com tudo o que foi pesquisado. Veja os parecidos abaixo.</div>`}
    <h3 style="margin:22px 0 4px">Parecidos</h3>
    <p class="suave pequeno" style="margin:0 0 10px">Não batem em algum ponto da pesquisa (marca, medida, potência ou voltagem), como a busca do Mercado Livre mostra depois dos exatos.</p>
    <div class="resultados">${parecidos.map(cartaoProduto).join("")}</div>`;
}

function faixaInterpretacao(p) {
  const b = p.meta?.mercadolivre?.busca;
  const i = b?.interpretacao;
  if (b?.modo !== "anuncios" || !i) return "";
  const partes = [["Produto", i.produto], ...(i.medidas || []).map((m) => [m.nome, m.rotulo + (m.inferida ? " (deduzido)" : "")]),
    ["Marca", i.marca], ["Voltagem", i.voltagem]]
    .filter(([, v]) => v).map(([n, v]) => `<span class="selo neutro">${n}: <b>${h(v)}</b></span>`).join(" ");
  return `<div class="cartao linha entre" style="margin-bottom:16px;padding:12px 16px;gap:10px;flex-wrap:wrap">
    <div class="linha" style="gap:6px;flex-wrap:wrap">${selo("mercadolivre")}<span class="pequeno"><b>Entendi como:</b></span>${partes}
      <span class="pequeno suave">· pesquisado como “${h(i.termo_busca)}”${i.fonte === "ia" ? " (com IA)" : ""}</span></div>
    <button class="sec pequeno" id="corrigir-termo" data-termo="${h(i.termo_busca)}" title="Edite o termo e pesquise de novo">Não é isso? Corrigir</button></div>`;
}

async function puxarLink(url) {
  const r = await api("/api/mercadolivre/link", { method: "POST", body: { url } });
  if (r.tipo === "produto") {
    toast(r.item_id ? "Achei o anúncio dentro do produto de catálogo." : "Produto de catálogo encontrado.");
    return abrirAnunciosDoProduto({ id_externo: r.product_id }, null, r.item_id || "");
  }
  const m = modal(`<h2>${ic("externo", "p")}${h(r.titulo || r.item_id)}</h2>
    <p class="pequeno suave" style="margin-top:-6px">${h(r.item_id)}${r.visitas != null ? ` · ${numero(r.visitas)} visitas no total` : ""}
      ${urlSegura(r.link) ? ` · <a href="${h(r.link)}" target="_blank" rel="noopener">abrir no ML ${ic("externo", "p")}</a>` : ""}</p>
    ${r.proprio ? `<div class="aviso azul pequeno">Este anúncio é da conta conectada deste cliente.${r.preco != null ? ` Preço: <b>${brl(r.preco)}</b>.` : ""}</div>`
      : `<div class="aviso amarelo pequeno">Este anúncio é de outro vendedor e não está em nenhum produto de catálogo que eu tenha achado. A API do Mercado Livre
        só libera a descrição e as visitas dele: ao copiar, o rascunho vem com a descrição e o link, e você completa título, fotos e preço.</div>`}
    ${r.descricao ? `<label>Descrição</label><div class="descricao-link">${h(r.descricao)}</div>` : ""}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Fechar</button>
      <button id="link-copiar">${ic("copiar", "p")}Copiar para rascunho</button></div>`);
  $("#link-copiar", m).onclick = () => comBotao($("#link-copiar", m), async () => {
    const a = await api("/api/anuncios/copiar", { method: "POST", body: { plataforma: "mercadolivre", id_externo: r.item_id, tipo: "ITEM" } });
    fecharModal();
    toast("Anúncio copiado para os rascunhos.");
    location.hash = "#/editor/" + a.id;
  });
}

function cartaoProduto(r) {
  const idx = estado.pesquisa.resultados.indexOf(r);
  const img = urlSegura(r.imagem);
  const restrito = !!r.extra?.restrito;
  const x = r.extra || {};
  const porAnuncios = x.fonte === "anuncios";
  const metricas = [
    porAnuncios && x.versoes > 1 ? `${x.versoes} versões juntas neste cartão` : "",
    porAnuncios && x.anuncios ? `${numero(x.vendedores)} vendedor(es) · ${numero(x.frete_gratis)} com frete grátis${x.lojas_oficiais ? ` · ${x.lojas_oficiais} loja(s) oficial(is)` : ""}` : "",
    r.vendidos != null ? `${Number(r.vendidos).toLocaleString("pt-BR")} vendidos` : "",
    r.avaliacao ? `${ic("estrela", "p cheio")} ${r.avaliacao}` : "",
    r.extra?.preco_max && r.extra.preco_max > r.preco ? `até ${brl(r.extra.preco_max)}` : "",
  ].filter(Boolean).join(" · ");
  const verAnuncios = porAnuncios && x.anuncios;
  return `<article class="cartao produto">
    <div class="foto">${img ? `<img src="${h(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="pequeno" style="padding:12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px">${ic("imagem", "g")}${restrito ? "Foto não liberada pela API do ML" : "Sem foto"}</span>`}
      <span class="posicao">#${r.posicao_geral}</span>${selo(r.plataforma)}</div>
    <div class="corpo">
      <div class="titulo ${restrito ? "suave" : ""}" title="${h(r.titulo)}">${h(r.titulo)}</div>
      ${r.plataforma === "mercadolivre" ? `<div>${r.tipo === "PRODUCT" ? '<span class="selo neutro">catálogo</span>' : '<span class="selo neutro">lista geral</span>'}</div>` : ""}
      ${r.extra?.trecho ? `<div class="pequeno" style="font-style:italic">“${h(r.extra.trecho)}”</div>` : ""}
      <div class="preco">${restrito ? '<span class="pequeno suave">preço no anúncio</span>' : porAnuncios && x.anuncios > 1 ? `<span class="pequeno suave">a partir de</span> ${brl(r.preco)}` : brl(r.preco)}</div>
      ${verAnuncios ? `<div class="linha" style="gap:6px;flex-wrap:wrap"><span class="selo neutro">${numero(x.anuncios)} anúncio(s)</span>
        ${x.full ? `<span class="selo ok">${numero(x.full)} no Full</span>` : ""}${x.premium ? `<span class="selo neutro">${numero(x.premium)} Premium</span>` : ""}
        ${x.classico ? `<span class="selo neutro">${numero(x.classico)} Clássico</span>` : ""}</div>` : ""}
      <div class="pequeno suave">${h(r.origem_sinal)}${metricas ? "<br>" + metricas : ""}</div>
      <div title="Popularidade ${r.popularidade}"><div class="barra"><i style="width:${Math.max(3, r.popularidade)}%"></i></div></div>
      ${r.demo ? '<span class="selo demo" style="align-self:flex-start">demonstração</span>' : ""}
      <div class="acoes ${verAnuncios ? "tres" : ""}">
        ${verAnuncios ? `<button class="pequeno" data-anuncios="${idx}" title="Comparar os anúncios deste produto">${ic("olho", "p")}Ver anúncios</button>` : ""}
        <button data-copiar="${idx}" class="pequeno ${restrito || verAnuncios ? "sec" : ""}" ${restrito ? 'title="Cria um rascunho com o link (e a descrição, quando liberada); você completa título, fotos e preço"' : 'title="Copia ficha e fotos do produto"'}>${ic("copiar", "p")}Copiar</button>
        ${urlSegura(r.link) ? `<a class="botao sec pequeno icone-so" href="${h(r.link)}" target="_blank" rel="noopener" title="Abrir o anúncio original" aria-label="Abrir o anúncio original">${ic("externo", "p")}</a>` : ""}
      </div>
    </div></article>`;
}

const MEDALHA = { platinum: "MercadoLíder Platinum", gold: "MercadoLíder Gold", silver: "MercadoLíder" };
const COR_TERMOMETRO = { "5_green": "verde", "4_light_green": "verde", "3_yellow": "amarelo", "2_orange": "vermelho", "1_red": "vermelho" };

function minigrafico(serie) {
  if (!serie?.length) return "";
  const max = Math.max(1, ...serie), l = 96, a = 26;
  const pts = serie.map((v, i) => `${(i / (serie.length - 1) * l).toFixed(1)},${(a - 2 - v / max * (a - 4)).toFixed(1)}`).join(" ");
  return `<svg class="minigrafico" viewBox="0 0 ${l} ${a}" width="${l}" height="${a}" role="img" aria-label="Visitas nos últimos 30 dias">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

const FILTRO_NO_ANUNCIO = {
  full: (a) => a.full, fora_full: (a) => !a.full, frete_gratis: (a) => a.frete_gratis,
  classico: (a) => a.tipo_anuncio === "Clássico", premium: (a) => a.tipo_anuncio === "Premium", lojas_oficiais: (a) => a.loja_oficial,
};

async function abrirAnunciosDoProduto(r, pesquisa, destaque = "") {
  const m = modal(`<div class="carregando"><span class="girando"></span> Buscando os anúncios, os vendedores e as visitas…</div>`);
  m.classList.add("larga", "extra-larga");
  let d;
  try { d = await api(`/api/mercadolivre/produtos/${encodeURIComponent(r.id_externo)}/anuncios`); }
  catch (e) { m.innerHTML = `<div class="aviso vermelho">${h(e.message)}</div><div class="linha" style="justify-content:flex-end"><button class="sec" data-fechar>Fechar</button></div>`; return; }
  let ordem = "visitas";
  const marcados = destaque ? [] : [...filtrosPesquisa().marcados];
  const desenhar = () => {
    const filtrados = d.anuncios.filter((a) => marcados.every((k) => FILTRO_NO_ANUNCIO[k](a)));
    const lista = [...filtrados].sort((a, b) => destaque && (a.item_id === destaque) !== (b.item_id === destaque) ? (a.item_id === destaque ? -1 : 1)
      : ordem === "preco" ? a.preco - b.preco
      : ordem === "semana" ? (b.visitas.sete_dias || 0) - (a.visitas.sete_dias || 0)
      : ordem === "vendedor" ? (b.vendedor.vendas_total || 0) - (a.vendedor.vendas_total || 0)
      : (b.visitas.trinta_dias || 0) - (a.visitas.trinta_dias || 0));
    const visitas30 = d.anuncios.reduce((t, a) => t + (a.visitas.trinta_dias || 0), 0);
    m.innerHTML = `<div class="linha entre" style="gap:12px;align-items:flex-start">
        <div class="linha" style="gap:12px">${urlSegura(d.produto.foto) ? `<img src="${h(d.produto.foto)}" alt="" width="56" height="56" style="border-radius:8px;object-fit:contain;background:#fff" referrerpolicy="no-referrer">` : ""}
          <div><h2 style="margin:0">${h(d.produto.nome)}</h2>
            <div class="pequeno suave">${numero(d.total)} anúncio(s)${d.mostrados < d.total ? ` · mostrando os ${d.mostrados} mais baratos` : ""} ·
              ${numero(visitas30)} visitas em 30 dias somando todos${d.demo ? ' · <span class="selo demo">demonstração</span>' : ""}</div></div></div>
        <button class="icone modal-x" data-fechar aria-label="Fechar" title="Fechar (Esc)">${ic("x")}</button></div>
      <div class="aviso azul pequeno" style="margin:12px 0">O Mercado Livre não informa pela API quantas unidades um anúncio de outro vendedor vendeu.
        As <b>visitas</b> (ontem, 7 e 30 dias) mostram a procura por cada anúncio, e o <b>total de vendas do vendedor</b> mostra o tamanho de quem vende.</div>
      <div class="filtros" style="margin-bottom:10px">
        <div class="linha" style="gap:6px">${ic("filtro", "p")}<b class="pequeno">Filtrar</b></div>
        <div class="chips chips-pequenos">${FILTROS_ANUNCIO.map(([k, n]) => {
          const qtd = d.anuncios.filter(FILTRO_NO_ANUNCIO[k]).length;
          return `<label class="chip ${marcados.includes(k) ? "marcado" : ""}"><input type="checkbox" data-filtro-a="${k}" ${marcados.includes(k) ? "checked" : ""}> ${n} <span class="suave">${qtd}</span></label>`;
        }).join("")}</div>
        <label class="linha pequeno" style="gap:6px;margin:0 0 0 auto;font-weight:500">Ordenar <select id="o-ordem" style="width:auto">
          ${[["visitas", "mais visitas em 30 dias"], ["semana", "mais visitas em 7 dias"], ["preco", "menor preço"], ["vendedor", "vendedor que mais vende"]]
            .map(([v, n]) => `<option value="${v}" ${v === ordem ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
      ${lista.length ? `<div class="tabela-margem"><table class="tabela-anuncios"><thead><tr><th>Vendedor</th><th>Preço</th><th>Envio</th><th>Tipo</th>
        <th title="Visitas: ontem · últimos 7 dias · últimos 30 dias">Visitas (ontem · 7d · 30d)</th><th></th></tr></thead><tbody>
        ${lista.map((a) => { const v = a.visitas || {}, s = a.vendedor || {}; return `<tr class="${a.item_id === destaque ? "destaque" : ""}">
          <td><span class="ponto-rep ${COR_TERMOMETRO[s.termometro] || "cinza"}" title="Termômetro: ${h(s.termometro || "sem reputação")}"></span>
            ${urlSegura(s.link) ? `<a href="${h(s.link)}" target="_blank" rel="noopener">${h(s.apelido || s.id)}</a>` : h(s.apelido || s.id)}
            ${a.loja_oficial ? ' <span class="selo ok">loja oficial</span>' : ""}
            <div class="pequeno suave">${s.medalha ? `${h(MEDALHA[s.medalha] || s.medalha)} · ` : ""}${s.vendas_total != null ? `${numero(s.vendas_total)} vendas no total` : ""}
              ${a.cidade ? ` · ${h(a.cidade)}` : ""}</div></td>
          <td><b>${brl(a.preco)}</b>${a.desconto_pct ? `<div class="pequeno"><s class="suave">${brl(a.preco_original)}</s> <span class="positivo">−${a.desconto_pct}%</span></div>` : ""}</td>
          <td>${a.full ? '<span class="selo ok">Full</span>' : `<span class="pequeno">${h(a.logistica_nome)}</span>`}
            <div class="pequeno suave">${a.frete_gratis ? "frete grátis" : "frete pago"}</div></td>
          <td class="pequeno">${h(a.tipo_anuncio)}${a.garantia ? `<div class="suave">${h(a.garantia)}</div>` : ""}</td>
          <td><div class="linha" style="gap:10px;flex-wrap:nowrap"><span class="visitas-num"><b>${numero(v.ontem)}</b> · ${numero(v.sete_dias)} · <b>${numero(v.trinta_dias)}</b></span>
            <span class="azul-texto">${minigrafico(v.serie)}</span></div></td>
          <td><div class="acoes-linha">
            ${urlSegura(a.link) ? `<a class="botao sec pequeno icone-so" href="${h(a.link)}" target="_blank" rel="noopener" title="Abrir o anúncio no Mercado Livre" aria-label="Abrir o anúncio no Mercado Livre">${ic("externo", "p")}</a>` : ""}
            <button class="pequeno" data-copiar-item="${h(a.item_id)}">${ic("copiar", "p")}Copiar</button></div></td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("filtro", "Nenhum anúncio com esses filtros", "Tire algum filtro para ver mais.")}`;
    $("#o-ordem", m).onchange = (e) => { ordem = e.target.value; desenhar(); };
    $$("[data-filtro-a]", m).forEach((c) => (c.onchange = () => {
      const i = marcados.indexOf(c.dataset.filtroA);
      if (c.checked && i < 0) marcados.push(c.dataset.filtroA);
      if (!c.checked && i >= 0) marcados.splice(i, 1);
      desenhar();
    }));
    $$("[data-copiar-item]", m).forEach((b) => (b.onclick = () => comBotao(b, async () => {
      const a = await api("/api/anuncios/copiar", { method: "POST", body: {
        plataforma: "mercadolivre", id_externo: r.id_externo, tipo: "PRODUCT", item_id: b.dataset.copiarItem, pesquisa_id: pesquisa?.id || null } });
      fecharModal();
      toast("Anúncio copiado para os rascunhos. Ele fica salvo para você terminar quando quiser.");
      location.hash = "#/editor/" + a.id;
    })));
  };
  desenhar();
}

const ROTULO_STATUS = { rascunho: ["neutro", "Rascunho"], publicado: ["ok", "Publicado"], parcial: ["demo", "Parcial"],
  erro: ["erro", "Com erro"], simulado: ["demo", "Simulado"] };
const seloStatus = (s) => `<span class="selo ${ROTULO_STATUS[s]?.[0] || "neutro"}">${ROTULO_STATUS[s]?.[1] || h(s)}</span>`;

const ABAS_RASCUNHO = [["preparo", "Em preparo", (a) => ["rascunho", "simulado"].includes(a.status)],
  ["erro", "Com erro", (a) => ["erro", "parcial"].includes(a.status)], ["publicados", "Publicados", (a) => a.status === "publicado"]];

async function telaRascunhos(abaParam) {
  const lista = await api("/api/anuncios");
  const equipe = eEquipe();
  const cliente = clienteAtual();
  const aba = ABAS_RASCUNHO.some(([k]) => k === abaParam) ? abaParam : estado.abaRascunho || "preparo";
  estado.abaRascunho = aba;
  const filtro = ABAS_RASCUNHO.find(([k]) => k === aba)[2];
  const busca = (estado.buscaRascunho || "").toLowerCase();
  const visiveis = lista.filter((a) => filtro(a) && (!busca || (a.titulo || "").toLowerCase().includes(busca)));
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${equipe ? "Rascunhos" : "Anúncios da sua loja"}</h1>
    <div class="suave">${equipe ? `Anúncios de <b>${h(cliente?.nome)}</b> copiados ou criados. Tudo o que você edita fica salvo aqui até publicar;
      o que falhar na publicação volta para a aba <b>Com erro</b>.`
      : "Tudo o que a equipe Monvatti preparou para a sua loja, com quem fez e em que pé está."}</div></div>
    ${equipe ? `<button id="novo">${ic("mais")}Criar do zero</button>` : ""}</div>
  ${!equipe && lista.some((a) => a.aprovacao === "pendente") ? `<div class="aviso azul">${ic("aprovar", "p")}
    <b>${lista.filter((a) => a.aprovacao === "pendente").length} anúncio(s) aguardando a sua aprovação.</b>
    Clique em Ver para conferir e aprovar ou pedir ajustes. Nada é publicado sem o seu ok.</div>` : ""}
  <div class="abas">${ABAS_RASCUNHO.map(([k, n, f]) => `<button data-aba="${k}" class="${aba === k ? "ativa" : ""}">${n} (${lista.filter(f).length})</button>`).join("")}</div>
  ${equipe && aba !== "publicados" && visiveis.length ? `<div class="barra-lote cartao">
    <label class="linha" style="margin:0;gap:8px"><input type="checkbox" id="sel-todos"> Selecionar todos</label>
    <span class="suave pequeno" id="sel-info">Marque os rascunhos prontos para publicar vários de uma vez, um por um, com intervalo (até 20 por lote).</span>
    <button id="b-lote" disabled>${ic("pacote", "p")}Publicar em lote</button></div>` : ""}
  <div class="cartao">
    ${lista.length > 8 ? `<input type="search" id="busca-rascunho" placeholder="Buscar pelo título…" value="${h(estado.buscaRascunho || "")}" style="max-width:340px;margin-bottom:8px">` : ""}
    ${visiveis.length ? visiveis.map((a) => `
    <div class="lista-item">
      ${equipe && aba !== "publicados" ? `<input type="checkbox" class="sel-lote" value="${a.id}" aria-label="Selecionar ${h(a.titulo)}">` : ""}
      ${urlSegura(a.foto) ? `<img src="${h(a.foto)}" alt="" referrerpolicy="no-referrer">` : semFoto()}
      <div class="info"><b>${h(a.titulo || "(sem título)")}</b>
        <span class="pequeno suave">${brl(a.preco)} · ${a.origem && PLAT[a.origem] ? "copiado de " + PLAT[a.origem].nome : "criado manualmente"}
          ${a.criado_por ? ` · por <b>${h(a.criado_por)}</b>` : ""} · salvo ${data(a.atualizado_em)}</span>
        ${a.falha ? `<span class="pequeno erro-texto">${ic("alerta", "p")} ${h(a.falha)}</span>` : ""}</div>
      ${seloAprovacao(a.aprovacao)}${seloStatus(a.status)}
      ${equipe ? `<a class="botao sec pequeno" href="#/editor/${a.id}">${ic("lapis", "p")}${aba === "erro" ? "Corrigir" : "Editar"}</a>`
        : `<button class="sec pequeno" data-ver="${a.id}">${ic("olho", "p")}Ver</button>`}
    </div>`).join("") : vazio("rascunhos", aba === "erro" ? "Nenhuma publicação com erro" : aba === "publicados" ? "Nada publicado ainda" : "Nenhum rascunho em preparo",
      aba !== "preparo" ? "" : equipe ? `<a href="#/pesquisar">Pesquise um produto</a> e copie um anúncio para começar.` : "Assim que a equipe começar, os anúncios aparecem aqui.")}</div>`;
  $$("[data-aba]").forEach((b) => (b.onclick = () => { estado.abaRascunho = b.dataset.aba; telaRascunhos(b.dataset.aba); }));
  const campoBusca = $("#busca-rascunho");
  if (campoBusca) campoBusca.oninput = () => {
    estado.buscaRascunho = campoBusca.value;
    clearTimeout(telaRascunhos._t);
    telaRascunhos._t = setTimeout(async () => { await telaRascunhos(aba); const c = $("#busca-rascunho"); c?.focus(); c?.setSelectionRange(c.value.length, c.value.length); }, 300);
  };
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
      : n ? `${n} rascunho(s) selecionado(s).` : "Marque os rascunhos prontos para publicar vários de uma vez, um por um, com intervalo (até 20 por lote).";
    $("#sel-info").classList.toggle("aviso-texto", n > 20);
  };
  $$(".sel-lote").forEach((c) => (c.onchange = atualizar));
  const todos = $("#sel-todos");
  if (todos) todos.onchange = () => { $$(".sel-lote").forEach((c) => (c.checked = todos.checked)); atualizar(); };
  const bLote = $("#b-lote");
  if (bLote) bLote.onclick = () => abrirLote(selecionados());
}

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
        ${eEquipe() && ["na_fila", "executando", "interrompido"].includes(l.status) ? `<button class="sec pequeno" data-cancelar="${l.id}">Cancelar</button>` : ""}
        ${eEquipe() && l.status === "interrompido" ? `<button class="pequeno" data-retomar="${l.id}">Retomar</button>` : ""}
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
    ${a.aprovacao === "pendente" && estado.usuario.papel === "cliente" ? `<div class="cartao" style="margin-top:14px;background:var(--cartao-2)">
      <h3 style="margin-top:0">${ic("aprovar", "p")} Sua aprovação</h3>
      <p class="pequeno suave">A equipe preparou este anúncio para a sua loja. Se estiver tudo certo, aprove; se não, diga o que ajustar.</p>
      <textarea id="ap-nota" placeholder="O que precisa mudar? (obrigatório para pedir ajustes)" style="min-height:70px"></textarea>
      <div class="linha" style="justify-content:flex-end;margin-top:8px"><button class="sec" id="ap-recusar">Pedir ajustes</button>
        <button id="ap-aprovar">${ic("aprovar", "p")}Aprovar anúncio</button></div></div>`
      : a.aprovacao ? `<p class="pequeno" style="margin-top:12px">${seloAprovacao(a.aprovacao)} ${a.aprovacao_nota ? h(a.aprovacao_nota) : ""}</p>` : ""}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
  const decidir = (decisao, botao) => comBotao(botao, async () => {
    await api(`/api/anuncios/${id}/aprovacao`, { method: "POST", body: { decisao, nota: $("#ap-nota")?.value || "" } });
    fecharModal();
    toast(decisao === "aprovar" ? "Anúncio aprovado. A equipe já pode publicar." : "Pedido de ajuste enviado à equipe.");
    roteador();
  });
  if ($("#ap-aprovar")) {
    $("#ap-aprovar").onclick = () => decidir("aprovar", $("#ap-aprovar"));
    $("#ap-recusar").onclick = () => decidir("recusar", $("#ap-recusar"));
  }
}

const APROVACAO = { pendente: ["neutro", "aguardando aprovação"], aprovado: ["ok", "aprovado pelo lojista"],
  recusado: ["erro", "ajustes pedidos"] };
const seloAprovacao = (s) => (s && APROVACAO[s] ? `<span class="selo ${APROVACAO[s][0]}">${APROVACAO[s][1]}</span> ` : "");

async function telaEditor(id) {
  estado.anuncio = await api("/api/anuncios/" + id);
  estado.sujo = false;
  const a = estado.anuncio;
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
    <div class="linha"><span class="pequeno suave" id="estado-salvo" aria-live="polite">Salvo nos rascunhos</span>
      <button class="sec perigo-txt" id="b-excluir">${ic("lixo", "p")}Excluir</button><button class="sec" id="b-ia">${ic("varinha", "p")}Melhorar com IA</button>
      <button id="b-salvar" title="Salva o rascunho para continuar depois (Ctrl+S). Ele também é salvo sozinho enquanto você edita.">${ic("salvar", "p")}Salvar rascunho</button></div>
  </div>
  <div class="editor">
    <div class="pilha">
      <section class="cartao">
        <div class="linha entre" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">Fotos <span class="suave pequeno">(a primeira é a capa · mín. 500px, ideal 1200×1200)</span></h2>
          <button class="sec pequeno" id="b-baixar-fotos" title="Baixa todas as fotos num arquivo .zip">${ic("enviar", "p")}Baixar fotos</button></div>
        <div class="fotos" id="fotos"></div>
        <input type="file" id="arquivo" accept="image/jpeg,image/png,image/webp" multiple hidden>
      </section>
      <section class="cartao">
        <div class="campo"><label for="titulo">Título</label><input id="titulo" type="text" value="${h(a.titulo)}" maxlength="250"><div class="contador" id="contador"></div></div>
        <div class="grade g4">
          <div class="campo"><label for="estoque">Estoque</label><input id="estoque" type="number" min="0" value="${a.estoque ?? 1}"></div>
          <div class="campo"><label for="condicao">Condição</label><select id="condicao"><option value="new">Novo</option><option value="used" ${a.condicao === "used" ? "selected" : ""}>Usado</option></select></div>
          <div class="campo"><label for="sku">SKU</label><input id="sku" type="text" value="${h(a.sku)}"></div>
          <div class="campo"><label for="marca">Marca</label><input id="marca" type="text" value="${h(a.marca)}"></div>
          <div class="campo"><label for="modelo">Modelo</label><input id="modelo" type="text" value="${h(a.modelo)}"></div>
          <div class="campo campo-ean"><label for="gtin">EAN / GTIN (código de barras)</label><div class="linha" style="gap:6px;flex-wrap:nowrap">
            <input id="gtin" type="text" inputmode="numeric" maxlength="14" value="${h(a.gtin)}" placeholder="o da embalagem">
            <button type="button" class="sec pequeno" id="b-gerar-ean" title="Gera um código EAN-13">Gerar</button></div>
            <div class="pequeno" id="gtin-info"></div></div>
          <div class="campo"><label for="peso">Peso (kg)</label><input id="peso" type="number" step="0.001" min="0" value="${a.peso_kg ?? ""}"></div>
        </div>
        <div class="grade g3">
          ${["comprimento", "largura", "altura"].map((d) => `<div class="campo"><label for="d-${d}">${d[0].toUpperCase() + d.slice(1)} (cm)</label><input id="d-${d}" type="number" step="0.1" min="0" value="${a.dimensoes_cm?.[d] ?? ""}"></div>`).join("")}
        </div>
        <div class="campo"><label for="descricao">Descrição</label><textarea id="descricao">${h(a.descricao)}</textarea>
          <div class="contador"><span id="cont-desc"></span><span>Texto puro: HTML, links e emojis são removidos ao publicar.</span></div></div>
      </section>
      <section class="cartao" id="cartao-preco">
        <div class="linha entre" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">${ic("cifrao", "p")}Custo e preço de venda</h2><span class="pequeno suave" id="prec-status"></span></div>
        <p class="suave pequeno" style="margin:6px 0 12px">Tarifa e frete vêm do Mercado Livre pela categoria do anúncio; o imposto vem de Impostos. Mude o preço de venda até a margem ficar como você quer.</p>
        <div class="calc-grade">
          <div class="calc-bloco"><div class="calc-titulo">Preço e custo</div>
            <div class="campo"><label for="preco"><b>Preço de venda (R$)</b></label><input id="preco" type="number" step="0.01" min="0" value="${a.preco || ""}" style="font-weight:700"></div>
            <div class="campo"><label for="custo">Custo do produto (R$)</label><input id="custo" type="number" step="0.01" min="0" value="${a.custo ?? ""}" placeholder="quanto você paga"></div>
            <div class="campo"><label for="imposto">Imposto sobre a venda (%)</label><input id="imposto" type="number" step="0.01" min="0" max="100" value="${a.imposto_pct ?? ""}" placeholder="do Financeiro"></div>
            <div class="campo"><label for="embalagem">Embalagem (R$)</label><input id="embalagem" type="number" step="0.01" min="0" placeholder="do Financeiro"></div>
          </div>
          <div class="calc-bloco"><div class="calc-titulo">Tarifas do Mercado Livre</div>
            <div class="campo"><label for="calc-tipo">Tipo de anúncio</label><select id="calc-tipo">
              <option value="gold_special" ${(a.por_plataforma?.mercadolivre?.listing_type_id || "gold_special") === "gold_special" ? "selected" : ""}>Clássico</option>
              <option value="gold_pro" ${a.por_plataforma?.mercadolivre?.listing_type_id === "gold_pro" ? "selected" : ""}>Premium</option>
              <option value="custom">Porcentagem digitada</option></select></div>
            <div class="campo" id="calc-wrap-pct" hidden><label for="calc-pct">% da tarifa de venda</label><input id="calc-pct" type="number" step="0.01" min="0" max="100" placeholder="ex.: 16"></div>
            <div class="campo"><label>Tarifa de venda (R$)</label><div class="calc-fixo" id="calc-tarifa">—</div></div>
            <label class="linha pequeno" style="gap:8px;margin:4px 0 8px;font-weight:500"><input type="checkbox" id="calc-frete-check" checked style="width:auto"> Incluir custo de frete (sua parte)</label>
            <div class="campo" id="calc-wrap-frete"><label for="frete-manual">Frete, sua parte (R$)</label><input id="frete-manual" type="number" step="0.01" min="0" value="${a.por_plataforma?.mercadolivre?.frete_estimado ?? ""}" placeholder="automático"></div>
          </div>
        </div>
        <div id="precificacao" class="pequeno suave" style="margin-top:12px">Informe o custo e o preço de venda.</div>
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
      ${a.cliente_exige_aprovacao ? `<section class="cartao"><h2>${ic("aprovar", "p")}Aprovação do lojista</h2><div id="aprovacao"></div></section>` : ""}
      <section class="cartao"><div class="linha entre"><h2 style="margin:0">${ic("escudo", "p")}Risco e margem</h2>
        <button class="sec pequeno" id="b-risco">Avaliar</button></div><div id="risco-margem" class="pequeno suave" style="margin-top:10px">
        Confere foto e texto do concorrente, marca protegida e quanto sobra de cada venda.</div></section>
      <section class="cartao" id="cartao-radar" hidden><div class="linha entre"><h2 style="margin:0">${ic("alvo", "p")}Radar de preço</h2>
        <button class="sec pequeno" id="b-radar">Atualizar</button></div><div id="radar" class="pequeno" style="margin-top:10px"></div></section>
      <section class="cartao"><h2>${ic("relogio", "p")}Histórico de publicação</h2><div id="hist-pub" class="pequeno suave">Carregando…</div></section>
    </aside>
  </div>`;

  desenharFotos();
  desenharAtributos();
  desenharCfgPlataforma("mercadolivre");
  atualizarContadores();
  carregarHistPublicacao();
  desenharAprovacao();
  carregarRadarEditor();
  $("#b-risco").onclick = () => comBotao($("#b-risco"), avaliarRiscoMargem);
  ligarPrecificacao();
  $("#b-radar").onclick = () => comBotao($("#b-radar"), () => carregarRadarEditor(true));

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
  $("#b-salvar").onclick = () => comBotao($("#b-salvar"), async () => { await salvar(); toast("Rascunho salvo. Ele fica em Rascunhos para você terminar ou publicar em lote."); });
  ligarAutoSalvar(a.id);
  $("#b-excluir").onclick = async () => {
    if (!confirm("Excluir este rascunho? Anúncios já publicados nos marketplaces não são afetados.")) return;
    await api("/api/anuncios/" + a.id, { method: "DELETE" });
    estado.sujo = false;
    location.hash = "#/rascunhos";
  };
  $("#b-ia").onclick = () => comBotao($("#b-ia"), melhorarComIA);
  $("#b-baixar-fotos").onclick = () => comBotao($("#b-baixar-fotos"), async () => {
    if (!estado.anuncio.fotos.length) throw new Error("O rascunho não tem fotos.");
    if (estado.sujo) await salvar();
    const falharam = await baixarArquivo(`/api/anuncios/${estado.anuncio.id}/fotos.zip`, "fotos.zip");
    toast(falharam ? `Fotos baixadas. Não consegui baixar a(s) foto(s) ${falharam}.` : "Fotos baixadas.");
  });
  $("#b-gerar-ean").onclick = () => abrirGerarEan();
  $("#gtin").addEventListener("input", avisoGtin);
  avisoGtin();
  $("#b-checar").onclick = () => comBotao($("#b-checar"), checar);
  $("#b-publicar").onclick = () => comBotao($("#b-publicar"), publicar);
  $("#arquivo").onchange = (e) => enviarFotos([...e.target.files]);
}

function digitoEan(doze) {
  const soma = [...doze].reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (soma % 10)) % 10);
}
function gerarEan() {
  const corpo = "789" + Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b % 10).join("");
  return corpo + digitoEan(corpo);
}
function eanValido(codigo) {
  return /^\d{13}$/.test(codigo) && digitoEan(codigo.slice(0, 12)) === codigo[12];
}
function abrirGerarEan() {
  const campo = $("#gtin");
  const m = modal(`<h2>${ic("alerta", "p")}Gerar código EAN</h2>
    <div class="aviso amarelo"><b>Atenção:</b> o código gerado tem o formato certo, mas <b>não é registrado na GS1</b> em nome da sua empresa.
      O Mercado Livre confere o código de barras com o fabricante: anúncio com EAN que não pertence à marca pode ser recusado,
      pausado ou removido, e isso conta contra a conta.</div>
    <ul class="pequeno lista-dicas">
      <li><b>O produto tem código na embalagem?</b> Use sempre esse. É o mais seguro.</li>
      <li><b>Produto da sua marca?</b> O certo é ter os códigos registrados na GS1 Brasil.</li>
      <li><b>Produto sem código (artesanal, genérico)?</b> Deixe o campo vazio. Quando a categoria aceita, o Mercado Livre pede o motivo
        em <i>Ajustes por plataforma › Atributos obrigatórios</i> ("Produto sem código universal").</li>
    </ul>
    ${campo.value.trim() ? `<p class="pequeno suave">O campo já tem o código <b>${h(campo.value.trim())}</b>. Gerar vai substituí-lo.</p>` : ""}
    <div class="linha" style="justify-content:flex-end;margin-top:12px"><button type="button" class="sec" data-fechar>Cancelar</button>
      <button type="button" class="sec perigo-txt" id="ean-gerar">Gerar mesmo assim</button></div>`);
  $("#ean-gerar", m).onclick = () => {
    campo.value = gerarEan();
    estado.sujo = true;
    fecharModal();
    avisoGtin();
    $("#gtin-info").className = "pequeno aviso-texto";
    $("#gtin-info").textContent = "Código gerado (não registrado na GS1).";
  };
}

function avisoGtin() {
  const v = $("#gtin").value.trim(), info = $("#gtin-info");
  if (!info) return;
  info.className = "pequeno";
  if (!v) { info.textContent = ""; return; }
  if (/^\d{13}$/.test(v)) {
    info.classList.add(eanValido(v) ? "suave" : "negativo");
    info.textContent = eanValido(v) ? "EAN-13 com dígito verificador válido." : "Dígito verificador errado: confira o código.";
  } else if (!/^\d{8,14}$/.test(v)) {
    info.classList.add("negativo");
    info.textContent = "O GTIN tem 8, 12, 13 ou 14 números.";
  } else info.textContent = "";
}

async function baixarArquivo(caminho, nomePadrao) {
  const r = await fetch(caminho, { headers: { Authorization: "Bearer " + (localStorage.getItem("rpq_token") || ""),
    ...(estado.clienteId ? { "X-Cliente": String(estado.clienteId) } : {}) } });
  if (!r.ok) {
    let msg = `Erro ${r.status}`;
    try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || nomePadrao;
  const url = URL.createObjectURL(await r.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return r.headers.get("X-Fotos-Falharam");
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
        <button data-editar="${i}" title="Editar no editor de fotos" aria-label="Editar foto">${ic("lapis", "p")}</button>
        <button data-remover="${i}" title="Remover" aria-label="Remover foto">${ic("x", "p")}</button>
        <button data-mover="${i}" data-d="1" title="Mover para a direita" aria-label="Mover para a direita">${ic("direita", "p")}</button>
      </div></div>`).join("") +
    `<div class="adicionar" id="add-arquivo" tabindex="0" role="button">${ic("enviar")}Enviar fotos</div>
     <div class="adicionar" id="add-url" tabindex="0" role="button">${ic("contas")}Colar link</div>
     <div class="adicionar destaque" id="add-gerar" tabindex="0" role="button">${ic("brilho")}Gerar 5 fotos</div>
     <div class="adicionar" id="add-editar" tabindex="0" role="button">${ic("lapis")}Editor de fotos</div>`;
  $("#add-gerar").onclick = abrirGeradorFotos;
  $("#add-editar").onclick = () => abrirEditorFotos({ titulo: "Nova imagem para o anúncio", modos: ["nova"], aoSalvar: (url) => {
    estado.anuncio.fotos.push(url);
    estado.sujo = true;
    desenharFotos();
    toast("Imagem adicionada ao anúncio. Clique em Salvar para gravar.");
  } });
  $$("[data-editar]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.editar;
    abrirEditorFotos({ url: fotos[i], titulo: `Foto ${i + 1} do anúncio`, modos: ["substituir", "nova"], aoSalvar: (url, modo) => {
      if (modo === "substituir") fotos[i] = url; else fotos.splice(i + 1, 0, url);
      estado.sujo = true;
      desenharFotos();
      toast(modo === "substituir" ? "Foto atualizada. Clique em Salvar para gravar." : "Nova foto adicionada ao lado da original. Clique em Salvar para gravar.");
    } });
  }));
  $$(".fotos .adicionar").forEach((el) => (el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } }));
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
  if (!$("#attr-ml")) return;
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

function marcarSalvo(texto, erro = false) {
  const el = $("#estado-salvo");
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle("erro-texto", erro);
}

function ligarAutoSalvar(id) {
  clearInterval(estado._autoTimer);
  const tela = $("#tela");
  if (!tela.dataset.autoSalvar) {
    tela.dataset.autoSalvar = "1";
    const mexeu = () => {
      if (estado._rotaAtual !== "editor") return;
      estado._mexeu = Date.now();
      if (estado.sujo) marcarSalvo("Alterações ainda não salvas");
    };
    tela.addEventListener("input", mexeu);
    tela.addEventListener("click", () => setTimeout(mexeu, 0));
  }
  estado._autoTimer = setInterval(async () => {
    if (estado._rotaAtual !== "editor" || estado.anuncio?.id !== id) return clearInterval(estado._autoTimer);
    const editorFoto = $("#editor-foto");
    if (!estado.sujo || estado._salvando || Date.now() - (estado._mexeu || 0) < 5000 || !$("#modal").hidden
        || (editorFoto && !editorFoto.hidden)) return;
    try { await salvar(); } catch (e) { marcarSalvo("Não consegui salvar sozinho: " + e.message, true); }
  }, 2500);
}

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s" || estado._rotaAtual !== "editor") return;
  const editorFoto = $("#editor-foto");
  if (editorFoto && !editorFoto.hidden) return;
  e.preventDefault();
  $("#b-salvar")?.click();
});

async function salvar() {
  estado._salvando = true;
  marcarSalvo("Salvando…");
  try { await salvarAgora(); } finally { estado._salvando = false; }
  marcarSalvo("Rascunho salvo às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
}

function ligarPrecificacao() {
  let espera = null, vez = 0;
  const num = (id) => ($(id).value === "" ? null : Number($(id).value));
  const cfgML = () => (estado.anuncio.por_plataforma.mercadolivre ||= {});
  const calcular = async () => {
    const minha = ++vez;
    const dims = {};
    ["comprimento", "largura", "altura"].forEach((d) => { const v = num("#d-" + d); if (v) dims[d] = v; });
    const tipo = $("#calc-tipo").value;
    $("#calc-wrap-pct").hidden = tipo !== "custom";
    $("#calc-wrap-frete").hidden = !$("#calc-frete-check").checked;
    $("#prec-status").textContent = "calculando…";
    try {
      const r = await api(`/api/anuncios/${estado.anuncio.id}/precificacao`, { method: "POST", body: {
        preco: num("#preco") || 0, custo: num("#custo"), imposto_pct: num("#imposto"), embalagem: num("#embalagem"),
        frete: num("#frete-manual"), peso_kg: num("#peso"), dimensoes_cm: Object.keys(dims).length === 3 ? dims : null,
        tipo, comissao_pct: num("#calc-pct"), incluir_frete: $("#calc-frete-check").checked } });
      if (minha !== vez) return;
      $("#prec-status").textContent = "";
      const pctTxt = (v) => String(Math.round(v * 100) / 100).replace(".", ",") + "%";
      $("#calc-tipo").options[0].textContent = `Clássico (${pctTxt(r.tarifas_pct.gold_special)})`;
      $("#calc-tipo").options[1].textContent = `Premium (${pctTxt(r.tarifas_pct.gold_pro)})`;
      $("#imposto").placeholder = `${pctTxt(r.imposto_pct)} do Financeiro`;
      $("#embalagem").placeholder = r.embalagem ? `${brl(r.embalagem)} do Financeiro` : "0,00";
      $("#frete-manual").placeholder = r.frete_auto ? `automático: ${brl(r.frete_auto)}` : "automático";
      $("#calc-tarifa").textContent = r.atual ? `${brl(r.atual.tarifa)} · ${pctTxt(r.atual.tarifa_pct)}${r.atual.taxa_fixa ? ` + ${brl(r.atual.taxa_fixa)} fixa` : ""}` : "—";
      $("#precificacao").innerHTML = resultadoPrecificacao(r);
      $$("#precificacao [data-usar-preco]").forEach((b) => (b.onclick = () => {
        $("#preco").value = b.dataset.usarPreco;
        estado.sujo = true;
        agendar(0);
      }));
    } catch (e) {
      if (minha === vez) { $("#prec-status").textContent = ""; $("#precificacao").innerHTML = `<div class="aviso vermelho pequeno">${h(e.message)}</div>`; }
    }
  };
  const agendar = (ms = 300) => { clearTimeout(espera); espera = setTimeout(calcular, ms); };
  ["#preco", "#custo", "#imposto", "#embalagem", "#frete-manual", "#calc-pct", "#peso", "#d-comprimento", "#d-largura", "#d-altura"]
    .forEach((id) => $(id).addEventListener("input", () => agendar()));
  $("#calc-frete-check").addEventListener("change", () => agendar(0));
  $("#calc-tipo").addEventListener("change", () => {
    const tipo = $("#calc-tipo").value;
    if (tipo !== "custom") {
      cfgML().listing_type_id = tipo;
      const sel = $("#c-listing_type_id");
      if (sel) sel.value = tipo;
      estado.sujo = true;
    }
    agendar(0);
  });
  $("#frete-manual").addEventListener("input", () => {
    cfgML().frete_estimado = $("#frete-manual").value === "" ? null : Number($("#frete-manual").value);
  });
  agendar(0);
}

function resultadoPrecificacao(r) {
  const x = r.atual;
  const pct = (v) => String(Math.round((v || 0) * 100) / 100).replace(".", ",") + "%";
  const precos = r.alvos.map((a) => `<div class="calc-ref ${x && x.custo != null && Math.abs(x.margem_pct - a.margem) < 2.5 ? "ativa" : ""}">
      <span>${a.margem}% de margem</span><span>${a.preco ? `<b>${brl(a.preco)}</b> <button type="button" class="sec pequeno" data-usar-preco="${a.preco}">Usar</button>` : r.sem_custo ? "informe o custo" : "<b>Inviável</b>"}</span></div>`).join("");
  const referencia = `<div class="calc-bloco" style="margin-top:12px"><div class="calc-titulo">Preços mínimos por margem desejada</div>
    ${x && x.custo != null ? `<div class="calc-ref"><span>Preço atual: ${brl(x.preco)}</span><b class="${corMargem(x.margem_pct)}">${pct(x.margem_pct)}</b></div>` : ""}${precos}</div>`;
  if (!x) return `<div class="aviso azul pequeno">Informe o preço de venda.</div>${referencia}`;
  if (x.custo == null) return `<div class="aviso azul pequeno">Informe o custo do produto para ver o lucro e a margem.</div>${referencia}`;
  const m = x.margem_pct;
  const [classe, titulo, texto] = m >= 15 ? ["verde", "Margem boa", `Você tem ${brl(x.lucro)} de lucro por venda. Produto bem precificado.`]
    : m >= 5 ? ["amarelo", "Margem baixa", `Lucro de ${brl(x.lucro)} por venda. Considere ajustar o preço ou reduzir custos.`]
    : m >= 0 ? ["amarelo", "Margem muito baixa", `Apenas ${brl(x.lucro)} de lucro por venda. Alto risco de prejuízo com devoluções ou variação de custo.`]
    : ["vermelho", "Vendendo no prejuízo", `Perda de ${brl(-x.lucro)} por venda. Ajuste o preço ou o custo.`];
  const partes = [["custo", "Custo do produto", x.custo], ["tarifa", "Tarifa ML", x.tarifa], ["frete", "Frete", x.frete],
    ["imposto", "Imposto", x.imposto], ["embalagem", "Embalagem", x.embalagem], ["lucro", "Lucro", Math.max(0, x.lucro)]].filter(([, , v]) => v > 0);
  const linha = (rot, v, extra = "") => `<div class="calc-linha"><span>${rot}${extra ? ` <small class="suave">${extra}</small>` : ""}</span><b>${v}</b></div>`;
  return `<div class="aviso ${classe}"><b>${titulo}: ${pct(m)}</b><br>${texto}</div>
    <div class="grade g3 calc-metricas">
      <div class="calc-metrica"><div class="pequeno suave">Você recebe (ML)</div><div class="valor">${brl(x.recebe)}</div></div>
      <div class="calc-metrica"><div class="pequeno suave">Lucro líquido</div><div class="valor ${x.lucro < 0 ? "negativo" : "positivo"}">${brl(x.lucro)}</div></div>
      <div class="calc-metrica"><div class="pequeno suave">Margem</div><div class="valor ${corMargem(m)}">${pct(m)}</div></div>
    </div>
    <div class="calc-barra">${partes.map(([k, , v]) => `<i class="seg-${k}" style="flex:${v}"></i>`).join("")}</div>
    <div class="calc-legenda">${partes.map(([k, n, v]) => `<span><i class="seg-${k}"></i>${n} (${pct(v / x.preco * 100)})</span>`).join("")}</div>
    <div class="calc-detalhe">
      ${linha("Preço de venda", brl(x.preco))}
      ${linha("Custo do produto", "− " + brl(x.custo))}
      ${linha("Tarifa ML", "− " + brl(x.tarifa), pct(x.tarifa_pct) + (x.taxa_fixa ? ` + ${brl(x.taxa_fixa)} fixa` : ""))}
      ${$("#calc-frete-check")?.checked === false ? "" : linha("Frete (sua parte)", x.frete ? "− " + brl(x.frete) : brl(0))}
      ${linha("Imposto", r.imposto_pct ? "− " + brl(x.imposto) : "Isento", r.imposto_pct ? pct(r.imposto_pct) : "")}
      ${x.embalagem ? linha("Embalagem", "− " + brl(x.embalagem)) : ""}
      <div class="calc-linha total"><span><b>Lucro líquido</b></span><b class="${x.lucro < 0 ? "negativo" : "positivo"}">${brl(x.lucro)}</b></div>
    </div>
    ${referencia}
    <div class="pequeno suave" style="margin-top:8px">Tarifa: ${h(x.fonte_tarifa)} · Frete: ${h(x.fonte_frete)}<br>Imposto: ${h(r.fonte_imposto)}${r.categoria ? "" : " · <b>Escolha a categoria do ML</b> em Ajustes por plataforma para a tarifa exata."}</div>`;
}

const corMargem = (m) => (m == null ? "" : m >= 15 ? "positivo" : m >= 5 ? "laranja" : "negativo");

async function salvarAgora() {
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
      custo: num("#custo"), imposto_pct: num("#imposto"),
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
  const [contas, chk, risco, margem] = await Promise.all([
    api("/api/contas", { headers: { "X-Cliente": String(a.cliente_id) } }),
    api(`/api/anuncios/${a.id}/checar`, { method: "POST", body: { plataformas: plats } }),
    api(`/api/anuncios/${a.id}/risco`).catch(() => null),
    api(`/api/anuncios/${a.id}/margem`, { method: "POST", body: { plataformas: plats } }).catch(() => null),
  ]);
  const real = Object.fromEntries(contas.map((c) => [c.plataforma, c]));
  const m = modal(`<h2>Publicar “${h(a.titulo)}”</h2>
    <div class="aviso azul" style="font-size:.95rem">${ic("loja", "p")} Cliente: <b>${h(a.cliente_nome)}</b></div>
    <p>Preço ${brl(a.preco)} · estoque ${a.estoque} · ${a.fotos.length} foto(s)</p>
    ${plats.map((p) => `<div class="aviso ${real[p].publicacao_real ? "azul" : "amarelo"}">${selo(p)} ${real[p].publicacao_real
      ? `Será publicado <b>de verdade</b> na conta <b>${h(real[p].apelido || real[p].id_externo)}</b> e ficará visível para compradores.`
      : "Modo demonstração (" + h(real[p].motivo_publicacao) + "): nada será enviado."}</div>`).join("")}
    ${risco ? htmlRisco(risco, true) : ""}
    ${margem ? htmlMargem(margem, true) : ""}
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

const ABAS_PUB = [["active", "Ativos"], ["paused", "Pausados"], ["under_review", "Em revisão"], ["closed", "Finalizados"], ["todos", "Todos"]];
const estadoPub = { aba: "active", busca: "" };

const GERENCIAVEIS = ["mercadolivre", "shopee"];

function grupoDaSituacao(p, s) {
  if (!GERENCIAVEIS.includes(p.plataforma)) return "active";
  if (!s || !s.status) return "sem_situacao";
  if (s.status === "inactive") return "paused";
  if (s.status === "deleted") return "closed";
  return s.status;
}

async function telaPublicacoes() {
  const todas = await api("/api/publicacoes");
  const equipe = eEquipe();
  const lista = todas.filter((p) => p.sucesso);
  const falhas = new Set(todas.filter((p) => !p.sucesso && !lista.some((x) => x.anuncio_id === p.anuncio_id && x.plataforma === p.plataforma))
    .map((p) => p.anuncio_id)).size;
  $("#tela").innerHTML = `<div class="topo"><div><h1>${eTime() ? "Publicações" : "Meus anúncios"}</h1>
    <div class="suave">Os anúncios no ar de <b>${h(clienteAtual()?.nome)}</b> no Mercado Livre e na Shopee, com a situação de agora.
      O que falhou na publicação não aparece aqui: fica em Rascunhos para corrigir.</div></div>
    <button class="sec" id="pub-recarregar">${ic("relogio", "p")}Atualizar</button></div>
  ${falhas ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>${falhas} rascunho(s) com falha na publicação.</b>
    ${equipe ? `<a href="#/rascunhos/erro">Ver e corrigir em Rascunhos › Com erro</a>.` : "A equipe já foi avisada pelo sistema."}</div>` : ""}
  <div id="pub-corpo">${lista.length ? `<div class="carregando"><span class="girando"></span> Consultando a situação nos marketplaces…</div>`
    : `<div class="cartao">${vazio("publicar", "Nenhum anúncio publicado ainda", equipe ? `Publique pelos <a href="#/rascunhos">Rascunhos</a>, um a um ou em lote.` : "")}</div>`}</div>`;
  $("#pub-recarregar").onclick = () => comBotao($("#pub-recarregar"), telaPublicacoes);
  if (!lista.length) return;
  let mapa = {};
  if (lista.some((p) => GERENCIAVEIS.includes(p.plataforma))) {
    try { mapa = await api("/api/publicacoes/situacao"); } catch (e) { toast("Não consegui consultar a situação: " + e.message, true); }
  }
  if (estado._rotaAtual !== "publicacoes") return;
  desenharPublicacoes(lista, mapa, equipe);
}

function desenharPublicacoes(lista, mapa, equipe) {
  lista = lista.filter((p) => !mapa[p.id]?.removida);
  const grupo = (p) => grupoDaSituacao(p, mapa[p.id]);
  const conta = (k) => lista.filter((p) => k === "todos" || grupo(p) === k).length;
  const termo = estadoPub.busca.trim().toLowerCase();
  const itens = lista.filter((p) => (estadoPub.aba === "todos" || grupo(p) === estadoPub.aba)
    && (!termo || `${p.titulo} ${p.id_externo} ${p.sku}`.toLowerCase().includes(termo)));
  const outras = Object.values(mapa).filter((s) => s.outra_conta).length;
  const semSituacao = conta("sem_situacao");
  $("#pub-corpo").innerHTML = `
    ${outras ? `<div class="aviso amarelo linha entre" style="gap:10px">${ic("alerta", "p")}<span style="flex:1"><b>${outras} anúncio(s) foram publicados por outra conta</b>,
      não pela que está conectada agora, então não dá para ver se ainda existem. Se você já apagou esses anúncios no marketplace, tire-os da lista.
      Para pausar ou excluir pelo Replique, reconecte em <a href="#/contas">Contas</a> a conta que publicou.</span>
      ${equipe ? `<button class="sec pequeno" id="tirar-outras">Remover da lista os ${outras}</button>` : ""}</div>` : ""}
    <div class="abas">${ABAS_PUB.map(([k, n]) => `<button data-aba-pub="${k}" class="${estadoPub.aba === k ? "ativa" : ""}">${n} (${conta(k)})</button>`).join("")}
      ${semSituacao ? `<button data-aba-pub="sem_situacao" class="${estadoPub.aba === "sem_situacao" ? "ativa" : ""}">Sem situação (${semSituacao})</button>` : ""}</div>
    <div class="cartao">
      <input type="search" id="pub-busca" placeholder="Buscar por título, código do anúncio ou SKU…" value="${h(estadoPub.busca)}" style="max-width:360px;margin-bottom:6px">
      ${itens.length ? itens.map((p) => {
        const s = mapa[p.id] || {};
        const [cor, rotulo] = SITUACAO_PUB[s.status] || ["neutro", GERENCIAVEIS.includes(p.plataforma) ? "sem situação" : "enviado"];
        const acoes = equipe && s.acoes?.length ? Object.keys(ACAO_PUB).filter((a) => s.acoes.includes(a)) : [];
        const link = urlSegura(s.link || p.link);
        return `<div class="pub-item" data-pub="${p.id}">
          ${urlSegura(p.foto) ? `<img src="${h(p.foto)}" alt="" referrerpolicy="no-referrer">` : semFoto()}
          <div class="info">
            <a ${equipe ? `href="#/editor/${p.anuncio_id}"` : `href="#" data-ver="${p.anuncio_id}"`} class="titulo-pub">${h(p.titulo || "(sem título)")}</a>
            <div class="pequeno suave">${selo(p.plataforma)} ${p.id_externo ? h(p.id_externo) : ""}${p.sku ? ` · SKU ${h(p.sku)}` : ""}
              ${p.conta_apelido ? ` · conta ${h(p.conta_apelido)}` : ""} · publicado ${data(p.criada_em)} por ${h(p.operador || "—")}</div>
            <div class="linha" style="gap:6px;margin-top:4px">
              ${s.tipo ? `<span class="selo neutro">${h(s.tipo)}</span>` : ""}${s.full ? '<span class="selo ok">Full</span>' : ""}
              ${s.frete_gratis ? '<span class="selo neutro">frete grátis</span>' : ""}${s.catalogo ? '<span class="selo neutro">catálogo</span>' : ""}
              ${p.demo || s.simulado ? '<span class="selo demo">simulado</span>' : ""}</div>
            ${s.sub_status?.length ? `<div class="pequeno aviso-texto">${h(s.sub_status.join(", "))}</div>` : ""}
            ${s.aviso && !s.outra_conta ? `<div class="pequeno suave">${h(s.aviso)}</div>` : ""}
          </div>
          <div class="pub-num"><b>${brl(s.preco ?? p.preco)}</b><span class="pequeno suave">${s.estoque != null ? `${numero(s.estoque)} em estoque` : ""}</span>
            <span class="pequeno suave">${s.vendidos != null ? `${numero(s.vendidos)} vendido(s)` : ""}</span></div>
          <div class="pub-acoes">
            <span class="selo ${cor}">${rotulo}</span>${s.outra_conta ? ` <span class="selo demo" title="${h(s.aviso)}">outra conta</span>` : ""}
            <div class="acoes-linha" style="margin-top:6px">
              ${equipe && s.edita_preco ? `<button class="sec pequeno" data-preco="${p.id}" title="Mudar preço e estoque direto no marketplace">Preço e estoque</button>` : ""}
              ${acoes.map((a) => `<button class="sec pequeno ${a === "excluir" || a === "finalizar" ? "perigo-txt" : ""}" data-acao="${a}" title="${ACAO_PUB[a][1]}">${ic(ACAO_PUB[a][0], "p")}${ACAO_PUB[a][1]}</button>`).join("")}
              ${equipe && (s.outra_conta || !s.status || ["closed", "deleted"].includes(s.status)) ? `<button class="sec pequeno" data-tirar="${p.id}" title="Some com este anúncio da lista. Não mexe no marketplace.">Remover da lista</button>` : ""}
              ${link ? `<a class="botao sec pequeno icone-so" href="${h(link)}" target="_blank" rel="noopener" title="Abrir no marketplace" aria-label="Abrir no marketplace">${ic("externo", "p")}</a>` : ""}
            </div></div></div>`;
      }).join("") : vazio("publicar", "Nenhum anúncio nesta aba")}</div>`;
  $$("[data-aba-pub]").forEach((b) => (b.onclick = () => { estadoPub.aba = b.dataset.abaPub; desenharPublicacoes(lista, mapa, equipe); }));
  const busca = $("#pub-busca");
  busca.oninput = () => {
    estadoPub.busca = busca.value;
    clearTimeout(desenharPublicacoes._t);
    desenharPublicacoes._t = setTimeout(() => { desenharPublicacoes(lista, mapa, equipe); const c = $("#pub-busca"); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }, 250);
  };
  $$("[data-ver]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); verAnuncio(+b.dataset.ver); }));
  const tirar = async (ids) => { for (const id of ids) await api(`/api/publicacoes/${id}/tirar-da-lista`, { method: "POST" }); };
  $$("[data-tirar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Tirar este anúncio da lista? Nada é alterado no marketplace, e o rascunho volta para Em preparo se não tiver outro anúncio no ar.")) return;
    comBotao(b, async () => { await tirar([+b.dataset.tirar]); toast("Removido da lista."); await telaPublicacoes(); });
  }));
  const todasOutras = $("#tirar-outras");
  if (todasOutras) todasOutras.onclick = () => {
    const ids = lista.filter((p) => mapa[p.id]?.outra_conta).map((p) => p.id);
    if (!confirm(`Tirar ${ids.length} anúncio(s) de outra conta da lista? Nada é alterado no marketplace.`)) return;
    comBotao(todasOutras, async () => { await tirar(ids); toast(`${ids.length} anúncio(s) removidos da lista.`); await telaPublicacoes(); });
  };
  $$("[data-preco]").forEach((b) => (b.onclick = () => {
    const p = lista.find((x) => x.id === +b.dataset.preco), s = mapa[p.id] || {};
    const m = modal(`<h2>Preço e estoque</h2>
      <p>${selo(p.plataforma)} ${h(p.titulo || p.id_externo)}</p>
      ${s.variacoes ? `<div class="aviso amarelo pequeno">Este anúncio tem variações. Preço e estoque de variações são alterados no próprio marketplace.</div>` : ""}
      <div class="grade g2">
        <div class="campo"><label for="pe-preco">Preço (R$)</label><input id="pe-preco" type="number" min="0.01" step="0.01" value="${s.preco ?? p.preco ?? ""}"></div>
        <div class="campo"><label for="pe-estoque">Estoque</label><input id="pe-estoque" type="number" min="0" step="1" value="${s.estoque ?? ""}"></div>
      </div>
      <p class="pequeno suave">A mudança vale na hora para os compradores${p.demo || s.simulado ? " (este anúncio é simulado: nada é enviado)" : ""}.</p>
      <div class="linha" style="justify-content:flex-end"><button class="sec" data-fechar>Cancelar</button><button id="pe-salvar">Salvar no marketplace</button></div>`);
    $("#pe-salvar", m).onclick = () => comBotao($("#pe-salvar", m), async () => {
      const lido = (id) => { const v = $(id, m).value.trim(); return v === "" ? null : Number(v); };
      const corpo = { preco: lido("#pe-preco"), estoque: lido("#pe-estoque") };
      if (corpo.preco === (s.preco ?? p.preco ?? null)) corpo.preco = null;
      if (corpo.estoque === (s.estoque ?? null)) corpo.estoque = null;
      if (corpo.preco === null && corpo.estoque === null) return toast("Nada mudou.", true);
      const r = await api(`/api/publicacoes/${p.id}/preco-estoque`, { method: "POST", body: corpo });
      fecharModal();
      toast(`${r.simulado ? "Simulado: " : ""}preço e estoque atualizados.`);
      await telaPublicacoes();
    });
  }));
  $$(".pub-item [data-acao]").forEach((b) => (b.onclick = () => {
    const acao = b.dataset.acao, id = b.closest(".pub-item").dataset.pub;
    if (CONFIRMA_ACAO[acao] && !confirm(CONFIRMA_ACAO[acao])) return;
    comBotao(b, async () => {
      const r = await api(`/api/publicacoes/${id}/acao`, { method: "POST", body: { acao } });
      toast(`${r.simulado ? "Simulado: " : ""}anúncio ${SITUACAO_PUB[r.status]?.[1] || r.status}.`);
      await telaPublicacoes();
    });
  }));
}

const dataCurta = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

async function telaFull() {
  $("#tela").innerHTML = `<div class="topo"><div><h1>Estoque Full</h1>
    <div class="suave">Unidades de <b>${h(clienteAtual()?.nome)}</b> nos centros do Mercado Livre, com o custo parado e aviso do que vai
      gerar custo de armazenamento até o fim do mês que vem.</div></div>
    <div class="linha">${eEquipe() || estado.usuario.papel === "cliente" ? `<button class="sec" id="full-config">${ic("ajustes", "p")}Custos do Full</button>` : ""}
      <button class="sec" id="full-recarregar">${ic("relogio", "p")}Atualizar</button></div></div>
  <div id="full-corpo"><div class="carregando"><span class="girando"></span> Lendo o estoque no Full e as entradas dos últimos 12 meses…</div></div>`;
  let d;
  try { d = await api("/api/financeiro/estoque-full"); }
  catch (e) { $("#full-corpo").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  if (estado._rotaAtual !== "full") return;
  $("#full-recarregar").onclick = () => comBotao($("#full-recarregar"), telaFull);
  const cfg = $("#full-config");
  if (cfg) cfg.onclick = () => configurarFull(d);
  const t = d.totais;
  const filtro = estado.filtroFull || "todos";
  const itens = d.itens.filter((x) => filtro === "todos" || (filtro === "alerta" ? x.alertas.length : x.nivel === "ok"));
  $("#full-corpo").innerHTML = `
    ${d.demo ? `<div class="aviso amarelo">${h(d.aviso)} Os números abaixo são de demonstração.</div>` : ""}
    ${!d.tem_vendas && !d.demo ? `<div class="aviso azul pequeno">Sincronize as vendas em <a href="#/lucro">Vendas e lucro</a> para o Replique saber o ritmo de venda
      de cada anúncio. Sem isso a projeção supõe que nada vai vender.</div>` : ""}
    <div class="grade g4 kpis" style="margin-bottom:16px">
      <div class="cartao kpi"><div class="rotulo">No Full agora</div><div class="valor">${numero(t.unidades)} un.</div>
        <div class="pequeno suave">${numero(t.anuncios)} anúncio(s)</div></div>
      <div class="cartao kpi"><div class="rotulo">Dinheiro parado no Full</div><div class="valor">${brl(t.valor_parado)}</div>
        <div class="pequeno suave">${t.sem_custo ? `${t.sem_custo} sem custo cadastrado · <a href="#/produtos">cadastrar</a>` : "pelo custo dos produtos"}</div></div>
      <div class="cartao kpi ${t.acima_limite ? "alerta" : ""}"><div class="rotulo">Vão passar de ${d.limite_dias} dias até ${dataCurta(d.ate)}</div>
        <div class="valor ${t.acima_limite ? "negativo" : ""}">${numero(t.acima_limite)} un.</div>
        <div class="pequeno suave">armazenamento prolongado custa mais</div></div>
      <div class="cartao kpi"><div class="rotulo">Armazenagem até ${dataCurta(d.ate)}</div>
        <div class="valor">${t.armazenagem_estimada != null ? brl(t.armazenagem_estimada) : "—"}</div>
        <div class="pequeno suave">${d.custo_unidade_mes ? `estimativa a ${brl(d.custo_unidade_mes)} por unidade ao mês` : `<a href="#" id="full-config-2">informe o custo por unidade</a> para estimar`}</div></div>
    </div>
    <div class="segmentos" style="margin-bottom:12px">${[["todos", `Todos (${d.itens.length})`], ["alerta", `Com aviso (${t.com_alerta})`], ["ok", "Sem aviso"]].map(([v, n]) =>
      `<button type="button" data-filtro-full="${v}" class="${filtro === v ? "ativa" : ""}">${n}</button>`).join("")}</div>
    <div class="cartao">${itens.length ? `<div class="tabela"><table class="tabela-full"><thead><tr><th>Anúncio</th><th class="num">No Full</th>
      <th class="num" title="Média dos últimos 30 dias">Vende/dia</th><th class="num">Dura</th><th>Mais antiga</th><th class="num">Custo parado</th>
      <th class="num" title="Unidades que ainda vão estar no Full no fim do mês que vem, no ritmo atual">Sobra em ${dataCurta(d.ate)}</th></tr></thead><tbody>
      ${itens.map((x) => `<tr class="nivel-${x.nivel}"><td><div class="linha" style="gap:10px;flex-wrap:nowrap">
          ${urlSegura(x.foto) ? `<img src="${h(x.foto)}" alt="" width="40" height="40" class="mini-foto" referrerpolicy="no-referrer">` : ""}
          <div style="min-width:0"><b class="corta">${urlSegura(x.link) ? `<a href="${h(x.link)}" target="_blank" rel="noopener">${h(x.titulo)}</a>` : h(x.titulo)}</b>
          <div class="pequeno suave">${h(x.item_id)}${x.variacao ? ` · ${h(x.variacao)}` : ""}${x.sku ? ` · SKU ${h(x.sku)}` : ""}</div>
          ${x.alertas.map((a) => `<div class="pequeno ${x.nivel === "vermelho" ? "erro-texto" : "aviso-texto"}">${ic("alerta", "p")} ${h(a)}</div>`).join("")}</div></div></td>
        <td class="num"><b>${x.erro ? "—" : numero(x.total)}</b>${x.indisponivel ? `<div class="pequeno suave">${numero(x.indisponivel)} indisp.</div>` : ""}</td>
        <td class="num">${x.vendas_dia ? String(x.vendas_dia).replace(".", ",") : "0"}</td>
        <td class="num">${x.cobertura_dias != null ? `${numero(x.cobertura_dias)} dias` : x.total ? "sem venda" : "—"}</td>
        <td>${x.entrada_mais_antiga ? `${dataCurta(x.entrada_mais_antiga)}<div class="pequeno suave">${numero(x.idade_dias)} dias</div>` : x.total ? '<span class="pequeno suave">há mais de 12 meses</span>' : "—"}</td>
        <td class="num">${x.valor_parado != null ? brl(x.valor_parado) : '<span class="pequeno suave">sem custo</span>'}</td>
        <td class="num">${numero(x.projecao.restantes)}${x.projecao.acima_limite ? `<div class="pequeno negativo">${numero(x.projecao.acima_limite)} acima de ${d.limite_dias} dias</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("caixa", d.itens.length ? "Nada nesta seleção" : "Nenhum anúncio no Full", d.itens.length ? "" : "Quando a conta tiver anúncios no Full, eles aparecem aqui.")}</div>
    <p class="pequeno suave">A idade vem das entradas no Full dos últimos 12 meses (o ML despacha primeiro as unidades mais antigas). A projeção usa a média de vendas
      dos últimos 30 dias. O Mercado Livre não informa a tarifa de armazenagem pela API: confira o valor por unidade na fatura do Full e ajuste em <b>Custos do Full</b>.</p>`;
  $$("[data-filtro-full]").forEach((b) => (b.onclick = () => { estado.filtroFull = b.dataset.filtroFull; telaFull(); }));
  const cfg2 = $("#full-config-2");
  if (cfg2) cfg2.onclick = (e) => { e.preventDefault(); configurarFull(d); };
}

function configurarFull(d) {
  const m = modal(`<h2>${ic("ajustes", "p")}Custos do Full</h2>
    <p class="pequeno suave" style="margin-top:-6px">Usados só para a estimativa e os avisos desta tela.</p>
    <div class="grade g2">
      <div><label for="cf-custo">Armazenagem por unidade ao mês (R$)</label><input id="cf-custo" type="number" step="0.01" min="0" value="${d.custo_unidade_mes || ""}" placeholder="ex.: 0,90">
        <div class="pequeno suave">Média da fatura do Full: total de armazenagem ÷ unidades.</div></div>
      <div><label for="cf-dias">Avisar quando passar de (dias no Full)</label><input id="cf-dias" type="number" min="30" max="720" value="${d.limite_dias}">
        <div class="pequeno suave">Prazo a partir do qual o ML cobra armazenamento prolongado.</div></div></div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button><button id="cf-salvar">Salvar</button></div>`);
  $("#cf-salvar", m).onclick = () => comBotao($("#cf-salvar", m), async () => {
    await api("/api/financeiro/estoque-full/config", { method: "PUT", body: { custo_unidade_mes: +$("#cf-custo", m).value || 0, dias_prolongado: +$("#cf-dias", m).value || 180 } });
    fecharModal();
    toast("Custos do Full salvos.");
    telaFull();
  });
}

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
      <ol class="pequeno"><li>Clique em <b>Autorizar loja</b> e entre com a conta de vendedor <b>de ${h(cliente?.nome)}</b>.</li>
        <li>Ao confirmar, a Shopee devolve você ao Replique e a loja já fica conectada.</li>
        <li>Se cair numa página que só mostra <code>code=</code> e <code>shop_id=</code>, copie a URL inteira, cole abaixo e conecte.</li></ol>
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
  acao("#sp-conectar", "/api/contas/shopee/conectar", () => ({ texto: $("#sp-code").value }),
    (r) => `Shopee (${r.apelido}) conectada a ${r.cliente}.`);
  acao("#az-conectar", "/api/contas/amazon/conectar", () => ({ refresh_token: $("#az-rt").value, seller_id: $("#az-seller").value }), "Amazon salva!");
  $$("[data-desc]").forEach((b) => (b.onclick = async () => {
    if (!confirm(`Desconectar ${PLAT[b.dataset.desc].nome} de ${cliente?.nome}? Os anúncios já publicados continuam no ar.`)) return;
    await api("/api/contas/" + b.dataset.desc, { method: "DELETE" });
    carregarClientesInfo();
    telaContas();
  }));
}

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
      <div class="linha entre"><h2 style="margin:0">${ic("atividade", "p")}Atividades</h2>
        <div class="linha" style="gap:8px">
          <select id="f-acao" aria-label="Tipo de atividade" style="width:auto"><option value="">Todas</option>
            ${Object.entries(ROTULO_ACAO).filter(([k]) => !ehCliente || !["pesquisa", "cliente", "usuario", "tarefa_interna", "reuniao"].includes(k))
              .map(([k, r]) => `<option value="${k}">${r}</option>`).join("")}</select>
          <button type="button" class="sec pequeno" id="alternar-feed" aria-controls="feed-caixa"></button></div></div>
      <div id="feed-caixa" class="rolagem-y" style="margin-top:12px">
        <div id="feed" class="feed"></div>
        <div class="linha" style="justify-content:center"><button class="sec pequeno" id="mais-feed" hidden>Carregar mais</button></div>
      </div>
    </section>`;
  $$("[data-trabalhar]").forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const id = +a.dataset.trabalhar;
    if (estado.usuario.clientes.some((c) => c.id === id && c.ativo)) { trocarCliente(id, { navegar: false }); location.hash = "#/rascunhos"; }
  }));
  const mostrarFeed = (aberto) => {
    $("#feed-caixa").hidden = !aberto;
    $("#f-acao").hidden = !aberto;
    $("#alternar-feed").textContent = aberto ? "Ocultar" : "Mostrar";
    $("#alternar-feed").setAttribute("aria-expanded", String(aberto));
    try { localStorage.setItem("rpq_feed_aberto", aberto ? "1" : "0"); } catch {}
  };
  let feedAberto = false;
  try { feedAberto = localStorage.getItem("rpq_feed_aberto") === "1"; } catch {}
  mostrarFeed(feedAberto);
  $("#alternar-feed").onclick = () => mostrarFeed($("#feed-caixa").hidden);
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
      <label class="confirmacao" style="grid-column:1/-1;margin:0"><input type="checkbox" id="gc-aprovacao" ${c.exige_aprovacao ? "checked" : ""}>
        O lojista aprova cada anúncio antes da publicação</label>
      <div class="linha" style="grid-column:1/-1;justify-content:flex-end"><button type="submit" class="sec pequeno">${ic("salvar", "p")}Salvar dados</button></div>
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
  $("#f-dados", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-dados button", m), async () => {
      await api("/api/clientes/" + id, { method: "PATCH", body: { ...Object.fromEntries(new FormData(e.target)),
        exige_aprovacao: $("#gc-aprovacao", m).checked } });
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
            <button class="sec pequeno" data-senha="${x.id}">Senha</button>
            <button class="sec pequeno" data-ativar="${x.id}" data-ativo="${x.ativo ? 1 : 0}">${x.ativo ? "Desativar" : "Reativar"}</button>`}</td></tr>`).join("")}
      </tbody></table></div></section>
    <section class="cartao" id="sec-ferramentas"><h2>${ic("ajustes", "p")}Ferramentas de cada função</h2>
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
    <section class="cartao"><h2>${ic("varinha", "p")}Inteligência artificial</h2>${u.ia_disponivel
      ? '<div class="aviso verde">IA ativa: o botão “Melhorar com IA” reescreve título e descrição com Claude.</div>'
      : '<div class="aviso amarelo">IA desativada. O administrador do servidor precisa configurar <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code>. Sem ela, o Replique usa regras automáticas de título e descrição.</div>'}</section>
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
  $$("[data-senha]").forEach((b) => (b.onclick = () => {
    const senha = prompt("Nova senha (mínimo 8 caracteres):");
    if (!senha) return;
    comBotao(b, async () => {
      await api("/api/empresa/usuarios/" + b.dataset.senha, { method: "PATCH", body: { senha } });
      toast("Senha redefinida.");
    });
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

function desenharAprovacao() {
  const alvo = $("#aprovacao");
  if (!alvo) return;
  const a = estado.anuncio;
  const textos = {
    "": "Este cliente aprova cada anúncio antes da publicação. Quando o rascunho estiver pronto, peça a aprovação.",
    pendente: "Aguardando o lojista. Ele vê o anúncio pelo login da loja e aprova ou pede ajustes.",
    aprovado: `Aprovado em ${data(a.aprovacao_em)}. Se mudar título, fotos, preço ou descrição, será preciso aprovar de novo.`,
    recusado: "O lojista pediu ajustes. Corrija e peça a aprovação de novo.",
  };
  alvo.innerHTML = `${seloAprovacao(a.aprovacao)}<p class="pequeno suave" style="margin:6px 0 10px">${textos[a.aprovacao || ""]}</p>
    ${a.aprovacao === "recusado" && a.aprovacao_nota ? `<div class="aviso vermelho">“${h(a.aprovacao_nota)}”</div>` : ""}
    ${a.aprovacao !== "aprovado" ? `<button class="sec pequeno" id="b-pedir-aprovacao">${ic("aprovar", "p")}${a.aprovacao === "pendente" ? "Pedir de novo" : "Pedir aprovação"}</button>` : ""}`;
  const b = $("#b-pedir-aprovacao");
  if (b) b.onclick = () => comBotao(b, async () => {
    await salvar();
    await api(`/api/anuncios/${a.id}/aprovacao/solicitar`, { method: "POST" });
    estado.anuncio = await api("/api/anuncios/" + a.id);
    desenharAprovacao();
    toast("Pedido enviado. O lojista vê o anúncio em Anúncios, pelo login da loja.");
  });
}

const NIVEL_RISCO = { baixo: ["verde", "Risco baixo"], medio: ["amarelo", "Risco médio"], alto: ["vermelho", "Risco alto"] };

function htmlRisco(r, compacto = false) {
  const [cor, rotulo] = NIVEL_RISCO[r.nivel] || NIVEL_RISCO.baixo;
  const motivos = compacto ? r.motivos.slice(0, 3) : r.motivos;
  return `<div class="risco ${cor}">
    <div class="linha entre"><b>${rotulo}</b><span class="risco-nota">${r.nota}<small>/100</small></span></div>
    <div class="medidor"><i style="width:${Math.max(3, r.nota)}%"></i></div>
    ${motivos.length ? `<ul class="motivos">${motivos.map((m) => `<li><span class="pts">+${m.pontos}</span>${h(m.texto)}</li>`).join("")}</ul>`
      : `<p class="pequeno" style="margin:8px 0 0">Nenhum sinal de risco encontrado.</p>`}
    ${compacto && r.motivos.length > 3 ? `<p class="pequeno suave" style="margin:4px 0 0">+ ${r.motivos.length - 3} motivo(s): veja em Risco e margem.</p>` : ""}
  </div>`;
}

const ALERTA_MARGEM = { ok: "verde", baixa: "amarelo", prejuizo: "vermelho", sem_custo: "azul", sem_preco: "azul" };

function htmlMargem(m, compacto = false) {
  const linhas = Object.entries(m);
  if (compacto) {
    return linhas.map(([p, r]) => `<div class="aviso ${ALERTA_MARGEM[r.alerta] || "azul"}" style="margin-bottom:6px">${selo(p)} ${h(r.mensagem)}
      ${r.lucro != null && r.custo != null ? ` Lucro de <b>${brl(r.lucro)}</b> por venda.` : ""}</div>`).join("");
  }
  return `<div class="tabela-margem"><table><thead><tr><th></th>${linhas.map(([p]) => `<th>${selo(p)}</th>`).join("")}</tr></thead><tbody>
    ${[["Preço", "preco"], ["Tarifa", "tarifa"], ["Frete", "frete"], ["Imposto", "imposto"], ["Custo", "custo"]].map(([rot, k]) =>
      `<tr><td class="suave">${rot}</td>${linhas.map(([, r]) => `<td>${r[k] == null ? "—" : (k === "preco" ? "" : "− ") + brl(r[k])}</td>`).join("")}</tr>`).join("")}
    <tr class="total"><td>Lucro</td>${linhas.map(([, r]) => `<td class="${r.lucro < 0 ? "negativo" : ""}">${r.custo == null ? "—" : brl(r.lucro)}</td>`).join("")}</tr>
    <tr><td class="suave">Margem</td>${linhas.map(([, r]) => `<td>${r.custo == null ? "—" : String(r.margem_pct).replace(".", ",") + "%"}</td>`).join("")}</tr>
    <tr><td class="suave">Preço mínimo<br><small>margem ${linhas[0]?.[1].margem_minima_pct ?? ""}%</small></td>${linhas.map(([, r]) => `<td>${r.preco_minimo ? brl(r.preco_minimo) : "—"}</td>`).join("")}</tr>
  </tbody></table></div>
  ${linhas.map(([p, r]) => r.mensagem ? `<div class="aviso ${ALERTA_MARGEM[r.alerta] || "azul"}" style="margin:6px 0 0">${selo(p)} ${h(r.mensagem)}
    ${r.fonte_tarifa ? `<br><small>Tarifa: ${h(r.fonte_tarifa)} · Frete: ${h(r.fonte_frete)}</small>` : ""}</div>` : "").join("")}`;
}

async function avaliarRiscoMargem() {
  await salvar();
  const plats = destinosMarcados().length ? destinosMarcados() : Object.keys(PLAT);
  const [r, m] = await Promise.all([
    api(`/api/anuncios/${estado.anuncio.id}/risco`),
    api(`/api/anuncios/${estado.anuncio.id}/margem`, { method: "POST", body: { plataformas: plats } }),
  ]);
  const alvo = $("#risco-margem");
  alvo.classList.remove("suave");
  alvo.innerHTML = htmlRisco(r) + `<h3 style="margin:16px 0 6px">Quanto sobra de cada venda</h3>` + htmlMargem(m);
}

const SITUACAO_RADAR = { acima: ["amarelo", "acima do mercado"], abaixo: ["azul", "dá para subir"], competitivo: ["verde", "competitivo"],
  no_limite: ["amarelo", "no limite da margem"], sem_dados: ["azul", "sem concorrentes"] };

function htmlRadar(leitura) {
  const d = leitura.dados;
  const [cor, rotulo] = SITUACAO_RADAR[d.situacao] || ["azul", d.situacao];
  return `<div class="aviso ${cor}" style="margin-bottom:8px"><b>${rotulo}</b> · ${h(d.texto)}</div>
    <div class="radar-numeros"><div><small>Seu preço</small><b>${brl(d.meu_preco)}</b></div>
      <div><small>Menor concorrente</small><b>${brl(d.menor)}</b></div>
      <div><small>Mediana (${d.quantidade})</small><b>${brl(d.mediana)}</b></div></div>
    ${d.sugerido ? `<button class="pequeno" data-aplicar-preco="${d.sugerido}" style="margin-top:10px">Aplicar ${brl(d.sugerido)} no anúncio publicado</button>` : ""}
    <p class="pequeno suave" style="margin:8px 0 0">${leitura.demo ? '<span class="selo demo">demonstração</span> ' : ""}${d.fonte ? h(d.fonte) + " · " : ""}lido em ${data(leitura.criada_em)}</p>`;
}

function ligarAplicarPreco(raiz, anuncioId, depois) {
  $$("[data-aplicar-preco]", raiz).forEach((b) => (b.onclick = () => {
    const preco = +b.dataset.aplicarPreco;
    if (!confirm(`Mudar o preço do anúncio PUBLICADO no Mercado Livre para ${brl(preco)}? Compradores verão o novo preço na hora.`)) return;
    comBotao(b, async () => {
      const r = await api(`/api/anuncios/${anuncioId}/radar/aplicar`, { method: "POST", body: { preco } });
      toast(r.simulado ? `Simulado (demonstração): preço ${brl(r.preco)}.` : `Preço alterado para ${brl(r.preco)}.`);
      await depois(r);
    });
  }));
}

async function carregarRadarEditor(atualizar = false) {
  const id = estado.anuncio.id;
  if (atualizar) await api(`/api/anuncios/${id}/radar`, { method: "POST" });
  const r = await api(`/api/anuncios/${id}/radar`);
  $("#cartao-radar").hidden = !r.publicado;
  if (!r.publicado) return;
  $("#radar").innerHTML = r.atual ? htmlRadar(r.atual) : `<p class="suave">Compare o seu preço com o dos concorrentes do mesmo produto. Clique em Atualizar.</p>`;
  ligarAplicarPreco($("#radar"), id, async (res) => {
    $("#preco").value = res.preco;
    $("#preco").dispatchEvent(new Event("input"));
    estado.anuncio.preco = res.preco;
    await carregarRadarEditor(true);
  });
}

const TIPOS_FOTO = [
  ["branco", "1. Fundo branco", "O produto sozinho em fundo branco puro. É a capa que os marketplaces pedem."],
  ["caracteristicas", "2. Características: destaques", "O produto com 3 a 5 destaques ao lado, com marcador azul."],
  ["ficha", "3. Características: ficha técnica", "Foto de detalhe feita pela IA com marca, material, medidas e peso embaixo."],
  ["contexto", "4. Em contexto", "O produto no ambiente onde é usado ou exibido."],
  ["explicativa", "5. Contexto explicativo", "O produto em uso, com uma frase de chamada e os destaques escritos na foto."],
];
const TIPOS_FOTO_IA = ["contexto", "explicativa"];

function abrirGeradorFotos() {
  const a = estado.anuncio;
  const fotos = a.fotos.filter((f) => /^(https?:\/\/|\/uploads\/)/.test(f));
  const ia = estado.usuario.imagens_ia;
  if (!fotos.length) return toast("Envie ou cole pelo menos uma foto real do produto para servir de base.", true);
  const m = modal(`<h2>${ic("brilho", "p")}Gerar fotos do anúncio</h2>
    <p class="pequeno suave" style="margin-top:-6px">A partir de uma foto real, o Replique cria as fotos do anúncio. O produto
      tem que continuar idêntico: confira cada foto antes de usar.</p>
    ${ia ? `<div class="aviso azul">IA de imagem: <b>${ia === "openai" ? "OpenAI" : "Gemini"}</b>. As 5 fotos levam de 1 a 3 minutos.
        Os textos das fotos são escritos pelo Replique, sem erro de português.</div>`
      : `<div class="aviso amarelo"><b>A IA de imagem ainda não está ligada no servidor.</b> Sem ela, o Replique monta 3 fotos sozinho:
        fundo branco (só fica perfeito quando a foto original já tem fundo liso, como as de catálogo), destaques e ficha técnica.
        As fotos em contexto e em uso, e a troca de um fundo com cenário por branco, precisam da chave de IA de imagem
        (OPENAI_API_KEY ou GEMINI_API_KEY no .env). Fale com o administrador.</div>`}
    <label>Foto base</label>
    <div class="fotos escolher-base">${fotos.map((f, i) => `<label class="f ${i ? "" : "marcada"}"><input type="radio" name="base" value="${h(f)}" ${i ? "" : "checked"}>
      <img src="${h(f)}" alt="Foto ${i + 1}" referrerpolicy="no-referrer"></label>`).join("")}</div>
    <label style="margin-top:14px">O que gerar</label>
    <div class="tipos-foto">${TIPOS_FOTO.map(([k, nome, desc]) => `<label class="tipo-foto marcado"><input type="checkbox" value="${k}" checked
      ${!ia && TIPOS_FOTO_IA.includes(k) ? "disabled" : ""}><b>${nome}</b><span class="pequeno suave">${desc}</span></label>`).join("")}</div>
    <div class="grade g3" style="margin-top:12px" ${ia ? "" : "hidden"}>
      <div><label for="g-cenario">Cenário da foto 4 (opcional)</label><input id="g-cenario" type="text" maxlength="300" placeholder="ex.: bancada de cozinha clara, manhã"></div>
      <div><label for="g-demo">Uso na foto 5 (opcional)</label><input id="g-demo" type="text" maxlength="300" placeholder="ex.: mãos servindo café no copo"></div>
      <div><label for="g-chamada">Frase da foto 5 (opcional)</label><input id="g-chamada" type="text" maxlength="60" placeholder="ex.: Café quente por 12 horas"></div>
    </div>
    <p class="pequeno suave" style="margin:8px 0 0">Os destaques e a ficha técnica saem das características, marca, modelo, medidas e peso do anúncio.
      Depois de gerar, dá para ajustar qualquer foto no editor.</p>
    <div id="g-resultado"></div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px" id="g-acoes"><button class="sec" data-fechar>Cancelar</button><button id="g-gerar">${ic("brilho", "p")}Gerar</button></div>`);
  m.classList.add("larga");
  $$("input[name=base]", m).forEach((r) => (r.onchange = () => $$(".escolher-base .f", m).forEach((f) => f.classList.toggle("marcada", $("input", f).checked))));
  $$(".tipo-foto input", m).forEach((c) => {
    if (c.disabled) { c.checked = false; c.parentElement.classList.remove("marcado"); c.parentElement.classList.add("desligado"); }
    c.onchange = () => c.parentElement.classList.toggle("marcado", c.checked);
  });
  $("#g-gerar", m).onclick = () => comBotao($("#g-gerar", m), async () => {
    const tipos = $$(".tipo-foto input:checked", m).map((c) => c.value);
    if (!tipos.length) throw new Error("Marque pelo menos um tipo de foto.");
    if (estado.sujo) await salvar();
    let g = await api(`/api/anuncios/${a.id}/fotos/gerar`, { method: "POST", body: {
      foto: $("input[name=base]:checked", m).value, tipos, cenario: $("#g-cenario", m).value, demonstracao: $("#g-demo", m).value,
      chamada: $("#g-chamada", m).value } });
    $("#g-resultado", m).innerHTML = `<div class="carregando" style="margin-top:14px"><span class="girando"></span> Gerando ${tipos.length} foto(s)…</div>`;
    while (g.status === "gerando") {
      await new Promise((ok) => setTimeout(ok, 2500));
      if ($("#modal").hidden) return;
      g = await api(`/api/fotos/geracoes/${g.id}`);
      if (g.resultado.length) mostrarGeradas(m, g, true);
    }
    if (g.status === "erro") throw new Error(g.erro);
    mostrarGeradas(m, g, false);
  });
}

function mostrarGeradas(m, g, parcial) {
  const prontas = g.resultado.filter((r) => r.url);
  $("#g-resultado", m).innerHTML = `<h3 style="margin:16px 0 8px">Resultado</h3><div class="geradas">${g.resultado.map((r) => `
    <div class="gerada">${r.url ? `<img src="${h(r.url)}" alt="${h(r.nome)}">` : `<div class="sem-foto">${ic("alerta")}</div>`}
      <div class="linha entre" style="flex-wrap:nowrap"><b>${h(r.nome)}</b>
        ${r.url && !parcial ? `<button type="button" class="sec pequeno" data-editar-gerada="${h(r.tipo)}" title="Ajustar no editor de fotos">${ic("lapis", "p")}Editar</button>` : ""}</div>
      ${r.aviso ? `<span class="pequeno aviso-texto">${h(r.aviso)}</span>` : ""}</div>`).join("")}</div>
    ${parcial ? `<div class="carregando"><span class="girando"></span> Gerando o restante…</div>` : ""}`;
  if (parcial || !prontas.length) return;
  $$("[data-editar-gerada]", m).forEach((b) => (b.onclick = () => {
    const r = g.resultado.find((x) => x.tipo === b.dataset.editarGerada);
    abrirEditorFotos({ url: r.url, titulo: r.nome, modos: ["substituir"], aoSalvar: (url) => { r.url = url; mostrarGeradas(m, g, false); } });
  }));
  $("#g-acoes", m).innerHTML = `<button class="sec" data-fechar>Descartar</button>
    <button class="sec" id="g-substituir">Substituir todas as fotos</button>
    <button id="g-inicio">${ic("mais", "p")}Colocar no início</button>`;
  const aplicar = (substituir) => {
    const novas = prontas.map((r) => r.url);
    estado.anuncio.fotos = substituir ? novas : [...novas, ...estado.anuncio.fotos.filter((f) => !novas.includes(f))].slice(0, 20);
    estado.sujo = true;
    desenharFotos();
    fecharModal();
    toast("Fotos adicionadas. Confira se o produto está idêntico e clique em Salvar.");
  };
  $("#g-substituir", m).onclick = () => aplicar(true);
  $("#g-inicio", m).onclick = () => aplicar(false);
}

const NIVEL_SAUDE = { critico: ["vermelho", "Crítico"], atencao: ["amarelo", "Atenção"], ok: ["verde", "Saudável"],
  sem_dados: ["azul", "Sem dados"], nunca: ["azul", "Não verificado"] };
const COR_METRICA = { lider: "verde", verde: "verde", amarelo: "amarelo", laranja: "vermelho", vermelho: "vermelho" };

function cartaoSaude(c) {
  const [cor, rotulo] = NIVEL_SAUDE[c.nivel] || NIVEL_SAUDE.nunca;
  const d = c.dados || {};
  const pct = (v) => (v * 100).toFixed(v < 0.1 ? 2 : 1).replace(".", ",") + "%";
  return `<section class="cartao saude ${cor}" data-cliente="${c.id}">
    <div class="linha entre"><div><h2 style="margin:0">${h(c.nome)}</h2>
      <span class="pequeno suave">${d.apelido ? h(d.apelido) + " · " : ""}${d.termometro_nome ? "termômetro " + h(d.termometro_nome) : ""}${d.mercado_lider ? " · MercadoLíder " + h(d.mercado_lider) : ""}</span></div>
      <span class="selo-nivel ${cor}">${rotulo}</span></div>
    ${(d.metricas || []).length ? `<div class="metricas">${d.metricas.map((mt) => `<div class="metrica">
      <div class="linha entre"><span>${h(mt.nome)}</span><b class="${COR_METRICA[mt.cor]}">${pct(mt.taxa)}</b></div>
      <div class="medidor ${COR_METRICA[mt.cor]}"><i style="width:${Math.min(100, Math.max(2, mt.uso_do_limite * 100))}%"></i></div>
      <small class="suave">limite do verde ${pct(mt.limite_verde)} · MercadoLíder ${pct(mt.limite_lider)}</small></div>`).join("")}</div>` : ""}
    ${d.anuncios && Object.keys(d.anuncios).length ? `<p class="pequeno" style="margin:10px 0 0">${d.anuncios.active ?? 0} ativos ·
      ${d.anuncios.paused ?? 0} pausados · ${d.anuncios.under_review ?? 0} em revisão${d.vendas_periodo != null ? ` · ${d.vendas_periodo} vendas (${h(d.periodo)})` : ""}</p>` : ""}
    ${(d.alertas || []).map((t) => `<div class="aviso ${cor === "verde" ? "azul" : cor}" style="margin:8px 0 0">${h(t)}</div>`).join("")}
    ${(d.moderados || []).length ? `<details style="margin-top:8px"><summary class="pequeno">Anúncios pausados pela moderação (${d.moderados.length})</summary>
      ${d.moderados.map((x) => `<div class="pequeno" style="margin-top:4px">${urlSegura(x.link) ? `<a href="${h(x.link)}" target="_blank" rel="noopener">${h(x.titulo || x.id)}</a>` : h(x.titulo || x.id)}
        <span class="suave">· ${h(x.motivo)}</span></div>`).join("")}</details>` : ""}
    ${c.shopee ? blocoSaudeShopee(c.shopee) : ""}
    <div class="linha entre" style="margin-top:12px"><span class="pequeno suave">${c.demo ? '<span class="selo demo">demonstração</span> ' : ""}${c.criada_em ? "verificado em " + data(c.criada_em) : "ainda não verificado"}</span>
      <button class="sec pequeno" data-atualizar-saude="${c.id}">Atualizar</button></div>
  </section>`;
}

function blocoSaudeShopee(sp) {
  const [cor, rotulo] = NIVEL_SAUDE[sp.nivel] || NIVEL_SAUDE.nunca;
  const d = sp.dados || {};
  const a = d.anuncios || {};
  return `<div class="saude-shopee" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--borda)">
    <div class="linha entre"><span>${selo("shopee")} <span class="pequeno suave">${d.apelido ? h(d.apelido) : ""}${d.nota ? " · desempenho " + h(d.nota) : ""}${d.pontos_penalidade ? ` · ${d.pontos_penalidade} ponto(s) de penalidade` : ""}</span></span>
      <span class="selo-nivel ${cor}">${rotulo}</span></div>
    ${(d.metricas || []).length ? `<div class="metricas">${d.metricas.slice(0, 6).map((mt) => `<div class="metrica">
      <div class="linha entre"><span>${h(mt.nome)}</span><b class="${mt.ok ? "verde" : "vermelho"}">${h(mt.valor)}</b></div>
      <small class="suave">meta da Shopee ${h(mt.meta)}</small></div>`).join("")}</div>` : ""}
    ${Object.keys(a).length ? `<p class="pequeno" style="margin:10px 0 0">${a.active ?? 0} ativos · ${a.paused ?? 0} pausados · ${a.under_review ?? 0} em revisão · ${a.banned ?? 0} bloqueados</p>` : ""}
    ${(d.alertas || []).map((t) => `<div class="aviso ${cor === "verde" ? "azul" : cor}" style="margin:8px 0 0">${h(t)}</div>`).join("")}
    ${(d.moderados || []).length ? `<details style="margin-top:8px"><summary class="pequeno">Anúncios bloqueados pela Shopee (${d.moderados.length})</summary>
      ${d.moderados.map((x) => `<div class="pequeno" style="margin-top:4px">${urlSegura(x.link) ? `<a href="${h(x.link)}" target="_blank" rel="noopener">${h(x.titulo || x.id)}</a>` : h(x.titulo || x.id)}</div>`).join("")}</details>` : ""}
    ${sp.criada_em ? `<div class="pequeno suave" style="margin-top:6px">Shopee verificada em ${data(sp.criada_em)}</div>` : ""}
  </div>`;
}

async function telaSaude() {
  const lista = await api("/api/saude");
  const cliente = estado.usuario.papel === "cliente";
  const criticos = lista.filter((c) => c.nivel === "critico").length;
  $("#tela").innerHTML = `<div class="topo"><div><h1>${cliente ? "Saúde da conta" : "Saúde das contas"}</h1>
    <div class="suave">Reputação no Mercado Livre e desempenho da loja na Shopee: reclamações, cancelamentos, atrasos, penalidades e anúncios bloqueados, com aviso antes de a conta piorar.
      ${cliente ? "" : eAdmin() ? ` Mostrando <b>todos os ${lista.length} clientes</b> da empresa.` : ` Mostrando <b>os ${lista.length} clientes atribuídos a você</b>, não só o que está aberto no seletor.`}</div></div>
    ${!cliente && lista.length ? `<button id="saude-todos">${ic("relogio", "p")}Verificar todos</button>` : ""}</div>
    ${criticos ? `<div class="aviso vermelho">${ic("alerta", "p")} <b>${criticos} cliente(s) em situação crítica.</b> Evite publicar em quantidade nessas contas até resolver.</div>` : ""}
    <div class="grade-saude" id="saude-lista">${lista.length ? lista.map(cartaoSaude).join("") : `<div class="cartao" style="grid-column:1/-1">${vazio("coracao",
      `Nenhum cliente ativo em ${h(estado.usuario.empresa.nome)}`,
      eAdmin() ? `A saúde é medida pela conta do Mercado Livre de cada cliente. Cadastre ou reative um cliente em <a href="#/clientes">Clientes</a> e conecte a conta dele.`
        : "Peça ao administrador para liberar os clientes que você atende.")}</div>`}</div>`;
  const atualizarUm = async (id) => {
    const novo = await api(`/api/saude/${id}/atualizar`, { method: "POST" });
    const velho = $(`.saude[data-cliente="${id}"]`);
    velho.outerHTML = cartaoSaude(novo);
    ligar();
  };
  const ligar = () => $$("[data-atualizar-saude]").forEach((b) => (b.onclick = () => comBotao(b, () => atualizarUm(+b.dataset.atualizarSaude))));
  ligar();
  const todos = $("#saude-todos");
  if (todos) todos.onclick = () => comBotao(todos, async () => {
    for (const [i, c] of lista.entries()) {
      todos.lastChild.textContent = ` Verificando ${i + 1} de ${lista.length}…`;
      try { await atualizarUm(c.id); } catch (e) { toast(`${c.nome}: ${e.message}`, true); }
    }
    await telaSaude();
  });
}

async function telaPerguntas() {
  const equipe = eEquipe();
  $("#tela").innerHTML = `<div class="topo"><div><h1>Central de perguntas</h1>
    <div class="suave">Perguntas sem resposta no Mercado Livre de <b>todos os clientes que você atende</b>, numa lista só.
      ${equipe ? "A IA sugere, você revisa e envia." : "Pelo acesso de consultor você acompanha; quem responde é o operador."}</div></div>
    <button class="sec" id="p-recarregar">${ic("relogio", "p")}Recarregar</button></div>
  <div id="p-corpo"><div class="carregando"><span class="girando"></span> Buscando as perguntas de cada cliente…</div></div>`;
  $("#p-recarregar").onclick = () => comBotao($("#p-recarregar"), telaPerguntas);
  let r;
  try { r = await api("/api/perguntas/central"); }
  catch (e) { $("#p-corpo").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  if (estado._rotaAtual !== "perguntas") return;
  const filtro = estado.filtroPerguntas || "";
  const comPergunta = r.clientes.filter((c) => c.pendentes);
  const perguntas = r.perguntas.filter((q) => !filtro || String(q.cliente_id) === filtro);
  const erros = r.clientes.filter((c) => c.erro);
  $("#p-corpo").innerHTML = `
    <div class="aviso azul pequeno">Responda rápido: o tempo de resposta pesa na conversão. O Replique barra telefone, e-mail, links e redes sociais,
      que o Mercado Livre pune.${r.sem_conta ? ` ${r.sem_conta} cliente(s) sem a conta do Mercado Livre conectada não entram aqui.` : ""}</div>
    ${erros.map((c) => `<div class="aviso amarelo pequeno"><b>${h(c.nome)}:</b> ${h(c.erro)}</div>`).join("")}
    <div class="segmentos rolavel" style="margin-bottom:12px"><button type="button" data-filtro-q="" class="${!filtro ? "ativa" : ""}">Todos (${r.perguntas.length})</button>
      ${comPergunta.map((c) => `<button type="button" data-filtro-q="${c.id}" class="${filtro === String(c.id) ? "ativa" : ""}">${h(c.nome)} (${c.pendentes})</button>`).join("")}</div>
    <div class="pilha" id="p-lista">${perguntas.length ? perguntas.map((q, i) => `<section class="cartao pergunta" data-i="${i}">
      <div class="linha entre"><span class="pequeno"><span class="chip-cliente">${ic("loja", "p")}${h(q.cliente_nome)}</span>
        ${urlSegura(q.link) ? `<a href="${h(q.link)}" target="_blank" rel="noopener">${h(q.titulo || q.item_id)}</a>` : `<span class="suave">${h(q.titulo || q.item_id)}</span>`}</span>
        <span class="pequeno suave">${data(q.data)}</span></div>
      <p class="texto-pergunta">${h(q.texto)}</p>
      ${equipe ? `<textarea class="p-resposta" maxlength="2000" placeholder="Sua resposta"></textarea>
      <div class="p-aviso"></div>
      <div class="linha" style="justify-content:flex-end;margin-top:8px"><button class="sec pequeno" data-sugerir>${ic("varinha", "p")}Sugerir com IA</button>
        <button class="pequeno" data-enviar>${ic("publicar", "p")}Enviar resposta</button></div>` : ""}</section>`).join("")
      : `<div class="cartao">${vazio("balao", "Nenhuma pergunta pendente", "Tudo respondido.")}</div>`}</div>`;
  $$("[data-filtro-q]").forEach((b) => (b.onclick = () => { estado.filtroPerguntas = b.dataset.filtroQ; telaPerguntas(); }));
  $$(".pergunta").forEach((card) => {
    const q = perguntas[+card.dataset.i];
    const base = `/api/clientes/${q.cliente_id}/perguntas/${q.id}`;
    const sugerir = $("[data-sugerir]", card), enviar = $("[data-enviar]", card);
    if (sugerir) sugerir.onclick = (e) => comBotao(e.currentTarget, async () => {
      const s = await api(base + "/sugerir", { method: "POST", body: { texto: q.texto, item_id: q.item_id || "" } });
      $(".p-resposta", card).value = s.resposta;
      $(".p-aviso", card).innerHTML = s.aviso ? `<div class="aviso amarelo" style="margin:6px 0 0">${h(s.aviso)}</div>`
        : s.confianca === "baixa" ? `<div class="aviso amarelo" style="margin:6px 0 0">A informação não estava no anúncio: confirme antes de enviar.</div>` : "";
    });
    if (enviar) enviar.onclick = (e) => comBotao(e.currentTarget, async () => {
      const res = await api(base + "/responder", { method: "POST", body: { texto: $(".p-resposta", card).value } });
      toast(res.simulado ? "Resposta simulada (demonstração)." : `Resposta enviada (${q.cliente_nome}).`);
      card.remove();
    });
  });
}

const errosRadar = new Map();

function contaRadar(c) {
  if (!c) return "—";
  const publicou = c.publicou ? h(c.publicou) : '<span class="suave">não registrada</span>';
  const conectada = c.conectada ? h(c.conectada) : '<span class="suave">nenhuma</span>';
  return `<div class="pequeno">Publicou: <b>${publicou}</b></div><div class="pequeno suave">Conectada: ${conectada}</div>
    ${c.outra_conta ? '<span class="selo erro" style="margin-top:4px">outra conta</span>' : ""}`;
}

const TIPO_MERCADO = { em_alta: ["ok", "Em alta"], mais_buscado: ["neutro", "Mais buscado"], popular: ["neutro", "Popular"], mais_vendido: ["ok", "Mais vendido"] };
const radarMercado = { aba: "tendencias", categoria: "", sub: "", dados: null, chave: "" };

const corNota = (n) => (n >= 70 ? "ok" : n >= 50 ? "neutro" : "demo");
const rotuloConcorrencia = (c) => (c <= 35 ? "baixa" : c <= 65 ? "média" : "alta");

async function telaRadar() {
  const r = radarMercado;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Radar de mercado</h1>
    <div class="suave">Tendências e nichos do Mercado Livre: o que está sendo mais buscado e vendido, com a concorrência de cada um.
      Filtre do jeito que quiser e leve o produto para a pesquisa.</div></div></div>
    <div class="segmentos" role="tablist" aria-label="Radar" style="margin-bottom:16px">
      ${[["tendencias", "Tendências"], ["vendidos", "Mais vendidos"], ["precos", "Meus preços"]].map(([v, n]) =>
        `<button type="button" role="tab" data-aba-radar="${v}" class="${r.aba === v ? "ativa" : ""}" aria-selected="${r.aba === v}">${n}</button>`).join("")}</div>
    <div id="radar-corpo"></div>`;
  $$("[data-aba-radar]").forEach((b) => (b.onclick = () => { r.aba = b.dataset.abaRadar; telaRadar(); }));
  if (r.aba === "precos") return meusPrecos($("#radar-corpo"));
  const cats = await api("/api/mercado/categorias");
  const subs = r.categoria ? await api(`/api/mercado/categorias?pai=${r.categoria}`) : [];
  const vendidos = r.aba === "vendidos";
  $("#radar-corpo").innerHTML = `
    <form class="cartao" id="radar-filtros">
      <div class="grade g4">
        <div><label for="rm-cat">Categoria</label><select id="rm-cat"><option value="">${vendidos ? "Escolha a categoria" : "Todas as categorias"}</option>
          ${cats.map((c) => `<option value="${c.id}" ${c.id === r.categoria ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select></div>
        <div><label for="rm-sub">Subcategoria</label><select id="rm-sub" ${subs.length ? "" : "disabled"}><option value="">Todas</option>
          ${subs.map((c) => `<option value="${c.id}" ${c.id === r.sub ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select></div>
        <div><label for="rm-texto">Contém o texto</label><input id="rm-texto" type="search" placeholder="Ex.: inox, gamer, kit"></div>
        <div><label for="rm-ordem">Ordenar por</label><select id="rm-ordem">
          <option value="nota">Melhor oportunidade</option><option value="posicao">Mais procura</option>
          <option value="concorrencia">Menos concorrência</option><option value="preco_asc">Menor preço</option><option value="preco_desc">Maior preço</option></select></div>
        ${vendidos ? "" : `<div><label for="rm-tipo">Tendência</label><select id="rm-tipo"><option value="">Todas</option>
          <option value="em_alta">Em alta (crescendo)</option><option value="mais_buscado">Mais buscadas</option><option value="popular">Populares</option></select></div>`}
        <div><label>Preço médio (R$)</label><div class="linha" style="gap:6px;flex-wrap:nowrap">
          <input id="rm-pmin" type="number" min="0" step="1" placeholder="de" aria-label="Preço mínimo">
          <input id="rm-pmax" type="number" min="0" step="1" placeholder="até" aria-label="Preço máximo"></div></div>
        <div><label for="rm-conc">Concorrência</label><select id="rm-conc"><option value="">Qualquer</option>
          <option value="35">Só baixa</option><option value="65">Baixa ou média</option></select></div>
        <div><label for="rm-nota">Oportunidade mínima</label><select id="rm-nota"><option value="0">Qualquer</option>
          <option value="50">50 ou mais</option><option value="70">70 ou mais</option></select></div>
      </div>
      <div class="linha entre" style="margin-top:12px">
        <div class="chips"><label class="chip"><input type="checkbox" id="rm-oficial"> Sem lojas oficiais</label>
          <label class="chip"><input type="checkbox" id="rm-full"> Pouco Full</label></div>
        <button type="submit" id="rm-buscar">${ic("alvo", "p")}${vendidos ? "Ver mais vendidos" : "Mapear tendências"}</button></div>
    </form>
    <div id="radar-nichos"></div>
    <div id="radar-lista" style="margin-top:16px"></div>`;
  const categoriaEscolhida = () => $("#rm-sub").value || $("#rm-cat").value;
  $("#rm-cat").onchange = async () => { r.categoria = $("#rm-cat").value; r.sub = ""; r.dados = null; await telaRadar(); };
  $("#rm-sub").onchange = () => { r.sub = $("#rm-sub").value; };
  $$("#radar-filtros input, #radar-filtros select").forEach((el) => {
    if (!["rm-cat", "rm-sub"].includes(el.id)) el.addEventListener(el.type === "search" || el.type === "number" ? "input" : "change", desenharMercado);
  });
  $("#radar-filtros").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#rm-buscar"), () => carregarMercado(categoriaEscolhida()));
  };
  if (r.dados && r.chave === `${r.aba}:${categoriaEscolhida()}`) desenharMercado();
  else if (!vendidos || categoriaEscolhida()) await comBotao($("#rm-buscar"), () => carregarMercado(categoriaEscolhida()));
  else $("#radar-lista").innerHTML = `<div class="cartao">${vazio("alvo", "Escolha uma categoria", "O ranking de mais vendidos é por categoria. Quanto mais específica a subcategoria, mais útil o resultado.")}</div>`;
}

async function carregarMercado(categoria) {
  const r = radarMercado;
  if (r.aba === "vendidos" && !categoria) return toast("Escolha a categoria para ver os mais vendidos.", true);
  $("#radar-lista").innerHTML = `<div class="cartao suave">Lendo o mercado no Mercado Livre… na primeira vez pode levar alguns segundos.</div>`;
  try {
    r.dados = r.aba === "vendidos" ? await api(`/api/mercado/mais-vendidos?categoria=${categoria}`)
      : await api("/api/mercado/tendencias" + (categoria ? `?categoria=${categoria}` : ""));
    r.chave = `${r.aba}:${categoria}`;
  } catch (e) {
    r.dados = null;
    $("#radar-lista").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`;
    return;
  }
  desenharMercado();
}

function filtrarMercado(lista) {
  const v = (id) => $(id)?.value || "";
  const texto = v("#rm-texto").trim().toLowerCase();
  const pmin = parseFloat(v("#rm-pmin")), pmax = parseFloat(v("#rm-pmax"));
  const conc = parseInt(v("#rm-conc"), 10), notaMin = parseInt(v("#rm-nota"), 10) || 0;
  const filtrada = lista.filter((x) => {
    if (texto && !`${x.termo} ${x.categoria} ${x.exemplo || ""}`.toLowerCase().includes(texto)) return false;
    if (v("#rm-tipo") && x.tipo !== v("#rm-tipo")) return false;
    if (!Number.isNaN(pmin) && !(x.preco_mediano >= pmin)) return false;
    if (!Number.isNaN(pmax) && !(x.preco_mediano <= pmax)) return false;
    if (!Number.isNaN(conc) && x.concorrencia > conc) return false;
    if (x.nota < notaMin) return false;
    if ($("#rm-oficial")?.checked && x.oficiais > 0) return false;
    if ($("#rm-full")?.checked && x.full > 0.3) return false;
    return true;
  });
  const ordem = {
    nota: (a, b) => b.nota - a.nota, posicao: (a, b) => a.posicao - b.posicao, concorrencia: (a, b) => a.concorrencia - b.concorrencia,
    preco_asc: (a, b) => (a.preco_mediano ?? Infinity) - (b.preco_mediano ?? Infinity),
    preco_desc: (a, b) => (b.preco_mediano ?? -1) - (a.preco_mediano ?? -1),
  }[v("#rm-ordem") || "nota"];
  return filtrada.sort(ordem);
}

function desenharMercado() {
  const r = radarMercado;
  if (!r.dados || !$("#radar-lista")) return;
  const lista = filtrarMercado([...r.dados]);
  const nichos = Object.values(lista.reduce((acc, x) => {
    if (!x.categoria) return acc;
    const n = (acc[x.categoria] ||= { nome: x.categoria, itens: 0, soma: 0 });
    n.itens += 1;
    n.soma += x.nota;
    return acc;
  }, {})).map((n) => ({ ...n, media: Math.round(n.soma / n.itens) }))
    .sort((a, b) => b.itens - a.itens || b.media - a.media).slice(0, 6);
  $("#radar-nichos").innerHTML = nichos.length ? `<section class="cartao" style="margin-top:16px">
    <div class="linha entre"><h2 style="margin:0">${ic("alvo", "p")}Nichos em alta</h2><span class="pequeno suave">clique para filtrar</span></div>
    <div class="grade-nichos" style="margin-top:12px">${nichos.map((n) => `<button type="button" class="nicho" data-nicho="${h(n.nome)}">
      <b>${h(n.nome)}</b><span class="pequeno suave">${n.itens} ${r.aba === "vendidos" ? "produto(s)" : "busca(s)"} · oportunidade média ${n.media}</span></button>`).join("")}</div></section>` : "";
  $$("[data-nicho]").forEach((b) => (b.onclick = () => { $("#rm-texto").value = b.dataset.nicho; desenharMercado(); }));
  $("#radar-lista").innerHTML = `<div class="cartao">${lista.length ? `<div class="linha entre" style="margin-bottom:10px">
      <span class="pequeno suave">${lista.length} de ${r.dados.length} resultado(s)</span>
      <span class="pequeno suave">Oportunidade = procura contra concorrência (0 a 100)</span></div>
    <div class="tabela embutida"><table><thead><tr><th>${r.aba === "vendidos" ? "Produto" : "Busca"}</th><th>Categoria</th>
      <th class="num">Preço médio</th><th class="num">Vendedores</th><th>Concorrência</th><th class="num">Oportunidade</th><th></th></tr></thead><tbody>
      ${lista.map((x) => {
        const [selo, tipo] = TIPO_MERCADO[x.tipo] || ["neutro", x.tipo];
        return `<tr><td><div class="linha" style="gap:10px;flex-wrap:nowrap">
            ${x.foto ? `<img src="${h(x.foto)}" alt="" width="40" height="40" loading="lazy" style="border-radius:6px;border:1px solid var(--borda);object-fit:contain;background:#fff;flex-shrink:0">` : ""}
            <div><b>${h(x.termo)}</b><div class="pequeno suave"><span class="selo ${selo}">${tipo}</span> ${x.tipo === "mais_vendido" ? `${x.posicao}º da categoria` : `#${x.posicao} nas buscas`}</div></div></div></td>
          <td class="pequeno">${h(x.categoria || "—")}${x.anuncios_categoria ? `<div class="suave">${numero(x.anuncios_categoria)} anúncios</div>` : ""}</td>
          <td class="num">${brl(x.preco_mediano)}${x.preco_min ? `<div class="pequeno suave">a partir de ${brl(x.preco_min)}</div>` : ""}</td>
          <td class="num">${x.vendedores ?? "—"}${x.oficiais ? `<div class="pequeno suave">${Math.round(x.oficiais * 100)}% oficiais</div>` : ""}</td>
          <td><div class="pequeno">${rotuloConcorrencia(x.concorrencia)}</div><div class="barra" style="width:90px"><i style="width:${x.concorrencia}%"></i></div></td>
          <td class="num"><span class="selo ${corNota(x.nota)}">${x.nota}</span></td>
          <td style="text-align:right;white-space:nowrap">
            ${urlSegura(x.link) ? `<a class="botao sec pequeno" href="${h(x.link)}" target="_blank" rel="noopener">Ver no ML ${ic("externo", "p")}</a>` : ""}
            ${estado.usuario.papel === "consultor" ? "" : `<button type="button" class="pequeno" data-pesquisar-termo="${h(x.termo)}">${ic("pesquisar", "p")}Pesquisar</button>`}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : vazio("alvo", "Nada com esses filtros", "Afrouxe algum filtro ou escolha outra categoria.")}</div>`;
  $$("[data-pesquisar-termo]").forEach((b) => (b.onclick = () => {
    estado.termoSugerido = b.dataset.pesquisarTermo;
    location.hash = "#/pesquisar";
  }));
}

async function meusPrecos(alvo) {
  const lista = await api("/api/radar");
  const recarregar = () => meusPrecos(alvo);
  alvo.innerHTML = `<div class="linha entre" style="margin-bottom:12px"><div class="suave">Anúncios de <b>${h(clienteAtual()?.nome)}</b> publicados no Mercado Livre comparados com os concorrentes do mesmo produto.
      A sugestão nunca desce abaixo da margem mínima.</div>
    ${lista.length ? `<button id="radar-todos">${ic("alvo", "p")}Atualizar todos</button>` : ""}</div>
    <div class="cartao">${lista.length ? `<div class="tabela"><table><thead><tr><th>Anúncio</th><th>Conta</th><th>Seu preço</th><th>Menor concorrente</th>
      <th>Situação</th><th>Sugestão</th><th></th></tr></thead><tbody>${lista.map((a) => {
        const d = a.radar?.dados;
        const erro = errosRadar.get(a.id);
        const [cor, rotulo] = erro ? ["vermelho", "não deu para ler"] : d ? SITUACAO_RADAR[d.situacao] || ["azul", d.situacao] : ["azul", "não verificado"];
        const selo = cor === "verde" ? "ok" : cor === "amarelo" ? "demo" : cor === "vermelho" ? "erro" : "neutro";
        return `<tr><td><a href="#/editor/${a.id}">${h(a.titulo)}</a>${a.radar?.demo ? ' <span class="selo demo">demonstração</span>' : ""}
            <div class="pequeno suave">${h(a.item_id || "")}${a.radar ? ` · lido em ${data(a.radar.criada_em)}` : ""}</div>
            ${erro ? `<div class="aviso vermelho pequeno" style="margin:6px 0 0">${h(erro)}</div>` : ""}</td>
          <td>${contaRadar(a.contas)}</td>
          <td>${brl(d?.meu_preco ?? a.preco)}</td><td>${d ? brl(d.menor) : "—"}</td>
          <td><span class="selo ${selo}">${rotulo}</span></td>
          <td>${d?.sugerido && !erro ? `<button class="sec pequeno" data-aplicar-preco="${d.sugerido}" data-anuncio="${a.id}">Aplicar ${brl(d.sugerido)}</button>` : "—"}</td>
          <td style="text-align:right"><button class="sec pequeno" data-radar="${a.id}">Atualizar</button></td></tr>`;
      }).join("")}</tbody></table></div>`
      : vazio("alvo", "Nenhum anúncio publicado no Mercado Livre", "O radar acompanha os anúncios depois de publicados. Anúncios tirados da lista em Publicações não aparecem aqui.")}</div>`;
  const ler = async (id) => {
    try {
      await api(`/api/anuncios/${id}/radar`, { method: "POST" });
      errosRadar.delete(id);
    } catch (e) {
      errosRadar.set(id, e.message);
    }
  };
  $$("[data-radar]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await ler(+b.dataset.radar);
    await recarregar();
  })));
  $$("[data-aplicar-preco]").forEach((b) => ligarAplicarPreco(b.parentElement, +b.dataset.anuncio, recarregar));
  const todos = $("#radar-todos");
  if (todos) todos.onclick = () => comBotao(todos, async () => {
    for (const a of lista) await ler(a.id);
    const falhas = lista.filter((a) => errosRadar.has(a.id)).length;
    if (falhas) toast(`${falhas} anúncio(s) não puderam ser lidos. O motivo aparece na linha de cada um.`, true);
    await recarregar();
  });
}

function mesesRecentes(n = 12) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })];
  });
}

async function telaRelatorio(mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const r = await api(`/api/relatorios/${estado.clienteId}?mes=${mes}`);
  const nomeMes = meses.find(([v]) => v === mes)?.[1] || mes;
  const n = r.numeros;
  const s = r.saude;
  const [corS, rotS] = NIVEL_SAUDE[s.nivel] || NIVEL_SAUDE.nunca;
  $("#tela").innerHTML = `<div class="topo nao-imprimir"><div><h1>Relatório do mês</h1>
    <div class="suave">Resumo do trabalho na loja, pronto para enviar ao cliente (Imprimir → Salvar como PDF).</div></div>
    <div class="linha"><select id="r-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select>
      <button id="r-imprimir">${ic("imprimir", "p")}Imprimir / PDF</button></div></div>
  <article class="cartao relatorio">
    <header class="linha entre"><div class="linha" style="gap:10px"><img src="/static/monvatti-v.png" alt="Monvatti" width="36" height="36">
      <div><b>Replique</b><div class="pequeno suave">Relatório mensal · Monvatti</div></div></div>
      <div style="text-align:right"><h1 style="margin:0">${h(r.cliente.nome)}</h1>
      <span class="suave">${h(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1))}</span></div></header>
    <div class="grade g4 kpis-relatorio">
      ${[["Anúncios publicados", n.publicados], ["Rascunhos criados", n.rascunhos_criados], ["Perguntas respondidas", n.perguntas_respondidas],
        ["Preços ajustados", n.precos_ajustados]].map(([rot, v]) => `<div class="kpi-rel"><b>${v}</b><span>${rot}</span></div>`).join("")}
    </div>
    <div class="grade g2" style="margin-top:18px">
      <section><h3>Publicações por marketplace</h3>${Object.keys(r.por_plataforma).length ? Object.entries(r.por_plataforma).map(([p, v]) =>
        `<div class="linha entre barra-rel"><span>${h(p)}</span><b>${v}</b></div>`).join("") : '<p class="suave pequeno">Nenhuma publicação no mês.</p>'}
        ${n.lotes ? `<p class="pequeno suave">${n.lotes} publicação(ões) em lote.</p>` : ""}</section>
      <section><h3>Saúde da conta no Mercado Livre</h3><p><span class="selo-nivel ${corS}">${rotS}</span>
        ${s.dados?.termometro_nome ? ` termômetro ${h(s.dados.termometro_nome)}` : ""}</p>
        ${(s.dados?.metricas || []).map((mt) => `<div class="linha entre pequeno"><span>${h(mt.nome)}</span><b>${(mt.taxa * 100).toFixed(2).replace(".", ",")}%</b></div>`).join("")}
        ${s.criada_em ? `<p class="pequeno suave">Verificado em ${data(s.criada_em)}.</p>` : '<p class="pequeno suave">Ainda não verificado.</p>'}</section>
    </div>
    ${Object.keys(r.por_pessoa).length ? `<section style="margin-top:18px"><h3>Quem trabalhou na loja</h3><p class="pequeno">${Object.entries(r.por_pessoa)
      .map(([p, v]) => `${h(p)} (${v} ações)`).join(" · ")}</p></section>` : ""}
    <section style="margin-top:18px"><h3>Anúncios publicados</h3>${r.publicacoes.length ? `<table><thead><tr><th>Anúncio</th><th>Marketplace</th><th>Data</th></tr></thead>
      <tbody>${r.publicacoes.map((p) => `<tr><td>${urlSegura(p.link) ? `<a href="${h(p.link)}" target="_blank" rel="noopener">${h(p.titulo)}</a>` : h(p.titulo)}</td>
        <td>${h(p.plataforma)}</td><td>${data(p.data)}</td></tr>`).join("")}</tbody></table>` : '<p class="suave pequeno">Nenhum anúncio publicado neste mês.</p>'}</section>
    <footer class="pequeno suave" style="margin-top:18px">Gerado pelo Replique em ${data(r.gerado_em)}.</footer>
  </article>`;
  $("#r-mes").onchange = () => { location.hash = "#/relatorio/" + $("#r-mes").value; };
  $("#r-imprimir").onclick = () => window.print();
}

function ligarOlhos(raiz = document) {
  $$('input[type="password"]:not([data-olho])', raiz).forEach((campo) => {
    campo.dataset.olho = "1";
    const caixa = document.createElement("span");
    caixa.className = "campo-senha";
    campo.parentNode.insertBefore(caixa, campo);
    caixa.appendChild(campo);
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "olho";
    botao.setAttribute("aria-label", "Mostrar senha");
    botao.title = "Mostrar senha";
    botao.innerHTML = ic("olho");
    botao.onclick = () => {
      const mostrar = campo.type === "password";
      campo.type = mostrar ? "text" : "password";
      botao.innerHTML = ic(mostrar ? "olhoFechado" : "olho");
      botao.title = mostrar ? "Esconder senha" : "Mostrar senha";
      botao.setAttribute("aria-label", botao.title);
      campo.focus();
    };
    caixa.appendChild(botao);
  });
}
let _olhosAgendado = false;
new MutationObserver(() => {
  if (_olhosAgendado) return;
  _olhosAgendado = true;
  requestAnimationFrame(() => { _olhosAgendado = false; ligarOlhos(); });
}).observe(document.body, { childList: true, subtree: true });

async function telaColaborador(token) {
  let c = null, erro = "";
  try { c = await api("/api/colaborador/" + encodeURIComponent(token || "")); } catch (e) { erro = e.message; }
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("Replique · gestão de anúncios para marketplaces")}
      <div>
        <h1>${c ? `Bem-vindo à equipe da ${h(c.empresa)}.` : "Convite da equipe"}</h1>
        <p>Com o Replique você pesquisa os anúncios que mais vendem, prepara e publica para os clientes da agência.</p>
      </div>
      <div class="credito">© ${new Date().getFullYear()} Monvatti · Todos os direitos reservados</div>
    </div>
    <div class="form">${botaoTema()}<div class="caixa">
      ${!c ? `<h2>Convite indisponível</h2><div class="aviso vermelho">${h(erro)}</div><a class="botao" href="#/entrar">Ir para o login</a>` : `
      <h2>Crie o seu acesso</h2>
      <div class="suave">${h(c.nome)} · <b>${h(c.email)}</b> · ${h(PAPEL[c.papel])}</div>
      <div style="height:18px"></div>
      <div id="google-convite"></div>
      <form id="f-colab" class="pilha">
        <div><label for="co-nome">Seu nome</label><input id="co-nome" type="text" name="nome" value="${h(c.nome)}" required autocomplete="name"></div>
        <div><label for="co-senha">Crie uma senha (mín. 8 caracteres)</label><input id="co-senha" type="password" name="senha" minlength="8" required autocomplete="new-password"></div>
        <button type="submit">Criar acesso</button>
        ${c.google ? `<p class="pequeno suave" style="margin:4px 0 0">Com Google, use a conta do e-mail <b>${h(c.email)}</b>: outro e-mail não é aceito.</p>` : ""}
      </form>`}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Convite · Replique";
  if (!c) return;
  if (c.google) mostrarBotaoGoogle($("#google-convite"), "/api/auth/google/iniciar?convite=" + encodeURIComponent(token), "Continuar com Google");
  $("#f-colab").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", e.target), async () => {
      const r = await api("/api/colaborador/" + encodeURIComponent(token), { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      localStorage.setItem("rpq_token", r.token);
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null });
      history.replaceState(null, "", "#/");
      roteador();
    });
  };
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
      modal(`<h2>${ic("envelope", "p")}Convite criado</h2>
        ${r.email_enviado ? `<div class="aviso verde">E-mail enviado para <b>${h(r.email)}</b>.</div>`
          : `<div class="aviso amarelo">O e-mail não foi enviado (${h(r.motivo)}). Copie o link abaixo e mande para <b>${h(r.email)}</b>.</div>`}
        <label for="link-convite">Link do convite (só aparece agora)</label>
        <div class="linha"><input id="link-convite" type="text" readonly value="${h(r.url)}" style="flex:1">
          <button class="sec" id="copiar-convite">Copiar</button></div>
        <p class="pequeno suave">Vale até ${data(r.expira_em)} e só pode ser usado uma vez, pelo e-mail convidado.</p>
        <div class="linha" style="justify-content:flex-end"><button data-fechar>Fechar</button></div>`);
      $("#copiar-convite").onclick = async () => {
        try { await navigator.clipboard.writeText(r.url); toast("Link copiado."); }
        catch { $("#link-convite").select(); toast("Selecione e copie com Ctrl+C.", true); }
      };
      if (estado._rotaAtual === "config") telaConfig();
    });
  };
}

const SITUACAO_PUB = { active: ["ok", "ativo"], paused: ["demo", "pausado"], closed: ["erro", "finalizado"], deleted: ["erro", "excluído"],
  under_review: ["demo", "em revisão"], inactive: ["demo", "inativo"] };
const ACAO_PUB = { pausar: ["pausa", "Pausar"], reativar: ["play", "Reativar"], finalizar: ["x", "Finalizar"], excluir: ["lixo2", "Excluir"] };
const CONFIRMA_ACAO = {
  pausar: "Pausar o anúncio? Ele some das buscas até ser reativado.",
  finalizar: "Finalizar o anúncio? Ele sai do ar e NÃO pode ser reativado (seria preciso publicar de novo).",
  excluir: "Excluir o anúncio no marketplace? Ele é apagado da conta do vendedor. Não tem volta.",
};

const pct = (v) => `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const REGIME = { simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real" };
const DEVOLUCAO = { aberta: ["demo", "reclamação aberta"], devolvida: ["erro", "devolvida"], reembolsada: ["erro", "reembolsada"],
  coberta: ["neutro", "coberta pelo ML"] };
const NOME_UF = { AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
  PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins" };
const SUL_SUDESTE_SEM_ES = new Set(["PR", "SC", "RS", "SP", "RJ", "MG"]);
const interestadualUF = (origem, destino, importado) => (importado ? 4 : SUL_SUDESTE_SEM_ES.has(origem) && !SUL_SUDESTE_SEM_ES.has(destino) ? 7 : 12);
const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const estadoLucro = { aba: "produtos", busca: "", comOperacional: false, plataforma: "mercadolivre" };
const NOME_PLATAFORMA = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon" };
const margemSalva = () => { try { return localStorage.getItem("rpq_margem") || "15"; } catch { return "15"; } };
const numOuNulo = (v) => (v === "" || v == null ? null : Number(v));
const seloDevolucao = (d) => (d && DEVOLUCAO[d] ? ` <span class="selo ${DEVOLUCAO[d][0]}">${DEVOLUCAO[d][1]}</span>` : "");

function seloMargem(x, minima) {
  if (x.sem_vinculo) return '<span class="selo demo" title="O anúncio não está ligado a nenhum produto">sem vínculo</span>';
  if (x.sem_custo) return '<span class="selo neutro" title="O produto está sem custo cadastrado">sem custo</span>';
  if (x.lucro < 0) return `<span class="selo erro">${pct(x.margem)}</span>`;
  return `<span class="selo ${x.margem < minima ? "demo" : "ok"}">${pct(x.margem)}</span>`;
}

function abrirVincular(a, produtos, depois) {
  const m = modal(`<h2>${ic("contas", "p")}Vincular anúncio a um produto</h2>
    <div class="cartao" style="padding:12px 14px;margin-bottom:14px"><b>${h(a.titulo)}</b>
      <div class="pequeno suave">${a.variacao ? `${h(a.variacao)} · ` : ""}Anúncio ${h(a.item_id)} · ${a.sku ? `SKU <b>${h(a.sku)}</b> (não cadastrado)` : "sem SKU no anúncio"}</div></div>
    ${produtos.length ? `<form id="f-vinc" class="pilha">
      <div><label for="v-busca">Produto do catálogo</label>
        <input id="v-busca" type="search" placeholder="Filtrar por nome ou SKU" style="margin-bottom:6px">
        <select id="v-prod" name="produto_id" size="6" required>${produtos.map((p) => `<option value="${p.id}">${h(p.nome)}${p.sku ? ` · SKU ${h(p.sku)}` : ""}</option>`).join("")}</select></div>
      <div class="grade g2"><div><label for="v-un">Unidades do produto em cada venda</label>
        <input id="v-un" name="unidades" type="number" min="1" max="100" value="1"><div class="pequeno suave">Kit com 3 unidades = 3. O custo é multiplicado.</div></div>
        ${a.variacao_id ? `<label class="linha" style="gap:6px;font-weight:500;align-self:center;margin:0"><input type="checkbox" name="todas" style="width:auto">
          Vale para todas as variações do anúncio</label>` : ""}</div>
      <div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <button type="button" class="sec" id="v-novo">${ic("mais", "p")}Criar produto novo com este anúncio</button>
        <span class="linha" style="gap:8px"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Vincular</button></span></div>
    </form>` : `<p class="suave">Ainda não há produtos no catálogo. Crie o produto a partir deste anúncio.</p>
      <div class="linha" style="justify-content:flex-end;gap:8px"><button type="button" class="sec" data-fechar>Cancelar</button>
        <button type="button" id="v-novo">${ic("mais", "p")}Criar produto com este anúncio</button></div>`}`);
  $("#v-novo", m).onclick = () => abrirProduto(null, depois, {
    nome: a.titulo + (a.variacao ? ` (${a.variacao})` : ""), sku: a.sku || "",
    vincular_item_id: a.item_id, vincular_variacao_id: a.variacao_id || "", vincular_titulo: a.titulo, vincular_sku: a.sku || "" });
  const f = $("#f-vinc", m);
  if (!f) return;
  const busca = $("#v-busca", m), sel = $("#v-prod", m);
  const sugestao = produtos.find((p) => a.sku && p.sku && p.sku.toLowerCase().includes(a.sku.toLowerCase().slice(0, 4)));
  if (sugestao) sel.value = sugestao.id;
  busca.oninput = () => {
    const t = busca.value.trim().toLowerCase();
    [...sel.options].forEach((o) => (o.hidden = t && !o.textContent.toLowerCase().includes(t)));
  };
  busca.focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", f), async () => {
      if (!sel.value) throw new Error("Escolha o produto.");
      await api("/api/financeiro/vinculos", { method: "POST", body: {
        item_id: a.item_id, variacao_id: a.variacao_id || "", todas_variacoes: Boolean(f.todas?.checked),
        produto_id: Number(sel.value), unidades: Number(f.unidades.value || 1), titulo: a.titulo } });
      toast("Anúncio vinculado. As vendas dele já usam o custo do produto.");
      fecharModal();
      await depois();
    });
  };
}

function abrirProduto(p, depois, previa = {}) {
  const d = p || previa;
  const m = modal(`<h2>${ic("pacote", "p")}${p ? "Editar produto" : "Novo produto"}</h2>
    <form id="f-prod" class="pilha">
      <div><label for="p-nome">Nome</label><input id="p-nome" name="nome" type="text" required maxlength="300" value="${h(d.nome || "")}"></div>
      <div class="grade g3">
        <div><label for="p-sku">SKU</label><input id="p-sku" name="sku" type="text" maxlength="80" value="${h(d.sku || "")}"></div>
        <div><label for="p-custo">Custo por unidade (R$)</label><input id="p-custo" name="custo" type="number" step="0.01" min="0" value="${h(d.custo ?? "")}"></div>
        <div><label for="p-emb">Embalagem (R$)</label><input id="p-emb" name="embalagem" type="number" step="0.01" min="0" value="${h(d.embalagem ?? "")}"
          placeholder="padrão"></div></div>
      <div class="aviso azul pequeno" style="margin:0">Toda venda com o <b>mesmo SKU</b> é ligada a este produto automaticamente, em qualquer anúncio.
        ${previa.vincular_item_id ? `O anúncio <b>${h(previa.vincular_item_id)}</b> ${previa.vincular_sku ? "também" : "não tem SKU e"} será vinculado a ele.` : ""}</div>
      <div class="linha" style="justify-content:flex-end;gap:8px"><button type="button" class="sec" data-fechar>Cancelar</button>
        <button type="submit">${ic("salvar", "p")}Salvar</button></div>
    </form>`);
  $("#p-custo", m).focus();
  $("#f-prod", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", m), async () => {
      const f = e.target;
      const corpo = { nome: f.nome.value, sku: f.sku.value, custo: numOuNulo(f.custo.value), embalagem: numOuNulo(f.embalagem.value) };
      if (!p) Object.assign(corpo, { vincular_item_id: previa.vincular_item_id || "", vincular_variacao_id: previa.vincular_variacao_id || "",
        vincular_titulo: previa.vincular_titulo || "", vincular_sku: previa.vincular_sku || "" });
      await api(p ? `/api/financeiro/produtos/${p.id}` : "/api/financeiro/produtos", { method: p ? "PUT" : "POST", body: corpo });
      toast(p ? "Produto salvo." : "Produto cadastrado.");
      fecharModal();
      await depois();
    });
  };
}

function abrirCalculo(x, taxa) {
  const linha = (rotulo, valor, nota = "", forte = false) => `<div class="fluxo-linha extrato ${forte ? "resultado" : ""}"><span>${rotulo}
      ${nota ? `<div class="pequeno suave">${nota}</div>` : ""}</span><b>${valor < 0 ? "− " : ""}${brl(Math.abs(valor))}</b></div>`;
  const prod = x.produto;
  modal(`<h2>${ic("calculadora", "p")}Cálculo da venda</h2>
    <div class="pequeno suave" style="margin-top:-6px">${data(x.data)} · pedido ${h(x.pedido_id)}${x.uf ? ` · comprador de ${h(x.uf)}` : ""}
      ${x.simulada ? ' <span class="selo neutro">simulada</span>' : ""}${seloDevolucao(x.devolucao)}</div>
    <div class="cartao" style="padding:12px 14px;margin:12px 0"><b>${h(x.titulo)}</b>
      <div class="pequeno suave">${x.variacao ? `${h(x.variacao)} · ` : ""}${x.sku ? `SKU ${h(x.sku)} · ` : "sem SKU · "}anúncio ${h(x.item_id)}</div>
      <div class="pequeno" style="margin-top:6px">${prod ? `Produto: <b>${h(prod.nome)}</b> ${prod.via === "sku" ? "(ligado pelo SKU)" : "(vínculo com o anúncio)"}
        ${prod.unidades > 1 ? ` · kit de ${prod.unidades} unidades` : ""}` : '<span class="selo demo">sem vínculo</span> nenhum produto do catálogo; o custo ficou de fora'}</div></div>
    <div class="fluxo">
      ${linha(`Venda (${numero(x.quantidade)} × ${brl(x.preco_unitario)})`, x.total)}
      ${x.reembolso ? linha("Reembolso ao comprador", -x.reembolso, "comissão e imposto acompanham o reembolso") : ""}
      ${x.bonus_ml ? linha("Bônus do Mercado Livre", x.bonus_ml, "parte do cupom ou da campanha paga pelo ML") : ""}
      ${linha("Comissão do Mercado Livre", -x.comissao)}
      ${linha("Frete pago pelo vendedor", -x.frete, x.frete_pendente ? "o ML ainda não informou" : "")}
      ${x.frete_devolucao ? linha("Frete da devolução", -x.frete_devolucao) : ""}
      ${linha("Publicidade (Ads)", -x.ads, "gasto do anúncio no dia, dividido entre as vendas do dia")}
      ${linha("Impostos", -x.imposto, h(x.imposto_detalhe))}
      ${linha("Custo do produto", -(x.custo || 0), x.custo == null ? "sem produto ou sem custo cadastrado" : x.devolucao === "devolvida" && x.produto_voltou && !x.custo ? "o produto voltou para o estoque" : "")}
      ${linha("Embalagem", -x.embalagem)}
      ${linha(`Lucro da venda · margem ${pct(x.margem)}`, x.lucro, "o que a venda deixou antes das despesas fixas", true)}
      ${linha(`Custo operacional (${pct(taxa.pct)} do valor)`, -x.operacional, taxa.pct ? "aluguel, energia, equipe... rateados pelo faturamento" : "cadastre as despesas em Custo operacional")}
      ${linha(`Lucro depois da operação · margem ${pct(x.margem_final)}`, x.lucro_final, "", true)}
    </div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Fechar</button></div>`);
}

const estadoAnalise = { aba: "cliente" };
const NIVEL_ANALISE = { vermelho: ["erro", "Urgente"], amarelo: ["demo", "Atenção"], azul: ["neutro", "Info"], verde: ["ok", "Bom"] };

function variacaoHtml(v, sufixo = " vs. mês anterior") {
  if (v == null) return '<span class="suave">sem mês anterior</span>';
  return `<span class="${v >= 0 ? "positivo" : "negativo"}">${v > 0 ? "+" : ""}${pct(v)}</span>${sufixo}`;
}

function htmlAchado(a) {
  const [selo, rotulo] = NIVEL_ANALISE[a.nivel] || ["neutro", ""];
  const extra = a.itens.some((i) => i.lucro_sem_ads != null) ? ["Lucro sem Ads", "lucro_sem_ads"]
    : a.itens.some((i) => i.variacao != null) ? ["Mês anterior", "faturamento_anterior"] : null;
  return `<div class="cartao achado ${a.nivel}">
    <span class="selo ${selo}">${rotulo}</span>
    <h3 style="margin:8px 0 4px">${h(a.titulo)}</h3><div class="suave">${h(a.texto)}</div>
    ${a.acao ? `<div class="achado-acao">${ic("seta", "p")}<span><b>O que fazer:</b> ${h(a.acao)}</span></div>` : ""}
    ${a.itens.length ? `<div class="tabela" style="margin-top:10px"><table><thead><tr><th>Produto</th><th>Faturamento</th>
      ${extra ? `<th>${extra[0]}</th>` : ""}<th>Ads</th><th>Lucro</th></tr></thead><tbody>${a.itens.map((i) => `<tr>
        <td>${h(i.titulo)}<div class="pequeno suave">${h(i.item_id || "")}${i.sku ? ` · SKU ${h(i.sku)}` : ""}</div></td>
        <td>${brl(i.faturamento)}${i.variacao != null ? `<div class="pequeno negativo">${pct(i.variacao)}</div>` : ""}</td>
        ${extra ? `<td>${brl(i[extra[1]])}</td>` : ""}<td>${i.ads != null ? brl(i.ads) : "—"}</td>
        <td class="${i.lucro < 0 ? "negativo" : ""}">${brl(i.lucro)}${i.margem != null && i.faturamento ? `<div class="pequeno suave">${pct(i.margem)}</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : ""}</div>`;
}

async function telaAnalise(mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const time = eTime();
  if (!time) estadoAnalise.aba = "cliente";
  else if (!estado.clienteId) estadoAnalise.aba = "carteira";
  const abas = time ? `<div class="abas" style="margin-bottom:16px">
      <button data-aba-an="cliente" class="${estadoAnalise.aba === "cliente" ? "ativa" : ""}" ${estado.clienteId ? "" : "disabled"}>${h(clienteAtual()?.nome || "Cliente")}</button>
      <button data-aba-an="carteira" class="${estadoAnalise.aba === "carteira" ? "ativa" : ""}">Todos os clientes</button></div>` : "";
  const topo = (extra = "") => `<div class="topo"><div><h1>Analista de métricas</h1>
      <div class="suave">Lê as vendas, os custos e a publicidade e aponta o que está tirando lucro, comparando com o mês anterior.
        Os números vêm de Vendas e lucro: sincronize as vendas antes.</div></div>
    <div class="linha" style="flex-wrap:wrap"><select id="an-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select>${extra}</div></div>${abas}`;
  const ligar = () => {
    $("#an-mes").onchange = (e) => telaAnalise(e.target.value);
    $$("[data-aba-an]").forEach((b) => (b.onclick = () => { estadoAnalise.aba = b.dataset.abaAn; telaAnalise(mes); }));
  };

  if (estadoAnalise.aba === "carteira") {
    const lista = await api(`/api/analise/carteira?mes=${mes}`);
    $("#tela").innerHTML = topo() + `<div class="cartao">${lista.length ? `<div class="tabela"><table><thead><tr><th>Cliente</th>
      <th>Faturamento</th><th>Lucro antes do Ads</th><th>Ads</th><th>Lucro depois do Ads</th><th>Principal ponto</th><th></th></tr></thead><tbody>
      ${lista.map((c) => { const i = c.indicadores; return `<tr>
        <td><b>${h(c.cliente.nome)}</b><div class="pequeno suave">${c.sincronizado_em ? `sincronizado ${data(c.sincronizado_em)}` : "vendas não sincronizadas"}</div></td>
        <td>${brl(i.faturamento)}<div class="pequeno">${c.variacao_faturamento != null ? variacaoHtml(c.variacao_faturamento, "") : ""}</div></td>
        <td>${brl(i.lucro_antes_ads)}</td><td>${brl(i.ads)}<div class="pequeno suave">${i.faturamento ? pct(i.tacos) : ""}</div></td>
        <td class="${i.lucro < 0 ? "negativo" : ""}"><b>${brl(i.lucro)}</b><div class="pequeno suave">${i.faturamento ? `margem ${pct(i.margem)}` : ""}</div></td>
        <td>${c.vermelhos ? `<span class="selo erro">${c.vermelhos} urgente(s)</span> ` : ""}${c.amarelos ? `<span class="selo demo">${c.amarelos} atenção</span>` : ""}
          <div class="pequeno suave">${h(c.principal || (i.pedidos ? "Nada crítico" : ""))}</div></td>
        <td style="text-align:right"><button class="sec pequeno" data-ver-cliente="${c.cliente.id}">Analisar</button></td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("brilho", "Nenhum cliente para analisar", "Os clientes que você acompanha aparecem aqui.")}</div>`;
    ligar();
    $$("[data-ver-cliente]").forEach((b) => (b.onclick = () => {
      trocarCliente(+b.dataset.verCliente, { navegar: false });
      estadoAnalise.aba = "cliente";
      telaAnalise(mes);
    }));
    return;
  }

  const r = await api(`/api/financeiro/analise?mes=${mes}`);
  const i = r.indicadores, v = r.variacao, res = r.resumo;
  const kpi = (rotulo, valor, detalhe, cls = "") => `<div class="cartao kpi-bloco"><span class="rotulo">${rotulo}</span>
      <div class="valor ${cls}">${valor}</div><div class="pequeno suave">${detalhe}</div></div>`;
  $("#tela").innerHTML = topo(r.ia_disponivel && i.pedidos ? `<button id="an-ia">${ic("brilho", "p")}Resumo com IA</button>` : "") + `
    ${r.simuladas ? `<div class="aviso azul">${numero(r.simuladas)} venda(s) simulada(s) entram nesta análise.</div>` : ""}
    <div class="cartao resumo-analise">
      <div class="linha entre"><h2 style="margin:0">${ic("brilho", "p")}Resumo do mês</h2>
        <span class="selo ${res.fonte === "ia" ? "ok" : "neutro"}" id="an-fonte">${res.fonte === "ia" ? "escrito pela IA" : "regras"}</span></div>
      <p style="margin:10px 0 0" id="an-texto">${h(res.resumo)}</p>
      <ol class="prioridades" id="an-prioridades" ${res.prioridades.length ? "" : "hidden"}>${res.prioridades.map((p) => `<li>${h(p)}</li>`).join("")}</ol>
      ${r.sincronizacao ? `<p class="pequeno suave" style="margin:10px 0 0">Vendas sincronizadas ${data(r.sincronizacao.feita_em)}
        ${r.sincronizacao.demo ? ' <span class="selo demo">demonstração</span>' : ""}</p>`
        : `<p class="pequeno" style="margin:10px 0 0"><a href="#/lucro/${mes}">Sincronizar as vendas deste mês</a></p>`}
    </div>
    ${i.pedidos ? `<div class="grade g4" style="margin-top:16px">
      ${kpi("Faturamento", brl(i.faturamento), variacaoHtml(v.faturamento))}
      ${kpi("Lucro antes do Ads", brl(i.lucro_antes_ads), variacaoHtml(v.lucro_antes_ads), i.lucro_antes_ads < 0 ? "negativo" : "")}
      ${kpi("Publicidade", brl(i.ads), `${pct(i.tacos)} do faturamento${i.roas ? ` · ROAS ${String(i.roas).replace(".", ",")}` : ""}`)}
      ${kpi("Lucro depois do Ads", brl(i.lucro), `margem ${pct(i.margem)} · ${variacaoHtml(v.lucro, "")}`, i.lucro < 0 ? "negativo" : "positivo")}
    </div>` : ""}
    <div class="achados">${r.achados.map(htmlAchado).join("")}</div>`;
  ligar();
  const botaoIa = $("#an-ia");
  if (botaoIa) botaoIa.onclick = () => comBotao(botaoIa, async () => {
    const novo = (await api(`/api/financeiro/analise?mes=${mes}&ia=true`)).resumo;
    $("#an-texto").textContent = novo.resumo;
    $("#an-fonte").className = `selo ${novo.fonte === "ia" ? "ok" : "neutro"}`;
    $("#an-fonte").textContent = novo.fonte === "ia" ? "escrito pela IA" : "regras";
    $("#an-prioridades").innerHTML = novo.prioridades.map((p) => `<li>${h(p)}</li>`).join("");
    $("#an-prioridades").hidden = !novo.prioridades.length;
    if (novo.aviso) toast(novo.aviso, true);
  });
}

async function telaLucro(mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const r = await api(`/api/financeiro/lucro?mes=${mes}`);
  const t = r.totais, sinc = r.sincronizacao;
  const recarregar = () => telaLucro(mes);
  const kpi = (rotulo, valor, detalhe, icone, cls = "") => `<div class="cartao kpi-bloco">
      <div class="linha entre"><span class="rotulo">${rotulo}</span><span class="kpi-ic">${ic(icone, "p")}</span></div>
      <div class="valor ${cls}">${valor}</div><div class="pequeno suave">${detalhe}</div></div>`;
  const barra = (rotulo, valor, cls = "") => {
    const parte = t.total ? Math.min(Math.abs(valor) / t.total * 100, 100) : 0;
    return `<div class="fluxo-linha ${cls}"><span>${rotulo}</span>
      <div class="fluxo-barra"><i style="width:${parte.toFixed(1)}%"></i></div>
      <b>${valor < 0 ? "− " : ""}${brl(Math.abs(valor))}</b><span class="suave">${t.total ? pct(Math.abs(valor) / t.total * 100) : "—"}</span></div>`;
  };
  const ACAO_ALERTA = { vinculo: ["#/produtos", "Vincular agora"], custo: ["#/produtos", "Cadastrar custos"], impostos: ["#/impostos", "Configurar"],
    tributacao: ["#/impostos", "Importar planilha"] };
  const temDados = sinc || r.vendas.length;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Vendas e lucro</h1>
      <div class="suave">Quanto ficou no bolso de <b>${h(clienteAtual()?.nome)}</b> no Mercado Livre, na Shopee e na Amazon, venda a venda: comissão, frete,
        publicidade e devoluções cobrados pelo marketplace, impostos (${h(REGIME[r.config.regime])}), custo e embalagem.</div></div>
    <div class="linha" style="flex-wrap:wrap"><select id="l-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select>
      <select id="l-plat" aria-label="Plataforma" style="width:auto"><option value="mercadolivre">Mercado Livre</option>
        <option value="shopee" ${estadoLucro.plataforma === "shopee" ? "selected" : ""}>Shopee</option>
        <option value="amazon" ${estadoLucro.plataforma === "amazon" ? "selected" : ""}>Amazon</option></select>
      <button id="l-sinc">${ic("trocar", "p")}Sincronizar vendas</button></div></div>
    ${Object.entries(r.sincronizacoes || {}).map(([plat, x]) => `<p class="pequeno suave" style="margin:2px 0">${NOME_PLATAFORMA[plat] || h(plat)}:
      sincronizado ${data(x.feita_em)} · ${numero(x.pedidos)} pedido(s)${x.demo ? ' <span class="selo demo">demonstração</span>' : ""}
      ${r.por_plataforma?.[plat] ? ` · ${brl(r.por_plataforma[plat].total)} faturados, ${brl(r.por_plataforma[plat].lucro)} de lucro nas vendas` : ""}</p>`).join("")}
    ${Object.values(r.sincronizacoes || {}).flatMap((x) => x.avisos || []).map((a) => `<div class="aviso amarelo">${h(a)}</div>`).join("")}
    ${!temDados ? `<div class="cartao">${vazio("cifrao", "Vendas deste mês ainda não sincronizadas",
      "Escolha a plataforma e clique em Sincronizar vendas para puxar os pedidos.")}</div>` : `
    ${r.alertas.map((a) => `<div class="aviso ${a.nivel} linha entre" style="gap:10px"><span>${h(a.texto)}</span>
      ${ACAO_ALERTA[a.tipo] ? `<a href="${ACAO_ALERTA[a.tipo][0]}">${ACAO_ALERTA[a.tipo][1]}</a>` : ""}
      ${a.tipo === "simulacao" ? '<button class="sec pequeno" id="l-apagar-sim">Apagar simulações</button>' : ""}</div>`).join("")}
    <div class="grade g4">
      ${kpi("Faturamento", brl(t.total), `${numero(t.pedidos)} pedido(s) · ${numero(t.unidades)} unid. · ticket ${brl(t.ticket_medio)}`, "cifrao")}
      ${kpi("Lucro das vendas", brl(t.lucro), `margem de ${pct(t.margem)}${t.sem_vinculo || t.sem_custo ? " · incompleto: há vendas sem custo" : ""}`,
        "calculadora", t.lucro < 0 ? "negativo" : "positivo")}
      ${kpi("Resultado do mês", brl(t.resultado), t.despesas
        ? `${t.resultado < 0 ? "no vermelho" : "no azul"} depois de ${brl(t.despesas)} de despesas${t.ponto_equilibrio ? ` · equilíbrio em ${brl(t.ponto_equilibrio)} de vendas` : ""}`
        : '<a href="#/despesas">Cadastre as despesas da operação</a> para ver o resultado real', "atividade", t.resultado < 0 ? "negativo" : "positivo")}
      ${kpi("Publicidade", brl(t.ads_total), `${pct(t.tacos)} do faturamento (TACoS)${t.roas ? ` · ROAS ${String(t.roas).replace(".", ",")}` : ""}`, "alvo")}
    </div>
    <div class="cartao" style="margin-top:16px"><h3 style="margin-top:0">Para onde foi o dinheiro</h3>
      <div class="fluxo">
        ${barra("Vendas", t.total, "entrada")}
        ${t.reembolso ? barra(`Reembolsos (${numero(t.devolucoes)} devolução(ões))`, -t.reembolso) : ""}
        ${t.bonus_ml ? barra("Bônus do ML (cupons e campanhas)", t.bonus_ml) : ""}
        ${barra("Comissão do Mercado Livre", -t.comissao)}
        ${barra("Frete pago pelo vendedor", -t.frete)}
        ${t.frete_devolucao ? barra("Frete de devoluções", -t.frete_devolucao) : ""}
        ${barra("Publicidade (Ads)", -t.ads_total)}
        ${barra("Impostos", -t.imposto)}
        ${barra("Custo dos produtos", -t.custo)}
        ${barra("Embalagem", -t.embalagem)}
        ${barra("Lucro das vendas", t.lucro, t.lucro < 0 ? "resultado negativo" : "resultado")}
        ${barra(`Custo operacional (${numero(r.despesas.length)} despesa(s) do mês)`, -t.despesas)}
        ${barra("Resultado do mês", t.resultado, t.resultado < 0 ? "resultado negativo" : "resultado")}
      </div>
      <p class="pequeno suave" style="margin-bottom:0">${t.despesas ? `Para ficar no zero a zero com as despesas deste mês, a loja precisa vender
        ${t.ponto_equilibrio ? `<b>${brl(t.ponto_equilibrio)}</b> no mês, mantendo a margem atual` : "com margem positiva: hoje cada venda não cobre nem os próprios custos"}.
        Em cada venda, o custo operacional entra como <b>${pct(r.taxa_operacional.pct)}</b> do valor
        (${r.taxa_operacional.base === "media" ? `média de ${r.taxa_operacional.meses.length} mês(es) anterior(es)` : "base: este mês"}).`
        : 'Sem despesas cadastradas neste mês: o resultado é igual ao lucro das vendas. <a href="#/despesas">Cadastrar despesas</a>.'}</p>
      ${t.ads_sem_venda ? `<p class="pequeno suave" style="margin-bottom:0">Da publicidade, ${brl(t.ads_sem_venda)} foram gastos em dias em que o anúncio
        não vendeu: sai do lucro do mês, mas não de uma venda específica.</p>` : ""}
      ${t.canceladas ? `<p class="pequeno suave" style="margin-bottom:0">${numero(t.canceladas)} pedido(s) cancelado(s) no mês
        (${brl(t.valor_cancelado)}), fora da conta.</p>` : ""}
    </div>
    <div class="cartao" style="margin-top:16px">
      <div class="linha entre" style="flex-wrap:wrap;gap:10px">
        <div class="abas" style="margin-bottom:0;border:none">
          <button data-aba="produtos" class="${estadoLucro.aba === "produtos" ? "ativa" : ""}">Por produto (${r.por_produto.length})</button>
          <button data-aba="vendas" class="${estadoLucro.aba === "vendas" ? "ativa" : ""}">Por venda (${r.vendas.length})</button></div>
        <div class="linha" style="gap:8px;flex-wrap:wrap">
          <select id="l-visao" aria-label="Qual lucro mostrar" style="width:auto">
            <option value="">Lucro da venda</option>
            <option value="op" ${estadoLucro.comOperacional ? "selected" : ""}>Lucro depois do custo operacional (${pct(r.taxa_operacional.pct)})</option></select>
          <input id="l-busca" type="search" placeholder="Filtrar por produto, SKU ou pedido" value="${h(estadoLucro.busca)}" style="max-width:260px"></div>
      </div>
      <div id="l-tabela" style="margin-top:14px"></div>
    </div>`}`;
  $("#l-mes").onchange = () => { location.hash = "#/lucro/" + $("#l-mes").value; };
  $("#l-plat").onchange = () => { estadoLucro.plataforma = $("#l-plat").value; };
  $("#l-sinc").onclick = () => comBotao($("#l-sinc"), async () => {
    const s = await api(`/api/financeiro/sincronizar?mes=${mes}&plataforma=${$("#l-plat").value}`, { method: "POST" });
    toast(`${numero(s.pedidos)} pedido(s) sincronizado(s)${s.demo ? " (demonstração)" : ""}.`);
    await recarregar();
  });
  const apagarSim = $("#l-apagar-sim");
  if (apagarSim) apagarSim.onclick = () => comBotao(apagarSim, async () => {
    const x = await api("/api/financeiro/simulacoes", { method: "DELETE" });
    toast(`${x.apagadas} venda(s) simulada(s) apagada(s).`);
    await recarregar();
  });
  if (!temDados) return;
  const anuncioDe = (x) => ({ item_id: x.item_id, variacao_id: x.variacao_id, variacao: x.variacao, titulo: x.titulo, sku: x.sku });
  const desenhar = () => {
    const termo = estadoLucro.busca.trim().toLowerCase();
    const bate = (x) => !termo || [x.titulo, x.sku, x.item_id, x.pedido_id, x.variacao, x.produto?.nome].some((v) => String(v || "").toLowerCase().includes(termo));
    const min = r.margem_baixa_pct;
    const ver = (x) => (estadoLucro.comOperacional ? { ...x, lucro: x.lucro_final, margem: x.margem_final } : x);
    const botaoVincular = (i) => `<button class="sec pequeno" data-vincular="${i}">Vincular</button>`;
    if (estadoLucro.aba === "produtos") {
      const lista = r.por_produto.filter(bate);
      $("#l-tabela").innerHTML = lista.length ? `<div class="tabela-margem"><table><thead><tr><th>Produto</th><th>Unid.</th><th>Vendas</th>
        <th>ML (comissão + fretes)</th><th>Ads</th><th>Imposto</th><th>Custo + emb.</th><th>Lucro</th><th>Margem</th></tr></thead><tbody>
        ${lista.map((p, i) => `<tr><td>${h(p.titulo)}<div class="pequeno suave">${p.sem_vinculo
          ? `anúncio ${h(p.item_id)}${p.variacao ? ` · ${h(p.variacao)}` : ""}${p.sku ? ` · SKU ${h(p.sku)}` : ""} · ${botaoVincular(i)}`
          : `${p.sku ? `SKU ${h(p.sku)}` : "sem SKU"}${p.anuncios > 1 ? ` · ${p.anuncios} anúncios` : ""}`}</div></td>
          <td>${numero(p.unidades)}</td><td>${brl(p.total)}${p.reembolso ? `<div class="pequeno negativo">− ${brl(p.reembolso)} reemb.</div>` : ""}</td>
          <td>${brl(p.comissao + p.frete + p.frete_devolucao)}</td><td>${brl(p.ads)}</td><td>${brl(p.imposto)}</td>
          <td>${p.sem_vinculo || p.sem_custo ? "—" : brl(p.custo + p.embalagem)}</td><td class="${ver(p).lucro < 0 ? "negativo" : ""}"><b>${brl(ver(p).lucro)}</b></td>
          <td>${seloMargem(ver(p), min)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="suave pequeno">Nada encontrado.</p>';
      $$("[data-vincular]").forEach((b) => (b.onclick = () => abrirVincular(anuncioDe(lista[+b.dataset.vincular]), r.produtos, recarregar)));
    } else {
      const lista = r.vendas.filter(bate);
      $("#l-tabela").innerHTML = lista.length ? `<div class="tabela-margem"><table><thead><tr><th>Data</th><th>Venda</th><th>UF</th><th>Qtd</th>
        <th>Valor</th><th>Comissão</th><th>Frete</th><th>Ads</th><th>Imposto</th><th>Custo + emb.</th><th>Lucro</th><th>Margem</th><th></th></tr></thead><tbody>
        ${lista.map((x, i) => `<tr class="${x.valida ? "" : "cancelada"}"><td>${data(x.data)}</td>
          <td>${h(x.titulo)}${x.plataforma && x.plataforma !== "mercadolivre" ? ` <span class="selo ${x.plataforma}">${NOME_PLATAFORMA[x.plataforma] || h(x.plataforma)}</span>` : ""}${x.simulada ? ' <span class="selo neutro">simulada</span>' : ""}${seloDevolucao(x.devolucao)}
            <div class="pequeno suave">${x.variacao ? `${h(x.variacao)} · ` : ""}${x.sku ? `SKU ${h(x.sku)}` : "sem SKU"} ·
              ${x.produto ? `produto <b>${h(x.produto.nome)}</b>${x.produto.unidades > 1 ? ` (kit ${x.produto.unidades})` : ""}` : `sem vínculo · ${botaoVincular(i)}`}</div></td>
          <td>${h(x.uf) || "—"}</td><td>${numero(x.quantidade)}</td>
          <td>${brl(x.total)}${x.reembolso ? `<div class="pequeno negativo">− ${brl(x.reembolso)}</div>` : ""}</td><td>${brl(x.comissao)}</td>
          <td>${x.frete_pendente ? '<span class="suave" title="O Mercado Livre ainda não informou o custo do envio">pendente</span>' : brl(x.frete)}
            ${x.frete_devolucao ? `<div class="pequeno negativo">+ ${brl(x.frete_devolucao)} devol.</div>` : ""}</td>
          <td>${brl(x.ads)}</td><td title="${h(x.imposto_detalhe)}">${brl(x.imposto)}</td><td>${x.custo == null ? "—" : brl(x.custo + x.embalagem)}</td>
          <td class="${ver(x).lucro < 0 && x.valida ? "negativo" : ""}">${x.valida ? `<b>${brl(ver(x).lucro)}</b>` : "—"}</td>
          <td>${x.valida ? seloMargem(ver(x), min) : '<span class="selo neutro">cancelada</span>'}</td>
          <td>${x.valida ? `<button class="sec pequeno" data-calculo="${i}">Ver cálculo</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="suave pequeno">Nada encontrado.</p>';
      $$("[data-vincular]").forEach((b) => (b.onclick = () => abrirVincular(anuncioDe(lista[+b.dataset.vincular]), r.produtos, recarregar)));
      $$("[data-calculo]").forEach((b) => (b.onclick = () => abrirCalculo(lista[+b.dataset.calculo], r.taxa_operacional)));
    }
  };
  $$("[data-aba]").forEach((b) => (b.onclick = () => {
    estadoLucro.aba = b.dataset.aba;
    $$("[data-aba]").forEach((o) => o.classList.toggle("ativa", o === b));
    desenhar();
  }));
  $("#l-busca").oninput = (e) => { estadoLucro.busca = e.target.value; desenhar(); };
  $("#l-visao").onchange = (e) => { estadoLucro.comOperacional = e.target.value === "op"; desenhar(); };
  desenhar();
}

async function telaProdutos() {
  const [cat, cfg] = await Promise.all([api("/api/financeiro/produtos"), api("/api/financeiro/config")]);
  const num = (v) => (v == null ? "" : String(v));
  const listaSimples = cat.produtos.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku }));
  const prec = cat.precificacao;
  const sv = cat.sem_vinculo;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Produtos e custos</h1>
    <div class="suave">O catálogo de <b>${h(clienteAtual()?.nome)}</b>: quanto cada produto custa e quanto gasta de embalagem.
      As vendas do Mercado Livre chegam aos produtos sozinhas pelo SKU.</div></div>
    <div class="linha" style="flex-wrap:wrap"><button class="sec" id="p-importar">${ic("enviar", "p")}Importar do Mercado Livre</button>
      <button id="p-novo">${ic("mais", "p")}Novo produto</button></div></div>

  <div class="cartao passos-vinculo">
    <div><b>1. Pelo SKU (automático)</b><span class="pequeno suave">A venda com o SKU igual ao do produto entra no custo dele, em qualquer anúncio ou variação.</span></div>
    <div><b>2. Pelo vínculo</b><span class="pequeno suave">Anúncio sem SKU ou com SKU diferente: vincule uma vez e as próximas vendas já entram.</span></div>
    <div><b>3. Kit</b><span class="pequeno suave">No vínculo, diga quantas unidades do produto saem em cada venda. O custo é multiplicado.</span></div>
  </div>

  ${sv.length ? `<div class="cartao" style="margin-top:16px;border-color:var(--amarelo)">
    <h3 style="margin-top:0">${ic("alerta", "p")}Anúncios vendidos sem vínculo (${sv.length})</h3>
    <p class="pequeno suave">Essas vendas ainda não sabem o custo do produto, então o lucro delas aparece maior do que o real.</p>
    <div class="tabela-margem"><table><thead><tr><th>Anúncio</th><th>SKU na venda</th><th>Vendidas</th><th>Faturamento</th><th></th></tr></thead><tbody>
      ${sv.map((a, i) => `<tr><td>${h(a.titulo)}${a.simulada ? ' <span class="selo neutro">simulada</span>' : ""}
        <div class="pequeno suave">${a.variacao ? `${h(a.variacao)} · ` : ""}anúncio ${h(a.item_id)}</div></td>
        <td>${a.sku ? `${h(a.sku)} <span class="pequeno suave">(não cadastrado)</span>` : '<span class="suave">sem SKU</span>'}</td>
        <td>${numero(a.vendas)}</td><td>${brl(a.faturamento)}</td>
        <td style="text-align:right;white-space:nowrap"><button class="sec pequeno" data-sv-vincular="${i}">Vincular</button>
          <button class="pequeno" data-sv-criar="${i}">Criar produto</button></td></tr>`).join("")}</tbody></table></div>
  </div>` : ""}

  <div class="cartao" style="margin-top:16px">
    <div class="linha entre" style="flex-wrap:wrap;gap:10px"><h3 style="margin:0">Produtos (${cat.produtos.length})</h3>
      <div class="linha" style="gap:14px;flex-wrap:wrap">
        <label class="linha pequeno" style="gap:6px;font-weight:500;margin:0">Margem desejada (%)
          <input id="p-margem" type="number" step="0.5" min="0" max="60" value="${h(margemSalva())}" style="width:70px"></label>
        <label class="linha pequeno" style="gap:6px;font-weight:500;margin:0">Embalagem padrão (R$)
          <input id="p-emb-padrao" type="number" step="0.01" min="0" value="${num(cfg.embalagem_padrao)}" style="width:90px"></label></div></div>
    <details class="pequeno" style="margin-top:10px"><summary>Como o preço mínimo é calculado</summary>
      <p class="suave" style="margin:8px 0 0">Preço mínimo = (custo + embalagem + frete por unidade) ÷ (1 − comissão − imposto − publicidade
        − custo operacional − margem desejada). Comissão, imposto, publicidade e frete saem das vendas do próprio produto nos últimos 90 dias;
        sem vendas, usa comissão de ${pct(prec.padrao.comissao_pct)}, o imposto da loja e frete zero (marcado como estimativa).
        O custo operacional é <b>${pct(prec.taxa_operacional.pct)}</b> do preço: as despesas da operação divididas pelo faturamento
        ${prec.taxa_operacional.meses.length ? `(${prec.taxa_operacional.meses.join(", ")})` : "(cadastre as despesas em Custo operacional)"}.
        Acima de R$ 79 o frete grátis é obrigatório: se o preço mínimo passar desse valor, confira o frete.</p></details>
    ${cat.produtos.length ? `<div class="linha entre" style="margin:12px 0 8px;flex-wrap:wrap;gap:8px">
        <input id="p-busca" type="search" placeholder="Filtrar por nome ou SKU" style="max-width:280px">
        <label class="linha pequeno" style="gap:6px;font-weight:500;margin:0"><input type="checkbox" id="p-sem" style="width:auto"> Só sem custo (${cat.sem_custo})</label></div>
      <div class="tabela-margem"><table><thead><tr><th>Produto</th><th>Anúncios ligados</th><th>Vendidas</th><th>Custo (R$)</th><th>Embalagem (R$)</th>
        <th title="Preço médio por unidade nos últimos 90 dias">Preço médio</th><th>Preço mínimo</th><th></th></tr></thead>
      <tbody>${cat.produtos.map((p, i) => `<tr data-linha="${i}"><td><b>${h(p.nome)}</b><div class="pequeno suave">${p.sku ? `SKU ${h(p.sku)}` : "sem SKU (só por vínculo)"}</div></td>
        <td>${p.anuncios.length ? `<details><summary class="pequeno">${p.anuncios.length} anúncio(s)</summary>${p.anuncios.map((a) => `<div class="pequeno anuncio-ligado">
            ${h(a.item_id)}${a.variacao ? ` · ${h(a.variacao)}` : ""} · ${a.via === "sku" ? "pelo SKU" : `vínculo${a.unidades > 1 ? ` (kit ${a.unidades})` : ""}
            <button type="button" class="link-btn" data-desvincular="${h(a.item_id)}" data-variacao="${h(a.variacao_id || "")}">desfazer</button>`}</div>`).join("")}</details>`
          : '<span class="pequeno suave">nenhum ainda</span>'}</td>
        <td>${numero(p.vendidas)}</td>
        <td><input type="number" step="0.01" min="0" data-custo value="${num(p.custo)}" style="width:110px" aria-label="Custo de ${h(p.nome)}"></td>
        <td><input type="number" step="0.01" min="0" data-emb value="${num(p.embalagem)}" placeholder="${h(num(cfg.embalagem_padrao))}" style="width:100px"
          aria-label="Embalagem de ${h(p.nome)}"></td>
        <td>${p.historico ? brl(p.historico.preco_medio) : '<span class="suave">—</span>'}</td><td data-preco-min></td>
        <td style="white-space:nowrap;text-align:right"><button class="sec pequeno" data-editar="${i}" title="Editar">${ic("lapis")}</button>
          <button class="sec pequeno perigo-txt" data-excluir="${i}" title="Excluir">${ic("lixo")}</button></td></tr>`).join("")}</tbody></table></div>
      <div class="linha" style="justify-content:flex-end;margin-top:12px"><button id="p-salvar">${ic("salvar", "p")}Salvar custos</button></div>`
      : vazio("pacote", "Nenhum produto cadastrado", "Importe os anúncios do Mercado Livre ou cadastre à mão. Custo e embalagem são por unidade.")}
  </div>`;

  const recarregar = () => telaProdutos();
  $("#p-novo").onclick = () => abrirProduto(null, recarregar);
  $("#p-importar").onclick = () => comBotao($("#p-importar"), async () => {
    const r = await api("/api/financeiro/produtos/importar", { method: "POST" });
    toast(`${r.criados} produto(s) novo(s) de ${r.anuncios} anúncio(s)${r.ja_cadastrados ? `; ${r.ja_cadastrados} já estavam no catálogo` : ""}${r.demo ? " (demonstração)" : ""}.`);
    await recarregar();
  });
  $$("[data-sv-vincular]").forEach((b) => (b.onclick = () => abrirVincular(sv[+b.dataset.svVincular], listaSimples, recarregar)));
  $$("[data-sv-criar]").forEach((b) => (b.onclick = () => {
    const a = sv[+b.dataset.svCriar];
    abrirProduto(null, recarregar, { nome: a.titulo + (a.variacao ? ` (${a.variacao})` : ""), sku: a.sku, vincular_item_id: a.item_id,
      vincular_variacao_id: a.variacao_id, vincular_titulo: a.titulo, vincular_sku: a.sku });
  }));
  $("#p-emb-padrao").onchange = async (e) => {
    const { padroes, ...corpo } = cfg;
    try {
      await api("/api/financeiro/config", { method: "PUT", body: { ...corpo, embalagem_padrao: Number(e.target.value || 0) } });
      $$("[data-emb]").forEach((i) => (i.placeholder = e.target.value));
      toast("Embalagem padrão salva. Vale para produtos sem embalagem própria.");
    } catch (err) { toast(err.message, true); }
  };
  $$("[data-desvincular]").forEach((b) => (b.onclick = async () => {
    try {
      await api(`/api/financeiro/vinculos?item_id=${encodeURIComponent(b.dataset.desvincular)}&variacao_id=${encodeURIComponent(b.dataset.variacao)}`, { method: "DELETE" });
      toast("Vínculo desfeito.");
      await recarregar();
    } catch (err) { toast(err.message, true); }
  }));
  if (!cat.produtos.length) return;
  $$("[data-editar]").forEach((b) => (b.onclick = () => abrirProduto(cat.produtos[+b.dataset.editar], recarregar)));
  $$("[data-excluir]").forEach((b) => (b.onclick = async () => {
    const p = cat.produtos[+b.dataset.excluir];
    if (!confirm(`Excluir “${p.nome}”? Os vínculos dele também saem e as vendas ficam sem custo.`)) return;
    try { await api(`/api/financeiro/produtos/${p.id}`, { method: "DELETE" }); toast("Produto excluído."); await recarregar(); }
    catch (err) { toast(err.message, true); }
  }));
  const filtrar = () => {
    const termo = $("#p-busca").value.trim().toLowerCase(), so = $("#p-sem").checked;
    $$("[data-linha]").forEach((tr) => {
      const p = cat.produtos[+tr.dataset.linha];
      tr.hidden = Boolean((termo && !`${p.nome} ${p.sku}`.toLowerCase().includes(termo)) || (so && $("[data-custo]", tr).value !== ""));
    });
  };
  $("#p-busca").oninput = filtrar;
  $("#p-sem").onchange = filtrar;
  const precos = () => {
    const margem = Number($("#p-margem").value || 0), embPadrao = Number($("#p-emb-padrao").value || 0);
    try { localStorage.setItem("rpq_margem", String(margem)); } catch {}
    $$("[data-linha]").forEach((tr) => {
      const p = cat.produtos[+tr.dataset.linha], hist = p.historico;
      const custo = numOuNulo($("[data-custo]", tr).value), emb = numOuNulo($("[data-emb]", tr).value) ?? embPadrao;
      const cel = $("[data-preco-min]", tr);
      if (custo == null) { cel.innerHTML = '<span class="suave">informe o custo</span>'; return; }
      const pcts = (hist ? hist.comissao_pct + hist.imposto_pct + hist.ads_pct : prec.padrao.comissao_pct + prec.padrao.imposto_pct)
        + prec.taxa_operacional.pct + margem;
      const base = custo + emb + (hist ? hist.frete_unidade : 0);
      if (pcts >= 100) { cel.innerHTML = '<span class="negativo pequeno">impossível: os percentuais passam de 100%</span>'; return; }
      const minimo = base / (1 - pcts / 100);
      const abaixo = hist && hist.preco_medio < minimo;
      cel.innerHTML = `<b class="${abaixo ? "negativo" : ""}">${brl(minimo)}</b>${hist ? "" : '<div class="pequeno suave">estimativa</div>'}
        ${abaixo ? '<div class="pequeno negativo">vendendo abaixo</div>' : ""}`;
      cel.title = `(${brl(custo)} custo + ${brl(emb)} embalagem${hist ? ` + ${brl(hist.frete_unidade)} frete` : ""}) ÷ (1 − ${pct(pcts)})`;
    });
  };
  $("#p-margem").oninput = precos;
  $$("[data-custo], [data-emb]").forEach((i) => i.addEventListener("input", precos));
  precos();
  $("#p-salvar").onclick = () => comBotao($("#p-salvar"), async () => {
    const itens = $$("[data-linha]").map((tr) => {
      const p = cat.produtos[+tr.dataset.linha];
      const custo = numOuNulo($("[data-custo]", tr).value), embalagem = numOuNulo($("[data-emb]", tr).value);
      return custo !== p.custo || embalagem !== p.embalagem ? { id: p.id, custo, embalagem } : null;
    }).filter(Boolean);
    if (!itens.length) return toast("Nenhum custo alterado.");
    const r = await api("/api/financeiro/custos", { method: "PUT", body: { itens } });
    toast(`${r.alterados} custo(s) salvo(s). O lucro de todos os meses já usa os valores novos.`);
    await recarregar();
  });
}

async function telaDespesas(mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const d = await api(`/api/financeiro/despesas?mes=${mes}`);
  const recarregar = () => telaDespesas(mes);
  const tx = d.taxa;
  const opcoesCat = (sel) => Object.entries(d.categorias).map(([v, n]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${h(n)}</option>`).join("");
  $("#tela").innerHTML = `<div class="topo"><div><h1>Custo operacional</h1>
    <div class="suave">Tudo o que <b>${h(clienteAtual()?.nome)}</b> gasta para a operação rodar e que não sai de uma venda específica:
      aluguel, energia, equipe, sistemas, contador. Sai do lucro das vendas para dar o resultado real do mês.</div></div>
    <select id="d-mes" aria-label="Mês">${meses.map(([v, rot]) => `<option value="${v}" ${v === mes ? "selected" : ""}>${rot}</option>`).join("")}</select></div>
  <div class="grade g3">
    <div class="cartao kpi-bloco"><span class="rotulo">Despesas do mês</span><div class="valor">${brl(d.total)}</div>
      <div class="pequeno suave">${numero(d.itens.length)} lançamento(s)</div></div>
    <div class="cartao kpi-bloco"><span class="rotulo">Custo operacional sobre as vendas</span><div class="valor">${pct(tx.pct)}</div>
      <div class="pequeno suave">${tx.meses.length ? `${brl(tx.despesas)} ÷ ${brl(tx.faturamento)} vendidos (${tx.meses.join(", ")})` : "precisa de vendas sincronizadas"}</div></div>
    <div class="cartao kpi-bloco"><span class="rotulo">Em cada R$ 100 vendidos</span><div class="valor">${brl(tx.pct)}</div>
      <div class="pequeno suave">vão para pagar a operação. Esse valor entra no preço mínimo dos produtos.</div></div>
  </div>
  <form class="cartao" id="f-desp" style="margin-top:16px">
    <h3 style="margin-top:0">Lançar despesa</h3>
    <div class="grade g4">
      <div><label for="d-desc">Descrição</label><input id="d-desc" name="descricao" type="text" maxlength="200" required placeholder="Ex.: aluguel do galpão"></div>
      <div><label for="d-cat">Categoria</label><select id="d-cat" name="categoria">${opcoesCat("aluguel")}</select></div>
      <div><label for="d-valor">Valor no mês (R$)</label><input id="d-valor" name="valor" type="number" step="0.01" min="0.01" required></div>
      <div><label for="d-tipo">Repetição</label><select id="d-tipo" name="fixa"><option value="1">Fixa: todo mês a partir de agora</option>
        <option value="0">Só neste mês</option></select></div>
    </div>
    <div class="linha" style="justify-content:flex-end;margin-top:10px"><button type="submit">${ic("mais", "p")}Lançar</button></div>
  </form>
  <div class="cartao" style="margin-top:16px">${d.itens.length ? `<div class="tabela-margem"><table><thead><tr><th>Despesa</th><th>Categoria</th>
      <th>Repetição</th><th>Valor</th><th></th></tr></thead><tbody>${d.itens.map((x, i) => `<tr><td><b>${h(x.descricao)}</b></td>
      <td>${h(d.categorias[x.categoria] || x.categoria)}</td>
      <td class="pequeno">${x.fixa ? `fixa desde ${h(x.mes_inicio)}${x.mes_fim ? ` até ${h(x.mes_fim)}` : ""}` : "só neste mês"}</td>
      <td><input type="number" step="0.01" min="0.01" value="${x.valor}" data-valor="${i}" style="width:120px" aria-label="Valor de ${h(x.descricao)}"></td>
      <td style="text-align:right;white-space:nowrap"><button class="sec pequeno perigo-txt" data-remover="${i}"
        title="${x.fixa && x.mes_inicio < mes ? "Encerra a partir deste mês (os meses anteriores continuam com ela)" : "Excluir"}">
        ${x.fixa && x.mes_inicio < mes ? "Encerrar" : ic("lixo")}</button></td></tr>`).join("")}
      <tr><td colspan="3"><b>Total</b></td><td><b>${brl(d.total)}</b></td><td></td></tr></tbody></table></div>
      <p class="pequeno suave" style="margin-bottom:0">Mudar o valor de uma despesa fixa muda todos os meses em que ela vale. Se o valor mudou só
        a partir de agora, encerre a antiga e lance a nova.</p>`
    : vazio("loja", "Nenhuma despesa neste mês", "Lance aluguel, energia, salários, sistemas e o que mais a operação gasta todo mês.")}</div>`;
  $("#d-mes").onchange = () => { location.hash = "#/despesas/" + $("#d-mes").value; };
  $("#f-desp").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", e.target), async () => {
      const f = e.target;
      await api("/api/financeiro/despesas", { method: "POST", body: { descricao: f.descricao.value, categoria: f.categoria.value,
        valor: Number(f.valor.value), fixa: f.fixa.value === "1", mes_inicio: mes } });
      toast("Despesa lançada.");
      await recarregar();
    });
  };
  $$("[data-valor]").forEach((inp) => (inp.onchange = async () => {
    const x = d.itens[+inp.dataset.valor];
    try {
      await api(`/api/financeiro/despesas/${x.id}`, { method: "PUT", body: { ...x, valor: Number(inp.value), mes_inicio: x.mes_inicio } });
      toast("Valor atualizado.");
      await recarregar();
    } catch (err) { toast(err.message, true); }
  }));
  $$("[data-remover]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const x = d.itens[+b.dataset.remover];
    const r = await api(`/api/financeiro/despesas/${x.id}?mes=${mes}`, { method: "DELETE" });
    toast(r.acao === "encerrada" ? "Despesa encerrada a partir deste mês." : "Despesa excluída.");
    await recarregar();
  })));
}

const fmtPct = (v) => (v == null ? "—" : String(v).replace(".", ",") + "%");

async function desenharTributacao(regime) {
  const sec = $("#trib");
  if (!sec) return;
  const pode = eEquipe() || estado.usuario.papel === "cliente";
  let d;
  try { d = await api("/api/financeiro/tributacao"); } catch (e) { sec.innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  const busca = (estado.buscaTrib || "").trim().toLowerCase();
  const filtradas = d.regras.filter((r) => !busca || `${r.sku} ${r.descricao} ${r.ncm}`.toLowerCase().includes(busca));
  sec.innerHTML = `<div class="linha entre" style="gap:10px;flex-wrap:wrap"><div><h2 style="margin:0">${ic("relatorio", "p")}Planilha de tributação</h2>
      <div class="pequeno suave">${d.total ? `<b>${numero(d.total)} SKU(s)</b> com regra fiscal · importada em ${data(d.importado_em)}` : "Nenhuma planilha importada ainda."}</div></div>
    <div class="linha">
      ${pode ? `<button class="sec pequeno" id="trib-ml" title="Puxa NCM, origem, CST e alíquotas cadastrados no Faturador do Mercado Livre">${ic("baixar", "p")}Buscar no Faturador do ML</button>` : ""}
      <button class="sec pequeno" id="trib-modelo">${ic("baixar", "p")}Baixar modelo</button>
      ${pode ? `<button class="pequeno" id="trib-importar">${ic("enviar", "p")}${d.total ? "Importar nova planilha" : "Importar planilha"}</button>` : ""}
      ${pode && d.total ? `<button class="sec pequeno perigo-txt" id="trib-apagar">${ic("lixo", "p")}Apagar</button>` : ""}</div></div>
    ${regime === "simples" ? `<div class="aviso azul pequeno" style="margin-top:10px">No Simples Nacional o imposto é a alíquota única do DAS e a planilha não é usada.
      Ela vale quando o regime é Lucro Real ou Presumido.</div>` : !d.total ? `<div class="aviso amarelo pequeno" style="margin-top:10px">No ${h(REGIME[regime])} o imposto
      depende de cada produto. Exporte do sistema onde a loja emite a nota (Bling, Tiny, Omie, ou a planilha do contador) a lista de produtos com os dados fiscais
      e importe aqui. Sem ela o lucro usa só os valores gerais acima.</div>` : ""}
    <p class="pequeno suave" style="margin-top:10px"><b>Emite nota pelo Mercado Livre?</b> Use <b>Buscar no Faturador do ML</b>: o Replique puxa a ficha fiscal
      de cada SKU (NCM, origem, CST/CSOSN) e as alíquotas das regras tributárias cadastradas lá. Só completa o que estiver vazio: o que veio da planilha continua valendo.
      <b>Emite por Bling, Tiny ou outro sistema?</b> Importe a planilha de produtos desse sistema.</p>
    <p class="pequeno suave" style="margin-top:6px">Uma linha por SKU. O Replique reconhece as colunas pelo nome: SKU, NCM, Origem, CST/CSOSN, Alíquota de ICMS,
      ICMS ST, FCP, IPI, PIS, COFINS, créditos de ICMS e PIS/COFINS na compra e, se tiver, uma coluna por estado de destino (ex.: “ICMS SP”). Aceita .xlsx e .csv.
      A venda usa a regra do SKU; o que não estiver na planilha usa os valores gerais.</p>
    <input type="file" id="trib-arquivo" accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    <div id="trib-previa"></div>
    ${d.total ? `<input type="search" id="trib-busca" placeholder="Buscar SKU, descrição ou NCM…" value="${h(estado.buscaTrib || "")}" style="max-width:340px;margin:6px 0">
      <div class="tabela" style="margin:0 -20px -20px"><table class="tabela-trib"><thead><tr><th>SKU</th><th>NCM</th><th>Origem</th><th>CST</th>
        <th class="num">ICMS</th><th>ST</th><th class="num">IPI</th><th class="num">PIS</th><th class="num">COFINS</th><th class="num">Créditos</th><th>Destino</th>${pode ? "<th></th>" : ""}</tr></thead><tbody>
        ${filtradas.slice(0, 200).map((r) => `<tr><td><b>${h(r.sku)}</b><div class="pequeno suave corta-trib">${h(r.descricao)}</div></td>
          <td>${h(r.ncm) || "—"}</td><td>${h(r.origem) || "—"}</td><td>${h(r.cst_icms) || "—"}</td>
          <td class="num">${fmtPct(r.icms_pct)}${r.fcp_pct ? `<div class="pequeno suave">FCP ${fmtPct(r.fcp_pct)}</div>` : ""}</td>
          <td>${r.icms_st ? '<span class="selo neutro">ST</span>' : ""}</td>
          <td class="num">${fmtPct(r.ipi_pct)}</td><td class="num">${fmtPct(r.pis_pct)}</td><td class="num">${fmtPct(r.cofins_pct)}</td>
          <td class="num pequeno">${r.credito_icms_pct != null || r.credito_pis_cofins_pct != null ? `ICMS ${fmtPct(r.credito_icms_pct)}<br>PIS/COF ${fmtPct(r.credito_pis_cofins_pct)}` : "—"}</td>
          <td class="pequeno">${Object.keys(r.aliquotas_uf || {}).length ? h(Object.entries(r.aliquotas_uf).map(([u, v]) => `${u} ${fmtPct(v)}`).join(" · ")) : "—"}</td>
          ${pode ? `<td><button class="icone" data-apagar-regra="${r.id}" title="Apagar esta linha" aria-label="Apagar esta linha">${ic("lixo")}</button></td>` : ""}</tr>`).join("")}
      </tbody></table>${filtradas.length > 200 ? `<p class="pequeno suave" style="padding:8px 20px">Mostrando 200 de ${numero(filtradas.length)}. Use a busca.</p>` : ""}</div>` : ""}`;
  $("#trib-modelo").onclick = () => comBotao($("#trib-modelo"), () => baixarArquivo("/api/financeiro/tributacao/modelo.csv", "modelo-planilha-tributacao.csv"));
  const doMl = $("#trib-ml");
  if (doMl) doMl.onclick = () => comBotao(doMl, async () => {
    const r = await api("/api/financeiro/tributacao/mercadolivre", { method: "POST" });
    const partes = [`${r.consultados} SKU(s) consultados`, `${r.novos} novo(s)`, `${r.completados} completado(s)`];
    if (r.sem_ficha) partes.push(`${r.sem_ficha} sem ficha fiscal no ML`);
    toast(partes.join(" · ") + (r.regras_ml ? ` · ${r.regras_ml} regra(s) tributária(s) lida(s)` : ""));
    if (!r.novos && !r.completados) toast("Nenhum SKU tem ficha fiscal no Faturador do Mercado Livre. Se a loja emite nota por outro sistema, importe a planilha dele.", true);
    desenharTributacao(regime);
  });
  const imp = $("#trib-importar"), arq = $("#trib-arquivo");
  if (imp) imp.onclick = () => arq.click();
  arq.onchange = () => { const f = arq.files[0]; arq.value = ""; if (f) previaTributacao(f, null, regime); };
  const apagar = $("#trib-apagar");
  if (apagar) apagar.onclick = () => {
    if (!confirm("Apagar a planilha de tributação inteira? O lucro volta a usar só os valores gerais.")) return;
    comBotao(apagar, async () => { await api("/api/financeiro/tributacao", { method: "DELETE" }); toast("Planilha apagada."); desenharTributacao(regime); });
  };
  $$("[data-apagar-regra]", sec).forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await api("/api/financeiro/tributacao/" + b.dataset.apagarRegra, { method: "DELETE" });
    desenharTributacao(regime);
  })));
  const campoBusca = $("#trib-busca");
  if (campoBusca) campoBusca.oninput = () => {
    estado.buscaTrib = campoBusca.value;
    clearTimeout(desenharTributacao._t);
    desenharTributacao._t = setTimeout(async () => { await desenharTributacao(regime); const c = $("#trib-busca"); c?.focus(); c?.setSelectionRange(c.value.length, c.value.length); }, 250);
  };
}

async function previaTributacao(arquivo, mapa, regime) {
  const alvo = $("#trib-previa");
  alvo.innerHTML = `<div class="carregando"><span class="girando"></span> Lendo ${h(arquivo.name)}…</div>`;
  const fd = new FormData();
  fd.append("arquivo", arquivo);
  if (mapa) fd.append("mapa", JSON.stringify(mapa));
  let p;
  try { p = await api("/api/financeiro/tributacao/previa", { method: "POST", body: fd }); }
  catch (e) { alvo.innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
  const opcoes = (sel) => `<option value="">— não usar —</option>${p.cabecalho.map((c, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${h(c || `coluna ${i + 1}`)}</option>`).join("")}`;
  const colunasUf = Object.entries(p.mapa.ufs);
  alvo.innerHTML = `<div class="trib-previa">
    <div class="linha entre"><b>${ic("relatorio", "p")}${h(arquivo.name)}</b><button type="button" class="icone" id="trib-cancelar" title="Cancelar" aria-label="Cancelar">${ic("x")}</button></div>
    ${p.avisos.map((a) => `<div class="aviso amarelo pequeno">${h(a)}</div>`).join("")}
    <p class="pequeno"><b>${numero(p.total)} SKU(s)</b> na planilha${p.skus_loja ? ` · ${numero(p.casam)} de ${numero(p.skus_loja)} SKUs da loja encontrados` : ""}.
      ${p.faltam_total ? `<span class="aviso-texto">Faltam ${numero(p.faltam_total)} SKU(s) que a loja vende: ${h(p.faltam.slice(0, 8).join(", "))}${p.faltam_total > 8 ? "…" : ""}</span>` : ""}</p>
    <details ${p.avisos.length ? "open" : ""}><summary class="pequeno">Conferir as colunas reconhecidas</summary>
      <div class="grade-mapa">${Object.entries(p.campos).map(([k, n]) => `<label>${h(n)}<select data-campo="${k}">${opcoes(p.mapa.campos[k])}</select></label>`).join("")}</div>
      ${colunasUf.length ? `<p class="pequeno suave">Alíquota por estado de destino: ${colunasUf.map(([uf, i]) => `${uf} (${h(p.cabecalho[i])})`).join(", ")}</p>` : ""}
    </details>
    ${p.amostra.length ? `<div class="tabela embutida" style="margin-top:8px"><table class="tabela-trib"><thead><tr><th>SKU</th><th>Origem</th><th>CST</th><th class="num">ICMS</th><th>ST</th>
      <th class="num">IPI</th><th class="num">PIS</th><th class="num">COFINS</th></tr></thead><tbody>
      ${p.amostra.map((r) => `<tr><td><b>${h(r.sku)}</b><div class="pequeno suave corta-trib">${h(r.descricao)}</div></td><td>${h(r.origem) || "—"}</td><td>${h(r.cst_icms) || "—"}</td>
        <td class="num">${fmtPct(r.icms_pct)}</td><td>${r.icms_st ? "sim" : ""}</td><td class="num">${fmtPct(r.ipi_pct)}</td><td class="num">${fmtPct(r.pis_pct)}</td>
        <td class="num">${fmtPct(r.cofins_pct)}</td></tr>`).join("")}</tbody></table></div>
      <p class="pequeno suave">Primeiras ${p.amostra.length} linhas, como o Replique entendeu.</p>` : ""}
    <label class="confirmacao" style="margin:8px 0"><input type="checkbox" id="trib-substituir" checked> Substituir a planilha atual (SKUs que não estão no arquivo novo são apagados)</label>
    <div class="linha" style="justify-content:flex-end"><button class="sec" id="trib-reler">Reler com estas colunas</button>
      <button id="trib-confirmar" ${p.total && p.mapa.campos.sku != null ? "" : "disabled"}>${ic("salvar", "p")}Importar ${numero(p.total)} SKU(s)</button></div></div>`;
  const lerMapa = () => ({ campos: Object.fromEntries($$("[data-campo]", alvo).filter((s) => s.value !== "").map((s) => [s.dataset.campo, +s.value])),
    ufs: p.mapa.ufs });
  $("#trib-cancelar").onclick = () => (alvo.innerHTML = "");
  $("#trib-reler").onclick = () => previaTributacao(arquivo, lerMapa(), regime);
  $("#trib-confirmar").onclick = () => comBotao($("#trib-confirmar"), async () => {
    const fd2 = new FormData();
    fd2.append("arquivo", arquivo);
    fd2.append("mapa", JSON.stringify(lerMapa()));
    fd2.append("substituir", $("#trib-substituir").checked ? "true" : "false");
    const r = await api("/api/financeiro/tributacao/importar", { method: "POST", body: fd2 });
    toast(`Planilha importada: ${r.novos} novo(s), ${r.atualizados} atualizado(s)${r.removidos ? `, ${r.removidos} removido(s)` : ""}. O lucro já usa as regras novas.`);
    desenharTributacao(regime);
  });
}

async function telaImpostos() {
  const cfg = await api("/api/financeiro/config");
  const pad = cfg.padroes;
  const num = (v) => (v == null ? "" : String(v));
  const marcar = (nome, rotulo) => `<label class="linha" style="gap:6px;font-weight:500;margin:0">
    <input type="checkbox" name="${nome}" ${cfg[nome] ? "checked" : ""} style="width:auto"> ${rotulo}</label>`;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Impostos</h1>
    <div class="suave">Regime tributário de <b>${h(clienteAtual()?.nome)}</b>, usado no lucro de cada venda.</div></div>
    <a class="botao sec" href="#/lucro">${ic("cifrao", "p")}Ver vendas e lucro</a></div>
  <form class="cartao" id="f-imp">
    <div class="grade g3">
      <div><label for="i-regime">Regime tributário</label><select id="i-regime" name="regime">
        ${Object.entries(REGIME).map(([v, n]) => `<option value="${v}" ${cfg.regime === v ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div data-regime="simples"><label for="i-simples">Alíquota efetiva do Simples (%)</label>
        <input id="i-simples" name="aliquota_simples_pct" type="number" step="0.01" min="0" max="40" value="${num(cfg.aliquota_simples_pct)}"></div>
      <div data-regime="lucro"><label for="i-uf">Estado de onde a mercadoria sai</label><select id="i-uf" name="uf_origem">
        <option value="">Escolha</option>${UFS.map((u) => `<option ${cfg.uf_origem === u ? "selected" : ""}>${u}</option>`).join("")}</select></div>
    </div>
    <p class="pequeno suave" data-regime="simples">No Simples, o DAS já inclui ICMS, PIS, COFINS, IRPJ e CSLL. Use a alíquota efetiva da faixa atual
      (a do extrato do PGDAS), não a nominal da tabela.</p>
    <div data-regime="lucro">
      <p class="pequeno suave">No Presumido e no Real o imposto muda conforme o estado do comprador, então cada venda é calculada separada:
        ICMS interno quando o comprador é do mesmo estado; para outro estado, ICMS interestadual (7% ou 12%, 4% se importado)
        mais o DIFAL do estado de destino. Em branco, vale o padrão do regime. Estes são os <b>valores gerais</b>: para cada produto vale
        a <b>planilha de tributação</b> abaixo, quando o SKU estiver nela.</p>
      <div class="grade g3">
        <div><label for="i-pis">PIS/COFINS (%)</label><input id="i-pis" name="pis_cofins_pct" type="number" step="0.01" min="0" max="30" value="${num(cfg.pis_cofins_pct)}"></div>
        <div><label for="i-outros">Outros sobre a venda (%)</label><input id="i-outros" name="outros_pct" type="number" step="0.01" min="0" max="30"
          value="${num(cfg.outros_pct)}"><div class="pequeno suave" data-regime="presumido">IRPJ + CSLL presumidos (comércio: 2,28%).</div></div>
        <div><label for="i-cred">Créditos na compra (% do custo)</label><input id="i-cred" name="credito_custo_pct" type="number" step="0.01" min="0" max="40"
          value="${num(cfg.credito_custo_pct)}"><div class="pequeno suave">ICMS e PIS/COFINS da nota de compra que abatem o imposto.</div></div>
      </div>
      <div class="linha" style="flex-wrap:wrap;gap:18px;margin-top:12px">
        ${marcar("cobrar_difal", "Recolher DIFAL (consumidor final de outro estado)")}
        ${marcar("importado", "Mercadoria importada (interestadual de 4%)")}
        ${marcar("icms_excluido_pis_cofins", "Excluir o ICMS da base do PIS/COFINS")}
      </div>
      <div class="icms-uf">
        <div class="linha entre" style="gap:10px">
          <div><h3 style="margin:0">ICMS e DIFAL por estado de destino</h3>
            <div class="pequeno suave">Quanto de ICMS sai em cada venda, conforme o estado do comprador (consumidor final). A alíquota interna
              de cada estado é editável: ajuste quando o seu produto tem alíquota diferente da padrão (já inclui o FCP nos estados que cobram junto).</div></div>
          <label class="linha pequeno" style="gap:6px;margin:0;font-weight:500;white-space:nowrap">Simular venda de R$
            <input id="icms-valor" type="number" min="1" step="1" value="100" style="width:96px"></label>
        </div>
        <div class="tabela" style="margin:12px 0 0"><table class="tabela-icms"><thead><tr><th>Destino</th><th>Operação</th>
          <th class="num">ICMS da origem</th><th class="num">Interna do destino</th><th class="num">DIFAL</th><th class="num">Carga de ICMS</th>
          <th class="num">Em R$ <span id="icms-valor-rot">100</span></th></tr></thead>
          <tbody>${UFS.map((u) => `<tr data-linha-uf="${u}"><td><b>${u}</b> <span class="pequeno suave">${NOME_UF[u]}</span></td>
            <td class="pequeno" data-c="op"></td><td class="num" data-c="origem"></td>
            <td class="num"><input type="number" step="0.01" min="0" max="40" data-uf="${u}" value="${num(cfg.aliquotas_uf[u] ?? pad.aliquota_interna[u])}"
              aria-label="Alíquota interna de ${u}" class="icms-input"></td>
            <td class="num" data-c="difal"></td><td class="num" data-c="carga"></td><td class="num" data-c="reais"></td></tr>`).join("")}</tbody></table></div>
        <p class="pequeno suave" style="margin:8px 0 0">Interestadual: 4% para importados; 7% saindo do Sul/Sudeste (menos ES) para Norte, Nordeste,
          Centro-Oeste e ES; 12% nos demais casos. DIFAL = interna do destino − interestadual, pago ao estado do comprador.
          Produtos com regra própria na planilha abaixo (ST, isenção, alíquota diferente) usam a regra do SKU.</p>
      </div>
      <p class="pequeno suave">No Lucro Real, IRPJ e CSLL são calculados sobre o lucro do período e não entram por venda.
        É uma estimativa gerencial: confirme as alíquotas com o contador.</p>
    </div>
    <h3>Devoluções</h3>
    ${marcar("devolucao_volta_estoque", "Quando o produto volta na devolução, ele retorna ao estoque (o custo não é perda)")}
    <p class="pequeno suave">Desmarque se os produtos devolvidos costumam voltar sem condição de venda.</p>
    <div class="linha" style="justify-content:flex-end;margin-top:8px"><button type="submit">${ic("salvar", "p")}Salvar</button></div>
  </form>
  <section class="cartao" id="trib" style="margin-top:16px"><div class="carregando"><span class="girando"></span> Carregando a planilha de tributação…</div></section>`;
  const f = $("#f-imp");
  const mostrarRegime = () => {
    const reg = f.regime.value;
    $$("[data-regime]", f).forEach((el) => {
      const alvo = el.dataset.regime;
      el.hidden = !(alvo === reg || (alvo === "lucro" && reg !== "simples"));
    });
    if (reg !== "simples") {
      f.pis_cofins_pct.placeholder = `padrão ${String(pad.pis_cofins[reg]).replace(".", ",")}`;
      f.outros_pct.placeholder = `padrão ${String(pad.outros[reg]).replace(".", ",")}`;
    }
  };
  const desenharIcms = () => {
    const origem = f.uf_origem.value;
    const valor = Math.max(Number($("#icms-valor").value) || 0, 0);
    $("#icms-valor-rot").textContent = valor.toLocaleString("pt-BR");
    $$("[data-linha-uf]", f).forEach((tr) => {
      const uf = tr.dataset.linhaUf;
      const interna = Number($("[data-uf]", tr).value || 0);
      const c = (k) => $(`[data-c="${k}"]`, tr);
      tr.classList.toggle("origem", uf === origem);
      if (!origem) { ["op", "origem", "difal", "carga", "reais"].forEach((k) => (c(k).textContent = k === "op" ? "escolha a origem" : "—")); return; }
      let inter, difal = 0, op;
      if (uf === origem) { inter = interna; op = "venda dentro do estado"; }
      else {
        inter = interestadualUF(origem, uf, f.importado.checked);
        op = `interestadual ${origem}→${uf}`;
        difal = f.cobrar_difal.checked ? Math.max(interna - inter, 0) : 0;
      }
      const carga = inter + difal;
      c("op").textContent = op;
      c("origem").textContent = fmtPct(Math.round(inter * 100) / 100);
      c("difal").textContent = uf === origem ? "—" : f.cobrar_difal.checked ? fmtPct(Math.round(difal * 100) / 100) : "não recolhe";
      c("carga").innerHTML = `<b>${fmtPct(Math.round(carga * 100) / 100)}</b>`;
      c("reais").textContent = brl((valor * carga) / 100);
    });
  };
  ["uf_origem", "importado", "cobrar_difal"].forEach((n) => f[n].addEventListener("change", desenharIcms));
  $$(".icms-input", f).forEach((i) => i.addEventListener("input", desenharIcms));
  $("#icms-valor").addEventListener("input", desenharIcms);
  desenharIcms();
  f.regime.onchange = () => { mostrarRegime(); desenharTributacao(f.regime.value); };
  mostrarRegime();
  desenharTributacao(cfg.regime);
  f.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", f), async () => {
      await api("/api/financeiro/config", { method: "PUT", body: {
        regime: f.regime.value, aliquota_simples_pct: numOuNulo(f.aliquota_simples_pct.value) ?? 0, uf_origem: f.uf_origem.value,
        pis_cofins_pct: numOuNulo(f.pis_cofins_pct.value), outros_pct: numOuNulo(f.outros_pct.value),
        credito_custo_pct: numOuNulo(f.credito_custo_pct.value) ?? 0, importado: f.importado.checked, cobrar_difal: f.cobrar_difal.checked,
        icms_excluido_pis_cofins: f.icms_excluido_pis_cofins.checked, devolucao_volta_estoque: f.devolucao_volta_estoque.checked,
        aliquotas_uf: Object.fromEntries($$("[data-uf]", f).map((i) => [i.dataset.uf, numOuNulo(i.value)])),
        embalagem_padrao: cfg.embalagem_padrao } });
      toast("Impostos salvos. O lucro de todos os meses já usa os valores novos.");
    });
  };
}

const STATUS_TAREFA = [["pendente", "Pendente"], ["andamento", "Em andamento"], ["aguardando_cliente", "Aguardando informações"],
  ["ajuste", "Precisa de ajuste"], ["concluida", "Concluída"]];
const NOME_STATUS = Object.fromEntries(STATUS_TAREFA);
const seloTarefa = (s) => `<span class="selo st-${h(s)}">${h(NOME_STATUS[s] || s)}</span>`;
const temFerramenta = (f) => eAdmin() || (estado.usuario?.ferramentas || []).includes(f);
const usaDuvidas = () => temFerramenta("duvidas");
const podePlanejar = () => ["admin", "consultor"].includes(estado.usuario?.papel);
const dataDia = (iso) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "");
const hojeIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const contadorHtml = (n, titulo = "Mensagens não lidas") => (n ? `<span class="bolinha" title="${titulo}">${n > 99 ? "99+" : n}</span>` : "");
const barraProgresso = (pct) => `<div class="progresso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;

let _pollNaoLidas = null;
async function atualizarNaoLidas() {
  if (!estado.usuario || !usaDuvidas()) { estado.naoLidas = null; desenharContadores(); return; }
  const qs = estado.clienteId && eTime() ? `?cliente_id=${estado.clienteId}` : "";
  try { estado.naoLidas = await api("/api/conversas/nao-lidas" + qs); } catch { return; }
  desenharContadores();
  if (!_pollNaoLidas) _pollNaoLidas = setInterval(() => { if (estado.usuario && !document.hidden) atualizarNaoLidas(); }, 45000);
}

function naoLidasDaPagina() {
  const ctx = estado.chatPagina;
  const n = estado.naoLidas;
  if (!ctx || !n) return 0;
  if (ctx.ref_tipo) return n.por_ref?.[`${ctx.ref_tipo}:${ctx.ref_id}`] || 0;
  return n.por_pagina?.[ctx.pagina] || 0;
}

function desenharContadores() {
  const n = estado.naoLidas || {};
  const por = n.por_pagina || {};
  $$("[data-contador]").forEach((el) => {
    const r = el.dataset.contador;
    const v = r === "duvidas" ? n.total || 0 : (por[r] || 0) + (r === "rascunhos" ? por.editor || 0 : 0);
    el.hidden = !v;
    el.textContent = v > 99 ? "99+" : v;
  });
  const btn = $("#seletor-btn");
  if (btn) {
    $(".bolinha", btn)?.remove();
    const outros = (n.total || 0) - (estado.clienteId ? n.por_cliente?.[estado.clienteId] || 0 : 0);
    if (outros > 0 && estado.clienteId) btn.insertAdjacentHTML("beforeend", contadorHtml(outros, "Dúvidas não lidas em outros clientes"));
  }
  const cc = $("#chat-contador");
  if (cc) { const v = naoLidasDaPagina(); cc.hidden = !v; cc.textContent = v; }
  $$("[data-ref-contador]").forEach((el) => {
    const v = n.por_ref?.[el.dataset.refContador] || 0;
    el.hidden = !v;
    el.textContent = v;
  });
}

const chat = { ctx: null, timer: null, carregando: false };
const PAGINAS_SEM_CHAT = new Set(["inicio", "tarefas", "duvidas", "clientes", "config", "entrar"]);

function garantirChat() {
  if ($("#chat")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <button type="button" class="chat-botao" id="chat-abrir" hidden>${ic("balao")}<span id="chat-rotulo">Dúvidas sobre esta página</span><span class="bolinha" id="chat-contador" hidden></span></button>
    <aside class="chat" id="chat" hidden aria-label="Conversa">
      <header class="chat-topo"><div class="info"><b id="chat-titulo">Dúvidas</b><div class="pequeno suave" id="chat-sub"></div></div>
        <button type="button" class="icone" id="chat-fechar" aria-label="Fechar conversa" title="Fechar">${ic("x")}</button></header>
      <div class="chat-msgs" id="chat-msgs" aria-live="polite"></div>
      <form class="chat-form" id="chat-form">
        <label for="chat-texto" class="so-leitor">Mensagem</label>
        <textarea id="chat-texto" rows="3" maxlength="4000" placeholder="Escreva sua dúvida…" required></textarea>
        <div class="linha entre"><span class="pequeno suave" id="chat-dica"></span>
          <div class="linha"><button type="button" class="sec pequeno" id="chat-resolver" hidden></button>
            <button type="submit" class="pequeno">${ic("enviar", "p")}Enviar</button></div></div>
      </form>
    </aside>`);
  $("#chat-abrir").onclick = () => estado.chatPagina && abrirChat({ ...estado.chatPagina });
  $("#chat-fechar").onclick = fecharChat;
  $("#chat-texto").onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#chat-form").requestSubmit(); };
  $("#chat-form").onsubmit = (e) => {
    e.preventDefault();
    const texto = $("#chat-texto").value.trim();
    if (!texto || !chat.ctx) return;
    comBotao($("#chat-form button[type=submit]"), async () => {
      const c = chat.ctx;
      const r = await api("/api/conversas/mensagens", { method: "POST", body: { cliente_id: c.cliente_id, pagina: c.pagina,
        ref_tipo: c.ref_tipo || "", ref_id: c.ref_id || 0, texto } });
      $("#chat-texto").value = "";
      chat.ctx.conversa_id = r.id;
      desenharChat(r, true);
      atualizarNaoLidas();
      if (estado._rotaAtual === "duvidas") carregarCaixa();
    });
  };
  $("#chat-resolver").onclick = () => comBotao($("#chat-resolver"), async () => {
    const resolvida = $("#chat-resolver").dataset.resolvida !== "1";
    await api(`/api/conversas/${chat.ctx.conversa_id}/resolver`, { method: "POST", body: { resolvida } });
    toast(resolvida ? "Dúvida marcada como resolvida." : "Dúvida reaberta.");
    await carregarChat(true);
    if (estado._rotaAtual === "duvidas") carregarCaixa();
  });
}

function ligarChatDaPagina(rota, param) {
  garantirChat();
  fecharChat();
  const u = estado.usuario;
  const cliente_id = u?.papel === "cliente" ? u.cliente_id : estado.clienteId;
  const ok = u && usaDuvidas() && !PAGINAS_SEM_CHAT.has(rota) && cliente_id;
  estado.chatPagina = ok ? { pagina: rota, cliente_id, ref_tipo: rota === "editor" && +param ? "anuncio" : "",
    ref_id: rota === "editor" ? +param || 0 : 0, titulo: TITULO_ROTA[rota] || rota } : null;
  $("#chat-abrir").hidden = !ok;
  if (ok) $("#chat-rotulo").textContent = eTime() ? `Conversa com ${clienteAtual()?.nome || "o cliente"}` : "Dúvidas sobre esta página";
  desenharContadores();
}

function abrirChat(ctx) {
  garantirChat();
  fecharModal();
  chat.ctx = ctx;
  $("#chat").hidden = false;
  $("#chat-abrir").hidden = true;
  $("#chat-msgs").innerHTML = `<div class="carregando"><span class="girando"></span> Carregando…</div>`;
  carregarChat(true);
  clearInterval(chat.timer);
  chat.timer = setInterval(() => { if (!document.hidden) carregarChat(false); }, 20000);
  setTimeout(() => $("#chat-texto")?.focus(), 50);
}

function fecharChat() {
  clearInterval(chat.timer);
  chat.ctx = null;
  if ($("#chat")) $("#chat").hidden = true;
  if ($("#chat-abrir")) $("#chat-abrir").hidden = !estado.chatPagina;
}

async function carregarChat(rolar) {
  const c = chat.ctx;
  if (!c || chat.carregando) return;
  chat.carregando = true;
  try {
    const r = c.conversa_id ? await api(`/api/conversas/${c.conversa_id}`)
      : await api("/api/conversas/abrir?" + new URLSearchParams({ pagina: c.pagina, cliente_id: c.cliente_id || "",
        ref_tipo: c.ref_tipo || "", ref_id: c.ref_id || 0 }));
    if (chat.ctx !== c) return;
    if (r.id) c.conversa_id = r.id;
    desenharChat(r, rolar);
    atualizarNaoLidas();
  } catch (e) {
    if (chat.ctx === c) $("#chat-msgs").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`;
  } finally { chat.carregando = false; }
}

function desenharChat(r, rolar) {
  const caixa = $("#chat-msgs");
  const noFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 40;
  const equipe = eTime();
  const nomeCliente = equipe ? (estado.usuario.clientes.find((x) => x.id === r.cliente_id)?.nome || "Cliente") : "";
  $("#chat-titulo").textContent = r.titulo ? `${r.pagina_nome} · ${r.titulo}` : r.pagina_nome;
  $("#chat-sub").textContent = equipe ? `${nomeCliente}${r.resolvida ? " · resolvida" : ""}` : r.resolvida ? "Resolvida pela equipe" : "A equipe Monvatti responde por aqui";
  $("#chat-dica").textContent = equipe ? "O cliente vê a resposta nesta mesma página." : "Ctrl+Enter envia";
  $("#chat-texto").placeholder = equipe ? "Responder ao cliente…" : "Escreva sua dúvida…";
  const resolver = $("#chat-resolver");
  resolver.hidden = !(equipe && r.id);
  resolver.dataset.resolvida = r.resolvida ? "1" : "0";
  resolver.innerHTML = r.resolvida ? `${ic("desfazer", "p")}Reabrir` : `${ic("checar", "p")}Resolvida`;
  let separou = false;
  caixa.innerHTML = r.mensagens.length ? r.mensagens.map((m) => {
    const nova = r.lida_ate != null && !separou && !m.minha && m.id > r.lida_ate;
    if (nova) separou = true;
    return `${nova ? '<div class="chat-novas"><span>Novas mensagens</span></div>' : ""}
      <div class="msg ${m.minha ? "minha" : ""} ${m.papel === "cliente" ? "do-cliente" : ""}">
        <div class="msg-autor">${m.minha ? "Você" : h(m.autor)} <span class="suave">· ${h(PAPEL[m.papel] || "")} · ${tempoRelativo(m.criada_em)}</span></div>
        <div class="msg-texto">${h(m.texto)}</div></div>`;
  }).join("") : vazio("balao", equipe ? "Nenhuma mensagem ainda" : "Ficou com alguma dúvida?",
    equipe ? "Escreva para o cliente: ele vê a mensagem nesta página." : "Escreva aqui. A dúvida fica ligada a esta página e a equipe responde por aqui mesmo.");
  if (rolar || noFim) caixa.scrollTop = caixa.scrollHeight;
}

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
    const destino = c.pagina === "editor" && c.ref_id ? `editor/${c.ref_id}` : c.pagina === "geral" ? "projeto" : c.pagina;
    location.hash = "#/" + destino;
    if (c.ref_tipo === "tarefa") setTimeout(() => abrirTarefa(c.ref_id), 400);
  }));
}

async function telaInicio() {
  const papel = estado.usuario.papel;
  const v = await api("/api/visao-geral");
  const t = v.totais;
  const kpi = (rotulo, valor, detalhe = "", icone = "painel", classe = "") => `<div class="cartao kpi-bloco">
      <div class="linha entre"><span class="rotulo">${rotulo}</span><span class="kpi-ic">${ic(icone, "p")}</span></div>
      <div class="valor ${classe}">${valor}</div>${detalhe ? `<div class="pequeno suave">${detalhe}</div>` : ""}</div>`;
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${papel === "admin" ? "Visão geral" : "Minha carteira"}</h1>
    <div class="suave">${papel === "admin" ? "Toda a operação: clientes, projetos, tarefas da equipe e dúvidas. Para trabalhar em um cliente, escolha-o na lista ou no seletor do topo."
      : papel === "consultor" ? "Os clientes e projetos sob sua responsabilidade, o que a equipe está executando e as dúvidas dos clientes."
      : "Os clientes atribuídos a você e as tarefas que estão com você."}</div></div>
    ${papel === "admin" ? `<div class="linha"><a class="botao sec" href="#/clientes">${ic("loja", "p")}Clientes</a><a class="botao sec" href="#/config">${ic("usuarios", "p")}Usuários e permissões</a></div>` : ""}</div>
  <div class="grade g4">
    ${kpi("Clientes", numero(t.clientes), `${numero(t.projetos_ativos)} projeto(s) ativo(s)`, "loja")}
    ${kpi("Tarefas em aberto", numero(t.abertas), t.atrasadas ? `<span class="ruim">${numero(t.atrasadas)} atrasada(s)</span>` : "nenhuma atrasada", "relogio")}
    ${kpi("Aguardando o cliente", numero(t.aguardando_cliente), "tarefas paradas esperando informações", "pausa")}
    ${v.usa_duvidas ? kpi("Dúvidas sem resposta", numero(t.aguardando_resposta), `${numero(t.duvidas_nao_lidas)} mensagem(ns) não lida(s) para você`, "balao", t.aguardando_resposta ? "negativo" : "")
      : kpi("Concluídas em 30 dias", numero(t.concluidas_30d), "tarefas finalizadas", "checar")}
  </div>
  ${v.sem_equipe.length ? `<div class="aviso azul linha entre" style="margin-top:16px"><span>${ic("usuarios", "p")} <b>${v.sem_equipe.length} cliente(s) sem consultor nem operador:</b>
    ${v.sem_equipe.slice(0, 6).map(h).join(", ")}${v.sem_equipe.length > 6 ? "…" : ""}.</span><a class="botao sec pequeno" href="#/clientes">Atribuir equipe</a></div>` : ""}
  ${v.minhas.length ? `<section class="cartao" style="margin-top:16px"><div class="linha entre"><h2 style="margin:0">${ic("relogio", "p")}Minhas tarefas</h2>
      <a href="#/tarefas" class="pequeno">ver todas</a></div>
    <div style="margin-top:8px">${v.minhas.map((x) => linhaTarefa(x, true)).join("")}</div></section>` : ""}
  <section class="cartao" style="margin-top:16px">
    <div class="linha entre"><h2 style="margin:0">${ic("loja", "p")}${papel === "admin" ? "Clientes" : "Meus clientes"}</h2>
      <input type="text" id="vg-busca" placeholder="Buscar cliente…" style="max-width:260px"></div>
    ${v.clientes.length ? `<div class="tabela" style="margin-top:14px"><table><thead><tr><th>Cliente</th><th>Equipe</th><th>Projeto</th>
      <th class="num">Em aberto</th><th class="num">Atrasadas</th>${v.usa_duvidas ? '<th class="num">Dúvidas</th>' : ""}<th>Última atividade</th><th></th></tr></thead>
      <tbody id="vg-linhas"></tbody></table></div>`
      : vazio("loja", papel === "admin" ? "Nenhum cliente cadastrado" : "Nenhum cliente atribuído a você",
        papel === "admin" ? `Cadastre em <a href="#/clientes">Clientes</a>.` : "Peça ao administrador para atribuir os clientes que você atende.")}
  </section>
  <div class="grade ${v.equipe.length ? "g2" : ""}" style="margin-top:16px;align-items:start">
    ${v.equipe.length ? `<section class="cartao"><h2>${ic("usuarios", "p")}Equipe</h2>
      <div class="tabela"><table><thead><tr><th>Pessoa</th><th class="num">Clientes</th><th class="num">Em aberto</th><th class="num">Atrasadas</th><th class="num">Concluídas 30 d</th></tr></thead><tbody>
      ${v.equipe.map((p) => `<tr><td><div class="linha" style="gap:10px;flex-wrap:nowrap"><span class="avatar pequeno-avatar">${avatarHtml(p.nome, p.foto)}</span>
        <div><b>${h(p.nome)}</b><div class="pequeno suave">${h(PAPEL[p.papel] || p.papel)}</div></div></div></td>
        <td class="num">${numero(p.clientes)}</td><td class="num">${numero(p.abertas)}</td>
        <td class="num ${p.atrasadas ? "ruim" : ""}">${numero(p.atrasadas)}</td><td class="num">${numero(p.concluidas_30d)}</td></tr>`).join("")}
      </tbody></table></div></section>` : ""}
    <section class="cartao"><h2>${ic("checar", "p")}Concluídas recentemente</h2>
      ${v.concluidas_recentes.length ? v.concluidas_recentes.map((x) => linhaTarefa(x, true)).join("") : vazio("checar", "Nenhuma tarefa concluída ainda")}</section>
  </div>`;
  const corpo = $("#vg-linhas");
  if (corpo) {
    const desenhar = () => {
      const termo = $("#vg-busca").value.trim().toLowerCase();
      corpo.innerHTML = v.clientes.filter((c) => c.nome.toLowerCase().includes(termo)).map((c) => `<tr>
        <td><b>${h(c.nome)}</b><div class="pequeno suave">${c.projetos_ativos ? `${c.projetos_ativos} projeto(s) ativo(s)` : c.tarefas ? "nenhum projeto ativo" : "sem projeto"}</div></td>
        <td class="pequeno">${c.consultores.length ? `<div>consultor: ${h(c.consultores.join(", "))}</div>` : ""}${c.operadores.length ? `<div class="suave">operador: ${h(c.operadores.join(", "))}</div>` : ""}
          ${!c.consultores.length && !c.operadores.length ? '<span class="aviso-texto">sem equipe</span>' : ""}</td>
        <td style="min-width:140px">${c.tarefas ? `${barraProgresso(c.progresso)}<div class="pequeno suave">${c.progresso}% concluído${c.por_status.aguardando_cliente ? ` · ${c.por_status.aguardando_cliente} aguardando cliente` : ""}</div>` : '<span class="pequeno suave">sem tarefas</span>'}</td>
        <td class="num">${numero(c.abertas)}</td><td class="num ${c.atrasadas ? "ruim" : ""}">${numero(c.atrasadas)}</td>
        ${v.usa_duvidas ? `<td class="num">${c.aguardando_resposta ? `<span class="selo demo" title="Dúvidas esperando resposta">${c.aguardando_resposta}</span> ` : ""}${contadorHtml(c.duvidas_nao_lidas)}${!c.aguardando_resposta && !c.duvidas_nao_lidas ? "—" : ""}</td>` : ""}
        <td class="pequeno suave">${c.ultima_atividade ? tempoRelativo(c.ultima_atividade) : "—"}</td>
        <td style="text-align:right"><button type="button" class="sec pequeno" data-entrar="${c.id}">${ic("direita", "p")}Abrir</button></td></tr>`).join("")
        || `<tr><td colspan="8" class="suave">Nenhum cliente com esse nome.</td></tr>`;
      $$("[data-entrar]", corpo).forEach((b) => (b.onclick = () => entrarNoCliente(+b.dataset.entrar)));
    };
    $("#vg-busca").oninput = desenhar;
    desenhar();
  }
  ligarLinhasTarefa($("#tela"), telaInicio);
}

function entrarNoCliente(id, rota = "projeto") {
  trocarCliente(id, { navegar: false });
  if (location.hash === "#/" + rota) roteador(); else location.hash = "#/" + rota;
}

function linhaTarefa(x, comCliente = false) {
  return `<div class="lista-item linha-tarefa" data-tarefa="${x.id}" role="button" tabindex="0">
    <div class="info"><b>${h(x.titulo)}</b>
      <span class="pequeno suave">${comCliente && x.cliente_nome ? h(x.cliente_nome) + " · " : ""}${x.responsavel ? h(x.responsavel) : "sem responsável"}${x.prazo ? ` · prazo ${dataDia(x.prazo)}` : ""}</span></div>
    ${x.atrasada ? '<span class="selo erro">atrasada</span>' : ""}${seloTarefa(x.status)}</div>`;
}

function ligarLinhasTarefa(raiz, depois) {
  $$("[data-tarefa]", raiz).forEach((el) => {
    el.onclick = () => abrirTarefa(+el.dataset.tarefa, depois);
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirTarefa(+el.dataset.tarefa, depois); } };
  });
}

function cartaoTarefa(x, { comCliente = false, comProjeto = false } = {}) {
  const ref = `tarefa:${x.id}`;
  const n = estado.naoLidas?.por_ref?.[ref] || 0;
  return `<div class="cartao-tarefa ${x.atrasada ? "atrasada" : ""}" data-tarefa="${x.id}" role="button" tabindex="0">
    <div class="linha entre" style="flex-wrap:nowrap;align-items:flex-start"><b>${h(x.titulo)}</b><span class="bolinha" data-ref-contador="${ref}" ${n ? "" : "hidden"}>${n}</span></div>
    ${comCliente && x.cliente_nome ? `<div class="pequeno suave">${h(x.cliente_nome)}</div>` : ""}
    ${comProjeto && x.projeto ? `<div class="pequeno suave">${h(x.projeto)}</div>` : ""}
    <div class="pequeno suave linha" style="gap:8px;margin-top:6px">${ic("usuarios", "p")}${x.responsavel ? h(x.responsavel) : "sem responsável"}</div>
    ${x.prazo ? `<div class="pequeno linha ${x.atrasada ? "ruim" : "suave"}" style="gap:8px">${ic("relogio", "p")}${x.atrasada ? "atrasada · " : ""}${dataDia(x.prazo)}</div>` : ""}
    ${eTime() && !x.visivel_cliente ? `<div class="pequeno suave linha" style="gap:8px">${ic("escudo", "p")}interna (o cliente não vê)</div>` : ""}
  </div>`;
}

function quadroTarefas(lista, opcoes = {}) {
  return `<div class="quadro">${STATUS_TAREFA.map(([st, nome]) => {
    const itens = lista.filter((x) => x.status === st);
    const visiveis = st === "concluida" ? itens.slice(0, opcoes.limiteConcluidas || 12) : itens;
    return `<div class="coluna-quadro st-${st}"><div class="coluna-topo"><b>${nome}</b><span class="suave pequeno">${itens.length}</span></div>
      ${visiveis.map((x) => cartaoTarefa(x, opcoes)).join("") || '<div class="pequeno suave coluna-vazia">nada aqui</div>'}
      ${itens.length > visiveis.length ? `<div class="pequeno suave coluna-vazia">e mais ${itens.length - visiveis.length}</div>` : ""}</div>`;
  }).join("")}</div>`;
}

async function telaProjeto() {
  const ehCliente = estado.usuario.papel === "cliente";
  const cid = ehCliente ? estado.usuario.cliente_id : estado.clienteId;
  const a = await api(`/api/acompanhamento?cliente_id=${cid}`);
  estado.equipeProjeto = { cliente_id: cid, equipe: a.equipe, projetos: a.projetos };
  const t = a.totais;
  const ativos = a.projetos.filter((p) => p.status === "ativo");
  const varios = a.projetos.length > 1;
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${ehCliente ? "Andamento do projeto" : `Projeto: ${h(a.cliente.nome)}`}</h1>
    <div class="suave">${ehCliente ? `O que a equipe Monvatti já fez, o que está em andamento e os próximos passos na <b>${h(a.cliente.nome)}</b>.`
      : "Etapas, responsáveis e o histórico deste cliente. O cliente vê as tarefas marcadas como visíveis."}</div></div>
    ${eTime() ? `<div class="linha">
      ${podePlanejar() ? `<button type="button" class="sec" id="pj-novo">${ic("mais", "p")}Novo projeto</button>` : ""}
      ${a.projetos.length ? `<button type="button" id="pj-tarefa">${ic("mais", "p")}Nova tarefa</button>` : ""}</div>` : ""}</div>
  ${!a.projetos.length ? `<div class="cartao">${vazio("checar", ehCliente ? "O plano do seu projeto está sendo preparado" : "Este cliente ainda não tem projeto",
      ehCliente ? "Assim que a equipe definir as etapas, elas aparecem aqui com o andamento de cada uma."
        : podePlanejar() ? "Crie o projeto e as tarefas: o cliente acompanha tudo por aqui." : "O consultor ou o administrador cria o projeto deste cliente.")}</div>` : `
  <div class="grade g4">
    <div class="cartao kpi-bloco"><span class="rotulo">Progresso geral</span><div class="valor">${t.progresso}%</div>${barraProgresso(t.progresso)}
      <div class="pequeno suave" style="margin-top:6px">${t.por_status.concluida} de ${t.tarefas} etapa(s) concluída(s)</div></div>
    <div class="cartao kpi-bloco"><span class="rotulo">Em andamento</span><div class="valor">${t.por_status.andamento + t.por_status.ajuste}</div>
      <div class="pequeno suave">${t.por_status.pendente} pendente(s) na fila</div></div>
    <div class="cartao kpi-bloco"><span class="rotulo">${ehCliente ? "Dependem de você" : "Aguardando o cliente"}</span>
      <div class="valor ${t.por_status.aguardando_cliente ? "negativo" : ""}">${t.por_status.aguardando_cliente}</div>
      <div class="pequeno suave">${t.por_status.aguardando_cliente ? "informações ou ações para continuar" : "nada pendente"}</div></div>
    <div class="cartao kpi-bloco"><span class="rotulo">Atrasadas</span><div class="valor ${t.atrasadas ? "negativo" : ""}">${t.atrasadas}</div>
      <div class="pequeno suave">${t.atrasadas ? "passaram do prazo combinado" : "tudo dentro do prazo"}</div></div>
  </div>
  ${a.depende_de_voce.length ? `<section class="aviso amarelo" style="margin-top:16px">
    <b>${ic("alerta", "p")} ${ehCliente ? "Para o trabalho continuar, precisamos de você:" : "Parado esperando o cliente:"}</b>
    <div style="margin-top:6px">${a.depende_de_voce.map((x) => `<div class="linha-depende" data-tarefa="${x.id}" role="button" tabindex="0">
      ${h(x.titulo)}${x.descricao ? ` <span class="suave">— ${h(x.descricao.slice(0, 140))}${x.descricao.length > 140 ? "…" : ""}</span>` : ""}</div>`).join("")}</div></section>` : ""}
  <div class="grade g2" style="margin-top:16px">
    <section class="cartao"><h2>${ic("caminho", "p")}Próximos passos</h2>
      ${a.proximos.length ? a.proximos.map((x) => linhaTarefa(x)).join("") : vazio("checar", "Nada na fila", "Todas as etapas abertas foram concluídas.")}</section>
    <section class="cartao"><h2>${ic("checar", "p")}Concluído recentemente</h2>
      ${a.concluidas_recentes.length ? a.concluidas_recentes.map((x) => linhaTarefa(x)).join("") : vazio("relogio", "Nenhuma etapa concluída ainda")}</section>
  </div>
  <section class="cartao" style="margin-top:16px">
    <div class="linha entre"><h2 style="margin:0">${ic("relogio", "p")}Etapas por situação</h2>
      ${varios ? `<select id="pj-filtro" aria-label="Projeto" style="width:auto"><option value="">Todos os projetos</option>
        ${a.projetos.map((p) => `<option value="${p.id}">${h(p.nome)}</option>`).join("")}</select>` : ""}</div>
    <div id="pj-quadro" style="margin-top:14px"></div>
  </section>
  <section class="cartao" style="margin-top:16px"><h2>${ic("pacote", "p")}${varios ? "Projetos" : "Projeto"}</h2>
    ${a.projetos.map((p) => `<div class="lista-item"><div class="info"><b>${h(p.nome)}</b>
        <span class="pequeno suave">${p.descricao ? h(p.descricao) : "sem descrição"}</span>
        <div style="max-width:320px;margin-top:6px">${barraProgresso(p.tarefas ? Math.round((100 * p.concluidas) / p.tarefas) : 0)}</div>
        <span class="pequeno suave">${p.concluidas} de ${p.tarefas} etapa(s) concluída(s)</span></div>
      <span class="selo ${p.status === "ativo" ? "neutro" : p.status === "concluido" ? "ok" : "demo"}">${h(p.status_nome)}</span>
      ${podePlanejar() ? `<button type="button" class="sec pequeno" data-editar-projeto="${p.id}">${ic("lapis", "p")}Editar</button>` : ""}</div>`).join("")}
  </section>`}
  <div class="grade g2" style="margin-top:16px">
    <section class="cartao"><h2>${ic("usuarios", "p")}${ehCliente ? "Quem cuida da sua loja" : "Equipe deste cliente"}</h2>
      ${a.equipe.length ? a.equipe.map((p) => `<div class="lista-item" style="padding:8px 0"><span class="avatar pequeno-avatar">${avatarHtml(p.nome, p.foto)}</span>
        <div class="info"><b>${h(p.nome)}</b><span class="pequeno suave">${h(p.papel)}</span></div></div>`).join("")
        : `<p class="pequeno suave">${ehCliente ? "A equipe Monvatti atende a sua loja." : "Nenhum consultor ou operador atribuído."}</p>`}
    </section>
    <section class="cartao"><h2>${ic("atividade", "p")}Histórico</h2>
      ${a.historico.length ? `<div class="feed rolagem-y">${a.historico.map((x) => `<div class="feed-item">
        <span class="feed-ic acao-${h(x.acao)}">${ic(ICONE_ACAO[x.acao] || "atividade", "p")}</span>
        <div class="info"><div><b>${h(x.ator)}</b> ${h(x.descricao.charAt(0).toLowerCase() + x.descricao.slice(1))}</div>
          <div class="pequeno suave" title="${data(x.criada_em)}">${tempoRelativo(x.criada_em)}</div></div></div>`).join("")}</div>`
        : vazio("atividade", "Nenhuma atividade ainda")}
    </section>
  </div>`;
  const desenharQuadro = () => {
    const alvo = $("#pj-quadro");
    if (!alvo) return;
    const filtro = $("#pj-filtro")?.value;
    alvo.innerHTML = quadroTarefas(a.tarefas.filter((x) => !filtro || String(x.projeto_id) === filtro), { comProjeto: varios });
    ligarLinhasTarefa(alvo, telaProjeto);
  };
  if ($("#pj-filtro")) $("#pj-filtro").onchange = desenharQuadro;
  desenharQuadro();
  ligarLinhasTarefa($("#tela"), telaProjeto);
  if ($("#pj-novo")) $("#pj-novo").onclick = () => formProjeto(cid, null, telaProjeto);
  if ($("#pj-tarefa")) $("#pj-tarefa").onclick = () => formTarefa(cid, ativos[0]?.id || a.projetos[0].id, telaProjeto);
  $$("[data-editar-projeto]").forEach((b) => (b.onclick = () => formProjeto(cid, a.projetos.find((p) => p.id === +b.dataset.editarProjeto), telaProjeto)));
}

function formProjeto(cid, p, depois) {
  const m = modal(`<h2>${ic("pacote", "p")}${p ? "Editar projeto" : "Novo projeto"}</h2>
    <form id="f-projeto" class="pilha">
      <div><label for="fp-nome">Nome</label><input id="fp-nome" name="nome" type="text" required minlength="2" maxlength="200" value="${h(p?.nome || "")}" placeholder="Ex.: Implantação no Mercado Livre"></div>
      <div><label for="fp-desc">Descrição (o cliente vê)</label><textarea id="fp-desc" name="descricao" rows="3" maxlength="5000">${h(p?.descricao || "")}</textarea></div>
      ${p ? `<div><label for="fp-status">Situação</label><select id="fp-status" name="status">
        ${[["ativo", "Ativo"], ["pausado", "Pausado"], ["concluido", "Concluído"]].map(([k, r]) => `<option value="${k}" ${p.status === k ? "selected" : ""}>${r}</option>`).join("")}</select></div>` : ""}
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">${ic("salvar", "p")}Salvar</button></div>
    </form>`);
  $("#fp-nome", m).focus();
  $("#f-projeto", m).onsubmit = (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(e.target));
    comBotao($("button[type=submit]", m), async () => {
      if (p) await api("/api/projetos/" + p.id, { method: "PATCH", body: dados });
      else await api("/api/projetos", { method: "POST", body: { ...dados, cliente_id: cid } });
      fecharModal();
      toast(p ? "Projeto salvo." : "Projeto criado. Agora cadastre as tarefas.");
      depois?.();
    });
  };
}

async function equipeDoCliente(cid) {
  if (estado.equipeProjeto?.cliente_id === cid) return estado.equipeProjeto;
  const a = await api(`/api/acompanhamento?cliente_id=${cid}`);
  estado.equipeProjeto = { cliente_id: cid, equipe: a.equipe, projetos: a.projetos };
  return estado.equipeProjeto;
}

function opcoesResponsavel(equipe, atual) {
  const pessoas = [...equipe.filter((p) => p.id)];
  if (eAdmin() && !pessoas.some((p) => p.id === estado.usuario.id)) pessoas.push({ id: estado.usuario.id, nome: estado.usuario.nome, papel: "Administrador" });
  if (atual && !pessoas.some((p) => p.id === atual.id)) pessoas.push(atual);
  return `<option value="">Sem responsável</option>${pessoas.map((p) => `<option value="${p.id}" ${atual?.id === p.id ? "selected" : ""}>${h(p.nome)}${p.papel ? " · " + h(p.papel) : ""}</option>`).join("")}`;
}

async function formTarefa(cid, projetoId, depois) {
  const { equipe, projetos } = await equipeDoCliente(cid);
  const m = modal(`<h2>${ic("relogio", "p")}Nova tarefa</h2>
    <form id="f-tarefa" class="pilha">
      <div class="grade g2">
        <div><label for="ft-proj">Projeto</label><select id="ft-proj" name="projeto_id">${projetos.map((p) => `<option value="${p.id}" ${p.id === projetoId ? "selected" : ""}>${h(p.nome)}</option>`).join("")}</select></div>
        <div><label for="ft-status">Situação</label><select id="ft-status" name="status">${STATUS_TAREFA.map(([k, r]) => `<option value="${k}">${r}</option>`).join("")}</select></div>
      </div>
      <div><label for="ft-titulo">Título</label><input id="ft-titulo" name="titulo" type="text" required minlength="2" maxlength="300" placeholder="Ex.: Cadastrar os 20 primeiros produtos"></div>
      <div><label for="ft-desc">Descrição simples do que será feito</label><textarea id="ft-desc" name="descricao" rows="3" maxlength="5000"></textarea></div>
      <div class="grade g2">
        <div><label for="ft-resp">Responsável</label><select id="ft-resp" name="responsavel_id">${opcoesResponsavel(equipe, null)}</select></div>
        <div><label for="ft-prazo">Prazo</label><input id="ft-prazo" name="prazo" type="date"></div>
      </div>
      <label class="confirmacao" style="margin:0"><input type="checkbox" id="ft-visivel" checked> O cliente vê esta tarefa no acompanhamento dele</label>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">${ic("salvar", "p")}Criar tarefa</button></div>
    </form>`);
  $("#ft-titulo", m).focus();
  $("#f-tarefa", m).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    comBotao($("button[type=submit]", m), async () => {
      await api("/api/tarefas", { method: "POST", body: { projeto_id: +f.projeto_id.value, titulo: f.titulo.value, descricao: f.descricao.value,
        status: f.status.value, responsavel_id: +f.responsavel_id.value || null, prazo: f.prazo.value || null, visivel_cliente: $("#ft-visivel", m).checked } });
      fecharModal();
      toast("Tarefa criada.");
      depois?.();
    });
  };
}

async function abrirTarefa(id, depois) {
  const t = await api("/api/tarefas/" + id).catch((e) => { toast(e.message, true); return null; });
  if (!t) return;
  const equipeUser = eTime();
  const editaTudo = podePlanejar() || (equipeUser && t.criado_por_id === estado.usuario.id);
  const { equipe } = equipeUser && editaTudo ? await equipeDoCliente(t.cliente_id) : { equipe: [] };
  const ref = `tarefa:${t.id}`;
  const naoLidas = estado.naoLidas?.por_ref?.[ref] || 0;
  const chatOk = usaDuvidas() && (!equipeUser || t.visivel_cliente);
  const m = modal(`<div class="linha entre" style="align-items:flex-start;padding-right:30px"><div><h2 style="margin:0">${h(t.titulo)}</h2>
      <div class="pequeno suave">${h(t.projeto || "")}${equipeUser && !t.visivel_cliente ? " · interna (o cliente não vê)" : ""}</div></div>
      <div class="linha">${t.atrasada ? '<span class="selo erro">atrasada</span>' : ""}${seloTarefa(t.status)}</div></div>
    ${editaTudo ? `<form id="f-ed-tarefa" class="pilha" style="margin-top:14px">
      <div><label for="et-titulo">Título</label><input id="et-titulo" name="titulo" type="text" required minlength="2" maxlength="300" value="${h(t.titulo)}"></div>
      <div><label for="et-desc">Descrição</label><textarea id="et-desc" name="descricao" rows="3" maxlength="5000">${h(t.descricao)}</textarea></div>
      <div class="grade g3">
        <div><label for="et-status">Situação</label><select id="et-status" name="status">${STATUS_TAREFA.map(([k, r]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${r}</option>`).join("")}</select></div>
        <div><label for="et-resp">Responsável</label><select id="et-resp" name="responsavel_id">${opcoesResponsavel(equipe, t.responsavel_id ? { id: t.responsavel_id, nome: t.responsavel, papel: "" } : null)}</select></div>
        <div><label for="et-prazo">Prazo</label><input id="et-prazo" name="prazo" type="date" value="${h(t.prazo || "")}"></div>
      </div>
      <label class="confirmacao" style="margin:0"><input type="checkbox" id="et-visivel" ${t.visivel_cliente ? "checked" : ""}> O cliente vê esta tarefa</label>
      <div class="linha entre">${podePlanejar() ? `<button type="button" class="sec pequeno perigo-txt" id="et-excluir">${ic("lixo", "p")}Excluir</button>` : "<span></span>"}
        <button type="submit" class="pequeno">${ic("salvar", "p")}Salvar alterações</button></div>
    </form>` : `
    <div class="pilha" style="margin-top:14px">
      ${t.descricao ? `<div class="texto-livre">${h(t.descricao)}</div>` : '<p class="suave pequeno">Sem descrição.</p>'}
      <div class="grade g3 pequeno">
        <div><span class="suave">Responsável</span><div><b>${t.responsavel ? h(t.responsavel) : "a definir"}</b></div></div>
        <div><span class="suave">Prazo</span><div><b>${t.prazo ? dataDia(t.prazo) : "sem prazo"}</b></div></div>
        <div><span class="suave">Atualizada</span><div><b>${tempoRelativo(t.atualizado_em)}</b></div></div>
      </div>
      ${equipeUser ? `<div><label for="et-status">Situação</label><select id="et-status">${STATUS_TAREFA.map(([k, r]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${r}</option>`).join("")}</select></div>` : ""}
      ${!equipeUser && t.status === "aguardando_cliente" ? `<div class="aviso amarelo">${ic("alerta", "p")} Esta etapa está esperando uma informação ou ação sua. Fale com a equipe pelo botão abaixo.</div>` : ""}
    </div>`}
    <h3 style="margin-top:18px">${ic("atividade", "p")}Atualizações</h3>
    <div class="notas">${t.notas.length ? t.notas.map((n) => `<div class="nota ${n.interna ? "interna" : ""}">
      <div class="pequeno"><b>${h(n.autor)}</b> <span class="suave">· ${tempoRelativo(n.criada_em)}</span>${n.interna ? ' <span class="selo demo">só a equipe</span>' : ""}</div>
      <div class="texto-livre">${h(n.texto)}</div></div>`).join("") : '<p class="pequeno suave">Nenhuma atualização ainda.</p>'}</div>
    ${equipeUser ? `<form id="f-nota" class="pilha" style="margin-top:10px">
      <label for="nt-texto" class="so-leitor">Nova observação</label>
      <textarea id="nt-texto" rows="2" maxlength="5000" placeholder="Registrar observação, andamento ou conclusão…" required></textarea>
      <div class="linha entre"><label class="confirmacao" style="margin:0"><input type="checkbox" id="nt-interna" ${t.visivel_cliente ? "" : "checked disabled"}> Só para a equipe</label>
        <button type="submit" class="sec pequeno">${ic("mais", "p")}Registrar</button></div></form>` : ""}
    <div class="linha entre" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--borda)">
      ${chatOk ? `<button type="button" class="sec" id="et-chat">${ic("balao", "p")}${equipeUser ? "Conversar com o cliente sobre esta tarefa" : "Tirar uma dúvida sobre esta etapa"}${contadorHtml(naoLidas)}</button>` : "<span></span>"}
      <button data-fechar>Fechar</button></div>`);
  m.classList.add("larga");
  const atualizar = async (msg) => { toast(msg); await depois?.(); abrirTarefa(id, depois); };
  const status = $("#et-status", m);
  if (status && !editaTudo) status.onchange = () => comBotao(status, async () => {
    await api("/api/tarefas/" + id, { method: "PATCH", body: { status: status.value } });
    await atualizar(`Tarefa marcada como ${NOME_STATUS[status.value].toLowerCase()}.`);
  });
  const fe = $("#f-ed-tarefa", m);
  if (fe) fe.onsubmit = (e) => {
    e.preventDefault();
    const corpo = { titulo: fe.titulo.value, descricao: fe.descricao.value, status: fe.status.value, visivel_cliente: $("#et-visivel", m).checked };
    if (+fe.responsavel_id.value) corpo.responsavel_id = +fe.responsavel_id.value; else corpo.sem_responsavel = true;
    if (fe.prazo.value) corpo.prazo = fe.prazo.value; else corpo.sem_prazo = true;
    comBotao($("button[type=submit]", fe), async () => {
      await api("/api/tarefas/" + id, { method: "PATCH", body: corpo });
      await atualizar("Tarefa salva.");
    });
  };
  const excluir = $("#et-excluir", m);
  if (excluir) excluir.onclick = () => {
    if (!confirm(`Excluir a tarefa “${t.titulo}”? As atualizações dela também saem.`)) return;
    comBotao(excluir, async () => { await api("/api/tarefas/" + id, { method: "DELETE" }); fecharModal(); toast("Tarefa excluída."); depois?.(); });
  };
  const fn = $("#f-nota", m);
  if (fn) fn.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", fn), async () => {
      await api(`/api/tarefas/${id}/notas`, { method: "POST", body: { texto: $("#nt-texto", m).value, interna: $("#nt-interna", m).checked } });
      await atualizar("Observação registrada.");
    });
  };
  const bc = $("#et-chat", m);
  if (bc) bc.onclick = () => abrirChat({ pagina: "projeto", ref_tipo: "tarefa", ref_id: t.id, cliente_id: t.cliente_id, titulo: t.titulo });
}

const estadoTarefas = { cliente: null, minhas: false, busca: "" };

async function telaTarefas() {
  if (estadoTarefas.cliente === null) estadoTarefas.cliente = estado.clienteId ? String(estado.clienteId) : "";
  const f = estadoTarefas;
  const ativos = estado.usuario.clientes.filter((c) => c.ativo);
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Tarefas</h1>
    <div class="suave">${estado.usuario.papel === "operador" ? "As tarefas dos clientes que você atende. Clique em uma tarefa para atualizar a situação e registrar o que foi feito."
      : "Tudo o que a equipe está executando nos clientes que você acompanha."}</div></div>
    <div class="linha filtros">
      <select id="tf-cliente" aria-label="Cliente"><option value="">Todos os clientes</option>
        ${ativos.map((c) => `<option value="${c.id}" ${String(c.id) === f.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select>
      <select id="tf-quem" aria-label="Responsável"><option value="">Toda a equipe</option><option value="1" ${f.minhas ? "selected" : ""}>Só as minhas</option></select>
      <input type="text" id="tf-busca" placeholder="Buscar tarefa…" value="${h(f.busca)}" style="width:200px">
      <button type="button" id="tf-nova">${ic("mais", "p")}Nova tarefa</button>
    </div></div>
  <div id="tf-corpo"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  const carregar = async () => {
    const qs = new URLSearchParams();
    if (f.cliente) qs.set("cliente_id", f.cliente);
    if (f.minhas) qs.set("minhas", "true");
    const lista = await api("/api/tarefas?" + qs);
    const desenhar = () => {
      const termo = f.busca.trim().toLowerCase();
      const filtrada = lista.filter((x) => !termo || `${x.titulo} ${x.cliente_nome} ${x.responsavel}`.toLowerCase().includes(termo));
      $("#tf-corpo").innerHTML = lista.length ? quadroTarefas(filtrada, { comCliente: !f.cliente, comProjeto: true, limiteConcluidas: 20 })
        : `<div class="cartao">${vazio("relogio", "Nenhuma tarefa", "As tarefas são criadas na página Projeto de cada cliente ou pelo botão Nova tarefa.")}</div>`;
      ligarLinhasTarefa($("#tf-corpo"), carregar);
    };
    $("#tf-busca").oninput = (e) => { f.busca = e.target.value; desenhar(); };
    desenhar();
  };
  $("#tf-cliente").onchange = (e) => { f.cliente = e.target.value; carregar(); };
  $("#tf-quem").onchange = (e) => { f.minhas = !!e.target.value; carregar(); };
  $("#tf-nova").onclick = async () => {
    const cid = +f.cliente || estado.clienteId;
    if (!cid) return toast("Escolha o cliente no filtro para criar a tarefa.", true);
    const { projetos } = await equipeDoCliente(cid);
    if (!projetos.length) return toast(podePlanejar() ? "Este cliente ainda não tem projeto. Crie na página Projeto do cliente." : "Este cliente ainda não tem projeto. Peça ao consultor.", true);
    formTarefa(cid, (projetos.find((p) => p.status === "ativo") || projetos[0]).id, carregar);
  };
  await carregar();
}

roteador();
