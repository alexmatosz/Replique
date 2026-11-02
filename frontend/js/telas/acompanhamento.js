"use strict";

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
  <div id="ac-aprovacoes"></div>
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
  desenharAprovacoes($("#ac-aprovacoes"), aprovar, () => telaAcompanhamento(param));
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
