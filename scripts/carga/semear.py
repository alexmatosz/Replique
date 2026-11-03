"""Enche o banco descartável do teste de carga: 1 agência, 40 clientes, 100 pessoas
(3 admins, 25 operadores, 12 consultores, 60 lojistas), 100 mil vendas, anúncios,
publicações, produtos, histórico, conversas e a leitura de promoções.

Uso, com o servidor.py rodando: .venv/Scripts/python scripts/carga/semear.py
"""

import json
import os
import random
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parents[2]
PASTA = Path(tempfile.gettempdir()) / "replique-carga"
BASE = "http://127.0.0.1:8790"
random.seed(7)
N_CLIENTES = 40
PALAVRAS = ["Ornitorrinco", "Jabuticaba", "Pitanga", "Tamandua", "Seriema", "Mandacaru", "Graviola", "Jequitiba"]


def senha_nova(n):
    return f"{PALAVRAS[n % 8]}#{PALAVRAS[(n * 3 + 1) % 8]}-{n * 37 + 11}"


def ip(n):
    return f"10.{n // 65536 % 256}.{n // 256 % 256}.{n % 256 + 1}"


def chamar(c, metodo, url, token=None, cliente=None, n=0, **kw):
    h = {"cf-connecting-ip": ip(n)}
    if token:
        h["Authorization"] = "Bearer " + token
    if cliente:
        h["X-Cliente"] = str(cliente)
    r = c.request(metodo, BASE + url, headers=h, timeout=300, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"{metodo} {url} -> {r.status_code}: {r.text[:300]}")
    return r.json() if r.content else None


def etapa_pessoas():
    pessoas = []
    with httpx.Client() as c:
        senha_dona = senha_nova(1)
        r = chamar(c, "POST", "/api/auth/cadastro", n=1, json={
            "empresa": "Agência Carga", "nome": "Dona da Agência", "email": "dona@carga.test", "senha": senha_dona, "aceite_termos": True})
        adm = r["token"]
        pessoas.append({"email": "dona@carga.test", "senha": senha_dona, "papel": "admin", "clientes": []})
        clientes = [chamar(c, "POST", "/api/clientes", adm, n=1, json={"nome": f"Loja {i + 1:02d}"})["id"] for i in range(N_CLIENTES)]
        for cid in clientes:
            chamar(c, "PATCH", f"/api/clientes/{cid}", adm, n=1, json={"vendas_lucro": True})
        papeis = [("admin", 2, 0), ("operador", 25, 5), ("consultor", 12, 10)]
        n = 1
        for papel, qtd, por_pessoa in papeis:
            for i in range(qtd):
                n += 1
                meus = random.sample(clientes, por_pessoa) if por_pessoa else []
                email = f"{papel}{i + 1}@carga.test"
                senha = senha_nova(n)
                chamar(c, "POST", "/api/empresa/usuarios", adm, n=1, json={
                    "nome": f"{papel.title()} {i + 1}", "email": email, "senha": senha, "papel": papel, "clientes": meus})
                pessoas.append({"email": email, "senha": senha, "papel": papel, "clientes": meus})
        for i in range(60):
            cid = clientes[i % N_CLIENTES]
            email = f"lojista{i + 1}@carga.test"
            senha = senha_nova(200 + i)
            chamar(c, "POST", f"/api/clientes/{cid}/logins", adm, n=1, json={"nome": f"Lojista {i + 1}", "email": email, "senha": senha})
            pessoas.append({"email": email, "senha": senha, "papel": "cliente", "clientes": [cid]})
    json.dump({"clientes": clientes, "pessoas": pessoas}, open(PASTA / "pessoas.json", "w"), indent=1)
    print(f"{len(pessoas)} pessoas, {len(clientes)} clientes")


def etapa_dados():
    os.environ["DATABASE_URL"] = f"sqlite:///{(PASTA / 'dados' / 'carga.db').as_posix()}"
    os.environ["REPLIQUE_DATA_DIR"] = str(PASTA / "dados")
    sys.path.insert(0, str(RAIZ))
    from sqlalchemy import insert, select

    from backend.banco.db import SessionLocal
    from backend.banco.models import (Anuncio, Atividade, Cliente, Conversa, Mensagem, Notificacao, PedidoAnuncio, Produto,
                                      Publicacao, Usuario, Venda, VinculoAnuncio)
    agora = datetime.now(timezone.utc)
    with SessionLocal() as db:
        empresa = db.scalar(select(Cliente.empresa_id))
        clientes = list(db.scalars(select(Cliente.id).where(Cliente.empresa_id == empresa)))
        equipe = list(db.scalars(select(Usuario.id).where(Usuario.papel.in_(["admin", "operador"]))))
        todos = list(db.execute(select(Usuario.id, Usuario.papel, Usuario.nome)))
        for cid in clientes:
            anuncios = [{"empresa_id": empresa, "cliente_id": cid, "criado_por_id": random.choice(equipe),
                         "status": random.choice(["rascunho", "rascunho", "publicado", "publicado", "publicado", "simulado"]),
                         "titulo": f"Produto {n} da loja {cid} com título de tamanho realista para o marketplace",
                         "descricao": "Descrição do produto. " * 40, "preco": 40 + (n * 7) % 260, "estoque": 10 + n % 40,
                         "condicao": "new", "marca": "Marca", "sku": f"SKU-{cid}-{n}", "fotos": [], "atributos": {"Cor": "Azul"},
                         "por_plataforma": {}, "origem": {"plataforma": "mercadolivre"}, "custo": 15 + n % 90,
                         "aprovacao": "pendente" if n < 8 else None,
                         "criado_em": agora - timedelta(days=random.randint(0, 120)), "atualizado_em": agora}
                        for n in range(150)]
            db.execute(insert(Anuncio), anuncios)
            ids_anuncio = list(db.scalars(select(Anuncio.id).where(Anuncio.cliente_id == cid)))
            db.execute(insert(Publicacao), [{"empresa_id": empresa, "cliente_id": cid, "usuario_id": random.choice(equipe),
                                             "anuncio_id": a, "plataforma": "mercadolivre", "sucesso": True, "demo": False,
                                             "id_externo": f"MLB{cid:03d}{i:05d}", "link": "https://produto.mercadolivre.com.br/x",
                                             "mensagem": "ok", "criada_em": agora - timedelta(days=random.randint(0, 120))}
                                            for i, a in enumerate(ids_anuncio[:120])])
            db.execute(insert(Produto), [{"empresa_id": empresa, "cliente_id": cid, "sku": f"SKU-{cid}-{n}", "nome": f"Produto {n}",
                                          "custo": 15 + n % 90, "embalagem": 1.5, "origem": "manual"} for n in range(60)])
            produtos = list(db.scalars(select(Produto.id).where(Produto.cliente_id == cid)))
            db.execute(insert(VinculoAnuncio), [{"cliente_id": cid, "plataforma": "mercadolivre", "item_id": f"MLB{cid:03d}{n:05d}",
                                                 "produto_id": p, "unidades": 1, "titulo": f"Produto {n}"} for n, p in enumerate(produtos)])
            vendas = []
            for n in range(2500):
                item = random.randrange(250)
                preco = 40 + (item * 7) % 260
                qtd = random.choice([1, 1, 1, 2, 3])
                vendas.append({"empresa_id": empresa, "cliente_id": cid, "plataforma": "mercadolivre", "pedido_id": f"2000{cid:03d}{n:06d}",
                               "item_id": f"MLB{cid:03d}{item:05d}", "variacao_id": "", "sku": f"SKU-{cid}-{item}",
                               "titulo": f"Produto {item}", "quantidade": qtd, "preco_unitario": preco, "total": preco * qtd,
                               "comissao": round(preco * qtd * 0.14, 2), "frete_envio": 18.5 if preco >= 79 else 0,
                               "logistica": random.choice(["drop_off", "fulfillment", "cross_docking"]), "uf_destino": random.choice(["SP", "RJ", "MG", "PR", "BA"]),
                               "status": "cancelled" if n % 23 == 0 else "paid", "demo": False, "simulada": False,
                               "data_venda": agora - timedelta(minutes=random.randint(0, 180 * 24 * 60))})
            db.execute(insert(Venda), vendas)
            db.execute(insert(Atividade), [{"empresa_id": empresa, "cliente_id": cid, "usuario_id": random.choice(equipe), "ator": "Operador",
                                            "acao": random.choice(["edicao", "publicacao", "copia", "pesquisa", "financeiro"]),
                                            "descricao": "Atividade de carga", "criada_em": agora - timedelta(minutes=random.randint(0, 90 * 24 * 60))}
                                           for _ in range(1000)])
            db.execute(insert(PedidoAnuncio), [{"empresa_id": empresa, "cliente_id": cid, "marketplaces": ["mercadolivre"],
                                                "produto_texto": f"Pedido {n}", "quantidade": 1 + n % 4,
                                                "status": random.choice(["pendente", "andamento", "concluido", "concluido"]),
                                                "criado_em": agora - timedelta(days=random.randint(0, 60)), "movimentado_em": agora}
                                               for n in range(15)])
            for k in range(5):
                conversa = db.execute(insert(Conversa).values(empresa_id=empresa, cliente_id=cid, pagina="rascunhos", ref_tipo="anuncio", ref_id=ids_anuncio[k],
                                                              titulo=f"Dúvida {k}", criada_em=agora, atualizada_em=agora)).inserted_primary_key[0]
                db.execute(insert(Mensagem), [{"conversa_id": conversa, "autor_id": random.choice(todos)[0], "autor_nome": "Pessoa",
                                               "autor_papel": random.choice(["cliente", "operador"]), "texto": "Mensagem de exemplo " * 5,
                                               "criada_em": agora - timedelta(minutes=m * 30)} for m in range(20)])
            db.commit()
            print(f"cliente {cid} pronto", flush=True)
        db.execute(insert(Notificacao), [{"empresa_id": empresa, "usuario_id": uid, "cliente_id": random.choice(clientes), "tipo": "pedido_novo",
                                          "titulo": "Pedido novo", "texto": "Texto", "link": "#/pedidos", "chave": f"carga-{uid}-{k}",
                                          "criada_em": agora - timedelta(hours=k), "lida_em": None if k < 5 else agora}
                                         for uid, _, _ in todos for k in range(30)])
        db.commit()


def etapa_promocoes():
    """Lê as promoções de 6 clientes ao mesmo tempo (a mesma pressão que travava o banco)
    e copia a leitura para os outros, que levaria muitos minutos."""
    os.environ["DATABASE_URL"] = f"sqlite:///{(PASTA / 'dados' / 'carga.db').as_posix()}"
    os.environ["REPLIQUE_DATA_DIR"] = str(PASTA / "dados")
    sys.path.insert(0, str(RAIZ))
    dados = json.load(open(PASTA / "pessoas.json"))
    dona = dados["pessoas"][0]
    with httpx.Client() as c:
        tok = chamar(c, "POST", "/api/auth/login", n=1, json={"email": dona["email"], "senha": dona["senha"]})["token"]

    def preparar(cid, ler):
        with httpx.Client() as c2:
            chamar(c2, "PUT", "/api/financeiro/config", tok, cid, n=1, json={"regime": "simples", "aliquota_simples_pct": 6})
            chamar(c2, "PUT", "/api/promocoes/config", tok, cid, n=1, json={
                "ativo": True, "margem_minima_pct": 10, "desconto_padrao_pct": 15, "desconto_maximo_pct": 30,
                "dias_campanha": 7, "avisar_dias_antes": 2})
            if not ler:
                return 0.0
            t = time.time()
            chamar(c2, "POST", "/api/promocoes/ler", tok, cid, n=1)
            return time.time() - t

    clientes = dados["clientes"]
    with ThreadPoolExecutor(6) as ex:
        tempos = list(ex.map(preparar, clientes[:6], [True] * 6))
        list(ex.map(preparar, clientes[6:], [False] * len(clientes[6:])))
    print(f"promoções lidas em 6 clientes ao mesmo tempo, sem erro; média {sum(tempos) / 6:.0f}s, máx {max(tempos):.0f}s")
    from sqlalchemy import select

    from backend.banco.db import SessionLocal
    from backend.banco.models import LeituraAutomatica
    with SessionLocal() as db:
        modelo = db.scalar(select(LeituraAutomatica).where(LeituraAutomatica.tarefa == "promocoes",
                                                           LeituraAutomatica.cliente_id == clientes[0]))
        for cid in clientes[6:]:
            db.add(LeituraAutomatica(tarefa=modelo.tarefa, cliente_id=cid, chave=modelo.chave, dados=modelo.dados, lida_em=modelo.lida_em))
        db.commit()


if __name__ == "__main__":
    for etapa in (sys.argv[1:] or ["pessoas", "dados", "promocoes"]):
        print(f"etapa {etapa}...", flush=True)
        {"pessoas": etapa_pessoas, "dados": etapa_dados, "promocoes": etapa_promocoes}[etapa]()
