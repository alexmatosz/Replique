"""Envio de e-mail por SMTP (convites da equipe).

Sem SMTP configurado nada é enviado: quem chama mostra o link para copiar e
mandar por outro meio (WhatsApp, e-mail pessoal...).
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from backend import config

log = logging.getLogger(__name__)


def disponivel() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_REMETENTE)


def enviar(para: str, assunto: str, texto: str, html: str | None = None) -> tuple[bool, str]:
    """(enviou?, motivo se não enviou)."""
    if not disponivel():
        return False, "envio de e-mail não configurado no servidor (SMTP_HOST no .env)"
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = config.SMTP_REMETENTE, para, assunto
    msg.set_content(texto)
    if html:
        msg.add_alternative(html, subtype="html")
    contexto = ssl.create_default_context()
    try:
        if config.SMTP_PORTA == 465:
            with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORTA, context=contexto, timeout=20) as s:
                if config.SMTP_USUARIO:
                    s.login(config.SMTP_USUARIO, config.SMTP_SENHA)
                s.send_message(msg)
        else:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORTA, timeout=20) as s:
                s.starttls(context=contexto)
                if config.SMTP_USUARIO:
                    s.login(config.SMTP_USUARIO, config.SMTP_SENHA)
                s.send_message(msg)
        return True, ""
    except (smtplib.SMTPException, OSError) as e:
        log.warning("Falha enviando e-mail para %s: %s", para, e)
        return False, f"o servidor de e-mail recusou ({e.__class__.__name__}). Confira SMTP_* no .env"
