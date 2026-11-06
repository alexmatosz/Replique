"use strict";

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
    <div class="aviso azul pequeno">Responda rápido: o tempo de resposta pesa na conversão. O Monvatti Radar barra telefone, e-mail, links e redes sociais,
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
