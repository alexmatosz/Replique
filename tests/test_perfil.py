"""Cada pessoa edita o próprio nome e foto; o admin renomeia a empresa."""

from io import BytesIO

from PIL import Image


def _png(largura=900, altura=600):
    saida = BytesIO()
    Image.new("RGB", (largura, altura), (20, 90, 240)).save(saida, "PNG")
    return saida.getvalue()


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "senha": "senha-forte-123"})
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_nome_e_foto_do_proprio_perfil(client, sessao):
    from backend.config import UPLOADS_DIR
    h = {"Authorization": sessao["Authorization"]}
    r = client.patch("/api/me", headers=h, json={"nome": "Ana Souza"})
    assert r.status_code == 200 and r.json()["nome"] == "Ana Souza"
    r = client.post("/api/me/foto", headers=h, files={"arquivo": ("eu.png", _png(), "image/png")})
    assert r.status_code == 200, r.text
    foto = r.json()["foto"]
    assert foto.startswith("/uploads/") and foto.endswith(".jpg")
    arquivo = UPLOADS_DIR / foto.removeprefix("/uploads/")
    with Image.open(arquivo) as img:
        assert img.size == (320, 320) and img.format == "JPEG"
    assert client.get("/api/me", headers=h).json()["foto"] == foto
    r = client.post("/api/me/foto", headers=h, files={"arquivo": ("eu.png", _png(400, 400), "image/png")})
    assert r.json()["foto"] != foto and not arquivo.exists()
    assert client.delete("/api/me/foto", headers=h).json()["foto"] == ""
    assert client.post("/api/me/foto", headers=h, files={"arquivo": ("x.png", b"nao sou imagem", "image/png")}).status_code == 400
    assert client.patch("/api/me", headers=h, json={"nome": "A"}).status_code == 422


def test_so_admin_renomeia_a_empresa(client, sessao, novo_email):
    admin = {"Authorization": sessao["Authorization"]}
    email = novo_email("op")
    client.post("/api/empresa/usuarios", headers=admin, json={"nome": "Olga", "email": email, "senha": "senha-forte-123",
                                                              "papel": "operador", "clientes": []})
    op = _login(client, email)
    assert client.patch("/api/me", headers=op, json={"nome": "Olga Lima"}).json()["nome"] == "Olga Lima"
    assert client.patch("/api/empresa", headers=op, json={"nome": "Outra"}).status_code == 403
    r = client.patch("/api/empresa", headers=admin, json={"nome": "Agência Nova"})
    assert r.status_code == 200 and r.json()["empresa"]["nome"] == "Agência Nova"
    equipe = client.get("/api/empresa/usuarios", headers=admin).json()
    assert any(u["nome"] == "Olga Lima" for u in equipe) and all("foto" in u for u in equipe)
