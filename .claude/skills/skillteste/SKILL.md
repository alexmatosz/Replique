---
name: skillteste
description: Teste de carga com k6 (100 e depois 1000 pessoas ao mesmo tempo) e auto-invasão do Replique, em etapas — em cada uma, achar o problema, arrumar e passar para a próxima. Inclui o cache de leitura, o alerta de respostas acima de 2 s com relatório diário, e a auto-invasão que corrige falhas até ninguém mais entrar. Use quando pedirem "testa a carga", "aguenta 1000 pessoas?", "skillteste", "tenta invadir" ou "o sistema está lento". Trabalha sempre num servidor de teste, nunca no banco nem nas contas reais.
---

# skillteste — carga, desempenho e invasão

Roda tudo num **servidor de teste** (`scripts/carga/servidor.py`, porta 8790, banco descartável em
`%TEMP%\replique-carga`, modo demonstração, Mercado Livre falso). Nunca o banco real nem tokens de marketplace.
São cinco etapas; em cada uma, **ache o problema, arrume no código, rode de novo até ficar limpo e só então passe
para a próxima**.

## Preparar (uma vez)

1. k6 instalado? `k6 version`. Se não: `winget install GrafanaLabs.k6` (precisa de terminal com permissão) ou baixe o
   `.zip` de https://github.com/grafana/k6/releases e ponha `k6.exe` numa pasta do PATH (ex.: `~/bin`). Sem k6, o
   orquestrador cai no simulador em Python (`scripts/carga/simular.py`).
2. Suba o servidor noutro terminal: `.venv/Scripts/python scripts/carga/servidor.py --limpar`
3. Semeie o banco (40 clientes, 100 pessoas, 100 mil vendas): `.venv/Scripts/python scripts/skillteste/rodar.py preparar`

As credenciais semeadas ficam em `%TEMP%\replique-carga\pessoas.json` (o k6 e a auto-invasão leem dali).

## Etapa 1 — 100 pessoas ao mesmo tempo

`.venv/Scripts/python scripts/skillteste/rodar.py carga 100`
(ou direto: `k6 run -e VUS=100 -e DUR=90s -e PESSOAS=<...\pessoas.json> scripts/skillteste/carga.js`)

Cada VU entra uma vez e abre as telas do seu papel. Metas (thresholds) no `carga.js`: menos de 1% de falha HTTP,
p95 < 2 s, menos de 5% acima de 2 s. Quando falhar, **ache onde**: consulte `GET /api/desempenho` (admin) — o monitor
de latência lista as rotas mais lentas e o uso do cache. Erros comuns já corrigidos: rota inexistente (404),
parâmetro faltando como `mes` (422). Arrume e rode de novo antes de subir para 1000.

No perfil sustentado de 3 min (padrão do `rodar.py`), a rota mais pesada é `/api/analise/carteira` (depois
`/api/financeiro/gestao`): ela recalcula o resumo de todos os clientes acessíveis e abre um `ThreadPoolExecutor`
por requisição (`analista.py`), o que sob dezenas de admins simultâneos vira centenas de threads. Antes de "arrumar"
isso, lembre que dezenas de admins martelando a visão-geral ao mesmo tempo não é a carga real da Monvatti, e que
baixar o paralelismo ou cachear o `resumo` arrisca número financeiro velho após sincronização — o ganho de verdade é
arquitetural (pré-calcular a carteira), não remendo no endpoint. Ver `docs/TESTE-DE-CARGA.md`.

## Etapa 2 — 1000 pessoas ao mesmo tempo

`.venv/Scripts/python scripts/skillteste/rodar.py carga 1000`

Aqui aparece **onde o sistema quebra**. No teste de 2026-11 foi o **pool de conexões do banco**
(`QueuePool limit ... reached`): um processo só não serve 1000 acessos pesados simultâneos. O arrumado seguro foi
**degradar com elegância** — responder `503 "muitos acessos, tente de novo"` com `Retry-After` em vez de `500`
(ver `backend/main.py`, handler `servidor_ocupado`). A capacidade real para 1000 é arquitetural (vários processos +
Postgres + relatórios pré-calculados), anotado para a próxima rodada — ver `docs/TESTE-DE-CARGA.md`.

Com 1000 VUs sustentados por 3 min num notebook, o processo pode **não voltar sozinho** depois da carga (aceita TCP,
não responde HTTP) e precisar de reinício — diferente das 100, que recupera na hora. Não insista no 1000 a ponto de
prender a máquina; reinicie o servidor (`taskkill` na porta 8790 e suba de novo sem `--limpar` para manter o banco
semeado) e siga. O `rodar.py` agora espera o servidor voltar por até 60 s entre etapas antes de desistir.

## Etapa 3 — cache do que todo mundo pede igual

Já implementado, para o banco não responder a mesma pergunta mil vezes:
- `backend/services/cache_leitura.py`: guarda por `CACHE_LEITURA_S` (30 s) a resposta das rotas GET só-leitura
  (`CACHEAVEIS`), por sessão. Qualquer escrita da sessão invalida o cache dela (sem servir dado velho após salvar).
- `backend/services/financeiro.py` `resumo()`: **single-flight** — quando muitas telas pedem o mesmo (cliente, mês)
  ao mesmo tempo, a primeira calcula e as outras reaproveitam; nada fica guardado depois, então não envelhece.
- `analista.carteira()` calcula os clientes em paralelo (`CARTEIRA_PARALELA`), cada um na sua sessão.

Nunca use espera bloqueante (`event.wait`) dentro de um worker do servidor: sob carga, trava todos os workers (foi um
erro cometido e corrigido). O single-flight pesado fica na camada de dados, não no middleware HTTP.

## Etapa 4 — alerta de resposta lenta, com relatório diário

Já implementado em `backend/services/latencia.py`:
- o middleware mede cada resposta; acima de `LATENCIA_LIMITE_S` (2 s) anota a rota, a hora e o tempo (arquivo do dia em
  `DATA_DIR`, sobrevive a reinício);
- **não floda**: junta o dia inteiro e manda **um** relatório, uma vez por dia (tarefa `lentidao` do agendador, hora
  `LATENCIA_RELATORIO_HORA`), por e-mail (`ALERTA_EMAIL`/SMTP) e/ou webhook de WhatsApp (`ALERTA_WHATSAPP_WEBHOOK`);
- o admin vê a qualquer momento em `GET /api/desempenho` e dispara o envio na hora em `POST /api/desempenho/enviar-relatorio`.

## Etapa 5 — auto-invasão (tentar entrar e abusar)

`.venv/Scripts/python scripts/skillteste/rodar.py seguranca`
(ou `.venv/Scripts/python scripts/skillteste/seguranca.py --base http://127.0.0.1:8790`)

Tenta, como um atacante: rota sem token, token inventado/adulterado, escrita por cookie sem CSRF, ver dados de outro
cliente (IDOR), ação de admin por operador, travessia de diretório e SSRF em fotos, injeção, cabeçalhos de segurança,
força bruta de senha. Cada falha é `[FALHA]`. **Analise cada FALHA, corrija no código e rode de novo até dar
"Nenhuma falha".** Cuidado com falso positivo: uma resposta `200` com os dados *do próprio* usuário não é vazamento —
confira o conteúdo, não só o status.

## Rodar tudo em sequência

`.venv/Scripts/python scripts/skillteste/rodar.py tudo` (preparar → carga 100 → carga 1000 → auto-invasão).
Os resumos ficam em `docs/skillteste-*.json`. No fim, apague `%TEMP%\replique-carga` para limpar o banco de teste.

## Testes automáticos

`cache_leitura`, `latencia` e o single-flight do `resumo` têm teste em `tests/test_desempenho.py`. Rode
`.venv/Scripts/python -m pytest tests/test_desempenho.py -q` depois de mexer em qualquer um deles.
