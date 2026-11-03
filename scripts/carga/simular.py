"""Simula 100 pessoas usando o Replique ao mesmo tempo: 90 s de chegada (todos fazem
login), 7 min de dia normal e 4 min de pico, cada papel fazendo o que faz no dia a dia,
mais as consultas automáticas da tela. No fim imprime o tempo e os erros de cada rota.

Uso, com o servidor.py rodando e o semear.py já feito:
  .venv/Scripts/python scripts/carga/simular.py          (completo, ~13 min)
  .venv/Scripts/python scripts/carga/simular.py curto    (~1,5 min)
"""

import asyncio
import json
import random
import re
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

import httpx

PASTA = Path(tempfile.gettempdir()) / "replique-carga"
BASE = "http://127.0.0.1:8790"
RAMPA, NORMAL, PICO = 90, 420, 240
FIM = RAMPA + NORMAL + PICO
MES = date.today().strftime("%Y-%m")
MES_ANT = (date.today().replace(day=1).toordinal() - 1)
MES_ANT = date.fromordinal(MES_ANT).strftime("%Y-%m")
INICIO = time.time()
registros = []
saida = open(PASTA / "medicoes.jsonl", "w", encoding="utf-8")


def agora():
    return time.time() - INICIO


def fase():
    t = agora()
    return "rampa" if t < RAMPA else "normal" if t < RAMPA + NORMAL else "pico"


def nome_logico(metodo, url):
    caminho = url.split("?")[0]
    caminho = re.sub(r"/\d+(?=/|$)", "/{id}", caminho)
    return f"{metodo} {caminho}"


class Pessoa:
    def __init__(self, n, dados, http, todos=()):
        self.n, self.http = n, http
        self.email, self.senha, self.papel = dados["email"], dados["senha"], dados["papel"]
        self.clientes = dados["clientes"] or list(todos)
        self.token = None
        self.cliente = None
        self.rascunho = None

    async def chamar(self, metodo, url, rotulo=None, **kw):
        h = {"cf-connecting-ip": f"10.1.{self.n // 250}.{self.n % 250 + 1}"}
        if self.token:
            h["Authorization"] = "Bearer " + self.token
        if self.cliente and self.papel != "cliente":
            h["X-Cliente"] = str(self.cliente)
        t0 = time.perf_counter()
        status, tam, erro = 0, 0, ""
        try:
            r = await self.http.request(metodo, BASE + url, headers=h, **kw)
            status, tam = r.status_code, len(r.content)
            if status >= 400:
                erro = r.text[:160]
            corpo = r.json() if r.content and r.headers.get("content-type", "").startswith("application/json") else None
        except Exception as e:
            erro, corpo = f"{type(e).__name__}: {e}"[:160], None
        ms = (time.perf_counter() - t0) * 1000
        reg = {"t": round(agora(), 2), "fase": fase(), "papel": self.papel, "rota": rotulo or nome_logico(metodo, url),
               "status": status, "ms": round(ms, 1), "kb": round(tam / 1024, 1), "erro": erro}
        registros.append(reg)
        saida.write(json.dumps(reg, ensure_ascii=False) + "\n")
        return status, corpo

    async def entrar(self):
        await asyncio.sleep(random.uniform(0, RAMPA - 10))
        st, corpo = await self.chamar("POST", "/api/auth/login", json={"email": self.email, "senha": self.senha})
        if st != 200 or not corpo or "token" not in corpo:
            return False
        self.token = corpo["token"]
        await self.chamar("GET", "/api/me")
        await self.chamar("GET", "/api/novidades")
        if self.clientes:
            self.cliente = random.choice(self.clientes)
        return True

    async def vigiar(self):
        proximo_ping = agora() + random.uniform(0, 300)
        proximo_renovar = agora() + random.uniform(240, 300)
        while agora() < FIM:
            await asyncio.sleep(45 + random.uniform(-3, 3))
            if agora() >= FIM:
                break
            q = f"?cliente_id={self.cliente}" if self.cliente and self.papel != "cliente" else ""
            await self.chamar("GET", "/api/conversas/nao-lidas" + q)
            if self.papel == "cliente":
                await self.chamar("GET", "/api/notificacoes/contagem")
            else:
                await self.chamar("GET", "/api/pendencias" + q)
            if self.papel != "cliente" and agora() > proximo_ping:
                await self.chamar("GET", "/api/ping")
                proximo_ping = agora() + 300
            if agora() > proximo_renovar:
                await self.chamar("POST", "/api/auth/renovar")
                proximo_renovar = agora() + 300

    async def pausa(self):
        await asyncio.sleep(random.uniform(1, 4) if fase() == "pico" else random.uniform(6, 20))

    async def viver(self):
        if not await self.entrar():
            return
        vigia = asyncio.create_task(self.vigiar())
        acoes = {"operador": self.acoes_operador, "consultor": self.acoes_consultor,
                 "admin": self.acoes_admin, "cliente": self.acoes_lojista}[self.papel]()
        nomes, pesos = zip(*acoes)
        while agora() < FIM:
            await self.pausa()
            if agora() >= FIM:
                break
            await random.choices(nomes, pesos)[0]()
        await vigia

    def acoes_operador(self):
        return [(self.ver_inicio, 8), (self.ver_pedidos, 10), (self.ver_rascunhos, 10), (self.criar_e_editar, 14),
                (self.ver_promocoes, 12), (self.aplicar_promocao, 5), (self.ler_promocoes, 1), (self.ver_lucro, 8),
                (self.mandar_mensagem, 6), (self.trocar_cliente, 6), (self.ver_publicacoes, 6), (self.ver_notificacoes, 4)]

    def acoes_consultor(self):
        return [(self.ver_painel, 10), (self.ver_carteira, 12), (self.ver_gestao, 12), (self.ver_faturamento, 8),
                (self.ver_acompanhamento, 10), (self.ver_dre, 10), (self.ver_analise, 8), (self.ver_promocoes_geral, 6),
                (self.trocar_cliente, 8), (self.mandar_mensagem, 5), (self.ver_lucro, 8)]

    def acoes_admin(self):
        return [(self.ver_painel, 12), (self.ver_atividades, 10), (self.ver_clientes, 8), (self.ver_promocoes_geral, 10),
                (self.ver_gestao, 10), (self.ver_faturamento, 8), (self.ver_saude, 6), (self.ver_pedidos, 8),
                (self.trocar_cliente, 6), (self.ver_inicio, 8)]

    def acoes_lojista(self):
        return [(self.ver_acompanhamento, 14), (self.aprovar, 10), (self.ver_lucratividade, 10), (self.ver_dre, 10),
                (self.ver_lucro, 10), (self.mandar_mensagem, 8), (self.ver_notificacoes, 6)]

    async def ver_inicio(self):
        await self.chamar("GET", "/api/visao-geral")

    async def ver_pedidos(self):
        await asyncio.gather(self.chamar("GET", "/api/pedidos/painel"), self.chamar("GET", "/api/pedidos"),
                             self.chamar("GET", f"/api/pedidos/operadores?cliente_id={self.cliente}"))

    async def ver_pedidos_lojista(self):
        await self.chamar("GET", "/api/pedidos")

    async def ver_rascunhos(self):
        await asyncio.gather(self.chamar("GET", "/api/anuncios"), self.chamar("GET", "/api/lotes"))

    async def criar_e_editar(self):
        st, pesq = await self.chamar("POST", "/api/pesquisas", json={"termo": random.choice(["garrafa térmica", "fone bluetooth", "luminária led", "mochila"]),
                                                                      "plataformas": ["mercadolivre"], "limite": 20})
        if st != 200 or not pesq:
            return
        achados = re.findall(r'"id_externo":\s*"([^"]+)"', json.dumps(pesq))
        if not achados:
            return
        await self.pausa_curta()
        st, a = await self.chamar("POST", "/api/anuncios/copiar", json={"plataforma": "mercadolivre", "id_externo": random.choice(achados),
                                                                         "pesquisa_id": pesq.get("id")})
        if st != 200 or not a or "id" not in a:
            return
        aid = a["id"]
        await asyncio.gather(self.chamar("GET", f"/api/anuncios/{aid}"), self.chamar("GET", "/api/contas"))
        for i in range(3):
            await self.pausa_curta()
            await self.chamar("PATCH", f"/api/anuncios/{aid}", json={"titulo": f"Título ajustado {i} {random.randint(1, 9999)}",
                                                                     "preco": round(random.uniform(50, 300), 2)})
        await self.chamar("POST", f"/api/anuncios/{aid}/checar", json={"plataformas": ["mercadolivre"]})
        if random.random() < 0.5:
            await self.chamar("POST", f"/api/anuncios/{aid}/publicar", json={"plataformas": ["mercadolivre"]})
        else:
            await self.chamar("POST", f"/api/anuncios/{aid}/aprovacao/solicitar")

    async def pausa_curta(self):
        await asyncio.sleep(random.uniform(0.5, 1.5) if fase() == "pico" else random.uniform(2, 5))

    async def ver_promocoes(self):
        await self.chamar("GET", "/api/promocoes")

    async def aplicar_promocao(self):
        st, p = await self.chamar("GET", "/api/promocoes")
        if st != 200 or not p:
            return
        convites = [c for c in (p.get("leitura") or p).get("convites", []) if c.get("acao") == "aprovar"] if isinstance(p, dict) else []
        if not convites:
            return
        escolha = random.sample(convites, min(5, len(convites)))
        await self.chamar("POST", "/api/promocoes/aplicar", json={"itens": [{"item_id": c["item_id"], "promocao_id": c.get("promocao_id", "")}
                                                                           for c in escolha]})

    async def ler_promocoes(self):
        await self.chamar("POST", "/api/promocoes/ler")

    async def ver_lucro(self):
        await self.chamar("GET", f"/api/financeiro/lucro?mes={random.choice([MES, MES_ANT])}")

    async def ver_lucratividade(self):
        await self.chamar("GET", "/api/financeiro/lucratividade?margem=15")

    async def ver_dre(self):
        await self.chamar("GET", f"/api/financeiro/dre?mes={MES}&meses=3")

    async def ver_analise(self):
        await self.chamar("GET", f"/api/financeiro/analise?mes={MES}")

    async def ver_painel(self):
        await asyncio.gather(self.chamar("GET", "/api/painel"), self.chamar("GET", "/api/atividades"))

    async def ver_atividades(self):
        await self.chamar("GET", "/api/atividades")

    async def ver_carteira(self):
        await self.chamar("GET", f"/api/analise/carteira?mes={MES}")

    async def ver_gestao(self):
        await self.chamar("GET", f"/api/financeiro/gestao?mes={MES}")

    async def ver_faturamento(self):
        await self.chamar("GET", f"/api/faturamento-geral?mes={MES}")

    async def ver_acompanhamento(self):
        await asyncio.gather(self.chamar("GET", "/api/acompanhamento/geral"), self.chamar("GET", "/api/aprovacoes"))

    async def ver_promocoes_geral(self):
        await self.chamar("GET", "/api/promocoes/geral")

    async def ver_clientes(self):
        await asyncio.gather(self.chamar("GET", "/api/clientes"), self.chamar("GET", "/api/empresa/usuarios"))

    async def ver_saude(self):
        await self.chamar("GET", "/api/saude")

    async def ver_publicacoes(self):
        await self.chamar("GET", "/api/publicacoes")

    async def ver_notificacoes(self):
        await self.chamar("GET", "/api/notificacoes")

    async def trocar_cliente(self):
        if len(self.clientes) > 1:
            self.cliente = random.choice(self.clientes)
        await self.chamar("GET", "/api/visao-geral")

    async def aprovar(self):
        st, lista = await self.chamar("GET", "/api/aprovacoes")
        itens = lista if isinstance(lista, list) else (lista or {}).get("anuncios") or (lista or {}).get("itens") or []
        ids = [x["id"] for x in itens if isinstance(x, dict) and "id" in x][:3]
        if ids:
            await self.chamar("POST", "/api/aprovacoes/decidir", json={"ids": ids, "decisao": "aprovar", "nota": ""})

    async def pedir_anuncio(self):
        await self.chamar("POST", "/api/pedidos", json={"cliente_id": self.clientes[0], "marketplaces": ["mercadolivre"],
                                                        "produto_texto": "Quero anunciar este produto novo", "quantidade": 1})

    async def mandar_mensagem(self):
        cid = self.clientes[0] if self.papel == "cliente" else self.cliente
        await self.chamar("POST", "/api/conversas/mensagens", json={"cliente_id": cid, "pagina": random.choice(["rascunhos", "lucro", "publicacoes"]),
                                                                    "texto": "Mensagem durante o teste de carga"})


def pct(valores, p):
    if not valores:
        return 0
    v = sorted(valores)
    return v[min(len(v) - 1, int(round(p / 100 * (len(v) - 1))))]


def relatorio():
    linhas = []
    por_rota = {}
    for r in registros:
        por_rota.setdefault(r["rota"], []).append(r)
    linhas.append(f"{'rota':48} {'n':>6} {'5xx':>5} {'4xx':>5} {'falha':>5} {'p50':>7} {'p95':>7} {'p99':>7} {'máx':>7} {'KB':>7}")
    for rota, rs in sorted(por_rota.items(), key=lambda kv: -pct([r["ms"] for r in kv[1]], 95)):
        ms = [r["ms"] for r in rs]
        linhas.append(f"{rota[:48]:48} {len(rs):6} {sum(1 for r in rs if r['status'] >= 500):5} "
                      f"{sum(1 for r in rs if 400 <= r['status'] < 500):5} {sum(1 for r in rs if r['status'] == 0):5} "
                      f"{pct(ms, 50):7.0f} {pct(ms, 95):7.0f} {pct(ms, 99):7.0f} {max(ms):7.0f} {sum(r['kb'] for r in rs) / len(rs):7.1f}")
    linhas.append("")
    for f in ("rampa", "normal", "pico"):
        rs = [r for r in registros if r["fase"] == f]
        if rs:
            dur = {"rampa": RAMPA, "normal": NORMAL, "pico": PICO}[f]
            linhas.append(f"fase {f:7}: {len(rs):6} requisições ({len(rs) / dur:5.1f}/s), p50 {pct([r['ms'] for r in rs], 50):.0f} ms, "
                          f"p95 {pct([r['ms'] for r in rs], 95):.0f} ms, erros 5xx {sum(1 for r in rs if r['status'] >= 500)}, "
                          f"sem resposta {sum(1 for r in rs if r['status'] == 0)}")
    erros = {}
    for r in registros:
        if r["status"] >= 400 or r["status"] == 0:
            chave = (r["rota"], r["status"], r["erro"][:110])
            erros[chave] = erros.get(chave, 0) + 1
    linhas.append("\nerros (rota, status, mensagem): vezes")
    for (rota, st, msg), n in sorted(erros.items(), key=lambda kv: -kv[1])[:40]:
        linhas.append(f"  {n:5}x {st} {rota} :: {msg}")
    texto = "\n".join(linhas)
    (PASTA / "relatorio.txt").write_text(texto, encoding="utf-8")
    print(texto)


async def principal():
    dados = json.load(open(PASTA / "pessoas.json"))
    limites = httpx.Limits(max_connections=400, max_keepalive_connections=200)
    async with httpx.AsyncClient(limits=limites, timeout=httpx.Timeout(120)) as http:
        pessoas = [Pessoa(i, p, http, dados["clientes"]) for i, p in enumerate(dados["pessoas"])]
        await asyncio.gather(*(p.viver() for p in pessoas))
    relatorio()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "curto":
        RAMPA, NORMAL, PICO = 20, 40, 20
        FIM = RAMPA + NORMAL + PICO
    asyncio.run(principal())
