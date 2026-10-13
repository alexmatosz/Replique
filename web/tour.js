const MENU = (rota) => `.lateral nav a[data-rota="${rota}"]`;

const TOURS = {
  boasVindas: () => [
    { titulo: `Bem-vindo ao Replique, ${h((estado.usuario?.nome || "").split(" ")[0])}`,
      texto: "Este é o sistema da Monvatti para pesquisar, criar, publicar e acompanhar anúncios nos marketplaces. Em poucos passos mostramos onde fica cada coisa. Você pode rever este guia quando quiser pelo botão de ajuda no topo." },
    { alvo: ".lateral nav", menu: true, titulo: "Menu principal",
      texto: "Passe o mouse aqui para abrir o menu. Ele está separado por etapas do trabalho: anúncios, acompanhamento, financeiro e gestão." },
    { alvo: "#seletor", titulo: "Cliente em que você está trabalhando",
      texto: "Tudo o que você faz (pesquisas, rascunhos, publicações) fica no cliente escolhido aqui. Troque de loja por este botão." },
    { alvo: MENU("pesquisar"), menu: true, titulo: "1. Pesquisar",
      texto: "Comece por aqui: digite o produto e veja os anúncios que mais vendem, com preço, vendedor e visitas." },
    { alvo: MENU("rascunhos"), menu: true, titulo: "2. Rascunhos",
      texto: "Os anúncios copiados ou criados do zero ficam aqui. É onde você edita título, fotos, características e publica." },
    { alvo: MENU("saude"), menu: true, titulo: "3. Saúde das contas",
      texto: "Acompanhe reclamações, atrasos e cancelamentos antes que virem risco de suspensão no Mercado Livre." },
    { alvo: MENU("lucro"), menu: true, titulo: "4. Financeiro",
      texto: "Veja quanto sobra de cada venda depois de taxas, frete, impostos e custo do produto." },
    { alvo: "#b-ajuda", titulo: "Guia de cada tela",
      texto: "Sempre que entrar numa tela nova, um guia rápido aparece. Para ver de novo, clique neste botão." },
  ],
  pesquisar: [
    { alvo: "#termo", titulo: "Nome do produto", texto: "Quanto mais exato, melhor: inclua marca, modelo e medida. Ex.: “garrafa térmica inox 1 litro”." },
    { alvo: "#modo-ml", titulo: "Como pesquisar no Mercado Livre",
      texto: "“Anúncios do produto” mostra quem vende aquele item. “Mais vendidos da categoria” mostra o ranking da categoria." },
    { alvo: "#f-pesquisa .chips", titulo: "Plataformas", texto: "Marque onde pesquisar. A escolha fica salva para a próxima vez." },
    { alvo: "#b-pesquisar", titulo: "Pesquisar", texto: "Nos resultados, clique em Copiar para trazer o anúncio para os rascunhos e editar." },
    { alvo: "#historico", titulo: "Pesquisas recentes", texto: "Suas pesquisas ficam guardadas aqui para abrir de novo sem gastar outra consulta." },
  ],
  rascunhos: [
    { alvo: "#novo", titulo: "Criar do zero", texto: "Crie um anúncio sem copiar ninguém: você preenche os dados, gera as fotos com IA e ajusta no editor de fotos." },
    { alvo: ".barra-lote", titulo: "Publicação em lote", texto: "Marque vários rascunhos e publique todos de uma vez (até 20 por lote)." },
    { alvo: ".lista-item", titulo: "Seus rascunhos", texto: "Clique em um rascunho para abrir o editor completo do anúncio." },
  ],
  editor: [
    { alvo: "#fotos", titulo: "Fotos do anúncio",
      texto: "A primeira é a capa. Passe o mouse sobre uma foto para mover, editar ou remover." },
    { alvo: "#add-gerar", titulo: "Gerar fotos com IA",
      texto: "A partir de uma foto real, o Replique cria 5 fotos: fundo branco, duas de características, uma em contexto e uma em contexto explicativa." },
    { alvo: "#add-editar", titulo: "Editor de fotos",
      texto: "Redimensione, escreva textos, coloque setas, destaques e selos. Dá também para criar uma imagem do zero." },
    { alvo: "#titulo", titulo: "Título", texto: "O contador mostra o limite de cada marketplace. Evite repetir o título do concorrente." },
    { alvo: "#attrs", titulo: "Características", texto: "Use os nomes que o marketplace pede (Cor, Material, Voltagem). Elas também viram os textos das fotos de características." },
    { alvo: "#b-ia", titulo: "Melhorar com IA", texto: "Reescreve título e descrição para não ficar igual ao anúncio copiado." },
    { alvo: "#b-risco", titulo: "Risco e margem", texto: "Antes de publicar, confira se ainda há foto ou texto do concorrente e quanto sobra de cada venda." },
    { alvo: "#b-checar", titulo: "Checar e publicar", texto: "Checar aponta o que falta para cada marketplace. Depois é só clicar em Publicar." },
  ],
  lotes: [
    { alvo: ".topo h1", titulo: "Publicação em lote", texto: "Aqui você acompanha os lotes enviados. A tela se atualiza sozinha enquanto um lote está publicando." },
  ],
  publicacoes: [
    { alvo: ".topo h1", titulo: "Publicações", texto: "Tudo o que foi enviado aos marketplaces, com quem enviou e em qual conta." },
    { alvo: ".situacao-pub", titulo: "Situação no marketplace", texto: "Consulta o anúncio no Mercado Livre e permite pausar, reativar ou finalizar daqui mesmo." },
  ],
  contas: [
    { alvo: "#ml-conectar", titulo: "Conectar o Mercado Livre", texto: "Conecte a conta da loja para publicar e acompanhar saúde, perguntas e vendas." },
  ],
  saude: [
    { alvo: "#saude-todos", titulo: "Atualizar todas", texto: "Consulta a reputação de todas as contas de uma vez." },
    { alvo: "#saude-lista", titulo: "Situação de cada conta", texto: "Crítico e Atenção aparecem primeiro. Reclamações, cancelamentos e atrasos acima do limite derrubam a reputação." },
  ],
  perguntas: [
    { alvo: "#p-recarregar", titulo: "Perguntas sem resposta", texto: "Busca as perguntas novas dos compradores. Responder rápido melhora a conversão." },
    { alvo: "#p-lista", titulo: "Responder com ajuda da IA", texto: "A IA sugere a resposta com base no anúncio. Confira antes de enviar." },
  ],
  radar: [
    { alvo: "#radar-todos", titulo: "Radar de preço", texto: "Compara o preço dos seus anúncios com o mercado e mostra se dá para subir ou se está caro." },
  ],
  relatorio: [
    { alvo: "#r-mes", titulo: "Mês do relatório", texto: "Escolha o mês. O relatório resume o trabalho feito na loja." },
    { alvo: "#r-imprimir", titulo: "Enviar ao cliente", texto: "Imprima ou salve como PDF para mandar ao lojista." },
  ],
  lucro: [
    { alvo: "#l-mes", titulo: "Mês", texto: "Escolha o período das vendas." },
    { alvo: "#l-sinc", titulo: "Buscar vendas", texto: "Traz as vendas do Mercado Livre com taxas e frete de cada uma." },
    { alvo: "#l-tabela", titulo: "Lucro por venda", texto: "Clique numa venda para ver o cálculo completo: preço, comissão, frete, imposto e custo." },
    { alvo: "#l-simular", titulo: "Simular", texto: "Simule uma venda antes de definir o preço." },
  ],
  produtos: [
    { alvo: "#p-novo", titulo: "Produtos e custos", texto: "Cadastre o custo de cada produto para o lucro sair certo." },
    { alvo: "#p-importar", titulo: "Importar", texto: "Traga os produtos dos anúncios e só complete os custos." },
  ],
  despesas: [
    { alvo: "#f-desp", titulo: "Custo operacional", texto: "Lance aluguel, embalagem, funcionários e outras despesas do mês para ver o lucro real." },
  ],
  impostos: [
    { alvo: "#i-regime", titulo: "Regime tributário", texto: "Informe o regime e as alíquotas. O imposto entra no cálculo de lucro de cada venda." },
  ],
  painel: [
    { alvo: "#f-dias", titulo: "Período", texto: "Veja o que a equipe fez nos últimos dias." },
    { alvo: "#feed", titulo: "Atividade", texto: "Cada pesquisa, cópia, edição e publicação aparece aqui com quem fez." },
  ],
  clientes: [
    { alvo: "#novo-cliente", titulo: "Novo cliente", texto: "Cadastre a loja e envie o link de acesso ao lojista." },
    { alvo: "#busca-clientes", titulo: "Buscar", texto: "Encontre rápido um cliente entre todos os que a Monvatti atende." },
  ],
  config: [
    { alvo: "#b-convidar", titulo: "Equipe", texto: "Convide operadores por e-mail e escolha quais clientes cada um atende." },
  ],
};

const chaveTour = (nome) => `rpq_tour_${estado.usuario?.id || 0}_${nome}`;
const tourVisto = (nome) => { try { return localStorage.getItem(chaveTour(nome)) === "1" || localStorage.getItem(chaveTour("desligado")) === "1"; } catch { return true; } };
const marcarTour = (nome) => { try { localStorage.setItem(chaveTour(nome), "1"); } catch {} };

const tour = { passos: [], i: 0, nome: "" };

function visivel(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function iniciarTour(nome, forcar = false) {
  const lista = typeof TOURS[nome] === "function" ? TOURS[nome]() : TOURS[nome];
  if (!lista || (!forcar && tourVisto(nome))) return false;
  const passos = lista.filter((p) => !p.alvo || visivel($(p.alvo)));
  if (!passos.length) return false;
  Object.assign(tour, { passos, i: 0, nome });
  if (!$("#tour")) {
    document.body.insertAdjacentHTML("beforeend", `<div id="tour" class="tour" hidden>
      <div class="tour-bloqueio"></div><div class="tour-foco"></div>
      <div class="tour-balao" role="dialog" aria-modal="true" aria-labelledby="tour-titulo"></div></div>`);
    window.addEventListener("resize", () => !$("#tour").hidden && posicionarTour());
    window.addEventListener("scroll", () => !$("#tour").hidden && posicionarTour(), true);
  }
  $("#tour").hidden = false;
  mostrarPasso();
  return true;
}

function mostrarPasso() {
  const p = tour.passos[tour.i], ultimo = tour.i === tour.passos.length - 1;
  $(".lateral")?.classList.toggle("tour-aberta", !!p.menu);
  $(".tour-balao").innerHTML = `
    <div class="linha entre" style="gap:8px;flex-wrap:nowrap">
      <span class="tour-passo">${tour.passos.length > 1 ? `Passo ${tour.i + 1} de ${tour.passos.length}` : "Dica"}</span>
      <button type="button" class="icone" data-tour="fechar" aria-label="Fechar guia">${ic("x", "p")}</button></div>
    <h3 id="tour-titulo">${p.titulo}</h3>
    <p>${p.texto}</p>
    <div class="tour-pontos">${tour.passos.map((_, i) => `<i class="${i === tour.i ? "on" : ""}"></i>`).join("")}</div>
    <div class="linha entre" style="gap:8px">
      <button type="button" class="link-sutil" data-tour="desligar">Não mostrar guias</button>
      <span class="linha" style="gap:6px">
        ${tour.i ? `<button type="button" class="sec" data-tour="voltar">Voltar</button>` : ""}
        <button type="button" data-tour="${ultimo ? "fim" : "proximo"}">${ultimo ? "Entendi" : "Próximo"}</button></span></div>`;
  $$("[data-tour]", $(".tour-balao")).forEach((b) => (b.onclick = () => {
    const acao = b.dataset.tour;
    if (acao === "proximo") { tour.i++; mostrarPasso(); }
    else if (acao === "voltar") { tour.i--; mostrarPasso(); }
    else if (acao === "desligar") { marcarTour("desligado"); encerrarTour(); toast("Guias desligados. Para ver de novo, use o botão de ajuda no topo."); }
    else encerrarTour();
  }));
  const alvo = p.alvo && $(p.alvo);
  if (alvo) {
    const r = alvo.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 20) alvo.scrollIntoView({ block: "center", behavior: "instant" });
  }
  setTimeout(posicionarTour, p.menu ? 280 : 0);
  $(".tour-balao [data-tour=proximo], .tour-balao [data-tour=fim]")?.focus({ preventScroll: true });
}

function posicionarTour() {
  const p = tour.passos[tour.i];
  if (!p) return;
  const foco = $(".tour-foco"), balao = $(".tour-balao"), alvo = p.alvo && $(p.alvo);
  if (!alvo || !visivel(alvo)) {
    foco.style.cssText = `left:50%;top:50%;width:0;height:0`;
    balao.style.cssText = `left:${Math.max(16, (innerWidth - balao.offsetWidth) / 2)}px;top:${Math.max(16, (innerHeight - balao.offsetHeight) / 2)}px`;
    balao.classList.add("centro");
    return;
  }
  balao.classList.remove("centro");
  const r = alvo.getBoundingClientRect(), folga = 6;
  foco.style.cssText = `left:${r.left - folga}px;top:${r.top - folga}px;width:${r.width + folga * 2}px;height:${r.height + folga * 2}px`;
  const bw = balao.offsetWidth, bh = balao.offsetHeight, m = 14;
  let x, y;
  if (r.right + m + bw < innerWidth - 16 && (p.menu || r.width < innerWidth / 2)) { x = r.right + m; y = r.top; }
  else if (r.bottom + m + bh < innerHeight - 16) { x = r.left; y = r.bottom + m; }
  else if (r.top - m - bh > 16) { x = r.left; y = r.top - m - bh; }
  else { x = r.left - m - bw; y = r.top; }
  x = Math.min(Math.max(16, x), innerWidth - bw - 16);
  y = Math.min(Math.max(16, y), innerHeight - bh - 16);
  balao.style.cssText = `left:${x}px;top:${y}px`;
}

function encerrarTour() {
  if (!$("#tour") || $("#tour").hidden) return;
  $("#tour").hidden = true;
  $(".lateral")?.classList.remove("tour-aberta");
  marcarTour(tour.nome);
  if (tour.nome === "boasVindas" && !tourVisto(estado._rotaAtual)) setTimeout(() => $("#modal").hidden && iniciarTour(estado._rotaAtual), 350);
}

function tourAutomatico(rota) {
  if (!estado.usuario || !$("#modal").hidden || ($("#tour") && !$("#tour").hidden)) return;
  setTimeout(() => {
    if (estado._rotaAtual !== rota || !$("#modal").hidden) return;
    if (!tourVisto("boasVindas") && iniciarTour("boasVindas")) return;
    iniciarTour(rota);
  }, 450);
}

function abrirAjuda() {
  const rota = estado._rotaAtual;
  if (TOURS[rota] && iniciarTour(rota, true)) return;
  iniciarTour("boasVindas", true);
}
