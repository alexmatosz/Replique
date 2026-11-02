"use strict";

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
