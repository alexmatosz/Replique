"""Entrar com Google (OAuth 2.0 / OpenID Connect, fluxo de código).

1. /api/auth/google/iniciar manda o navegador ao Google com um `state` assinado
   e um `nonce`, que também fica num cookie deste navegador (impede que alguém
   faça você entrar na conta dele: "login CSRF");
2. o Google volta em /api/auth/google/callback com um código;
3. o servidor troca o código pelo id_token e pede ao próprio Google para
   validar a assinatura (tokeninfo); confere destinatário, emissor, validade,
   nonce e se o e-mail é verificado.
Só entra quem já tem acesso com aquele e-mail ou tem um convite para ele.
"""

from __future__ import annotations

import time
from urllib.parse import urlencode

import httpx

from backend import config

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
EMISSORES = {"accounts.google.com", "https://accounts.google.com"}


class ErroGoogle(Exception):
    pass


def disponivel() -> bool:
    return bool(config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET)


def url_autorizacao(state: str, nonce: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": config.GOOGLE_CLIENT_ID, "redirect_uri": config.GOOGLE_REDIRECT_URI,
        "response_type": "code", "scope": "openid email profile", "state": state, "nonce": nonce,
        "prompt": "select_account",
    })


def identidade(http: httpx.Client, code: str, nonce: str) -> dict:
    """Troca o código e devolve {sub, email, nome} já conferidos."""
    r = http.post(TOKEN_URL, data={
        "code": code, "client_id": config.GOOGLE_CLIENT_ID, "client_secret": config.GOOGLE_CLIENT_SECRET,
        "redirect_uri": config.GOOGLE_REDIRECT_URI, "grant_type": "authorization_code"}, timeout=20)
    if r.status_code >= 400 or "id_token" not in r.json():
        raise ErroGoogle("O Google recusou a autorização. Tente de novo.")
    info = http.get(TOKENINFO_URL, params={"id_token": r.json()["id_token"]}, timeout=20)
    if info.status_code >= 400:
        raise ErroGoogle("Não consegui confirmar a conta Google.")
    c = info.json()
    if c.get("aud") != config.GOOGLE_CLIENT_ID or c.get("iss") not in EMISSORES:
        raise ErroGoogle("A resposta do Google não é para este aplicativo.")
    if int(c.get("exp", 0)) < time.time():
        raise ErroGoogle("A autorização do Google expirou. Tente de novo.")
    if c.get("nonce") != nonce:
        raise ErroGoogle("A autorização não foi iniciada neste navegador. Tente de novo.")
    if str(c.get("email_verified")).lower() != "true" or not c.get("email"):
        raise ErroGoogle("Esta conta Google não tem e-mail verificado.")
    return {"sub": c["sub"], "email": c["email"].strip().lower(), "nome": c.get("name") or c["email"].split("@")[0]}
