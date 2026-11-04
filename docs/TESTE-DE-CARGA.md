# Teste de carga: 100 pessoas usando o Replique

Simula um dia de trabalho com 100 pessoas ao mesmo tempo e mede o tempo de resposta e os erros de cada
parte do sistema. Roda numa cópia à parte: banco descartável na pasta temporária do Windows, modo
demonstração e um Mercado Livre falso (com atraso de rede) para a Central de promoções. Não toca no
banco real nem chama os marketplaces.

## Quem é simulado

- 3 administradores, 25 operadores, 12 consultores e 60 lojistas, em 40 clientes.
- 100 mil vendas nos últimos 6 meses (2.500 por cliente), 6 mil anúncios, 4.800 publicações,
  2.400 produtos com custo, 40 mil registros de atividade, conversas, pedidos e notificações.
- Cada papel faz o que faz no dia a dia: operador pesquisa, copia, edita (salvando sozinho), checa,
  publica, vê e aplica promoções; consultor abre carteira, gestão, DRE e análise; lojista aprova,
  vê lucro e DRE e manda mensagem; administrador vê painel, clientes e promoções.
- As consultas automáticas da tela também rodam: não lidas e pendências a cada 45 s, renovação da
  sessão e ping a cada 5 min.

## Fases

| Fase | Duração | O que acontece |
|---|---|---|
| Chegada | 90 s | as 100 pessoas fazem login |
| Dia normal | 7 min | cada pessoa faz uma ação a cada 6–20 s |
| Pico | 4 min | cada pessoa faz uma ação a cada 1–4 s |

## Como rodar

Em três terminais, na raiz do projeto:

```
.venv\Scripts\python scripts\carga\servidor.py --limpar     (deixe aberto)
.venv\Scripts\python scripts\carga\semear.py                (uns 2 min; uma vez por banco)
.venv\Scripts\python scripts\carga\simular.py               (13 min; "curto" faz 1,5 min)
```

O relatório sai no fim e fica em `%TEMP%\replique-carga\relatorio.txt`. Se o servidor travar,
`%TEMP%\replique-carga\retratos.txt` mostra o que cada thread estava fazendo. Para medir cada tela
sozinha (tempo e número de consultas ao banco), pare o servidor e rode `scripts\carga\perfil.py`.

O teste usa SQLite, como o PC e o plano do Railway. Na Vercel o banco é PostgreSQL (Neon): as travas
de escrita do SQLite não acontecem lá, mas o resto vale igual.

## Resultado de 2026-11-03

Antes das correções o sistema **congelava** com menos de 20 requisições lentas ao mesmo tempo e só
voltava reiniciando. Depois:

| | Antes | Depois |
|---|---|---|
| Erros do servidor no dia inteiro | sistema parado | 0 em 10.579 requisições |
| Dia normal: tempo típico | sem resposta | 0,03 s |
| Pico: requisições por segundo atendidas | ~3 | ~14 |
| Ler promoções de 6 clientes juntos | 5 de 6 com erro | 6 de 6, sem erro |

O que foi corrigido:

1. A conferência de ferramentas por função (`backend/main.py`) consultava o banco dentro do laço do
   servidor. Com as conexões ocupadas, o laço parava e ninguém devolvia a sua: travamento total.
   Agora roda numa thread.
2. O banco tinha 15 conexões para 40 threads; a devolução da conexão também precisa de thread livre,
   então tudo parava em ondas de 30 s. Agora são 60 (`DB_POOL` e `DB_POOL_EXTRA` no `.env`).
3. SQLite em modo WAL e espera de 15 s (antes 5 s): quem lê não bloqueia mais quem grava.
4. A leitura de promoções gravava o resultado e depois registrava a campanha nova com outra conexão,
   que ficava esperando a trava da primeira por 15 s e desistia. A ordem foi invertida.
5. Envio de foto, foto de perfil e importação da planilha de impostos rodavam no laço do servidor.

Os testes em `tests/test_carga.py` e `tests/test_promocoes.py` impedem que esses problemas voltem.

## O que ainda fica lento

Os relatórios financeiros são calculados do zero a cada abertura, em Python, sobre todas as vendas do
período. Sozinhos são rápidos (0,05–0,2 s), mas no pico eles disputam a CPU:

| Tela | Sozinha | Dia normal (95%) | Pico (típico) |
|---|---|---|---|
| Análise da carteira (consultor) | 1,2 s, 247 consultas | até 93 s | 108 s |
| DRE (resultado do mês) | 0,18 s | até 18 s | 27 s |
| Gestão de vendas | 0,16 s | até 10 s | 21 s |
| Lucro | 0,05 s | até 6,5 s | 15 s |

Próximos passos sugeridos: reescrever a análise da carteira para buscar os clientes de uma vez,
guardar o resultado dos relatórios por alguns minutos (refazendo quando chegam vendas ou mudam custos)
e, mais adiante, rodar mais de um processo do servidor, o que exige tirar da memória o limite de
tentativas, a fila de lotes e o agendador.

---

## skillteste (2026-11-04): k6, cache, alerta de lentidão e auto-invasão

A skill `skillteste` reexecutou o teste com **k6** (não mais só o simulador em Python), subiu para **1000 pessoas**
e fez uma **auto-invasão**. Scripts em `scripts/skillteste/` (`carga.js`, `seguranca.py`, `rodar.py`).

### 100 pessoas (90 s, pico)
Antes dos ajustes: 30% de falha (rotas erradas 404 e parâmetro `mes` faltando 422). Depois de corrigir as rotas,
ligar o cache de leitura e o single-flight do `resumo`, e calcular a carteira em paralelo:

| | antes | depois |
|---|---|---|
| Requisições no mesmo tempo | ~2.000 | **3.940** |
| Falha HTTP | 30% | **1,4%** |
| p95 | — | 10,8 s |
| Respostas acima de 2 s | 43% | **16%** |
| Acertos do cache | — | 2.755 |

As telas comuns (novidades, visão geral, anúncios, promoções) ficaram rápidas por repetição (cache de 30 s,
invalidado a cada gravação da sessão). O que ainda pesa no pico são os relatórios sobre 100 mil vendas
(`/api/anuncios` e `/api/financeiro/lucratividade` lideram as respostas lentas) — é CPU, não erro.

### 1000 pessoas (ponto de quebra)
Um processo só **não serve 1000 acessos pesados ao mesmo tempo**: o pool de conexões do banco esgota
(`QueuePool limit of size 20 overflow 40 reached`). Arrumado para **degradar com elegância**: em vez de `500`,
responde `503 "muitos acessos, tente de novo"` com `Retry-After` (handler `servidor_ocupado` em `backend/main.py`),
e o servidor **se recupera sozinho** assim que a carga baixa. Aguentar 1000 de fato é arquitetural: vários processos
do servidor + Postgres + relatórios pré-calculados.

### Alerta de lentidão (não floda)
`backend/services/latencia.py` anota toda resposta acima de 2 s (rota, hora, tempo; arquivo do dia em `DATA_DIR`).
Uma vez por dia (tarefa `lentidao` do agendador) manda **um** relatório por e-mail (`ALERTA_EMAIL`) e/ou webhook de
WhatsApp (`ALERTA_WHATSAPP_WEBHOOK`). Admin vê em `GET /api/desempenho`.

### Auto-invasão
`scripts/skillteste/seguranca.py`: 15 testes (token forjado/adulterado, CSRF, IDOR, ação de admin por operador,
travessia de diretório, SSRF em foto, injeção, cabeçalhos, força bruta). **Nenhuma falha** — o Replique barrou tudo.
(As duas "falhas" iniciais eram do próprio teste, impreciso: `200` com os dados *do próprio* usuário não é vazamento.)

### Lição de implementação
Nunca pôr espera bloqueante (`event.wait`) dentro de um worker do servidor: na primeira versão o cache esperava o
cálculo em andamento num worker do threadpool e, sob 1000 acessos, **travou todos os workers** (até o `/api/ping`
parou). O single-flight pesado tem de ficar na camada de dados (`financeiro.resumo`), não no middleware HTTP.

## Re-rodada 2026-11-04 (perfil sustentado de 3 min)

Rodei `rodar.py tudo`, que usa carga sustentada de **3 min** (as medições acima eram de 90 s). O perfil mais duro
mostra o teto mais cedo e deu o diagnóstico fino pelo próprio monitor (`GET /api/desempenho`).

| 100 pessoas, 3 min | valor |
|---|---|
| Requisições | 2.310 |
| Falha HTTP | 2,25% |
| p95 | 31 s |
| Respostas acima de 2 s | 46,7% |
| Acertos do cache | 1.131 |
| Recuperação após a carga | imediata (`/api/ping` 200 em 0,6 s) |

**Gargalo achado pelo monitor:** `/api/analise/carteira` domina os piores tempos (175 s, 157 s, 156 s…), seguida de
`/api/financeiro/gestao` (138 s). A carteira recalcula o resumo de **todos** os clientes acessíveis a cada chamada e
cada requisição abre o **seu próprio** `ThreadPoolExecutor(CARTEIRA_PARALELA)` (`analista.py`); sob dezenas de admins
simultâneos isso vira centenas de threads e explica a latência. Ela já tem o single-flight do `resumo` e o cache de
30 s por sessão.

**Decisão:** não detunar a carteira (baixar o paralelismo, cachear o `resumo`) só por causa deste cenário sintético —
dezenas de admins martelando a visão-geral ao mesmo tempo não é a realidade da Monvatti, e cada mudança arrisca ou
número financeiro velho após sincronização, ou nova starvation. O ganho real é **arquitetural** (vários processos +
Postgres + carteira pré-calculada/materializada), não um remendo no endpoint. Fica anotado como o próximo passo.

**1000 pessoas, 3 min:** 98% de falha (tudo 503/timeout, como esperado no ponto de quebra), **mas** desta vez, com os
1000 VUs sustentados por 3 min num notebook, o processo **não voltou em ~45 s** depois da carga (aceitava TCP, não
respondia HTTP) — precisou de reinício. Diferente das 100 (recupera na hora). É o limite de um processo só levado ao
extremo; o caminho é o mesmo (vários processos + Postgres). Não insisti no 1000 para não deixar o notebook preso.

**Correção de orquestração:** `rodar.py` abortava as etapas seguintes quando o `ping` de 3 s falhava logo após uma
carga pesada (o servidor ainda drenava a fila). Agora `_exigir_servidor()` espera o servidor voltar por até 60 s antes
de desistir, então a suíte percorre 100 → 1000 → auto-invasão sem parar à toa.
