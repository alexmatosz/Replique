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
