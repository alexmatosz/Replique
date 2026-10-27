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

const rotas = {
  entrar: telaEntrar, inicio: telaInicio, pedidos: telaPedidos, acompanhamento: telaAcompanhamento, duvidas: telaDuvidas, painel: telaPainel, pesquisar: telaPesquisar, rascunhos: telaRascunhos, editor: telaEditor,
  full: telaFull, contas: telaContas, clientes: telaClientes, config: telaConfig,
  saude: telaSaude, perguntas: telaPerguntas, radar: telaRadar, monitor: telaMonitor, concorrentes: telaConcorrentes, anuncios: telaMeusAnuncios, clonador: telaClonador, fotos: telaFotos, promocoes: telaPromocoes, vendas: telaGestaoVendas, lucratividade: telaLucratividade, dre: telaDre, lucro: telaLucro, produtos: telaProdutos, despesas: telaDespesas, impostos: telaImpostos, analise: telaAnalise,
};
const ALIAS_ROTA = { projeto: "acompanhamento", tarefas: "inicio", lotes: "rascunhos", publicacoes: "anuncios" };
const ROTAS_VENDAS = new Set(["vendas", "lucratividade", "dre", "lucro", "produtos", "despesas", "impostos", "analise"]);
const PERMITIDAS = {
  admin: ["inicio", "pedidos", "acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "pesquisar", "rascunhos", "clonador", "fotos", "promocoes", "anuncios", "editor", "full", "contas", "clientes", "config",
    "saude", "perguntas", "radar", "monitor", "concorrentes", "lucro", "produtos", "despesas", "impostos", "analise"],
  operador: ["inicio", "pedidos", "acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "pesquisar", "rascunhos", "clonador", "fotos", "promocoes", "anuncios", "editor", "full", "contas", "saude", "perguntas", "radar", "monitor", "concorrentes",
    "lucro", "produtos", "despesas", "impostos", "analise"],
  consultor: ["inicio", "pedidos", "acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "rascunhos", "fotos", "promocoes", "anuncios", "full", "saude", "perguntas", "radar", "monitor", "concorrentes", "lucro", "produtos",
    "despesas", "impostos", "analise"],
  cliente: ["acompanhamento", "duvidas", "painel", "vendas", "lucratividade", "dre", "rascunhos", "anuncios", "full", "contas", "saude", "lucro", "produtos", "despesas", "impostos", "analise"],
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
        ["duvidas", "Minhas dúvidas", "balao"]]],
      ["vendas", "Vendas e Lucro", "cifrao", MENU_VENDAS],
    ];
  }
  const gestao = [["contas", "Contas do cliente", "contas"]];
  if (papel === "admin") gestao.push(["clientes", "Clientes", "loja"], ["config", "Configurações", "config"]);
  return [
    ["inicio", "Início", "bussola", [["inicio", papel === "admin" ? "Visão geral" : "Minha carteira", "bussola"], ["painel", "Painel", "painel"]]],
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

const TITULO_ROTA = { inicio: "Visão geral", pedidos: "Pedidos de anúncio", acompanhamento: "Acompanhamento", duvidas: "Dúvidas", painel: "Painel", pesquisar: "Pesquisar", rascunhos: "Rascunhos", editor: "Editar anúncio", full: "Estoque Full",
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
    await guardarSessao(r);
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
        <div><div class="linha entre" style="margin-bottom:4px"><label for="ls" style="margin:0">Senha</label>
          <a href="#" class="pequeno" id="l-esqueci">Esqueci minha senha</a></div>
          <input id="ls" type="password" name="senha" required autocomplete="current-password"></div>
        <button type="submit">Entrar</button>
        <p class="pequeno suave" style="margin:4px 0 0">É lojista e ainda não tem acesso? Peça à Monvatti o <b>link de cadastro</b> da sua loja.</p>
      </form>
      <form id="f-cadastro" class="pilha" ${modo === "agencia" ? "" : "hidden"}>
        <div><label for="ce">Nome da empresa</label><input id="ce" type="text" name="empresa" required></div>
        <div><label for="cn">Seu nome</label><input id="cn" type="text" name="nome" required autocomplete="name"></div>
        <div><label for="cm">E-mail</label><input id="cm" type="email" name="email" required autocomplete="email"></div>
        <div><label for="cs">Senha (mín. 8 caracteres)</label><input id="cs" type="password" name="senha" minlength="8" required autocomplete="new-password"></div>
        ${ACEITE_HTML}
        <button type="submit">Criar agência</button>
        <a href="#/entrar" class="pequeno" style="text-align:center">Já tenho acesso</a>
      </form>
      <div class="rodape-caixa">${ic("escudo")}Conexão protegida. A Monvatti nunca pede a sua senha do marketplace.</div>
      ${rodapeLegal()}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Entrar · Replique";
  avisarCapsLock($("#app"));
  $("#l-esqueci").onclick = (e) => { e.preventDefault(); formEsqueci($(".caixa")); };
  if (modo !== "agencia") setTimeout(() => $("#le")?.focus(), 0);
  const enviar = (id, rota) => ($(id).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button", e.target), async () => {
      const r = await api(rota, { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      await guardarSessao(r);
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
        ${ACEITE_HTML}
        <button type="submit">Criar minha loja</button>
        <a href="#/entrar" class="pequeno" style="text-align:center">Já tenho acesso</a>
      </form>`}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Cadastro da loja · Replique";
  const f = $("#f-convite");
  if (!f) return;
  avisarCapsLock(f);
  $("#cv-loja").focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", f), async () => {
      const r = await api("/api/convite/" + encodeURIComponent(token), { method: "POST", body: Object.fromEntries(new FormData(f)) });
      await guardarSessao(r);
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
      ${d.incompleto ? `<div class="aviso amarelo pequeno">O Mercado Livre demorou para responder: parte dos anúncios ficou sem visitas ou sem os dados do vendedor. Abra de novo em instantes para completar.</div>` : ""}
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

const ABAS_RASCUNHO = [["preparo", "Em preparo", (a) => ["rascunho", "simulado"].includes(a.status) && !a.problema && a.via !== "extensao"],
  ["extensao", "Da extensão", (a) => ["rascunho", "simulado"].includes(a.status) && !a.problema && a.via === "extensao"],
  ["problema", "Com problema", (a) => a.problema], ["publicados", "Publicados", (a) => a.status === "publicado"]];

let _atualizarFila = null;
async function telaRascunhos(abaParam) {
  clearTimeout(_atualizarFila);
  const equipe = eEquipe();
  const [lista, lotes] = await Promise.all([api("/api/anuncios"), equipe ? api("/api/lotes").catch(() => []) : []]);
  if (equipe && !estado.regrasLote) estado.regrasLote = await api("/api/lotes/regras").catch(() => null);
  const regras = estado.regrasLote || { max_anuncios: 20, intervalo_s: 20, limite_diario: 50, parar_apos_falhas: 3 };
  const intervalo = regras.intervalo_s >= 60 ? `${Math.round(regras.intervalo_s / 60)} min` : `${Math.round(regras.intervalo_s)} s`;
  const dicaSel = `Marque os rascunhos prontos para publicar vários de uma vez (até ${regras.max_anuncios}).`;
  const [abaPedida, clientePedido] = String(abaParam || "").split("~");
  abaParam = abaPedida || undefined;
  if (clientePedido && +clientePedido !== estado.clienteId && (estado.usuario.clientes || []).some((c) => c.id === +clientePedido)) {
    trocarCliente(+clientePedido, { navegar: false });
    history.replaceState(null, "", "#/rascunhos/" + (abaParam || ""));
    return telaRascunhos(abaParam);
  }
  const cliente = clienteAtual();
  if (abaParam === "erro") abaParam = "problema";
  const aba = ABAS_RASCUNHO.some(([k]) => k === abaParam) ? abaParam : estado.abaRascunho || "preparo";
  estado.abaRascunho = aba;
  const filtro = ABAS_RASCUNHO.find(([k]) => k === aba)[2];
  const busca = (estado.buscaRascunho || "").toLowerCase();
  const visiveis = lista.filter((a) => filtro(a) && (!busca || (a.titulo || "").toLowerCase().includes(busca)));
  const fila = lotes.filter((l) => ["na_fila", "executando", "interrompido"].includes(l.status));
  const marcavel = equipe && aba !== "publicados";
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>${equipe ? "Rascunhos" : "Anúncios da sua loja"}</h1>
    <div class="suave">${equipe ? `Anúncios de <b>${h(cliente?.nome)}</b> copiados ou criados. Marque os prontos e clique em <b>Publicar selecionados</b>;
      o que der errado vai para <b>Com problema</b> com o motivo, para corrigir e tentar de novo.`
      : "Tudo o que a equipe Monvatti preparou para a sua loja, com quem fez e em que pé está."}</div></div>
    ${equipe ? `<button id="novo">${ic("mais")}Criar do zero</button>` : ""}</div>
  ${fila.map((l) => {
    const feitos = l.total - l.contagem.pendente;
    const pct = l.total ? Math.round((feitos / l.total) * 100) : 0;
    return `<div class="cartao fila-rascunhos" style="margin-bottom:12px">
      <div class="linha entre"><div><b>${l.status === "interrompido" ? "Publicação parada" : "Publicando agora"}</b>
        <span class="pequeno suave"> · ${feitos}/${l.total} processado(s) · ${l.plataformas.map((p) => PLAT[p]?.nome || p).join(", ")} · por ${h(l.por)}</span></div>
        <div class="linha" style="flex-wrap:nowrap">
          ${l.status === "interrompido" ? `<button class="pequeno" data-retomar="${l.id}">Retomar</button>` : ""}
          <button class="sec pequeno" data-cancelar="${l.id}">Cancelar</button>
          <button class="sec pequeno" data-detalhe="${l.id}">${ic("olho", "p")}Detalhes</button></div></div>
      ${l.motivo ? `<div class="pequeno erro-texto" style="margin-top:4px">${ic("alerta", "p")} ${h(l.motivo)}</div>` : ""}
      <div class="barra" style="margin-top:8px"><i style="width:${Math.max(pct, 2)}%"></i></div>
      <div class="pequeno suave" style="margin-top:4px">Um anúncio por vez, com pausa entre eles, para o marketplace não ver uma rajada. Pode sair desta tela: a fila continua.</div></div>`;
  }).join("")}
  ${!equipe && lista.some((a) => a.aprovacao === "pendente") ? `<div class="aviso azul">${ic("aprovar", "p")}
    <b>${lista.filter((a) => a.aprovacao === "pendente").length} anúncio(s) aguardando a sua aprovação.</b>
    Clique em Ver para conferir e aprovar ou pedir ajustes. Nada é publicado sem o seu ok.</div>` : ""}
  <div class="abas">${ABAS_RASCUNHO.map(([k, n, f]) => `<button data-aba="${k}" class="${aba === k ? "ativa" : ""}">${n} (${lista.filter(f).length})</button>`).join("")}</div>
  ${marcavel && visiveis.length ? `<div class="barra-lote cartao">
    <label class="linha" style="margin:0;gap:8px"><input type="checkbox" id="sel-todos"> Selecionar todos</label>
    <span class="suave pequeno" id="sel-info">${dicaSel}</span>
    <button id="b-lote" disabled>${ic("publicar", "p")}Publicar selecionados</button>
    <button id="b-excluir" class="sec perigo-txt" disabled>${ic("lixo", "p")}Excluir selecionados</button>
    <span class="pequeno suave" style="flex-basis:100%">Travas: um anúncio por vez, ${intervalo} entre publicações reais, até ${regras.limite_diario} por conta em 24 h,
      para sozinho depois de ${regras.parar_apos_falhas} falhas seguidas ou se o Mercado Livre pausar um anúncio.</span></div>` : ""}
  <div class="cartao">
    ${lista.length > 8 ? `<input type="search" id="busca-rascunho" placeholder="Buscar pelo título…" value="${h(estado.buscaRascunho || "")}" style="max-width:340px;margin-bottom:8px">` : ""}
    ${visiveis.length ? visiveis.map((a) => `
    <div class="lista-item">
      ${marcavel ? `<input type="checkbox" class="sel-lote" value="${a.id}" aria-label="Selecionar ${h(a.titulo)}">` : ""}
      ${urlSegura(a.foto) ? `<img src="${h(a.foto)}" alt="" referrerpolicy="no-referrer">` : semFoto()}
      <div class="info"><b>${h(a.titulo || "(sem título)")}</b>
        <span class="pequeno suave">${brl(a.preco)} · ${a.via === "extensao" ? "copiado pela extensão Monvatti Pro" : a.origem && PLAT[a.origem] ? "copiado de " + PLAT[a.origem].nome : "criado manualmente"}
          ${a.link_origem && urlSegura(a.link_origem) ? ` · <a href="${h(a.link_origem)}" target="_blank" rel="noopener">anúncio original</a>` : ""}
          ${a.criado_por ? ` · por <b>${h(a.criado_por)}</b>` : ""} · salvo ${data(a.atualizado_em)}
          ${a.pedido_id && eTime() ? ` · <a href="#/pedidos/${a.pedido_id}">pedido #${a.pedido_id}</a>` : ""}</span>
        ${a.falha ? `<span class="pequeno erro-texto">${ic("alerta", "p")} <b>Por que falhou:</b> ${h(a.falha)}</span>` : ""}</div>
      ${seloAprovacao(a.aprovacao)}${seloStatus(a.status)}
      ${equipe ? `<div class="linha" style="flex-wrap:nowrap">
          <a class="botao sec pequeno" href="#/editor/${a.id}">${ic("lapis", "p")}${a.problema ? "Corrigir" : "Editar"}</a>
          ${a.problema ? `<button class="pequeno" data-tentar="${a.id}">${ic("trocar", "p")}Tentar de novo</button>` : ""}</div>`
        : `<button class="sec pequeno" data-ver="${a.id}">${ic("olho", "p")}Ver</button>`}
    </div>`).join("") : vazio("rascunhos", aba === "problema" ? "Nenhum rascunho com problema" : aba === "publicados" ? "Nada publicado ainda" : aba === "extensao" ? "Nenhum anúncio trazido pela extensão" : "Nenhum rascunho em preparo",
      aba === "extensao" ? "Na página de um anúncio do Mercado Livre, use Cadastrar no Replique na extensão Monvatti Pro: o anúncio chega aqui." : aba !== "preparo" ? "" : equipe ? `<a href="#/pesquisar">Pesquise um produto</a> e copie um anúncio, ou comece um <a href="#/pedidos">pedido de anúncio</a>.` : "Assim que a equipe começar, os anúncios aparecem aqui.")}</div>`;
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
  $$("[data-tentar]").forEach((b) => (b.onclick = () => {
    const a = lista.find((x) => x.id === +b.dataset.tentar);
    abrirLote([a.id], a.plataformas_falha);
  }));
  $$("[data-detalhe]").forEach((b) => (b.onclick = () => comBotao(b, () => detalheLote(+b.dataset.detalhe))));
  $$("[data-cancelar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Cancelar esta publicação? O que já foi publicado continua no ar; o restante não será enviado.")) return;
    comBotao(b, async () => { await api(`/api/lotes/${b.dataset.cancelar}/cancelar`, { method: "POST" }); telaRascunhos(aba); });
  }));
  $$("[data-retomar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Retomar? Confira antes o motivo da parada: a fila continua de onde parou.")) return;
    comBotao(b, async () => { await api(`/api/lotes/${b.dataset.retomar}/retomar`, { method: "POST" }); telaRascunhos(aba); });
  }));
  const selecionados = () => $$(".sel-lote:checked").map((c) => +c.value);
  const atualizar = () => {
    const n = selecionados().length;
    $("#b-lote").disabled = !n;
    $("#b-lote").innerHTML = `${ic("publicar", "p")}Publicar selecionados${n ? ` (${n})` : ""}`;
    $("#b-excluir").disabled = !n;
    $("#b-excluir").innerHTML = `${ic("lixo", "p")}Excluir selecionados${n ? ` (${n})` : ""}`;
    $("#sel-info").textContent = n > regras.max_anuncios ? `${n} selecionados: o máximo de uma vez é ${regras.max_anuncios}.`
      : n ? `${n} rascunho(s) selecionado(s).` : dicaSel;
    $("#sel-info").classList.toggle("aviso-texto", n > regras.max_anuncios);
  };
  $$(".sel-lote").forEach((c) => (c.onchange = atualizar));
  const todos = $("#sel-todos");
  if (todos) todos.onchange = () => { $$(".sel-lote").forEach((c) => (c.checked = todos.checked)); atualizar(); };
  const bLote = $("#b-lote");
  if (bLote) bLote.onclick = () => abrirLote(selecionados());
  const bExcluir = $("#b-excluir");
  if (bExcluir) bExcluir.onclick = () => {
    const ids = selecionados();
    if (!ids.length || !confirm(`Excluir ${ids.length} rascunho(s) de ${cliente?.nome}? Eles saem da lista de rascunhos. Nada muda nos marketplaces.`)) return;
    comBotao(bExcluir, async () => {
      const r = await api("/api/anuncios/excluir", { method: "POST", body: { ids } });
      toast(`${r.excluidos} rascunho(s) excluído(s).`);
      telaRascunhos(aba);
    });
  };
  if (fila.some((l) => l.status !== "interrompido")) {
    _atualizarFila = setTimeout(() => { if (estado._rotaAtual === "rascunhos" && $("#modal").hidden) telaRascunhos(aba); }, 3000);
  }
}

const SITUACAO = { pronto: ["ok", "pronto"], bloqueado: ["erro", "bloqueado"], pulado: ["demo", "pulado"] };
const STATUS_LOTE = { na_fila: ["neutro", "na fila"], executando: ["neutro", "publicando"], concluido: ["ok", "concluído"],
  interrompido: ["erro", "interrompido"], cancelado: ["demo", "cancelado"] };
const STATUS_ITEM = { pendente: ["neutro", "aguardando"], publicado: ["ok", "publicado"], simulado: ["demo", "simulado"],
  falhou: ["erro", "falhou"], pulado: ["demo", "pulado"] };
const seloDe = (mapa, s) => `<span class="selo ${mapa[s]?.[0] || "neutro"}">${mapa[s]?.[1] || h(s)}</span>`;

function abrirLote(ids, plataformas = null) {
  const maximo = estado.regrasLote?.max_anuncios || 20;
  if (ids.length > maximo) return toast(`O máximo é ${maximo} rascunhos de uma vez. Desmarque alguns.`, true);
  let destinos = ["mercadolivre"];
  try { destinos = JSON.parse(localStorage.getItem("rpq_destinos") || '["mercadolivre"]'); } catch {}
  if (plataformas?.length) destinos = plataformas;
  const m = modal(`<h2>${ic("publicar", "p")}Publicar ${ids.length} rascunho(s)</h2>
    <div class="aviso azul">${ic("loja", "p")} Cliente: <b>${h(clienteAtual()?.nome)}</b></div>
    <label>Publicar em</label>
    <div class="chips" id="lote-plats">${Object.entries(PLAT).map(([k, p]) => `<label class="chip ${destinos.includes(k) ? "marcado" : ""}">
      <input type="checkbox" value="${k}" ${destinos.includes(k) ? "checked" : ""}> ${p.nome}</label>`).join("")}</div>
    <p class="pequeno suave" style="margin-top:12px">Primeiro o Replique confere tudo <b>sem publicar</b>. Depois os anúncios entram numa fila e são
      publicados <b>um por vez</b>, com intervalo, para não parecer publicação em rajada.</p>
    <div id="lote-previa"></div>
    <div class="linha" id="lote-rodape" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button>
      <button id="lote-conferir">${ic("checar", "p")}Conferir antes de publicar</button></div>`);
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
    <p class="pequeno suave">Travas: até ${p.max_anuncios} rascunhos de uma vez · ${p.intervalo_s} s entre publicações reais · para sozinho após 3 falhas seguidas ou se o ML pausar um anúncio · pula duplicados.</p>
    ${reais.length ? `<label class="confirmacao"><input type="checkbox" id="lote-conferi">
      Conferi que ${reais.map((k) => `<b>${h(p.contas[k].apelido)}</b> (${h(PLAT[k].nome)})`).join(" e ")} ${reais.length > 1 ? "são contas" : "é a conta"} de <b>${h(p.cliente.nome)}</b></label>` : ""}`;
  const rodape = $("#lote-rodape", m);
  rodape.innerHTML = `<button class="sec" data-fechar>Cancelar</button><button id="lote-criar" ${total ? "" : "disabled"}>${ic("publicar", "p")}Colocar ${total} na fila</button>`;
  const conferi = $("#lote-conferi", m), criar = $("#lote-criar", m);
  if (conferi) { criar.disabled = true; conferi.onchange = () => (criar.disabled = !conferi.checked || !total); }
  criar.onclick = () => comBotao(criar, async () => {
    const lote = await api("/api/lotes", { method: "POST", body: { anuncio_ids: ids, plataformas: plats, confirmado: !!conferi?.checked } });
    fecharModal();
    toast(`${lote.total} publicação(ões) na fila. Acompanhe aqui em Rascunhos.`);
    telaRascunhos("preparo");
  });
}

async function detalheLote(id) {
  const l = await api("/api/lotes/" + id);
  modal(`<div class="linha entre"><h2 style="margin:0">Publicação #${l.id}</h2>${seloDe(STATUS_LOTE, l.status)}</div>
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
  if (a.pedido_id && eTime()) setTimeout(() => api("/api/pedidos/" + a.pedido_id).then((p) => {
    const alvo = $("#ed-pedido-texto");
    if (alvo) alvo.innerHTML = `${legendaHtml(p.legenda)}<p class="pequeno suave">${h(p.resumo)} · ${p.quantidade} anúncio(s) · <a href="#/pedidos/${p.id}">abrir o pedido</a></p>`;
  }).catch(() => $("#ed-pedido")?.remove()), 0);
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
  ${a.pedido_id && eTime() ? `<details class="cartao editor-pedido" id="ed-pedido" open><summary>${ic("pedido", "p")} Instruções do pedido #${a.pedido_id}</summary>
    <div class="legenda-texto" id="ed-pedido-texto" style="margin-top:8px"><span class="girando"></span></div></details>` : ""}
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
  const r = await fetch(caminho, { headers: { ...(estado.clienteId ? { "X-Cliente": String(estado.clienteId) } : {}) } });
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
    ${s.padrao_casa || s.exemplos_usados ? `<p class="pequeno suave">${s.padrao_casa ? "Seguindo o Padrão da casa" : ""}${s.padrao_casa && s.exemplos_usados ? " · " : ""}${s.exemplos_usados ? `${s.exemplos_usados} exemplo(s) aprovado(s) como referência` : ""}.</p>` : ""}
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
    if (s.fonte === "ia") vigiarEdicaoIa($("#titulo").value, $("#descricao").value);
  };
  $("#ia-so-titulo", m).onclick = () => aplicar(false);
  $("#ia-tudo", m).onclick = () => aplicar(true);
}

function vigiarEdicaoIa(titulo, descricao) {
  const campo = $("#descricao")?.closest(".campo");
  if (!campo) return;
  $("#ia-exemplo")?.remove();
  campo.insertAdjacentHTML("afterend", `<div class="aviso azul linha entre" id="ia-exemplo" hidden><span class="pequeno">Você ajustou o texto da IA.
    Se ficou bom, guarde como exemplo: a IA passa a escrever parecido nos próximos anúncios desta categoria.</span>
    <button type="button" class="sec pequeno" id="b-salvar-exemplo">${ic("estrela", "p")}Salvar como exemplo</button></div>`);
  const conferir = () => { $("#ia-exemplo").hidden = $("#titulo").value === titulo && $("#descricao").value === descricao; };
  $("#titulo").addEventListener("input", conferir);
  $("#descricao").addEventListener("input", conferir);
  $("#b-salvar-exemplo").onclick = async () => {
    await salvar();
    await aprovarComoModelo(estado.anuncio.id, $("#b-salvar-exemplo"), { origem: "editado", titulo: $("#titulo").value, descricao: $("#descricao").value });
    $("#ia-exemplo").remove();
  };
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

const dataCurta = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

async function telaFull() {
  $("#tela").innerHTML = `<div class="topo"><div><h1>Estoque Full</h1>
    <div class="suave">Unidades de <b>${h(clienteAtual()?.nome)}</b> nos centros do Mercado Livre, com o custo parado e aviso do que vai
      gerar custo de armazenamento até o fim do mês que vem.</div>
    <div class="pequeno suave">Estoque e entradas vêm da API oficial do Mercado Livre. O tempo no Full é calculado pelas entradas (as unidades mais antigas
      saem primeiro). A tarifa de armazenagem não vem pela API: informe em Custos do Full. Produto há 2 meses ou mais no Full gera aviso no sino.</div></div>
    <div class="linha">${eEquipe() || estado.usuario.papel === "cliente" ? `<button class="sec" id="full-config">${ic("ajustes", "p")}Custos do Full</button>` : ""}
      <span class="pequeno suave" data-atualizado="full"></span>
      <button class="sec pequeno" id="full-recarregar">${ic("trocar", "p")}Atualizar agora</button></div></div>
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
    ${ia ? `<div class="aviso azul">IA de imagem ligada: <b>${ia === "openai" ? "OpenAI" : "Google Gemini"}</b>. As fotos levam de 1 a 3 minutos e seguem
        o estilo de fotos do Padrão da casa. Os textos das fotos são escritos pelo Replique, sem erro de português.</div>`
      : `<div class="aviso amarelo"><b>A IA de imagem está desligada.</b> Mesmo assim saem 3 fotos: fundo branco (perfeito só quando a foto
        original já tem fundo liso), destaques e ficha técnica. Para as fotos em contexto e em uso falta a chave de uma IA de imagem:
        o administrador coloca <code>OPENAI_API_KEY</code> ou <code>GEMINI_API_KEY</code> no arquivo .env e reinicia o Replique
        (o passo a passo está em Configurações › IA e Padrão da casa).</div>`}
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
  $("#g-resultado", m).innerHTML = `<h3 style="margin:16px 0 8px">Resultado ${parcial ? "" : '<span class="suave pequeno">· 1. confira · 2. ajuste no lápis se quiser · 3. desmarque o que não vai usar</span>'}</h3><div class="geradas">${g.resultado.map((r) => `
    <div class="gerada">${r.url ? `<img src="${h(r.url)}" alt="${h(r.nome)}">` : `<div class="sem-foto">${ic("alerta")}</div>`}
      <div class="linha entre" style="flex-wrap:nowrap"><label class="linha" style="margin:0;gap:6px">${r.url && !parcial ? `<input type="checkbox" data-usar-gerada="${h(r.tipo)}" ${r.descartada ? "" : "checked"} aria-label="Usar ${h(r.nome)}">` : ""}<b>${h(r.nome)}</b></label>
        ${r.url && !parcial ? `<button type="button" class="sec pequeno" data-editar-gerada="${h(r.tipo)}" title="Ajustar no editor de fotos">${ic("lapis", "p")}Editar</button>` : ""}</div>
      ${r.aviso ? `<span class="pequeno aviso-texto">${h(r.aviso)}</span>` : ""}</div>`).join("")}</div>
    ${parcial ? `<div class="carregando"><span class="girando"></span> Gerando o restante…</div>` : ""}`;
  if (parcial || !prontas.length) return;
  $$("[data-editar-gerada]", m).forEach((b) => (b.onclick = () => {
    const r = g.resultado.find((x) => x.tipo === b.dataset.editarGerada);
    abrirEditorFotos({ url: r.url, titulo: r.nome, modos: ["substituir"], aoSalvar: (url) => { r.url = url; mostrarGeradas(m, g, false); } });
  }));
  $$("[data-usar-gerada]", m).forEach((c) => (c.onchange = () => { g.resultado.find((x) => x.tipo === c.dataset.usarGerada).descartada = !c.checked; }));
  $("#g-acoes", m).innerHTML = `<button class="sec" data-fechar>Descartar tudo</button>
    <button class="sec" id="g-substituir">Trocar as fotos atuais pelas marcadas</button>
    <button id="g-inicio">${ic("mais", "p")}Usar as marcadas no início</button>`;
  const aplicar = (substituir) => {
    const novas = prontas.filter((r) => !r.descartada).map((r) => r.url);
    if (!novas.length) return toast("Marque pelo menos uma foto para usar.", true);
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
    <div class="atualizado"><span class="pequeno suave" data-atualizado="saude"></span>
    ${!cliente && lista.length ? `<button id="saude-todos" class="sec pequeno" title="Ler agora a saúde de todos">${ic("trocar", "p")}Atualizar agora</button>` : ""}</div></div>
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
    <div class="atualizado"><span class="pequeno suave" data-atualizado="perguntas"></span>
      <button class="sec pequeno" id="p-recarregar" title="Ler agora no Mercado Livre">${ic("trocar", "p")}Atualizar agora</button></div></div>
  <div id="p-corpo"><div class="carregando"><span class="girando"></span> Buscando as perguntas de cada cliente…</div></div>`;
  $("#p-recarregar").onclick = () => comBotao($("#p-recarregar"), () => { estado.perguntasAoVivo = true; return telaPerguntas(); });
  const aoVivo = estado.perguntasAoVivo;
  estado.perguntasAoVivo = false;
  mostrarAtualizado("perguntas");
  let r;
  try { r = await api("/api/perguntas/central" + (aoVivo ? "?ao_vivo=true" : "")); }
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
const TENDENCIA_MERCADO = { subindo: ["ok", "subindo", "↑"], caindo: ["erro", "caindo", "↓"], estavel: ["neutro", "estável", "→"], novo: ["neutro", "primeira coleta", "•"] };
const PARTES_NOTA = { demanda: "Procura", tendencia: "Tendência", concorrencia: "Pouca concorrência", preco: "Faixa de preço", margem: "Margem estimada" };
const PESOS_NOTA = { demanda: 35, tendencia: 15, concorrencia: 30, preco: 10, margem: 10 };
const radarMercado = { aba: "oportunidades", categoria: "", sub: "", dados: null, chave: "" };
const CAMPOS_FILTRO_MERCADO = ["rm-texto", "rm-ordem", "rm-tipo", "rm-tend", "rm-pmin", "rm-pmax", "rm-conc", "rm-nota", "rm-demanda", "rm-margem", "rm-oficial", "rm-full"];

const corNota = (n) => (n >= 70 ? "ok" : n >= 50 ? "neutro" : "demo");
const rotuloConcorrencia = (c) => (c <= 35 ? "baixa" : c <= 65 ? "média" : "alta");

function baixarCsv(nome, cabecalho, linhas) {
  const campo = (v) => {
    const t = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = "﻿" + [cabecalho, ...linhas].map((l) => l.map(campo).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filtrosSalvosMercado() {
  try { return JSON.parse(localStorage.getItem("rpq_mapeador_filtros") || "{}"); } catch { return {}; }
}

function categoriasOportunidade() {
  try { return JSON.parse(localStorage.getItem("rpq_oport_cats") || "[]"); } catch { return []; }
}

async function oportunidadesMercado(cats) {
  const r = radarMercado;
  const escolhidas = new Set(r.oportCats || categoriasOportunidade());
  const podeEditar = eEquipe() && estado.usuario.papel !== "consultor";
  $("#radar-corpo").innerHTML = `
    <form class="cartao" id="op-form">
      <label>Categorias para procurar (até 5). Sem nenhuma marcada, usa as buscas em alta do Mercado Livre inteiro.</label>
      <div class="chips" style="margin-top:6px">${cats.map((c) => `<label class="chip"><input type="checkbox" data-op-cat="${c.id}" ${escolhidas.has(c.id) ? "checked" : ""}> ${h(c.nome)}</label>`).join("")}</div>
      <div class="linha entre" style="margin-top:14px">
        <label class="linha" style="gap:8px;margin:0">Margem que você quer ter <input type="number" id="op-margem" min="0" max="80" step="1" value="${r.oportMargem ?? 20}" style="width:80px"> %</label>
        <button type="submit" id="op-buscar">${ic("alvo", "p")}Buscar oportunidades</button></div>
      <p class="pequeno suave" style="margin:10px 0 0">O Replique junta as buscas que mais cresceram no Mercado Livre, compara com as coletas anteriores
        (subiu de posição? está no topo há vários dias?), mede a concorrência no catálogo e calcula quanto dá para pagar no produto
        para sobrar a margem que você quer depois da tarifa, do frete e do imposto. Quanto mais vezes você busca, melhor fica a leitura da tendência.</p></form>
    <div id="op-lista" style="margin-top:16px"></div>`;
  const desenhar = () => {
    const d = r.oport;
    const lista = $("#op-lista");
    if (!d) { lista.innerHTML = vazio("alvo", "Escolha as categorias e busque", "As oportunidades aparecem aqui, da melhor para a pior."); return; }
    lista.innerHTML = d.itens.length ? `<div class="grade g2 oportunidades">${d.itens.map((x, i) => `<div class="cartao oportunidade">
        <div class="linha entre" style="flex-wrap:nowrap;align-items:flex-start">
          <div style="min-width:0"><b>${h(x.termo)}</b>${x.demo ? ' <span class="selo demo">demonstração</span>' : ""}
            <div class="pequeno suave">${h(x.categoria || "")}${x.exemplo ? ` · ex.: ${h(x.exemplo)}` : ""}</div></div>
          <span class="nota-oportunidade ${x.oportunidade >= 70 ? "alta" : x.oportunidade >= 50 ? "media" : ""}" title="Oportunidade de 0 a 100">${x.oportunidade}</span></div>
        <div class="grade g3 pequeno" style="margin:10px 0">
          <div><span class="suave">Preço médio</span><div><b>${brl(x.preco_mediano)}</b></div></div>
          <div><span class="suave">Concorrência</span><div><b>${x.concorrencia <= 35 ? "baixa" : x.concorrencia < 65 ? "média" : "alta"}</b>${x.vendedores ? ` · ${x.vendedores} vend.` : ""}</div></div>
          <div title="Preço médio − tarifa do ML − frete grátis estimado − imposto − ${d.margem_alvo}% de margem"><span class="suave">Pague até</span>
            <div><b>${x.custo_maximo != null ? (x.custo_maximo > 0 ? brl(x.custo_maximo) : '<span class="ruim">não fecha</span>') : "—"}</b></div></div></div>
        ${x.motivos.map((m) => `<div class="pequeno bom">${ic("checar", "p")} ${h(m)}</div>`).join("")}
        ${x.cuidados.map((m) => `<div class="pequeno aviso-texto">${ic("alerta", "p")} ${h(m)}</div>`).join("")}
        <div class="pequeno suave" style="margin-top:6px">tarifa ${brl(x.tarifa)} · frete ${x.frete_estimado != null ? brl(x.frete_estimado) : "não estimado"} · imposto ${pct(d.imposto_pct)}</div>
        <div class="linha" style="margin-top:10px;gap:6px">
          ${urlSegura(x.link) ? `<a class="botao sec pequeno" href="${h(x.link)}" target="_blank" rel="noopener">${ic("externo", "p")}Ver no ML</a>` : ""}
          ${podeEditar ? `<button type="button" class="sec pequeno" data-op-pesquisar="${h(x.termo)}">${ic("pesquisar", "p")}Pesquisar e copiar</button>` : ""}
          ${podeEditar && x.produto_id && !x.demo ? `<button type="button" class="sec pequeno" data-op-acompanhar="${i}">${ic("olho", "p")}Acompanhar no Radar</button>` : ""}</div>
      </div>`).join("")}</div>
      <p class="pequeno suave">Oportunidade = ${Object.entries(d.pesos).map(([k, p]) => `${Math.round(p * 100)}% ${{ momento: "força da tendência", concorrencia: "pouca concorrência", margem: "margem", preco: "faixa de preço" }[k]}`).join(" + ")}.
        Força da tendência: posição nas buscas em alta, se subiu desde a coleta anterior e em quantos dias apareceu no topo nos últimos 10 dias.
        O frete é estimado pela medida típica da categoria; confira o peso real do produto.</p>`
      : vazio("alvo", "Nenhuma busca em alta nestas categorias agora");
    $$("[data-op-pesquisar]").forEach((b) => (b.onclick = () => {
      estado.termoSugerido = b.dataset.opPesquisar;
      location.hash = "#/pesquisar";
    }));
    $$("[data-op-acompanhar]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
      const x = d.itens[+b.dataset.opAcompanhar];
      await api("/api/monitor", { method: "POST", body: { produto_id: x.produto_id, apelido: x.termo, origem: "mapeador" } });
      toast("Produto no Radar de anúncios: a tendência de vendas e de preço aparece lá.");
    })));
  };
  $("#op-form").onsubmit = (ev) => {
    ev.preventDefault();
    const marcadas = $$("[data-op-cat]:checked").map((c) => c.dataset.opCat);
    if (marcadas.length > 5) { toast("Escolha no máximo 5 categorias.", true); return; }
    r.oportCats = marcadas;
    r.oportMargem = Math.min(80, Math.max(0, +$("#op-margem").value || 0));
    try { localStorage.setItem("rpq_oport_cats", JSON.stringify(marcadas)); } catch {}
    comBotao($("#op-buscar"), async () => {
      $("#op-lista").innerHTML = `<div class="carregando"><span class="girando"></span> Lendo as buscas em alta e a concorrência de cada uma. A primeira vez leva até um minuto por categoria…</div>`;
      try { r.oport = await api(`/api/mercado/oportunidades?categorias=${marcadas.join(",")}&margem=${r.oportMargem}`); }
      catch (e) { $("#op-lista").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
      desenhar();
    });
  };
  desenhar();
}

async function telaRadar() {
  const r = radarMercado;
  if (r.aba === "precos") r.aba = "tendencias";
  $("#tela").innerHTML = `<div class="topo"><div><h1>Mapeador de produtos</h1>
    <div class="suave">Tendências e nichos do Mercado Livre: o que está sendo mais buscado e vendido, com a concorrência e a margem de cada um.
      Filtre do jeito que quiser, salve os filtros e leve o produto para acompanhar, clonar ou analisar os concorrentes.</div></div></div>
    <div class="segmentos" role="tablist" aria-label="Mapeador" style="margin-bottom:16px">
      ${[["oportunidades", "Oportunidades"], ["tendencias", "Tendências de busca"], ["vendidos", "Mais vendidos"]].map(([v, n]) =>
        `<button type="button" role="tab" data-aba-radar="${v}" class="${r.aba === v ? "ativa" : ""}" aria-selected="${r.aba === v}">${n}</button>`).join("")}</div>
    <div id="radar-corpo"></div>`;
  $$("[data-aba-radar]").forEach((b) => (b.onclick = () => { r.aba = b.dataset.abaRadar; telaRadar(); }));
  const cats = await api("/api/mercado/categorias");
  if (r.aba === "oportunidades") return oportunidadesMercado(cats);
  const subs = r.categoria ? await api(`/api/mercado/categorias?pai=${r.categoria}`) : [];
  const vendidos = r.aba === "vendidos";
  const salvos = filtrosSalvosMercado();
  const daEquipe = await api("/api/filtros/mapeador").catch(() => []);
  $("#radar-corpo").innerHTML = `
    <form class="cartao" id="radar-filtros">
      <div class="grade g4">
        <div><label for="rm-plat">Plataforma</label><select id="rm-plat"><option value="mercadolivre">Mercado Livre</option>
          <option value="shopee">Shopee</option><option value="amazon">Amazon</option></select></div>
        <div><label for="rm-cat">Categoria</label><select id="rm-cat"><option value="">${vendidos ? "Escolha a categoria" : "Todas as categorias"}</option>
          ${cats.map((c) => `<option value="${c.id}" ${c.id === r.categoria ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select></div>
        <div><label for="rm-sub">Subcategoria</label><select id="rm-sub" ${subs.length ? "" : "disabled"}><option value="">Todas</option>
          ${subs.map((c) => `<option value="${c.id}" ${c.id === r.sub ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select></div>
        <div><label for="rm-texto">Palavra-chave</label><input id="rm-texto" type="search" placeholder="Ex.: inox, gamer, kit"></div>
        ${vendidos ? "" : `<div><label for="rm-tipo">Tipo de busca</label><select id="rm-tipo"><option value="">Todas</option>
          <option value="em_alta">Em alta (crescendo)</option><option value="mais_buscado">Mais buscadas</option><option value="popular">Populares</option></select></div>`}
        <div><label for="rm-tend">Tendência</label><select id="rm-tend"><option value="">Qualquer</option>
          <option value="subindo">Subindo</option><option value="estavel">Estável</option><option value="caindo">Caindo</option><option value="novo">Primeira coleta</option></select></div>
        <div><label>Preço médio (R$)</label><div class="linha" style="gap:6px;flex-wrap:nowrap">
          <input id="rm-pmin" type="number" min="0" step="1" placeholder="de" aria-label="Preço mínimo">
          <input id="rm-pmax" type="number" min="0" step="1" placeholder="até" aria-label="Preço máximo"></div></div>
        <div><label for="rm-demanda">Procura mínima</label><select id="rm-demanda"><option value="0">Qualquer</option>
          <option value="60">60 ou mais</option><option value="80">80 ou mais</option></select></div>
        <div><label for="rm-conc">Concorrência</label><select id="rm-conc"><option value="">Qualquer</option>
          <option value="35">Só baixa</option><option value="65">Baixa ou média</option></select></div>
        <div><label for="rm-margem">Margem estimada mínima</label><select id="rm-margem"><option value="">Qualquer</option>
          <option value="60">60% ou mais</option><option value="70">70% ou mais</option><option value="75">75% ou mais</option></select></div>
        <div><label for="rm-nota">Oportunidade mínima</label><select id="rm-nota"><option value="0">Qualquer</option>
          <option value="50">50 ou mais</option><option value="70">70 ou mais</option></select></div>
        <div><label for="rm-aval">Avaliação</label><select id="rm-aval" disabled title="Conferido em 23/10/2026: a API do Mercado Livre só libera avaliações dos anúncios do próprio vendedor; de produtos de outros vendedores responde 403"><option>Não disponível pela API</option></select></div>
        <div><label for="rm-ordem">Ordenar por</label><select id="rm-ordem">
          <option value="nota">Melhor oportunidade</option><option value="posicao">Mais procura</option>
          <option value="concorrencia">Menos concorrência</option><option value="margem">Maior margem</option>
          <option value="preco_asc">Menor preço</option><option value="preco_desc">Maior preço</option></select></div>
      </div>
      <div class="linha entre" style="margin-top:12px">
        <div class="chips"><label class="chip"><input type="checkbox" id="rm-oficial"> Sem lojas oficiais</label>
          <label class="chip"><input type="checkbox" id="rm-full"> Pouco Full</label></div>
        <div class="linha" style="gap:8px">
          <select id="rm-salvos" aria-label="Filtros salvos" style="width:auto"><option value="">Filtros salvos</option>
            ${daEquipe.length ? `<optgroup label="Da equipe">${daEquipe.map((f) => `<option value="e:${f.id}">${h(f.nome)}${f.criado_por ? ` (${h(f.criado_por)})` : ""}</option>`).join("")}</optgroup>` : ""}
            ${Object.keys(salvos).length ? `<optgroup label="Só neste navegador">${Object.keys(salvos).map((n) => `<option value="n:${h(n)}">${h(n)}</option>`).join("")}</optgroup>` : ""}</select>
          <button type="button" class="sec pequeno" id="rm-tirar-filtro" hidden title="Tirar este filtro salvo">${ic("lixo", "p")}</button>
          <button type="button" class="sec pequeno" id="rm-salvar">${ic("salvar", "p")}Salvar filtros</button>
          <button type="button" class="sec pequeno" id="rm-csv">${ic("enviar", "p")}CSV</button>
          <button type="submit" id="rm-buscar">${ic("alvo", "p")}${vendidos ? "Ver mais vendidos" : "Mapear tendências"}</button></div></div>
    </form>
    <details class="cartao formula-nota" style="margin-top:16px"><summary><b>Como a oportunidade e a tendência são calculadas</b></summary>
      <p class="pequeno">Oportunidade (0 a 100) = ${Object.entries(PESOS_NOTA).map(([k, p]) => `${p}% ${PARTES_NOTA[k].toLowerCase()}`).join(" + ")}.</p>
      <ul class="pequeno suave">
        <li><b>Procura:</b> posição nas buscas em alta do Mercado Livre (as 10 primeiras são as que mais cresceram) ou no ranking oficial de mais vendidos da categoria.</li>
        <li><b>Tendência:</b> compara a posição de agora com a coleta guardada de pelo menos 12 h atrás. Subiu 3 posições ou mais = subindo (100 pontos); caiu 3 ou mais = caindo (20); entre isso = estável (60). Sem coleta anterior = primeira coleta (60).</li>
        <li><b>Concorrência:</b> quantos anúncios a categoria tem, quantos vendedores disputam os produtos de catálogo e o peso de lojas oficiais e Full. Quanto menor, mais pontos.</li>
        <li><b>Faixa de preço:</b> de R$ 40 a R$ 300 = 100; de R$ 20 a 40 ou de R$ 300 a 600 = 70; fora disso = 40.</li>
        <li><b>Margem estimada:</b> o que sobra do preço médio depois da tarifa de venda do Mercado Livre (consultada na API) e do imposto configurado em Impostos. Ainda faltam o frete e o custo do produto. 40% ou menos = 0 ponto; 70% ou mais = 100.</li>
        <li>Vendas de concorrentes não vêm pela API oficial, por isso não entram na conta.</li>
      </ul></details>
    <div id="radar-nichos"></div>
    <div id="radar-lista" style="margin-top:16px"></div>`;
  const categoriaEscolhida = () => $("#rm-sub").value || $("#rm-cat").value;
  $("#rm-cat").onchange = async () => { r.categoria = $("#rm-cat").value; r.sub = ""; r.dados = null; await telaRadar(); };
  $("#rm-sub").onchange = () => { r.sub = $("#rm-sub").value; };
  $("#rm-plat").onchange = desenharMercado;
  CAMPOS_FILTRO_MERCADO.forEach((id) => {
    const el = $("#" + id);
    if (el) el.addEventListener(el.type === "search" || el.type === "number" ? "input" : "change", desenharMercado);
  });
  $("#rm-salvar").onclick = () => {
    const valores = Object.fromEntries(CAMPOS_FILTRO_MERCADO.filter((id) => $("#" + id)).map((id) => {
      const el = $("#" + id);
      return [id, el.type === "checkbox" ? el.checked : el.value];
    }));
    const m = modal(`<h2>${ic("salvar", "p")}Salvar filtros</h2>
      <form id="rm-form-salvar" class="pilha"><div><label for="rm-nome-filtro">Nome</label>
        <input id="rm-nome-filtro" maxlength="40" required placeholder="Ex.: casa até R$ 100 subindo"></div>
        <label class="linha" style="margin:0;gap:8px"><input type="checkbox" id="rm-compartilhar" checked> Compartilhar com a equipe (fica no servidor; sem marcar, fica só neste navegador)</label>
        <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Salvar</button></div></form>`);
    $("#rm-nome-filtro", m).focus();
    $("#rm-form-salvar", m).onsubmit = (e) => {
      e.preventDefault();
      const nome = $("#rm-nome-filtro", m).value.trim();
      if (!nome) return;
      if ($("#rm-compartilhar", m).checked) {
        comBotao($("#rm-form-salvar button[type=submit]", m), async () => {
          await api("/api/filtros/mapeador", { method: "POST", body: { nome, dados: valores } });
          fecharModal();
          toast("Filtros salvos para toda a equipe.");
          await telaRadar();
        });
        return;
      }
      try { localStorage.setItem("rpq_mapeador_filtros", JSON.stringify({ ...filtrosSalvosMercado(), [nome]: valores })); } catch {}
      fecharModal();
      toast("Filtros salvos neste navegador.");
      telaRadar();
    };
  };
  $("#rm-salvos").onchange = () => {
    const escolha = $("#rm-salvos").value;
    $("#rm-tirar-filtro").hidden = !escolha;
    const valores = escolha.startsWith("e:") ? daEquipe.find((f) => `e:${f.id}` === escolha)?.dados
      : filtrosSalvosMercado()[escolha.slice(2)];
    if (!valores) return;
    Object.entries(valores).forEach(([id, v]) => {
      const el = $("#" + id);
      if (el) el.type === "checkbox" ? (el.checked = !!v) : (el.value = v);
    });
    desenharMercado();
  };
  $("#rm-tirar-filtro").onclick = () => {
    const escolha = $("#rm-salvos").value;
    if (!escolha || !confirm("Tirar este filtro salvo?")) return;
    comBotao($("#rm-tirar-filtro"), async () => {
      if (escolha.startsWith("e:")) await api(`/api/filtros/mapeador/${escolha.slice(2)}`, { method: "DELETE" });
      else {
        const todos = filtrosSalvosMercado();
        delete todos[escolha.slice(2)];
        try { localStorage.setItem("rpq_mapeador_filtros", JSON.stringify(todos)); } catch {}
      }
      toast("Filtro tirado.");
      await telaRadar();
    });
  };
  $("#rm-csv").onclick = () => {
    if (!r.dados) return toast("Mapeie primeiro para exportar.", true);
    baixarCsv(`mapeador-${r.aba}.csv`, ["Busca ou produto", "Tipo", "Posição", "Tendência", "Categoria", "Anúncios na categoria", "Preço médio",
      "Menor preço", "Vendedores", "% lojas oficiais", "% Full", "Concorrência", "Margem estimada %", "Oportunidade", "Demonstração", "Link"],
    filtrarMercado([...r.dados]).map((x) => [x.termo, (TIPO_MERCADO[x.tipo] || [])[1], x.posicao, TENDENCIA_MERCADO[x.tendencia]?.[1], x.categoria,
      x.anuncios_categoria, x.preco_mediano, x.preco_min, x.vendedores, x.oficiais != null ? Math.round(x.oficiais * 100) : "",
      x.full != null ? Math.round(x.full * 100) : "", x.concorrencia, x.margem_estimada, x.nota, x.demo ? "sim" : "", x.link]));
  };
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
  const demandaMin = parseInt(v("#rm-demanda"), 10) || 0, margemMin = parseFloat(v("#rm-margem"));
  const filtrada = lista.filter((x) => {
    if (texto && !`${x.termo} ${x.categoria} ${x.exemplo || ""}`.toLowerCase().includes(texto)) return false;
    if (v("#rm-tipo") && x.tipo !== v("#rm-tipo")) return false;
    if (v("#rm-tend") && x.tendencia !== v("#rm-tend")) return false;
    if (!Number.isNaN(pmin) && !(x.preco_mediano >= pmin)) return false;
    if (!Number.isNaN(pmax) && !(x.preco_mediano <= pmax)) return false;
    if (!Number.isNaN(conc) && x.concorrencia > conc) return false;
    if ((x.partes?.demanda ?? 0) < demandaMin) return false;
    if (!Number.isNaN(margemMin) && !(x.margem_estimada >= margemMin)) return false;
    if (x.nota < notaMin) return false;
    if ($("#rm-oficial")?.checked && x.oficiais > 0) return false;
    if ($("#rm-full")?.checked && x.full > 0.3) return false;
    return true;
  });
  const ordem = {
    nota: (a, b) => b.nota - a.nota, posicao: (a, b) => a.posicao - b.posicao, concorrencia: (a, b) => a.concorrencia - b.concorrencia,
    margem: (a, b) => (b.margem_estimada ?? -1) - (a.margem_estimada ?? -1),
    preco_asc: (a, b) => (a.preco_mediano ?? Infinity) - (b.preco_mediano ?? Infinity),
    preco_desc: (a, b) => (b.preco_mediano ?? -1) - (a.preco_mediano ?? -1),
  }[v("#rm-ordem") || "nota"];
  return filtrada.sort(ordem);
}

function desenharMercado() {
  const r = radarMercado;
  if (!$("#radar-lista")) return;
  if ($("#rm-plat") && $("#rm-plat").value !== "mercadolivre") {
    $("#radar-nichos").innerHTML = "";
    $("#radar-lista").innerHTML = `<div class="aviso azul">${ic("alerta", "p")} A API oficial da ${$("#rm-plat").value === "shopee" ? "Shopee" : "Amazon"}
      não entrega tendências de busca nem ranking de mais vendidos por categoria. Por isso o mapeador usa só o Mercado Livre.
      Para conferir um produto nessa plataforma, use <a href="#/pesquisar">Pesquisar</a>.</div>`;
    return;
  }
  if (!r.dados) return;
  const lista = filtrarMercado([...r.dados]);
  const demo = r.dados.some((x) => x.demo);
  const nichos = Object.values(lista.reduce((acc, x) => {
    if (!x.categoria) return acc;
    const n = (acc[x.categoria] ||= { nome: x.categoria, itens: 0, soma: 0, subindo: 0 });
    n.itens += 1;
    n.soma += x.nota;
    if (x.tendencia === "subindo") n.subindo += 1;
    return acc;
  }, {})).map((n) => ({ ...n, media: Math.round(n.soma / n.itens) }))
    .sort((a, b) => b.itens - a.itens || b.media - a.media).slice(0, 6);
  $("#radar-nichos").innerHTML = (demo ? `<div class="aviso amarelo" style="margin-top:16px">${ic("alerta", "p")} <b>Demonstração:</b> nenhuma conta do Mercado Livre conectada, então estes números são fictícios. Conecte uma conta em <a href="#/contas">Contas</a> para ver o mercado real.</div>` : "")
    + (nichos.length ? `<section class="cartao" style="margin-top:16px">
    <div class="linha entre"><h2 style="margin:0">${ic("alvo", "p")}Nichos em alta</h2><span class="pequeno suave">clique para filtrar</span></div>
    <div class="grade-nichos" style="margin-top:12px">${nichos.map((n) => `<button type="button" class="nicho" data-nicho="${h(n.nome)}">
      <b>${h(n.nome)}</b><span class="pequeno suave">${n.itens} ${r.aba === "vendidos" ? "produto(s)" : "busca(s)"} · oportunidade média ${n.media}${n.subindo ? ` · ${n.subindo} subindo` : ""}</span></button>`).join("")}</div></section>` : "");
  $$("[data-nicho]").forEach((b) => (b.onclick = () => { $("#rm-texto").value = b.dataset.nicho; desenharMercado(); }));
  const podeEditar = eEquipe() && estado.usuario.papel !== "consultor";
  $("#radar-lista").innerHTML = `<div class="cartao">${lista.length ? `<div class="linha entre" style="margin-bottom:10px">
      <span class="pequeno suave">${lista.length} de ${r.dados.length} resultado(s)</span>
      <span class="pequeno suave">Passe o mouse na oportunidade para ver as partes da conta</span></div>
    <div class="tabela embutida"><table><thead><tr><th style="min-width:200px">${r.aba === "vendidos" ? "Produto" : "Busca"}</th><th>Tendência</th><th>Categoria</th>
      <th class="num">Preço médio</th><th class="num">Vendedores</th><th>Concorrência</th><th class="num">Margem est.</th><th class="num">Oportunidade</th><th></th></tr></thead><tbody>
      ${lista.map((x, i) => {
        const [selo, tipo] = TIPO_MERCADO[x.tipo] || ["neutro", x.tipo];
        const [corT, rotT, setaT] = TENDENCIA_MERCADO[x.tendencia] || TENDENCIA_MERCADO.novo;
        const partes = Object.entries(x.partes || {}).map(([k, v]) => `${PARTES_NOTA[k]}: ${v} × ${PESOS_NOTA[k]}%`).join("\n");
        return `<tr><td><div class="linha" style="gap:10px;flex-wrap:nowrap">
            ${x.foto && urlSegura(x.foto) ? `<img src="${h(x.foto)}" alt="" width="40" height="40" loading="lazy" style="border-radius:6px;border:1px solid var(--borda);object-fit:contain;background:#fff;flex-shrink:0">` : ""}
            <div><b>${h(x.termo)}</b>${x.demo ? ' <span class="selo demo">demonstração</span>' : ""}<div class="pequeno suave"><span class="selo ${selo}">${tipo}</span> ${x.tipo === "mais_vendido" ? `${x.posicao}º da categoria` : `#${x.posicao} nas buscas`}</div></div></div></td>
          <td><span class="selo ${corT}" title="${x.posicao_anterior ? `antes: #${x.posicao_anterior}, agora: #${x.posicao}` : "sem coleta anterior para comparar"}">${setaT} ${rotT}</span>
            <button type="button" class="link-sutil pequeno" data-hist="${i}">histórico</button></td>
          <td class="pequeno">${h(x.categoria || "—")}${x.anuncios_categoria ? `<div class="suave">${numero(x.anuncios_categoria)} anúncios</div>` : ""}</td>
          <td class="num">${brl(x.preco_mediano)}${x.preco_min ? `<div class="pequeno suave">a partir de ${brl(x.preco_min)}</div>` : ""}</td>
          <td class="num">${x.vendedores ?? "—"}${x.oficiais ? `<div class="pequeno suave">${Math.round(x.oficiais * 100)}% oficiais</div>` : ""}</td>
          <td><div class="pequeno">${rotuloConcorrencia(x.concorrencia)}</div><div class="barra" style="width:90px"><i style="width:${x.concorrencia}%"></i></div></td>
          <td class="num">${x.margem_estimada != null ? `${String(x.margem_estimada).replace(".", ",")}%` : "—"}</td>
          <td class="num"><span class="selo ${corNota(x.nota)}" title="${h(partes)}">${x.nota}</span></td>
          <td style="text-align:right;white-space:nowrap">
            ${podeEditar && x.produto_id && !x.demo ? `<button type="button" class="sec pequeno" data-acompanhar="${i}" title="Acompanhar no Radar de anúncios" aria-label="Acompanhar">${ic("olho", "p")}</button>
              <button type="button" class="sec pequeno" data-clonar="${i}" title="Clonar: criar um rascunho a partir deste produto" aria-label="Clonar">${ic("copiar", "p")}</button>` : ""}
            ${x.produto_id && !x.demo ? `<a class="botao sec pequeno" href="#/concorrentes/${h(x.produto_id)}" title="Ver concorrentes: quem vende este produto" aria-label="Ver concorrentes">${ic("usuarios", "p")}</a>` : ""}
            ${urlSegura(x.link) ? `<a class="botao sec pequeno" href="${h(x.link)}" target="_blank" rel="noopener" title="Abrir no Mercado Livre">${ic("externo", "p")}</a>` : ""}
            ${podeEditar ? `<button type="button" class="pequeno" data-pesquisar-termo="${h(x.termo)}" title="Pesquisar e copiar" aria-label="Pesquisar">${ic("pesquisar", "p")}</button>` : ""}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : vazio("alvo", "Nada com esses filtros", "Afrouxe algum filtro ou escolha outra categoria.")}</div>`;
  $$("[data-pesquisar-termo]").forEach((b) => (b.onclick = () => {
    estado.termoSugerido = b.dataset.pesquisarTermo;
    location.hash = "#/pesquisar";
  }));
  $$("[data-hist]").forEach((b) => (b.onclick = () => comBotao(b, () => historicoMercado(lista[+b.dataset.hist]))));
  $$("[data-acompanhar]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const x = lista[+b.dataset.acompanhar];
    await api("/api/monitor", { method: "POST", body: { produto_id: x.produto_id, apelido: x.termo, origem: "mapeador" } });
    toast("Produto adicionado ao Radar de anúncios.");
  })));
  $$("[data-clonar]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const x = lista[+b.dataset.clonar];
    const a = await api("/api/anuncios/copiar", { method: "POST", body: { plataforma: "mercadolivre", id_externo: x.produto_id, tipo: "PRODUCT" } });
    toast("Rascunho criado a partir do produto. Revise antes de publicar.");
    location.hash = "#/editor/" + a.id;
  })));
}

async function historicoMercado(x) {
  const hist = await api("/api/mercado/historico?" + new URLSearchParams({ chave: x.chave }));
  const maxPos = Math.max(1, ...hist.map((p) => p.posicao || 0));
  modal(`<h2>${ic("relogio", "p")}Histórico: ${h(x.termo)}</h2>
    <p class="pequeno suave">Cada linha é uma coleta guardada pelo Replique (no máximo uma a cada 2 horas). A posição ${x.tipo === "mais_vendido" ? "no ranking de mais vendidos" : "nas buscas em alta"} mostra se o interesse está subindo ou caindo.</p>
    ${hist.length ? `<div class="tabela embutida"><table><thead><tr><th>Coleta</th><th class="num">Posição</th><th></th><th class="num">Preço médio</th><th class="num">Vendedores</th><th class="num">Oportunidade</th></tr></thead><tbody>
      ${hist.slice().reverse().map((p) => `<tr><td class="pequeno">${data(p.em)}</td><td class="num">#${p.posicao ?? "—"}</td>
        <td><div class="barra" style="width:120px"><i style="width:${p.posicao ? Math.max(4, 100 - ((p.posicao - 1) / maxPos) * 100) : 0}%"></i></div></td>
        <td class="num">${brl(p.preco)}</td><td class="num">${p.vendedores ?? "—"}</td><td class="num">${p.nota ?? "—"}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="suave">Ainda não há coletas guardadas para este item.</p>`}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
}

async function meusPrecos(alvo) {
  const lista = await api("/api/radar");
  const recarregar = () => meusPrecos(alvo);
  alvo.innerHTML = `<div class="linha entre" style="margin-bottom:12px"><div class="suave">Anúncios de <b>${h(clienteAtual()?.nome)}</b> publicados no Mercado Livre comparados com os concorrentes do mesmo produto.
      A sugestão nunca desce abaixo da margem mínima.</div>
    <div class="atualizado"><span class="pequeno suave" data-atualizado="radar_anuncios"></span>
    ${lista.length ? `<button id="radar-todos" class="sec pequeno">${ic("trocar", "p")}Atualizar agora</button>` : ""}</div></div>
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
  const lerVelhos = async (so) => {
    for (const a of so) await ler(a.id);
    const falhas = so.filter((a) => errosRadar.has(a.id)).length;
    if (falhas) toast(`${falhas} anúncio(s) não puderam ser lidos. O motivo aparece na linha de cada um.`, true);
    await recarregar();
  };
  if (todos) todos.onclick = () => comBotao(todos, () => lerVelhos(lista));
  const desatualizados = lista.filter((a) => velho(a.radar?.criada_em, 6)).slice(0, 30);
  if (todos && eEquipe() && desatualizados.length && podeAutoAtualizar("precos")) {
    todos.disabled = true;
    todos.innerHTML = `<span class="girando"></span> Atualizando ${desatualizados.length}…`;
    lerVelhos(desatualizados).catch(() => {});
  }
}

const _autoAtualizado = new Map();
function podeAutoAtualizar(chave, minutos = 10) {
  const k = `${chave}:${estado.clienteId}`;
  const ultima = _autoAtualizado.get(k) || 0;
  if (Date.now() - ultima < minutos * 60000) return false;
  _autoAtualizado.set(k, Date.now());
  return true;
}
const velho = (iso, horas) => !iso || Date.now() - quando(iso).getTime() > horas * 3600000;

const TIPO_MONITOR = { proprio: ["ok", "meu anúncio"], produto: ["neutro", "produto de catálogo"], concorrente: ["demo", "concorrente"] };
const STATUS_ML = { active: ["ok", "ativo"], paused: ["erro", "pausado"], under_review: ["erro", "em moderação"], closed: ["erro", "finalizado"],
  inactive: ["erro", "inativo"], fora_do_catalogo: ["demo", "fora do catálogo"], sem_ofertas: ["demo", "sem ofertas"] };
const LOGISTICA_ML = { fulfillment: "Full", cross_docking: "Coleta", drop_off: "Agência", xd_drop_off: "Agência", self_service: "Flex", default: "Próprio" };
const TIPO_ANUNCIO_ML = { gold_pro: "Premium", gold_special: "Clássico", free: "Grátis" };
const REPUTACAO_ML = { "5_green": ["ok", "verde"], "4_light_green": ["ok", "verde-clara"], "3_yellow": ["demo", "amarela"],
  "2_orange": ["erro", "laranja"], "1_red": ["erro", "vermelha"] };
const estadoMonitor = { aba: "acompanhados" };

function minigrafico(valores, largura = 110, altura = 28) {
  const v = valores.filter((x) => x != null);
  if (v.length < 2) return '<span class="pequeno suave">—</span>';
  const min = Math.min(...v), max = Math.max(...v), faixa = max - min || 1;
  const pontos = v.map((x, i) => `${(i / (v.length - 1)) * (largura - 4) + 2},${altura - 2 - ((x - min) / faixa) * (altura - 4)}`).join(" ");
  const cor = v[v.length - 1] < v[0] ? "var(--vermelho)" : v[v.length - 1] > v[0] ? "var(--verde)" : "var(--azul)";
  return `<svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Variação de preço">
    <polyline points="${pontos}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const naoDisponivel = (motivo) => `<span class="pequeno suave" title="${h(motivo)}">não disponível</span>`;

const TENDENCIA = { alta: ["ok", "Tendência de alta"], queda: ["erro", "Tendência de queda"], estavel: ["neutro", "Estável"],
  sem_dados: ["neutro", "Sem histórico ainda"] };
const SETA = { subindo: "↑", caindo: "↓", estavel: "→" };

function celulaTendencia(t) {
  if (!t) return "—";
  const [cls, nome] = TENDENCIA[t.resumo] || TENDENCIA.sem_dados;
  const cor = (s) => (s.tipo === "vendas" || s.tipo === "visitas" ? (s.sentido === "subindo" ? "bom" : s.sentido === "caindo" ? "ruim" : "suave") : "suave");
  return `<span class="selo ${cls}">${nome}</span>
    ${t.sinais.map((s) => `<div class="pequeno ${cor(s)}">${SETA[s.sentido] || ""} ${h(s.texto)}</div>`).join("")}
    ${t.desde ? `<div class="pequeno suave">comparado com ${dataCurta(t.desde.slice(0, 10))}</div>` : ""}
    ${t.dica ? `<div class="pequeno suave" title="${h(t.dica)}">${t.fonte_vendas === "extensao" ? "vendas: abra o anúncio com a extensão" : "vendas: sincronize em Vendas e Lucro"}</div>` : ""}`;
}

async function telaMonitor() {
  const e = estadoMonitor;
  const podeEditar = eEquipe() && estado.usuario.papel !== "consultor";
  $("#tela").innerHTML = `<div class="topo"><div><h1>Radar de anúncios</h1>
    <div class="suave">Acompanhe anúncios de <b>${h(clienteAtual()?.nome)}</b> e produtos de catálogo em que ele disputa venda: preço, posição,
      visitas, vendas, tarifa e alertas. Cada atualização fica guardada no histórico.</div></div>
    <div class="atualizado"><span class="pequeno suave" data-atualizado="radar_anuncios"></span>
    ${podeEditar ? `<button id="mon-todos" class="sec pequeno">${ic("trocar", "p")}Atualizar agora</button>` : ""}</div></div>
    <div class="segmentos" role="tablist" aria-label="Radar de anúncios" style="margin-bottom:16px">
      ${[["acompanhados", "Anúncios acompanhados"], ["precos", "Meus preços publicados"]].map(([v, n]) =>
        `<button type="button" role="tab" data-aba-mon="${v}" class="${e.aba === v ? "ativa" : ""}" aria-selected="${e.aba === v}">${n}</button>`).join("")}</div>
    <div id="mon-corpo"></div>`;
  $$("[data-aba-mon]").forEach((b) => (b.onclick = () => { e.aba = b.dataset.abaMon; telaMonitor(); }));
  if ($("#mon-todos")) $("#mon-todos").onclick = () => comBotao($("#mon-todos"), async () => {
    const r = await api("/api/monitor/atualizar", { method: "POST" });
    toast(`${r.lidos} anúncio(s) atualizado(s).${r.erros.length ? ` ${r.erros.length} com erro.` : ""}`, !!r.erros.length);
    telaMonitor();
  });
  if (e.aba === "precos") return meusPrecos($("#mon-corpo"));
  const todos = await api("/api/monitor");
  const filtroTend = e.tendencia || "todos";
  const lista = todos.filter((m) => filtroTend === "todos" || m.tendencia?.resumo === filtroTend);
  const contaTend = (r) => todos.filter((m) => m.tendencia?.resumo === r).length;
  const alertas = lista.flatMap((m) => m.alertas.map((a) => ({ ...a, m })));
  const nomeMon = Object.fromEntries(lista.map((m) => [m.id, m.apelido || m.item_id]));
  $("#mon-corpo").innerHTML = `
    ${podeEditar ? `<form class="cartao" id="mon-form" style="margin-bottom:16px">
      <div class="linha" style="align-items:flex-end">
        <div style="flex:2;min-width:240px"><label for="mon-link">Link ou código do Mercado Livre</label>
          <input id="mon-link" required placeholder="Link do seu anúncio ou do produto de catálogo (endereço com /p/MLB...)"></div>
        <div style="flex:1;min-width:160px"><label for="mon-apelido">Apelido (opcional)</label><input id="mon-apelido" maxlength="200"></div>
        ${lista.some((m) => m.proprio) ? `<div style="flex:1;min-width:200px"><label for="mon-vinculo">Concorrente de qual anúncio meu? (opcional)</label>
          <select id="mon-vinculo"><option value="">Nenhum</option>${lista.filter((m) => m.proprio).map((m) => `<option value="${m.id}">${h(m.apelido || m.item_id)}</option>`).join("")}</select></div>` : ""}
        <button type="submit" id="mon-add">${ic("olho", "p")}Acompanhar</button></div>
      <p class="pequeno suave" style="margin:10px 0 0">Seus anúncios mostram tudo: preço, visitas, vendas (dos pedidos sincronizados no Financeiro), conversão e tarifa.
        De concorrentes, o Mercado Livre só libera pela API o que aparece no produto de catálogo: preço, frete, tipo de anúncio e vendedor.
        <b>Visitas e vendas de concorrentes não vêm pela API</b>: a tendência de vendas deles sai dos vendidos que a extensão Monvatti Pro lê
        quando você abre o anúncio ou a busca. Deixe aqui produtos com bom preço de compra e espere a tendência de alta: o sino avisa.</p></form>` : ""}
    ${todos.length ? `<div class="segmentos" style="margin-bottom:12px">${[["todos", `Todos (${todos.length})`], ["alta", `Tendência de alta (${contaTend("alta")})`],
      ["queda", `Em queda (${contaTend("queda")})`], ["estavel", `Estáveis (${contaTend("estavel")})`]].map(([v, n]) =>
      `<button type="button" data-tend="${v}" class="${filtroTend === v ? "ativa" : ""}">${n}</button>`).join("")}</div>` : ""}
    ${lista.some((m) => m.demo) ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>Demonstração:</b> sem conta do Mercado Livre conectada, as leituras marcadas são fictícias.</div>` : ""}
    ${alertas.length ? `<section class="cartao" style="margin-bottom:16px"><h2>${ic("alerta", "p")}Alertas</h2>
      ${alertas.map((a) => `<div class="aviso ${a.nivel === "vermelho" ? "vermelho" : "amarelo"} pequeno" style="margin:6px 0">
        <b>${h(a.m.apelido || a.m.item_id)}</b>: ${h(a.texto)}</div>`).join("")}</section>` : ""}
    <div class="cartao">${lista.length ? `<div class="tabela embutida"><table><thead><tr><th style="min-width:260px">Anúncio</th><th class="num">Preço</th><th>Variação</th>
      <th style="min-width:190px">Tendência (7 dias)</th><th>Mercado</th><th style="min-width:190px">Catálogo e preço</th><th class="num">Vendas/dia · mês</th><th class="num">Visitas 30 dias</th><th class="num">Conversão</th><th>Tarifa e logística</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((m) => {
        const d = m.atual?.dados || {};
        const [ct, rt] = TIPO_MONITOR[m.tipo] || ["neutro", m.tipo];
        const ant = m.anterior?.preco, atual = m.atual?.preco;
        const variacao = ant && atual && ant !== atual ? `<div class="pequeno ${atual < ant ? "ruim" : ""}">${atual < ant ? "↓" : "↑"} de ${brl(ant)}</div>` : "";
        const semApi = "O Mercado Livre não libera esse dado de outros vendedores pela API.";
        return `<tr><td><div class="linha" style="gap:10px;flex-wrap:nowrap">
            ${d.foto && urlSegura(d.foto) ? `<img src="${h(d.foto)}" alt="" width="40" height="40" loading="lazy" style="border-radius:6px;border:1px solid var(--borda);object-fit:contain;background:#fff;flex-shrink:0">` : ""}
            <div><b>${h(m.apelido || d.titulo || m.item_id)}</b>${m.demo ? ' <span class="selo demo">demonstração</span>' : ""}
              <div class="pequeno suave"><span class="selo ${ct}">${rt}</span> ${h(m.item_id)}${m.atual ? ` · lido ${tempoRelativo(m.atual.lida_em)}` : ""}</div>
              ${d.avaliacoes?.nota ? `<div class="pequeno">${ic("estrela", "p")} ${String(d.avaliacoes.nota).replace(".", ",")} · ${numero(d.avaliacoes.total)} avaliação(ões)</div>`
                : m.proprio || m.demo ? "" : '<div class="pequeno suave" title="A API só libera avaliações dos anúncios do próprio vendedor">avaliações: não disponível pela API</div>'}</div></div></td>
          <td class="num"><b>${brl(atual)}</b>${variacao}</td>
          <td>${minigrafico(m.precos)}</td>
          <td>${celulaTendencia(m.tendencia)}</td>
          <td class="pequeno">${d.mercado_mediana ? `mediana ${brl(d.mercado_mediana)}<div class="suave">${brl(d.mercado_min)} a ${brl(d.mercado_max)} · ${d.mercado_vendedores} vendedor(es)</div>` : "—"}
            ${d.posicao_preco ? `<div>${d.posicao_preco}º mais barato</div>` : ""}</td>
          <td class="pequeno">${celulaCatalogo(m, d)}${m.vinculado_a_id ? `<div class="suave">concorrente de ${h(nomeMon[m.vinculado_a_id] || "")}</div>` : ""}</td>
          <td class="num">${m.proprio ? (d.vendas_dia != null ? `${String(d.vendas_dia).replace(".", ",")} · ${String(d.vendas_mes).replace(".", ",")}` : `<span class="pequeno suave" title="Vendas vêm dos pedidos sincronizados no módulo Vendas e Lucro">sem vendas sincronizadas</span>`)
            : m.tendencia?.vendas_dia != null ? `${String(m.tendencia.vendas_dia).replace(".", ",")}/dia<div class="pequeno suave" title="Pelos vendidos públicos que a extensão Monvatti Pro leu">pela extensão</div>` : naoDisponivel(semApi)}</td>
          <td class="num">${m.proprio ? (d.visitas_30d ?? "—") : naoDisponivel(semApi)}</td>
          <td class="num">${m.proprio ? (d.conversao_pct != null ? `${String(d.conversao_pct).replace(".", ",")}%` : "—") : naoDisponivel(semApi)}</td>
          <td class="pequeno">${d.tarifa != null ? `tarifa ${brl(d.tarifa)}<div class="suave">você recebe ${brl(d.voce_recebe)}</div>` : ""}
            ${d.frete_custo != null ? `<div>frete grátis custa ${brl(d.frete_custo)}</div>` : ""}
            ${d.logistica ? `<div>${h(LOGISTICA_ML[d.logistica] || d.logistica)}${d.frete_gratis ? " · frete grátis" : ""}</div>` : ""}
            ${d.tipo_anuncio ? `<div class="suave">${h(TIPO_ANUNCIO_ML[d.tipo_anuncio] || d.tipo_anuncio)}</div>` : ""}</td>
          <td>${m.atual ? seloDe(STATUS_ML, m.atual.status) : '<span class="selo neutro">não lido</span>'}${m.alertas.length ? `<div class="pequeno ruim">${m.alertas.length} alerta(s)</div>` : ""}</td>
          <td style="text-align:right;white-space:nowrap">
            <button type="button" class="sec pequeno" data-mon-hist="${m.id}">${ic("relogio", "p")}Histórico</button>
            ${m.produto_id ? `<a class="botao sec pequeno" href="#/concorrentes/${h(m.produto_id)}">${ic("usuarios", "p")}Concorrentes</a>` : ""}
            ${urlSegura(d.link) ? `<a class="botao sec pequeno" href="${h(d.link)}" target="_blank" rel="noopener" title="Abrir no Mercado Livre">${ic("externo", "p")}</a>` : ""}
            ${podeEditar ? `<button type="button" class="sec pequeno" data-mon-ler="${m.id}" title="Ler de novo agora">${ic("trocar", "p")}</button>
              <button type="button" class="sec pequeno" data-mon-tirar="${m.id}" title="Parar de acompanhar">${ic("lixo", "p")}</button>` : ""}</td></tr>`;
      }).join("")}</tbody></table></div>`
      : todos.length ? vazio("olho", "Nenhum anúncio neste filtro") : vazio("olho", "Nenhum anúncio no radar", podeEditar ? "Cole acima o link de um anúncio do cliente ou de um produto de catálogo. Também dá para mandar produtos do Mapeador para cá." : "A equipe ainda não colocou anúncios no radar.")}</div>`;
  $$("[data-tend]").forEach((b) => (b.onclick = () => { e.tendencia = b.dataset.tend; telaMonitor(); }));
  if (podeEditar && todos.some((m) => velho(m.atual?.lida_em, 6)) && podeAutoAtualizar("monitor")) {
    const b = $("#mon-todos");
    if (b) { b.disabled = true; b.innerHTML = `<span class="girando"></span> Atualizando…`; }
    api("/api/monitor/atualizar", { method: "POST" })
      .then((r) => { if (estado._rotaAtual === "monitor" && r.lidos) telaMonitor(); else if (b) { b.disabled = false; b.innerHTML = `${ic("trocar", "p")}Atualizar agora`; } })
      .catch(() => { if (b) { b.disabled = false; b.innerHTML = `${ic("trocar", "p")}Atualizar agora`; } });
  }
  if ($("#mon-form")) $("#mon-form").onsubmit = (ev) => {
    ev.preventDefault();
    comBotao($("#mon-add"), async () => {
      await api("/api/monitor", { method: "POST", body: { link: $("#mon-link").value, apelido: $("#mon-apelido").value,
        vinculado_a_id: +($("#mon-vinculo")?.value || 0) || null } });
      toast("Anúncio colocado no radar.");
      telaMonitor();
    });
  };
  $$("[data-mon-ler]").forEach((b) => (b.onclick = () => comBotao(b, async () => {
    await api(`/api/monitor/${b.dataset.monLer}/atualizar`, { method: "POST" });
    telaMonitor();
  })));
  $$("[data-mon-tirar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Parar de acompanhar este anúncio? O histórico dele será apagado.")) return;
    comBotao(b, async () => { await api(`/api/monitor/${b.dataset.monTirar}`, { method: "DELETE" }); telaMonitor(); });
  }));
  $$("[data-mon-hist]").forEach((b) => (b.onclick = () => comBotao(b, () => historicoMonitor(+b.dataset.monHist))));
}

function celulaCatalogo(m, d) {
  if (!m.proprio) return d.preco != null ? `preço dele ${brl(d.preco)}<div class="suave">vendas e posição na busca: não disponível pela API</div>` : "—";
  const c = d.catalogo;
  const linhas = [];
  if (c?.indisponivel) linhas.push(`<span class="suave" title="${h(c.indisponivel)}">disputa de catálogo: não disponível</span>`);
  else if (c?.status) {
    linhas.push(`<span class="selo ${c.ganhando ? "ok" : c.status === "listed" ? "neutro" : "erro"}">${h(c.status_nome)}</span>${c.demo ? ' <span class="selo demo">demo</span>' : ""}`);
    if (!c.ganhando && c.motivos?.length) linhas.push(`<div>motivo: ${h(c.motivos.join(", "))}</div>`);
    if (c.preco_para_ganhar) linhas.push(`<div>para ganhar: <b>${brl(c.preco_para_ganhar)}</b></div>`);
    if (!c.ganhando && c.vencedor_preco) linhas.push(`<div class="suave">vencedor a ${brl(c.vencedor_preco)}</div>`);
    if (!c.ganhando && c.oportunidades?.length) linhas.push(`<div class="suave">o que ajuda a ganhar: ${h(c.oportunidades.join(", ").toLowerCase())}</div>`);
  } else if (!d.produto_id && !m.demo) linhas.push('<span class="suave">fora do catálogo</span>');
  if (d.concorrente_menor_preco) linhas.push(`<div class="suave">concorrente mais barato ${brl(d.concorrente_menor_preco)}</div>`);
  linhas.push(d.preco_minimo ? `<div class="suave">mínimo pela margem ${brl(d.preco_minimo)}</div>`
    : '<div class="suave" title="Cadastre o custo do produto no rascunho ou em Produtos e custos">mínimo pela margem: falta o custo</div>');
  if (c?.preco_para_ganhar && d.preco_minimo && c.preco_para_ganhar < d.preco_minimo) linhas.push('<div class="ruim">ganhar o catálogo dá prejuízo</div>');
  return linhas.join("");
}

async function historicoMonitor(id) {
  const r = await api("/api/monitor/" + id);
  const linhas = r.leituras.slice().reverse();
  const valor = (v) => (typeof v === "number" ? (v > 20 ? brl(v) : String(v)) : v === true ? "sim" : v === false ? "não" : h(STATUS_ML[v]?.[1] || v));
  modal(`<h2>${ic("relogio", "p")}Histórico: ${h(r.apelido || r.item_id)}</h2>
    <div style="margin:8px 0 14px">${minigrafico(r.leituras.map((x) => x.preco), 560, 70)}</div>
    <h3>Linha do tempo das mudanças</h3>
    ${r.mudancas?.length ? `<div class="pilha" style="gap:4px;margin-bottom:14px">${r.mudancas.slice(0, 30).map((x) => `<div class="pequeno">
      <span class="suave">${data(x.quando)}</span> · <b>${h(x.campo)}</b>: ${valor(x.de)} → ${valor(x.para)}${x.demo ? ' <span class="selo demo">demo</span>' : ""}</div>`).join("")}</div>`
      : '<p class="pequeno suave">Nenhuma mudança entre as leituras ainda.</p>'}
    <h3>Leituras</h3>
    ${linhas.length ? `<div class="tabela embutida"><table><thead><tr><th>Leitura</th><th class="num">Preço</th><th>Situação</th>
      ${r.proprio ? '<th class="num">Visitas 30 dias</th><th class="num">Vendas 30 dias</th><th class="num">Conversão</th>' : ""}<th>Mercado</th></tr></thead><tbody>
      ${linhas.map((x) => `<tr><td class="pequeno">${data(x.lida_em)}${x.demo ? ' <span class="selo demo">demo</span>' : ""}</td><td class="num">${brl(x.preco)}</td>
        <td>${seloDe(STATUS_ML, x.status)}</td>
        ${r.proprio ? `<td class="num">${x.visitas_30d ?? "—"}</td><td class="num">${x.vendas_30d ?? "—"}</td>
          <td class="num">${x.dados.conversao_pct != null ? String(x.dados.conversao_pct).replace(".", ",") + "%" : "—"}</td>` : ""}
        <td class="pequeno">${x.dados.mercado_mediana ? `mediana ${brl(x.dados.mercado_mediana)} · ${x.dados.mercado_vendedores} vendedor(es)` : "—"}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="suave">Ainda sem leituras.</p>`}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`).classList.add("largo");
}

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

const RISCO = { alto: ["erro", "risco alto"], medio: ["demo", "risco médio"], baixo: ["ok", "risco baixo"] };
const estadoMeus = { dados: null, situacao: {}, situacaoLida: false, visitas: {}, marcados: new Set() };

async function telaMeusAnuncios() {
  const e = estadoMeus;
  e.marcados = new Set();
  e.dados = await api("/api/meus-anuncios");
  e.situacao = {};
  e.situacaoLida = false;
  e.visitas = {};
  const d = e.dados;
  const podeEditar = eEquipe() && estado.usuario.papel !== "consultor";
  const comProblema = estado.pendencias?.rascunhos || 0;
  $("#tela").innerHTML = `<div class="topo"><div><h1>Meus Anúncios</h1>
    <div class="suave">Os anúncios no ar de <b>${h(clienteAtual()?.nome)}</b> no Mercado Livre, na Shopee e na Amazon: situação de agora, preço, estoque,
      visitas, vendas e margem dos últimos ${d.dias} dias, risco e etiquetas.${podeEditar ? " Pausar, reativar, preço e estoque mudam direto no marketplace, sempre com confirmação." : ""}</div></div>
    <div class="linha"><span class="pequeno suave" id="ma-lido"></span>
      <button class="sec pequeno" id="ma-visitas" title="Ler de novo a situação e as visitas">${ic("trocar", "p")}Atualizar agora</button>
      <button class="sec" id="ma-csv">${ic("baixar", "p")}CSV</button></div></div>
    ${comProblema && eEquipe() ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>${comProblema} rascunho(s) com problema na publicação.</b>
      <a href="#/rascunhos/problema">Ver o motivo e corrigir em Rascunhos</a>.</div>` : ""}
    ${!d.vendas_sincronizadas ? `<div class="aviso azul">${ic("alerta", "p")} Vendas e margem aparecem depois de sincronizar os pedidos${vendasLiberadas() ? ` em <a href="#/lucro">Vendas e taxas</a>` : " (módulo Vendas e Lucro, liberado por cliente)"}.</div>` : ""}
    <div id="ma-avisos"></div>
    <div class="grade g4" id="ma-kpis"></div>
    <form class="cartao filtros-meus" style="margin-top:16px">
      <div class="grade g4">
        <div><label for="ma-busca">Busca</label><input id="ma-busca" type="search" placeholder="Título, SKU ou código"></div>
        <div><label for="ma-plat">Plataforma</label><select id="ma-plat"><option value="">Todas</option>
          ${Object.entries(PLAT).map(([k, p]) => `<option value="${k}">${p.nome}</option>`).join("")}</select></div>
        <div><label for="ma-sit">Situação</label><select id="ma-sit"><option value="">Todas</option>
          ${Object.entries(SITUACAO_PUB).map(([k, [, n]]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
        <div><label for="ma-etq">Etiqueta</label><select id="ma-etq"><option value="">Todas</option>
          ${d.etiquetas.map((t) => `<option value="${h(t)}">${h(t)}</option>`).join("")}</select></div>
        <div><label for="ma-risco">Risco</label><select id="ma-risco"><option value="">Qualquer</option>
          <option value="alto">Alto</option><option value="medio">Médio</option><option value="baixo">Baixo</option></select></div>
        <div><label for="ma-margem">Margem</label><select id="ma-margem"><option value="">Qualquer</option>
          <option value="prejuizo">Com prejuízo</option><option value="baixa">Abaixo de 10%</option><option value="sem">Sem venda no período</option></select></div>
        <div><label for="ma-ordem">Ordenar por</label><select id="ma-ordem"><option value="vendas">Mais vendidos</option>
          <option value="margem">Menor margem</option><option value="recente">Publicados há menos tempo</option></select></div>
      </div></form>
    <div class="barra-lote cartao" id="ma-lote" hidden>
      <b id="ma-qtd"></b>
      ${podeEditar ? `<button type="button" class="sec pequeno" id="ma-etiquetar">${ic("lapis", "p")}Etiquetas</button>
        <button type="button" class="sec pequeno" id="ma-pausar">${ic("pausa", "p")}Pausar</button>
        <button type="button" class="sec pequeno" id="ma-ativar">${ic("play", "p")}Ativar</button>
        <button type="button" class="sec pequeno" id="ma-preco-lote">${ic("cifrao", "p")}Preço</button>
        <button type="button" class="sec pequeno" id="ma-estoque-lote">${ic("caixa", "p")}Estoque</button>` : ""}
      <button type="button" class="link-sutil pequeno" id="ma-limpar">limpar seleção</button></div>
    <div class="cartao" id="ma-lista" style="margin-top:16px"></div>`;
  $$(".filtros-meus input, .filtros-meus select").forEach((el) => el.addEventListener(el.type === "search" ? "input" : "change", desenharMeus));
  $("#ma-visitas").onclick = () => comBotao($("#ma-visitas"), () => lerAoVivoMeus(true));
  $("#ma-csv").onclick = () => baixarCsv("meus-anuncios.csv", ["Título", "Plataforma", "Código", "SKU", "Situação", "Preço", "Estoque", "Visitas 30 dias",
    `Vendas ${d.dias} dias`, "Conversão %", "Margem %", "Risco", "Etiquetas", "Link"],
  filtrarMeus().map((x) => { const s = e.situacao[x.publicacao_id] || {}; const v = e.visitas[x.id_externo];
    return [x.titulo, PLAT[x.plataforma]?.nome, x.id_externo, x.sku, (SITUACAO_PUB[s.status] || [])[1] || "", s.preco ?? x.preco, s.estoque ?? x.estoque,
      v ?? "", x.vendas_30d ?? "", v && x.vendas_30d != null ? Math.round((x.vendas_30d / v) * 10000) / 100 : "",
      x.margem_30d ?? "", RISCO[x.risco]?.[1], x.etiquetas.join(", "), x.link]; }));
  $("#ma-limpar").onclick = () => { e.marcados.clear(); desenharMeus(); };
  if ($("#ma-etiquetar")) {
    $("#ma-etiquetar").onclick = () => etiquetarMeus();
    $("#ma-pausar").onclick = () => acaoEmLoteMeus("pausar");
    $("#ma-ativar").onclick = () => acaoEmLoteMeus("ativar");
    $("#ma-preco-lote").onclick = () => precoEstoqueEmLote("preco");
    $("#ma-estoque-lote").onclick = () => precoEstoqueEmLote("estoque");
  }
  desenharMeus();
  await lerAoVivoMeus(false);
}

async function lerAoVivoMeus(avisar) {
  const e = estadoMeus;
  const temMl = e.dados.itens.some((x) => x.plataforma === "mercadolivre" && !x.demo);
  const [situacao, visitas] = await Promise.all([api("/api/publicacoes/situacao").catch(() => ({})),
    temMl ? api("/api/meus-anuncios/visitas", { method: "POST" }).catch(() => ({})) : {}]);
  if (estado._rotaAtual !== "anuncios") return;
  e.situacao = situacao;
  e.visitas = visitas;
  e.situacaoLida = true;
  if (avisar && temMl && !Object.keys(visitas).length) toast("Sem visitas para mostrar: confira a conta do Mercado Livre deste cliente em Contas.", true);
  $("#ma-lido").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const outras = Object.values(situacao).filter((s) => s.outra_conta).length;
  $("#ma-avisos").innerHTML = outras ? `<div class="aviso amarelo">${ic("alerta", "p")} <b>${outras} anúncio(s) foram publicados por outra conta</b>,
    não pela que está conectada agora, então não dá para ver se ainda existem. Para mexer neles pelo Replique, reconecte em <a href="#/contas">Contas</a>
    a conta que publicou; se já foram apagados no marketplace, use "Tirar da lista".</div>` : "";
  desenharMeus();
}

function filtrarMeus() {
  const e = estadoMeus;
  const v = (id) => $(id)?.value || "";
  const busca = v("#ma-busca").trim().toLowerCase();
  const lista = e.dados.itens.filter((x) => {
    const s = e.situacao[x.publicacao_id] || {};
    if (busca && !`${x.titulo} ${x.sku} ${x.id_externo}`.toLowerCase().includes(busca)) return false;
    if (v("#ma-plat") && x.plataforma !== v("#ma-plat")) return false;
    if (v("#ma-sit") && s.status !== v("#ma-sit")) return false;
    if (v("#ma-etq") && !x.etiquetas.includes(v("#ma-etq"))) return false;
    if (v("#ma-risco") && x.risco !== v("#ma-risco")) return false;
    if (v("#ma-margem") === "prejuizo" && !(x.margem_30d < 0)) return false;
    if (v("#ma-margem") === "baixa" && !(x.margem_30d < 10)) return false;
    if (v("#ma-margem") === "sem" && x.vendas_30d) return false;
    return true;
  });
  const ordem = {
    vendas: (a, b) => (b.vendas_30d ?? -1) - (a.vendas_30d ?? -1),
    margem: (a, b) => (a.margem_30d ?? Infinity) - (b.margem_30d ?? Infinity),
    recente: (a, b) => new Date(b.publicado_em) - new Date(a.publicado_em),
  }[v("#ma-ordem") || "vendas"];
  return lista.sort(ordem);
}

function desenharMeus() {
  const e = estadoMeus;
  if (!$("#ma-lista")) return;
  const lista = filtrarMeus();
  const ativos = e.dados.itens.filter((x) => e.situacao[x.publicacao_id]?.status === "active").length;
  const vendas = lista.reduce((t, x) => t + (x.vendas_30d || 0), 0);
  const kpi = (r, v, d = "") => `<div class="cartao kpi-bloco"><span class="rotulo">${r}</span><div class="valor">${v}</div>${d ? `<div class="pequeno suave">${d}</div>` : ""}</div>`;
  $("#ma-kpis").innerHTML = kpi("Anúncios", numero(e.dados.itens.length), `${lista.length} com os filtros`)
    + kpi("Ativos agora", e.situacaoLida ? numero(ativos) : "…", "situação lida nos marketplaces")
    + kpi(`Vendas em ${e.dados.dias} dias`, numero(vendas), "unidades, nos anúncios filtrados");
  const podeMarcar = eEquipe() && estado.usuario.papel !== "consultor";
  $("#ma-lote").hidden = !e.marcados.size;
  $("#ma-qtd").textContent = `${e.marcados.size} selecionado(s)`;
  $("#ma-lista").innerHTML = lista.length ? `<div class="tabela embutida"><table><thead><tr>
      ${podeMarcar ? `<th><input type="checkbox" id="ma-todos" aria-label="Selecionar todos" ${lista.every((x) => e.marcados.has(x.publicacao_id)) ? "checked" : ""}></th>` : ""}
      <th style="min-width:260px">Anúncio</th><th>Situação</th><th class="num">Preço</th><th class="num">Estoque</th><th class="num">Visitas</th>
      <th class="num">Vendas</th><th class="num">Conversão</th><th class="num">Margem</th><th>Risco</th><th></th></tr></thead><tbody>
    ${lista.map((x) => {
      const s = e.situacao[x.publicacao_id] || {};
      const vis = e.visitas[x.id_externo];
      const conv = vis && x.vendas_30d != null ? `${String(Math.round((x.vendas_30d / vis) * 10000) / 100).replace(".", ",")}%` : "—";
      return `<tr>${podeMarcar ? `<td><input type="checkbox" data-ma-marcar="${x.publicacao_id}" ${e.marcados.has(x.publicacao_id) ? "checked" : ""} aria-label="Selecionar"></td>` : ""}
        <td><div class="linha" style="gap:10px;flex-wrap:nowrap">
          ${x.foto && urlSegura(x.foto) ? `<img src="${h(x.foto)}" alt="" width="40" height="40" loading="lazy" style="border-radius:6px;border:1px solid var(--borda);object-fit:contain;background:#fff;flex-shrink:0">` : ""}
          <div><b>${h(x.titulo)}</b>${x.demo ? ' <span class="selo demo">simulado</span>' : ""}
            <div class="pequeno suave">${selo(x.plataforma)} ${h(x.id_externo || "")}${x.sku ? ` · SKU ${h(x.sku)}` : ""}</div>
            ${x.etiquetas.length ? `<div class="chips" style="margin-top:4px">${x.etiquetas.map((t) => `<span class="selo neutro">${h(t)}</span>`).join(" ")}</div>` : ""}</div></div></td>
        <td>${s.status ? seloDe(SITUACAO_PUB, s.status) : s.aviso ? `<span class="pequeno suave" title="${h(s.aviso)}">sem leitura</span>` : '<span class="pequeno suave">…</span>'}</td>
        <td class="num">${brl(s.preco ?? x.preco)}</td><td class="num">${s.estoque ?? x.estoque ?? "—"}</td>
        <td class="num">${x.plataforma === "mercadolivre" ? (vis ?? "—") : '<span class="pequeno suave" title="A API dessa plataforma não entrega visitas por anúncio aqui">—</span>'}</td>
        <td class="num">${x.vendas_30d ?? "—"}</td>
        <td class="num">${conv}</td>
        <td class="num ${x.margem_30d < 0 ? "ruim" : ""}">${x.margem_30d != null ? `${String(x.margem_30d).replace(".", ",")}%` : "—"}
          ${x.margem_incompleta ? '<div class="pequeno suave" title="Há venda sem custo ou sem produto vinculado">parcial</div>' : ""}</td>
        <td><span class="selo ${RISCO[x.risco][0]}" title="${h(x.motivos_risco.join("\n"))}">${RISCO[x.risco][1]}</span></td>
        <td style="text-align:right"><div class="acoes-linha" style="justify-content:flex-end">
          ${podeMarcar && (s.acoes || []).includes("pausar") ? `<button type="button" class="sec pequeno" data-ma-acao="pausar" data-pub="${x.publicacao_id}" title="Pausar no marketplace">${ic("pausa", "p")}Pausar</button>` : ""}
          ${podeMarcar && (s.acoes || []).includes("reativar") ? `<button type="button" class="sec pequeno" data-ma-acao="reativar" data-pub="${x.publicacao_id}" title="Reativar no marketplace">${ic("play", "p")}Reativar</button>` : ""}
          ${podeMarcar && s.edita_preco ? `<button type="button" class="sec pequeno" data-ma-preco="${x.publicacao_id}" title="Mudar preço e estoque direto no marketplace">Preço e estoque</button>` : ""}
          ${podeMarcar && (s.outra_conta || ["closed", "deleted"].includes(s.status)) ? `<button type="button" class="sec pequeno" data-ma-tirar="${x.publicacao_id}" title="Some da lista. Não mexe no marketplace.">Tirar da lista</button>` : ""}
          ${s.outra_conta ? `<span class="selo demo" title="${h(s.aviso || "")}">outra conta</span>` : ""}
          ${eTime() ? `<button type="button" class="sec pequeno icone-so" data-ma-modelo="${x.anuncio_id}" title="Aprovar como modelo: a IA usa este título e descrição como referência" aria-label="Aprovar como modelo">${ic("estrela", "p")}</button>` : ""}
          ${eEquipe() ? `<a class="botao sec pequeno icone-so" href="#/editor/${x.anuncio_id}" title="Abrir o rascunho" aria-label="Abrir o rascunho">${ic("lapis", "p")}</a>` : ""}
          ${urlSegura(s.link || x.link) ? `<a class="botao sec pequeno icone-so" href="${h(s.link || x.link)}" target="_blank" rel="noopener" title="Abrir no marketplace" aria-label="Abrir no marketplace">${ic("externo", "p")}</a>` : ""}</div></td></tr>`;
    }).join("")}</tbody></table></div>`
    : vazio("publicar", e.dados.itens.length ? "Nada com esses filtros" : "Nenhum anúncio publicado ainda",
      e.dados.itens.length ? "" : `Publique pelos <a href="#/rascunhos">Rascunhos</a>: marque os prontos e clique em Publicar selecionados.`);
  $$("[data-ma-marcar]").forEach((c) => (c.onchange = () => {
    const id = +c.dataset.maMarcar;
    c.checked ? e.marcados.add(id) : e.marcados.delete(id);
    desenharMeus();
  }));
  $$("[data-ma-acao]").forEach((b) => (b.onclick = () => {
    const acao = b.dataset.maAcao;
    if (CONFIRMA_ACAO[acao] && !confirm(CONFIRMA_ACAO[acao])) return;
    if (acao === "reativar" && !confirm("Reativar o anúncio? Ele volta a aparecer para os compradores na hora.")) return;
    comBotao(b, async () => {
      const r = await api(`/api/publicacoes/${b.dataset.pub}/acao`, { method: "POST", body: { acao } });
      toast(`${r.simulado ? "Demonstração: nada foi enviado. " : ""}Anúncio ${SITUACAO_PUB[r.status]?.[1] || r.status}.`);
      await lerAoVivoMeus(false);
    });
  }));
  $$("[data-ma-modelo]").forEach((b) => (b.onclick = () => aprovarComoModelo(+b.dataset.maModelo, b)));
  $$("[data-ma-preco]").forEach((b) => (b.onclick = () => {
    const x = e.dados.itens.find((i) => i.publicacao_id === +b.dataset.maPreco);
    precoEstoque(x, e.situacao[x.publicacao_id] || {}, () => lerAoVivoMeus(false));
  }));
  $$("[data-ma-tirar]").forEach((b) => (b.onclick = () => {
    if (!confirm("Tirar este anúncio da lista? Nada é alterado no marketplace, e o rascunho volta para Em preparo se não tiver outro anúncio no ar.")) return;
    comBotao(b, async () => { await api(`/api/publicacoes/${b.dataset.maTirar}/tirar-da-lista`, { method: "POST" }); toast("Tirado da lista."); telaMeusAnuncios(); });
  }));
  if ($("#ma-todos")) $("#ma-todos").onchange = () => {
    lista.forEach((x) => ($("#ma-todos").checked ? e.marcados.add(x.publicacao_id) : e.marcados.delete(x.publicacao_id)));
    desenharMeus();
  };
}

function precoEstoque(x, s, depois) {
  const m = modal(`<h2>Preço e estoque</h2>
    <p>${selo(x.plataforma)} ${h(x.titulo || x.id_externo)}</p>
    ${s.variacoes ? `<div class="aviso amarelo pequeno">Este anúncio tem variações. Preço e estoque de variações são alterados no próprio marketplace.</div>` : ""}
    <div class="grade g2">
      <div class="campo"><label for="pe-preco">Preço (R$)</label><input id="pe-preco" type="number" min="0.01" step="0.01" value="${s.preco ?? x.preco ?? ""}"></div>
      <div class="campo"><label for="pe-estoque">Estoque</label><input id="pe-estoque" type="number" min="0" step="1" value="${s.estoque ?? ""}"></div>
    </div>
    <p class="pequeno suave">A mudança vale na hora para os compradores${x.demo || s.simulado ? " (este anúncio é de demonstração: nada é enviado)" : ""}.</p>
    <label class="confirmacao"><input type="checkbox" id="pe-conferi"> Conferi o novo preço e o estoque deste anúncio</label>
    <div class="linha" style="justify-content:flex-end"><button class="sec" data-fechar>Cancelar</button><button id="pe-salvar" disabled>Salvar no marketplace</button></div>`);
  $("#pe-conferi", m).onchange = (ev) => ($("#pe-salvar", m).disabled = !ev.target.checked);
  $("#pe-salvar", m).onclick = () => comBotao($("#pe-salvar", m), async () => {
    const lido = (id) => { const v = $(id, m).value.trim(); return v === "" ? null : Number(v); };
    const corpo = { preco: lido("#pe-preco"), estoque: lido("#pe-estoque") };
    if (corpo.preco === (s.preco ?? x.preco ?? null)) corpo.preco = null;
    if (corpo.estoque === (s.estoque ?? null)) corpo.estoque = null;
    if (corpo.preco === null && corpo.estoque === null) return toast("Nada mudou.", true);
    const r = await api(`/api/publicacoes/${x.publicacao_id}/preco-estoque`, { method: "POST", body: corpo });
    fecharModal();
    toast(`${r.simulado ? "Demonstração: nada foi enviado. " : ""}Preço e estoque atualizados.`);
    depois?.();
  });
}

function etiquetarMeus() {
  const e = estadoMeus;
  const m = modal(`<h2>${ic("lapis", "p")}Etiquetas de ${e.marcados.size} anúncio(s)</h2>
    <form id="ma-form-etq" class="pilha">
      <div><label for="ma-add">Adicionar etiqueta</label><input id="ma-add" maxlength="30" list="ma-etq-lista" placeholder="Ex.: campanha natal, revisar foto">
        <datalist id="ma-etq-lista">${e.dados.etiquetas.map((t) => `<option value="${h(t)}">`).join("")}</datalist></div>
      ${e.dados.etiquetas.length ? `<div><label>Remover etiqueta</label><div class="chips">${e.dados.etiquetas.map((t) =>
        `<label class="chip"><input type="checkbox" name="remover" value="${h(t)}"> ${h(t)}</label>`).join("")}</div></div>` : ""}
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Aplicar</button></div></form>`);
  $("#ma-form-etq", m).onsubmit = (ev) => {
    ev.preventDefault();
    comBotao($("#ma-form-etq button[type=submit]", m), async () => {
      await api("/api/meus-anuncios/etiquetas", { method: "PUT", body: { publicacao_ids: [...e.marcados],
        adicionar: $("#ma-add", m).value ? [$("#ma-add", m).value] : [], remover: $$("[name=remover]:checked", m).map((c) => c.value) } });
      fecharModal();
      toast("Etiquetas aplicadas.");
      telaMeusAnuncios();
    });
  };
}

const MAX_LOTE_PRECO = 50;
const QUEDA_ALERTA_PCT = 15;

function precoEstoqueEmLote(campo) {
  const e = estadoMeus;
  const alvos = [...e.marcados].map((id) => e.dados.itens.find((x) => x.publicacao_id === id))
    .filter((x) => x && (e.situacao[x.publicacao_id] || {}).edita_preco && !(e.situacao[x.publicacao_id] || {}).variacoes);
  const fora = e.marcados.size - alvos.length;
  if (!alvos.length) return toast("Nenhum dos selecionados aceita mudar preço ou estoque por aqui (confira a situação; anúncios com variações mudam no marketplace).", true);
  if (alvos.length > MAX_LOTE_PRECO) return toast(`Mude no máximo ${MAX_LOTE_PRECO} anúncios por vez.`, true);
  const preco = campo === "preco";
  const atual = (x) => { const s = e.situacao[x.publicacao_id] || {}; return preco ? s.preco ?? x.preco : s.estoque; };
  const m = modal(`<h2>${ic(preco ? "cifrao" : "caixa", "p")}${preco ? "Preço" : "Estoque"} de ${alvos.length} anúncio(s)</h2>
    ${fora ? `<div class="aviso amarelo pequeno">${fora} selecionado(s) ficam de fora: sem situação lida, com variações ou numa plataforma que não aceita a mudança por aqui.</div>` : ""}
    <div class="grade g2">
      ${preco ? `<div><label for="pl-modo">Como mudar</label><select id="pl-modo"><option value="pct">Percentual (+ sobe, − desce)</option><option value="valor">Mesmo preço para todos</option></select></div>
        <div><label for="pl-valor">Valor</label><input id="pl-valor" type="number" step="0.01" placeholder="ex.: -5 para baixar 5%"></div>`
        : `<div><label for="pl-modo">Como mudar</label><select id="pl-modo"><option value="valor">Mesmo estoque para todos</option><option value="soma">Somar (ou tirar) unidades</option></select></div>
        <div><label for="pl-valor">Valor</label><input id="pl-valor" type="number" step="1" placeholder="ex.: 10"></div>`}
    </div>
    <div id="pl-previa" style="margin-top:12px"></div>
    <label class="confirmacao" id="pl-conf-rotulo" hidden><input type="checkbox" id="pl-conferi"> <span id="pl-conf-texto"></span></label>
    <div class="linha" style="justify-content:flex-end;margin-top:12px"><button class="sec" data-fechar>Cancelar</button><button id="pl-aplicar" disabled>Aplicar no marketplace</button></div>`);
  m.classList.add("largo");
  let novos = [];
  const calcular = () => {
    const v = parseFloat($("#pl-valor", m).value);
    const modo = $("#pl-modo", m).value;
    if (Number.isNaN(v)) { $("#pl-previa", m).innerHTML = ""; $("#pl-conf-rotulo", m).hidden = true; $("#pl-aplicar", m).disabled = true; novos = []; return; }
    novos = alvos.map((x) => {
      const de = atual(x);
      let para = preco ? (modo === "pct" ? Math.round((de || 0) * (1 + v / 100) * 100) / 100 : v) : (modo === "soma" ? (de || 0) + Math.round(v) : Math.round(v));
      if (!preco) para = Math.max(0, para);
      const queda = preco && de ? ((de - para) / de) * 100 : 0;
      return { x, de, para, queda, invalido: preco ? !(para > 0) : para < 0 };
    });
    const grandes = novos.filter((n) => n.queda >= QUEDA_ALERTA_PCT).length;
    const prejuizo = novos.filter((n) => preco && n.x.margem_30d != null && n.x.margem_30d < Math.abs(Math.min(0, (n.para - n.de) / (n.de || 1) * 100))).length;
    $("#pl-previa", m).innerHTML = `<div class="tabela embutida" style="max-height:300px;overflow:auto"><table><thead><tr><th>Anúncio</th><th class="num">Agora</th><th class="num">Fica</th></tr></thead><tbody>
      ${novos.map((n) => `<tr><td>${selo(n.x.plataforma)} ${h(n.x.titulo)}${n.x.demo ? ' <span class="selo demo">demonstração</span>' : ""}</td>
        <td class="num">${preco ? brl(n.de) : n.de ?? "—"}</td>
        <td class="num ${n.invalido || n.queda >= QUEDA_ALERTA_PCT ? "ruim" : ""}"><b>${preco ? brl(n.para) : n.para}</b>${n.queda >= QUEDA_ALERTA_PCT ? `<div class="pequeno">−${Math.round(n.queda)}%</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      ${grandes ? `<div class="aviso amarelo pequeno">${grandes} anúncio(s) caem ${QUEDA_ALERTA_PCT}% ou mais. Queda brusca de preço pode virar prejuízo e chama a atenção do marketplace.</div>` : ""}
      ${prejuizo ? `<div class="aviso vermelho pequeno">${prejuizo} anúncio(s) podem passar a dar prejuízo pela margem dos últimos 30 dias.</div>` : ""}`;
    const invalidos = novos.some((n) => n.invalido);
    $("#pl-conf-rotulo", m).hidden = invalidos;
    $("#pl-conf-texto", m).textContent = `Conferi os ${novos.length} novos ${preco ? "preços" : "estoques"} de ${clienteAtual()?.nome || "este cliente"}${grandes ? ", inclusive as quedas grandes" : ""}`;
    $("#pl-conferi", m).checked = false;
    $("#pl-aplicar", m).disabled = true;
  };
  $("#pl-valor", m).oninput = calcular;
  $("#pl-modo", m).onchange = calcular;
  $("#pl-conferi", m).onchange = (ev) => ($("#pl-aplicar", m).disabled = !ev.target.checked || !novos.length);
  $("#pl-aplicar", m).onclick = () => comBotao($("#pl-aplicar", m), async () => {
    let ok = 0;
    const falhas = [];
    for (const n of novos) {
      if (n.para === n.de) continue;
      try {
        await api(`/api/publicacoes/${n.x.publicacao_id}/preco-estoque`, { method: "POST", body: preco ? { preco: n.para, estoque: null } : { preco: null, estoque: n.para } });
        ok++;
      } catch (err) { falhas.push(`${n.x.titulo}: ${err.message}`); }
      await new Promise((r) => setTimeout(r, 800));
    }
    fecharModal();
    toast(`${ok} anúncio(s) atualizado(s).${falhas.length ? ` ${falhas.length} falha(s): ${falhas.slice(0, 2).join("; ")}` : ""}`, !!falhas.length);
    await lerAoVivoMeus(false);
  });
}

async function acaoEmLoteMeus(acao) {
  const e = estadoMeus;
  const nome = acao === "pausar" ? "pausar" : "ativar";
  const nomeApi = acao === "pausar" ? "pausar" : "reativar";
  const alvo = [...e.marcados].filter((id) => (e.situacao[id]?.acoes || []).includes(nomeApi));
  if (!alvo.length) return toast(`Nenhum dos selecionados pode ${nome} agora (confira a situação de cada um).`, true);
  if (!confirm(`${acao === "pausar" ? "Pausar" : "Ativar"} ${alvo.length} anúncio(s) nos marketplaces? Os compradores veem a mudança na hora. Um por vez, com pausa entre eles.`)) return;
  let ok = 0;
  const falhas = [];
  for (const id of alvo) {
    const item = e.dados.itens.find((x) => x.publicacao_id === id);
    try {
      await api(`/api/publicacoes/${id}/acao`, { method: "POST", body: { acao: nomeApi } });
      ok++;
    } catch (err) {
      falhas.push(`${item.titulo}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  toast(`${ok} anúncio(s) ${acao === "pausar" ? "pausado(s)" : "ativado(s)"}.${falhas.length ? ` ${falhas.length} falha(s).` : ""}`, !!falhas.length);
  telaMeusAnuncios();
}

async function telaFotos(param) {
  if (param) return telaPastaFotos(+param);
  const pastas = await api("/api/fotos-salvas");
  $("#tela").innerHTML = `<div class="topo"><div><h1>Fotos salvas</h1>
    <div class="suave">Pastas com as fotos guardadas pela extensão <b>Monvatti Pro</b>, uma por anúncio do Mercado Livre. São cópias no Replique:
      continuam aqui mesmo se o anúncio original sair do ar. Use fotos de concorrente só como referência; publique com fotos próprias.</div></div></div>
    ${pastas.length ? `<input id="fs-busca" type="search" placeholder="Buscar pelo título, código MLB ou cliente" style="max-width:420px;margin-bottom:14px">
      <div class="pastas-fotos" id="fs-lista"></div>` : `<section class="cartao"><div class="vazio">${ic("imagem")}<b>Nenhuma pasta ainda</b>
      <span>No anúncio do Mercado Livre, use o botão de download da extensão e escolha <b>Salvar fotos no Replique</b>,
        ou leve o anúncio para o Replique: as fotos dele vêm junto para cá.</span></div></section>`}`;
  if (!pastas.length) return;
  const desenhar = () => {
    const busca = $("#fs-busca").value.trim().toLowerCase();
    const filtradas = pastas.filter((p) => !busca || [p.titulo, p.item_id, p.cliente_nome].join(" ").toLowerCase().includes(busca));
    $("#fs-lista").innerHTML = filtradas.length ? filtradas.map((p) => `<a class="pasta-foto" href="#/fotos/${p.id}">
        <span class="pasta-capa">${p.fotos[0] && urlSegura(p.fotos[0]) ? `<img src="${h(p.fotos[0])}" alt="" loading="lazy">` : ic("imagem")}</span>
        <span class="pasta-info"><b title="${h(p.titulo)}">${h(p.titulo)}</b>
          <span class="pequeno suave">${p.quantidade} foto(s)${p.cliente_nome ? ` · ${h(p.cliente_nome)}` : ""}</span>
          <span class="pequeno suave">${h(p.salvo_por || "—")} · ${quando(p.atualizado_em).toLocaleDateString("pt-BR")}</span></span></a>`).join("")
      : '<p class="suave">Nenhuma pasta com esse termo.</p>';
  };
  $("#fs-busca").oninput = desenhar;
  desenhar();
}

async function telaPastaFotos(id) {
  const p = await api(`/api/fotos-salvas/${id}`);
  const podeExcluir = ["admin", "operador"].includes(estado.usuario.papel);
  $("#tela").innerHTML = `<div class="topo"><div><a href="#/fotos" class="pequeno">${ic("voltar", "p")}Fotos salvas</a>
      <h1 style="margin-top:6px">${h(p.titulo)}</h1>
      <div class="suave">${p.quantidade} foto(s)${p.item_id ? ` · ${h(p.item_id)}` : ""}${p.cliente_nome ? ` · ${h(p.cliente_nome)}` : ""}
        · salvas por ${h(p.salvo_por || "—")} em ${quando(p.atualizado_em).toLocaleString("pt-BR")}</div></div>
    <div class="linha">
      ${p.link && urlSegura(p.link) ? `<a class="botao sec" href="${h(p.link)}" target="_blank" rel="noopener noreferrer">${ic("externo", "p")}Anúncio original</a>` : ""}
      <button class="sec" id="fs-zip">${ic("abaixo", "p")}Baixar todas (.zip)</button>
      ${podeExcluir ? `<button class="sec perigo-txt" id="fs-excluir">${ic("lixo", "p")}Excluir pasta</button>` : ""}
    </div></div>
    <section class="cartao"><div class="galeria-fotos">${p.fotos.map((f, n) => urlSegura(f) ? `<figure>
      <a href="${h(f)}" target="_blank" rel="noopener"><img src="${h(f)}" alt="Foto ${n + 1}" loading="lazy"></a>
      <figcaption><span>Foto ${n + 1}</span><a href="${h(f)}" download="foto-${String(n + 1).padStart(2, "0")}">${ic("abaixo", "p")}Baixar</a></figcaption>
    </figure>` : "").join("")}</div></section>`;
  $("#fs-zip").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await baixarArquivo(`/api/fotos-salvas/${id}/fotos.zip`, "fotos.zip"); } catch (err) { toast(err.message, true); }
    e.currentTarget.disabled = false;
  };
  const excluir = $("#fs-excluir");
  if (excluir) excluir.onclick = async () => {
    if (!confirm(`Excluir a pasta “${p.titulo}” e as ${p.quantidade} foto(s) dela? Os rascunhos não mudam.`)) return;
    try {
      await api(`/api/fotos-salvas/${id}`, { method: "DELETE" });
      toast("Pasta excluída.");
      location.hash = "#/fotos";
    } catch (err) { toast(err.message, true); }
  };
}

const ACAO_PROMO = { aprovar: ["ok", "Aprovar"], recusar: ["erro", "Recusar"], sem_custo: ["demo", "Conferir custo"], no_ml: ["neutro", "Fazer no ML"] };
const seloAcao = (a) => `<span class="selo ${ACAO_PROMO[a]?.[0] || "neutro"}">${ACAO_PROMO[a]?.[1] || h(a)}</span>`;
const diaHora = (v) => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

async function telaPromocoes(param) {
  if (param === "cliente") return telaPromocoesCliente();
  $("#tela").innerHTML = `<div class="topo"><div><h1>Central de promoções</h1>
    <div class="suave">Anúncios sem promoção, promoções que acabaram ou vão acabar e convites do Mercado Livre de toda a carteira.
      O Replique lê cada conta de tempos em tempos e avisa no sino o responsável, a equipe do cliente e os administradores.</div></div>
    <div class="linha"><button class="sec" id="pr-whats">${ic("balao", "p")}Mensagem para o WhatsApp</button></div></div>
  <div id="pr-corpo"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  $("#pr-whats").onclick = () => comBotao($("#pr-whats"), mensagemWhatsPromocoes);
  const d = await api("/api/promocoes/geral");
  if (estado._rotaAtual !== "promocoes") return;
  const soma = (k) => d.clientes.reduce((t, c) => t + (c.resumo[k] || 0), 0);
  $("#pr-corpo").innerHTML = `
    <div class="grade g4 kpis" style="margin-bottom:16px">
      <div class="cartao kpi"><div class="rotulo">Anúncios sem promoção</div><div class="valor">${numero(soma("sem_promocao"))}</div></div>
      <div class="cartao kpi ${soma("acabaram_hoje") ? "alerta" : ""}"><div class="rotulo">Promoção acabou hoje</div><div class="valor">${numero(soma("acabaram_hoje"))}</div></div>
      <div class="cartao kpi"><div class="rotulo">Vencem em breve</div><div class="valor">${numero(soma("vencem"))}</div></div>
      <div class="cartao kpi"><div class="rotulo">Convites do ML</div><div class="valor">${numero(soma("convites"))}</div>
        <div class="pequeno suave">${numero(soma("convites_aprovar"))} com margem boa</div></div></div>
    <div class="cartao">${d.clientes.length ? `<div class="tabela"><table><thead><tr><th>Cliente</th><th>Responsável</th><th class="num">Sem promoção</th>
      <th class="num">Acabou hoje</th><th class="num">Vencem</th><th class="num">Convites</th><th>Última leitura</th><th></th></tr></thead><tbody>
      ${d.clientes.map((c) => `<tr><td><b>${h(c.nome)}</b>${c.ativo ? "" : '<div class="pequeno suave">avisos desligados</div>'}</td>
        <td class="pequeno">${c.responsavel ? h(c.responsavel) : '<span class="suave">sem responsável</span>'}</td>
        <td class="num">${c.lida_em ? numero(c.resumo.sem_promocao) : "—"}</td>
        <td class="num ${c.resumo.acabaram_hoje ? "ruim" : ""}">${c.lida_em ? numero(c.resumo.acabaram_hoje) : "—"}</td>
        <td class="num">${c.lida_em ? numero(c.resumo.vencem) : "—"}</td>
        <td class="num">${c.lida_em ? `${numero(c.resumo.convites)}${c.resumo.convites_recusar ? `<div class="pequeno suave">${c.resumo.convites_recusar} margem ruim</div>` : ""}` : "—"}</td>
        <td class="pequeno ${c.erro ? "erro-texto" : "suave"}">${c.erro ? h(c.erro.slice(0, 120)) : c.lida_em ? tempoRelativo(c.lida_em) : "ainda não lido"}</td>
        <td style="text-align:right"><button type="button" class="sec pequeno" data-abrir-promo="${c.id}">${ic("direita", "p")}Abrir</button></td></tr>`).join("")}
      </tbody></table></div>` : vazio("etiqueta", "Nenhum cliente na carteira")}</div>
    <p class="pequeno suave">A leitura usa a API oficial de promoções do Mercado Livre na conta conectada de cada cliente. Clientes sem conta conectada aparecem sem leitura.</p>`;
  $$("[data-abrir-promo]").forEach((b) => (b.onclick = () => {
    trocarCliente(+b.dataset.abrirPromo, { navegar: false });
    location.hash = "#/promocoes/cliente";
  }));
}

async function mensagemWhatsPromocoes() {
  const { texto } = await api("/api/promocoes/mensagem");
  const m = modal(`<h2>${ic("balao", "p")}Mensagem para o grupo</h2>
    <p class="pequeno suave" style="margin-top:-6px">Resumo do dia com o responsável de cada cliente. Copie e cole no grupo da equipe, ou abra o WhatsApp e escolha o grupo.</p>
    ${texto ? `<textarea id="pw-texto" rows="10" style="width:100%">${h(texto)}</textarea>` : vazio("checar", "Nada pendente hoje", "Nenhum cliente com promoção acabando, vencendo ou convite esperando.")}
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Fechar</button>
      ${texto ? `<button class="sec" id="pw-copiar">${ic("copiar", "p")}Copiar</button><button id="pw-abrir">${ic("externo", "p")}Abrir no WhatsApp</button>` : ""}</div>`);
  if (!texto) return;
  $("#pw-copiar", m).onclick = async () => {
    const campo = $("#pw-texto", m);
    try { await navigator.clipboard.writeText(campo.value); } catch { campo.select(); document.execCommand("copy"); }
    toast("Mensagem copiada.");
  };
  $("#pw-abrir", m).onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent($("#pw-texto", m).value)}`, "_blank", "noopener");
}

async function telaPromocoesCliente() {
  const cliente = clienteAtual();
  if (!cliente) {
    $("#tela").innerHTML = `<div class="topo"><div><h1>Central de promoções</h1></div></div>${vazio("loja", "Escolha um cliente", `Abra um cliente pela <a href="#/promocoes">lista da carteira</a> ou pelo seletor do topo.`)}`;
    return;
  }
  $("#tela").innerHTML = `<div class="topo"><div><a href="#/promocoes" class="pequeno">${ic("voltar", "p")} Toda a carteira</a>
    <h1>Promoções de ${h(cliente.nome)}</h1>
    <div class="suave">Sugestões pela margem mínima do cliente. Nada muda o preço do anúncio: só entra o preço promocional, e o Replique confere de novo
      o preço e a margem antes de enviar cada um.</div></div>
    <div class="linha">${eEquipe() ? `<button class="sec" id="pc-regras">${ic("ajustes", "p")}Regras do cliente</button>` : ""}
      <span class="pequeno suave" id="pc-lida"></span><button class="sec pequeno" id="pc-ler">${ic("trocar", "p")}Ler agora</button></div></div>
  <div id="pc-corpo"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  let d = await api("/api/promocoes");
  if (estado._rotaAtual !== "promocoes") return;
  $("#pc-ler").onclick = () => comBotao($("#pc-ler"), async () => {
    $("#pc-corpo").innerHTML = `<div class="carregando"><span class="girando"></span> Lendo anúncios, campanhas e convites no Mercado Livre. Em contas grandes leva alguns minutos…</div>`;
    try { d = await api("/api/promocoes/ler", { method: "POST" }); }
    catch (e) { $("#pc-corpo").innerHTML = `<div class="aviso vermelho">${h(e.message)}</div>`; return; }
    desenharPromocoes(d);
  });
  if ($("#pc-regras")) $("#pc-regras").onclick = () => regrasPromocoes(d, () => telaPromocoesCliente());
  desenharPromocoes(d);
  if (velho(d.dados?.lida_em || d.lida_em, 2) && podeAutoAtualizar("promocoes", 30)) $("#pc-ler").click();
}

function desenharPromocoes(d) {
  const corpo = $("#pc-corpo");
  if (!corpo) return;
  $("#pc-lida").textContent = d.dados?.lida_em ? `Lido ${tempoRelativo(d.dados.lida_em)}` : "";
  const erro = d.erro ? `<div class="aviso vermelho pequeno">Última tentativa automática falhou: ${h(d.erro.slice(0, 300))}</div>` : "";
  if (!d.dados) {
    corpo.innerHTML = erro + vazio("etiqueta", "Conta ainda não lida", "Clique em Ler agora para buscar os anúncios, as campanhas e os convites deste cliente.");
    return;
  }
  const x = d.dados, r = x.resumo, cfg = d.config;
  const aba = estado.abaPromo || "convites";
  const acabaram = new Set((x.acabaram || []).map((a) => a.item_id));
  const sem = x.itens.filter((i) => !i.promocoes.length);
  const com = x.itens.filter((i) => i.promocoes.length);
  const abas = [["convites", `Convites do ML (${r.convites})`], ["sem", `Sem promoção (${r.sem_promocao})`], ["com", `Em promoção (${r.em_promocao})`],
    ["acabaram", `Acabou hoje (${r.acabaram_hoje})`]];
  const anuncio = (i) => `<div class="linha" style="gap:10px;flex-wrap:nowrap">
    ${urlSegura(i.foto) ? `<img src="${h(i.foto)}" alt="" width="40" height="40" class="mini-foto" referrerpolicy="no-referrer">` : ""}
    <div style="min-width:0"><b class="corta">${urlSegura(i.link) ? `<a href="${h(i.link)}" target="_blank" rel="noopener">${h(i.titulo)}</a>` : h(i.titulo)}</b>
    <div class="pequeno suave">${h(i.item_id)}${i.sku ? ` · SKU ${h(i.sku)}` : ""}${acabaram.has(i.item_id) ? ' · <span class="ruim">promoção acabou hoje</span>' : ""}</div></div></div>`;
  const taxas = (t) => (t ? `<div class="pequeno suave" title="${t.fonte === "mercado_livre" ? "Comissão e taxa fixa do Mercado Livre para a categoria e o preço" : "Sem resposta do ML: comissão padrão"}${t.frete_fonte === "mercado_livre" ? "; frete grátis calculado pelo ML com o peso do anúncio" : "; frete estimado"}">comissão ${brl(t.comissao + t.taxa_fixa)} · frete ${brl(t.frete)}</div>` : "");
  const margem = (s) => (s.margem != null ? `<span class="${s.margem < cfg.margem_minima_pct ? "negativo" : ""}">${pct(s.margem)}</span><div class="pequeno suave">${brl(s.lucro)} por venda</div>${taxas(s.taxas)}`
    : '<span class="pequeno suave">sem custo</span>');
  const marcavel = (s) => !s.aplicado_em && (s.acao === "aprovar" || s.acao === "sem_custo");
  const caixa = (s, chave) => (eEquipe() && marcavel(s) ? `<input type="checkbox" data-promo="${h(chave)}" ${s.acao === "aprovar" ? "checked" : ""} aria-label="Selecionar">` : "");
  let tabela = "";
  if (aba === "convites") {
    tabela = x.convites.length ? `<div class="tabela"><table><thead><tr><th></th><th>Anúncio</th><th>Promoção</th><th class="num">Preço</th><th class="num">Margem</th><th>Sugestão</th></tr></thead><tbody>
      ${x.convites.map((c) => `<tr><td>${caixa(c, `${c.item_id}|${c.promocao_id}`)}</td><td>${anuncio(c)}</td>
        <td><b>${h(c.nome)}</b><div class="pequeno suave">${h(c.tipo_nome)}${c.prazo ? ` · aceitar até ${diaHora(c.prazo)}` : ""}${c.fim ? ` · termina ${diaHora(c.fim)}` : ""}</div>
          ${c.meli_pct ? `<div class="pequeno">o ML paga ${pct(c.meli_pct)} do desconto</div>` : ""}</td>
        <td class="num">${c.preco_sugerido ? `<b>${brl(c.preco_sugerido)}</b><div class="pequeno suave">de ${brl(c.preco_cheio)} (−${pct(c.desconto_pct)})</div>` : "—"}</td>
        <td class="num">${margem(c)}</td>
        <td>${c.aplicado_em ? '<span class="selo ok">enviado</span>' : seloAcao(c.acao)}<div class="pequeno suave">${h(c.motivo)}</div>
          ${c.ja_em_promocao ? '<div class="pequeno suave">já está em outra promoção</div>' : ""}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("checar", "Nenhum convite esperando", "Quando o Mercado Livre convidar anúncios desta conta para uma campanha, eles aparecem aqui.");
  } else if (aba === "sem") {
    tabela = sem.length ? `<div class="tabela"><table><thead><tr><th></th><th>Anúncio</th><th class="num">Estoque</th><th class="num">Campanha própria</th><th class="num">Margem</th><th>Sugestão</th></tr></thead><tbody>
      ${sem.map((i) => { const s = { ...i.proprio, aplicado_em: i.aplicado_em }; return `<tr><td>${caixa(s, `${i.item_id}|`)}</td><td>${anuncio(i)}</td><td class="num">${numero(i.estoque)}</td>
        <td class="num">${s.preco_sugerido ? `<b>${brl(s.preco_sugerido)}</b><div class="pequeno suave">de ${brl(i.preco_cheio)} (−${pct(s.desconto_pct)})</div>` : "—"}</td>
        <td class="num">${margem(s)}</td><td>${s.aplicado_em ? '<span class="selo ok">enviado</span>' : seloAcao(s.acao)}<div class="pequeno suave">${h(s.motivo)}</div></td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("checar", "Todos os anúncios ativos estão em promoção");
  } else if (aba === "com") {
    tabela = com.length ? `<div class="tabela"><table><thead><tr><th>Anúncio</th><th class="num">Preço</th><th>Promoções</th><th>Termina</th></tr></thead><tbody>
      ${com.map((i) => `<tr><td>${anuncio(i)}</td><td class="num">${brl(i.preco)}${i.preco_cheio > i.preco ? `<div class="pequeno suave">de ${brl(i.preco_cheio)}</div>` : ""}</td>
        <td class="pequeno">${i.promocoes.map((p) => `<div>${h(p.nome)} <span class="suave">· ${h(p.tipo_nome)}${p.status === "pending" ? " · programada" : ""}</span></div>`).join("")}</td>
        <td>${i.fim ? `${diaHora(i.fim)}${i.vence ? ' <span class="selo demo">vence em breve</span>' : ""}` : '<span class="pequeno suave">sem data</span>'}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("etiqueta", "Nenhum anúncio em promoção");
  } else {
    tabela = x.acabaram?.length ? `<div class="tabela"><table><thead><tr><th>Anúncio</th><th>Situação agora</th></tr></thead><tbody>
      ${x.acabaram.map((a) => { const i = x.itens.find((y) => y.item_id === a.item_id); return `<tr><td>${i ? anuncio(i) : `<b>${h(a.titulo)}</b><div class="pequeno suave">${h(a.item_id)}</div>`}</td>
        <td class="pequeno">${i && i.promocoes.length ? "já voltou para uma promoção" : 'sem promoção · veja em <a href="#" data-ir-aba="sem">Sem promoção</a>'}</td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("checar", "Nenhuma promoção acabou hoje");
  }
  corpo.innerHTML = `${erro}
    ${x.avisos?.length ? `<div class="aviso amarelo pequeno">${x.avisos.map(h).join("<br>")}</div>` : ""}
    ${r.sem_custo ? `<div class="aviso azul pequeno">${numero(r.sem_custo)} anúncio(s) sem custo cadastrado: sem custo o Replique não confere a margem. Cadastre em <a href="#/produtos">Produtos e custos</a>.</div>` : ""}
    <div class="grade g4 kpis" style="margin-bottom:16px">
      <div class="cartao kpi"><div class="rotulo">Anúncios ativos</div><div class="valor">${numero(r.ativos)}</div><div class="pequeno suave">${numero(r.em_promocao)} em promoção</div></div>
      <div class="cartao kpi ${r.sem_promocao ? "alerta" : ""}"><div class="rotulo">Sem promoção</div><div class="valor">${numero(r.sem_promocao)}</div><div class="pequeno suave">${numero(r.proprio_aprovar)} cabem na margem</div></div>
      <div class="cartao kpi"><div class="rotulo">Acabou hoje · vencem</div><div class="valor">${numero(r.acabaram_hoje)} · ${numero(r.vencem)}</div><div class="pequeno suave">aviso ${cfg.avisar_dias_antes} dia(s) antes</div></div>
      <div class="cartao kpi"><div class="rotulo">Convites do ML</div><div class="valor">${numero(r.convites)}</div>
        <div class="pequeno suave">${r.prazo_mais_proximo ? `prazo mais próximo ${diaHora(r.prazo_mais_proximo)}` : "sem prazo"}</div></div></div>
    <div class="linha entre" style="margin-bottom:12px"><div class="segmentos">${abas.map(([v, n]) => `<button type="button" data-aba-promo="${v}" class="${aba === v ? "ativa" : ""}">${n}</button>`).join("")}</div>
      <span class="pequeno suave">Margem mínima ${pct(cfg.margem_minima_pct)} · desconto próprio ${pct(cfg.desconto_padrao_pct)} por ${cfg.dias_campanha} dias${cfg.responsavel ? ` · responsável ${h(cfg.responsavel)}` : ""}</span></div>
    <div class="cartao">${tabela}</div>
    ${eEquipe() && (aba === "convites" || aba === "sem") ? `<div class="cartao linha entre" style="margin-top:12px">
      <label class="linha pequeno" style="gap:6px"><input type="checkbox" id="pc-sem-custo"> Enviar também os marcados sem custo cadastrado (sem conferir a margem)</label>
      <button id="pc-aplicar">${ic("aprovar", "p")}<span>${aba === "sem" ? "Criar campanha própria" : "Aprovar"} nos selecionados (<b id="pc-qtd">0</b>)</span></button></div>` : ""}
    <p class="pequeno suave">A margem usa o custo de Produtos e custos e, no preço da promoção, a comissão e a taxa fixa do Mercado Livre para a categoria e o tipo do anúncio
      e o frete grátis calculado pelo ML com o peso do anúncio (a mesma conta da extensão). Imposto e Ads vêm das vendas dos últimos 90 dias. Nos convites co-participados
      a conta é feita no preço que o comprador paga, sem contar a parte que o ML devolve: fica do lado seguro. Oferta relâmpago e oferta do dia ficam para decidir no Mercado Livre.</p>`;
  $$("[data-aba-promo]").forEach((b) => (b.onclick = () => { estado.abaPromo = b.dataset.abaPromo; desenharPromocoes(d); }));
  $$("[data-ir-aba]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); estado.abaPromo = a.dataset.irAba; desenharPromocoes(d); }));
  const contar = () => { if ($("#pc-qtd")) $("#pc-qtd").textContent = $$("[data-promo]:checked").length; };
  $$("[data-promo]").forEach((c) => (c.onchange = contar));
  contar();
  if (!$("#pc-aplicar")) return;
  $("#pc-aplicar").onclick = () => comBotao($("#pc-aplicar"), async () => {
    const itens = $$("[data-promo]:checked").map((c) => { const [item_id, promocao_id] = c.dataset.promo.split("|"); return { item_id, promocao_id }; });
    if (!itens.length) throw new Error("Selecione pelo menos um anúncio.");
    if (itens.length > 100) throw new Error("Envie no máximo 100 anúncios por vez.");
    if (!confirm(`Enviar ${itens.length} anúncio(s) para promoção no Mercado Livre de ${clienteAtual()?.nome}?`)) return;
    const res = await api("/api/promocoes/aplicar", { method: "POST", body: { itens, aceitar_sem_custo: $("#pc-sem-custo").checked } });
    const titulo = (id) => x.itens.find((i) => i.item_id === id)?.titulo || id;
    modal(`<h2>${ic("aprovar", "p")}Resultado do envio</h2>
      <p><b>${res.aplicados.length}</b> anúncio(s) enviados para promoção.</p>
      ${res.recusados.length ? `<h3>Não enviados (${res.recusados.length})</h3><ul class="pequeno">${res.recusados.map((y) => `<li><b>${h(titulo(y.item_id))}</b>: ${h(y.motivo)}</li>`).join("")}</ul>` : ""}
      ${res.erros.length ? `<h3>Recusados pelo Mercado Livre (${res.erros.length})</h3><ul class="pequeno">${res.erros.map((y) => `<li>${y.item_id ? `<b>${h(titulo(y.item_id))}</b>: ` : ""}${h(y.motivo)}</li>`).join("")}</ul>` : ""}
      <p class="pequeno suave">O ML pode levar alguns minutos para mostrar a promoção. Clique em Ler agora depois para conferir.</p>
      <div class="linha" style="justify-content:flex-end"><button data-fechar>Fechar</button></div>`);
    desenharPromocoes(await api("/api/promocoes"));
  });
}

function regrasPromocoes(d, depois) {
  const c = d.config;
  const m = modal(`<h2>${ic("ajustes", "p")}Regras de promoção do cliente</h2>
    <p class="pequeno suave" style="margin-top:-6px">Valem para as sugestões, para a aprovação em lote e para os avisos deste cliente.</p>
    <div class="grade g2">
      <div><label for="rp-margem">Margem mínima (%)</label><input id="rp-margem" type="number" step="0.5" min="0" max="90" value="${c.margem_minima_pct}">
        <div class="pequeno suave">Promoção que deixa a margem abaixo disso é recusada.</div></div>
      <div><label for="rp-resp">Responsável pelas promoções</label><select id="rp-resp"><option value="">Ninguém (avisa a equipe do cliente)</option>
        ${d.equipe.map((p) => `<option value="${p.id}" ${p.id === c.responsavel_id ? "selected" : ""}>${h(p.nome)} · ${h(PAPEL[p.papel] || p.papel)}</option>`).join("")}</select>
        <div class="pequeno suave">É quem aparece com @ no aviso e na mensagem do grupo.</div></div>
      <div><label for="rp-desc">Desconto da campanha própria (%)</label><input id="rp-desc" type="number" step="0.5" min="5" max="80" value="${c.desconto_padrao_pct}">
        <div class="pequeno suave">Diminui sozinho quando não cabe na margem mínima.</div></div>
      <div><label for="rp-max">Desconto máximo aceito (%)</label><input id="rp-max" type="number" step="0.5" min="5" max="80" value="${c.desconto_maximo_pct}">
        <div class="pequeno suave">Trava contra convites com desconto alto demais.</div></div>
      <div><label for="rp-dias">Duração da campanha própria (dias)</label><input id="rp-dias" type="number" min="1" max="60" value="${c.dias_campanha}"></div>
      <div><label for="rp-aviso">Avisar quantos dias antes de acabar</label><input id="rp-aviso" type="number" min="0" max="7" value="${c.avisar_dias_antes}"></div></div>
    <label class="linha" style="gap:6px;margin-top:10px"><input type="checkbox" id="rp-ativo" ${c.ativo ? "checked" : ""}> Ler esta conta automaticamente e mandar avisos</label>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button class="sec" data-fechar>Cancelar</button><button id="rp-salvar">Salvar</button></div>`);
  $("#rp-salvar", m).onclick = () => comBotao($("#rp-salvar", m), async () => {
    await api("/api/promocoes/config", { method: "PUT", body: { ativo: $("#rp-ativo", m).checked, margem_minima_pct: +$("#rp-margem", m).value,
      desconto_padrao_pct: +$("#rp-desc", m).value, desconto_maximo_pct: +$("#rp-max", m).value, dias_campanha: +$("#rp-dias", m).value,
      avisar_dias_antes: +$("#rp-aviso", m).value, responsavel_id: +$("#rp-resp", m).value || null } });
    fecharModal();
    toast("Regras salvas. Clique em Ler agora para refazer as sugestões.");
    depois();
  });
}

async function cartaoFaturamento(mes) {
  const alvo = $("#vg-faturamento");
  if (!alvo) return;
  let f;
  try { f = await api(`/api/faturamento-geral?mes=${mes}`); }
  catch (e) { alvo.innerHTML = `<div class="aviso vermelho pequeno">${h(e.message)}</div>`; return; }
  if (!$("#vg-faturamento")) return;
  const recorte = estado.recorteFat || "assessoria";
  const r = recorte === "assessoria" ? f.assessoria : f.mes_recorte;
  const plats = Object.keys(f.plataformas);
  const top = r.clientes.filter((c) => c.total > 0);
  const nomeMes = new Date(f.mes + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  alvo.innerHTML = `<div class="linha entre"><h2 style="margin:0">${ic("cifrao", "p")}${eAdmin() ? "Faturamento dos clientes com a Monvatti" : "Faturamento dos seus clientes"}</h2>
      <div class="linha" style="gap:8px"><div class="segmentos">${[["assessoria", "Desde o início da assessoria"], ["mes", "No mês"]].map(([v, n]) =>
        `<button type="button" data-recorte="${v}" class="${recorte === v ? "ativa" : ""}">${n}</button>`).join("")}</div>
        ${recorte === "mes" ? `<input type="month" id="vg-mes" value="${h(f.mes)}" style="max-width:180px" aria-label="Mês">` : ""}</div></div>
    <div class="grade g4" style="margin-top:12px">
      <div class="kpi-bloco"><span class="rotulo">${recorte === "assessoria" ? "Total com a Monvatti" : `Total em ${nomeMes}`}</span><div class="valor">${brl(r.total)}</div>
        <div class="pequeno suave">${numero(r.pedidos)} pedido(s), todos os canais</div></div>
      ${plats.map((p) => `<div class="kpi-bloco"><span class="rotulo">${h(f.plataformas[p])}</span><div class="valor">${brl(r.por_plataforma[p])}</div>
        <div class="pequeno suave">${r.total ? pct(r.por_plataforma[p] / r.total * 100) : "—"} do total</div></div>`).join("")}</div>
    ${top.length ? `<div class="tabela" style="margin-top:12px"><table><thead><tr><th>Cliente</th>${recorte === "assessoria" ? "<th>Assessorado desde</th>" : ""}
      ${plats.map((p) => `<th class="num">${h(f.plataformas[p])}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
      ${top.map((c) => `<tr><td><b>${h(c.nome)}</b></td>
        ${recorte === "assessoria" ? `<td class="pequeno">${new Date(c.inicio + "T12:00:00").toLocaleDateString("pt-BR")}${c.primeira_venda && c.primeira_venda > c.inicio
          ? `<div class="suave" title="As vendas anteriores a essa data ainda não foram sincronizadas em Vendas e Lucro">vendas sincronizadas desde ${new Date(c.primeira_venda + "T12:00:00").toLocaleDateString("pt-BR")}</div>` : ""}</td>` : ""}
        ${plats.map((p) => `<td class="num">${c[p] ? brl(c[p]) : "—"}</td>`).join("")}<td class="num"><b>${brl(c.total)}</b></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="pequeno suave" style="margin-top:12px">Nenhuma venda sincronizada ${recorte === "assessoria" ? "desde o início da assessoria" : "neste mês"}.</p>`}
    <p class="pequeno suave">Soma o que cada cliente vendeu no Mercado Livre, na Shopee e na Amazon ${recorte === "assessoria"
      ? "desde que a Monvatti começou a assessorá-lo (a data do cadastro, ou a informada em Clientes)" : "no mês escolhido"}: pedidos pagos, já sem reembolsos e sem simulações,
      pelas vendas sincronizadas em Vendas e Lucro.${f.sem_vendas_lucro ? ` ${numero(f.sem_vendas_lucro)} cliente(s) estão sem o módulo Vendas e Lucro ligado e não entram na conta.` : ""}</p>`;
  $$("[data-recorte]", alvo).forEach((b) => (b.onclick = () => { estado.recorteFat = b.dataset.recorte; cartaoFaturamento(f.mes); }));
  if ($("#vg-mes")) $("#vg-mes").onchange = (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) cartaoFaturamento(e.target.value); };
}

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

const pctN = (v) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);
const varHtml = (v, inverso = false) => (v == null ? '<span class="pequeno suave">sem mês anterior</span>'
  : `<span class="pequeno ${(v < 0) !== inverso ? "ruim" : "bom"}">${v > 0 ? "↑" : v < 0 ? "↓" : "→"} ${pctN(Math.abs(v))} vs. mês anterior</span>`);
const seletorMes = (id, mes) => `<select id="${id}" aria-label="Mês" style="width:auto">${mesesRecentes().map(([v, n]) =>
  `<option value="${v}" ${v === mes ? "selected" : ""}>${n}</option>`).join("")}</select>`;
const estadoGestao = { aba: "cliente" };

async function telaGestaoVendas(mesParam) {
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : mesesRecentes()[0][0];
  const e = estadoGestao;
  const equipe = eTime();
  $("#tela").innerHTML = `<div class="topo"><div><h1>Gestão de vendas e rentabilidade</h1>
    <div class="suave">Quanto ${equipe ? `<b>${h(clienteAtual()?.nome)}</b>` : "a loja"} vende, quanto custa vender em cada canal e quanto sobra, comparando com o mês anterior.
      Os números são os mesmos de <a href="#/lucro">Vendas e taxas</a>.</div></div>
    <div class="linha">${seletorMes("gv-mes", mes)}</div></div>
    ${equipe ? `<div class="segmentos" style="margin-bottom:16px">${[["cliente", "Este cliente"], ["todos", "Todos os clientes"]].map(([v, n]) =>
      `<button type="button" data-gv-aba="${v}" class="${e.aba === v ? "ativa" : ""}">${n}</button>`).join("")}</div>` : ""}
    <div id="gv-corpo"><div class="esqueleto" style="height:200px"></div></div>`;
  $("#gv-mes").onchange = () => { location.hash = `#/vendas/${$("#gv-mes").value}`; };
  $$("[data-gv-aba]").forEach((b) => (b.onclick = () => { e.aba = b.dataset.gvAba; telaGestaoVendas(mes); }));
  if (equipe && e.aba === "todos") return carteiraGestao(mes);
  const g = await api(`/api/financeiro/gestao?mes=${mes}`);
  const i = g.indicadores;
  const kpi = (rot, k, fmt, inverso) => `<div class="cartao kpi-bloco"><span class="rotulo">${rot}</span><div class="valor">${fmt(i[k].atual)}</div>${varHtml(i[k].variacao, inverso)}</div>`;
  const canais = Object.entries(g.canais);
  $("#gv-corpo").innerHTML = `
    ${g.incompleto ? `<div class="aviso amarelo">${ic("alerta", "p")} ${g.sem_custo + g.sem_vinculo} venda(s) sem custo ou sem produto vinculado: o lucro e a margem estão maiores que o real.
      Cadastre em <a href="#/produtos">Produtos e custos</a>.</div>` : ""}
    ${g.simuladas ? `<div class="aviso azul">${ic("alerta", "p")} Há vendas simuladas neste mês.</div>` : ""}
    <div class="grade g4">${kpi("Faturamento", "total", brl)}${kpi("Pedidos", "pedidos", numero)}${kpi("Lucro", "lucro", brl)}${kpi("Margem", "margem", pct)}</div>
    <div class="grade g4" style="margin-top:16px">${kpi("Ticket médio", "ticket_medio", brl)}${kpi("Tarifas do marketplace", "comissao", brl, true)}
      ${kpi("Frete pago", "frete", brl, true)}${kpi("Publicidade", "ads_total", brl, true)}</div>
    <section class="cartao" style="margin-top:16px"><h2>${ic("loja", "p")}Por canal</h2>
      ${canais.length ? `<div class="tabela embutida"><table><thead><tr><th>Canal</th><th class="num">Faturamento</th><th class="num">Pedidos</th><th class="num">Ticket</th>
        <th class="num">Tarifas</th><th class="num">Frete</th><th class="num">Custo</th><th class="num">Ads</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody>
        ${canais.map(([k, c]) => `<tr><td>${selo(k)}<div>${varHtml(c.variacao_total)}</div></td><td class="num">${brl(c.total)}</td><td class="num">${c.pedidos}</td>
          <td class="num">${brl(c.ticket_medio)}</td><td class="num">${brl(c.comissao)}</td><td class="num">${brl(c.frete)}</td><td class="num">${brl(c.custo)}</td>
          <td class="num">${brl(c.ads)}</td><td class="num"><b>${brl(c.lucro)}</b></td><td class="num ${c.margem < 0 ? "ruim" : ""}">${pctN(c.margem)}</td></tr>`).join("")}</tbody></table></div>`
        : vazio("loja", "Nenhuma venda no mês", `As vendas são atualizadas sozinhas a cada hora; veja em <a href="#/lucro">Vendas e taxas</a>.`)}</section>
    ${g.achados.length ? `<section class="cartao" style="margin-top:16px"><div class="linha entre"><h2 style="margin:0">${ic("brilho", "p")}Alertas do analista</h2>
      <a href="#/analise/${mes}" class="pequeno">ver análise completa</a></div><div class="achados">${g.achados.map(htmlAchado).join("")}</div></section>` : ""}
    <section class="cartao" style="margin-top:16px"><div class="linha entre"><h2 style="margin:0">${ic("pacote", "p")}Por produto e curva ABC</h2>
      <button class="sec pequeno" id="gv-csv">${ic("enviar", "p")}CSV</button></div>
      <p class="pequeno suave">A = produtos que somam os primeiros 80% do faturamento; B = os próximos 15%; C = o resto.</p>
      ${g.produtos.length ? `<div class="tabela embutida"><table><thead><tr><th>Classe</th><th>Produto</th><th class="num">Unidades</th><th class="num">Faturamento</th>
        <th class="num">% do total</th><th class="num">Acumulado</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody>
        ${g.produtos.map((p) => `<tr><td><span class="selo ${p.classe === "A" ? "ok" : p.classe === "B" ? "neutro" : "demo"}">${p.classe}</span></td>
          <td><b>${h(p.titulo)}</b>${p.sku ? `<div class="pequeno suave">SKU ${h(p.sku)}</div>` : ""}${p.sem_custo || p.sem_vinculo ? '<div class="pequeno suave">sem custo: lucro parcial</div>' : ""}</td>
          <td class="num">${p.unidades}</td><td class="num">${brl(p.total)}</td><td class="num">${pctN(p.participacao)}</td><td class="num">${pctN(p.acumulado)}</td>
          <td class="num">${brl(p.lucro)}</td><td class="num ${p.lucro < 0 ? "ruim" : ""}">${pctN(p.margem)}</td></tr>`).join("")}</tbody></table></div>`
        : vazio("pacote", "Sem vendas no mês")}</section>`;
  if ($("#gv-csv")) $("#gv-csv").onclick = () => baixarCsv(`curva-abc-${mes}.csv`, ["Classe", "Produto", "SKU", "Unidades", "Faturamento", "% do total", "Acumulado %", "Lucro", "Margem %"],
    g.produtos.map((p) => [p.classe, p.titulo, p.sku, p.unidades, p.total, p.participacao, p.acumulado, p.lucro, p.margem]));
}

async function carteiraGestao(mes) {
  const lista = await api(`/api/analise/carteira?mes=${mes}`);
  $("#gv-corpo").innerHTML = `<div class="cartao">${lista.length ? `<div class="tabela embutida"><table><thead><tr><th>Cliente</th><th class="num">Faturamento</th>
    <th class="num">Pedidos</th><th class="num">Lucro</th><th class="num">Margem</th><th>Ponto de atenção</th><th></th></tr></thead><tbody>
    ${lista.map((c) => `<tr><td><b>${h(c.cliente.nome)}</b>${c.sincronizado_em ? "" : '<div class="pequeno suave">vendas não sincronizadas</div>'}</td>
      <td class="num">${brl(c.indicadores.faturamento)}<div>${varHtml(c.variacao_faturamento)}</div></td><td class="num">${c.indicadores.pedidos}</td>
      <td class="num">${brl(c.indicadores.lucro)}<div>${varHtml(c.variacao_lucro)}</div></td><td class="num ${c.indicadores.margem < 0 ? "ruim" : ""}">${pctN(c.indicadores.margem)}</td>
      <td class="pequeno">${c.vermelhos ? `<span class="selo erro">${c.vermelhos}</span> ` : ""}${c.amarelos ? `<span class="selo demo">${c.amarelos}</span> ` : ""}${h(c.principal || "—")}</td>
      <td><button type="button" class="sec pequeno" data-gv-cliente="${c.cliente.id}">Abrir</button></td></tr>`).join("")}</tbody></table></div>`
    : vazio("loja", "Nenhum cliente")}</div>`;
  $$("[data-gv-cliente]").forEach((b) => (b.onclick = () => {
    estadoGestao.aba = "cliente";
    trocarCliente(+b.dataset.gvCliente, { navegar: false });
    telaGestaoVendas(mes);
  }));
}

const estadoLucr = { margem: 15 };

async function telaLucratividade() {
  const e = estadoLucr;
  const r = await api(`/api/financeiro/lucratividade?margem=${e.margem}`);
  const plats = Object.keys(PLAT);
  $("#tela").innerHTML = `<div class="topo"><div><h1>Minha lucratividade</h1>
    <div class="suave">Custo de cada produto, a margem real dos últimos ${r.dias} dias por canal e o preço mínimo para a margem que você quer.
      Quando o produto ainda não vendeu num canal, a conta usa a tarifa padrão dele e o imposto configurado (marcado como estimativa).</div></div>
    <div class="linha"><label class="linha" style="gap:6px;margin:0">Margem desejada
      <input type="number" id="lc-margem" min="0" max="90" step="1" value="${r.margem_alvo}" style="width:80px"> %</label>
      <a class="botao sec" href="#/produtos">${ic("pacote", "p")}Custos e planilha</a></div></div>
    ${r.sem_custo ? `<div class="aviso amarelo">${ic("alerta", "p")} ${r.sem_custo} produto(s) sem custo cadastrado: sem custo não dá para calcular margem nem preço mínimo.
      Cadastre ou importe por planilha em <a href="#/produtos">Produtos e custos</a>.</div>` : ""}
    ${r.com_prejuizo ? `<div class="aviso vermelho">${ic("alerta", "p")} <b>${r.com_prejuizo} produto(s) com prejuízo</b> em algum canal no preço médio vendido. Estão no topo da lista.</div>` : ""}
    <div class="cartao">${r.produtos.length ? `<div class="tabela embutida"><table><thead><tr><th>Produto</th><th class="num">Custo</th>
      ${plats.map((p) => `<th>${PLAT[p].nome}</th>`).join("")}<th></th></tr></thead><tbody>
      ${r.produtos.map((p, n) => `<tr class="${p.prejuizo ? "destaque-ruim" : ""}"><td><b>${h(p.nome)}</b>${p.sku ? `<div class="pequeno suave">SKU ${h(p.sku)}</div>` : ""}
          <div class="pequeno suave">${p.unidades} vendida(s) em ${r.dias} dias</div></td>
        <td class="num">${p.custo != null ? brl(p.custo) : '<span class="selo demo">sem custo</span>'}</td>
        ${plats.map((k) => { const c = p.canais[k];
          return `<td class="pequeno">${c.margem != null ? `<b class="${c.margem < 0 ? "ruim" : ""}">${pctN(c.margem)}</b> a ${brl(c.preco_medio)}` : '<span class="suave">sem vendas</span>'}
            ${c.preco_minimo ? `<div>mínimo ${brl(c.preco_minimo)}</div>` : ""}
            <div class="suave">${c.fonte === "vendas" ? "das suas vendas" : c.fonte === "mercado_livre" ? "comissão e frete do ML" : "estimativa: sem vendas e sem leitura do ML"}</div></td>`; }).join("")}
        <td>${p.custo != null ? `<button type="button" class="sec pequeno" data-lc-sim="${n}">${ic("calculadora", "p")}Simular</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("pacote", "Nenhum produto cadastrado", `Cadastre ou importe em <a href="#/produtos">Produtos e custos</a>.`)}</div>`;
  $("#lc-margem").onchange = () => { e.margem = Math.min(90, Math.max(0, +$("#lc-margem").value || 0)); telaLucratividade(); };
  $$("[data-lc-sim]").forEach((b) => (b.onclick = () => simularLucro(r.produtos[+b.dataset.lcSim], r.margem_alvo)));
}

function simularLucro(p, margemAlvo) {
  const plats = Object.keys(PLAT);
  const m = modal(`<h2>${ic("calculadora", "p")}E se… ${h(p.nome)}</h2>
    <p class="pequeno suave">Mude preço, frete ou custo e veja o lucro por unidade em cada canal. Tarifa, imposto e Ads usam o percentual
      ${"de cada canal"} (das suas vendas ou a estimativa). Nada é salvo.</p>
    <div class="grade g4"><div><label for="sm-custo">Custo</label><input type="number" id="sm-custo" step="0.01" min="0" value="${p.custo}"></div>
      <div><label for="sm-emb">Embalagem</label><input type="number" id="sm-emb" step="0.01" min="0" value="${p.embalagem}"></div></div>
    <div class="tabela embutida" style="margin-top:12px"><table><thead><tr><th>Canal</th><th>Preço</th><th>Frete por unidade</th><th class="num">Lucro por unidade</th>
      <th class="num">Margem</th><th class="num">Mínimo p/ ${margemAlvo}%</th></tr></thead><tbody>
      ${plats.map((k) => { const c = p.canais[k];
        return `<tr data-sm="${k}"><td>${selo(k)}<div class="pequeno suave">tarifa ${pctN(c.comissao_pct)} · imposto ${pctN(c.imposto_pct)}${c.ads_pct ? ` · Ads ${pctN(c.ads_pct)}` : ""}</div></td>
          <td><input type="number" step="0.01" min="0" data-sm-preco value="${c.preco_medio || c.preco_minimo || ""}" style="width:110px"></td>
          <td><input type="number" step="0.01" min="0" data-sm-frete value="${c.frete_unidade}" style="width:100px"></td>
          <td class="num" data-sm-lucro></td><td class="num" data-sm-margem></td><td class="num" data-sm-min></td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="linha" style="justify-content:flex-end;margin-top:14px"><button data-fechar>Fechar</button></div>`);
  m.classList.add("largo");
  const calcular = () => {
    const custo = +$("#sm-custo", m).value || 0, emb = +$("#sm-emb", m).value || 0;
    $$("[data-sm]", m).forEach((tr) => {
      const c = { ...p.canais[tr.dataset.sm], frete_unidade: +$("[data-sm-frete]", tr).value || 0 };
      const preco = +$("[data-sm-preco]", tr).value || 0;
      const varPct = (c.comissao_pct + c.imposto_pct + c.ads_pct) / 100;
      const lucro = preco * (1 - varPct) - c.frete_unidade - c.taxa_fixa - custo - emb;
      const minimo = 1 - varPct - margemAlvo / 100 > 0 ? (custo + emb + c.frete_unidade + c.taxa_fixa) / (1 - varPct - margemAlvo / 100) : null;
      $("[data-sm-lucro]", tr).innerHTML = preco ? `<b class="${lucro < 0 ? "ruim" : ""}">${brl(lucro)}</b>` : "—";
      $("[data-sm-margem]", tr).textContent = preco ? pctN(Math.round((lucro / preco) * 1000) / 10) : "—";
      $("[data-sm-min]", tr).textContent = minimo ? brl(minimo) : "—";
    });
  };
  $$("input", m).forEach((i) => (i.oninput = calcular));
  calcular();
}

async function telaDre(mesParam) {
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : mesesRecentes()[0][0];
  const d = await api(`/api/financeiro/dre?mes=${mes}&meses=3`);
  const LINHAS = [["receita_bruta", "Receita bruta", "forte"], ["devolucoes", "(−) Devoluções e reembolsos"], ["bonus", "(+) Bônus do marketplace"],
    ["impostos", "(−) Impostos sobre a venda"], ["receita_liquida", "= Receita líquida", "forte"], ["cmv", "(−) Custo das mercadorias"],
    ["tarifas", "(−) Tarifas do marketplace"], ["frete", "(−) Frete"], ["ads", "(−) Publicidade (Ads)"],
    ["margem_contribuicao", "= Margem de contribuição", "forte"], ["despesas", "(−) Despesas operacionais"], ["resultado", "= Resultado: o que sobrou no bolso", "forte"]];
  const nomeMes = (m) => mesesRecentes(24).find(([v]) => v === m)?.[1] || m;
  const canais = Object.entries(d.por_canal);
  $("#tela").innerHTML = `<div class="topo nao-imprimir"><div><h1>Resultado do mês</h1>
    <div class="suave">O DRE simplificado da loja, comparado com os meses anteriores e por canal: de onde vem o dinheiro, para onde vai e o que sobrou (ou faltou) no bolso. Passe o mouse no nome da linha para ver de onde sai cada número.</div></div>
    <div class="linha">${seletorMes("dre-mes", mes)}<button class="sec" id="dre-csv">${ic("enviar", "p")}CSV</button>
      <button class="sec" id="dre-pdf">${ic("relatorio", "p")}PDF</button></div></div>
    <h1 class="so-impressao">DRE simplificado · ${h(clienteAtual()?.nome || "")} · ${h(nomeMes(mes))}</h1>
    ${d.avisos.map((a) => `<div class="aviso amarelo">${ic("alerta", "p")} ${h(a)}</div>`).join("")}
    <section class="cartao"><div class="tabela embutida"><table class="tabela-dre"><thead><tr><th>Linha</th>
      ${d.colunas.map((c) => `<th class="num">${h(nomeMes(c.mes))}${c.incompleto ? ' <span class="selo demo" title="Há vendas sem custo cadastrado">incompleto</span>' : ""}</th>`).join("")}
      <th class="num">% da receita líquida</th></tr></thead><tbody>
      ${LINHAS.map(([k, nome, forte]) => { const ult = d.colunas[d.colunas.length - 1].linhas;
        return `<tr class="${forte ? "linha-forte" : ""}"><td title="${h(d.origem[k] || "")}">${nome}</td>
          ${d.colunas.map((c) => `<td class="num ${c.linhas[k] < 0 && forte ? "ruim" : ""}">${brl(c.linhas[k])}</td>`).join("")}
          <td class="num pequeno suave">${ult.receita_liquida ? pctN(Math.round((ult[k] / ult.receita_liquida) * 1000) / 10) : "—"}</td></tr>`; }).join("")}
      <tr class="linha-forte"><td>Margem líquida</td>${d.colunas.map((c) => `<td class="num">${pctN(c.linhas.margem_liquida)}</td>`).join("")}<td></td></tr>
    </tbody></table></div></section>
    <div class="grade g2" style="margin-top:16px;align-items:start">
      <section class="cartao"><h2>${ic("loja", "p")}Por canal em ${h(nomeMes(mes))}</h2>
        <p class="pequeno suave">Até a margem de contribuição. As despesas operacionais não são divididas entre os canais.</p>
        ${canais.length ? `<div class="tabela embutida"><table><thead><tr><th>Linha</th>${canais.map(([k]) => `<th class="num">${PLAT[k]?.nome || h(k)}</th>`).join("")}</tr></thead><tbody>
          ${LINHAS.filter(([k]) => !["despesas", "resultado"].includes(k)).map(([k, nome, forte]) => `<tr class="${forte ? "linha-forte" : ""}"><td>${nome}</td>
            ${canais.map(([, c]) => `<td class="num">${brl(c[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : vazio("loja", "Sem vendas no mês")}</section>
      <section class="cartao"><h2>${ic("loja", "p")}Despesas operacionais</h2>
        ${Object.keys(d.despesas_por_categoria).length ? Object.entries(d.despesas_por_categoria).map(([c, v]) => `<div class="linha entre" style="padding:6px 0;border-bottom:1px solid var(--borda)">
          <span>${h(c)}</span><b>${brl(v)}</b></div>`).join("") : `<p class="pequeno suave">Nenhuma despesa cadastrada. Cadastre em <a href="#/despesas/${mes}">Custo operacional</a>.</p>`}</section>
    </div>`;
  $("#dre-mes").onchange = () => { location.hash = `#/dre/${$("#dre-mes").value}`; };
  $("#dre-pdf").onclick = () => window.print();
  $("#dre-csv").onclick = () => baixarCsv(`dre-${mes}.csv`, ["Linha", ...d.colunas.map((c) => c.mes), "Origem do número"],
    [...LINHAS.map(([k, nome]) => [nome, ...d.colunas.map((c) => c.linhas[k]), d.origem[k] || ""]),
      ["Margem líquida %", ...d.colunas.map((c) => c.linhas.margem_liquida), "Resultado ÷ receita líquida"]]);
}

function mesesRecentes(n = 12) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })];
  });
}

async function desenharRelatorio(alvo, mesParam) {
  const meses = mesesRecentes();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : meses[0][0];
  const cid = estado.usuario.papel === "cliente" ? estado.usuario.cliente_id : estado.clienteId;
  const r = await api(`/api/relatorios/${cid}?mes=${mes}`);
  const nomeMes = meses.find(([v]) => v === mes)?.[1] || mes;
  const n = r.numeros;
  const s = r.saude;
  const [corS, rotS] = NIVEL_SAUDE[s.nivel] || NIVEL_SAUDE.nunca;
  alvo.innerHTML = `<div class="linha entre nao-imprimir" style="margin-bottom:12px"><div class="suave">Resumo do trabalho na loja de <b>${h(r.cliente.nome)}</b>,
      pronto para enviar ao cliente (Imprimir → Salvar como PDF).</div>
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
  $("#r-mes").onchange = () => { location.hash = "#/acompanhamento/" + $("#r-mes").value; };
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
        ${ACEITE_HTML}
        <button type="submit">Criar acesso</button>
        ${c.google ? `<p class="pequeno suave" style="margin:4px 0 0">Com Google, use a conta do e-mail <b>${h(c.email)}</b>: outro e-mail não é aceito.</p>` : ""}
      </form>`}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Convite · Replique";
  if (!c) return;
  if (c.google) mostrarBotaoGoogle($("#google-convite"), "/api/auth/google/iniciar?convite=" + encodeURIComponent(token), "Continuar com Google");
  avisarCapsLock($("#f-colab"));
  $("#f-colab").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", e.target), async () => {
      const r = await api("/api/colaborador/" + encodeURIComponent(token), { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      await guardarSessao(r);
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
        : `<p class="pequeno" style="margin:10px 0 0">As vendas são atualizadas sozinhas a cada hora. <a href="#/lucro/${mes}">Ver vendas e taxas</a></p>`}
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
      <span class="pequeno suave" data-atualizado="vendas"></span>
      <button id="l-sinc" class="sec pequeno" title="Puxar agora os pedidos desta plataforma">${ic("trocar", "p")}Atualizar agora</button>
      ${estado.usuario.papel !== "consultor" ? `<button id="l-simular" class="sec pequeno" title="Lança uma venda de teste para ver como o cálculo fica">${ic("calculadora", "p")}Simular uma venda</button>` : ""}</div></div>
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
  if ($("#l-simular")) $("#l-simular").onclick = () => simularVenda(mes, recarregar);
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

const temFerramenta = (f) => eAdmin() || (estado.usuario?.ferramentas || []).includes(f);
const usaDuvidas = () => temFerramenta("duvidas");
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
  if (!_pollNaoLidas) _pollNaoLidas = setInterval(() => { if (estado.usuario && !document.hidden) { atualizarNaoLidas(); carregarPendencias(); } }, 45000);
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
    const v = (r === "duvidas" ? n.total || 0 : (por[r] || 0) + (r === "rascunhos" ? por.editor || 0 : 0)) + (estado.pendencias?.[r] || 0);
    el.hidden = !v;
    el.textContent = v > 99 ? "99+" : v;
  });
  $$("[data-contador-topico]").forEach((el) => {
    const v = $$("[data-contador]", el.closest(".topico")).reduce((t, b) => t + (b.hidden ? 0 : parseInt(b.textContent, 10) || 0), 0);
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
const PAGINAS_SEM_CHAT = new Set(["inicio", "pedidos", "acompanhamento", "duvidas", "clientes", "config", "entrar"]);

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
    const destino = c.pagina === "editor" && c.ref_id ? `editor/${c.ref_id}` : ["geral", "projeto", "tarefas"].includes(c.pagina) ? "painel" : c.pagina;
    location.hash = "#/" + destino;
  }));
}

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

const STATUS_PEDIDO = { pendente: ["neutro", "Pendente"], andamento: ["azul", "Em andamento"], rascunho_pronto: ["demo", "Rascunho pronto"],
  publicado: ["ok", "Publicado"], problema: ["erro", "Com problema"] };
const seloPedido = (p) => `<span class="selo ${STATUS_PEDIDO[p.status]?.[0] || "neutro"}">${STATUS_PEDIDO[p.status]?.[1] || h(p.status)}</span>`
  + (p.atrasado ? ' <span class="selo erro">atrasado</span>' : p.parado ? ' <span class="selo demo">parado</span>' : "");

function legendaHtml(texto) {
  const linhas = h(texto || "").split(/\r?\n/);
  let html = "", lista = false;
  for (const bruta of linhas) {
    const linha = bruta.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const item = linha.match(/^\s*(?:-|•|\*)\s+(.*)$/);
    if (item) { if (!lista) { html += "<ul>"; lista = true; } html += `<li>${item[1]}</li>`; continue; }
    if (lista) { html += "</ul>"; lista = false; }
    html += linha.trim() ? `<p>${linha}</p>` : "";
  }
  return (lista ? html + "</ul>" : html) || '<p class="suave">Sem instruções.</p>';
}

function linhaPedido(p) {
  return `<a class="lista-item linha-pedido" href="#/pedidos/${p.id}">
    <div class="info"><b>#${p.id} · ${h(p.resumo || "(sem descrição)")}</b>
      <span class="pequeno suave">${h(p.cliente)} · ${p.marketplaces.map((m) => PLAT[m]?.nome || m).join(", ")} · ${p.quantidade} anúncio(s)
        · ${p.operador ? h(p.operador) : "sem operador"}${p.prazo ? ` · prazo ${dataDia(p.prazo)}` : ""}</span></div>
    ${seloPedido(p)}</a>`;
}

const estadoPedidos = { aba: null, cliente: "" };

async function telaPedidos(param) {
  if (+param) return telaPedido(+param);
  const papel = estado.usuario.papel;
  const pede = papel !== "operador";
  const abas = papel === "operador" ? [["meus", "Meus pedidos"], ["abertos", "Abertos da equipe"], ["publicado", "Publicados"]]
    : [["abertos", "Abertos"], ["painel", "Painel"], ["publicado", "Publicados"], ["todos", "Todos"]];
  if (!abas.some(([k]) => k === estadoPedidos.aba)) estadoPedidos.aba = abas[0][0];
  const ativos = estado.usuario.clientes.filter((c) => c.ativo);
  $("#tela").innerHTML = `
  <div class="topo"><div><h1>Pedidos de anúncio</h1>
    <div class="suave">${pede ? "Peça anúncios ao operador: cliente, marketplaces, produto e as instruções de como publicar. Quando o anúncio é publicado, o pedido fecha sozinho."
      : "Os anúncios que o consultor pediu. Abra o pedido, leia as instruções e clique em Começar: o rascunho já nasce ligado ao pedido."}</div></div>
    <div class="linha"><select id="pd-cliente" aria-label="Cliente" style="width:auto"><option value="">Todos os clientes</option>
      ${ativos.map((c) => `<option value="${c.id}" ${String(c.id) === estadoPedidos.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select>
      ${pede ? `<button type="button" id="pd-novo">${ic("mais", "p")}Novo pedido</button>` : ""}</div></div>
  <div class="abas" id="pd-abas">${abas.map(([k, n]) => `<button type="button" data-aba="${k}" class="${estadoPedidos.aba === k ? "ativa" : ""}">${n}</button>`).join("")}</div>
  <div id="pd-corpo"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  $$("#pd-abas [data-aba]").forEach((b) => (b.onclick = () => { estadoPedidos.aba = b.dataset.aba; telaPedidos(); }));
  $("#pd-cliente").onchange = (e) => { estadoPedidos.cliente = e.target.value; telaPedidos(); };
  if ($("#pd-novo")) $("#pd-novo").onclick = () => formPedido(null, () => telaPedidos());
  const corpo = $("#pd-corpo");
  if (estadoPedidos.aba === "painel") {
    const p = await api("/api/pedidos/painel");
    const tabela = (titulo, linhas) => `<section class="cartao"><h2>${titulo}</h2>${linhas.length ? `<div class="tabela embutida"><table><thead><tr><th>Nome</th>
      <th class="num">Em aberto</th><th class="num">Atrasados</th><th class="num">Com problema</th><th class="num">Publicados 30 d</th></tr></thead><tbody>
      ${linhas.map((g) => `<tr><td><b>${h(g.nome)}</b></td><td class="num">${numero(g.abertos)}</td><td class="num ${g.atrasados ? "ruim" : ""}">${numero(g.atrasados)}</td>
        <td class="num">${numero(g.por_status.problema || 0)}</td><td class="num">${numero(g.publicados_30d)}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="suave pequeno">Nenhum pedido ainda.</p>'}</section>`;
    corpo.innerHTML = `<div class="grade g4">
        <div class="cartao kpi-bloco"><span class="rotulo">Em aberto</span><div class="valor">${numero(p.totais.abertos)}</div></div>
        <div class="cartao kpi-bloco"><span class="rotulo">Atrasados</span><div class="valor ${p.totais.atrasados ? "negativo" : ""}">${numero(p.totais.atrasados)}</div></div>
        <div class="cartao kpi-bloco"><span class="rotulo">Com problema</span><div class="valor">${numero(p.totais.problema)}</div></div>
        <div class="cartao kpi-bloco"><span class="rotulo">Publicados em 30 dias</span><div class="valor">${numero(p.totais.publicados_30d)}</div></div></div>
      <section class="cartao" style="margin-top:16px"><h2>${ic("alerta", "p")}Atrasados</h2>
        ${p.atrasados.length ? p.atrasados.map(linhaPedido).join("") : '<p class="suave pequeno">Nenhum pedido atrasado.</p>'}</section>
      <div class="grade g2" style="margin-top:16px;align-items:start">${tabela("Por operador", p.por_operador)}${tabela("Por cliente", p.por_cliente)}</div>`;
    return;
  }
  const qs = new URLSearchParams();
  if (estadoPedidos.aba === "meus") { qs.set("meus", "true"); qs.set("status", "abertos"); }
  else if (estadoPedidos.aba !== "todos") qs.set("status", estadoPedidos.aba);
  if (estadoPedidos.cliente) qs.set("cliente_id", estadoPedidos.cliente);
  const lista = await api("/api/pedidos?" + qs);
  corpo.innerHTML = `<div class="cartao">${lista.length ? lista.map(linhaPedido).join("")
    : vazio("pedido", estadoPedidos.aba === "publicado" ? "Nenhum pedido publicado ainda" : "Nenhum pedido aqui",
      pede ? "Clique em Novo pedido para passar um anúncio ao operador." : "Quando o consultor pedir um anúncio para você, ele aparece aqui.")}</div>`;
}

async function telaPedido(id) {
  const p = await api("/api/pedidos/" + id);
  const papel = estado.usuario.papel;
  const responsavel = papel === "admin" || (papel === "operador" && p.operador_id === estado.usuario.id);
  const pede = papel !== "operador";
  const fechado = p.status === "publicado";
  $("#tela").innerHTML = `
  <div class="topo"><div><a href="#/pedidos" class="pequeno">${ic("voltar", "p")} Pedidos</a>
    <h1>Pedido #${p.id} · ${h(p.cliente)}</h1>
    <div class="linha" style="gap:8px">${seloPedido(p)}${p.marketplaces.map((m) => selo(m)).join("")}</div></div>
    <div class="linha">${pede && !fechado ? `<button type="button" class="sec" id="pp-editar">${ic("lapis", "p")}Editar</button>` : ""}
      ${responsavel && !fechado && !p.rascunhos.length ? `<button type="button" id="pp-comecar">${ic("play", "p")}Começar</button>` : ""}
      ${responsavel && !fechado && p.rascunhos.length && p.status !== "rascunho_pronto" ? `<button type="button" class="sec" id="pp-pronto">${ic("checar", "p")}Rascunho pronto</button>` : ""}</div></div>
  ${p.status === "problema" && p.motivo ? `<div class="aviso vermelho">${ic("alerta", "p")} <b>Problema na publicação:</b> ${h(p.motivo)}</div>` : ""}
  <div class="pedido-grade">
    <div class="pilha">
      <section class="cartao"><h2>${ic("pacote", "p")}Produto</h2>
        ${p.produto_link ? `<p><b>Link:</b> ${urlSegura(p.produto_link) ? `<a href="${h(p.produto_link)}" target="_blank" rel="noopener noreferrer">${h(p.produto_link)} ${ic("externo", "p")}</a>` : h(p.produto_link)}</p>` : ""}
        ${p.produto_texto ? `<div class="pequeno" style="white-space:pre-wrap">${h(p.produto_texto)}</div>` : ""}
        <dl class="pedido-dados">
          <div><dt>Quantidade</dt><dd>${p.quantidade} anúncio(s)</dd></div>
          <div><dt>Prazo</dt><dd class="${p.atrasado ? "ruim" : ""}">${p.prazo ? dataDia(p.prazo) : "sem prazo"}</dd></div>
          <div><dt>Operador</dt><dd>${h(p.operador || "—")}</dd></div>
          <div><dt>Pedido por</dt><dd>${h(p.criado_por || "—")} · ${data(p.criado_em)}</dd></div>
        </dl></section>
      <section class="cartao"><h2>${ic("rascunhos", "p")}Rascunhos deste pedido <span class="suave pequeno">${p.publicados}/${p.quantidade} no ar</span></h2>
        ${p.rascunhos.length ? p.rascunhos.map((a) => `<div class="lista-item"><div class="info"><b>${h(a.titulo || "(sem título)")}</b></div>${seloStatus(a.status)}
          ${eEquipe() ? `<a class="botao sec pequeno" href="#/editor/${a.id}" data-cliente="${p.cliente_id}">${ic("lapis", "p")}Abrir</a>` : ""}</div>`).join("")
          : `<p class="suave pequeno">${responsavel ? "Clique em <b>Começar</b>: o rascunho é criado já ligado a este pedido (cópia do link do Mercado Livre quando houver)." : "O operador ainda não começou."}</p>`}
        ${responsavel && !fechado && p.rascunhos.length && p.rascunhos.length < p.quantidade ? `<button type="button" class="sec pequeno" id="pp-mais">${ic("mais", "p")}Criar mais um rascunho</button>` : ""}
      </section>
    </div>
    <aside class="cartao legenda-pedido" aria-label="Instruções do pedido"><h2>${ic("texto", "p")}Instruções</h2><div class="legenda-texto">${legendaHtml(p.legenda)}</div></aside>
  </div>`;
  $$("[data-cliente]").forEach((a) => (a.onclick = () => trocarCliente(+a.dataset.cliente, { navegar: false })));
  const comecar = (botao) => comBotao(botao, async () => {
    const r = await api(`/api/pedidos/${p.id}/comecar`, { method: "POST" });
    if (r.aviso) toast(r.aviso, true); else toast("Rascunho criado e ligado ao pedido.");
    trocarCliente(p.cliente_id, { navegar: false });
    location.hash = "#/editor/" + r.anuncio_id;
  });
  if ($("#pp-comecar")) $("#pp-comecar").onclick = () => comecar($("#pp-comecar"));
  if ($("#pp-mais")) $("#pp-mais").onclick = () => comecar($("#pp-mais"));
  if ($("#pp-pronto")) $("#pp-pronto").onclick = () => comBotao($("#pp-pronto"), async () => {
    await api(`/api/pedidos/${p.id}/pronto`, { method: "POST" });
    toast("Pedido marcado como rascunho pronto. Quem pediu foi avisado.");
    telaPedido(p.id);
  });
  if ($("#pp-editar")) $("#pp-editar").onclick = () => formPedido(p, () => telaPedido(p.id));
}

function inserirMarcacao(campo, tipo) {
  const ini = campo.selectionStart, fim = campo.selectionEnd, v = campo.value;
  if (tipo === "negrito") {
    const sel = v.slice(ini, fim) || "texto";
    campo.value = `${v.slice(0, ini)}**${sel}**${v.slice(fim)}`;
    campo.setSelectionRange(ini + 2, ini + 2 + sel.length);
  } else {
    const comeco = v.lastIndexOf("\n", ini - 1) + 1;
    campo.value = `${v.slice(0, comeco)}- ${v.slice(comeco)}`;
    campo.setSelectionRange(ini + 2, fim + 2);
  }
  campo.focus();
  campo.dispatchEvent(new Event("input"));
}

async function formPedido(p, depois) {
  const ativos = estado.usuario.clientes.filter((c) => c.ativo);
  const clienteId = p?.cliente_id || estado.clienteId || ativos[0]?.id;
  if (!clienteId) return toast("Nenhum cliente disponível para pedir anúncio.", true);
  const m = modal(`<h2>${ic("pedido", "p")}${p ? `Editar pedido #${p.id}` : "Novo pedido de anúncio"}</h2>
    <form id="f-pedido" class="pilha">
      <div class="grade g2">
        <div><label for="fp-cliente">Cliente</label><select id="fp-cliente" ${p ? "disabled" : ""}>${ativos.map((c) => `<option value="${c.id}" ${c.id === clienteId ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select></div>
        <div><label for="fp-operador">Operador responsável</label><select id="fp-operador" required><option value="">Carregando…</option></select></div>
      </div>
      <div><label>Marketplaces</label><div class="chips" id="fp-plats">${Object.entries(PLAT).map(([k, x]) => {
        const marcado = p ? p.marketplaces.includes(k) : k === "mercadolivre";
        return `<label class="chip ${marcado ? "marcado" : ""}"><input type="checkbox" value="${k}" ${marcado ? "checked" : ""}> ${x.nome}</label>`; }).join("")}</div></div>
      <div><label for="fp-link">Produto por link</label><input id="fp-link" type="url" maxlength="1000" placeholder="https://www.mercadolivre.com.br/… (copiado automaticamente quando for do Mercado Livre)" value="${h(p?.produto_link || "")}"></div>
      <div><label for="fp-texto">ou produto por texto</label><textarea id="fp-texto" maxlength="5000" rows="3" placeholder="Nome do produto, marca, modelo, medidas, o que vem na caixa…">${h(p?.produto_texto || "")}</textarea></div>
      <div class="grade g2">
        <div><label for="fp-qtd">Quantidade de anúncios</label><input id="fp-qtd" type="number" min="1" max="50" value="${p?.quantidade || 1}" required></div>
        <div><label for="fp-prazo">Prazo</label><input id="fp-prazo" type="date" value="${p?.prazo || ""}"></div>
      </div>
      <div><div class="linha entre"><label for="fp-legenda" style="margin:0">Legenda: como e o que fazer na publicação</label>
        <div class="linha" style="gap:4px"><button type="button" class="sec pequeno" data-marca="negrito" title="Negrito"><b>N</b></button>
          <button type="button" class="sec pequeno" data-marca="lista" title="Item de lista">• Lista</button></div></div>
        <textarea id="fp-legenda" maxlength="10000" rows="8" placeholder="Ex.: **Use** as fotos que o cliente mandou no drive&#10;- título com a capacidade em litros&#10;- anúncio Premium com frete grátis">${h(p?.legenda || "")}</textarea>
        <div class="pequeno suave">Use **texto** para negrito e comece a linha com "- " para lista.</div>
        <div class="legenda-previa legenda-texto" id="fp-previa"></div></div>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button>
        <button type="submit">${p ? "Salvar" : "Criar pedido"}</button></div>
    </form>`);
  m.classList.add("largo");
  const leg = $("#fp-legenda", m);
  const previa = () => ($("#fp-previa", m).innerHTML = leg.value.trim() ? legendaHtml(leg.value) : "");
  leg.oninput = previa;
  previa();
  $$("[data-marca]", m).forEach((b) => (b.onclick = () => inserirMarcacao(leg, b.dataset.marca)));
  $$("#fp-plats input", m).forEach((i) => (i.onchange = () => i.parentElement.classList.toggle("marcado", i.checked)));
  const carregarOperadores = async () => {
    const sel = $("#fp-operador", m);
    const lista = await api(`/api/pedidos/operadores?cliente_id=${$("#fp-cliente", m).value}`);
    sel.innerHTML = lista.length ? `<option value="">Escolha…</option>` + lista.map((o) => `<option value="${o.id}" ${o.id === p?.operador_id ? "selected" : ""}>${h(o.nome)}${o.papel === "admin" ? " (administrador)" : ""}</option>`).join("")
      : `<option value="">Nenhum operador atende este cliente</option>`;
    if (lista.length === 1 && !p) sel.value = lista[0].id;
  };
  $("#fp-cliente", m).onchange = carregarOperadores;
  await carregarOperadores();
  $("#f-pedido", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-pedido button[type=submit]", m), async () => {
      const corpo = { marketplaces: $$("#fp-plats input:checked", m).map((i) => i.value), produto_link: $("#fp-link", m).value.trim(),
        produto_texto: $("#fp-texto", m).value.trim(), quantidade: +$("#fp-qtd", m).value || 1, legenda: leg.value,
        operador_id: +$("#fp-operador", m).value || null };
      if (!corpo.operador_id) return toast("Escolha o operador responsável.", true);
      if (!corpo.marketplaces.length) return toast("Escolha pelo menos um marketplace.", true);
      const prazo = $("#fp-prazo", m).value;
      const r = p ? await api(`/api/pedidos/${p.id}`, { method: "PATCH", body: { ...corpo, prazo: prazo || null, sem_prazo: !prazo } })
        : await api("/api/pedidos", { method: "POST", body: { ...corpo, cliente_id: +$("#fp-cliente", m).value, prazo: prazo || null } });
      fecharModal();
      toast(p ? "Pedido atualizado." : `Pedido #${r.id} criado. ${h(r.operador)} foi avisado.`);
      depois?.(r);
    });
  };
}

async function carregarPendencias() {
  if (!estado.usuario) return;
  if (!eTime()) return atualizarSino();
  const qs = estado.clienteId ? `?cliente_id=${estado.clienteId}` : "";
  try { estado.pendencias = await api("/api/pendencias" + qs); } catch { return; }
  desenharSino(estado.pendencias.notificacoes || 0);
  desenharContadores();
}

function desenharSino(n) {
  const b = $("#sino-contador");
  if (b) { b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
}

async function atualizarSino() {
  try { desenharSino((await api("/api/notificacoes/contagem")).nao_lidas); } catch {}
}

const estadoSino = { cliente: "", soNaoLidas: false };

async function abrirNotificacoes() {
  const ativos = (estado.usuario.clientes || []).filter((c) => c.ativo);
  const m = modal(`<div class="linha entre" style="padding-right:36px"><h2 style="margin:0">${ic("sino", "p")}Notificações</h2>
      <button type="button" class="sec pequeno" id="nt-todas">Marcar todas como lidas</button></div>
    <div class="linha" style="margin:10px 0">
      ${ativos.length > 1 ? `<select id="nt-cliente" aria-label="Cliente" style="width:auto"><option value="">Todos os clientes</option>
        ${ativos.map((c) => `<option value="${c.id}" ${String(c.id) === estadoSino.cliente ? "selected" : ""}>${h(c.nome)}</option>`).join("")}</select>` : ""}
      <label class="linha" style="margin:0;gap:6px"><input type="checkbox" id="nt-nao-lidas" ${estadoSino.soNaoLidas ? "checked" : ""}> Só não lidas</label></div>
    <div id="nt-lista" class="lista-notificacoes"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`);
  const carregar = async () => {
    const qs = new URLSearchParams();
    if (estadoSino.cliente) qs.set("cliente_id", estadoSino.cliente);
    if (estadoSino.soNaoLidas) qs.set("nao_lidas", "true");
    const r = await api("/api/notificacoes?" + qs);
    $("#nt-lista", m).innerHTML = r.itens.length ? r.itens.map((n) => `<button type="button" class="notificacao ${n.lida ? "" : "nao-lida"}" data-nt="${n.id}">
        <span class="feed-ic">${ic(ICONE_NOTIFICACAO[n.tipo] || "alerta", "p")}</span>
        <span class="info"><b>${h(n.titulo)}</b>${n.texto ? `<span class="pequeno suave">${h(n.texto)}</span>` : ""}
          <span class="pequeno suave">${h(n.tipo_nome)}${n.cliente ? " · " + h(n.cliente) : ""} · ${tempoRelativo(n.criada_em)}${n.demo ? ' · <span class="selo demo">demonstração</span>' : ""}</span></span>
        ${n.lida ? "" : '<span class="ponto-nao-lida" aria-label="não lida"></span>'}</button>`).join("")
      : vazio("sino", "Nenhuma notificação", "Avisos de pedidos atrasados, anúncios com problema, catálogo, concorrentes, saúde da conta e Full aparecem aqui.");
    const porId = Object.fromEntries(r.itens.map((n) => [n.id, n]));
    $$("[data-nt]", m).forEach((b) => (b.onclick = async () => {
      const n = porId[b.dataset.nt];
      await api("/api/notificacoes/lidas", { method: "POST", body: { ids: [n.id] } }).catch(() => {});
      fecharModal();
      atualizarSino();
      if (n.cliente_id && eTime() && n.cliente_id !== estado.clienteId) trocarCliente(n.cliente_id, { navegar: false });
      if (n.link) { if (location.hash === n.link) roteador(); else location.hash = n.link; }
    }));
  };
  if ($("#nt-cliente", m)) $("#nt-cliente", m).onchange = (e) => { estadoSino.cliente = e.target.value; carregar(); };
  $("#nt-nao-lidas", m).onchange = (e) => { estadoSino.soNaoLidas = e.target.checked; carregar(); };
  $("#nt-todas", m).onclick = () => comBotao($("#nt-todas", m), async () => {
    await api("/api/notificacoes/lidas", { method: "POST", body: { ids: null } });
    await carregar();
    atualizarSino();
  });
  await carregar();
}

const ICONE_NOTIFICACAO = { pedido_atrasado: "relogio", pedido_parado: "pausa", pedido_novo: "pedido", anuncio_problema: "alerta",
  catalogo_perdido: "alvo", concorrente_preco: "cifrao", saude_risco: "coracao", full_parado: "caixa", agendador_falha: "trocar",
  ia_limite: "brilho", relatorio_mes: "relatorio" };

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

async function telaAcompanhamento(param) {
  const equipe = eTime();
  const comRelatorio = temFerramenta("relatorio");
  const aba = comRelatorio && (param === "relatorio" || /^\d{4}-\d{2}$/.test(param || "")) ? "relatorio" : "geral";
  $("#tela").innerHTML = `<div class="topo nao-imprimir"><div><h1>Acompanhamento</h1>
    <div class="suave">${equipe ? "O que está acontecendo em cada conta que você atende: saúde, perguntas sem resposta, o que foi publicado no mês, as últimas atividades e o relatório do mês para enviar ao cliente."
      : "Como está a sua conta, o que a equipe Monvatti fez nela e o relatório de cada mês."}</div></div>
    <div class="linha"><a class="botao sec" href="#/saude">${ic("coracao", "p")}Saúde das contas</a>
      ${equipe ? `<a class="botao sec" href="#/perguntas">${ic("balao", "p")}Perguntas</a>` : ""}</div></div>
  ${comRelatorio ? `<div class="abas nao-imprimir">
    <button type="button" data-aba-ac="geral" class="${aba === "geral" ? "ativa" : ""}">${ic("bussola", "p")}Visão geral</button>
    <button type="button" data-aba-ac="relatorio" class="${aba === "relatorio" ? "ativa" : ""}">${ic("relatorio", "p")}Relatório do mês</button></div>` : ""}
  <div id="ac-corpo"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  $$("[data-aba-ac]").forEach((b) => (b.onclick = () => { location.hash = b.dataset.abaAc === "relatorio" ? "#/acompanhamento/relatorio" : "#/acompanhamento"; }));
  const corpo = $("#ac-corpo");
  if (aba === "relatorio") {
    if (equipe && !estado.clienteId) {
      corpo.innerHTML = `<div class="cartao">${vazio("relatorio", "Escolha o cliente", "Use o seletor do topo para escolher de qual cliente é o relatório.")}</div>`;
      return;
    }
    return desenharRelatorio(corpo, param);
  }
  const r = await api("/api/acompanhamento/geral");
  const aprovar = equipe ? [] : await api("/api/aprovacoes").catch(() => []);
  const [ano, mes] = r.mes.split("-");
  const mesAnterior = new Date(+ano, +mes - 2, 1);
  const refAnterior = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
  corpo.innerHTML = `
  ${aprovar.length ? `<section class="cartao" style="margin-bottom:16px;border-left:3px solid var(--azul)">
    <h2>${ic("aprovar", "p")}Aguardando a sua aprovação (${aprovar.length})</h2>
    <p class="pequeno suave">A equipe preparou estes anúncios e só publica depois do seu ok. Clique em Ver para aprovar ou pedir ajustes.</p>
    ${aprovar.map((a) => `<div class="lista-item">${urlSegura(a.foto) ? `<img src="${h(a.foto)}" alt="" referrerpolicy="no-referrer">` : semFoto()}
      <div class="info"><b>${h(a.titulo || "(sem título)")}</b><span class="pequeno suave">${brl(a.preco)}</span></div>
      <button type="button" class="pequeno" data-aprovar="${a.id}">${ic("olho", "p")}Ver</button></div>`).join("")}</section>` : ""}
  <div class="grade-acomp">${r.clientes.length ? r.clientes.map((c) => {
    const [cor, rotulo] = NIVEL_SAUDE[c.saude] || NIVEL_SAUDE.nunca;
    return `<section class="cartao acomp ${cor}">
      <div class="linha entre"><h2 style="margin:0">${h(c.nome)}</h2><span class="selo-nivel ${cor}">${rotulo}</span></div>
      <div class="acomp-numeros">
        <div><b>${numero(c.publicados_mes)}</b><span>publicados no mês</span></div>
        <div><b>${numero(c.em_preparo)}</b><span>em preparo</span></div>
        ${equipe ? `<div><b>${c.perguntas == null ? "—" : numero(c.perguntas)}</b><span>${c.perguntas == null ? "perguntas: aguardando leitura" : "perguntas sem resposta"}</span></div>
          <div><b>${numero(c.pedidos_abertos)}</b><span>pedidos em aberto</span></div>` : ""}
      </div>
      ${c.atividades.length ? `<div class="pilha" style="gap:4px">${c.atividades.map((a) => `<div class="pequeno"><span class="suave">${tempoRelativo(a.criada_em)} · ${h(a.ator)}:</span> ${h(a.descricao)}</div>`).join("")}</div>`
        : '<p class="pequeno suave">Nenhuma atividade ainda.</p>'}
      <div class="linha" style="margin-top:10px">
        ${equipe ? `<button type="button" class="sec pequeno" data-acomp="${c.id}" data-rota="saude">Saúde</button>
          <button type="button" class="sec pequeno" data-acomp="${c.id}" data-rota="acompanhamento/${refAnterior}">Relatório</button>
          <button type="button" class="sec pequeno" data-acomp="${c.id}" data-rota="painel">Atividades</button>` : ""}
        ${c.saude_em ? `<span class="pequeno suave">saúde lida ${tempoRelativo(c.saude_em)}${c.demo_saude ? " · demonstração" : ""}</span>` : ""}</div>
    </section>`; }).join("") : `<div class="cartao">${vazio("coracao", "Nenhum cliente para acompanhar")}</div>`}</div>`;
  $$("[data-acomp]").forEach((b) => (b.onclick = () => entrarNoCliente(+b.dataset.acomp, b.dataset.rota)));
  $$("[data-aprovar]").forEach((b) => (b.onclick = () => comBotao(b, () => verAnuncio(+b.dataset.aprovar))));
}

function simularVenda(mes, depois) {
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const m = modal(`<h2>${ic("calculadora", "p")}Simular uma venda</h2>
    <p class="pequeno suave">Lança uma venda de teste com a data de hoje para ver como comissão, frete, impostos, custo e lucro são calculados.
      Ela aparece marcada como <b>simulada</b> e sai com "Apagar simulações". Nada é enviado ao marketplace.</p>
    ${mes !== mesAtual ? '<div class="aviso amarelo pequeno">A venda simulada entra no mês atual, não no mês que está aberto na tela.</div>' : ""}
    <form id="f-sim" class="pilha">
      <div class="grade g2">
        <div><label for="sv-sku">SKU do produto (opcional)</label><input id="sv-sku" maxlength="80" placeholder="usa o custo cadastrado"></div>
        <div><label for="sv-titulo">Título</label><input id="sv-titulo" maxlength="300" placeholder="Venda simulada"></div>
        <div><label for="sv-preco">Preço unitário (R$)</label><input id="sv-preco" type="number" min="0.01" step="0.01" required></div>
        <div><label for="sv-qtd">Quantidade</label><input id="sv-qtd" type="number" min="1" max="1000" value="1" required></div>
        <div><label for="sv-com">Comissão (%)</label><input id="sv-com" type="number" min="0" max="50" step="0.1" value="16"></div>
        <div><label for="sv-taxa">Taxa fixa por unidade (R$)</label><input id="sv-taxa" type="number" min="0" step="0.01" value="0"></div>
        <div><label for="sv-frete">Frete pago pelo vendedor (R$)</label><input id="sv-frete" type="number" min="0" step="0.01" value="0"></div>
        <div><label for="sv-uf">Estado do comprador</label><input id="sv-uf" maxlength="2" placeholder="SP"></div>
      </div>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button type="submit">Lançar simulação</button></div>
    </form>`);
  $("#f-sim", m).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-sim button[type=submit]", m), async () => {
      const n = (id) => Number($(id, m).value || 0);
      await api("/api/financeiro/simular", { method: "POST", body: { sku: $("#sv-sku", m).value.trim(), titulo: $("#sv-titulo", m).value.trim(),
        preco: n("#sv-preco"), quantidade: n("#sv-qtd") || 1, comissao_pct: n("#sv-com"), taxa_fixa: n("#sv-taxa"), frete: n("#sv-frete"),
        uf: $("#sv-uf", m).value.trim().toUpperCase() } });
      fecharModal();
      toast("Venda simulada lançada no mês atual.");
      if (mes === mesAtual) await depois(); else location.hash = "#/lucro/" + mesAtual;
    });
  };
}

const ACEITE_HTML = `<label class="aceite"><input type="checkbox" name="aceite_termos" value="true" required>
  <span>Li e aceito os <a href="#/termos" target="_blank" rel="noopener">Termos de Uso</a> e a
  <a href="#/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label>`;

function avisarCapsLock(raiz = document) {
  $$('input[type="password"]', raiz).forEach((campo) => {
    if (campo.dataset.caps) return;
    campo.dataset.caps = "1";
    const aviso = document.createElement("div");
    aviso.className = "pequeno aviso-texto caps-aviso";
    aviso.hidden = true;
    aviso.setAttribute("role", "status");
    aviso.textContent = "Caps Lock ligado: a senha diferencia maiúsculas de minúsculas.";
    (campo.closest(".campo-senha") || campo).insertAdjacentElement("afterend", aviso);
    const ver = (e) => { if (e.getModifierState) aviso.hidden = !e.getModifierState("CapsLock"); };
    campo.addEventListener("keydown", ver);
    campo.addEventListener("keyup", ver);
    campo.addEventListener("blur", () => (aviso.hidden = true));
  });
}

function rodapeLegal() {
  return `<p class="pequeno suave legal-links"><a href="#/privacidade">Política de Privacidade</a> · <a href="#/termos">Termos de Uso</a></p>`;
}

function formEsqueci(caixa) {
  const email = $("#le")?.value || "";
  caixa.insertAdjacentHTML("beforeend", "");
  $("#f-login").hidden = true;
  $("#google-login") && ($("#google-login").hidden = true);
  const html = `<form id="f-esqueci" class="pilha">
      <p class="pequeno suave" style="margin:0">Informe o e-mail do seu acesso. Se ele existir, mandamos um link para criar uma senha nova
        (vale por pouco tempo e só uma vez).</p>
      <div><label for="es-email">E-mail</label><input id="es-email" type="email" required autocomplete="email" value="${h(email)}"></div>
      <button type="submit">Enviar link</button>
      <div id="es-resposta" role="status"></div>
      <a href="#/entrar" class="pequeno" style="text-align:center" id="es-voltar">Voltar para Entrar</a></form>`;
  $("#f-login").insertAdjacentHTML("afterend", html);
  $("#es-email").focus();
  $("#es-voltar").onclick = (e) => { e.preventDefault(); telaEntrar(); };
  $("#f-esqueci").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-esqueci button[type=submit]"), async () => {
      const r = await api("/api/auth/esqueci", { method: "POST", body: { email: $("#es-email").value.trim() } });
      $("#es-resposta").innerHTML = `<div class="aviso azul pequeno">${h(r.mensagem)}</div>`;
    });
  };
}

function telaNovaSenha(token) {
  telaEntrar();
  $("#f-login").hidden = true;
  if ($("#google-login")) $("#google-login").hidden = true;
  $(".caixa h2").textContent = "Criar uma senha nova";
  $(".caixa h2 + .suave").textContent = "Escolha uma senha que você não usa em outro site.";
  $("#f-login").insertAdjacentHTML("afterend", `<form id="f-nova-senha" class="pilha">
      <div><label for="ns-senha">Senha nova (mín. 8 caracteres)</label><input id="ns-senha" type="password" minlength="8" required autocomplete="new-password"></div>
      <div><label for="ns-conf">Repita a senha nova</label><input id="ns-conf" type="password" minlength="8" required autocomplete="new-password"></div>
      <p class="pequeno suave" style="margin:0">Ao salvar, você entra no Replique e as sessões abertas em outros aparelhos são encerradas.</p>
      <button type="submit">Salvar e entrar</button>
      <a href="#/entrar" class="pequeno" style="text-align:center">Voltar para Entrar</a></form>`);
  avisarCapsLock($("#f-nova-senha"));
  document.title = "Senha nova · Replique";
  $("#ns-senha").focus();
  $("#f-nova-senha").onsubmit = (e) => {
    e.preventDefault();
    if ($("#ns-senha").value !== $("#ns-conf").value) return toast("As duas senhas não são iguais.", true);
    comBotao($("#f-nova-senha button[type=submit]"), async () => {
      const r = await api("/api/auth/nova-senha", { method: "POST", body: { token, senha: $("#ns-senha").value } });
      history.replaceState(null, "", "#/entrar");
      telaEntrar();
      $("#f-login").insertAdjacentHTML("beforebegin", `<div class="aviso azul pequeno">${h(r.mensagem)}</div>`);
    });
  };
}

async function telaLegal(tipo) {
  let i = {};
  try { i = await api("/api/publico/privacidade"); } catch {}
  const controlador = `${h(i.controlador || "Monvatti")}${i.documento ? `, inscrita sob o nº ${h(i.documento)}` : ""}`;
  const encarregado = i.encarregado_email
    ? `${h(i.encarregado || "Encarregado de dados")} — <a href="mailto:${h(i.encarregado_email)}">${h(i.encarregado_email)}</a>`
    : "a ser informado pelo controlador (canal de atendimento da sua agência)";
  const privacidade = `
    <h1>Política de Privacidade</h1><p class="suave">Versão ${h(i.versao || "")}</p>
    <h2>1. Quem trata os seus dados</h2>
    <p>O Replique é operado por ${controlador} (controladora, nos termos da Lei nº 13.709/2018, a LGPD). Encarregado pelo tratamento
      de dados pessoais: ${encarregado}.</p>
    <h2>2. Quais dados tratamos</h2>
    <ul><li><b>Cadastro:</b> nome, e-mail, foto (opcional) e senha, guardada só como resumo criptográfico (nunca a senha em si).</li>
      <li><b>Da loja:</b> nome e CNPJ ou CPF informados no cadastro.</li>
      <li><b>Contas dos marketplaces:</b> autorizações de acesso (tokens), guardadas criptografadas. A senha do marketplace nunca passa pelo Replique.</li>
      <li><b>Anúncios, fotos, pedidos e vendas</b> que a loja autoriza ler nos marketplaces (valores, taxas e estado de destino dos pedidos).</li>
      <li><b>Registros de acesso:</b> data, hora, endereço IP, porta e navegador de cada entrada, e o histórico do que cada pessoa fez no sistema.</li></ul>
    <h2>3. Para que usamos e com qual base legal</h2>
    <ul><li>Prestar o serviço contratado (criar, publicar e acompanhar anúncios): execução de contrato (LGPD, art. 7º, V).</li>
      <li>Guardar os registros de acesso por no mínimo 6 meses: obrigação legal (Marco Civil da Internet, Lei nº 12.965/2014, art. 15; LGPD, art. 7º, II).</li>
      <li>Segurança da conta, prevenção a fraudes e auditoria de quem fez o quê: legítimo interesse (LGPD, art. 7º, IX).</li>
      <li>Entrar com a conta Google, quando você escolhe essa opção: seu pedido e execução de contrato.</li></ul>
    <h2>4. Com quem compartilhamos</h2>
    <ul><li><b>Marketplaces</b> (Mercado Livre, Shopee, Amazon), pelas APIs oficiais e só com a autorização da loja.</li>
      <li><b>Provedores de inteligência artificial</b>${i.ia_texto || i.ia_imagem ? "" : " (quando ligados pelo administrador)"}: textos e fotos de anúncios
        enviados para gerar títulos, descrições e imagens. Esses provedores ficam fora do Brasil (transferência internacional, LGPD, art. 33).</li>
      <li><b>Hospedagem, banco de dados e envio de e-mail</b>, contratados para operar o serviço.</li>
      <li>Autoridades, quando houver ordem judicial ou obrigação legal.</li></ul>
    <p>Não vendemos dados pessoais e não usamos os seus dados para publicidade.</p>
    <h2>5. Por quanto tempo guardamos</h2>
    <p>Enquanto o contrato durar. Depois, pelo tempo exigido em lei: registros de acesso por no mínimo 6 meses e dados de vendas e
      financeiros pelos prazos fiscais. Encerrados os prazos, os dados podem ser eliminados ou anonimizados.</p>
    <h2>6. Seus direitos</h2>
    <p>Pela LGPD (art. 18) você pode pedir: confirmação de que tratamos seus dados, acesso a eles, correção, anonimização, bloqueio ou
      eliminação do que for desnecessário, portabilidade, informação sobre com quem compartilhamos e revisão de decisões automatizadas.
      No Replique, abra <b>Minha conta › Privacidade e dados</b> para baixar uma cópia dos seus dados ou fazer um pedido. Respondemos
      em até ${h(i.prazo_titular_dias || 15)} dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
    <h2>7. Segurança</h2>
    <p>Senhas com resumo criptográfico, credenciais dos marketplaces criptografadas, conexão HTTPS, limite de tentativas de login,
      encerramento de sessões e registro de atividades. Se houver um incidente de segurança que possa causar risco ou dano relevante,
      comunicaremos a ANPD e os titulares afetados no prazo da regulamentação (LGPD, art. 48).</p>
    <h2>8. Armazenamento no navegador</h2>
    <p>O Replique guarda no seu navegador só o necessário para funcionar: a sessão de acesso e preferências da tela (tema, menu,
      filtros). Não usamos cookies de publicidade nem de rastreamento.</p>
    <h2>9. Crianças e adolescentes</h2><p>O Replique é uma ferramenta profissional e não se destina a menores de 18 anos.</p>
    <h2>10. Mudanças</h2><p>Quando esta política mudar, a versão acima muda e pedimos o seu aceite de novo ao entrar.</p>`;
  const termos = `
    <h1>Termos de Uso</h1><p class="suave">Versão ${h(i.versao || "")}</p>
    <h2>1. O serviço</h2>
    <p>O Replique, operado por ${controlador}, é uma ferramenta para pesquisar, criar, publicar e acompanhar anúncios em marketplaces,
      usada pela agência e pelos lojistas que ela atende.</p>
    <h2>2. Acesso</h2>
    <p>Cada pessoa tem o próprio acesso, pessoal e intransferível. Você é responsável por guardar a sua senha e por avisar a sua
      agência se suspeitar de uso indevido (em Minha conta é possível sair de todos os aparelhos).</p>
    <h2>3. Conteúdo publicado</h2>
    <p>Quem publica é responsável pelo conteúdo dos anúncios (textos, fotos, marcas, preços e características) e por respeitar as regras
      de cada marketplace, os direitos autorais e de marca de terceiros e o Código de Defesa do Consumidor. O Replique avisa quando um
      anúncio parece cópia de outro vendedor, mas não substitui essa conferência.</p>
    <h2>4. Inteligência artificial</h2>
    <p>Textos e imagens gerados por IA são sugestões. Confira se estão corretos e se o produto continua idêntico antes de publicar.</p>
    <h2>5. Dados dos marketplaces</h2>
    <p>Os números vêm das APIs oficiais. Quando a API não entrega um dado, a tela diz isso em vez de estimar. Telas em modo de
      demonstração são identificadas e não representam a sua loja.</p>
    <h2>6. Disponibilidade</h2>
    <p>O serviço pode ficar indisponível para manutenção ou por falhas de terceiros (marketplaces, hospedagem). Mudanças nas APIs dos
      marketplaces podem limitar funções.</p>
    <h2>7. Suspensão</h2>
    <p>O acesso pode ser suspenso em caso de uso indevido, risco à segurança ou fim do contrato. Os dados são tratados conforme a
      Política de Privacidade.</p>
    <h2>8. Privacidade</h2><p>O tratamento de dados pessoais segue a <a href="#/privacidade">Política de Privacidade</a>.</p>
    <h2>9. Lei aplicável</h2><p>Estes termos seguem as leis do Brasil.</p>`;
  $("#app").innerHTML = `<div class="pagina-legal"><div class="legal-topo">${MARCA("Replique")}${botaoTema()}</div>
    <article class="cartao legal-texto">${tipo === "termos" ? termos : privacidade}</article>
    <p class="pequeno suave" style="text-align:center"><a href="#/${tipo === "termos" ? "privacidade" : "termos"}">${tipo === "termos" ? "Política de Privacidade" : "Termos de Uso"}</a> ·
      <a href="#/">Voltar ao Replique</a></p></div>`;
  sincronizarTema();
  document.title = `${tipo === "termos" ? "Termos de Uso" : "Política de Privacidade"} · Replique`;
  window.scrollTo({ top: 0 });
}

function pedirAceite() {
  const u = estado.usuario;
  if (!u?.termos_pendentes || $("#modal-aceite")) return;
  const m = modal(`<div id="modal-aceite"><h2>${ic("escudo", "p")}Termos de Uso e Política de Privacidade</h2>
    <p>Para continuar usando o Replique, confira e aceite a versão ${h(u.termos_versao)} dos
      <a href="#/termos" target="_blank" rel="noopener">Termos de Uso</a> e da <a href="#/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</p>
    <p class="pequeno suave">Eles explicam quais dados o Replique trata, para quê, com quem compartilha e como você pede uma cópia ou a exclusão.</p>
    <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="ac-sair">Sair</button>
      <button type="button" id="ac-aceitar">Li e aceito</button></div></div>`);
  $(".modal-x", m)?.remove();
  $("#modal").dataset.travado = "1";
  $("#ac-sair", m).onclick = () => { delete $("#modal").dataset.travado; fecharModal(); $("#sair")?.click(); };
  $("#ac-aceitar", m).onclick = () => comBotao($("#ac-aceitar", m), async () => {
    await api("/api/me/aceite", { method: "POST" });
    u.termos_pendentes = false;
    delete $("#modal").dataset.travado;
    fecharModal();
    toast("Obrigado. Aceite registrado.");
  });
}

async function privacidadeMinhaConta(alvo) {
  alvo.innerHTML = `<h3 style="margin-top:18px">${ic("escudo", "p")}Privacidade e dados</h3>
    <p class="pequeno suave">Pela LGPD você pode ter uma cópia dos seus dados e pedir correção ou exclusão. Pedidos são respondidos pela
      sua agência no prazo da lei. Registros de acesso são guardados por pelo menos 6 meses por exigência do Marco Civil da Internet.</p>
    <div class="linha"><button type="button" class="sec pequeno" id="pv-baixar">${ic("baixar", "p")}Baixar meus dados</button>
      <button type="button" class="sec pequeno" id="pv-acessos">${ic("relogio", "p")}Meus últimos acessos</button>
      <button type="button" class="sec pequeno" id="pv-pedido">${ic("envelope", "p")}Fazer um pedido</button>
      <a class="pequeno" href="#/privacidade" target="_blank" rel="noopener">Política de Privacidade</a></div>
    <div id="pv-extra" style="margin-top:8px"></div>`;
  $("#pv-baixar").onclick = () => comBotao($("#pv-baixar"), async () => {
    const r = await fetch("/api/me/dados");
    if (!r.ok) throw new Error("Não consegui gerar a cópia agora.");
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: "meus-dados-replique.json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  $("#pv-acessos").onclick = () => comBotao($("#pv-acessos"), async () => {
    const lista = await api("/api/me/acessos");
    $("#pv-extra").innerHTML = lista.length ? `<div class="tabela embutida"><table><thead><tr><th>Quando</th><th>O quê</th><th>IP</th></tr></thead><tbody>
      ${lista.map((a) => `<tr class="${a.sucesso ? "" : "ruim"}"><td class="pequeno">${data(a.criado_em)}</td><td class="pequeno">${h(a.evento_nome)}</td>
        <td class="pequeno" title="${h(a.navegador)}">${h(a.ip)}</td></tr>`).join("")}</tbody></table></div>
      <p class="pequeno suave">Não reconhece algum? Troque a senha e use "Sair de todos os aparelhos".</p>` : '<p class="pequeno suave">Nenhum acesso registrado ainda.</p>';
  });
  $("#pv-pedido").onclick = () => {
    $("#pv-extra").innerHTML = `<form id="pv-form" class="pilha" style="gap:8px">
      <div><label for="pv-tipo">O que você quer</label><select id="pv-tipo"><option value="exclusao">Excluir os meus dados</option>
        <option value="correcao">Corrigir os meus dados</option><option value="acesso">Receber uma cópia completa</option>
        <option value="oposicao">Me opor a um tratamento</option></select></div>
      <div><label for="pv-det">Detalhes (opcional)</label><textarea id="pv-det" maxlength="2000" rows="3"></textarea></div>
      <p class="pequeno suave" style="margin:0">A exclusão é analisada pela sua agência: há dados que a lei manda guardar (registros de acesso e dados fiscais).</p>
      <div class="linha" style="justify-content:flex-end"><button type="submit" class="pequeno">Enviar pedido</button></div></form>`;
    $("#pv-form").onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#pv-form button[type=submit]"), async () => {
        const r = await api("/api/me/pedido-titular", { method: "POST", body: { tipo: $("#pv-tipo").value, detalhes: $("#pv-det").value } });
        $("#pv-extra").innerHTML = `<div class="aviso azul pequeno">Pedido registrado. A resposta chega no sino em até ${r.prazo_dias} dias.</div>`;
      });
    };
  };
}

async function carregarSecaoLgpd() {
  const alvo = $("#sec-lgpd");
  if (!alvo) return;
  const [pedidos, acessosLista, info] = await Promise.all([api("/api/empresa/pedidos-titular"), api("/api/empresa/acessos"), api("/api/publico/privacidade")]);
  const falhas = acessosLista.filter((a) => !a.sucesso).length;
  alvo.innerHTML = `<h2>${ic("escudo", "p")}Privacidade (LGPD) e registro de acessos</h2>
    ${!info.encarregado_email ? `<div class="aviso amarelo pequeno">Falta informar o encarregado de dados (ENCARREGADO_NOME e ENCARREGADO_EMAIL no .env) e,
      se quiser, o CNPJ (CONTROLADOR_DOCUMENTO). Eles aparecem na Política de Privacidade.</div>` : ""}
    <div class="aviso azul pequeno">A Política de Privacidade e os Termos de Uso do Replique são um modelo: revise com um advogado antes de usar com clientes.
      Ao mudar o texto, troque TERMOS_VERSAO no .env para pedir um novo aceite a todos.</div>
    <h3>Pedidos dos titulares</h3>
    ${pedidos.length ? pedidos.map((p) => `<div class="lista-item"><div class="info"><b>${h(p.tipo_nome)} · ${h(p.usuario)}</b>
        <span class="pequeno suave">${data(p.criado_em)} · responder até ${data(p.prazo)}${p.detalhes ? ` · “${h(p.detalhes)}”` : ""}</span>
        ${p.resposta ? `<span class="pequeno">Resposta: ${h(p.resposta)}</span>` : ""}</div>
        ${p.status === "aberto" ? `${p.vencido ? '<span class="selo erro">prazo vencido</span>' : '<span class="selo demo">aberto</span>'}
          <button type="button" class="sec pequeno" data-responder-titular="${p.id}">Responder</button>` : '<span class="selo ok">respondido</span>'}</div>`).join("")
      : '<p class="pequeno suave">Nenhum pedido.</p>'}
    <h3 style="margin-top:16px">Registro de acessos <span class="suave pequeno">(Marco Civil: guardado por pelo menos 6 meses)</span></h3>
    <div class="linha" style="margin-bottom:8px"><span class="pequeno suave">${acessosLista.length} mais recentes · ${falhas} senha(s) errada(s)</span></div>
    <div class="tabela embutida" style="max-height:320px;overflow:auto"><table><thead><tr><th>Quando</th><th>Pessoa</th><th>O quê</th><th>IP</th></tr></thead><tbody>
      ${acessosLista.slice(0, 100).map((a) => `<tr class="${a.sucesso ? "" : "ruim"}"><td class="pequeno">${data(a.criado_em)}</td>
        <td class="pequeno">${h(a.usuario || a.email)}</td><td class="pequeno">${h(a.evento_nome)}</td>
        <td class="pequeno" title="${h(a.navegador)}">${h(a.ip)}</td></tr>`).join("")}</tbody></table></div>`;
  $$("[data-responder-titular]", alvo).forEach((b) => (b.onclick = () => {
    const m = modal(`<h2>Responder pedido LGPD</h2>
      <p class="pequeno suave">Explique o que foi feito (ex.: acesso desativado, dados corrigidos) e o que precisa ser guardado por lei.
        Para desativar um acesso, use Equipe ou Clientes › Gerenciar: o Replique não apaga dados sozinho.</p>
      <textarea id="rt-texto" rows="5" maxlength="2000"></textarea>
      <div class="linha" style="justify-content:flex-end;margin-top:10px"><button class="sec" data-fechar>Cancelar</button><button id="rt-enviar">Enviar resposta</button></div>`);
    $("#rt-enviar", m).onclick = () => comBotao($("#rt-enviar", m), async () => {
      await api(`/api/empresa/pedidos-titular/${b.dataset.responderTitular}/atendido`, { method: "POST", body: { resposta: $("#rt-texto", m).value } });
      fecharModal();
      toast("Resposta enviada ao titular.");
      carregarSecaoLgpd();
    });
  }));
}

async function guardarSessao(r) {
  if (r.precisa_2fa) return pedirCodigo2fa(r.desafio);
  const ok = await fetch("/api/auth/cookie", { method: "POST", headers: { Authorization: "Bearer " + r.token, "X-Replique": "1" } });
  try { localStorage.removeItem("rpq_token"); } catch {}
  if (!ok.ok) throw new Error("Não consegui abrir a sessão. Tente de novo.");
  _ultimaRenovacao = Date.now();
  return true;
}

function pedirCodigo2fa(desafio) {
  return new Promise((resolver, rejeitar) => {
    const m = modal(`<h2>${ic("escudo", "p")}Verificação em duas etapas</h2>
      <p class="pequeno suave">Digite o código de 6 números do app autenticador. Sem o celular? Use um dos códigos de recuperação.</p>
      <form id="f-2fa" class="pilha">
        <div><label for="c2-codigo">Código</label><input id="c2-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="20" required></div>
        <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="c2-cancelar">Cancelar</button><button type="submit">Entrar</button></div>
      </form>`);
    $("#c2-codigo", m).focus();
    $("#c2-cancelar", m).onclick = () => { fecharModal(); rejeitar(new Error("Entrada cancelada.")); };
    $("#f-2fa", m).onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#f-2fa button[type=submit]", m), async () => {
        const r = await api("/api/auth/2fa", { method: "POST", body: { desafio, codigo: $("#c2-codigo", m).value } });
        fecharModal();
        await guardarSessao(r);
        resolver(true);
      });
    };
  });
}

async function sessaoAtual() {
  try {
    const antigo = localStorage.getItem("rpq_token");
    if (antigo) await guardarSessao({ token: antigo }).catch(() => localStorage.removeItem("rpq_token"));
  } catch {}
  const r = await fetch("/api/me").catch(() => null);
  return r?.ok ? r.json() : null;
}

async function encerrarSessaoLocal() {
  await fetch("/api/auth/sair", { method: "POST", headers: { "X-Replique": "1" } }).catch(() => {});
  try { localStorage.removeItem("rpq_token"); sessionStorage.removeItem("rpq_cliente"); } catch {}
}

let _ultimaAtividade = Date.now();
let _ultimaRenovacao = Date.now();
["click", "keydown", "touchstart", "scroll"].forEach((ev) => document.addEventListener(ev, () => { _ultimaAtividade = Date.now(); }, { passive: true, capture: true }));
setInterval(async () => {
  if (!estado.usuario) return;
  const janela = (estado.usuario.inatividade_min || 120) * 60000;
  if (Date.now() - _ultimaAtividade < janela / 2 && Date.now() - _ultimaRenovacao > Math.min(5 * 60000, janela / 4)) {
    try { await api("/api/auth/renovar", { method: "POST" }); _ultimaRenovacao = Date.now(); } catch {}
  }
}, 60000);

async function doisFatoresMinhaConta(alvo) {
  const s = await api("/api/me/2fa").catch(() => null);
  if (!s) return;
  alvo.innerHTML = `<h3 style="margin-top:18px">${ic("escudo", "p")}Verificação em duas etapas</h3>
    <p class="pequeno suave">Além da senha, a entrada pede um código do app autenticador do celular (Google Authenticator, Microsoft Authenticator, Authy…).
      Mesmo que alguém descubra a sua senha, não entra.${s.exigido ? " <b>A sua agência exige para a equipe.</b>" : ""}</p>
    ${s.ativo ? `<div class="linha"><span class="selo ok">ligada</span><span class="pequeno suave">${s.codigos_restantes} código(s) de recuperação restantes</span>
        <button type="button" class="sec pequeno" id="d2-codigos">Gerar novos códigos</button>
        ${s.exigido ? "" : '<button type="button" class="sec pequeno perigo-txt" id="d2-desligar">Desligar</button>'}</div>`
      : `<button type="button" class="pequeno" id="d2-ligar">${ic("escudo", "p")}Ligar verificação em duas etapas</button>`}
    <div id="d2-passos" style="margin-top:8px"></div>`;
  const passos = $("#d2-passos", alvo);
  const pedirSenha = (rotulo, depois) => {
    passos.innerHTML = `<form id="d2-f-senha" class="linha" style="align-items:flex-end"><div style="flex:1;min-width:180px">
      <label for="d2-senha">Confirme a sua senha</label><input id="d2-senha" type="password" required autocomplete="current-password"></div>
      <button type="submit" class="pequeno">${rotulo}</button></form>`;
    $("#d2-senha", passos).focus();
    $("#d2-f-senha", passos).onsubmit = (e) => { e.preventDefault(); comBotao($("#d2-f-senha button", passos), () => depois($("#d2-senha", passos).value)); };
  };
  const mostrarCodigos = (codigos) => {
    passos.innerHTML = `<div class="aviso azul"><b>Guarde estes códigos de recuperação</b> num lugar seguro. Cada um entra uma vez se você perder o celular.
      Eles não aparecem de novo.<pre class="mono codigos-rec">${codigos.map(h).join("\n")}</pre>
      <button type="button" class="sec pequeno" id="d2-copiar">${ic("copiar", "p")}Copiar</button></div>`;
    $("#d2-copiar", passos).onclick = () => navigator.clipboard?.writeText(codigos.join("\n")).then(() => toast("Códigos copiados."));
  };
  if ($("#d2-ligar", alvo)) $("#d2-ligar", alvo).onclick = () => pedirSenha("Continuar", async (senha) => {
    const r = await api("/api/me/2fa/iniciar", { method: "POST", body: { senha } });
    passos.innerHTML = `<ol class="pequeno lista-dicas">
        <li>No celular, abra o app autenticador e escolha <b>adicionar conta › inserir chave</b> (ou toque no link abaixo se estiver no celular).</li>
        <li>Nome da conta: Replique. Chave: <code class="mono">${h(r.segredo)}</code> (baseada em tempo).</li>
        <li>Digite o código de 6 números que aparecer.</li></ol>
      <p class="pequeno"><a href="${h(r.uri)}">Abrir no app autenticador deste aparelho</a></p>
      <form id="d2-f-codigo" class="linha" style="align-items:flex-end"><div style="flex:1;min-width:140px"><label for="d2-codigo">Código do app</label>
        <input id="d2-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
        <button type="submit" class="pequeno">Ligar</button></form>`;
    $("#d2-codigo", passos).focus();
    $("#d2-f-codigo", passos).onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#d2-f-codigo button", passos), async () => {
        const a = await api("/api/me/2fa/ativar", { method: "POST", body: { codigo: $("#d2-codigo", passos).value } });
        estado.usuario.dois_fatores = true;
        estado.usuario.precisa_2fa = false;
        toast("Verificação em duas etapas ligada.");
        await doisFatoresMinhaConta(alvo);
        mostrarCodigos(a.codigos_recuperacao);
        $("#d2-passos", alvo).replaceWith(passos);
      });
    };
  });
  if ($("#d2-codigos", alvo)) $("#d2-codigos", alvo).onclick = () => pedirSenha("Gerar", async (senha) => {
    mostrarCodigos((await api("/api/me/2fa/codigos", { method: "POST", body: { senha } })).codigos_recuperacao);
  });
  if ($("#d2-desligar", alvo)) $("#d2-desligar", alvo).onclick = () => {
    passos.innerHTML = `<form id="d2-f-desligar" class="pilha" style="gap:8px"><div class="grade g2">
        <div><label for="d2-s">Senha</label><input id="d2-s" type="password" required autocomplete="current-password"></div>
        <div><label for="d2-c">Código do app</label><input id="d2-c" inputmode="numeric" maxlength="20" required></div></div>
      <div class="linha" style="justify-content:flex-end"><button type="submit" class="pequeno perigo-txt">Desligar</button></div></form>`;
    $("#d2-f-desligar", passos).onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#d2-f-desligar button", passos), async () => {
        const r = await api("/api/me/2fa/desligar", { method: "POST", body: { senha: $("#d2-s", passos).value, codigo: $("#d2-c", passos).value } });
        await guardarSessao(r);
        estado.usuario.dois_fatores = false;
        toast("Verificação em duas etapas desligada.");
        doisFatoresMinhaConta(alvo);
      });
    };
  };
}

function exigirConfigurar2fa() {
  const u = estado.usuario;
  if (!u?.precisa_2fa || u.termos_pendentes || $("#modal-2fa")) return;
  const m = modal(`<div id="modal-2fa"><h2>${ic("escudo", "p")}Configure a verificação em duas etapas</h2>
    <p>A sua agência passou a exigir, para a equipe, um código do app autenticador além da senha. Leva um minuto.</p>
    <div id="m2-area"></div>
    <div class="linha" style="justify-content:flex-end;margin-top:10px"><button type="button" class="sec" id="m2-sair">Sair</button></div></div>`);
  $(".modal-x", m)?.remove();
  $("#modal").dataset.travado = "1";
  $("#m2-sair", m).onclick = () => { delete $("#modal").dataset.travado; fecharModal(); $("#sair")?.click(); };
  doisFatoresMinhaConta($("#m2-area", m)).then(() => {
    const ver = setInterval(() => {
      if (!estado.usuario?.precisa_2fa) {
        clearInterval(ver);
        const fim = $("#m2-sair", m);
        if (fim) { fim.textContent = "Concluir"; fim.onclick = () => { delete $("#modal").dataset.travado; fecharModal(); roteador(); }; }
      }
    }, 500);
  });
}

async function carregarSecaoSeguranca() {
  const alvo = $("#sec-seguranca");
  if (!alvo) return;
  const s = await api("/api/empresa/seguranca");
  const sem = s.pessoas.filter((p) => p.papel !== "cliente" && !p.dois_fatores);
  alvo.innerHTML = `<h2>${ic("chave", "p")}Segurança dos acessos</h2>
    <p class="pequeno suave">Sessão: encerra depois de ${s.inatividade_min} min sem uso e no máximo ${s.sessao_horas} h depois da entrada.
      Senhas comuns, sequências e palavras do nome ou do e-mail são recusadas. Para trocar a senha de alguém, gere um link: o administrador não escolhe senha.</p>
    <label class="confirmacao"><input type="checkbox" id="sg-exigir" ${s.exigir_2fa ? "checked" : ""}>
      <span><b>Exigir verificação em duas etapas para a equipe</b> <span class="pequeno suave">(admin, operador e consultor; lojistas podem ligar se quiserem).
      ${sem.length ? `${sem.length} pessoa(s) da equipe ainda sem: ${sem.slice(0, 6).map((p) => h(p.nome)).join(", ")}${sem.length > 6 ? "…" : ""}.` : "Toda a equipe já usa."}</span></span></label>`;
  $("#sg-exigir", alvo).onchange = (e) => comBotao(e.target, async () => {
    try { await api("/api/empresa/seguranca", { method: "PUT", body: { exigir_2fa: e.target.checked } }); toast("Configuração salva."); }
    catch (err) { e.target.checked = !e.target.checked; throw err; }
  });
}

async function carregarSecaoExtensao() {
  const alvo = $("#sec-extensao");
  if (!alvo) return;
  const s = await api("/api/extensao/admin");
  alvo.innerHTML = `<h2>${ic("pesquisar", "p")}Extensão Monvatti Pro</h2>
    <p class="pequeno suave">Extensão do Chrome para estudar anúncios no Mercado Livre e levar um anúncio para o Replique.
      Só funciona para quem estiver liberado aqui, em um navegador por pessoa, e só com o navegador logado numa conta de estudo
      (ou deslogado). Logado numa conta de cliente, ela fica bloqueada.</p>
    <p class="pequeno"><b>Contas de estudo:</b> ${s.estudo.length ? s.estudo.map((c) => `${h(c.nome)} ${c.conta_ml ? `<span class="selo ok">${h(c.conta_ml)}</span>`
      : '<span class="selo erro">ML não conectado</span>'}`).join(" · ") : '<span class="aviso-texto">nenhuma. Em Clientes › Gerenciar, marque um cliente interno como “Cliente interno de estudo” e conecte a conta do ML dele.</span>'}</p>
    <div class="tabela" style="margin:0 -20px -20px"><table><thead><tr><th>Pessoa</th><th>Liberada</th><th>Navegador ligado</th><th></th></tr></thead><tbody>
      ${s.pessoas.map((p) => `<tr class="${p.ativo ? "" : "inativo"}"><td><b>${h(p.nome)}</b><div class="pequeno suave">${h(p.email)}</div></td>
        <td><label class="confirmacao" style="margin:0"><input type="checkbox" data-ext-liberar="${p.id}" ${p.liberada ? "checked" : ""} ${p.ativo ? "" : "disabled"}> ${p.liberada ? "sim" : "não"}</label></td>
        <td class="pequeno">${p.navegador ? `${h(p.navegador.nome || "Chrome")}<div class="suave">desde ${data(p.navegador.desde)}${p.navegador.ultimo_uso ? ` · último uso ${data(p.navegador.ultimo_uso)}` : ""}</div>`
          : '<span class="suave">nenhum</span>'}</td>
        <td style="text-align:right;white-space:nowrap">${p.liberada && !p.navegador ? `<button class="sec pequeno" data-ext-codigo="${p.id}" data-nome="${h(p.nome)}">Gerar código</button>` : ""}
          ${p.navegador ? `<button class="sec pequeno perigo-txt" data-ext-desligar="${p.navegador.id}" data-nome="${h(p.nome)}">Desligar navegador</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
  $$("[data-ext-liberar]", alvo).forEach((i) => (i.onchange = () => comBotao(i, async () => {
    await api("/api/extensao/admin/usuarios/" + i.dataset.extLiberar, { method: "PUT", body: { liberada: i.checked } });
    toast(i.checked ? "Extensão liberada. Gere o código para ligar o navegador." : "Extensão bloqueada e navegador desligado.");
    carregarSecaoExtensao();
  })));
  $$("[data-ext-desligar]", alvo).forEach((b) => (b.onclick = () => {
    if (!confirm(`Desligar o navegador de ${b.dataset.nome}? A extensão para de funcionar nele até um novo código.`)) return;
    comBotao(b, async () => {
      await api("/api/extensao/admin/dispositivos/" + b.dataset.extDesligar, { method: "DELETE" });
      toast("Navegador desligado.");
      carregarSecaoExtensao();
    });
  }));
  $$("[data-ext-codigo]", alvo).forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const r = await api(`/api/extensao/admin/usuarios/${b.dataset.extCodigo}/codigo`, { method: "POST" });
    modal(`<h2>${ic("chave", "p")}Código da extensão para ${h(b.dataset.nome)}</h2>
      <p class="pequeno">Na extensão, clique no ícone da Monvatti e cole este código. Vale ${r.validade_min} minutos.
        O primeiro navegador que usar o código fica ligado a esta pessoa; outro navegador só depois que você desligar este.</p>
      <pre class="mono" style="white-space:pre-wrap;word-break:break-all">${h(r.codigo)}</pre>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="ext-copiar">${ic("copiar", "p")}Copiar</button><button data-fechar>Fechar</button></div>`);
    $("#ext-copiar").onclick = () => navigator.clipboard?.writeText(r.codigo).then(() => toast("Código copiado."));
  })));
}

async function linkDeSenha(id, nome) {
  if (!confirm(`Gerar um link para ${nome} criar uma senha nova? A senha atual continua valendo até a pessoa usar o link.`)) return;
  const r = await api(`/api/empresa/usuarios/${id}/link-senha`, { method: "POST" });
  modal(`<h2>${ic("chave", "p")}Link de senha para ${h(nome)}</h2>
    <p class="pequeno">${r.enviado ? "Enviamos o link por e-mail." : `Não foi enviado por e-mail (${h(r.motivo)}). Copie e mande por um canal seguro.`}
      Vale ${r.validade_min} minutos e uma vez só.</p>
    <pre class="mono" style="white-space:pre-wrap;word-break:break-all">${h(r.link)}</pre>
    <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="ls-copiar">${ic("copiar", "p")}Copiar</button><button data-fechar>Fechar</button></div>`);
  $("#ls-copiar").onclick = () => navigator.clipboard?.writeText(r.link).then(() => toast("Link copiado."));
}

roteador();
