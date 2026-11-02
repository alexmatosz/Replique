# Plano da revisão do Replique

Criado em 23/10/2026. Situação de cada item: **pronto**, **parcial** ou **pendente**.

Objetivo do produto: facilitar a criação de anúncios, controlar as contas dos clientes em conjunto,
acompanhar o cliente e ajudar o consultor. Tarefas e projetos ficam no CRM Timer.

Regras desta revisão: sem commit, push ou branch; sem mexer no armazenamento de fotos (só usar
`services/fotos.py`); nada é apagado do banco (telas e rotas saem, tabelas e dados ficam); tudo funciona em
modo demonstração e avisa na tela; só APIs oficiais, e o que a API não entrega aparece como "não disponível".

## O que já existe (conferido no código antes de começar)

| Área | Onde está | O que se aproveita |
|---|---|---|
| Menu em tópicos (acordeão, bolinha, estado no navegador) | `web/app.js` (`menuCompleto`, `menuLateralHtml`), `web/app.css` | Só refinar (fase 1) |
| Projetos, tarefas e reuniões | `api/projetos.py`, telas `projeto` e `tarefas`, tabelas `projetos`, `tarefas`, `notas_tarefa`, `reunioes` | Sai da interface e das rotas (fase 2a). As tabelas ficam |
| Visão geral da equipe (Início) | `api/projetos.py` `/api/visao-geral` | Muda para pedidos de anúncio em vez de tarefas |
| Publicação em lote (fila e travas) | `services/lotes.py`, `api/lotes.py`, tela `lotes` | A fila continua; a tela sai e a publicação fica em Rascunhos (fase 2b) |
| Publicações | tela `publicacoes`, `services/publicacoes.py` | Situação ao vivo e ações. Entra em Meus Anúncios |
| Meus Anúncios | tela `anuncios`, `services/meus_anuncios.py` | Base da tela única (fase 2c) |
| Copiar por link e clonar | `services/replique.py`, `services/clonador.py` | Usado por "Começar" nos pedidos (fase 3) |
| Gerador de fotos (OpenAI ou Gemini) | `services/gerador_fotos.py`, `IMAGENS_PROVEDOR` | Mostrar o provedor ativo na tela (fase 4) |
| IA de texto (Claude) | `services/ia.py` | Passa a seguir o Padrão da casa e os exemplos (fase 4) |
| Fila em segundo plano com reserva no banco | `services/lotes.py` (`_reservar`) | Modelo para o agendador (fase 5) |
| Saúde, perguntas, relatório | `services/saude.py`, `perguntas.py`, `relatorio.py` | Atualização automática e tópico Acompanhamento (fases 5 e 8) |
| Estoque Full pela API (unidades e entradas) | `services/estoque_full.py` | Alerta de 2 meses na central de notificações (fase 6) |
| Radar de anúncios e concorrentes | `services/monitor.py`, `concorrentes.py`, `radar.py`, `margem.py` | Completar com catálogo (buy box) e linha do tempo (fase 7) |
| Vendas, custos, DRE, analista | `services/financeiro.py`, `rentabilidade.py`, `analista.py` | Um tópico só, liberado por cliente (fase 9) |

## O que vai mudar (por fase)

1. **Menu lateral:** ícones e área de toque maiores (também no celular), tópico diferente dos subitens,
   um tópico aberto por vez (o da tela atual), estado lembrado, bolinha de pendências e rótulos mais curtos.
2. **Enxugar:** (a) esconder projetos e tarefas (tabelas preservadas); (b) tirar a tela de lote e levar
   "Publicar selecionados", motivo da falha, filtro "Com problema" e "Tentar de novo" para Rascunhos;
   (c) unir Publicações e Meus Anúncios numa tela só, "Meus Anúncios", com os links antigos redirecionando.
3. **Pedidos de anúncio:** consultor pede, operador começa (rascunho já vinculado), status e fechamento
   automático ao publicar, avisos de prazo, painel do consultor.
4. **IA:** provedor de imagem por variável e visível na tela, Padrão da casa (agência e cliente), exemplos
   aprovados, contador e limite mensal de uso, modelo de texto configurável.
5. **Atualização automática:** agendador com reserva no banco, intervalos por variável, "Atualizado às HH:MM"
   e um "Atualizar agora" pequeno, rota leve de verificação.
6. **Notificações internas** (sino) e alerta de Full parado há 2 meses.
7. **Radar de anúncios e concorrentes:** catálogo (ganhando ou perdendo e o motivo), precificação, taxas,
   logística, histórico e alertas; concorrentes por link com linha do tempo.
8. **Acompanhamento:** saúde, perguntas (filtro por cliente) e relatório num tópico só.
9. **Vendas e Lucro:** um tópico só, desligado por padrão e liberado por cliente.
10. **Skill de revisão** e `docs/RELATORIO-REVISAO.md`.

## O que fica de fora

- WhatsApp e Digisac (decisão tomada).
- Estimar vendas ou visitas de concorrentes: a API não entrega, a tela diz "não disponível".
- Mudar o armazenamento das fotos (feito em separado).
- Funcionalidades novas no editor de fotos além de correções e do fluxo gerar → ajustar → usar.

## Andamento

(atualizado ao fim de cada fase)

### Fase 1 — Menu lateral: **pronto**
Ícones de 24 px nos tópicos e 20 px nos subitens, área de toque de 46 px (50 px no celular), tópico em destaque com seta,
subitens recuados com linha guia e texto menor, grupos separados, um tópico aberto por vez (o da tela atual), estado
lembrado no navegador (`rpq_menu_topico`), bolinha de pendências no tópico fechado e rótulos encurtados.

### Fase 2 — Enxugar: **pronto**
- (a) Saíram as telas Projeto e Tarefas, "Novo projeto", "Nova tarefa", reuniões e as rotas `/api/projetos`, `/api/tarefas`,
  `/api/reunioes` e `/api/acompanhamento` (arquivo `app/api/projetos.py` removido). As tabelas `projetos`, `tarefas`,
  `notas_tarefa` e `reunioes` e os dados continuam no banco. O MCP não tinha ferramentas de projeto (nada a mudar).
  `#/projeto` e `#/tarefas` levam ao Início (equipe) ou ao Painel (lojista).
- (b) A tela "Publicação em lote" saiu. Em Rascunhos: seleção de vários, "Publicar selecionados" (mesma conferência da conta
  do cliente e mesma fila com travas), andamento da fila no topo, motivo da falha em cada rascunho (inclusive o que a fila
  pulou), aba "Com problema" e "Tentar de novo". `#/lotes` leva a Rascunhos.
- (c) Publicações e Meus Anúncios lidavam com as mesmas linhas da tabela `publicacoes`: Publicações mostrava a situação ao vivo
  e as ações; Meus Anúncios juntava a isso vendas, margem, risco, etiquetas, visitas e CSV. A base foi **Meus Anúncios**, que
  ganhou pausar, reativar, preço e estoque (com confirmação), aviso de "outra conta", "Tirar da lista" e leitura automática
  da situação e das visitas. `#/publicacoes` leva a `#/anuncios`. Finalizar e excluir no marketplace ficaram de fora da
  tela por não serem ações seguras.

### Fase 3 — Pedidos de anúncio: **pronto**
Tabela `pedidos_anuncio` e coluna `anuncios.pedido_id`. Consultor ou admin cria (cliente, marketplaces, link ou texto,
quantidade, prazo, legenda com negrito e lista, operador que atende o cliente). Operador vê "Meus pedidos", abre com as
instruções ao lado e clica em Começar: link do Mercado Livre vira cópia; sem link, rascunho em branco com o texto. As
instruções aparecem também no editor. Status Pendente, Em andamento, Rascunho pronto, Publicado e Com problema; o pedido
fecha sozinho quando os anúncios pedidos estão no ar. Atrasado e parado (`PEDIDO_PARADO_DIAS`) avisam operador e consultor.
Tudo na auditoria. Lojista não vê. Painel do consultor por operador, por cliente e atrasados. Início passou a usar pedidos.

### Fase 4 — IA, fotos, títulos e descrições: **pronto**
- **Pronto:** provedor de imagem por `IMAGENS_PROVEDOR` (OpenAI ou Gemini), modelos em variáveis, tela mostrando o que está
  ligado e o que falta; modelo de texto separado e barato (`ANTHROPIC_MODEL_TEXTO`, padrão `claude-haiku-5-5`), análises em
  `ANTHROPIC_MODEL`; Padrão da casa da agência e por cliente (título por marketplace, descrição, tom, palavras proibidas e
  obrigatórias, estilo das fotos) usado pela IA de texto, pelas regras sem IA e pelo gerador de fotos; "Aprovar como modelo"
  e "Salvar como exemplo" com até 3 referências por categoria; uso de IA por cliente e mês com limite e aviso no sino.
- **Editor de fotos:** só o fluxo gerar → ajustar → usar foi simplificado (passos escritos no resultado, cada foto gerada pode
  ser desmarcada, botões com nome claro). Não encontrei outro defeito; o armazenamento das fotos não foi tocado.
- **Revisão completa do `editor-fotos.js` (feita depois):** corrigidos três defeitos: ao salvar, uma imagem ainda carregando podia sair
  faltando na foto; erro no Baixar não aparecia; Ctrl+S era engolido sem salvar (agora salva no anúncio).

### Fase 5 — Atualização automática: **pronto**
`services/agendador.py` com reserva no banco (tabela `tarefas_agendadas`), leituras por cliente (`leituras_automaticas`),
intervalos por variável, aviso no sino depois de 3 falhas seguidas, "Atualizado às HH:MM" e "Atualizar agora" pequeno em
Perguntas, Saúde, Radar, Meus preços, Full e Vendas e taxas, rota `/api/ping` e README explicando a hospedagem gratuita.

### Fase 6 — Notificações e Full: **pronto**
Sino no topo com lida/não lida, filtro por cliente e link direto. Tipos: pedido atrasado/parado, anúncio com problema, perda
de catálogo, concorrente mudou o preço, saúde em risco, Full parado há 2 meses, limite de IA, relatório pronto e tarefa
automática falhando. **Full:** deu para fazer pela API oficial (`/inventories/{id}/stock/fulfillment` e as entradas
`INBOUND_RECEPTION`), então não foi preciso o registro manual. O tempo no Full é calculado pelas entradas (as mais antigas
saem primeiro); a tarifa de armazenagem não vem pela API e continua configurada por cliente.

### Fase 7 — Radar e concorrentes: **pronto**
- **Pronto:** disputa de catálogo pela API oficial `/items/{id}/price_to_win` (ganhando/perdendo, motivo traduzido, preço
  para ganhar, vencedor, impulsos), concorrente mais barato no catálogo, preço mínimo pela margem, aviso quando ganhar o
  catálogo dá prejuízo, linha do tempo das mudanças, concorrente vinculado a um anúncio meu, alertas no sino.
- **Conferido com conta real (depois):** `price_to_win` responde no anúncio próprio com o motivo (`no_improvement_price`:
  baixar só o preço não ganha) e as vantagens do vencedor (Full, frete grátis, entrega no mesmo dia), que a tela mostra.
  Acrescentados o custo do frete grátis e a nota e o total de avaliações dos anúncios do cliente.
- **API entrega:** do próprio anúncio, tudo (preço, estoque, visitas, tipo, logística, catálogo); de concorrentes, só o que
  está no produto de catálogo (preço, frete, tipo de anúncio, logística, vendedor, posição no preço).
- **API não entrega:** `/items` e visitas de outro vendedor (403, conferido em 23/10), vendas de concorrente, posição na busca,
  tarifa de armazenagem do Full, avaliações de anúncios de outros vendedores (403, conferido).

### Fase 8 — Acompanhamento: **pronto**
Tópico com Visão geral (nova, com a aba Relatório do mês dentro dela), Saúde, Central de perguntas (filtro por cliente já
existia) e Dúvidas. O Relatório do mês deixou de ser item do menu; `#/relatorio` e `#/relatorio/AAAA-MM` abrem a aba. O lojista entra pela Visão da conta e vê só o que já via. O relatório do mês é montado sozinho no dia 1.

### Fase 9 — Vendas e Lucro: **pronto**
Um tópico só, desligado por padrão e liberado por cliente em Clientes › Gerenciar (menu, telas, rotas no middleware,
sincronização automática e analista de carteira respeitam). Já existiam e foram aproveitados: SKU unindo as plataformas e a
lista de "Anúncios vendidos sem vínculo" (Produtos e custos), custos da operação com recorrência, vendas com taxas reais, DRE
com 3 meses, por canal, origem de cada linha, CSV e PDF e aviso de custo faltando. Curva ABC e alertas do analista mantidos.
**Cortado:** nada foi apagado; "Gestão de vendas" virou "Resumo de vendas", "Minha lucratividade" virou "Lucro por produto",
"Vendas por pedido" virou "Vendas e taxas", "Custo operacional" virou "Custos da operação" e "DRE simplificado" virou
"Resultado do mês". O tópico Financeiro deixou de existir (as telas foram para Vendas e Lucro).

### Fase 10 — Skill de revisão: **pronto**
`.claude/skills/revisao-replique/SKILL.md` criada e executada; resultado em `docs/RELATORIO-REVISAO.md`.

### Testes
280 passando (`python -m pytest -q`). Novos: `test_pedidos.py`, `test_duvidas.py` (veio de `test_projetos.py`),
`test_ia_casa.py`, `test_agendador.py`, `test_radar_catalogo.py`, `test_acompanhamento_vendas.py`.

### Depois da revisão — rotas sem uso ligadas: **pronto**
`/api/lotes/regras` (travas na barra de Rascunhos), `/api/aprovacoes` (Acompanhamento do lojista), `/api/financeiro/simular`
("Simular uma venda" em Vendas e taxas) e `/api/notificacoes/contagem` (sino do lojista e depois de marcar como lida).

### Pendências finais (feitas depois da entrega)
- Agendador com limite de leituras por hora por cliente (`AGENDADOR_LEITURAS_HORA`, mesmo mecanismo de `api/limites.py`).
- Preço e estoque em lote em Meus Anúncios; Clonador com publicados de rascunho apagado; filtros do Mapeador compartilhados.
- Testes: 284 passando.
