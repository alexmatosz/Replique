# Plano de integração — funcionalidades do Radar Marketplaces no Replique

Atualizado em 23/10/2026.

## 1. O projeto da Hostinger

Analisado pelo editor do AI Builder (aba Código e conversa com a IA da Hostinger).

- **O que é:** site feito no AI Builder da Hostinger, em React, com banco PocketBase (SQLite). Telas: painel, Mapeador de Mercado, Mapeador de Produtos, Análise de Concorrentes, Meus Anúncios, Clonador, Minha Lucratividade, Radar de Anúncios, Gestão de Vendas, Financeiro (DRE), Planos e Preços.
- **API:** não existe. O único arquivo de API (`apps/web/src/routes/api.$.ts`) responde “Route not found” (404) para qualquer `/api/...`. O PocketBase guarda só `users`, `listing_drafts`, `consultant_requests` e `radar_anuncios`.
- **Dados:** demonstrativos ou digitados à mão. A própria IA da Hostinger registrou que vendas, financeiro e DRE usam dados simulados, que não há integração com Mercado Livre, Shopee ou Amazon e que, no Radar de Anúncios, “extração automática, OCR, atualizações agendadas, filas e cache não foram implementados”.
- **Autenticação, limites e marketplaces:** não se aplicam, porque não há API.

**Decisão do usuário (23/10/2026):** a Hostinger serve só de referência do que se quer. Tudo é construído **dentro do Replique**, com as APIs oficiais dos marketplaces. Por isso a etapa 2 (cliente da API da Hostinger) **não será feita**: não há o que conectar e nenhum endpoint será inventado.

**Vendas por dia e por mês (estilo Avant Pro):** nos anúncios do próprio cliente, vendas reais pelos pedidos sincronizados. Em 26/10/2026 o usuário liberou a **extensão Monvatti Estudo** (pasta `extensao/`, só para a equipe): estimativas a partir do número público de vendidos, com o aviso de que não são dados oficiais, lidas apenas com contas de estudo (clientes marcados como "estudo"), um navegador por pessoa liberada pelo administrador.

## 2. O que o Replique já tem (conferido no código)

| Área | Onde está |
|---|---|
| Pesquisar, copiar, editar, checar e publicar | `services/replique.py`, `api/anuncios.py`, telas Pesquisar, Rascunhos e Editor |
| Publicações (ML, Shopee, Amazon) com situação, pausar/ativar, preço e estoque | `services/publicacoes.py`, tela Publicações |
| Publicação em lote com travas | `services/lotes.py`, tela Publicação em lote |
| Radar de preço dos anúncios publicados (aplicar preço sugerido) | `services/radar.py`, aba Meus preços |
| Radar de mercado (tendências, mais vendidos, nota de oportunidade) | `services/mercado.py`, tela Radar de mercado |
| Calculadora de margem e precificação do ML | `services/margem.py` |
| Impostos e tributação (Simples, Presumido, Real, planilha) | `services/impostos.py`, `services/tributacao.py` |
| Vendas e lucro por mês, por produto e por plataforma | `services/financeiro.py` (`resumo`) |
| Produtos e custos, vínculos, importação por planilha | `services/financeiro.py`, tela Produtos e custos |
| Custo operacional (despesas) | tela Custo operacional |
| Analista de métricas (achados e visão de todos os clientes) | `services/analista.py` |
| Relatório do mês (imprimir/PDF) | `services/relatorio.py` |
| Painel com atividades (auditoria) | `api/gestao.py` (`/atividades`), `services/auditoria.py` |
| Visitas de qualquer anúncio e ofertas de um produto de catálogo | `MercadoLivre.anuncios_do_produto` |

## 3. Funcionalidade pedida → situação → o que foi feito

Todas rodam **pelo próprio Replique** (não há API da Hostinger). Situação em 23/10/2026.

| # | Funcionalidade | Já existia? | Fonte dos dados | O que foi feito | Situação |
|---|---|---|---|---|---|
| E2 | Cliente da API da Hostinger | — | — | Não feito: o projeto da Hostinger não tem API (ver seção 1) | não se aplica |
| E3 | Menu lateral com tópicos | parcial | — | Tópicos que abrem e fecham, tópico atual aberto e item destacado, estado lembrado no navegador, bolinha de não lidas no tópico fechado, guia abre o tópico certo. Links antigos (#/radar, #/lucro etc.) continuam valendo | pronto |
| 1 | Atividades organizadas | parcial | auditoria existente (sem mudança) | Painel mostra as 8 mais recentes agrupadas por dia, cartões de altura igual, bloco recolhível; “Ver todas” com filtros por cliente, pessoa, tipo e período (novo filtro desde/até) e “Carregar mais” | pronto |
| 2 | Publicação em lote autoexplicativa | sim | travas em `services/lotes.py` (sem mudança) | Texto do topo, passo a passo em 4 etapas com os limites reais (`/api/lotes/regras`) e estados vazios com caminho | pronto |
| 3 | Mapeador de produtos | parcial | API do ML: /trends, /highlights, catálogo, /listing_prices | Histórico por coleta (tabela `coletas_mercado`), tendência subindo/estável/caindo, nota com fórmula visível (procura 35%, tendência 15%, concorrência 30%, faixa de preço 10%, margem estimada 10%), margem estimada com tarifa do ML e imposto do cliente, filtros combináveis, filtros salvos, CSV, ações Acompanhar / Clonar / Ver concorrentes / Pesquisar, demonstração identificada | pronto |
| 4 | Análise de concorrentes | não | ofertas do produto de catálogo e /users | Cadastro de concorrentes (tabela `concorrentes`), comparativo lado a lado, faixa mín/mediana/máx com a posição do cliente, linha do tempo de preço (das leituras do radar), resumo com IA (só dados coletados) ou por regras | pronto |
| 5 | Radar de anúncios | parcial (radar de preço) | /items e visitas (só do cliente), ofertas do catálogo, vendas sincronizadas | Monitorar por link ou código (tabelas `anuncios_monitorados` e `leituras_monitorado`), histórico, vendas/dia e /mês reais dos anúncios do cliente, visitas, conversão, tarifa, logística, posição no preço, alertas (queda de preço do concorrente, pausado/moderação, preço acima da mediana). Radar de preço antigo virou a aba “Meus preços publicados” (aplicar preço com confirmação) | pronto |
| 6 | Meus anúncios | parcial (Publicações) | publicações + vendas sincronizadas + checagem | Visão única das 3 plataformas com situação ao vivo, preço, estoque, visitas (ML), vendas, conversão, margem, risco, etiquetas (coluna `etiquetas`), filtros, busca, ações em lote (etiquetar, pausar, ativar, uma por vez com confirmação) e CSV | pronto |
| 7 | Clonador de anúncios | parcial (copiar) | rascunhos do cliente | Clona para outra plataforma, outro cliente ou com variações, em lote, só rascunhos; corta o título no limite da plataforma; categoria do ML sugerida pela API; mantém a origem (avisos de fotos copiadas e título idêntico continuam valendo) | pronto |
| 8 | Minha lucratividade | parcial | custos + vendas de 90 dias + tarifas padrão | Margem real por produto e canal, preço mínimo para a margem desejada e de equilíbrio, simulador “e se”, prejuízo no topo; importação por planilha usa a de Produtos e custos | pronto |
| 9 | Gestão de vendas e rentabilidade | parcial | `financeiro.resumo` + analista | Indicadores com o mês anterior, comparação por canal, curva ABC com CSV, alertas do analista, aba “Todos os clientes” | pronto |
| 10 | DRE simplificado | não | `financeiro.resumo` + custo operacional | 3 meses lado a lado, % da receita líquida, origem de cada linha, por canal até a margem de contribuição, despesas por categoria, avisos de custo faltando, CSV e PDF (impressão) | pronto |

## 4. Limites da API oficial encontrados (conferidos com a conta real em 23/10/2026)

- Anúncio de outro vendedor: `/items/{id}` responde 403. Só o que aparece nas ofertas do produto de catálogo (preço, frete, tipo, loja oficial, vendedor) é liberado.
- Visitas de anúncio de outro vendedor: 403 (também pelo `/visits/items`). Só as do próprio cliente.
- Vendas de concorrentes: não vêm pela API. A tela mostra “não disponível” em vez de estimar.
- Avaliação dos produtos no Mapeador: não vem na consulta usada; o filtro aparece desligado com a explicação.
- Shopee e Amazon: as APIs não entregam tendências de busca nem ranking de mais vendidos por categoria; o Mapeador avisa e usa só o Mercado Livre.

## 5. Pendências deste plano (resolvidas em 23/10/2026)

- **Leitura automática do Radar de anúncios**: feita pelo agendador (`services/agendador.py`), a cada 30 min para os anúncios do cliente e 25 min para concorrentes.
- **Avaliação (estrelas) no Mapeador**: conferido com conta real: a API só libera avaliações dos anúncios do próprio vendedor; de produtos de outros vendedores (o caso do Mapeador) responde 403. O filtro fica desligado com essa explicação, e o Radar de anúncios mostra a nota dos anúncios do cliente.
- **Clonar anúncio publicado cujo rascunho foi apagado**: o Clonador lista também esses anúncios, marcados como "rascunho apagado".
- **Ações em lote de preço e estoque em Meus anúncios**: feitas, até 50 por vez, com prévia, aviso de queda de 15% ou mais e de possível prejuízo, confirmação e envio um por vez.
- **Filtros salvos do Mapeador**: podem ser compartilhados com a equipe (guardados no servidor, tabela `filtros_salvos`) ou ficar só no navegador.
