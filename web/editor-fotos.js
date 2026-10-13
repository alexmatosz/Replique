const EF_CORES = ["#0b50f5", "#0b0f1a", "#ffffff", "#e11d2e", "#16a34a", "#ffd600", "#f97316"];
const EF_TAMANHOS = [["1200x1200", "1200 × 1200 · Mercado Livre e Shopee"], ["1000x1000", "1000 × 1000 · Amazon"],
  ["1080x1080", "1080 × 1080 · redes sociais"], ["1080x1350", "1080 × 1350 · vertical"], ["800x800", "800 × 800"], ["livre", "Personalizado"]];
const EF_FERRAMENTAS = [["selecionar", "ponteiro", "Selecionar e mover (V)"], ["texto", "texto", "Texto (T)"],
  ["pincel", "pincel", "Pincel: desenhar à mão livre (B)"], ["marcador", "marcador", "Marca-texto (M)"], ["borracha", "borracha", "Borracha (E)"],
  ["linha", "linha", "Linha reta: riscar (L)"], ["seta", "seta", "Seta (A)"], ["retangulo", "quadrado", "Retângulo (R)"], ["circulo", "circulo", "Círculo (C)"],
  ["selo", "etiqueta", "Selo (S)"], ["varinha", "magica", "Tirar fundo clicando na cor (W)"], ["imagem", "imagem", "Inserir ou colar imagem (I)"]];
const EF_ATALHOS = { v: "selecionar", t: "texto", b: "pincel", m: "marcador", e: "borracha", l: "linha", a: "seta", r: "retangulo",
  c: "circulo", s: "selo", w: "varinha", i: "imagem" };
const EF_DESENHO = ["pincel", "marcador", "borracha"];
const EF_FONTES = [["Inter", '"Inter", "Segoe UI", Arial, sans-serif'], ["Arial", "Arial, Helvetica, sans-serif"],
  ["Impact", "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif"], ["Georgia", "Georgia, 'Times New Roman', serif"],
  ["Courier", "'Courier New', Courier, monospace"], ["Trebuchet", "'Trebuchet MS', sans-serif"]];
const EF_FONTE = EF_FONTES[0][1];

const ef = { W: 1200, H: 1200, fundo: "#ffffff", objetos: [], sel: -1, ferramenta: "selecionar", hist: [], pos: -1,
  cache: new Map(), opcoes: null, sujo: false, arrasto: null, escala: 1, timerHist: 0,
  pincel: { cor: "#e11d2e", espessura: 12 }, marcador: { cor: "#ffd600", espessura: 40 }, borracha: { espessura: 40 }, tolerancia: 32 };

function efImagem(src) {
  if (ef.cache.has(src)) return ef.cache.get(src);
  const p = new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error("Não consegui abrir a imagem."));
    img.src = src;
  });
  p.then((img) => (p.img = img)).catch(() => {});
  ef.cache.set(src, p);
  return p;
}

async function efSrcLocal(url) {
  if (/^(\/uploads\/|data:image\/|blob:)/.test(url)) return url;
  const r = await api("/api/uploads/importar", { method: "POST", body: { url } });
  return r.url;
}

function efLerArquivo(arquivo) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(leitor.result);
    leitor.onerror = () => falha(new Error("Não consegui ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

async function abrirEditorFotos(opcoes = {}) {
  ef.opcoes = opcoes;
  Object.assign(ef, { W: 1200, H: 1200, fundo: "#ffffff", objetos: [], sel: -1, ferramenta: "selecionar", hist: [], pos: -1, sujo: false });
  efMontar();
  document.fonts?.load(`800 40px Inter`).then(efDesenhar).catch(() => {});
  if (opcoes.url) {
    $("#ef-palco").classList.add("carregando-foto");
    try {
      const src = await efSrcLocal(opcoes.url);
      const img = await efImagem(src);
      if (opcoes.tamanhoOriginal) { ef.W = img.naturalWidth; ef.H = img.naturalHeight; }
      ef.objetos.push({ tipo: "imagem", src, ...efEncaixar(img, "conter") });
    } catch (e) {
      toast(e.message, true);
    }
    $("#ef-palco").classList.remove("carregando-foto");
  }
  efHistorico(true);
  efAjustarPalco();
  efPainel();
}

function efMontar() {
  let raiz = $("#editor-foto");
  if (!raiz) {
    document.body.insertAdjacentHTML("beforeend", `<div id="editor-foto" class="ef" role="dialog" aria-modal="true" aria-label="Editor de fotos" hidden></div>`);
    raiz = $("#editor-foto");
    new ResizeObserver(() => !raiz.hidden && efAjustarPalco()).observe(raiz);
    window.addEventListener("keydown", efTeclado, true);
    window.addEventListener("paste", efColar);
  }
  const salvar = ef.opcoes.modos || ["nova"];
  raiz.innerHTML = `
    <header class="ef-topo">
      <div class="linha" style="gap:10px;flex-wrap:nowrap;min-width:0">
        <img src="/static/monvatti-v.png" alt="" width="26" height="26">
        <div style="min-width:0"><b>Editor de fotos</b><div class="pequeno suave ef-sub">${h(ef.opcoes.titulo || "Monte a imagem do anúncio")}</div></div></div>
      <div class="linha ef-acoes-topo">
        <button type="button" class="icone" data-ef="desfazer" title="Desfazer (Ctrl+Z)" aria-label="Desfazer">${ic("desfazer")}</button>
        <button type="button" class="icone" data-ef="refazer" title="Refazer (Ctrl+Y)" aria-label="Refazer">${ic("refazer")}</button>
        <span class="ef-divisor"></span>
        <button type="button" class="sec" data-ef="baixar" title="Baixar a imagem no computador">${ic("baixar", "p")}Baixar</button>
        ${salvar.includes("nova") ? `<button type="button" class="${salvar.includes("substituir") ? "sec" : ""}" data-ef="salvar-nova">${ic("mais", "p")}${salvar.includes("substituir") ? "Salvar como nova" : "Salvar no anúncio"}</button>` : ""}
        ${salvar.includes("substituir") ? `<button type="button" data-ef="salvar-substituir">${ic("salvar", "p")}Salvar</button>` : ""}
        <button type="button" class="icone" data-ef="fechar" title="Fechar (Esc)" aria-label="Fechar editor">${ic("x")}</button>
      </div>
    </header>
    <div class="ef-corpo">
      <nav class="ef-ferramentas" aria-label="Ferramentas">${EF_FERRAMENTAS.map(([k, icone, nome]) =>
        `<button type="button" class="icone" data-ferramenta="${k}" title="${nome}" aria-label="${nome}">${ic(icone)}</button>`).join("")}</nav>
      <div class="ef-palco" id="ef-palco"><canvas id="ef-canvas"></canvas><div class="ef-soltar" id="ef-soltar" hidden>Solte a imagem para inserir</div></div>
      <aside class="ef-painel" id="ef-painel"></aside>
    </div>
    <input type="file" id="ef-arquivo" accept="image/jpeg,image/png,image/webp" multiple hidden>`;
  raiz.hidden = false;
  document.body.classList.add("sem-rolagem");
  raiz.onclick = efCliqueTopo;
  const canvas = $("#ef-canvas");
  canvas.onpointerdown = efApertar;
  canvas.onpointermove = efMover;
  canvas.onpointerup = canvas.onpointercancel = efSoltar;
  canvas.ondblclick = (e) => {
    const o = ef.objetos[efAcerto(efPonto(e))];
    if (o && ["texto", "selo"].includes(o.tipo)) setTimeout(() => $("#ef-painel [data-prop=texto]")?.select(), 0);
  };
  const palco = $("#ef-palco");
  palco.ondragover = (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) { e.preventDefault(); $("#ef-soltar").hidden = false; } };
  palco.ondragleave = (e) => { if (!palco.contains(e.relatedTarget)) $("#ef-soltar").hidden = true; };
  palco.ondrop = async (e) => {
    e.preventDefault();
    $("#ef-soltar").hidden = true;
    for (const arq of [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"))) await efInserirImagem(URL.createObjectURL(arq));
  };
  $("#ef-arquivo").onchange = async (e) => {
    const arquivos = [...e.target.files];
    e.target.value = "";
    for (const arq of arquivos) await efInserirImagem(URL.createObjectURL(arq));
  };
  efFerramenta("selecionar");
}

async function efColar(e) {
  const raiz = $("#editor-foto");
  if (!raiz || raiz.hidden || e.target.closest?.("input, textarea")) return;
  const imagens = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/"));
  if (imagens.length) {
    e.preventDefault();
    for (const item of imagens) await efInserirImagem(URL.createObjectURL(item.getAsFile()));
    toast("Imagem colada.");
    return;
  }
  const texto = e.clipboardData?.getData("text/plain")?.trim();
  if (texto) {
    e.preventDefault();
    ef.objetos.push({ tipo: "texto", texto: texto.slice(0, 500), x: ef.W * 0.08, y: ef.H * 0.08, tam: Math.round(ef.W * 0.05), cor: "#0b0f1a",
      negrito: true, fundo: "", alinhar: "left", contorno: false, fonte: "Inter" });
    efSelecionar(ef.objetos.length - 1);
    efHistorico();
  }
}

function efCliqueTopo(e) {
  const b = e.target.closest("[data-ef], [data-ferramenta]");
  if (!b) return;
  if (b.dataset.ferramenta) return efFerramenta(b.dataset.ferramenta);
  const acao = b.dataset.ef;
  if (acao === "fechar") return efFechar();
  if (acao === "desfazer") return efDesfazer();
  if (acao === "refazer") return efRefazer();
  if (acao === "baixar") return efBaixar();
  if (acao === "salvar-nova") return comBotao(b, () => efSalvar("nova"));
  if (acao === "salvar-substituir") return comBotao(b, () => efSalvar("substituir"));
}

function efFechar(forcar = false) {
  if (!forcar && ef.sujo && !confirm("Fechar o editor e descartar as alterações?")) return;
  $("#editor-foto").hidden = true;
  document.body.classList.remove("sem-rolagem");
  ef.objetos = [];
  ef.arrasto = null;
}

function efFerramenta(nome) {
  if (nome === "imagem") return efEscolherImagem();
  ef.ferramenta = nome;
  $$("#editor-foto [data-ferramenta]").forEach((b) => b.classList.toggle("ativa", b.dataset.ferramenta === nome));
  $("#ef-canvas").style.cursor = nome === "selecionar" ? "default" : "crosshair";
  if (EF_DESENHO.includes(nome) || nome === "varinha") ef.sel = -1;
  efPainel();
  efDesenhar();
}

function efEscolherImagem() {
  const fotos = (estado.anuncio?.fotos || []).filter((f) => /^(https?:\/\/|\/uploads\/)/.test(f));
  const painel = $("#ef-painel");
  painel.innerHTML = `<h3>Inserir imagem</h3>
    <p class="pequeno suave">Coloque outra foto por cima: um detalhe, a embalagem, o logo da loja. Você também pode <b>colar</b> (Ctrl+V) uma imagem copiada
      ou <b>arrastar</b> arquivos para cima da foto.</p>
    <button type="button" class="sec" id="ef-do-pc" style="width:100%">${ic("enviar", "p")}Enviar do computador</button>
    <button type="button" class="sec" id="ef-colar" style="width:100%;margin-top:8px">${ic("colar", "p")}Colar da área de transferência</button>
    ${fotos.length ? `<label style="margin-top:14px">Fotos deste anúncio</label>
      <div class="ef-miniaturas">${fotos.map((f) => `<button type="button" data-inserir="${h(f)}" title="Inserir esta foto">
        <img src="${h(f)}" alt="" referrerpolicy="no-referrer"></button>`).join("")}</div>` : ""}
    <button type="button" class="link-sutil" id="ef-voltar-painel" style="margin-top:12px">Voltar</button>`;
  $("#ef-do-pc").onclick = () => $("#ef-arquivo").click();
  $("#ef-colar").onclick = () => comBotao($("#ef-colar"), efColarDoBotao);
  $("#ef-voltar-painel").onclick = efPainel;
  $$("[data-inserir]", painel).forEach((b) => (b.onclick = () => comBotao(b, async () => efInserirImagem(await efSrcLocal(b.dataset.inserir)))));
}

async function efColarDoBotao() {
  if (!navigator.clipboard?.read) throw new Error("Este navegador não deixa ler a área de transferência pelo botão. Use Ctrl+V.");
  let itens;
  try { itens = await navigator.clipboard.read(); } catch { throw new Error("Permissão negada. Use Ctrl+V sobre o editor."); }
  for (const item of itens) {
    const tipo = item.types.find((t) => t.startsWith("image/"));
    if (tipo) return efInserirImagem(URL.createObjectURL(await item.getType(tipo)));
  }
  throw new Error("Não há imagem copiada. Copie uma imagem (botão direito › Copiar imagem) e tente de novo.");
}

async function efInserirImagem(src) {
  try {
    const img = await efImagem(src);
    const vazio = !ef.objetos.some((o) => o.tipo === "imagem");
    const caixa = efEncaixar(img, "conter", vazio ? 1 : 0.5);
    ef.objetos.push({ tipo: "imagem", src, ...caixa });
    efFerramenta("selecionar");
    efSelecionar(ef.objetos.length - 1);
    efHistorico();
  } catch (e) { toast(e.message, true); }
}

function efEncaixar(img, modo, fator = 1, rot = 0) {
  let iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (rot % 180) [iw, ih] = [ih, iw];
  const s = (modo === "cobrir" ? Math.max(ef.W / iw, ef.H / ih) : Math.min(ef.W / iw, ef.H / ih)) * fator;
  const w = Math.round(iw * s), hh = Math.round(ih * s);
  return { x: Math.round((ef.W - w) / 2), y: Math.round((ef.H - hh) / 2), w, h: hh };
}

function efAjustarPalco() {
  const palco = $("#ef-palco"), canvas = $("#ef-canvas");
  if (!palco || !canvas) return;
  canvas.width = ef.W;
  canvas.height = ef.H;
  const folga = 32, lw = palco.clientWidth - folga, lh = palco.clientHeight - folga;
  const s = Math.min(lw / ef.W, lh / ef.H, 1);
  canvas.style.width = Math.max(50, Math.floor(ef.W * s)) + "px";
  canvas.style.height = Math.max(50, Math.floor(ef.H * s)) + "px";
  ef.escala = ef.W / Math.max(50, Math.floor(ef.W * s));
  efDesenhar();
}

function efFamilia(o) { return (EF_FONTES.find(([n]) => n === o.fonte) || EF_FONTES[0])[1]; }
function efFonte(o) { return `${o.italico ? "italic " : ""}${o.negrito ? 800 : 500} ${o.tam}px ${efFamilia(o)}`; }

function efCaixa(o, ctx = $("#ef-canvas")?.getContext("2d")) {
  if (o.tipo === "seta") {
    const x = Math.min(o.x1, o.x2), y = Math.min(o.y1, o.y2);
    return { x, y, w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  }
  if (o.tipo === "traco") {
    const xs = o.pontos.map((p) => p[0]), ys = o.pontos.map((p) => p[1]), m = o.espessura / 2;
    const x = Math.min(...xs) - m, y = Math.min(...ys) - m;
    return { x, y, w: Math.max(...xs) + m - x, h: Math.max(...ys) + m - y };
  }
  if (o.tipo === "texto") {
    ctx.font = efFonte(o);
    const linhas = String(o.texto || " ").split("\n");
    const pad = o.fundo ? o.tam * 0.45 : 0;
    const w = Math.max(...linhas.map((l) => ctx.measureText(l || " ").width)) + pad * 2;
    return { x: o.x, y: o.y, w, h: linhas.length * o.tam * 1.22 + pad * 2 - o.tam * 0.22 + (o.fundo ? o.tam * 0.1 : 0) };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function efRetanguloRedondo(ctx, x, y, w, hh, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(hh) / 2));
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, hh, r) : ctx.rect(x, y, w, hh);
}

function efCorAlfa(cor, alfa) {
  const n = parseInt(cor.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

function efTracar(ctx, pontos) {
  ctx.beginPath();
  ctx.moveTo(pontos[0][0], pontos[0][1]);
  if (pontos.length === 1) ctx.lineTo(pontos[0][0] + 0.01, pontos[0][1]);
  for (let i = 1; i < pontos.length - 1; i++) {
    const [x, y] = pontos[i], [nx, ny] = pontos[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  if (pontos.length > 1) ctx.lineTo(...pontos[pontos.length - 1]);
  ctx.stroke();
}

function efDesenharObjeto(ctx, o) {
  ctx.save();
  if (o.tipo === "imagem") {
    const img = ef.cache.get(o.src)?.img;
    if (!img) { efImagem(o.src).then(() => efDesenhar()).catch(() => {}); ctx.restore(); return; }
    const rot = o.rot || 0;
    ctx.globalAlpha = o.opacidade ?? 1;
    const filtros = [];
    if ((o.brilho ?? 100) !== 100) filtros.push(`brightness(${o.brilho}%)`);
    if ((o.contraste ?? 100) !== 100) filtros.push(`contrast(${o.contraste}%)`);
    if ((o.saturacao ?? 100) !== 100) filtros.push(`saturate(${o.saturacao}%)`);
    if (o.desfoque) filtros.push(`blur(${o.desfoque}px)`);
    if (filtros.length) ctx.filter = filtros.join(" ");
    if (o.sombra) { ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = Math.max(o.w, o.h) * 0.05; ctx.shadowOffsetY = Math.max(o.w, o.h) * 0.02; }
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(o.espelharH ? -1 : 1, o.espelharV ? -1 : 1);
    const dw = rot % 180 ? o.h : o.w, dh = rot % 180 ? o.w : o.h;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else if (o.tipo === "traco") {
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = o.espessura;
    if (o.modo === "borracha") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
    } else {
      ctx.strokeStyle = o.cor;
      if (o.modo === "marcador") { ctx.globalAlpha = 0.38; ctx.globalCompositeOperation = "multiply"; ctx.lineCap = "square"; }
    }
    efTracar(ctx, o.pontos);
  } else if (o.tipo === "texto") {
    const c = efCaixa(o, ctx), pad = o.fundo ? o.tam * 0.45 : 0;
    if (o.fundo) {
      ctx.fillStyle = o.fundo;
      efRetanguloRedondo(ctx, c.x, c.y, c.w, c.h, o.tam * 0.35);
      ctx.fill();
    }
    ctx.font = efFonte(o);
    ctx.textBaseline = "top";
    ctx.textAlign = o.alinhar || "left";
    const xTexto = o.alinhar === "center" ? c.x + c.w / 2 : o.alinhar === "right" ? c.x + c.w - pad : c.x + pad;
    if (o.sombra) { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = o.tam * 0.18; ctx.shadowOffsetY = o.tam * 0.06; }
    String(o.texto || "").split("\n").forEach((linha, i) => {
      const y = c.y + pad + i * o.tam * 1.22 + (o.fundo ? o.tam * 0.05 : 0);
      if (o.contorno) {
        ctx.lineWidth = Math.max(2, o.tam * 0.14);
        ctx.lineJoin = "round";
        ctx.strokeStyle = o.cor === "#ffffff" ? "#0b0f1a" : "#ffffff";
        ctx.strokeText(linha, xTexto, y);
      }
      ctx.fillStyle = o.cor;
      ctx.fillText(linha, xTexto, y);
      if (o.sublinhado || o.riscado) {
        const largura = ctx.measureText(linha).width;
        const x0 = ctx.textAlign === "center" ? xTexto - largura / 2 : ctx.textAlign === "right" ? xTexto - largura : xTexto;
        ctx.fillRect(x0, y + o.tam * (o.riscado ? 0.52 : 1.02), largura, Math.max(2, o.tam * 0.07));
      }
    });
  } else if (o.tipo === "seta") {
    const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), ponta = Math.max(14, o.espessura * 3.6);
    const comPonta = o.ponta !== false;
    const fimX = comPonta ? o.x2 - Math.cos(ang) * ponta * 0.8 : o.x2, fimY = comPonta ? o.y2 - Math.sin(ang) * ponta * 0.8 : o.y2;
    ctx.strokeStyle = ctx.fillStyle = o.cor;
    ctx.lineWidth = o.espessura;
    ctx.lineCap = "round";
    if (o.tracejada) ctx.setLineDash([o.espessura * 2.5, o.espessura * 2]);
    ctx.beginPath();
    ctx.moveTo(o.x1, o.y1);
    ctx.lineTo(fimX, fimY);
    ctx.stroke();
    ctx.setLineDash([]);
    if (comPonta) {
      ctx.beginPath();
      ctx.moveTo(o.x2, o.y2);
      ctx.lineTo(o.x2 - Math.cos(ang - 0.42) * ponta, o.y2 - Math.sin(ang - 0.42) * ponta);
      ctx.lineTo(o.x2 - Math.cos(ang + 0.42) * ponta, o.y2 - Math.sin(ang + 0.42) * ponta);
      ctx.closePath();
      ctx.fill();
    }
  } else if (o.tipo === "retangulo" || o.tipo === "circulo") {
    ctx.beginPath();
    if (o.tipo === "circulo") ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2);
    else efRetanguloRedondo(ctx, o.x, o.y, o.w, o.h, o.raio || 0);
    if (o.preenchimento) {
      ctx.fillStyle = efCorAlfa(o.preenchimento, o.opacidade ?? 1);
      ctx.fill();
    }
    if (o.espessura > 0) {
      ctx.strokeStyle = o.cor;
      ctx.lineWidth = o.espessura;
      ctx.stroke();
    }
  } else if (o.tipo === "selo") {
    const r = Math.min(o.w, o.h) / 2, cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    ctx.fillStyle = o.cor;
    ctx.beginPath();
    if (o.forma === "estrela") {
      const pontas = 16;
      for (let i = 0; i < pontas * 2; i++) {
        const raio = i % 2 ? r * 0.88 : r, a = (Math.PI * i) / pontas - Math.PI / 2;
        ctx.lineTo(cx + Math.cos(a) * raio, cy + Math.sin(a) * raio);
      }
      ctx.closePath();
    } else if (o.forma === "etiqueta") efRetanguloRedondo(ctx, o.x, o.y, o.w, o.h, Math.min(o.w, o.h) * 0.18);
    else ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    const linhas = String(o.texto || "").split("\n");
    let tam = r * (linhas.length > 2 ? 0.34 : 0.42);
    ctx.font = `800 ${tam}px ${EF_FONTE}`;
    const maior = Math.max(...linhas.map((l) => ctx.measureText(l).width), 1);
    const limite = (o.forma === "etiqueta" ? o.w : r * 2) * 0.8;
    if (maior > limite) { tam *= limite / maior; ctx.font = `800 ${tam}px ${EF_FONTE}`; }
    ctx.fillStyle = o.corTexto;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    linhas.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (linhas.length - 1) / 2) * tam * 1.15));
  }
  ctx.restore();
}

function efAlcas(o) {
  if (o.tipo === "seta") return { p1: [o.x1, o.y1], p2: [o.x2, o.y2] };
  const c = efCaixa(o);
  return { nw: [c.x, c.y], ne: [c.x + c.w, c.y], sw: [c.x, c.y + c.h], se: [c.x + c.w, c.y + c.h] };
}

function efDesenhar() {
  const canvas = $("#ef-canvas");
  if (!canvas || $("#editor-foto")?.hidden) return;
  const ctx = canvas.getContext("2d");
  efPintar(ctx);
  const o = ef.objetos[ef.sel];
  if (!o) return;
  const e = ef.escala, c = efCaixa(o, ctx);
  ctx.save();
  ctx.strokeStyle = "#0b50f5";
  ctx.lineWidth = 1.5 * e;
  ctx.setLineDash([6 * e, 4 * e]);
  if (o.tipo !== "seta") ctx.strokeRect(c.x, c.y, c.w, c.h);
  ctx.setLineDash([]);
  for (const [x, y] of Object.values(efAlcas(o))) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, 6 * e, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

let efCamada = null;
function efPintar(ctx) {
  if (!efCamada) efCamada = document.createElement("canvas");
  if (efCamada.width !== ef.W || efCamada.height !== ef.H) { efCamada.width = ef.W; efCamada.height = ef.H; }
  const c = efCamada.getContext("2d");
  c.clearRect(0, 0, ef.W, ef.H);
  ef.objetos.forEach((o) => efDesenharObjeto(c, o));
  ctx.clearRect(0, 0, ef.W, ef.H);
  if (ef.fundo) {
    ctx.fillStyle = ef.fundo;
    ctx.fillRect(0, 0, ef.W, ef.H);
  }
  ctx.drawImage(efCamada, 0, 0);
}

function efPonto(e) {
  const r = $("#ef-canvas").getBoundingClientRect();
  return { x: (e.clientX - r.left) * ef.escala, y: (e.clientY - r.top) * ef.escala };
}

function efDistSegmento(p, o) {
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - o.x1) * dx + (p.y - o.y1) * dy) / l2));
  return Math.hypot(p.x - (o.x1 + t * dx), p.y - (o.y1 + t * dy));
}

function efAcerto(p, filtro = () => true) {
  for (let i = ef.objetos.length - 1; i >= 0; i--) {
    const o = ef.objetos[i];
    if (!filtro(o)) continue;
    if (o.tipo === "seta") { if (efDistSegmento(p, o) <= o.espessura / 2 + 10 * ef.escala) return i; continue; }
    if (o.tipo === "traco") {
      const perto = o.pontos.some((q, k) => k && efDistSegmento(p, { x1: o.pontos[k - 1][0], y1: o.pontos[k - 1][1], x2: q[0], y2: q[1] }) <= o.espessura / 2 + 6 * ef.escala)
        || (o.pontos.length === 1 && Math.hypot(p.x - o.pontos[0][0], p.y - o.pontos[0][1]) <= o.espessura / 2 + 6 * ef.escala);
      if (perto) return i;
      continue;
    }
    const c = efCaixa(o);
    if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) return i;
  }
  return -1;
}

function efAlcaEm(p) {
  const o = ef.objetos[ef.sel];
  if (!o) return null;
  const raio = 12 * ef.escala;
  return Object.entries(efAlcas(o)).find(([, [x, y]]) => Math.hypot(p.x - x, p.y - y) <= raio)?.[0] || null;
}

function efApertar(e) {
  const p = efPonto(e);
  $("#ef-canvas").setPointerCapture(e.pointerId);
  const f = ef.ferramenta;
  if (f === "varinha") {
    const i = efAcerto(p, (o) => o.tipo === "imagem");
    if (i < 0) return toast("Clique sobre uma foto para tirar a cor de fundo daquele ponto.", true);
    efRemoverFundo(ef.objetos[i], p).catch((err) => toast(err.message, true));
    return;
  }
  if (EF_DESENHO.includes(f)) {
    const cfg = ef[f];
    const o = { tipo: "traco", modo: f, cor: cfg.cor || "#000000", espessura: cfg.espessura, pontos: [[p.x, p.y]] };
    ef.objetos.push(o);
    ef.arrasto = { modo: "desenhar", objeto: o };
    efDesenhar();
    return;
  }
  if (f === "texto" || f === "selo") {
    const o = f === "texto"
      ? { tipo: "texto", texto: "Seu texto aqui", x: p.x, y: p.y, tam: Math.round(ef.W * 0.05), cor: "#0b0f1a", negrito: true, fundo: "", alinhar: "left", contorno: false, fonte: "Inter" }
      : { tipo: "selo", texto: "Frete\ngrátis", forma: "circulo", x: p.x - ef.W * 0.1, y: p.y - ef.W * 0.1, w: ef.W * 0.2, h: ef.W * 0.2, cor: "#0b50f5", corTexto: "#ffffff" };
    ef.objetos.push(o);
    efFerramenta("selecionar");
    efSelecionar(ef.objetos.length - 1);
    efHistorico();
    if (o.tipo === "texto") setTimeout(() => $("#ef-painel [data-prop=texto]")?.select(), 0);
    return;
  }
  if (["seta", "linha", "retangulo", "circulo"].includes(f)) {
    const reta = f === "seta" || f === "linha";
    const base = { cor: reta ? "#e11d2e" : "#0b50f5", espessura: Math.max(4, Math.round(ef.W / 150)) };
    const o = reta ? { tipo: "seta", ponta: f === "seta", x1: p.x, y1: p.y, x2: p.x, y2: p.y, ...base }
      : { tipo: f, x: p.x, y: p.y, w: 0, h: 0, preenchimento: "", opacidade: 0.2, raio: f === "retangulo" ? 16 : 0, ...base };
    ef.objetos.push(o);
    ef.sel = ef.objetos.length - 1;
    ef.arrasto = { modo: "criar", alca: reta ? "p2" : "se", inicio: p, copia: { ...o } };
    return;
  }
  const alca = efAlcaEm(p);
  if (alca) {
    const o = ef.objetos[ef.sel];
    ef.arrasto = { modo: "alca", alca, inicio: p, copia: { ...structuredClone(o), caixa: efCaixa(o) } };
    return;
  }
  const i = efAcerto(p);
  efSelecionar(i);
  if (i >= 0) ef.arrasto = { modo: "mover", inicio: p, copia: structuredClone(ef.objetos[i]), mexeu: false };
}

function efMover(e) {
  const p = efPonto(e);
  if (!ef.arrasto) {
    if (ef.ferramenta !== "selecionar") return;
    const alca = efAlcaEm(p);
    $("#ef-canvas").style.cursor = alca ? (["nw", "se"].includes(alca) ? "nwse-resize" : ["ne", "sw"].includes(alca) ? "nesw-resize" : "move")
      : efAcerto(p) >= 0 ? "move" : "default";
    return;
  }
  if (ef.arrasto.modo === "desenhar") {
    const pts = ef.arrasto.objeto.pontos, ult = pts[pts.length - 1];
    if (Math.hypot(p.x - ult[0], p.y - ult[1]) >= 2 * ef.escala) {
      if (e.shiftKey && pts.length > 1) pts.length = 1;
      pts.push([p.x, p.y]);
      efDesenhar();
    }
    return;
  }
  const { modo, inicio, copia: c } = ef.arrasto, o = ef.objetos[ef.sel];
  let dx = p.x - inicio.x, dy = p.y - inicio.y;
  if (modo === "mover") {
    if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    if (o.tipo === "seta") Object.assign(o, { x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy });
    else if (o.tipo === "traco") o.pontos = c.pontos.map(([x, y]) => [x + dx, y + dy]);
    else {
      let x = c.x + dx, y = c.y + dy;
      const caixa = efCaixa({ ...o, x, y }), ima = 8 * ef.escala;
      if (Math.abs(caixa.x + caixa.w / 2 - ef.W / 2) < ima) x += ef.W / 2 - (caixa.x + caixa.w / 2);
      if (Math.abs(caixa.y + caixa.h / 2 - ef.H / 2) < ima) y += ef.H / 2 - (caixa.y + caixa.h / 2);
      Object.assign(o, { x, y });
    }
    ef.arrasto.mexeu = true;
  } else if (o.tipo === "seta") {
    let x = p.x, y = p.y;
    const [ox, oy] = ef.arrasto.alca === "p1" ? [o.x2, o.y2] : [o.x1, o.y1];
    if (e.shiftKey) {
      const ang = Math.round(Math.atan2(y - oy, x - ox) / (Math.PI / 4)) * (Math.PI / 4), dist = Math.hypot(x - ox, y - oy);
      x = ox + Math.cos(ang) * dist;
      y = oy + Math.sin(ang) * dist;
    }
    if (ef.arrasto.alca === "p1") Object.assign(o, { x1: x, y1: y }); else Object.assign(o, { x2: x, y2: y });
  } else if (modo === "criar") {
    let w = Math.abs(dx), hh = Math.abs(dy);
    if (e.shiftKey) w = hh = Math.max(w, hh);
    Object.assign(o, { x: dx < 0 ? inicio.x - w : inicio.x, y: dy < 0 ? inicio.y - hh : inicio.y, w, h: hh });
  } else {
    const b = c.caixa, alca = ef.arrasto.alca;
    const direita = alca.includes("e"), baixo = alca.includes("s");
    let w = direita ? p.x - b.x : b.x + b.w - p.x, hh = baixo ? p.y - b.y : b.y + b.h - p.y;
    if (["imagem", "texto", "selo", "traco"].includes(o.tipo) !== e.shiftKey) {
      const s = Math.max(w / b.w, hh / b.h);
      w = b.w * s;
      hh = b.h * s;
    }
    w = Math.max(10, w);
    hh = Math.max(10, hh);
    const x = direita ? b.x : b.x + b.w - w, y = baixo ? b.y : b.y + b.h - hh;
    if (o.tipo === "texto") Object.assign(o, { x, y, tam: Math.max(8, Math.round(c.tam * (w / b.w))) });
    else if (o.tipo === "traco") {
      const sx = w / b.w, sy = hh / b.h;
      o.pontos = c.pontos.map(([px, py]) => [x + (px - b.x) * sx, y + (py - b.y) * sy]);
      o.espessura = Math.max(1, c.espessura * Math.min(sx, sy));
    } else Object.assign(o, { x, y, w, h: hh });
  }
  efDesenhar();
}

function efSoltar() {
  const a = ef.arrasto;
  if (!a) return;
  ef.arrasto = null;
  if (a.modo === "desenhar") {
    efHistorico();
    efDesenhar();
    return;
  }
  const o = ef.objetos[ef.sel];
  if (a.modo === "criar") {
    const pequeno = o.tipo === "seta" ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 12 : o.w < 12 || o.h < 12;
    if (pequeno) {
      const t = ef.W * 0.22;
      if (o.tipo === "seta") Object.assign(o, { x2: o.x1 + t, y2: o.y1 });
      else Object.assign(o, { x: o.x - t / 2, y: o.y - t / 2, w: t, h: o.tipo === "circulo" ? t : t * 0.7 });
    }
    efFerramenta("selecionar");
    efSelecionar(ef.sel);
    efHistorico();
  } else if (a.modo === "alca" || a.mexeu) {
    efHistorico();
    efPainel();
  }
  efDesenhar();
}

function efSelecionar(i) {
  ef.sel = i;
  efPainel();
  efDesenhar();
}

function efCampoCor(prop, valor, permitirNenhuma = false) {
  return `<div class="ef-cores">${permitirNenhuma ? `<button type="button" class="ef-cor nenhuma ${valor ? "" : "on"}" data-cor-prop="${prop}" data-cor="" title="Sem cor" aria-label="Sem cor"></button>` : ""}
    ${EF_CORES.map((c) => `<button type="button" class="ef-cor ${valor === c ? "on" : ""}" style="background:${c}" data-cor-prop="${prop}" data-cor="${c}" aria-label="Cor ${c}"></button>`).join("")}
    <input type="color" data-prop="${prop}" value="${valor || "#ffffff"}" title="Outra cor" aria-label="Outra cor"></div>`;
}

function efFaixa(rotulo, prop, valor, min, max, passo = 1, sufixo = "") {
  return `<label class="ef-faixa"><span>${rotulo} <b data-valor="${prop}">${valor}${sufixo}</b></span>
    <input type="range" data-prop="${prop}" min="${min}" max="${max}" step="${passo}" value="${valor}" data-sufixo="${sufixo}"></label>`;
}

function efPainelFerramenta(painel) {
  const f = ef.ferramenta;
  if (f === "varinha") {
    painel.innerHTML = `<h3>${ic("magica", "p")} Tirar fundo</h3>
      <p class="pequeno suave">Clique na cor que quer apagar (o fundo, por exemplo). Toda a área daquela cor, ligada ao ponto clicado, fica transparente.
        Repita em outras partes se precisar.</p>
      ${efFaixa("Tolerância", "tolerancia", ef.tolerancia, 4, 120)}
      <p class="pequeno suave">Tolerância baixa apaga só a cor exata; alta apaga tons parecidos. Para foto com fundo liso, selecione a foto e use
        <b>Tirar fundo automático</b>.</p>
      <button type="button" class="link-sutil" data-volta>Voltar para selecionar</button>`;
    $("[data-prop=tolerancia]", painel).oninput = (e) => { ef.tolerancia = +e.target.value; $("[data-valor=tolerancia]", painel).textContent = e.target.value; };
    $("[data-volta]", painel).onclick = () => efFerramenta("selecionar");
    return;
  }
  const cfg = ef[f];
  const nomes = { pincel: "Pincel", marcador: "Marca-texto", borracha: "Borracha" };
  painel.innerHTML = `<h3>${ic(f, "p")} ${nomes[f]}</h3>
    <p class="pequeno suave">${f === "borracha" ? "Apaga o que estiver por baixo (fotos, textos e desenhos), deixando aparecer a cor de fundo."
      : f === "marcador" ? "Destaque transparente, como caneta marca-texto." : "Desenhe à mão livre. Segure Shift para fazer uma reta."}</p>
    ${efFaixa("Espessura", "espessura", cfg.espessura, 2, 200)}
    ${f === "borracha" ? "" : `<label style="margin-top:12px">Cor</label>${efCampoCor("cor", cfg.cor)}`}
    <div class="ef-previa-traco"><i style="width:${Math.min(120, cfg.espessura / ef.escala)}px;height:${Math.min(120, cfg.espessura / ef.escala)}px;background:${f === "borracha" ? "var(--suave)" : cfg.cor};opacity:${f === "marcador" ? 0.45 : 1}"></i></div>
    <p class="pequeno suave">Cada traço vira um elemento: dá para selecionar, mover, mudar a cor ou apagar depois.</p>
    <button type="button" class="link-sutil" data-volta>Voltar para selecionar</button>`;
  $("[data-prop=espessura]", painel).oninput = (e) => { cfg.espessura = +e.target.value; efPainelFerramenta(painel); $("[data-prop=espessura]", painel)?.focus(); };
  $$("[data-cor-prop]", painel).forEach((b) => (b.onclick = () => { cfg.cor = b.dataset.cor; efPainelFerramenta(painel); }));
  const cor = $("input[type=color]", painel);
  if (cor) cor.onchange = () => { cfg.cor = cor.value; efPainelFerramenta(painel); };
  $("[data-volta]", painel).onclick = () => efFerramenta("selecionar");
}

function efPainel() {
  const painel = $("#ef-painel");
  if (!painel) return;
  const o = ef.objetos[ef.sel];
  if (!o && (EF_DESENHO.includes(ef.ferramenta) || ef.ferramenta === "varinha")) return efPainelFerramenta(painel);
  const tamanhoAtual = EF_TAMANHOS.some(([k]) => k === `${ef.W}x${ef.H}`) ? `${ef.W}x${ef.H}` : "livre";
  if (!o) {
    painel.innerHTML = `<h3>${ic("redimensionar", "p")} Tamanho da imagem</h3>
      <select id="ef-tamanho">${EF_TAMANHOS.map(([k, n]) => `<option value="${k}" ${k === tamanhoAtual ? "selected" : ""}>${n}</option>`).join("")}</select>
      <div class="grade g2" style="margin-top:8px;gap:8px">
        <div><label for="ef-w">Largura (px)</label><input id="ef-w" type="number" min="300" max="3000" value="${ef.W}"></div>
        <div><label for="ef-h">Altura (px)</label><input id="ef-h" type="number" min="300" max="3000" value="${ef.H}"></div></div>
      <p class="pequeno suave" style="margin:6px 0 0">Mercado Livre e Shopee pedem no mínimo 500 px; o ideal é 1200 × 1200.</p>
      <h3 style="margin-top:18px">Cor de fundo</h3>${efCampoCor("fundo", ef.fundo, true)}
      <p class="pequeno suave" style="margin:6px 0 0">${ef.fundo ? "A capa do anúncio deve ter fundo branco puro." : "Sem cor: a imagem sai em PNG com fundo transparente."}</p>
      <h3 style="margin-top:18px">Dicas</h3>
      <ul class="ef-dicas pequeno suave">
        <li>Escolha uma ferramenta à esquerda e clique ou arraste sobre a imagem.</li>
        <li><b>Ctrl+V</b> cola uma imagem ou texto copiado; também dá para arrastar arquivos para cá.</li>
        <li>Clique num elemento para mover; puxe as bolinhas para aumentar.</li>
        <li>Segure <b>Shift</b> para manter reto ou proporcional.</li>
        <li><b>Delete</b> apaga, <b>Ctrl+D</b> duplica, <b>Ctrl+Z</b> desfaz.</li>
      </ul>`;
    $("#ef-tamanho").onchange = (e) => {
      if (e.target.value === "livre") return $("#ef-w").focus();
      const [w, hh] = e.target.value.split("x").map(Number);
      efRedimensionar(w, hh);
    };
    $$("#ef-w, #ef-h").forEach((c) => (c.onchange = () => efRedimensionar(+$("#ef-w").value, +$("#ef-h").value)));
    efLigarCores(painel, ef);
    return;
  }
  const nomes = { imagem: "Imagem", texto: "Texto", seta: o.ponta === false ? "Linha" : "Seta", retangulo: "Retângulo", circulo: "Círculo", selo: "Selo",
    traco: { pincel: "Desenho", marcador: "Marca-texto", borracha: "Borracha" }[o.modo] };
  let campos = "";
  if (o.tipo === "texto") {
    campos = `<label for="ef-texto">Texto</label><textarea id="ef-texto" data-prop="texto" rows="3">${h(o.texto)}</textarea>
      <div class="grade g2" style="gap:8px;margin-top:8px">
        <div><label>Fonte</label><select data-prop="fonte">${EF_FONTES.map(([n]) => `<option ${o.fonte === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label>Tamanho</label><input type="number" data-prop="tam" min="8" max="600" value="${o.tam}"></div>
        <div style="grid-column:1/-1"><label>Alinhar</label><select data-prop="alinhar">${[["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"]]
          .map(([v, n]) => `<option value="${v}" ${o.alinhar === v ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
      <div class="ef-checks">
        ${[["negrito", "Negrito"], ["italico", "Itálico"], ["sublinhado", "Sublinhado"], ["riscado", "Riscado"], ["contorno", "Contorno"], ["sombra", "Sombra"]]
          .map(([k, n]) => `<label><input type="checkbox" data-prop="${k}" ${o[k] ? "checked" : ""}> ${n}</label>`).join("")}</div>
      <label style="margin-top:12px">Cor do texto</label>${efCampoCor("cor", o.cor)}
      <label style="margin-top:12px">Fundo do texto</label>${efCampoCor("fundo", o.fundo, true)}`;
  } else if (o.tipo === "selo") {
    campos = `<label for="ef-texto">Texto</label><textarea id="ef-texto" data-prop="texto" rows="2">${h(o.texto)}</textarea>
      <div class="ef-sugestoes">${["Frete\ngrátis", "Pronta\nentrega", "Original", "Garantia\n1 ano", "Novo", "Kit com\n3"].map((t) =>
        `<button type="button" class="sec pequeno" data-sugestao="${h(t)}">${h(t.replace("\n", " "))}</button>`).join("")}</div>
      <label style="margin-top:10px">Formato</label><select data-prop="forma">${[["circulo", "Círculo"], ["estrela", "Estrela"], ["etiqueta", "Etiqueta"]]
        .map(([v, n]) => `<option value="${v}" ${o.forma === v ? "selected" : ""}>${n}</option>`).join("")}</select>
      <label style="margin-top:12px">Cor do selo</label>${efCampoCor("cor", o.cor)}
      <label style="margin-top:12px">Cor do texto</label>${efCampoCor("corTexto", o.corTexto)}`;
  } else if (o.tipo === "seta") {
    campos = `${efFaixa("Espessura", "espessura", o.espessura, 2, 60)}
      <div class="ef-checks"><label><input type="checkbox" data-prop="ponta" ${o.ponta !== false ? "checked" : ""}> Ponta de seta</label>
        <label><input type="checkbox" data-prop="tracejada" ${o.tracejada ? "checked" : ""}> Tracejada</label></div>
      <label style="margin-top:12px">Cor</label>${efCampoCor("cor", o.cor)}`;
  } else if (o.tipo === "traco") {
    campos = `${efFaixa("Espessura", "espessura", Math.round(o.espessura), 1, 200)}
      ${o.modo === "borracha" ? "" : `<label style="margin-top:12px">Cor</label>${efCampoCor("cor", o.cor)}`}`;
  } else if (o.tipo === "retangulo" || o.tipo === "circulo") {
    campos = `${efFaixa("Espessura da borda", "espessura", o.espessura, 0, 60)}
      <label style="margin-top:12px">Cor da borda</label>${efCampoCor("cor", o.cor)}
      <label style="margin-top:12px">Preenchimento</label>${efCampoCor("preenchimento", o.preenchimento, true)}
      ${efFaixa("Opacidade do preenchimento", "opacidade", o.opacidade ?? 1, 0.05, 1, 0.05)}
      ${o.tipo === "retangulo" ? efFaixa("Cantos arredondados", "raio", o.raio || 0, 0, 200) : ""}`;
  } else if (o.tipo === "imagem") {
    campos = `<div class="ef-grade-acoes">
        <button type="button" class="sec pequeno" data-acao="fundo-auto" title="Apaga o fundo liso que encosta nas bordas da foto">${ic("magica", "p")}Tirar fundo automático</button>
        <button type="button" class="sec pequeno" data-acao="varinha" title="Clique na cor que quer apagar">${ic("magica", "p")}Tirar fundo clicando</button>
        ${o.srcOriginal ? `<button type="button" class="sec pequeno" data-acao="restaurar" style="grid-column:1/-1">Desfazer remoção de fundo</button>` : ""}
        <button type="button" class="sec pequeno" data-acao="girar">${ic("girar", "p")}Girar 90°</button>
        <button type="button" class="sec pequeno" data-acao="espelhar">${ic("espelhar", "p")}Espelhar</button>
        <button type="button" class="sec pequeno" data-acao="conter">${ic("redimensionar", "p")}Encaixar inteira</button>
        <button type="button" class="sec pequeno" data-acao="cobrir">${ic("recortar", "p")}Preencher quadro</button>
        <button type="button" class="sec pequeno" data-acao="reduzir" style="grid-column:1/-1">Produto a 85% do quadro</button></div>
      <h3 style="margin-top:16px">${ic("ajustes", "p")} Ajustes</h3>
      ${efFaixa("Brilho", "brilho", o.brilho ?? 100, 30, 200, 1, "%")}
      ${efFaixa("Contraste", "contraste", o.contraste ?? 100, 30, 200, 1, "%")}
      ${efFaixa("Saturação", "saturacao", o.saturacao ?? 100, 0, 250, 1, "%")}
      ${efFaixa("Desfoque", "desfoque", o.desfoque ?? 0, 0, 30, 1, "px")}
      ${efFaixa("Opacidade", "opacidade", o.opacidade ?? 1, 0.05, 1, 0.05)}
      <div class="ef-checks"><label><input type="checkbox" data-prop="sombra" ${o.sombra ? "checked" : ""}> Sombra embaixo</label></div>
      <button type="button" class="link-sutil" data-acao="zerar-ajustes">Voltar ajustes ao normal</button>`;
  }
  painel.innerHTML = `<div class="linha entre" style="flex-wrap:nowrap"><h3 style="margin:0">${nomes[o.tipo]}</h3>
      <button type="button" class="link-sutil" data-acao="soltar">Nada selecionado</button></div>
    <div class="ef-campos">${campos}</div>
    <h3 style="margin-top:18px">${ic("camadas", "p")} Posição</h3>
    <div class="ef-grade-acoes">
      <button type="button" class="sec pequeno" data-acao="centro-h">Centralizar ↔</button>
      <button type="button" class="sec pequeno" data-acao="centro-v">Centralizar ↕</button>
      <button type="button" class="sec pequeno" data-acao="frente">Trazer à frente</button>
      <button type="button" class="sec pequeno" data-acao="tras">Enviar para trás</button>
      <button type="button" class="sec pequeno" data-acao="duplicar">${ic("copiar", "p")}Duplicar</button>
      <button type="button" class="sec pequeno perigo-txt" data-acao="apagar">${ic("lixo", "p")}Apagar</button></div>`;
  efLigarCores(painel, o);
  $$("[data-prop]", painel).forEach((c) => {
    const ler = () => (c.type === "checkbox" ? c.checked : ["number", "range"].includes(c.type) ? Number(c.value) : c.value);
    c.oninput = () => {
      o[c.dataset.prop] = ler();
      const rotulo = $(`[data-valor="${c.dataset.prop}"]`, painel);
      if (rotulo) rotulo.textContent = c.value + (c.dataset.sufixo || "");
      efDesenhar();
      efHistoricoDepois();
    };
    c.onchange = () => { o[c.dataset.prop] = ler(); efDesenhar(); efHistorico(); if (c.type === "color" || c.type === "checkbox" || c.tagName === "SELECT") efPainel(); };
  });
  $$("[data-sugestao]", painel).forEach((b) => (b.onclick = () => { o.texto = b.dataset.sugestao; efHistorico(); efPainel(); efDesenhar(); }));
  $$("[data-acao]", painel).forEach((b) => (b.onclick = () => efAcao(b.dataset.acao, b)));
}

function efLigarCores(painel, alvo) {
  $$("[data-cor-prop]", painel).forEach((b) => (b.onclick = () => {
    alvo[b.dataset.corProp] = b.dataset.cor;
    if (b.dataset.corProp === "preenchimento" && b.dataset.cor && !(alvo.opacidade > 0.05)) alvo.opacidade = 1;
    efHistorico();
    efPainel();
    efDesenhar();
  }));
  if (alvo === ef) $$('input[type=color][data-prop="fundo"]', painel).forEach((c) => (c.onchange = () => { ef.fundo = c.value; efHistorico(); efPainel(); efDesenhar(); }));
}

function efDeslocar(o, dx, dy) {
  if (o.tipo === "seta") Object.assign(o, { x1: o.x1 + dx, x2: o.x2 + dx, y1: o.y1 + dy, y2: o.y2 + dy });
  else if (o.tipo === "traco") o.pontos = o.pontos.map(([x, y]) => [x + dx, y + dy]);
  else Object.assign(o, { x: o.x + dx, y: o.y + dy });
}

function efAcao(acao, botao) {
  const i = ef.sel, o = ef.objetos[i];
  if (acao === "soltar") return efSelecionar(-1);
  if (!o) return;
  if (acao === "varinha") return efFerramenta("varinha");
  if (acao === "fundo-auto") return comBotao(botao, () => efRemoverFundo(o, null));
  const c = efCaixa(o);
  if (acao === "centro-h") efDeslocar(o, ef.W / 2 - (c.x + c.w / 2), 0);
  else if (acao === "centro-v") efDeslocar(o, 0, ef.H / 2 - (c.y + c.h / 2));
  else if (acao === "frente" && i < ef.objetos.length - 1) { ef.objetos.push(ef.objetos.splice(i, 1)[0]); ef.sel = ef.objetos.length - 1; }
  else if (acao === "tras" && i > 0) { ef.objetos.unshift(ef.objetos.splice(i, 1)[0]); ef.sel = 0; }
  else if (acao === "duplicar") {
    const copia = structuredClone(o), passo = ef.W * 0.03;
    efDeslocar(copia, passo, passo);
    ef.objetos.push(copia);
    ef.sel = ef.objetos.length - 1;
  } else if (acao === "apagar") { ef.objetos.splice(i, 1); ef.sel = -1; }
  else if (acao === "restaurar" && o.srcOriginal) { o.src = o.srcOriginal; delete o.srcOriginal; }
  else if (acao === "girar" && o.tipo === "imagem") {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    Object.assign(o, { rot: ((o.rot || 0) + 90) % 360, w: o.h, h: o.w });
    Object.assign(o, { x: cx - o.w / 2, y: cy - o.h / 2 });
  } else if (acao === "espelhar" && o.tipo === "imagem") o.espelharH = !o.espelharH;
  else if (acao === "zerar-ajustes") ["brilho", "contraste", "saturacao", "desfoque", "opacidade", "sombra"].forEach((k) => delete o[k]);
  else if (["conter", "cobrir", "reduzir"].includes(acao) && o.tipo === "imagem") {
    const img = ef.cache.get(o.src)?.img;
    if (img) Object.assign(o, efEncaixar(img, acao === "cobrir" ? "cobrir" : "conter", acao === "reduzir" ? 0.85 : 1, o.rot || 0));
  }
  efHistorico();
  efPainel();
  efDesenhar();
}

function efPontoNaImagem(o, p, iw, ih) {
  const rot = ((o.rot || 0) * Math.PI) / 180;
  const dx = p.x - (o.x + o.w / 2), dy = p.y - (o.y + o.h / 2);
  let rx = dx * Math.cos(-rot) - dy * Math.sin(-rot), ry = dx * Math.sin(-rot) + dy * Math.cos(-rot);
  if (o.espelharH) rx = -rx;
  if (o.espelharV) ry = -ry;
  const dw = (o.rot || 0) % 180 ? o.h : o.w, dh = (o.rot || 0) % 180 ? o.w : o.h;
  return [Math.floor((rx / dw + 0.5) * iw), Math.floor((ry / dh + 0.5) * ih)];
}

async function efRemoverFundo(o, ponto) {
  const img = await efImagem(o.src);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const tela = document.createElement("canvas");
  tela.width = iw;
  tela.height = ih;
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  let dados;
  try { dados = ctx.getImageData(0, 0, iw, ih); }
  catch { throw new Error("Esta imagem veio de outro site e o navegador não deixa editar os pixels. Salve no anúncio e abra de novo."); }
  const px = dados.data, tol = ef.tolerancia * ef.tolerancia * 3;
  const visitado = new Uint8Array(iw * ih), fila = new Int32Array(iw * ih);
  let ini = 0, fim = 0, ref;
  const perto = (k, cor) => {
    const j = k * 4;
    if (px[j + 3] === 0) return true;
    const a = px[j] - cor[0], b = px[j + 1] - cor[1], c = px[j + 2] - cor[2];
    return a * a + b * b + c * c <= tol;
  };
  const semear = (k) => { if (!visitado[k]) { visitado[k] = 1; fila[fim++] = k; } };
  if (ponto) {
    const [x, y] = efPontoNaImagem(o, ponto, iw, ih);
    if (x < 0 || y < 0 || x >= iw || y >= ih) throw new Error("Clique dentro da foto.");
    const k = y * iw + x;
    ref = [px[k * 4], px[k * 4 + 1], px[k * 4 + 2]];
    semear(k);
  } else {
    const borda = [];
    for (let x = 0; x < iw; x += 1) borda.push(x, (ih - 1) * iw + x);
    for (let y = 0; y < ih; y += 1) borda.push(y * iw, y * iw + iw - 1);
    const canais = [0, 1, 2].map((c) => borda.map((k) => px[k * 4 + c]).sort((a, b) => a - b));
    ref = canais.map((v) => v[v.length >> 1]);
    const parecidas = borda.filter((k) => perto(k, ref));
    if (parecidas.length < borda.length * 0.35) throw new Error("O fundo desta foto não é liso. Use \"Tirar fundo clicando\" e clique nas partes do fundo.");
    parecidas.forEach(semear);
  }
  while (ini < fim) {
    const k = fila[ini++];
    const x = k % iw;
    if (!perto(k, ref)) continue;
    px[k * 4 + 3] = 0;
    if (x > 0) semear(k - 1);
    if (x < iw - 1) semear(k + 1);
    if (k >= iw) semear(k - iw);
    if (k < iw * (ih - 1)) semear(k + iw);
  }
  for (let k = 0; k < iw * ih; k++) {
    if (px[k * 4 + 3] === 0) continue;
    const x = k % iw;
    const vizinhoApagado = (x > 0 && px[(k - 1) * 4 + 3] === 0) || (x < iw - 1 && px[(k + 1) * 4 + 3] === 0)
      || (k >= iw && px[(k - iw) * 4 + 3] === 0) || (k < iw * (ih - 1) && px[(k + iw) * 4 + 3] === 0);
    if (vizinhoApagado) px[k * 4 + 3] = Math.min(px[k * 4 + 3], 150);
  }
  ctx.putImageData(dados, 0, 0);
  const blob = await new Promise((ok) => tela.toBlob(ok, "image/png"));
  const src = URL.createObjectURL(blob);
  await efImagem(src);
  if (!o.srcOriginal) o.srcOriginal = o.src;
  o.src = src;
  efHistorico();
  efPainel();
  efDesenhar();
  toast(ponto ? "Cor removida. Clique em outras partes do fundo se precisar." : "Fundo removido.");
}

function efRedimensionar(w, hh) {
  w = Math.round(Math.min(3000, Math.max(300, w || ef.W)));
  hh = Math.round(Math.min(3000, Math.max(300, hh || ef.H)));
  if (w === ef.W && hh === ef.H) return efPainel();
  const s = Math.min(w / ef.W, hh / ef.H), ox = ef.W / 2, oy = ef.H / 2;
  const px = (x) => (x - ox) * s + w / 2, py = (y) => (y - oy) * s + hh / 2;
  for (const o of ef.objetos) {
    if (o.tipo === "seta") Object.assign(o, { x1: px(o.x1), y1: py(o.y1), x2: px(o.x2), y2: py(o.y2), espessura: Math.max(1, o.espessura * s) });
    else if (o.tipo === "traco") Object.assign(o, { pontos: o.pontos.map(([x, y]) => [px(x), py(y)]), espessura: Math.max(1, o.espessura * s) });
    else if (o.tipo === "texto") Object.assign(o, { x: px(o.x), y: py(o.y), tam: Math.max(8, Math.round(o.tam * s)) });
    else Object.assign(o, { x: px(o.x), y: py(o.y), w: o.w * s, h: o.h * s });
  }
  Object.assign(ef, { W: w, H: hh });
  efAjustarPalco();
  efHistorico();
  efPainel();
}

function efEstado() {
  return JSON.stringify({ W: ef.W, H: ef.H, fundo: ef.fundo, objetos: ef.objetos });
}

function efHistorico(inicial = false) {
  clearTimeout(ef.timerHist);
  const atual = efEstado();
  if (ef.hist[ef.pos] === atual) return;
  ef.hist = ef.hist.slice(0, ef.pos + 1);
  ef.hist.push(atual);
  if (ef.hist.length > 80) ef.hist.shift();
  ef.pos = ef.hist.length - 1;
  if (!inicial) ef.sujo = true;
  efBotoesHistorico();
}

function efHistoricoDepois() {
  clearTimeout(ef.timerHist);
  ef.timerHist = setTimeout(() => efHistorico(), 600);
}

function efBotoesHistorico() {
  const d = $('#editor-foto [data-ef="desfazer"]'), r = $('#editor-foto [data-ef="refazer"]');
  if (d) d.disabled = ef.pos <= 0;
  if (r) r.disabled = ef.pos >= ef.hist.length - 1;
}

function efRestaurar(pos) {
  if (pos < 0 || pos >= ef.hist.length) return;
  ef.pos = pos;
  const s = JSON.parse(ef.hist[pos]);
  const mudouTamanho = s.W !== ef.W || s.H !== ef.H;
  Object.assign(ef, { W: s.W, H: s.H, fundo: s.fundo, objetos: s.objetos });
  if (ef.sel >= ef.objetos.length) ef.sel = -1;
  ef.sujo = true;
  if (mudouTamanho) efAjustarPalco();
  efPainel();
  efDesenhar();
  efBotoesHistorico();
}
function efDesfazer() { efHistorico(); efRestaurar(ef.pos - 1); }
function efRefazer() { efRestaurar(ef.pos + 1); }

function efTeclado(e) {
  const raiz = $("#editor-foto");
  if (!raiz || raiz.hidden) return;
  const campo = e.target.closest?.("input, textarea, select");
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === "Escape") {
    e.stopPropagation();
    e.preventDefault();
    if (campo) return e.target.blur();
    if (ef.ferramenta !== "selecionar") return efFerramenta("selecionar");
    return ef.sel >= 0 ? efSelecionar(-1) : efFechar();
  }
  if (campo) return;
  const tecla = e.key.toLowerCase();
  if (ctrl && tecla === "z") { e.preventDefault(); return e.shiftKey ? efRefazer() : efDesfazer(); }
  if (ctrl && tecla === "y") { e.preventDefault(); return efRefazer(); }
  if (ctrl && tecla === "d") { e.preventDefault(); return efAcao("duplicar"); }
  if (ctrl && tecla === "s") { e.preventDefault(); e.stopPropagation(); return; }
  if (ctrl) return;
  if ((e.key === "Delete" || e.key === "Backspace") && ef.sel >= 0) { e.preventDefault(); return efAcao("apagar"); }
  const setas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (setas && ef.sel >= 0) {
    e.preventDefault();
    const passo = e.shiftKey ? 10 : 1, [dx, dy] = setas.map((v) => v * passo);
    efDeslocar(ef.objetos[ef.sel], dx, dy);
    efDesenhar();
    return efHistoricoDepois();
  }
  if (e.key === "[" || e.key === "]") {
    const cfg = ef[ef.ferramenta];
    if (cfg?.espessura) { cfg.espessura = Math.max(2, Math.min(200, cfg.espessura + (e.key === "]" ? 4 : -4))); efPainel(); }
    return;
  }
  if (EF_ATALHOS[tecla]) { e.preventDefault(); efFerramenta(EF_ATALHOS[tecla]); }
}

function efExportar() {
  const tela = document.createElement("canvas");
  tela.width = ef.W;
  tela.height = ef.H;
  efPintar(tela.getContext("2d"));
  const tipo = ef.fundo ? "image/jpeg" : "image/png";
  return new Promise((ok, falha) => tela.toBlob((b) => (b ? ok(b) : falha(new Error("Não consegui gerar a imagem."))), tipo, 0.92));
}

async function efBaixar() {
  const blob = await efExportar();
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: `foto-${ef.W}x${ef.H}.${ef.fundo ? "jpg" : "png"}` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function efSalvar(modo) {
  if (!ef.objetos.length) throw new Error("A imagem está vazia: insira uma foto ou escreva algo antes de salvar.");
  const fd = new FormData();
  fd.append("arquivo", await efExportar(), `editada-${ef.W}x${ef.H}.${ef.fundo ? "jpg" : "png"}`);
  const r = await api("/api/uploads", { method: "POST", body: fd });
  const aoSalvar = ef.opcoes.aoSalvar;
  efFechar(true);
  aoSalvar?.(r.url, modo);
}
