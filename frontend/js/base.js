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
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  pedido: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
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
  const headers = { "X-Replique": "1", ...(opcoes.headers || {}) };
  if (estado.clienteId && !headers["X-Cliente"]) headers["X-Cliente"] = String(estado.clienteId);
  let body = opcoes.body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const r = await fetch(caminho, { ...opcoes, headers, body });
  if (r.status === 401 && !caminho.startsWith("/api/auth")) {
    const tinha = !!estado.usuario;
    estado.usuario = null;
    if (tinha) setTimeout(() => toast("Sua sessão terminou (tempo sem uso ou acesso alterado). Entre de novo.", true), 300);
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
  redesenharMenu();
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
function fecharModal() { if (!$("#modal").dataset.travado) $("#modal").hidden = true; }
$("#modal").addEventListener("mousedown", (e) => { fecharModal.cliqueFora = e.target.id === "modal"; });
$("#modal").addEventListener("click", (e) => {
  if (e.target.closest("[data-fechar]") || (e.target.id === "modal" && fecharModal.cliqueFora)) fecharModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("#tour") && !$("#tour").hidden) return encerrarTour();
  fecharModal();
});

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
