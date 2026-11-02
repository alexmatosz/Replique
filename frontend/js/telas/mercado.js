"use strict";

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
