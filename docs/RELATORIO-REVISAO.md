# Relatório de revisão do Replique

Gerado em 23/10/2026 seguindo a skill `.claude/skills/revisao-replique/SKILL.md` (só leitura, sem tocar no banco real nem
na API dos marketplaces).

## 1. Resumo

- O sistema está alinhado ao propósito: criar anúncios, controlar as contas, acompanhar o cliente e apoiar o consultor.
  Projetos, tarefas, a tela de lote e a tela Publicações saíram; os dados antigos continuam no banco.
- 184 rotas de API em 16 arquivos, 33 funções de tela no `frontend/app.js`. Nenhuma tela órfã; as 4 rotas que estavam sem uso foram ligadas às telas (seção 3).
- Isolamento por empresa e cliente, papéis e travas de publicação estão cobertos por testes (280 passando).
- Pontos de atenção: clientes antigos
  começam com Vendas e Lucro desligado; o agendador não roda em hospedagem que dorme sem o `/api/ping` externo.
- Maiores lacunas: migrações com Alembic, testes de interface e conferir as integrações Shopee/Amazon com contas reais.

## 2. Mapa

### Menu da equipe

| Tópico | Itens (rota) | Quem vê |
|---|---|---|
| Início | Visão geral/Minha carteira (`inicio`), Painel (`painel`) | admin, operador, consultor |
| Anúncios | Pedidos (`pedidos`), Pesquisar e copiar (`pesquisar`), Clonador (`clonador`), Rascunhos (`rascunhos`), Meus Anúncios (`anuncios`), Estoque Full (`full`) | consultor não vê Pesquisar e Clonador |
| Radar e mercado | Radar de anúncios (`monitor`), Concorrentes (`concorrentes`), Mapeador de produtos (`radar`) | equipe |
| Acompanhamento | Visão geral com a aba Relatório do mês (`acompanhamento`), Saúde (`saude`), Perguntas (`perguntas`), Dúvidas (`duvidas`) | equipe |
| Vendas e Lucro | Resumo, Vendas e taxas, Produtos e custos, Lucro por produto, Custos da operação, Resultado do mês, Impostos, Analista | só com o cliente liberado |
| Gestão | Contas do cliente; Clientes e Configurações (admin) | admin e operador |

Lojista: Minha loja (Painel, Meus Anúncios, Em preparo, Full, Contas), Acompanhamento (Visão geral com o Relatório do mês,
Saúde, Dúvidas) e Vendas e Lucro quando liberado. Links antigos: `#/projeto`, `#/tarefas`, `#/lotes`, `#/publicacoes` e `#/relatorio` redirecionam.

### Rotas por arquivo

anúncios 30 · financeiro 31 · ferramentas 25 · gestão 16 · inteligência 15 · auth 12 · pedidos 11 · contas 9 · equipe 9 ·
lotes 7 · conversas 6 · ia_casa 6 · agendador 3 · início 3 · análise 1.

### Tabelas preservadas sem tela

`projetos`, `tarefas`, `notas_tarefa`, `reunioes` (dados antigos; o chat ainda resolve referências a tarefas em conversas
antigas). `lotes` e `lote_itens` continuam em uso pela fila de "Publicar selecionados".

## 3. Duplicado, morto ou confuso

| Item | Evidência | Sugestão |
|---|---|---|
| `GET /api/lotes/regras` | ligada: Rascunhos mostra as travas reais (máximo, intervalo, limite por conta, parada) na barra de "Publicar selecionados" | resolvido |
| `GET /api/aprovacoes` | ligada: o Acompanhamento do lojista lista o que espera a aprovação dele, com "Ver" para aprovar ou pedir ajustes | resolvido |
| `POST /api/financeiro/simular` | ligada: botão "Simular uma venda" em Vendas e taxas (equipe e lojista; consultor não) | resolvido |
| `GET /api/notificacoes/contagem` | ligada: contador do sino do lojista e atualização do sino depois de marcar como lida | resolvido |
| Dois "radares" com nomes parecidos | Mapeador de produtos (rota `radar`) e Radar de anúncios (rota `monitor`) | trocar a rota `radar` para `mapeador` com alias, para o código bater com o nome da tela |
| Clonador x Pedidos x Pesquisar | três portas para criar rascunho | fazem sentido (fontes diferentes), mas o guia do Início pode explicar quando usar cada uma |
| Botões de sincronizar | viraram "Atualizar agora" pequenos com "Atualizado às HH:MM" | ok |
| Textos citando telas antigas | `grep "#/lotes\|#/publicacoes\|#/projeto\|#/tarefas"` vazio | ok |

## 4. O que faz sentido e o que não faz

Faz sentido e está forte: pesquisar e copiar com travas de risco, editor com fotos geradas e Padrão da casa, publicar
selecionados com conferência da conta, Meus Anúncios único, pedidos consultor → operador, radar com catálogo, saúde,
perguntas, notificações e atualização automática.

Faz sentido, mas pesado para a maioria dos clientes: o bloco Vendas e Lucro completo (8 telas). Por isso ficou liberado por
cliente. Para quem libera, "Lucro por produto" e "Resumo de vendas" poderiam virar abas de uma tela só.

Não faz sentido manter: rotas sem uso da seção 3 (depois de decidir), e o Mapeador para clientes sem conta do Mercado Livre
(a tela já avisa que Shopee e Amazon não têm tendências pela API).

## 5. Segurança, isolamento, papéis e honestidade

| Ponto | Situação | Evidência |
|---|---|---|
| Isolamento por empresa e cliente | certo | `deps.contexto`, `acesso.pode_ver`, testes `test_multicliente.py`, `test_pedidos.py::test_isolamento_e_papeis` |
| Pedidos invisíveis ao lojista | certo | `pedidos.consulta` recusa `cliente`; teste devolve 403 |
| Consultor não edita anúncio nem financeiro | certo | `exigir_equipe`, `contexto_escrita`; "Começar" pedido devolve 403 ao consultor |
| Vendas e Lucro bloqueado para cliente não liberado | certo | middleware em `backend/main.py` + `ferramentas.VENDAS_LUCRO`; teste `test_acompanhamento_vendas.py` |
| Publicação na conta do dono do rascunho e confirmação | certo | `replique.publicar`, prévia com "Conferi que…" |
| Fila e agendador com reserva no banco | certo | `lotes._reservar`, `agendador.reservar`; teste `test_agendador.py` |
| Limites de uso (hora e mês) | certo | `api/limites.py`, `services/uso_ia.py` |
| `/api/ping` sem login | aceitável | não devolve dados e só roda tarefa vencida; documentado no README |
| Autenticação e sessão (ASVS 5.0, cap. 6 e 7) | certo | segundo fator, senhas com contexto, PBKDF2 600 mil, cookie HttpOnly com CSRF, inatividade de 120 min, avisos de conta; ver docs/SEGURANCA.md |
| Senha esquecida e registro de acessos | certo | link de uso único sem login automático; registros por 6 meses (Marco Civil) |
| Segredos fora do git | certo | `.env` e `data/` no `.gitignore` (não incluir) |
| Dados de demonstração marcados | certo | `demo` nas leituras, selos "demonstração", aviso nas telas |
| "Não disponível" no lugar de número inventado | certo | visitas e vendas de concorrente, disputa de catálogo quando a API não responde |
| Disputa de catálogo conferida com conta real | certo | conferida em 23/10/2026 com a conta do cliente 4 (só leituras) |
| Comentários no código | certo | busca por `#` em `backend/` vazia |
| Migrações de banco | atenção | colunas novas entram por `ALTER TABLE` automático (`db._adicionar_colunas_novas`); sem Alembic |

## 6. O que acrescentar (prioridade)

| Prioridade | Item | Por quê | Tamanho |
|---|---|---|---|
| P1 | Conferir a leitura do Full com uma conta que tenha estoque no Full | a conta testada não usa Full | pequeno |
| P1 | Decidir a liberação de Vendas e Lucro dos clientes que já usavam o financeiro | todos começam desligados depois desta versão | pequeno |
| P1 | Hospedagem sempre ligada (ou o `/api/ping` externo) | sem isso o agendador não roda no Render free ou no Vercel | pequeno |
| P1 | Alembic para migrações | o `ALTER TABLE` automático não renomeia nem muda tipos; PostgreSQL em produção | médio |
| P2 | Pedido com vários anúncios: criar os N rascunhos de uma vez | hoje é um "Começar" por rascunho | pequeno |
| P2 | Testes de interface (Playwright) para menu, pedidos, rascunhos e Meus Anúncios | o `app.js` tem 6 mil linhas sem teste de tela | médio |
| P2 | Shopee e Amazon conferidas com contas reais (vendas, Ads, saúde) | código pronto, sem teste real | médio |
| P3 | Dividir `frontend/app.js` em arquivos por área | manutenção | médio |
| P3 | Renomear a rota `radar` para `mapeador` | nome do código igual ao da tela | pequeno |
| P3 | Exemplos aprovados com nota de desempenho (vendas do anúncio) | escolher referências melhores para a IA | médio |

## 7. Testes

- `python -m pytest -q`: **280 passaram**, nenhuma falha.
- `node --check` em `frontend/app.js`, `frontend/tour.js` e `frontend/editor-fotos.js`: sem erro.
- Conferência no navegador (banco temporário, modo demonstração): Início, Pedidos (Começar → editor com as instruções),
  Rascunhos, Meus Anúncios (redirecionado de `#/publicacoes`), Acompanhamento, Radar, Saúde, Perguntas, Full e
  Configurações, sem erro no console.
