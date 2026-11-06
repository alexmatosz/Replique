const MENU = (rota) => `.lateral nav a[data-rota="${rota}"]`;

const TOURS = {
  boasVindas: () => [
    { titulo: `Bem-vindo ao Monvatti Radar, ${h((estado.usuario?.nome || "").split(" ")[0])}`,
      texto: "Este é o sistema da Monvatti para pesquisar, criar, publicar e acompanhar anúncios nos marketplaces. Em poucos passos mostramos onde fica cada coisa. Você pode rever este guia quando quiser pelo botão de ajuda no topo." },
    { alvo: ".lateral nav", menu: true, titulo: "Menu principal",
      texto: "Passe o mouse aqui para abrir o menu. Ele está separado em tópicos (anúncios, mercado, vendas e lucro, financeiro...). Clique num tópico para abrir ou fechar os itens dele." },
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
  inicio: [
    { alvo: ".topo h1", titulo: "Visão geral da operação", texto: "Os clientes, os pedidos de anúncio em aberto e atrasados, os rascunhos com problema e as dúvidas sem resposta, sem entrar em nenhum cliente." },
    { alvo: "#vg-linhas", titulo: "Entrar em um cliente", texto: "Clique em Abrir para trabalhar dentro do cliente. Para voltar para cá, use o seletor do topo." },
    { alvo: "#b-sino", titulo: "Notificações", texto: "Pedido atrasado, anúncio com problema, perda de catálogo, concorrente mudando o preço, saúde em risco e Full parado aparecem aqui." },
  ],
  pedidos: [
    { alvo: ".topo h1", titulo: "Pedidos de anúncio", texto: "O consultor pede o anúncio com as instruções; o operador abre, clica em Começar e o rascunho já nasce ligado ao pedido." },
    { alvo: "#pd-abas", titulo: "Situação dos pedidos", texto: "Quando o anúncio é publicado, o pedido fecha sozinho. Prazo vencido ou pedido parado geram aviso no sino." },
  ],
  acompanhamento: [
    { alvo: ".topo h1", titulo: "Acompanhamento", texto: "Saúde da conta, perguntas sem resposta, o que foi publicado no mês e as últimas atividades de cada cliente." },
    { alvo: '[data-aba-ac="relatorio"]', titulo: "Relatório do mês", texto: "O relatório de cada cliente fica aqui: escolha o mês e use Imprimir / PDF para enviar ao lojista." },
  ],
  duvidas: [
    { alvo: "#cx-abas", titulo: "Caixa de dúvidas", texto: "As conversas de cada página ficam aqui. Abra para responder ou vá direto para a página do assunto." },
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
    { alvo: ".barra-lote", titulo: "Publicar selecionados", texto: "Marque os prontos e publique vários de uma vez (até 20), um por vez e com a conferência da conta do cliente." },
    { alvo: ".abas", titulo: "Com problema", texto: "O que falhou fica nesta aba com o motivo. Corrija e use Tentar de novo." },
    { alvo: ".lista-item", titulo: "Seus rascunhos", texto: "Clique em um rascunho para abrir o editor completo do anúncio." },
  ],
  editor: [
    { alvo: "#fotos", titulo: "Fotos do anúncio",
      texto: "A primeira é a capa. Passe o mouse sobre uma foto para mover, editar ou remover." },
    { alvo: "#add-gerar", titulo: "Gerar fotos com IA",
      texto: "A partir de uma foto real, o Monvatti Radar cria 5 fotos: fundo branco, duas de características, uma em contexto e uma em contexto explicativa." },
    { alvo: "#add-editar", titulo: "Editor de fotos",
      texto: "Redimensione, escreva textos, coloque setas, destaques e selos. Dá também para criar uma imagem do zero." },
    { alvo: "#titulo", titulo: "Título", texto: "O contador mostra o limite de cada marketplace. Evite repetir o título do concorrente." },
    { alvo: "#attrs", titulo: "Características", texto: "Use os nomes que o marketplace pede (Cor, Material, Voltagem). Elas também viram os textos das fotos de características." },
    { alvo: "#b-ia", titulo: "Melhorar com IA", texto: "Reescreve título e descrição para não ficar igual ao anúncio copiado." },
    { alvo: "#b-risco", titulo: "Risco e margem", texto: "Antes de publicar, confira se ainda há foto ou texto do concorrente e quanto sobra de cada venda." },
    { alvo: "#b-checar", titulo: "Checar e publicar", texto: "Checar aponta o que falta para cada marketplace. Depois é só clicar em Publicar." },
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
    { alvo: "#radar-filtros", titulo: "Mapeador de produtos", texto: "Mapeia as buscas em alta e os mais vendidos do Mercado Livre. Filtre por categoria, preço e concorrência." },
    { alvo: "#radar-nichos", titulo: "Nichos em alta", texto: "As categorias que mais aparecem nas tendências. Clique numa para filtrar." },
    { alvo: ".formula-nota", titulo: "Como a nota é calculada", texto: "Procura, tendência, concorrência, faixa de preço e margem estimada. Abra para ver os pesos de cada parte." },
    { alvo: "#rm-salvar", titulo: "Filtros salvos e CSV", texto: "Guarde as combinações de filtros que você usa sempre e exporte a lista para planilha." },
  ],
  monitor: [
    { alvo: "#mon-form", titulo: "Acompanhar um anúncio", texto: "Cole o link de um anúncio do cliente ou de um produto de catálogo. De concorrentes, a API do Mercado Livre só libera o que está no catálogo." },
    { alvo: "#mon-corpo .cartao:last-child", titulo: "Catálogo, histórico e alertas", texto: "Mostra se você está ganhando o catálogo e o motivo, o preço para ganhar e o mínimo pela margem. Cada leitura fica guardada e as mudanças vão para o sino." },
  ],
  concorrentes: [
    { alvo: "#cc-form", titulo: "Comparar vendedores", texto: "Cole o link de um produto de catálogo para ver todos os vendedores lado a lado, a faixa de preço e a sua posição." },
  ],
  anuncios: [
    { alvo: ".filtros-meus", titulo: "Todos os anúncios numa tela", texto: "Filtre por plataforma, situação, etiqueta, risco e margem. Marque vários para etiquetar, pausar ou ativar." },
    { alvo: "#ma-visitas", titulo: "Situação e visitas", texto: "A situação e as visitas são lidas sozinhas ao abrir. Pausar, reativar, preço e estoque mudam direto no marketplace, com confirmação." },
  ],
  clonador: [
    { alvo: "#cl-lista", titulo: "Escolha os anúncios", texto: "Marque os anúncios que servem de base. O clone é sempre um rascunho novo." },
    { alvo: "#cl-form", titulo: "Destino e variações", texto: "Outro marketplace, outro cliente ou variações de cor e tamanho. Nada é publicado sem passar pelas travas de sempre." },
  ],
  vendas: [
    { alvo: "#gv-corpo", titulo: "Vendas, custos e lucro", texto: "Os números do mês comparados com o mês anterior, por canal e por produto, com a curva ABC e os alertas do analista." },
  ],
  lucratividade: [
    { alvo: "#lc-margem", titulo: "Margem desejada", texto: "Mude a margem e o preço mínimo de cada produto em cada canal é recalculado." },
  ],
  dre: [
    { alvo: ".tabela-dre", titulo: "DRE simplificado", texto: "Receita, deduções, custos, tarifas, frete, Ads e despesas até o resultado. Passe o mouse no nome da linha para ver de onde vem o número." },
    { alvo: "#dre-pdf", titulo: "Exportar", texto: "Baixe em CSV para planilha ou salve em PDF pela impressão." },
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
  if (alvo?.closest(".topico") && !alvo.closest(".topico").classList.contains("aberto")) abrirTopico(alvo.closest(".topico"));
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
