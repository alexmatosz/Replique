"use strict";

const ACAO_PROMO = { aprovar: ["ok", "Aprovar"], recusar: ["erro", "Recusar"], sem_custo: ["demo", "Conferir custo"], no_ml: ["neutro", "Fazer no ML"] };
const seloAcao = (a) => `<span class="selo ${ACAO_PROMO[a]?.[0] || "neutro"}">${ACAO_PROMO[a]?.[1] || h(a)}</span>`;
const diaHora = (v) => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

async function telaPromocoes(param) {
  if (param === "cliente") return telaPromocoesCliente();
  $("#tela").innerHTML = `<div class="topo"><div><h1>Central de promoções</h1>
    <div class="suave">Anúncios sem promoção, promoções que acabaram ou vão acabar e convites do Mercado Livre de toda a carteira.
      O Monvatti Radar lê cada conta de tempos em tempos e avisa no sino o responsável, a equipe do cliente e os administradores.</div></div>
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
    <div class="suave">Sugestões pela margem mínima do cliente. Nada muda o preço do anúncio: só entra o preço promocional, e o Monvatti Radar confere de novo
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
  const verde = d.margem_verde_pct ?? 5;
  const fonteCusto = { produtos: "Produtos e custos", replique: "anúncio cadastrado no Monvatti Radar" };
  const dica = (t) => {
    if (!t) return "";
    const partes = [`custo ${brl(t.custo)}${t.custo_fonte ? ` (${fonteCusto[t.custo_fonte] || t.custo_fonte})` : ""}`];
    if (t.embalagem) partes.push(`embalagem ${brl(t.embalagem)}`);
    partes.push(`comissão ${brl(t.comissao)} (${pct(t.comissao_pct)})`);
    if (t.taxa_fixa) partes.push(`taxa fixa ${brl(t.taxa_fixa)}`);
    partes.push(`frete ${brl(t.frete)}`, `imposto ${brl(t.imposto)} (${pct(t.imposto_pct)})`);
    if (t.ads) partes.push(`Ads ${brl(t.ads)} (${pct(t.ads_pct)})`);
    return `A ${brl(t.preco)}: ` + partes.join(" · ");
  };
  const margem = (s) => {
    if (s.margem == null) return '<span class="pequeno suave">sem custo</span>';
    const ok = s.margem_ok ?? s.margem >= verde;
    return `<span class="margem-pill ${ok ? "ok" : "ruim"}" title="${h(dica(s.taxas))}">${pct(s.margem)}</span>
      <div class="pequeno suave">ganha ${brl(s.lucro)} por venda</div>`;
  };
  const quem = (a) => (a ? `<div class="pequeno suave">por <b>${h(a.por)}</b> em ${diaHora(a.em)}</div>` : "");
  const enviado = (s) => `<span class="selo ok">enviado</span>${quem(s.aplicada)}`;
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
        <td>${c.aplicado_em ? enviado(c) : seloAcao(c.acao)}<div class="pequeno suave">${h(c.motivo)}</div>
          ${c.ja_em_promocao ? '<div class="pequeno suave">já está em outra promoção</div>' : ""}</td></tr>`).join("")}
      </tbody></table></div>` : vazio("checar", "Nenhum convite esperando", "Quando o Mercado Livre convidar anúncios desta conta para uma campanha, eles aparecem aqui.");
  } else if (aba === "sem") {
    tabela = sem.length ? `<div class="tabela"><table><thead><tr><th></th><th>Anúncio</th><th class="num">Estoque</th><th class="num">Campanha própria</th><th class="num">Margem</th><th>Sugestão</th></tr></thead><tbody>
      ${sem.map((i) => { const s = { ...i.proprio, aplicado_em: i.aplicado_em, aplicada: i.aplicada }; return `<tr><td>${caixa(s, `${i.item_id}|`)}</td><td>${anuncio(i)}</td><td class="num">${numero(i.estoque)}</td>
        <td class="num">${s.preco_sugerido ? `<b>${brl(s.preco_sugerido)}</b><div class="pequeno suave">de ${brl(i.preco_cheio)} (−${pct(s.desconto_pct)})</div>` : "—"}</td>
        <td class="num">${margem(s)}</td><td>${s.aplicado_em ? enviado(s) : seloAcao(s.acao)}<div class="pequeno suave">${h(s.motivo)}</div></td></tr>`; }).join("")}
      </tbody></table></div>` : vazio("checar", "Todos os anúncios ativos estão em promoção");
  } else if (aba === "com") {
    tabela = com.length ? `<div class="tabela"><table><thead><tr><th>Anúncio</th><th class="num">Preço</th><th class="num">Margem agora</th><th>Promoções</th><th>Termina</th></tr></thead><tbody>
      ${com.map((i) => `<tr><td>${anuncio(i)}</td><td class="num">${brl(i.preco)}${i.preco_cheio > i.preco ? `<div class="pequeno suave">de ${brl(i.preco_cheio)}</div>` : ""}</td>
        <td class="num">${i.margem_atual ? margem(i.margem_atual) : '<span class="pequeno suave">sem custo</span>'}</td>
        <td class="pequeno">${i.promocoes.map((p) => `<div>${h(p.nome)} <span class="suave">· ${h(p.tipo_nome)}${p.status === "pending" ? " · programada" : ""}</span></div>`).join("")}
          ${i.aplicada ? `<div class="suave">colocada pelo Monvatti Radar por <b>${h(i.aplicada.por)}</b> em ${diaHora(i.aplicada.em)}</div>` : ""}</td>
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
    ${r.sem_custo ? `<div class="aviso azul pequeno">${numero(r.sem_custo)} anúncio(s) sem custo cadastrado: sem custo o Monvatti Radar não confere a margem. Cadastre em <a href="#/produtos">Produtos e custos</a>.</div>` : ""}
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
    <p class="pequeno suave">Margem = preço da promoção − custo do produto − embalagem − comissão − taxa fixa − frete − imposto − Ads. Verde a partir de ${pct(verde)}, vermelho abaixo.
      Passe o mouse na margem para ver cada parcela. O custo vem de Produtos e custos ou, se o anúncio não estiver ligado a um produto, do anúncio cadastrado no Monvatti Radar que foi publicado nele.
      Comissão e taxa fixa são as do Mercado Livre para a categoria, o tipo do anúncio e o preço da promoção; o frete é o frete grátis calculado pelo ML com o peso do anúncio;
      imposto e Ads vêm das vendas dos últimos 90 dias (o imposto cai para o do Financeiro). Nos convites co-participados
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
