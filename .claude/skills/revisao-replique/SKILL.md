---
name: revisao-replique
description: Audita o Replique (FastAPI em app/, interface em web/) e orienta o que fazer. Use quando pedirem revisão, auditoria, "o que está sobrando ou faltando", mapa do sistema, antes de uma rodada grande de mudanças ou antes de colocar clientes pagantes. Mapeia menu, telas, rotas e serviços, aponta funcionalidades duplicadas, mortas ou confusas, confere segurança, isolamento por cliente, papéis e honestidade dos dados, e termina com uma lista priorizada salva em RELATORIO-REVISAO.md.
---

# Revisão do Replique

O Replique serve para quatro coisas. Tudo o que não ajuda nelas é candidato a sair:
1. facilitar a criação de anúncios (pesquisar, copiar, editar, fotos, IA, publicar);
2. controlar as contas dos clientes em conjunto (Meus Anúncios, saúde, radar, Full, vendas quando liberado);
3. acompanhar o cliente (Acompanhamento, relatório, dúvidas);
4. apoiar o consultor (pedidos de anúncio ao operador, visão da carteira, notificações).
Tarefas e projetos ficam no CRM Timer. WhatsApp e Digisac estão fora do escopo.

Regras da revisão: só leitura. Não rode commit, push, migração nem nada que escreva no banco real (`data/replique.db`
ou a `DATABASE_URL` do `.env`). Não chame a API dos marketplaces com tokens reais (renovar um token de teste quebra a
conexão do cliente). Escreva o resultado em português do Brasil.

## Passo 1 — Mapear

1. Menu: em `web/app.js`, leia `menuCompleto`, `PERMITIDAS`, `ALIAS_ROTA`, `ROTAS_VENDAS` e `rotas`. Monte a tabela
   tópico › item › rota › papéis que veem.
2. Telas: liste as funções `tela*` de `web/app.js` e confira se cada uma tem rota no objeto `rotas`. Tela sem rota é código morto.
3. Rotas da API: `grep -n "@router\." app/api/*.py`. Para cada uma, anote o arquivo, o método, a dependência de acesso
   (`usuario_atual`, `contexto`, `contexto_equipe`, `contexto_time`, `exigir_admin`, `exigir_equipe`) e a ferramenta em
   `app/services/ferramentas.py` (`ROTAS`).
4. Rotas sem uso: para cada caminho, procure a chamada em `web/*.js`, `mcp_server.py` e `tests/`. Sem nenhuma, é candidata
   a morta (confirme antes; algumas existem só para o MCP ou para serviços externos, como `/api/ping`).
5. Serviços: `app/services/*.py` e quem importa cada um (`grep -rn "from app.services import\|services\.\w"`).
6. Tabelas: `app/models.py`. Tabela sem leitura nem escrita em `app/` é dado preservado de algo que saiu (anote, não apague).

## Passo 2 — Duplicado, morto ou confuso

Procure, com evidência (arquivo:linha):
- duas telas ou rotas que mostram a mesma coisa (ex.: duas listas de anúncios publicados, dois "radares");
- botões de sincronizar que sobraram onde o agendador já atualiza (`app/services/agendador.py`, `TAREFA_POR_TELA`);
- textos que citam telas que não existem mais (`grep -n "#/lotes\|#/publicacoes\|#/projeto\|#/tarefas"`);
- rótulos do menu diferentes do título da tela (`TITULO_ROTA`);
- guias de `web/tour.js` apontando para elementos que sumiram;
- variáveis de `app/config.py` que ninguém lê.

## Passo 3 — Segurança, isolamento, papéis e honestidade

Confira e marque certo ou errado, com o arquivo:
- **Isolamento:** toda consulta filtra por `empresa_id` e por cliente acessível (`acesso.pode_ver`, `acesso.ids_acessiveis`,
  `deps.contexto`). Procure `db.get(` seguido de uso sem conferir `empresa_id`/`cliente_id`.
- **Papéis:** admin tudo; operador cria e publica nos clientes atribuídos; consultor acompanha e pede (não edita anúncio nem
  financeiro: `contexto_escrita`); lojista só a própria loja, sem pedidos internos. Rode os testes de acesso cruzado
  (`tests/test_multicliente.py`, `tests/test_pedidos.py`, `tests/test_acompanhamento_vendas.py`).
- **Travas:** publicação sempre na conta do dono do rascunho, confirmação "Conferi que esta é a conta de…", fila com limite
  diário e parada automática (`services/lotes.py`), renovação de token com trava, limites por hora (`api/limites.py`),
  limite mensal de IA (`services/uso_ia.py`), Vendas e Lucro bloqueado no middleware para cliente não liberado (`main.py`).
- **Segredos:** nada de chave, senha ou `DATABASE_URL` em arquivo versionado (`git ls-files`), `.env` e `data/` no `.gitignore`.
- **Honestidade dos dados:** nenhum número inventado. Dado que a API não entrega aparece como "não disponível"
  (`naoDisponivel`, `indisponivel`). Toda leitura de demonstração marcada (`demo`) e avisada na tela. Procure `random`
  fora de funções `_demo`.
- **Comentários:** o código não usa comentários (docstrings podem). `grep -rn "^\s*#" app web --include=*.py` deve voltar vazio
  fora de `# noqa`.

## Passo 4 — Testes

`.venv/Scripts/python -m pytest -q tests` (Windows) ou `python -m pytest -q`. Anote quantos passam e qualquer falha.
`node --check web/app.js web/tour.js web/editor-fotos.js` para erro de sintaxe na interface.

## Passo 5 — Relatório

Salve `RELATORIO-REVISAO.md` na raiz com:
1. Resumo em 5 linhas.
2. Mapa (menu e rotas por tópico, com contagens).
3. Duplicado, morto ou confuso (cada item com evidência e sugestão: tirar, unir ou renomear).
4. O que faz sentido para o propósito e o que não faz.
5. Segurança, isolamento, papéis e honestidade: tabela certo/errado com evidência.
6. O que acrescentar, em ordem de prioridade (P1 bloqueia uso real; P2 melhora muito o dia a dia; P3 desejável), cada um
   com o porquê e o tamanho aproximado (pequeno, médio, grande).
7. Resultado dos testes.
