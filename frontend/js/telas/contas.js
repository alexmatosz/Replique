"use strict";

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
