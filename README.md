# Replique — Monvatti

Sistema para **descobrir os anúncios que mais vendem** no Mercado Livre, na Shopee e na Amazon,
**copiar** o melhor para dentro do Replique, **editar** (título, fotos, características, preço) e
**publicar** nas lojas da empresa, tudo por API.

Foi feito para uma **agência (a Monvatti) atender muitos clientes**: cada cliente tem as próprias
contas de marketplace, rascunhos e publicações; a equipe trabalha nos clientes atribuídos a ela; e
tudo o que é feito fica registrado (quem, o quê, para qual cliente e quando). Várias agências podem
usar o mesmo servidor, cada uma isolada das outras.

```
Pesquisar  →  Ver os mais vendidos  →  Copiar  →  Editar  →  Publicar em 1, 2 ou 3 marketplaces
```

Também dá para operar tudo **conversando com o Claude**, pelo servidor MCP (veja a seção 6).

---

## 1. Abrir o Replique (modo demonstração, sem configurar nada)

Dê **duplo clique em `iniciar.bat`**. Na primeira vez ele prepara o ambiente (demora 1 ou 2 minutos)
e depois abre o navegador em http://127.0.0.1:8000.

Pelo terminal, o equivalente é:

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

No primeiro uso (banco vazio), crie a agência pelo endereço `#/nova-agencia`. Depois disso o cadastro de
agências fica fechado e os lojistas entram pelo link de cadastro (tela Clientes).

Sem nenhuma credencial, tudo funciona em **modo demonstração**: a pesquisa traz produtos fictícios
(sempre os mesmos para o mesmo termo) e a publicação é **simulada**. Cada tela deixa claro quando
algo é demonstração. Serve para apresentar o produto e treinar quem vai usar.

## 2. Como cada plataforma funciona (e por quê)

| | Pesquisa dos mais vendidos | Publicação |
|---|---|---|
| **Mercado Livre** | Ranking oficial **/highlights** (top 20 mais vendidos da categoria). A categoria é descoberta pelo termo digitado. | `POST /items` + descrição, upload de fotos e checagem dos atributos obrigatórios da categoria |
| **Shopee** | **API de Afiliados** (`productOfferV2`, ordenado por vendas). É o único caminho oficial para ver produtos de *outros* vendedores; a API de vendedor só enxerga a própria loja. | Open Platform v2 (`add_item`), com categoria sugerida, upload de imagens e canais de envio ativos da loja |
| **Amazon** | SP-API **Catalog Items** com **salesRanks** (ranking de vendas; quanto menor, mais vende) + preço competitivo | SP-API **Listings Items**. Se o anúncio veio da Amazon, cria uma **oferta no mesmo ASIN** (a Amazon não permite duplicar produto do catálogo) |

A coluna **popularidade (0–100)** coloca os três sinais na mesma régua para ordenar tudo junto:
1º lugar no ranking do ML = 100; na Shopee, escala logarítmica de vendas; na Amazon, escala do sales rank.

### Limitações honestas
- **Shopee:** a API de Afiliados só entrega título, preço, vendas e a **foto principal**. Descrição e
  demais fotos precisam ser completadas no editor.
- **Amazon:** exige conta de vendedor profissional e aplicativo registrado na SP-API. Criar produto
  novo exige o `productType` e os atributos da categoria; a Amazon devolve a lista do que falta.
- **Mercado Livre** (testado com a API real em 24/09/2026): a pesquisa exige a conta conectada.
  O ranking de mais vendidos mistura três tipos, e a API libera dados diferentes para cada um:
  - **Produto de catálogo:** vem completo (nome, fotos, características, descrição, preço de cada
    vendedor e categoria). É o que se copia melhor.
  - **Anúncio avulso de outro vendedor:** título, fotos e preço são **bloqueados** pelo ML (só o dono
    do anúncio pode ler). O Replique mostra a posição, as visitas, um trecho da descrição e o link.
  - **Produto de vendedor (MLBU):** só a posição e o link.

  Se a categoria detectada não for a do produto, troque com um clique na barra "Categoria do ranking".
  Contas sem endereço de despacho não conseguem anunciar (erro `address_pending`). Anúncios cujo
  título não bate com a foto são pausados pela moderação do ML, e o Replique mostra o motivo.

### Sobre copiar anúncios de concorrentes
Copiar a *estrutura* de um anúncio que vende bem é estratégia comum. Publicar o **mesmo texto e as
mesmas fotos** de outro vendedor, porém, pode gerar denúncia por violação de propriedade intelectual
e pausa do anúncio, além de ser penalizado como conteúdo duplicado. Por isso o Replique:
- avisa na checagem quando as fotos ainda são as do anúncio copiado;
- avisa quando o título está idêntico ao do concorrente;
- tem o botão **Melhorar com IA**, que reescreve título e descrição com palavras próprias.

Recomende aos clientes que usem **fotos próprias** do produto.

## 3. Configurar as credenciais (arquivo `.env`)

O `.env` guarda as credenciais **do aplicativo Replique**, configuradas uma vez só pela Monvatti.
As contas de vendedor de cada empresa são conectadas depois, pela tela **Contas**, e ficam
**criptografadas** no banco.

### Mercado Livre
1. https://developers.mercadolivre.com.br/devcenter → **Criar aplicação**.
2. **Redirect URI:** `https://oauth.pstmn.io/v1/callback` (o ML não aceita "localhost"; essa página
   do Postman só mostra o código para você copiar). Quando o Replique estiver num domínio real, use
   `https://SEU-DOMINIO/api/contas/mercadolivre/callback` e a conexão fica automática.
3. **Permissões:** "Publicação e sincronização" = *Leitura e escrita*.
4. Copie App ID e Secret para `ML_CLIENT_ID` e `ML_CLIENT_SECRET`.
5. No Replique: **Contas → Autorizar no Mercado Livre →** copie a URL da página final **→ Conectar**.
6. **Renovação automática (importante):** sem **acesso off-line**, o ML não entrega o `refresh_token` e a
   conexão vale só 6 horas (a tela Contas mostra até que horas). Em *Minhas aplicações → Editar →
   Autenticação e segurança*, habilite o fluxo **Refresh Token** / acesso off-line e salve. Depois,
   reconecte a conta uma vez: a partir daí o Replique renova o acesso sozinho (o `refresh_token` vale
   6 meses e é trocado a cada renovação). Se a opção estiver desabilitada, fale com o suporte de
   desenvolvedores do ML.

### Shopee
- **Pesquisa (por empresa, na tela Contas):** cadastro em https://affiliate.shopee.com.br/open_api
  → copie **AppId** e **Secret**.
- **Publicação:** registre um app em https://open.shopee.com (tipo *Seller In House System* ou
  *ERP System*), coloque `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY` no `.env`. Enquanto o app estiver
  em teste, use `SHOPEE_HOST=https://partner.test-stable.shopeemobile.com`.
  Na tela Contas: **Autorizar loja** → copie a URL final (tem `code=` e `shop_id=`) → **Conectar**.

### Amazon
1. Seller Central → **Aplicativos e serviços → Desenvolver aplicativos** → registre o app (papéis:
   *Product Listing* e *Pricing*).
2. Copie o client ID/secret do LWA para `AMAZON_LWA_CLIENT_ID` / `AMAZON_LWA_CLIENT_SECRET`.
3. Na tela Contas de cada empresa: **refresh token** (autorização do app) + **Seller ID**.

### IA (opcional)
Chave em https://console.anthropic.com → `ANTHROPIC_API_KEY`. Modelo padrão: `claude-opus-5`
(troque em `ANTHROPIC_MODEL`). Sem a chave, o Replique usa regras automáticas: tira palavras
proibidas ("novo", "frete grátis"…), corrige MAIÚSCULAS e respeita o limite de caracteres.

Depois de mudar o `.env`, feche e abra o `iniciar.bat` de novo.

## 4. Clientes, equipe e acompanhamento

| Papel | O que faz |
|---|---|
| **Administrador** (Monvatti) | Vê todos os clientes. Cadastra clientes e logins, define quais operadores atendem cada cliente, acompanha tudo no **Painel**. |
| **Operador** (Monvatti) | Só vê os clientes atribuídos a ele. Pesquisa, copia, edita e publica. Não conecta contas. |
| **Cliente** (lojista) | Login próprio. **Autoriza as contas da loja** (a senha do marketplace nunca passa pela equipe) e acompanha, só leitura, os anúncios, as publicações e quem fez cada um. |

**Primeiros passos:** Clientes → *Novo cliente* → *Gerenciar* → crie o **login do cliente** e marque
os **operadores**. Envie ao lojista o e-mail e a senha inicial: ele entra, abre **Contas** e autoriza o
Mercado Livre. Os operadores são criados em Configurações → *Novo acesso*.

**Seletor de cliente (topo da tela):** a equipe escolhe em qual cliente está trabalhando. Pesquisa,
rascunhos, publicações e contas são sempre do cliente selecionado.

**Travas para não misturar contas de clientes:**
- a publicação usa **sempre as contas do cliente dono do rascunho**, nunca o cliente que estiver
  selecionado na tela (ao abrir um rascunho, o seletor muda sozinho para o dono);
- na confirmação de publicação aparecem o cliente e o apelido da conta, e é preciso marcar
  "Conferi que esta é a conta de …" antes de publicar de verdade;
- a mesma conta de vendedor **não pode ser ligada a dois clientes**;
- o link de autorização do ML carrega o cliente assinado: colar a autorização de um cliente em outro é recusado;
- desativar um operador ou um cliente corta o acesso na hora; nada é apagado.

**Painel:** anúncios publicados, rascunhos criados e falhas por período, **por cliente** e **por
pessoa da equipe**, publicações por dia, clientes sem o Mercado Livre conectado e a linha do tempo de
atividades (filtrável por cliente, operador e tipo). O lojista vê a mesma tela restrita à loja dele.
Ações feitas pelo Claude (MCP) aparecem como "Claude (MCP)".

**API de Afiliados da Shopee:** é da Monvatti (Configurações) e vale para a pesquisa de todos os clientes.

**Dados antigos:** ao abrir esta versão pela primeira vez, tudo o que já existia (contas conectadas,
rascunhos, pesquisas, publicações) vai para um cliente com o nome da empresa. Renomeie em Clientes.

### Publicação em lote

Em **Rascunhos**, marque vários (até 20) e clique em **Publicar em lote**. O Replique:
1. **confere tudo sem publicar**: o que está pronto, o que está bloqueado e por quê, em qual conta
   vai ser publicado e quantas publicações a conta ainda pode fazer hoje;
2. pede a confirmação "Conferi que esta é a conta de …";
3. coloca na **fila**, que publica **um anúncio por vez**. Acompanhe em **Publicação em lote**.

Travas, todas configuráveis no `.env`:

| Trava | Padrão | Por quê |
|---|---|---|
| Rascunhos por lote (`LOTE_MAX_ANUNCIOS`) | 20 | lotes pequenos são fáceis de revisar |
| Intervalo entre publicações reais (`LOTE_INTERVALO_S`) | 20 s | publicação em rajada parece robô |
| Publicações reais por conta em 24 h (`LIMITE_DIARIO_POR_CONTA`) | 50 | crescer aos poucos protege a reputação |
| Para após falhas seguidas (`LOTE_PARAR_APOS_FALHAS`) | 3 | sequência de recusas indica problema no lote |
| Moderação do ML pausou um anúncio | para na hora | anúncios moderados em sequência prejudicam a conta |
| Já publicado / mesmo GTIN / mesmo título | pula | anúncio duplicado é infração no ML |

Tudo é conferido de novo na hora de publicar cada item. Um lote parado pode ser **retomado** de onde
parou, depois de corrigir o motivo. Os números do Painel já contam as publicações dos lotes.

## 5. Usando no dia a dia

1. **Pesquisar:** digite o produto, marque as plataformas e clique em Pesquisar. Aparecem os mais
   vendidos, a faixa de preço (mínimo, mediana, máximo) e o líder de cada plataforma.
2. **Copiar:** no card escolhido. O anúncio vira um rascunho no Replique.
3. **Editar:** título (com contador para o limite de cada plataforma), fotos (enviar, colar link,
   reordenar, remover), preço, estoque, marca, EAN, peso, medidas, características e ajustes por
   plataforma (categoria, tipo de anúncio, garantia…).
4. **Checar:** mostra o que bloqueia e o que é recomendação em cada plataforma. Para o Mercado Livre,
   o Replique também **valida no próprio ML sem publicar** (`/items/validate`), o que cobre as regras de
   qualquer categoria, inclusive as condicionais (ex.: GTIN obrigatório em Parafusadeiras).
   - **Atributos obrigatórios:** a aba Mercado Livre lista os obrigatórios da categoria com as opções
     válidas. O Replique preenche sozinho a partir das características copiadas (tolerando plural e
     acentos), da ficha do catálogo e do título (quando só uma opção aparece nele).
   - **Catálogo:** a seção "Catálogo do Mercado Livre" mostra se o produto existe no catálogo (busca
     por GTIN e por texto no domínio da categoria). Confirme que a ficha é exatamente o seu produto e
     escolha *Lista geral + Catálogo* (padrão, dois anúncios ligados com o mesmo preço e estoque),
     *Só lista geral* ou *Só catálogo*. Para um anúncio já publicado só na lista geral, use
     "Colocar anúncio já publicado no catálogo".
5. **Publicar:** confirma, envia e mostra o link de cada anúncio criado. Tudo fica em **Publicações**.

Limites de título: Mercado Livre 60 · Shopee 120 · Amazon 200 caracteres (cortados sem quebrar palavra).

## 6. Usar pelo Claude (MCP)

**MCP** (Model Context Protocol) é o "plugue" padrão que deixa o Claude usar as ferramentas de um
sistema. Com ele você conversa assim:

> "Pesquise *garrafa térmica* no Mercado Livre e na Shopee, copie o mais vendido, escreva um título
> melhor, coloque o preço 5% abaixo da mediana e me mostre antes de publicar."

O Claude chama as ferramentas do Replique: `listar_clientes`, `pesquisar_mais_vendidos`, `copiar_anuncio`,
`editar_rascunho`, `checar_rascunho` e `publicar_rascunho`. Pesquisa, cópia e listagem recebem
`cliente_id` (com um cliente só, ele é usado automaticamente). `publicar_rascunho` **só publica com
`confirmar=true`**, e as instruções do servidor mandam o Claude pedir a sua aprovação antes.

**Passo 1 — gere a chave:** no Replique, **Configurações → Gerar chave MCP**. Copie (aparece uma vez só).

**Passo 2a — Claude Desktop:** abra `%APPDATA%\Claude\claude_desktop_config.json` e adicione:

```json
{
  "mcpServers": {
    "replique": {
      "command": "C:\\meuprojeto\\Monvatti\\replique\\.venv\\Scripts\\python.exe",
      "args": ["C:\\meuprojeto\\Monvatti\\replique\\mcp_server.py"],
      "env": { "REPLIQUE_API_KEY": "rpq_COLE_A_CHAVE_AQUI" }
    }
  }
}
```

Reinicie o Claude Desktop. O "replique" aparece na lista de ferramentas.

**Passo 2b — Claude Code (terminal):**

```bash
claude mcp add replique --env REPLIQUE_API_KEY=rpq_COLE_A_CHAVE_AQUI -- C:\meuprojeto\Monvatti\replique\.venv\Scripts\python.exe C:\meuprojeto\Monvatti\replique\mcp_server.py
```

O servidor MCP usa **o mesmo banco e as mesmas regras** da tela web: o que o Claude faz aparece na
tela, e vice-versa.

## 7. Organização do código

```
replique/
├── app/
│   ├── main.py              # aplicação web (FastAPI) + interface
│   ├── config.py            # lê o .env
│   ├── models.py            # tabelas: Empresa, Cliente, Usuario, AcessoCliente, ContaMarketplace,
│   │                        #          Pesquisa, Anuncio, Publicacao, Atividade (auditoria)
│   ├── security.py          # senhas, sessões, criptografia das credenciais
│   ├── api/                 # rotas HTTP (auth, contas, anúncios, gestão: clientes/usuários/painel)
│   ├── services/
│   │   ├── replique.py      # FLUXO PRINCIPAL: pesquisar, copiar, editar, checar, publicar
│   │   ├── acesso.py        # quem pode ver/editar qual cliente
│   │   ├── auditoria.py     # registro de atividades (quem fez o quê)
│   │   ├── lotes.py         # publicação em massa: fila e travas
│   │   ├── fotos.py         # travas de segurança das fotos (arquivos e rede interna)
│   │   ├── conteudo.py      # regras de título e descrição
│   │   └── ia.py            # melhoria com Claude (opcional, com fallback)
│   └── marketplaces/
│       ├── base.py          # contrato comum + régua de popularidade
│       ├── mercadolivre.py  # ML: highlights, items, publicação
│       ├── shopee.py        # Shopee: afiliados (pesquisa) + Open Platform (publicação)
│       ├── amazon.py        # Amazon SP-API: catálogo, preço, listings
│       ├── demo.py          # modo demonstração
│       └── registry.py      # escolhe real x demonstração por cliente
├── web/                     # interface (HTML/CSS/JS puro, sem build)
├── mcp_server.py            # servidor MCP para o Claude
├── tests/                   # 91 testes automatizados
└── data/                    # banco SQLite, fotos enviadas e chave secreta (NÃO versionar)
```

Para adicionar outra plataforma (Magalu, TikTok Shop…): crie `app/marketplaces/nova.py` herdando
de `Marketplace` com `pesquisar`, `obter_anuncio` e `publicar`, e registre em `registry.py` e em
`PLATAFORMAS` (`base.py`). A tela, a API e o MCP passam a oferecer a nova plataforma automaticamente.

Rodar os testes: `.venv\Scripts\python -m pytest -q`

## 8. Segurança

- **Senhas:** guardadas com PBKDF2 (240 mil iterações). Senhas óbvias (`12345678`, `monvatti2026`…) são
  recusadas ao criar acessos e **não entram pela internet**. Cada um troca a própria senha clicando no avatar.
- **Tentativas de login:** 5 senhas erradas no mesmo e-mail (ou 20 no mesmo IP) bloqueiam por 15 min.
- **Sessões:** trocar senha, papel ou desativar um acesso encerra as sessões abertas daquela pessoa.
- **Tokens dos marketplaces:** criptografados no banco com a chave de `data/secret.key` (ou `SECRET_KEY`).
  Faça backup dessa chave junto com o banco: sem ela os tokens não podem ser lidos.
- **Fotos:** só fotos enviadas pela própria empresa ou links da internet pública. O servidor não lê
  arquivos fora da pasta de fotos e não acessa endereços internos (proteção contra SSRF).
- **Navegador:** política de segurança de conteúdo (só roda JavaScript do próprio Replique), proteção
  contra clickjacking e HTTPS forçado quando publicado.
- **Cadastro de agência** fechado (lojista entra pelo link); `/docs` da API desligado (`HABILITAR_DOCS=true`
  para desenvolvimento).
- **Isolamento:** cada consulta confere empresa e cliente; testes automáticos cobrem os acessos cruzados.
- **Primeiro administrador:** pela internet a tela de cadastro fica fechada mesmo com o banco vazio (senão
  um estranho viraria o admin). Num servidor, crie com `python criar_admin.py`.
- **IP real:** o limite de tentativas usa o IP de quem acessa. Configure `PROXY_MODO` conforme a hospedagem
  (`cloudflare`, `xff` com `PROXY_IPS` do proxy, ou `nenhum`): cabeçalhos de IP só valem vindos do proxy.
- **Limites de uso por hora** (IA, pesquisas, fotos geradas, envios) e tamanho máximo de requisição
  (`MAX_REQUISICAO_MB`): uma conta invadida não queima créditos nem martela os marketplaces.
- **Fila de lotes com reserva no banco:** com vários processos (`--workers`), só um publica cada item.
- **Renovação de token com trava:** fila e tela não renovam o token do ML/Shopee ao mesmo tempo (o refresh
  token vale uma vez só). Com vários processos a trava é por processo; o ideal é rodar um processo só.
- **Sair de todos os aparelhos:** no avatar › Minha conta.

## 8.1 Ferramentas de acompanhamento

- **Nota de risco** (editor › Risco e margem, e na hora de publicar): foto igual à do concorrente
  (compara a "impressão digital" da imagem, mesmo reescalada), título/descrição copiados, marca com programa
  de proteção (`MARCAS_PROTEGIDAS`), preço muito abaixo, publicação em rajada.
- **Calculadora de margem:** tarifa (oficial do ML quando a conta está conectada; Shopee/Amazon pelos
  percentuais do `.env`), frete grátis do ML (precisa de peso e medidas), imposto e custo. Mostra o preço
  mínimo para a margem mínima (`MARGEM_MINIMA_PCT`).
- **Aprovação do lojista:** em Clientes › Gerenciar, marque "O lojista aprova cada anúncio". A equipe pede a
  aprovação no editor; o lojista aprova ou pede ajustes pelo login dele. Sem aprovação nada é publicado (nem
  em lote, nem pelo MCP), e editar o conteúdo depois de aprovado pede nova aprovação.
- **Gerador de fotos** (editor › Fotos › Gerar fotos): a partir de uma foto real gera fundo branco (capa),
  características (infográfico com texto exato), produto em contexto e demonstração de uso. Contexto e
  demonstração precisam de `OPENAI_API_KEY` ou `GEMINI_API_KEY`; sem chave, o fundo branco funciona quando a
  foto já tem fundo liso e o infográfico funciona sempre. Confira se o produto ficou idêntico antes de usar.
- **Saúde das contas:** termômetro, reclamações, cancelamentos e atrasos com os limites oficiais do MLB, e
  anúncios pausados pela moderação. Avisa a partir de 70% do limite do verde.
- **Radar de preço:** compara os anúncios publicados no ML com os concorrentes do mesmo produto e sugere
  preço sem descer da margem mínima. Aplicar muda o preço do anúncio publicado (pede confirmação).
- **Perguntas:** perguntas sem resposta do ML; a IA sugere com base no anúncio e o operador envia. Respostas
  com telefone, e-mail, link ou rede social são barradas (o ML pune).
- **Relatório do mês** por cliente, pronto para imprimir ou salvar em PDF (o lojista também vê o dele).

### Publicar para teste (grátis)

Dê duplo clique em **`publicar-teste.bat`**. Ele confere se nenhuma conta usa senha padrão (e não abre se
houver), sobe o Replique e abre um túnel da Cloudflare com um endereço `https://….trycloudflare.com`
que funciona de qualquer lugar. Limitações: só fica no ar enquanto o computador e a janela estiverem
abertos, e o endereço muda a cada vez (mande o novo link de cadastro aos lojistas de teste).

## 9. Para vender como produto (próximos passos)

O que já está pronto: empresas isoladas, clientes com contas próprias, papéis admin/operador/cliente,
auditoria completa, credenciais criptografadas, chave MCP por empresa, histórico de pesquisas e publicações.

Antes de colocar clientes pagantes:
1. **Hospedar** num servidor com domínio e HTTPS (ex.: Railway, Render, uma VPS) e definir
   `PUBLIC_BASE_URL`, `SECRET_KEY` fixa e os redirects de OAuth apontando para o domínio.
2. **Banco:** trocar SQLite por PostgreSQL (`DATABASE_URL=postgresql+psycopg://...`) e adicionar
   Alembic para migrações.
3. **Homologar os apps** em cada marketplace (ML e Shopee revisam apps que atendem terceiros;
   a Amazon exige aprovação para apps públicos).
4. **Cobrança e planos** (campo `plano` já existe na empresa), recuperação de senha, limites de uso.
5. **MCP remoto:** hoje o MCP roda na máquina do usuário (stdio), com a chave da empresa numa
   variável de ambiente. Para oferecer MCP hospedado aos clientes (`python mcp_server.py streamable-http`),
   é preciso trocar essa chave fixa por autenticação a cada requisição (OAuth do MCP), senão todos
   os clientes compartilhariam a mesma empresa.
6. Jurídico: termos de uso deixando claro que o cliente é responsável pelo conteúdo publicado
   (textos e fotos próprios).
