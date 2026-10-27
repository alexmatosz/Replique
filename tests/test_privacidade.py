"""Senha esquecida, registro de acessos (Marco Civil), aceite dos Termos e pedidos do titular (LGPD)."""

from app.api import privacidade
from app.services import email as servico_email


def test_esqueci_nao_revela_se_o_email_existe_e_o_link_vale_uma_vez(client, time, novo_email, monkeypatch):
    enviados = []
    monkeypatch.setattr(servico_email, "enviar", lambda para, assunto, texto, html=None: enviados.append((para, texto)) or (True, ""))
    privacidade.pedidos_senha_email.limpar("email:ninguem@teste.com")
    existe = client.post("/api/auth/esqueci", json={"email": "ninguem@teste.com"}).json()
    email = client.get("/api/me", headers=time["op"]).json()["email"]
    privacidade.pedidos_senha_email.limpar("email:" + email)
    sim = client.post("/api/auth/esqueci", json={"email": email.upper()}).json()
    assert existe == sim and len(enviados) == 1 and enviados[0][0] == email
    token = enviados[0][1].split("#/nova-senha/")[1].split()[0]
    assert client.post("/api/auth/nova-senha", json={"token": token, "senha": "12345678"}).status_code == 400
    r = client.post("/api/auth/nova-senha", json={"token": token, "senha": "Nova-Senha-Forte-77"})
    assert r.status_code == 200 and "token" not in r.json()
    assert client.post("/api/auth/nova-senha", json={"token": token, "senha": "Outra-Senha-Forte-88"}).status_code == 400
    assert client.get("/api/me", headers=time["op"]).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "senha": "Nova-Senha-Forte-77"}).status_code == 200
    assert client.post("/api/auth/nova-senha", json={"token": "falso", "senha": "Nova-Senha-Forte-77"}).status_code == 400


def test_registro_de_acessos_guarda_ip_e_so_o_admin_ve_tudo(client, time):
    email = client.get("/api/me", headers=time["cons"]).json()["email"]
    client.post("/api/auth/login", json={"email": email, "senha": "errada-errada"})
    client.post("/api/auth/login", json={"email": email, "senha": "senha-forte-123"})
    meus = client.get("/api/me/acessos", headers=time["cons"]).json()
    assert {"login", "login_falha"} <= {a["evento"] for a in meus} and all(a["ip"] for a in meus)
    todos = client.get("/api/empresa/acessos?so_falhas=true", headers=time["admin"]).json()
    assert todos and all(not a["sucesso"] for a in todos)
    assert client.get("/api/empresa/acessos", headers=time["cons"]).status_code == 403
    client.post("/api/auth/login", json={"email": "naoexiste@teste.com", "senha": "qualquer-coisa"})


def test_aceite_dos_termos_fica_registrado(client, time):
    assert client.get("/api/me", headers=time["loja"]).json()["termos_pendentes"] is True
    r = client.post("/api/me/aceite", headers=time["loja"]).json()
    assert r["versao"] and r["aceitos_em"]
    assert client.get("/api/me", headers=time["loja"]).json()["termos_pendentes"] is False
    info = client.get("/api/publico/privacidade").json()
    assert info["versao"] == r["versao"] and "prazo_titular_dias" in info


def test_copia_dos_dados_e_pedido_de_exclusao_sem_apagar_nada(client, time):
    r = client.get("/api/me/dados", headers=time["loja"])
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    assert r.json()["cadastro"]["papel"] == "cliente" and "senha_hash" not in r.text
    p = client.post("/api/me/pedido-titular", headers=time["loja"], json={"tipo": "exclusao", "detalhes": "Encerrei a loja"})
    assert p.status_code == 200
    assert client.post("/api/me/pedido-titular", headers=time["loja"], json={"tipo": "exclusao"}).status_code == 400
    avisos = client.get("/api/notificacoes", headers=time["admin"]).json()["itens"]
    assert any(n["tipo"] == "pedido_titular" for n in avisos)
    pedidos = client.get("/api/empresa/pedidos-titular", headers=time["admin"]).json()
    assert pedidos[0]["status"] == "aberto" and not pedidos[0]["vencido"]
    assert client.get("/api/empresa/pedidos-titular", headers=time["op"]).status_code == 403
    assert client.post(f"/api/empresa/pedidos-titular/{pedidos[0]['id']}/atendido", headers=time["admin"],
                       json={"resposta": "Acesso desativado; registros de acesso guardados por 6 meses (Marco Civil)."}).status_code == 200
    assert client.get("/api/me", headers=time["loja"]).status_code == 200
    resposta = client.get("/api/notificacoes", headers=time["loja"]).json()["itens"]
    assert any("respondido" in n["titulo"] for n in resposta)
