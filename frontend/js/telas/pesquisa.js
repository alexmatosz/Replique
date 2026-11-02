"use strict";

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
