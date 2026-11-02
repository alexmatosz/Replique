"use strict";

const ERROS_GOOGLE = {
  "sem-acesso": "Esta conta Google não tem acesso ao Replique. Peça ao administrador um convite para o seu e-mail.",
  "outro-email": "Você entrou no Google com um e-mail diferente do convidado. Use a conta Google do e-mail que recebeu o convite.",
  "outra-conta": "Este acesso já está ligado a outra conta Google. Entre com ela, ou com e-mail e senha.",
  "ja-ligada": "Esta conta Google já está ligada a outro acesso do Replique.",
  convite: "O convite não vale mais (usado, cancelado ou expirado). Peça um novo ao administrador.",
  desativado: "Este acesso está desativado. Fale com o administrador.",
  cancelado: "O login com Google foi cancelado.",
  sessao: "O login com Google expirou ou foi aberto em outro navegador. Tente de novo.",
  google: "O Google não confirmou a conta. Tente de novo.",
  indisponivel: "O login com Google ainda não foi configurado no servidor.",
};
const LOGO_GOOGLE = `<svg class="logo-google" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

async function mostrarBotaoGoogle(alvo, href, texto = "Entrar com Google") {
  if (!alvo) return;
  try {
    const o = await api("/api/auth/opcoes");
    if (o.google) alvo.innerHTML = `<a class="botao botao-google" href="${h(href)}">${LOGO_GOOGLE}${texto}</a>
      <div class="ou"><span>ou</span></div>`;
  } catch {}
}

async function entrarComGoogle(ticket) {
  try {
    const r = await api("/api/auth/google/entrar", { method: "POST", body: { ticket: ticket || "" } });
    await guardarSessao(r);
    Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null });
    history.replaceState(null, "", "#/");
    roteador();
  } catch (e) {
    telaEntrar("login", "sessao");
  }
}

function telaEntrar(modo = "login", erroGoogle = "") {
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("Replique · gestão de anúncios para marketplaces")}
      <div>
        <div class="selo-topo"><i>MONVATTI</i>Operação de marketplaces em um só lugar</div>
        <h1>Anúncios que vendem, <em>lucro que aparece.</em></h1>
        <p>Pesquise o que mais vende, publique em minutos e acompanhe a saúde das contas e o lucro de cada cliente.</p>
        <div class="recursos">
          ${[["pesquisar", "Pesquisa do que mais vende", "Anúncios líderes, preço, Full e visitas"],
            ["publicar", "Publicação com segurança", "Checagem de risco e limite por conta antes de ir ao ar"],
            ["cifrao", "Lucro real por venda", "Taxas, frete, impostos e Ads descontados"]]
            .map(([i, t, d]) => `<div>${ic(i)}<div><b>${t}</b><span>${d}</span></div></div>`).join("")}
        </div>
        <div class="canais">Integra com <span>Mercado Livre</span><span>Shopee</span><span>Amazon</span></div>
      </div>
      <div class="credito">© ${new Date().getFullYear()} Monvatti · Todos os direitos reservados</div>
    </div>
    <div class="form">${botaoTema()}<div class="caixa">
      <div class="caixa-topo"><img src="/static/monvatti-v.png" alt="" width="34" height="34"><div><b>Replique</b><small>by Monvatti</small></div></div>
      <h2>${modo === "agencia" ? "Criar uma nova agência" : "Bem-vindo de volta"}</h2>
      <div class="suave">${modo === "agencia"
        ? "Cria uma empresa nova e separada no Replique. Lojista: use o link de cadastro que a sua agência enviou."
        : "Entre com o e-mail e a senha do seu acesso."}</div>
      <div style="height:18px"></div>
      ${erroGoogle ? `<div class="aviso vermelho">${h(ERROS_GOOGLE[erroGoogle] || "Não foi possível entrar com Google.")}</div>` : ""}
      ${modo === "agencia" ? "" : '<div id="google-login"></div>'}
      <form id="f-login" class="pilha" ${modo === "agencia" ? "hidden" : ""}>
        <div><label for="le">E-mail</label><input id="le" type="email" name="email" required autocomplete="email"></div>
        <div><div class="linha entre" style="margin-bottom:4px"><label for="ls" style="margin:0">Senha</label>
          <a href="#" class="pequeno" id="l-esqueci">Esqueci minha senha</a></div>
          <input id="ls" type="password" name="senha" required autocomplete="current-password"></div>
        <button type="submit">Entrar</button>
        <p class="pequeno suave" style="margin:4px 0 0">É lojista e ainda não tem acesso? Peça à Monvatti o <b>link de cadastro</b> da sua loja.</p>
      </form>
      <form id="f-cadastro" class="pilha" ${modo === "agencia" ? "" : "hidden"}>
        <div><label for="ce">Nome da empresa</label><input id="ce" type="text" name="empresa" required></div>
        <div><label for="cn">Seu nome</label><input id="cn" type="text" name="nome" required autocomplete="name"></div>
        <div><label for="cm">E-mail</label><input id="cm" type="email" name="email" required autocomplete="email"></div>
        <div><label for="cs">Senha (mín. 8 caracteres)</label><input id="cs" type="password" name="senha" minlength="8" required autocomplete="new-password"></div>
        ${ACEITE_HTML}
        <button type="submit">Criar agência</button>
        <a href="#/entrar" class="pequeno" style="text-align:center">Já tenho acesso</a>
      </form>
      <div class="rodape-caixa">${ic("escudo")}Conexão protegida. A Monvatti nunca pede a sua senha do marketplace.</div>
      ${rodapeLegal()}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Entrar · Replique";
  avisarCapsLock($("#app"));
  $("#l-esqueci").onclick = (e) => { e.preventDefault(); formEsqueci($(".caixa")); };
  if (modo !== "agencia") setTimeout(() => $("#le")?.focus(), 0);
  const enviar = (id, rota) => ($(id).onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button", e.target), async () => {
      const r = await api(rota, { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      await guardarSessao(r);
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null });
      location.hash = "#/";
      roteador();
    });
  });
  enviar("#f-login", "/api/auth/login");
  enviar("#f-cadastro", "/api/auth/cadastro");
  if (erroGoogle) history.replaceState(null, "", "#/entrar");
  mostrarBotaoGoogle($("#google-login"), "/api/auth/google/iniciar");
}

async function telaConvite(token) {
  let empresa = "";
  try { empresa = (await api("/api/convite/" + encodeURIComponent(token || ""))).empresa; }
  catch (e) { empresa = null; }
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("Replique · gestão de anúncios para marketplaces")}
      <div>
        <h1>Cadastre sua loja${empresa ? ` com a ${h(empresa)}` : ""}.</h1>
        <p>Depois do cadastro você conecta a sua conta do Mercado Livre e acompanha, por aqui, cada anúncio que a equipe criar para a sua loja.</p>
        <ol class="passos">
          ${["Cadastre a loja e o seu acesso", "Conecte o Mercado Livre (sem passar a sua senha a ninguém)",
            "A equipe cria e publica os anúncios", "Você acompanha tudo em tempo real"].map((t, i) => `<li><span>${i + 1}</span>${t}</li>`).join("")}
        </ol>
      </div>
      <div class="credito">© ${new Date().getFullYear()} Monvatti · Todos os direitos reservados</div>
    </div>
    <div class="form">${botaoTema()}<div class="caixa">
      ${empresa === null ? `<h2>Link inválido</h2><p class="suave">Este link de cadastro não existe ou foi trocado. Peça um link novo à equipe.</p>
        <a class="botao" href="#/entrar">Ir para o login</a>` : `
      <h2>Cadastro da loja</h2>
      <div class="suave">Leva menos de um minuto.</div>
      <div style="height:18px"></div>
      <form id="f-convite" class="pilha">
        <div><label for="cv-loja">Nome da loja</label><input id="cv-loja" type="text" name="loja" required></div>
        <div><label for="cv-doc">CNPJ ou CPF <span class="suave">(opcional)</span></label><input id="cv-doc" type="text" name="documento"></div>
        <div><label for="cv-nome">Seu nome</label><input id="cv-nome" type="text" name="nome" required autocomplete="name"></div>
        <div><label for="cv-email">E-mail</label><input id="cv-email" type="email" name="email" required autocomplete="email"></div>
        <div><label for="cv-senha">Senha (mín. 8 caracteres)</label><input id="cv-senha" type="password" name="senha" minlength="8" required autocomplete="new-password"></div>
        ${ACEITE_HTML}
        <button type="submit">Criar minha loja</button>
        <a href="#/entrar" class="pequeno" style="text-align:center">Já tenho acesso</a>
      </form>`}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Cadastro da loja · Replique";
  const f = $("#f-convite");
  if (!f) return;
  avisarCapsLock(f);
  $("#cv-loja").focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", f), async () => {
      const r = await api("/api/convite/" + encodeURIComponent(token), { method: "POST", body: Object.fromEntries(new FormData(f)) });
      await guardarSessao(r);
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null, boasVindas: true });
      location.hash = "#/contas";
    });
  };
}

async function telaColaborador(token) {
  let c = null, erro = "";
  try { c = await api("/api/colaborador/" + encodeURIComponent(token || "")); } catch (e) { erro = e.message; }
  $("#app").innerHTML = `
  <div class="entrar">
    <div class="lado">
      ${MARCA("Replique · gestão de anúncios para marketplaces")}
      <div>
        <h1>${c ? `Bem-vindo à equipe da ${h(c.empresa)}.` : "Convite da equipe"}</h1>
        <p>Com o Replique você pesquisa os anúncios que mais vendem, prepara e publica para os clientes da agência.</p>
      </div>
      <div class="credito">© ${new Date().getFullYear()} Monvatti · Todos os direitos reservados</div>
    </div>
    <div class="form">${botaoTema()}<div class="caixa">
      ${!c ? `<h2>Convite indisponível</h2><div class="aviso vermelho">${h(erro)}</div><a class="botao" href="#/entrar">Ir para o login</a>` : `
      <h2>Crie o seu acesso</h2>
      <div class="suave">${h(c.nome)} · <b>${h(c.email)}</b> · ${h(PAPEL[c.papel])}</div>
      <div style="height:18px"></div>
      <div id="google-convite"></div>
      <form id="f-colab" class="pilha">
        <div><label for="co-nome">Seu nome</label><input id="co-nome" type="text" name="nome" value="${h(c.nome)}" required autocomplete="name"></div>
        <div><label for="co-senha">Crie uma senha (mín. 8 caracteres)</label><input id="co-senha" type="password" name="senha" minlength="8" required autocomplete="new-password"></div>
        ${ACEITE_HTML}
        <button type="submit">Criar acesso</button>
        ${c.google ? `<p class="pequeno suave" style="margin:4px 0 0">Com Google, use a conta do e-mail <b>${h(c.email)}</b>: outro e-mail não é aceito.</p>` : ""}
      </form>`}
    </div></div>
  </div>`;
  sincronizarTema();
  document.title = "Convite · Replique";
  if (!c) return;
  if (c.google) mostrarBotaoGoogle($("#google-convite"), "/api/auth/google/iniciar?convite=" + encodeURIComponent(token), "Continuar com Google");
  avisarCapsLock($("#f-colab"));
  $("#f-colab").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("button[type=submit]", e.target), async () => {
      const r = await api("/api/colaborador/" + encodeURIComponent(token), { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      await guardarSessao(r);
      Object.assign(estado, { usuario: null, clienteId: null, clientesInfo: null, pesquisa: null });
      history.replaceState(null, "", "#/");
      roteador();
    });
  };
}

const ACEITE_HTML = `<label class="aceite"><input type="checkbox" name="aceite_termos" value="true" required>
  <span>Li e aceito os <a href="#/termos" target="_blank" rel="noopener">Termos de Uso</a> e a
  <a href="#/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label>`;

function avisarCapsLock(raiz = document) {
  $$('input[type="password"]', raiz).forEach((campo) => {
    if (campo.dataset.caps) return;
    campo.dataset.caps = "1";
    const aviso = document.createElement("div");
    aviso.className = "pequeno aviso-texto caps-aviso";
    aviso.hidden = true;
    aviso.setAttribute("role", "status");
    aviso.textContent = "Caps Lock ligado: a senha diferencia maiúsculas de minúsculas.";
    (campo.closest(".campo-senha") || campo).insertAdjacentElement("afterend", aviso);
    const ver = (e) => { if (e.getModifierState) aviso.hidden = !e.getModifierState("CapsLock"); };
    campo.addEventListener("keydown", ver);
    campo.addEventListener("keyup", ver);
    campo.addEventListener("blur", () => (aviso.hidden = true));
  });
}

function rodapeLegal() {
  return `<p class="pequeno suave legal-links"><a href="#/privacidade">Política de Privacidade</a> · <a href="#/termos">Termos de Uso</a></p>`;
}

function formEsqueci(caixa) {
  const email = $("#le")?.value || "";
  caixa.insertAdjacentHTML("beforeend", "");
  $("#f-login").hidden = true;
  $("#google-login") && ($("#google-login").hidden = true);
  const html = `<form id="f-esqueci" class="pilha">
      <p class="pequeno suave" style="margin:0">Informe o e-mail do seu acesso. Se ele existir, mandamos um link para criar uma senha nova
        (vale por pouco tempo e só uma vez).</p>
      <div><label for="es-email">E-mail</label><input id="es-email" type="email" required autocomplete="email" value="${h(email)}"></div>
      <button type="submit">Enviar link</button>
      <div id="es-resposta" role="status"></div>
      <a href="#/entrar" class="pequeno" style="text-align:center" id="es-voltar">Voltar para Entrar</a></form>`;
  $("#f-login").insertAdjacentHTML("afterend", html);
  $("#es-email").focus();
  $("#es-voltar").onclick = (e) => { e.preventDefault(); telaEntrar(); };
  $("#f-esqueci").onsubmit = (e) => {
    e.preventDefault();
    comBotao($("#f-esqueci button[type=submit]"), async () => {
      const r = await api("/api/auth/esqueci", { method: "POST", body: { email: $("#es-email").value.trim() } });
      $("#es-resposta").innerHTML = `<div class="aviso azul pequeno">${h(r.mensagem)}</div>`;
    });
  };
}

function telaNovaSenha(token) {
  telaEntrar();
  $("#f-login").hidden = true;
  if ($("#google-login")) $("#google-login").hidden = true;
  $(".caixa h2").textContent = "Criar uma senha nova";
  $(".caixa h2 + .suave").textContent = "Escolha uma senha que você não usa em outro site.";
  $("#f-login").insertAdjacentHTML("afterend", `<form id="f-nova-senha" class="pilha">
      <div><label for="ns-senha">Senha nova (mín. 8 caracteres)</label><input id="ns-senha" type="password" minlength="8" required autocomplete="new-password"></div>
      <div><label for="ns-conf">Repita a senha nova</label><input id="ns-conf" type="password" minlength="8" required autocomplete="new-password"></div>
      <p class="pequeno suave" style="margin:0">Ao salvar, você entra no Replique e as sessões abertas em outros aparelhos são encerradas.</p>
      <button type="submit">Salvar e entrar</button>
      <a href="#/entrar" class="pequeno" style="text-align:center">Voltar para Entrar</a></form>`);
  avisarCapsLock($("#f-nova-senha"));
  document.title = "Senha nova · Replique";
  $("#ns-senha").focus();
  $("#f-nova-senha").onsubmit = (e) => {
    e.preventDefault();
    if ($("#ns-senha").value !== $("#ns-conf").value) return toast("As duas senhas não são iguais.", true);
    comBotao($("#f-nova-senha button[type=submit]"), async () => {
      const r = await api("/api/auth/nova-senha", { method: "POST", body: { token, senha: $("#ns-senha").value } });
      history.replaceState(null, "", "#/entrar");
      telaEntrar();
      $("#f-login").insertAdjacentHTML("beforebegin", `<div class="aviso azul pequeno">${h(r.mensagem)}</div>`);
    });
  };
}

async function telaLegal(tipo) {
  let i = {};
  try { i = await api("/api/publico/privacidade"); } catch {}
  const controlador = `${h(i.controlador || "Monvatti")}${i.documento ? `, inscrita sob o nº ${h(i.documento)}` : ""}`;
  const encarregado = i.encarregado_email
    ? `${h(i.encarregado || "Encarregado de dados")} — <a href="mailto:${h(i.encarregado_email)}">${h(i.encarregado_email)}</a>`
    : "a ser informado pelo controlador (canal de atendimento da sua agência)";
  const privacidade = `
    <h1>Política de Privacidade</h1><p class="suave">Versão ${h(i.versao || "")}</p>
    <h2>1. Quem trata os seus dados</h2>
    <p>O Replique é operado por ${controlador} (controladora, nos termos da Lei nº 13.709/2018, a LGPD). Encarregado pelo tratamento
      de dados pessoais: ${encarregado}.</p>
    <h2>2. Quais dados tratamos</h2>
    <ul><li><b>Cadastro:</b> nome, e-mail, foto (opcional) e senha, guardada só como resumo criptográfico (nunca a senha em si).</li>
      <li><b>Da loja:</b> nome e CNPJ ou CPF informados no cadastro.</li>
      <li><b>Contas dos marketplaces:</b> autorizações de acesso (tokens), guardadas criptografadas. A senha do marketplace nunca passa pelo Replique.</li>
      <li><b>Anúncios, fotos, pedidos e vendas</b> que a loja autoriza ler nos marketplaces (valores, taxas e estado de destino dos pedidos).</li>
      <li><b>Registros de acesso:</b> data, hora, endereço IP, porta e navegador de cada entrada, e o histórico do que cada pessoa fez no sistema.</li></ul>
    <h2>3. Para que usamos e com qual base legal</h2>
    <ul><li>Prestar o serviço contratado (criar, publicar e acompanhar anúncios): execução de contrato (LGPD, art. 7º, V).</li>
      <li>Guardar os registros de acesso por no mínimo 6 meses: obrigação legal (Marco Civil da Internet, Lei nº 12.965/2014, art. 15; LGPD, art. 7º, II).</li>
      <li>Segurança da conta, prevenção a fraudes e auditoria de quem fez o quê: legítimo interesse (LGPD, art. 7º, IX).</li>
      <li>Entrar com a conta Google, quando você escolhe essa opção: seu pedido e execução de contrato.</li></ul>
    <h2>4. Com quem compartilhamos</h2>
    <ul><li><b>Marketplaces</b> (Mercado Livre, Shopee, Amazon), pelas APIs oficiais e só com a autorização da loja.</li>
      <li><b>Provedores de inteligência artificial</b>${i.ia_texto || i.ia_imagem ? "" : " (quando ligados pelo administrador)"}: textos e fotos de anúncios
        enviados para gerar títulos, descrições e imagens. Esses provedores ficam fora do Brasil (transferência internacional, LGPD, art. 33).</li>
      <li><b>Hospedagem, banco de dados e envio de e-mail</b>, contratados para operar o serviço.</li>
      <li>Autoridades, quando houver ordem judicial ou obrigação legal.</li></ul>
    <p>Não vendemos dados pessoais e não usamos os seus dados para publicidade.</p>
    <h2>5. Por quanto tempo guardamos</h2>
    <p>Enquanto o contrato durar. Depois, pelo tempo exigido em lei: registros de acesso por no mínimo 6 meses e dados de vendas e
      financeiros pelos prazos fiscais. Encerrados os prazos, os dados podem ser eliminados ou anonimizados.</p>
    <h2>6. Seus direitos</h2>
    <p>Pela LGPD (art. 18) você pode pedir: confirmação de que tratamos seus dados, acesso a eles, correção, anonimização, bloqueio ou
      eliminação do que for desnecessário, portabilidade, informação sobre com quem compartilhamos e revisão de decisões automatizadas.
      No Replique, abra <b>Minha conta › Privacidade e dados</b> para baixar uma cópia dos seus dados ou fazer um pedido. Respondemos
      em até ${h(i.prazo_titular_dias || 15)} dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
    <h2>7. Segurança</h2>
    <p>Senhas com resumo criptográfico, credenciais dos marketplaces criptografadas, conexão HTTPS, limite de tentativas de login,
      encerramento de sessões e registro de atividades. Se houver um incidente de segurança que possa causar risco ou dano relevante,
      comunicaremos a ANPD e os titulares afetados no prazo da regulamentação (LGPD, art. 48).</p>
    <h2>8. Armazenamento no navegador</h2>
    <p>O Replique guarda no seu navegador só o necessário para funcionar: a sessão de acesso e preferências da tela (tema, menu,
      filtros). Não usamos cookies de publicidade nem de rastreamento.</p>
    <h2>9. Crianças e adolescentes</h2><p>O Replique é uma ferramenta profissional e não se destina a menores de 18 anos.</p>
    <h2>10. Mudanças</h2><p>Quando esta política mudar, a versão acima muda e pedimos o seu aceite de novo ao entrar.</p>`;
  const termos = `
    <h1>Termos de Uso</h1><p class="suave">Versão ${h(i.versao || "")}</p>
    <h2>1. O serviço</h2>
    <p>O Replique, operado por ${controlador}, é uma ferramenta para pesquisar, criar, publicar e acompanhar anúncios em marketplaces,
      usada pela agência e pelos lojistas que ela atende.</p>
    <h2>2. Acesso</h2>
    <p>Cada pessoa tem o próprio acesso, pessoal e intransferível. Você é responsável por guardar a sua senha e por avisar a sua
      agência se suspeitar de uso indevido (em Minha conta é possível sair de todos os aparelhos).</p>
    <h2>3. Conteúdo publicado</h2>
    <p>Quem publica é responsável pelo conteúdo dos anúncios (textos, fotos, marcas, preços e características) e por respeitar as regras
      de cada marketplace, os direitos autorais e de marca de terceiros e o Código de Defesa do Consumidor. O Replique avisa quando um
      anúncio parece cópia de outro vendedor, mas não substitui essa conferência.</p>
    <h2>4. Inteligência artificial</h2>
    <p>Textos e imagens gerados por IA são sugestões. Confira se estão corretos e se o produto continua idêntico antes de publicar.</p>
    <h2>5. Dados dos marketplaces</h2>
    <p>Os números vêm das APIs oficiais. Quando a API não entrega um dado, a tela diz isso em vez de estimar. Telas em modo de
      demonstração são identificadas e não representam a sua loja.</p>
    <h2>6. Disponibilidade</h2>
    <p>O serviço pode ficar indisponível para manutenção ou por falhas de terceiros (marketplaces, hospedagem). Mudanças nas APIs dos
      marketplaces podem limitar funções.</p>
    <h2>7. Suspensão</h2>
    <p>O acesso pode ser suspenso em caso de uso indevido, risco à segurança ou fim do contrato. Os dados são tratados conforme a
      Política de Privacidade.</p>
    <h2>8. Privacidade</h2><p>O tratamento de dados pessoais segue a <a href="#/privacidade">Política de Privacidade</a>.</p>
    <h2>9. Lei aplicável</h2><p>Estes termos seguem as leis do Brasil.</p>`;
  $("#app").innerHTML = `<div class="pagina-legal"><div class="legal-topo">${MARCA("Replique")}${botaoTema()}</div>
    <article class="cartao legal-texto">${tipo === "termos" ? termos : privacidade}</article>
    <p class="pequeno suave" style="text-align:center"><a href="#/${tipo === "termos" ? "privacidade" : "termos"}">${tipo === "termos" ? "Política de Privacidade" : "Termos de Uso"}</a> ·
      <a href="#/">Voltar ao Replique</a></p></div>`;
  sincronizarTema();
  document.title = `${tipo === "termos" ? "Termos de Uso" : "Política de Privacidade"} · Replique`;
  window.scrollTo({ top: 0 });
}

function pedirAceite() {
  const u = estado.usuario;
  if (!u?.termos_pendentes || $("#modal-aceite")) return;
  const m = modal(`<div id="modal-aceite"><h2>${ic("escudo", "p")}Termos de Uso e Política de Privacidade</h2>
    <p>Para continuar usando o Replique, confira e aceite a versão ${h(u.termos_versao)} dos
      <a href="#/termos" target="_blank" rel="noopener">Termos de Uso</a> e da <a href="#/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</p>
    <p class="pequeno suave">Eles explicam quais dados o Replique trata, para quê, com quem compartilha e como você pede uma cópia ou a exclusão.</p>
    <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="ac-sair">Sair</button>
      <button type="button" id="ac-aceitar">Li e aceito</button></div></div>`);
  $(".modal-x", m)?.remove();
  $("#modal").dataset.travado = "1";
  $("#ac-sair", m).onclick = () => { delete $("#modal").dataset.travado; fecharModal(); $("#sair")?.click(); };
  $("#ac-aceitar", m).onclick = () => comBotao($("#ac-aceitar", m), async () => {
    await api("/api/me/aceite", { method: "POST" });
    u.termos_pendentes = false;
    delete $("#modal").dataset.travado;
    fecharModal();
    toast("Obrigado. Aceite registrado.");
  });
}

async function privacidadeMinhaConta(alvo) {
  alvo.innerHTML = `<h3 style="margin-top:18px">${ic("escudo", "p")}Privacidade e dados</h3>
    <p class="pequeno suave">Pela LGPD você pode ter uma cópia dos seus dados e pedir correção ou exclusão. Pedidos são respondidos pela
      sua agência no prazo da lei. Registros de acesso são guardados por pelo menos 6 meses por exigência do Marco Civil da Internet.</p>
    <div class="linha"><button type="button" class="sec pequeno" id="pv-baixar">${ic("baixar", "p")}Baixar meus dados</button>
      <button type="button" class="sec pequeno" id="pv-acessos">${ic("relogio", "p")}Meus últimos acessos</button>
      <button type="button" class="sec pequeno" id="pv-pedido">${ic("envelope", "p")}Fazer um pedido</button>
      <a class="pequeno" href="#/privacidade" target="_blank" rel="noopener">Política de Privacidade</a></div>
    <div id="pv-extra" style="margin-top:8px"></div>`;
  $("#pv-baixar").onclick = () => comBotao($("#pv-baixar"), async () => {
    const r = await fetch("/api/me/dados");
    if (!r.ok) throw new Error("Não consegui gerar a cópia agora.");
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: "meus-dados-replique.json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  $("#pv-acessos").onclick = () => comBotao($("#pv-acessos"), async () => {
    const lista = await api("/api/me/acessos");
    $("#pv-extra").innerHTML = lista.length ? `<div class="tabela embutida"><table><thead><tr><th>Quando</th><th>O quê</th><th>IP</th></tr></thead><tbody>
      ${lista.map((a) => `<tr class="${a.sucesso ? "" : "ruim"}"><td class="pequeno">${data(a.criado_em)}</td><td class="pequeno">${h(a.evento_nome)}</td>
        <td class="pequeno" title="${h(a.navegador)}">${h(a.ip)}</td></tr>`).join("")}</tbody></table></div>
      <p class="pequeno suave">Não reconhece algum? Troque a senha e use "Sair de todos os aparelhos".</p>` : '<p class="pequeno suave">Nenhum acesso registrado ainda.</p>';
  });
  $("#pv-pedido").onclick = () => {
    $("#pv-extra").innerHTML = `<form id="pv-form" class="pilha" style="gap:8px">
      <div><label for="pv-tipo">O que você quer</label><select id="pv-tipo"><option value="exclusao">Excluir os meus dados</option>
        <option value="correcao">Corrigir os meus dados</option><option value="acesso">Receber uma cópia completa</option>
        <option value="oposicao">Me opor a um tratamento</option></select></div>
      <div><label for="pv-det">Detalhes (opcional)</label><textarea id="pv-det" maxlength="2000" rows="3"></textarea></div>
      <p class="pequeno suave" style="margin:0">A exclusão é analisada pela sua agência: há dados que a lei manda guardar (registros de acesso e dados fiscais).</p>
      <div class="linha" style="justify-content:flex-end"><button type="submit" class="pequeno">Enviar pedido</button></div></form>`;
    $("#pv-form").onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#pv-form button[type=submit]"), async () => {
        const r = await api("/api/me/pedido-titular", { method: "POST", body: { tipo: $("#pv-tipo").value, detalhes: $("#pv-det").value } });
        $("#pv-extra").innerHTML = `<div class="aviso azul pequeno">Pedido registrado. A resposta chega no sino em até ${r.prazo_dias} dias.</div>`;
      });
    };
  };
}

async function carregarSecaoLgpd() {
  const alvo = $("#sec-lgpd");
  if (!alvo) return;
  const [pedidos, acessosLista, info] = await Promise.all([api("/api/empresa/pedidos-titular"), api("/api/empresa/acessos"), api("/api/publico/privacidade")]);
  const falhas = acessosLista.filter((a) => !a.sucesso).length;
  alvo.innerHTML = `<h2>${ic("escudo", "p")}Privacidade (LGPD) e registro de acessos</h2>
    ${!info.encarregado_email ? `<div class="aviso amarelo pequeno">Falta informar o encarregado de dados (ENCARREGADO_NOME e ENCARREGADO_EMAIL no .env) e,
      se quiser, o CNPJ (CONTROLADOR_DOCUMENTO). Eles aparecem na Política de Privacidade.</div>` : ""}
    <div class="aviso azul pequeno">A Política de Privacidade e os Termos de Uso do Replique são um modelo: revise com um advogado antes de usar com clientes.
      Ao mudar o texto, troque TERMOS_VERSAO no .env para pedir um novo aceite a todos.</div>
    <h3>Pedidos dos titulares</h3>
    ${pedidos.length ? pedidos.map((p) => `<div class="lista-item"><div class="info"><b>${h(p.tipo_nome)} · ${h(p.usuario)}</b>
        <span class="pequeno suave">${data(p.criado_em)} · responder até ${data(p.prazo)}${p.detalhes ? ` · “${h(p.detalhes)}”` : ""}</span>
        ${p.resposta ? `<span class="pequeno">Resposta: ${h(p.resposta)}</span>` : ""}</div>
        ${p.status === "aberto" ? `${p.vencido ? '<span class="selo erro">prazo vencido</span>' : '<span class="selo demo">aberto</span>'}
          <button type="button" class="sec pequeno" data-responder-titular="${p.id}">Responder</button>` : '<span class="selo ok">respondido</span>'}</div>`).join("")
      : '<p class="pequeno suave">Nenhum pedido.</p>'}
    <h3 style="margin-top:16px">Registro de acessos <span class="suave pequeno">(Marco Civil: guardado por pelo menos 6 meses)</span></h3>
    <div class="linha" style="margin-bottom:8px"><span class="pequeno suave">${acessosLista.length} mais recentes · ${falhas} senha(s) errada(s)</span></div>
    <div class="tabela embutida" style="max-height:320px;overflow:auto"><table><thead><tr><th>Quando</th><th>Pessoa</th><th>O quê</th><th>IP</th></tr></thead><tbody>
      ${acessosLista.slice(0, 100).map((a) => `<tr class="${a.sucesso ? "" : "ruim"}"><td class="pequeno">${data(a.criado_em)}</td>
        <td class="pequeno">${h(a.usuario || a.email)}</td><td class="pequeno">${h(a.evento_nome)}</td>
        <td class="pequeno" title="${h(a.navegador)}">${h(a.ip)}</td></tr>`).join("")}</tbody></table></div>`;
  $$("[data-responder-titular]", alvo).forEach((b) => (b.onclick = () => {
    const m = modal(`<h2>Responder pedido LGPD</h2>
      <p class="pequeno suave">Explique o que foi feito (ex.: acesso desativado, dados corrigidos) e o que precisa ser guardado por lei.
        Para desativar um acesso, use Equipe ou Clientes › Gerenciar: o Replique não apaga dados sozinho.</p>
      <textarea id="rt-texto" rows="5" maxlength="2000"></textarea>
      <div class="linha" style="justify-content:flex-end;margin-top:10px"><button class="sec" data-fechar>Cancelar</button><button id="rt-enviar">Enviar resposta</button></div>`);
    $("#rt-enviar", m).onclick = () => comBotao($("#rt-enviar", m), async () => {
      await api(`/api/empresa/pedidos-titular/${b.dataset.responderTitular}/atendido`, { method: "POST", body: { resposta: $("#rt-texto", m).value } });
      fecharModal();
      toast("Resposta enviada ao titular.");
      carregarSecaoLgpd();
    });
  }));
}

async function guardarSessao(r) {
  if (r.precisa_2fa) return pedirCodigo2fa(r.desafio);
  const ok = await fetch("/api/auth/cookie", { method: "POST", headers: { Authorization: "Bearer " + r.token, "X-Replique": "1" } });
  try { localStorage.removeItem("rpq_token"); } catch {}
  if (!ok.ok) throw new Error("Não consegui abrir a sessão. Tente de novo.");
  _ultimaRenovacao = Date.now();
  return true;
}

function pedirCodigo2fa(desafio) {
  return new Promise((resolver, rejeitar) => {
    const m = modal(`<h2>${ic("escudo", "p")}Verificação em duas etapas</h2>
      <p class="pequeno suave">Digite o código de 6 números do app autenticador. Sem o celular? Use um dos códigos de recuperação.</p>
      <form id="f-2fa" class="pilha">
        <div><label for="c2-codigo">Código</label><input id="c2-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="20" required></div>
        <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="c2-cancelar">Cancelar</button><button type="submit">Entrar</button></div>
      </form>`);
    $("#c2-codigo", m).focus();
    $("#c2-cancelar", m).onclick = () => { fecharModal(); rejeitar(new Error("Entrada cancelada.")); };
    $("#f-2fa", m).onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#f-2fa button[type=submit]", m), async () => {
        const r = await api("/api/auth/2fa", { method: "POST", body: { desafio, codigo: $("#c2-codigo", m).value } });
        fecharModal();
        await guardarSessao(r);
        resolver(true);
      });
    };
  });
}

async function sessaoAtual() {
  try {
    const antigo = localStorage.getItem("rpq_token");
    if (antigo) await guardarSessao({ token: antigo }).catch(() => localStorage.removeItem("rpq_token"));
  } catch {}
  const r = await fetch("/api/me").catch(() => null);
  return r?.ok ? r.json() : null;
}

async function encerrarSessaoLocal() {
  await fetch("/api/auth/sair", { method: "POST", headers: { "X-Replique": "1" } }).catch(() => {});
  try { localStorage.removeItem("rpq_token"); sessionStorage.removeItem("rpq_cliente"); } catch {}
}

let _ultimaAtividade = Date.now();
let _ultimaRenovacao = Date.now();
["click", "keydown", "touchstart", "scroll"].forEach((ev) => document.addEventListener(ev, () => { _ultimaAtividade = Date.now(); }, { passive: true, capture: true }));
setInterval(async () => {
  if (!estado.usuario) return;
  const janela = (estado.usuario.inatividade_min || 120) * 60000;
  if (Date.now() - _ultimaAtividade < janela / 2 && Date.now() - _ultimaRenovacao > Math.min(5 * 60000, janela / 4)) {
    try { await api("/api/auth/renovar", { method: "POST" }); _ultimaRenovacao = Date.now(); } catch {}
  }
}, 60000);
setInterval(() => { if (estado.usuario && eTime() && !document.hidden) fetch("/api/ping", { cache: "no-store" }).catch(() => {}); }, 5 * 60000);

async function doisFatoresMinhaConta(alvo) {
  const s = await api("/api/me/2fa").catch(() => null);
  if (!s) return;
  alvo.innerHTML = `<h3 style="margin-top:18px">${ic("escudo", "p")}Verificação em duas etapas</h3>
    <p class="pequeno suave">Além da senha, a entrada pede um código do app autenticador do celular (Google Authenticator, Microsoft Authenticator, Authy…).
      Mesmo que alguém descubra a sua senha, não entra.${s.exigido ? " <b>A sua agência exige para a equipe.</b>" : ""}</p>
    ${s.ativo ? `<div class="linha"><span class="selo ok">ligada</span><span class="pequeno suave">${s.codigos_restantes} código(s) de recuperação restantes</span>
        <button type="button" class="sec pequeno" id="d2-codigos">Gerar novos códigos</button>
        ${s.exigido ? "" : '<button type="button" class="sec pequeno perigo-txt" id="d2-desligar">Desligar</button>'}</div>`
      : `<button type="button" class="pequeno" id="d2-ligar">${ic("escudo", "p")}Ligar verificação em duas etapas</button>`}
    <div id="d2-passos" style="margin-top:8px"></div>`;
  const passos = $("#d2-passos", alvo);
  const pedirSenha = (rotulo, depois) => {
    passos.innerHTML = `<form id="d2-f-senha" class="linha" style="align-items:flex-end"><div style="flex:1;min-width:180px">
      <label for="d2-senha">Confirme a sua senha</label><input id="d2-senha" type="password" required autocomplete="current-password"></div>
      <button type="submit" class="pequeno">${rotulo}</button></form>`;
    $("#d2-senha", passos).focus();
    $("#d2-f-senha", passos).onsubmit = (e) => { e.preventDefault(); comBotao($("#d2-f-senha button", passos), () => depois($("#d2-senha", passos).value)); };
  };
  const mostrarCodigos = (codigos) => {
    passos.innerHTML = `<div class="aviso azul"><b>Guarde estes códigos de recuperação</b> num lugar seguro. Cada um entra uma vez se você perder o celular.
      Eles não aparecem de novo.<pre class="mono codigos-rec">${codigos.map(h).join("\n")}</pre>
      <button type="button" class="sec pequeno" id="d2-copiar">${ic("copiar", "p")}Copiar</button></div>`;
    $("#d2-copiar", passos).onclick = () => navigator.clipboard?.writeText(codigos.join("\n")).then(() => toast("Códigos copiados."));
  };
  if ($("#d2-ligar", alvo)) $("#d2-ligar", alvo).onclick = () => pedirSenha("Continuar", async (senha) => {
    const r = await api("/api/me/2fa/iniciar", { method: "POST", body: { senha } });
    passos.innerHTML = `<ol class="pequeno lista-dicas">
        <li>No celular, abra o app autenticador e escolha <b>adicionar conta › inserir chave</b> (ou toque no link abaixo se estiver no celular).</li>
        <li>Nome da conta: Replique. Chave: <code class="mono">${h(r.segredo)}</code> (baseada em tempo).</li>
        <li>Digite o código de 6 números que aparecer.</li></ol>
      <p class="pequeno"><a href="${h(r.uri)}">Abrir no app autenticador deste aparelho</a></p>
      <form id="d2-f-codigo" class="linha" style="align-items:flex-end"><div style="flex:1;min-width:140px"><label for="d2-codigo">Código do app</label>
        <input id="d2-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
        <button type="submit" class="pequeno">Ligar</button></form>`;
    $("#d2-codigo", passos).focus();
    $("#d2-f-codigo", passos).onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#d2-f-codigo button", passos), async () => {
        const a = await api("/api/me/2fa/ativar", { method: "POST", body: { codigo: $("#d2-codigo", passos).value } });
        estado.usuario.dois_fatores = true;
        estado.usuario.precisa_2fa = false;
        toast("Verificação em duas etapas ligada.");
        await doisFatoresMinhaConta(alvo);
        mostrarCodigos(a.codigos_recuperacao);
        $("#d2-passos", alvo).replaceWith(passos);
      });
    };
  });
  if ($("#d2-codigos", alvo)) $("#d2-codigos", alvo).onclick = () => pedirSenha("Gerar", async (senha) => {
    mostrarCodigos((await api("/api/me/2fa/codigos", { method: "POST", body: { senha } })).codigos_recuperacao);
  });
  if ($("#d2-desligar", alvo)) $("#d2-desligar", alvo).onclick = () => {
    passos.innerHTML = `<form id="d2-f-desligar" class="pilha" style="gap:8px"><div class="grade g2">
        <div><label for="d2-s">Senha</label><input id="d2-s" type="password" required autocomplete="current-password"></div>
        <div><label for="d2-c">Código do app</label><input id="d2-c" inputmode="numeric" maxlength="20" required></div></div>
      <div class="linha" style="justify-content:flex-end"><button type="submit" class="pequeno perigo-txt">Desligar</button></div></form>`;
    $("#d2-f-desligar", passos).onsubmit = (e) => {
      e.preventDefault();
      comBotao($("#d2-f-desligar button", passos), async () => {
        const r = await api("/api/me/2fa/desligar", { method: "POST", body: { senha: $("#d2-s", passos).value, codigo: $("#d2-c", passos).value } });
        await guardarSessao(r);
        estado.usuario.dois_fatores = false;
        toast("Verificação em duas etapas desligada.");
        doisFatoresMinhaConta(alvo);
      });
    };
  };
}

function exigirConfigurar2fa() {
  const u = estado.usuario;
  if (!u?.precisa_2fa || u.termos_pendentes || $("#modal-2fa")) return;
  const m = modal(`<div id="modal-2fa"><h2>${ic("escudo", "p")}Configure a verificação em duas etapas</h2>
    <p>A sua agência passou a exigir, para a equipe, um código do app autenticador além da senha. Leva um minuto.</p>
    <div id="m2-area"></div>
    <div class="linha" style="justify-content:flex-end;margin-top:10px"><button type="button" class="sec" id="m2-sair">Sair</button></div></div>`);
  $(".modal-x", m)?.remove();
  $("#modal").dataset.travado = "1";
  $("#m2-sair", m).onclick = () => { delete $("#modal").dataset.travado; fecharModal(); $("#sair")?.click(); };
  doisFatoresMinhaConta($("#m2-area", m)).then(() => {
    const ver = setInterval(() => {
      if (!estado.usuario?.precisa_2fa) {
        clearInterval(ver);
        const fim = $("#m2-sair", m);
        if (fim) { fim.textContent = "Concluir"; fim.onclick = () => { delete $("#modal").dataset.travado; fecharModal(); roteador(); }; }
      }
    }, 500);
  });
}

async function carregarSecaoSeguranca() {
  const alvo = $("#sec-seguranca");
  if (!alvo) return;
  const s = await api("/api/empresa/seguranca");
  const sem = s.pessoas.filter((p) => p.papel !== "cliente" && !p.dois_fatores);
  alvo.innerHTML = `<h2>${ic("chave", "p")}Segurança dos acessos</h2>
    <p class="pequeno suave">Sessão: encerra depois de ${s.inatividade_min} min sem uso e no máximo ${s.sessao_horas} h depois da entrada.
      Senhas comuns, sequências e palavras do nome ou do e-mail são recusadas. Para trocar a senha de alguém, gere um link: o administrador não escolhe senha.</p>
    <label class="confirmacao"><input type="checkbox" id="sg-exigir" ${s.exigir_2fa ? "checked" : ""}>
      <span><b>Exigir verificação em duas etapas para a equipe</b> <span class="pequeno suave">(admin, operador e consultor; lojistas podem ligar se quiserem).
      ${sem.length ? `${sem.length} pessoa(s) da equipe ainda sem: ${sem.slice(0, 6).map((p) => h(p.nome)).join(", ")}${sem.length > 6 ? "…" : ""}.` : "Toda a equipe já usa."}</span></span></label>`;
  $("#sg-exigir", alvo).onchange = (e) => comBotao(e.target, async () => {
    try { await api("/api/empresa/seguranca", { method: "PUT", body: { exigir_2fa: e.target.checked } }); toast("Configuração salva."); }
    catch (err) { e.target.checked = !e.target.checked; throw err; }
  });
}

async function carregarSecaoExtensao() {
  const alvo = $("#sec-extensao");
  if (!alvo) return;
  const s = await api("/api/extensao/admin");
  alvo.innerHTML = `<h2>${ic("pesquisar", "p")}Extensão Monvatti Pro</h2>
    <p class="pequeno suave">Extensão do Chrome para estudar anúncios no Mercado Livre e levar um anúncio para o Replique.
      Só funciona para quem estiver liberado aqui, em um navegador por pessoa, e só com o navegador logado numa conta de estudo
      (ou deslogado). Logado numa conta de cliente, ela fica bloqueada.</p>
    <p class="pequeno"><b>Contas de estudo:</b> ${s.estudo.length ? s.estudo.map((c) => `${h(c.nome)} ${c.conta_ml ? `<span class="selo ok">${h(c.conta_ml)}</span>`
      : '<span class="selo erro">ML não conectado</span>'}`).join(" · ") : '<span class="aviso-texto">nenhuma. Em Clientes › Gerenciar, marque um cliente interno como “Cliente interno de estudo” e conecte a conta do ML dele.</span>'}</p>
    <div class="tabela" style="margin:0 -20px -20px"><table><thead><tr><th>Pessoa</th><th>Liberada</th><th>Navegador ligado</th><th></th></tr></thead><tbody>
      ${s.pessoas.map((p) => `<tr class="${p.ativo ? "" : "inativo"}"><td><b>${h(p.nome)}</b><div class="pequeno suave">${h(p.email)}</div></td>
        <td><label class="confirmacao" style="margin:0"><input type="checkbox" data-ext-liberar="${p.id}" ${p.liberada ? "checked" : ""} ${p.ativo ? "" : "disabled"}> ${p.liberada ? "sim" : "não"}</label></td>
        <td class="pequeno">${p.navegador ? `${h(p.navegador.nome || "Chrome")}<div class="suave">desde ${data(p.navegador.desde)}${p.navegador.ultimo_uso ? ` · último uso ${data(p.navegador.ultimo_uso)}` : ""}</div>`
          : '<span class="suave">nenhum</span>'}</td>
        <td style="text-align:right;white-space:nowrap">${p.liberada && !p.navegador ? `<button class="sec pequeno" data-ext-codigo="${p.id}" data-nome="${h(p.nome)}">Gerar código</button>` : ""}
          ${p.navegador ? `<button class="sec pequeno perigo-txt" data-ext-desligar="${p.navegador.id}" data-nome="${h(p.nome)}">Desligar navegador</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
  $$("[data-ext-liberar]", alvo).forEach((i) => (i.onchange = () => comBotao(i, async () => {
    await api("/api/extensao/admin/usuarios/" + i.dataset.extLiberar, { method: "PUT", body: { liberada: i.checked } });
    toast(i.checked ? "Extensão liberada. Gere o código para ligar o navegador." : "Extensão bloqueada e navegador desligado.");
    carregarSecaoExtensao();
  })));
  $$("[data-ext-desligar]", alvo).forEach((b) => (b.onclick = () => {
    if (!confirm(`Desligar o navegador de ${b.dataset.nome}? A extensão para de funcionar nele até um novo código.`)) return;
    comBotao(b, async () => {
      await api("/api/extensao/admin/dispositivos/" + b.dataset.extDesligar, { method: "DELETE" });
      toast("Navegador desligado.");
      carregarSecaoExtensao();
    });
  }));
  $$("[data-ext-codigo]", alvo).forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const r = await api(`/api/extensao/admin/usuarios/${b.dataset.extCodigo}/codigo`, { method: "POST" });
    modal(`<h2>${ic("chave", "p")}Código da extensão para ${h(b.dataset.nome)}</h2>
      <p class="pequeno">Na extensão, clique no ícone da Monvatti e cole este código. Vale ${r.validade_min} minutos.
        O primeiro navegador que usar o código fica ligado a esta pessoa; outro navegador só depois que você desligar este.</p>
      <pre class="mono" style="white-space:pre-wrap;word-break:break-all">${h(r.codigo)}</pre>
      <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="ext-copiar">${ic("copiar", "p")}Copiar</button><button data-fechar>Fechar</button></div>`);
    $("#ext-copiar").onclick = () => navigator.clipboard?.writeText(r.codigo).then(() => toast("Código copiado."));
  })));
}

async function linkDeSenha(id, nome) {
  if (!confirm(`Gerar um link para ${nome} criar uma senha nova? A senha atual continua valendo até a pessoa usar o link.`)) return;
  const r = await api(`/api/empresa/usuarios/${id}/link-senha`, { method: "POST" });
  modal(`<h2>${ic("chave", "p")}Link de senha para ${h(nome)}</h2>
    <p class="pequeno">${r.enviado ? "Enviamos o link por e-mail." : `Não foi enviado por e-mail (${h(r.motivo)}). Copie e mande por um canal seguro.`}
      Vale ${r.validade_min} minutos e uma vez só.</p>
    <pre class="mono" style="white-space:pre-wrap;word-break:break-all">${h(r.link)}</pre>
    <div class="linha" style="justify-content:flex-end"><button type="button" class="sec" id="ls-copiar">${ic("copiar", "p")}Copiar</button><button data-fechar>Fechar</button></div>`);
  $("#ls-copiar").onclick = () => navigator.clipboard?.writeText(r.link).then(() => toast("Link copiado."));
}
