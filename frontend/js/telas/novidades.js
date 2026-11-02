"use strict";

const PLAT_NOVIDADE = { geral: "Geral", mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon" };
const TEMA_NOVIDADE = { promocao: "Promoção", frete: "Frete", tarifa: "Tarifa", regra: "Regra", publicacao: "Publicação" };

function novidadeVista() {
  try { return +localStorage.getItem("rpq_novidade_vista") || 0; } catch { return 0; }
}

async function contarNovidades(lista) {
  try {
    lista ||= await api("/api/novidades");
    const vista = novidadeVista();
    estado.novidadesNovas = lista.filter((n) => n.id > vista).length;
    desenharContadores();
  } catch {}
}

async function telaNovidades() {
  const equipe = eEquipe();
  $("#tela").innerHTML = `<div class="topo"><div><h1>Novidades</h1>
    <div class="suave">Mudanças dos marketplaces que mexem no preço e na margem: datas promocionais, frete, tarifas e regras.
      Vale o que a plataforma divulga e o que muda sem aviso, percebido pela equipe ou pelo próprio Replique.</div></div>
    ${equipe ? `<div class="linha"><button class="sec" id="nv-verificar" title="Confere campanhas novas do ML, tarifas das categorias em uso e o frete cobrado nas contas conectadas. Também roda sozinho uma vez por dia.">${ic("trocar", "p")}Verificar agora</button>
      <button id="nv-nova">${ic("mais")}Registrar novidade</button></div>` : ""}</div>
    <div class="abas" id="nv-filtros"></div>
    <div id="nv-lista"><div class="carregando"><span class="girando"></span> Carregando…</div></div>`;
  const lista = await api("/api/novidades");
  const vista = novidadeVista();
  try { localStorage.setItem("rpq_novidade_vista", String(Math.max(vista, ...lista.map((n) => n.id), 0))); } catch {}
  estado.novidadesNovas = 0;
  desenharContadores();
  let filtro = "";
  const desenhar = () => {
    const temas = [...new Set(lista.map((n) => n.tema))];
    $("#nv-filtros").innerHTML = [["", "Todas"], ...temas.map((t) => [t, TEMA_NOVIDADE[t] || t])]
      .map(([k, n]) => `<button data-nv-tema="${k}" class="${filtro === k ? "ativa" : ""}">${n} (${lista.filter((x) => !k || x.tema === k).length})</button>`).join("");
    $$("[data-nv-tema]").forEach((b) => (b.onclick = () => { filtro = b.dataset.nvTema; desenhar(); }));
    const visiveis = lista.filter((n) => !filtro || n.tema === filtro);
    $("#nv-lista").innerHTML = visiveis.length ? visiveis.map((n) => `<section class="cartao" style="margin-bottom:12px${n.id > vista ? ";border-left:3px solid var(--azul)" : ""}">
        <div class="linha entre"><div class="linha" style="gap:6px">
          <span class="selo neutro">${h(PLAT_NOVIDADE[n.plataforma] || n.plataforma)}</span>
          <span class="selo ${n.tema === "promocao" ? "ok" : n.tema === "frete" || n.tema === "tarifa" ? "demo" : "neutro"}">${h(n.tema_nome)}</span>
          <span class="selo ${n.fonte === "oficial" ? "ok" : "erro"}">${h(n.fonte_nome)}</span>
          ${n.id > vista ? '<span class="selo ok">nova</span>' : ""}</div>
          <span class="pequeno suave">${new Date(n.data + "T12:00:00").toLocaleDateString("pt-BR")}</span></div>
        <h2 style="margin:8px 0 4px">${h(n.titulo)}</h2>
        ${n.texto ? `<p style="white-space:pre-wrap;margin:0 0 8px">${h(n.texto)}</p>` : ""}
        ${n.impacto ? `<div class="aviso azul pequeno"><b>O que muda para o lojista:</b> ${h(n.impacto)}</div>` : ""}
        <div class="linha" style="margin-top:8px">
          ${urlSegura(n.link) ? `<a class="botao sec pequeno" href="${h(n.link)}" target="_blank" rel="noopener">Ver na fonte ${ic("externo", "p")}</a>` : ""}
          ${equipe && !n.do_sistema ? `<button class="sec pequeno perigo-txt" data-nv-excluir="${n.id}">${ic("lixo", "p")}Excluir</button>` : ""}</div>
      </section>`).join("") : `<div class="cartao">${vazio("sino", "Nenhuma novidade aqui ainda")}</div>`;
    $$("[data-nv-excluir]").forEach((b) => (b.onclick = () => {
      if (!confirm("Excluir esta novidade?")) return;
      comBotao(b, async () => { await api(`/api/novidades/${b.dataset.nvExcluir}`, { method: "DELETE" }); telaNovidades(); });
    }));
  };
  desenhar();
  const verificar = $("#nv-verificar");
  if (verificar) verificar.onclick = () => comBotao(verificar, async () => {
    const r = await api("/api/novidades/verificar", { method: "POST" });
    toast((r.novas ? `${r.novas} novidade(s) encontrada(s).` : "Nada novo desde a última verificação.") + (r.avisos.length ? " " + r.avisos.join(" ") : ""), !!r.avisos.length && !r.novas);
    if (r.novas) telaNovidades();
  });
  const nova = $("#nv-nova");
  if (nova) nova.onclick = () => {
    const m = modal(`<h2>Registrar novidade</h2>
      <form id="nv-form" class="pilha">
        <div class="grade g3">
          <div class="campo"><label for="nv-plat">Plataforma</label><select id="nv-plat" name="plataforma">${Object.entries(PLAT_NOVIDADE).map(([k, n]) => `<option value="${k}" ${k === "mercadolivre" ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          <div class="campo"><label for="nv-tema">Tema</label><select id="nv-tema" name="tema">${Object.entries(TEMA_NOVIDADE).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
          <div class="campo"><label for="nv-fonte">Fonte</label><select id="nv-fonte" name="fonte"><option value="oficial">Divulgado pela plataforma</option><option value="percebido">Percebido no uso</option></select></div></div>
        <div class="campo"><label for="nv-titulo">Título</label><input id="nv-titulo" name="titulo" required minlength="3" maxlength="200" placeholder="Ex.: 11.11 com inscrição aberta até 05/11"></div>
        <div class="campo"><label for="nv-texto">O que aconteceu</label><textarea id="nv-texto" name="texto" maxlength="5000"></textarea></div>
        <div class="campo"><label for="nv-impacto">O que muda para o lojista</label><textarea id="nv-impacto" name="impacto" maxlength="2000" style="min-height:60px"></textarea></div>
        <div class="grade g2">
          <div class="campo"><label for="nv-link">Link da fonte (opcional)</label><input id="nv-link" name="link" type="url" placeholder="https://"></div>
          <div class="campo"><label for="nv-data">Data</label><input id="nv-data" name="data" type="date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
        <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" data-fechar>Cancelar</button><button id="nv-salvar">Registrar</button></div>
      </form>`);
    $("#nv-form", m).onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#nv-salvar", m), async () => {
        const corpo = Object.fromEntries(new FormData(e.target));
        if (!corpo.data) delete corpo.data;
        await api("/api/novidades", { method: "POST", body: corpo });
        fecharModal();
        toast("Novidade registrada.");
        telaNovidades();
      });
    };
  };
}
