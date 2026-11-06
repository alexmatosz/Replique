"use strict";

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
        <p class="suave pequeno" style="margin-top:-6px">Use os nomes que o marketplace pede (ex.: “Cor”, “Material”, “Voltagem”). Quando faltar um atributo obrigatório, o Monvatti Radar avisa o nome exato.</p>
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
      <div>${campo("c-category_id", "Categoria (ID)", cfg.category_id, "Vazio = o Monvatti Radar descobre pelo título.")}
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
      ${campo("c-product_type", "Tipo de produto (productType)", cfg.product_type, "Vazio = o Monvatti Radar pergunta à Amazon pelo título.")}
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

function desenharAprovacao() {
  const alvo = $("#aprovacao");
  if (!alvo) return;
  const a = estado.anuncio;
  const textos = {
    "": "Este cliente aprova cada anúncio antes da publicação. Quando o rascunho estiver pronto, peça a aprovação.",
    pendente: "Aguardando o lojista. Ele vê o anúncio e a conta abaixo pelo login da loja e aprova ou questiona. Se mudar o anúncio ou a conta agora, o pedido cai e é preciso pedir de novo.",
    aprovado: `Aprovado em ${data(a.aprovacao_em)}. Se mudar o anúncio, o custo, o imposto, o tipo ou o frete, será preciso aprovar de novo.`,
    recusado: "O lojista questionou. Ajuste e peça a aprovação de novo.",
  };
  alvo.innerHTML = `${seloAprovacao(a.aprovacao)}<p class="pequeno suave" style="margin:6px 0 10px">${textos[a.aprovacao || ""]}</p>
    ${a.aprovacao === "recusado" && a.aprovacao_nota ? `<div class="aviso vermelho">“${h(a.aprovacao_nota)}”</div>` : ""}
    ${a.aprovacao_conta && a.aprovacao ? `<details style="margin-bottom:10px"><summary class="pequeno">Conta enviada ao lojista (${pctConta(a.aprovacao_conta.margem_pct)} de margem)</summary>${contaAprovada(a.aprovacao_conta)}</details>` : ""}
    ${a.aprovacao !== "aprovado" ? `<button class="sec pequeno" id="b-pedir-aprovacao">${ic("aprovar", "p")}${a.aprovacao === "pendente" ? "Pedir de novo" : "Pedir aprovação"}</button>` : ""}`;
  const b = $("#b-pedir-aprovacao");
  if (b) b.onclick = () => comBotao(b, async () => {
    await salvar();
    await api(`/api/anuncios/${a.id}/aprovacao/solicitar`, { method: "POST" });
    estado.anuncio = await api("/api/anuncios/" + a.id);
    desenharAprovacao();
    toast("Pedido enviado com a conta da calculadora. O lojista aprova pelo login da loja.");
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
    <p class="pequeno suave" style="margin-top:-6px">A partir de uma foto real, o Monvatti Radar cria as fotos do anúncio. O produto
      tem que continuar idêntico: confira cada foto antes de usar.</p>
    ${ia ? `<div class="aviso azul">IA de imagem ligada: <b>${ia === "openai" ? "OpenAI" : "Google Gemini"}</b>. As fotos levam de 1 a 3 minutos e seguem
        o estilo de fotos do Padrão da casa. Os textos das fotos são escritos pelo Monvatti Radar, sem erro de português.</div>`
      : `<div class="aviso amarelo"><b>A IA de imagem está desligada.</b> Mesmo assim saem 3 fotos: fundo branco (perfeito só quando a foto
        original já tem fundo liso), destaques e ficha técnica. Para as fotos em contexto e em uso falta a chave de uma IA de imagem:
        o administrador coloca <code>OPENAI_API_KEY</code> ou <code>GEMINI_API_KEY</code> no arquivo .env e reinicia o Monvatti Radar
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
