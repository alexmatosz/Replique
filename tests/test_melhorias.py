"""Correções de segurança para hospedar e as funções novas (risco, margem,
aprovação, gerador de fotos, saúde, radar, perguntas e relatório)."""

from io import BytesIO

import httpx
import pytest
from PIL import Image, ImageDraw
from starlette.requests import Request

from app import config
from app.api import limites


def _login(client, email, senha="senha-forte-123"):
    r = client.post("/api/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture
def loja(client, sessao, novo_email):
    """Admin (sessao), o cliente A e o login do lojista de A."""
    admin = {"Authorization": sessao["Authorization"]}
    a = int(sessao["X-Cliente"])
    email = novo_email("loja")
    assert client.post(f"/api/clientes/{a}/logins", headers=admin, json={
        "nome": "Lojista", "email": email, "senha": "senha-forte-123"}).status_code == 200
    return {"admin": sessao, "cliente": a, "lojista": _login(client, email)}


def _publicavel(client, sessao, **extra):
    corpo = {"titulo": "Garrafa Térmica Inox 1 Litro", "preco": 100, "fotos": ["https://cdn.exemplo.com/1.jpg"],
             "descricao": "Garrafa térmica de aço inox, mantém a bebida quente por 12 horas. " * 3, **extra}
    r = client.post("/api/anuncios", headers=sessao, json=corpo)
    assert r.status_code == 200, r.text
    return r.json()


def _png(fundo=(200, 200, 200), tamanho=(800, 800), produto=(30, 90, 200)) -> bytes:
    img = Image.new("RGB", tamanho, fundo)
    ImageDraw.Draw(img).rectangle((250, 200, 550, 650), fill=produto)
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _requisicao(ip: str, cabecalhos: dict | None = None) -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "client": (ip, 1234),
                    "headers": [(k.lower().encode(), v.encode()) for k, v in (cabecalhos or {}).items()]})


# ================================================================== segurança
def test_ip_real_nao_pode_ser_forjado(monkeypatch):
    monkeypatch.setattr(config, "PROXY_MODO", "cloudflare")
    monkeypatch.setattr(config, "PROXY_IPS", ["127.0.0.1", "::1"])
    # atrás do túnel: vale o CF-Connecting-IP; X-Forwarded-For é ignorado
    assert limites.ip_do_cliente(_requisicao("127.0.0.1", {"X-Forwarded-For": "127.0.0.1"})) == "127.0.0.1"
    assert limites.ip_do_cliente(_requisicao("127.0.0.1", {"CF-Connecting-IP": "203.0.113.9",
                                                           "X-Forwarded-For": "127.0.0.1"})) == "203.0.113.9"
    # de fora (não é o proxy): nenhum cabeçalho vale
    assert limites.ip_do_cliente(_requisicao("198.51.100.7", {"CF-Connecting-IP": "127.0.0.1"})) == "198.51.100.7"
    # proxy reverso comum: vale o IP mais à direita que não é proxy (o da esquerda qualquer um escreve)
    monkeypatch.setattr(config, "PROXY_MODO", "xff")
    monkeypatch.setattr(config, "PROXY_IPS", ["10.0.0.0/8"])
    assert limites.ip_do_cliente(_requisicao("10.1.2.3", {"X-Forwarded-For": "127.0.0.1, 198.51.100.7"})) == "198.51.100.7"
    assert limites.ip_do_cliente(_requisicao("10.1.2.3", {"X-Forwarded-For": "198.51.100.7, 10.9.9.9"})) == "198.51.100.7"


def test_senha_fraca_nao_entra_com_ip_forjado(client, sessao, monkeypatch):
    from app.db import SessionLocal
    from app.models import Usuario
    from app.security import hash_senha
    email = client.get("/api/me", headers=sessao).json()["email"]
    with SessionLocal() as db:
        db.query(Usuario).filter_by(email=email).one().senha_hash = hash_senha("12345678")
        db.commit()
    monkeypatch.setattr(config, "PROXY_MODO", "xff")
    monkeypatch.setattr(config, "PROXY_IPS", ["127.0.0.1"])
    r = client.post("/api/auth/login", json={"email": email, "senha": "12345678"},
                    headers={"X-Forwarded-For": "127.0.0.1, 198.51.100.7"})
    assert r.status_code == 403 and "fraca" in r.json()["detail"]


def test_primeiro_admin_so_no_servidor():
    assert limites.acesso_local(_requisicao("127.0.0.1"))
    assert not limites.acesso_local(_requisicao("127.0.0.1", {"CF-Connecting-IP": "203.0.113.9"}))
    assert not limites.acesso_local(_requisicao("127.0.0.1", {"X-Forwarded-For": "203.0.113.9"}))
    assert not limites.acesso_local(_requisicao("198.51.100.7"))


def test_cadastros_recusam_senha_comum(client, sessao):
    r = client.post("/api/auth/cadastro", json={"empresa": "Nova", "nome": "Zé", "email": "ze.fraco@teste.com",
                                                "senha": "12345678"})
    assert r.status_code == 400 and "comum" in r.json()["detail"]
    token = client.get("/api/empresa/convite", headers=sessao).json()["token"]
    r = client.post(f"/api/convite/{token}", json={"loja": "Loja", "nome": "Zé", "email": "ze.loja@teste.com",
                                                   "senha": "senha123"})
    assert r.status_code == 400


def test_conexao_ml_exige_a_url_completa(client, sessao):
    r = client.post("/api/contas/mercadolivre/conectar", headers=sessao, json={"texto": "TG-123456"})
    assert r.status_code == 400 and "URL COMPLETA" in r.json()["detail"]


def test_sair_de_todos_os_dispositivos(client, sessao):
    assert client.post("/api/me/sair-de-todos", headers=sessao).status_code == 200
    assert client.get("/api/me", headers=sessao).status_code == 401


def test_envio_grande_demais_e_recusado_antes_de_ler(client, sessao):
    r = client.post("/api/uploads", headers={**sessao, "Content-Length": str(50 * 1024 * 1024)}, content=b"x")
    assert r.status_code == 413


def test_campos_com_tamanho_maximo(client, sessao):
    a = _publicavel(client, sessao)
    assert client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"titulo": "x" * 301}).status_code == 400
    assert client.patch(f"/api/anuncios/{a['id']}", headers=sessao,
                        json={"atributos": {f"k{i}": "v" for i in range(300)}}).status_code == 400


def test_limite_de_uso_por_usuario():
    lim = limites.Limitador(2, 3600, "Limite. Tente em {minutos} min.")
    limites.consumir(lim, 999)
    limites.consumir(lim, 999)
    with pytest.raises(Exception) as e:
        limites.consumir(lim, 999)
    assert e.value.status_code == 429
    limites.consumir(lim, 1000)  # outro usuário não é afetado


def test_fila_nao_publica_o_mesmo_lote_em_dois_processos(client, sessao):
    from datetime import datetime, timezone

    from app.db import SessionLocal
    from app.models import Lote
    from app.services import lotes
    a = _publicavel(client, sessao)
    lote = client.post("/api/lotes", headers=sessao, json={"anuncio_ids": [a["id"]], "plataformas": ["mercadolivre"],
                                                           "confirmado": True}).json()
    agora = datetime.now(timezone.utc)
    with SessionLocal() as db1, SessionLocal() as db2:
        l1, l2 = db1.get(Lote, lote["id"]), db2.get(Lote, lote["id"])
        assert lotes._reservar(db1, l1, agora) is True
        assert lotes._reservar(db2, l2, agora) is False  # o segundo processo não pega


def test_renovacao_do_token_usa_o_que_outro_processo_gravou():
    import time

    from app.marketplaces.mercadolivre import MercadoLivre
    vencido = {"access_token": "velho", "refresh_token": "r1", "obtido_em": 0, "expires_in": 21600}
    novo = {"access_token": "novo", "refresh_token": "r2", "obtido_em": time.time(), "expires_in": 21600}

    def proibido(req):
        raise AssertionError("não deveria renovar de novo: o refresh token já foi usado pelo outro processo")
    ml = MercadoLivre(dict(vencido), recarregar_credenciais=lambda: dict(novo), chave_trava="conta:teste")
    ml.http = httpx.Client(transport=httpx.MockTransport(proibido))
    assert ml._token() == "novo"


# ================================================================== nota de risco
def test_risco_aponta_texto_e_foto_do_concorrente(client, sessao):
    r = client.post("/api/pesquisas", headers=sessao, json={"termo": "garrafa térmica", "plataformas": ["mercadolivre"]})
    item = r.json()["resultados"][0]
    a = client.post("/api/anuncios/copiar", headers=sessao, json={
        "plataforma": "mercadolivre", "id_externo": item["id_externo"], "tipo": item["tipo"],
        "pesquisa_id": r.json()["id"]}).json()
    risco = client.get(f"/api/anuncios/{a['id']}/risco", headers=sessao).json()
    textos = " ".join(m["texto"] for m in risco["motivos"])
    assert risco["nota"] >= 40 and "Título" in textos and "fotos" in textos.lower()
    assert risco["nivel"] in ("medio", "alto")


def test_risco_reconhece_a_mesma_foto_reescalada(monkeypatch):
    from app.models import Anuncio
    from app.services import imagens, risco
    original = _png()
    menor = Image.open(BytesIO(original)).resize((500, 500))
    buf = BytesIO()
    menor.save(buf, "JPEG", quality=70)
    propria = Image.new("RGB", (800, 800), "white")
    ImageDraw.Draw(propria).ellipse((20, 400, 380, 780), fill=(200, 30, 30))
    buf2 = BytesIO()
    propria.save(buf2, "PNG")
    fotos = {"https://concorrente/a.jpg": original, "https://nossa/b.jpg": buf.getvalue(),
             "https://nossa/c.jpg": buf2.getvalue()}
    monkeypatch.setattr(imagens, "ler_bytes", lambda url, empresa_id, http: fotos[url])
    a = Anuncio(empresa_id=1, fotos=["https://nossa/c.jpg", "https://nossa/b.jpg"],
                origem={"plataforma": "mercadolivre", "fotos_originais": ["https://concorrente/a.jpg"]})
    iguais, comparou = risco.fotos_do_concorrente(a, http=httpx.Client())
    assert comparou and iguais == [1]


def test_risco_avisa_marca_protegida(client, sessao):
    a = _publicavel(client, sessao, marca="Nike", titulo="Tênis Nike Corrida")
    risco = client.get(f"/api/anuncios/{a['id']}/risco", headers=sessao).json()
    assert any("proteção de marca" in m["texto"] for m in risco["motivos"])


# ================================================================== margem
def test_margem_mostra_lucro_prejuizo_e_preco_minimo(client, sessao):
    a = _publicavel(client, sessao, custo=40, imposto_pct=10)
    m = client.post(f"/api/anuncios/{a['id']}/margem", headers=sessao, json={"plataformas": ["shopee", "mercadolivre"]}).json()
    s = m["shopee"]
    esperado = 100 - (100 * config.SHOPEE_COMISSAO_PCT / 100 + config.SHOPEE_TAXA_FIXA) - 10 - 40
    assert s["lucro"] == pytest.approx(esperado, abs=0.01) and s["preco_minimo"] > 0
    caro = client.post(f"/api/anuncios/{a['id']}/margem", headers=sessao, json={"plataformas": ["shopee"], "preco": 45}).json()
    assert caro["shopee"]["alerta"] == "prejuizo"
    sem_custo = _publicavel(client, sessao)
    assert client.post(f"/api/anuncios/{sem_custo['id']}/margem", headers=sessao,
                       json={}).json()["amazon"]["alerta"] == "sem_custo"


# ================================================================== aprovação do lojista
def test_aprovacao_do_lojista_trava_a_publicacao(client, loja):
    admin, lojista = loja["admin"], loja["lojista"]
    assert client.patch(f"/api/clientes/{loja['cliente']}", headers=admin, json={"exige_aprovacao": True}).status_code == 200
    a = _publicavel(client, admin)
    r = client.post(f"/api/anuncios/{a['id']}/publicar", headers=admin, json={"plataformas": ["mercadolivre"]})
    assert r.status_code == 400 and "aprovação" in r.json()["detail"]
    # lote também respeita
    previa = client.post("/api/lotes/previa", headers=admin, json={"anuncio_ids": [a["id"]], "plataformas": ["mercadolivre"]}).json()
    assert previa["itens"][0]["plataformas"]["mercadolivre"]["situacao"] == "bloqueado"
    assert client.post(f"/api/anuncios/{a['id']}/aprovacao/solicitar", headers=admin).status_code == 200
    # só o lojista decide; recusar exige dizer o motivo
    assert client.post(f"/api/anuncios/{a['id']}/aprovacao", headers=admin, json={"decisao": "aprovar"}).status_code == 403
    assert client.post(f"/api/anuncios/{a['id']}/aprovacao", headers=lojista, json={"decisao": "recusar"}).status_code == 400
    pendentes = client.get("/api/aprovacoes", headers=lojista).json()
    assert [p["id"] for p in pendentes] == [a["id"]]
    assert client.post(f"/api/anuncios/{a['id']}/aprovacao", headers=lojista, json={"decisao": "aprovar"}).status_code == 200
    r = client.post(f"/api/anuncios/{a['id']}/publicar", headers=admin, json={"plataformas": ["mercadolivre"]})
    assert r.status_code == 200 and r.json()["publicacoes"][0]["sucesso"]
    # mudou o conteúdo depois de aprovado: precisa aprovar de novo
    editado = client.patch(f"/api/anuncios/{a['id']}", headers=admin, json={"titulo": "Garrafa Térmica 1L Nova Versão"}).json()
    assert editado["aprovacao"] == ""
    # mudar só o custo não pede nova aprovação
    client.patch(f"/api/clientes/{loja['cliente']}", headers=admin, json={"exige_aprovacao": False})


# ================================================================== gerador de fotos
def test_gerador_faz_fundo_branco_e_caracteristicas_sem_ia(client, sessao):
    enviada = client.post("/api/uploads", headers=sessao,
                          files={"arquivo": ("p.png", _png(fundo=(190, 200, 210)), "image/png")}).json()
    a = _publicavel(client, sessao, fotos=[enviada["url"]],
                    atributos={"Material": "Aço inox", "Capacidade": "1 litro", "Cor": "Preto"})
    r = client.post(f"/api/anuncios/{a['id']}/fotos/gerar", headers=sessao, json={
        "foto": enviada["url"], "tipos": ["branco", "caracteristicas", "contexto", "demonstrativa"]})
    assert r.status_code == 200, r.text
    g = client.get(f"/api/fotos/geracoes/{r.json()['id']}", headers=sessao).json()
    assert g["status"] == "concluido"
    por_tipo = {x["tipo"]: x for x in g["resultado"]}
    assert list(por_tipo) == ["branco", "caracteristicas", "contexto", "demonstrativa"]
    assert por_tipo["branco"]["url"].startswith("/uploads/") and por_tipo["caracteristicas"]["url"]
    assert not por_tipo["contexto"]["url"] and "OPENAI_API_KEY" in por_tipo["contexto"]["aviso"]
    # capa: fundo branco puro e 1200x1200
    img = Image.open(BytesIO(client.get(por_tipo["branco"]["url"]).content)).convert("RGB")
    assert img.size == (1200, 1200) and img.getpixel((5, 5)) == (255, 255, 255)
    assert img.getpixel((600, 600))[2] > 150  # o produto (azul) continua lá
    # a foto gerada pode entrar no anúncio (é da própria empresa)
    assert client.patch(f"/api/anuncios/{a['id']}", headers=sessao, json={"fotos": [por_tipo["branco"]["url"]]}).status_code == 200


def test_gerador_recusa_foto_de_demonstracao(client, sessao):
    a = _publicavel(client, sessao)
    r = client.post(f"/api/anuncios/{a['id']}/fotos/gerar", headers=sessao,
                    json={"foto": "/demo-img.svg?t=x", "tipos": ["branco"]})
    assert r.status_code == 400


def test_gerador_usa_a_ia_configurada(client, sessao, monkeypatch):
    from app.services import gerador_fotos
    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-teste")
    pedidos = []

    def falsa(http, referencia, prompt):
        pedidos.append(prompt)
        return Image.new("RGB", (1024, 1024), (250, 250, 250))
    monkeypatch.setattr(gerador_fotos, "gerar_com_ia", falsa)
    enviada = client.post("/api/uploads", headers=sessao, files={"arquivo": ("p.png", _png(), "image/png")}).json()
    a = _publicavel(client, sessao, fotos=[enviada["url"]])
    r = client.post(f"/api/anuncios/{a['id']}/fotos/gerar", headers=sessao, json={
        "foto": enviada["url"], "tipos": ["branco", "contexto", "demonstrativa"], "cenario": "numa cozinha moderna"})
    g = client.get(f"/api/fotos/geracoes/{r.json()['id']}", headers=sessao).json()
    assert g["status"] == "concluido" and all(x["url"] for x in g["resultado"])
    assert len(pedidos) == 3 and any("cozinha moderna" in p for p in pedidos)
    assert all("EXACTLY" in p for p in pedidos)  # a IA é instruída a não mexer no produto


# ================================================================== saúde, radar, perguntas, relatório
def test_saude_classifica_pelos_limites_do_ml():
    from app.services import saude
    rep = {"reputacao": {"level_id": "5_green", "metrics": {
        "claims": {"rate": 0.03}, "cancellations": {"rate": 0.001}, "delayed_handling_time": {"rate": 0.08}}}}
    nivel, dados = saude.analisar(rep, {"active": 10, "paused": 0, "under_review": 0}, [])
    assert nivel == "critico"
    cores = {m["id"]: m["cor"] for m in dados["metricas"]}
    assert cores == {"claims": "amarelo", "cancellations": "lider", "delayed_handling_time": "verde"}
    # conta protegida: o que vale é o número real
    rep = {"reputacao": {"protection_end_date": "2026-12-01", "metrics": {
        "claims": {"rate": 0, "excluded": {"real_rate": 0.09}}}}}
    assert saude.analisar(rep, {}, [])[0] == "critico"
    pausado = [{"id": "MLB1", "title": "X", "sub_status": ["waiting_for_patch"]}]
    ok_rep = {"reputacao": {"metrics": {}}}
    assert saude.analisar(ok_rep, {}, pausado)[0] == "critico"
    assert saude.analisar(ok_rep, {}, [{"id": "MLB2", "sub_status": ["out_of_stock"]}])[0] == "ok"


def test_saude_em_demonstracao(client, sessao):
    cid = int(sessao["X-Cliente"])
    r = client.post(f"/api/saude/{cid}/atualizar", headers=sessao).json()
    assert r["demo"] and r["nivel"] in ("ok", "atencao", "critico") and r["dados"]["metricas"]
    lista = client.get("/api/saude", headers=sessao).json()
    assert any(c["id"] == cid and c["nivel"] == r["nivel"] for c in lista)


def test_radar_sugere_preco_e_aplica(client, sessao):
    a = _publicavel(client, sessao, custo=30)
    client.post(f"/api/anuncios/{a['id']}/publicar", headers=sessao, json={"plataformas": ["mercadolivre"]})
    r = client.post(f"/api/anuncios/{a['id']}/radar", headers=sessao).json()
    assert r["demo"] and r["dados"]["quantidade"] == 5 and r["dados"]["situacao"] in ("acima", "abaixo", "competitivo", "no_limite")
    assert client.get("/api/radar", headers=sessao).json()[0]["radar"]["dados"]["meu_preco"] == 100
    ap = client.post(f"/api/anuncios/{a['id']}/radar/aplicar", headers=sessao, json={"preco": 95}).json()
    assert ap["simulado"] and client.get(f"/api/anuncios/{a['id']}", headers=sessao).json()["preco"] == 95
    # preço com prejuízo não é aplicado
    assert client.post(f"/api/anuncios/{a['id']}/radar/aplicar", headers=sessao, json={"preco": 20}).status_code == 400


def test_radar_calcula_a_sugestao():
    from app.services.radar import sugerir
    assert sugerir(120, [100, 110], None)[:2] == ("acima", 99.9)
    assert sugerir(120, [100], 105)[:2] == ("acima", 105)  # não desce abaixo da margem mínima
    assert sugerir(80, [100], None)[0] == "abaixo"
    assert sugerir(99, [100], None)[0] == "competitivo"
    assert sugerir(100, [], None)[0] == "sem_dados"


@pytest.mark.parametrize("texto", [
    "Olá! Chama no whatsapp 11 98888-7777", "Me manda um e-mail: loja@exemplo.com",
    "Veja em https://minhaloja.com.br", "Olá! Temos sim. [complete com a informação]",
])
def test_resposta_com_contato_e_barrada(texto):
    from app.services.perguntas import conferir_resposta
    with pytest.raises(ValueError):
        conferir_resposta(texto)


def test_perguntas_em_demonstracao(client, sessao):
    lista = client.get("/api/perguntas", headers=sessao).json()
    assert lista["demo"] and lista["perguntas"]
    q = lista["perguntas"][0]
    s = client.post(f"/api/perguntas/{q['id']}/sugerir", headers=sessao, json={"texto": q["texto"], "item_id": q["item_id"]}).json()
    assert s["resposta"].startswith("Olá")
    assert client.post(f"/api/perguntas/{q['id']}/responder", headers=sessao,
                       json={"texto": "Olá! Sim, é bivolt. Qualquer dúvida estamos à disposição!"}).json()["simulado"]
    assert client.post(f"/api/perguntas/{q['id']}/responder", headers=sessao,
                       json={"texto": "Chama no zap"}).status_code == 400


def test_relatorio_mensal(client, loja):
    from datetime import datetime, timezone
    admin = loja["admin"]
    a = _publicavel(client, admin)
    client.post(f"/api/anuncios/{a['id']}/publicar", headers=admin, json={"plataformas": ["mercadolivre"]})
    mes = datetime.now(timezone.utc).strftime("%Y-%m")
    r = client.get(f"/api/relatorios/{loja['cliente']}?mes={mes}", headers=admin).json()
    assert r["numeros"]["rascunhos_criados"] >= 1 and r["cliente"]["id"] == loja["cliente"]
    # o lojista vê o relatório da própria loja
    assert client.get(f"/api/relatorios/{loja['cliente']}?mes={mes}", headers=loja["lojista"]).status_code == 200
    assert client.get(f"/api/relatorios/{loja['cliente']}?mes=2026-13", headers=admin).status_code == 400


def test_infografico_nao_separa_numero_da_unidade():
    from app.services import gerador_fotos
    desenho = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    linhas = gerador_fotos._quebrar(desenho, "Conexão: Cabo P2 3,5 mm", gerador_fotos._fonte(42), 440)
    assert any("3,5\u00a0mm" in linha for linha in linhas)


def test_tela_sempre_confere_versao_nova(client):
    assert client.get("/").headers["cache-control"] == "no-cache"
    assert client.get("/static/app.js").headers["cache-control"] == "no-cache"


def test_pagina_aponta_para_a_versao_atual_dos_arquivos(client):
    import hashlib

    from app.main import WEB_DIR
    pagina = client.get("/").text
    for nome in ("app.js", "app.css", "tema.js"):
        versao = hashlib.sha256((WEB_DIR / nome).read_bytes()).hexdigest()[:10]
        assert f"/static/{nome}?v={versao}" in pagina
