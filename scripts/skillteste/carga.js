// Teste de carga do Replique com k6. Simula pessoas de verdade: cada uma entra
// uma vez e fica abrindo as telas que o seu papel abre (painel, promoções,
// financeiro, saúde, novidades...). Usa as credenciais que o semear.py gravou.
//
// Rodar (com o servidor de carga no ar e o banco semeado):
//   k6 run -e VUS=100  -e DUR=3m  scripts/skillteste/carga.js
//   k6 run -e VUS=1000 -e DUR=3m  scripts/skillteste/carga.js
// O orquestrador scripts/skillteste/rodar.py faz tudo isso em sequência.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const BASE = __ENV.BASE || "http://127.0.0.1:8790";
const MES = new Date().toISOString().slice(0, 7); // AAAA-MM: alguns relatórios exigem o mês
const VUS = parseInt(__ENV.VUS || "100", 10);
const DUR = __ENV.DUR || "3m";

// O semear.py grava pessoas.json em %TEMP%/replique-carga. O caminho vem por env
// porque o k6 só abre arquivos no init; o rodar.py passa PESSOAS com o caminho certo.
const pessoas = new SharedArray("pessoas", () => {
  const caminho = __ENV.PESSOAS;
  if (!caminho) throw new Error("Passe -e PESSOAS=<caminho de pessoas.json>");
  return JSON.parse(open(caminho)).pessoas;
});

const erros = new Rate("erros_logicos");
const lentas = new Rate("respostas_acima_2s");
const tLeitura = new Trend("tempo_leitura_ms", true);

export const options = {
  scenarios: {
    carga: { executor: "ramping-vus", startVUs: 0, gracefulStop: "20s",
      stages: [
        { duration: "30s", target: VUS },
        { duration: DUR, target: VUS },
        { duration: "15s", target: 0 },
      ] },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],              // menos de 1% de erros de rede/HTTP
    erros_logicos: ["rate<0.01"],                // menos de 1% de respostas inesperadas
    http_req_duration: ["p(95)<2000", "p(99)<4000"],
    respostas_acima_2s: ["rate<0.05"],           // alinhado ao alerta de 2 s do servidor
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// 403 é resposta de autorização esperada (papel sem acesso), não erro de servidor:
// só 5xx/404/409/timeout contam como falha de verdade.
http.setResponseCallback(http.expectedStatuses(200, 403));

// Telas que cada papel abre no dia a dia (todas GET, só leitura).
const ROTAS = {
  admin: ["/api/visao-geral", "/api/novidades", "/api/agendador/situacao", "/api/empresa/usuarios", "/api/promocoes/geral"],
  operador: ["/api/visao-geral", "/api/novidades", "/api/anuncios", "/api/promocoes", `/api/financeiro/gestao?mes=${MES}`],
  consultor: ["/api/visao-geral", "/api/promocoes", `/api/analise/carteira?mes=${MES}`, "/api/financeiro/lucratividade", "/api/saude"],
  cliente: ["/api/novidades", "/api/financeiro/lucratividade", "/api/anuncios"],
};

function entrar(p) {
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: p.email, senha: p.senha }),
    { headers: { "Content-Type": "application/json" }, tags: { rota: "login" } });
  const ok = check(r, { "login 200": (x) => x.status === 200 });
  if (!ok) { erros.add(1); return null; }
  try { return r.json("token"); } catch (e) { erros.add(1); return null; }
}

// Cada VU (pessoa) entra uma vez e reusa o token, como no uso real.
const sessaoVU = {};

export default function () {
  const p = pessoas[(__VU - 1) % pessoas.length];
  if (!sessaoVU[__VU]) {
    const token = entrar(p);
    if (!token) { sleep(2); return; }
    const h = { Authorization: `Bearer ${token}` };
    if (p.clientes && p.clientes.length) h["X-Cliente"] = String(p.clientes[0]);
    sessaoVU[__VU] = h;
  }
  const headers = sessaoVU[__VU];
  const rotas = ROTAS[p.papel] || ROTAS.cliente;

  for (let i = 0; i < 6; i++) {
    const rota = rotas[Math.floor(Math.random() * rotas.length)];
    const r = http.get(`${BASE}${rota}`, { headers, tags: { rota } });
    const ok = check(r, { "200/403": (x) => x.status === 200 || x.status === 403 });
    if (!ok) erros.add(1); else erros.add(0);
    tLeitura.add(r.timings.duration);
    lentas.add(r.timings.duration > 2000 ? 1 : 0);
    sleep(Math.random() * 2 + 0.5); // pessoa lendo a tela entre cliques
  }
}

export function handleSummary(data) {
  const saida = __ENV.SAIDA || "resumo-k6.json";
  const out = {};
  out[saida] = JSON.stringify(data, null, 1);
  out.stdout = textoResumo(data);
  return out;
}

function textoResumo(d) {
  const m = d.metrics;
  const n = (x) => (x == null ? "-" : Math.round(x));
  const dur = m.http_req_duration ? m.http_req_duration.values : {};
  const falha = m.http_req_failed ? m.http_req_failed.values.rate : 0;
  const reqs = m.http_reqs ? m.http_reqs.values.count : 0;
  return `\n== Teste de carga (${VUS} VUs) ==\n` +
    `Requisições: ${reqs}\n` +
    `Falhas HTTP: ${(falha * 100).toFixed(2)}%\n` +
    `Erros lógicos: ${((m.erros_logicos ? m.erros_logicos.values.rate : 0) * 100).toFixed(2)}%\n` +
    `Tempo (ms): média ${n(dur.avg)} · p95 ${n(dur["p(95)"])} · p99 ${n(dur["p(99)"])} · máx ${n(dur.max)}\n` +
    `Acima de 2 s: ${((m.respostas_acima_2s ? m.respostas_acima_2s.values.rate : 0) * 100).toFixed(2)}%\n`;
}
