"""Entrada na conta e avisos de segurança para a própria pessoa.

- finalizar_login: depois da senha (ou do Google), pede o segundo fator quando
  ele está ligado; senão devolve a sessão;
- avisar: avisa a pessoa no sino e por e-mail (quando há SMTP) de mudanças na
  conta e de tentativas suspeitas (ASVS 6.3.5 e 6.3.7).
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from backend import config
from backend.banco.models import RegistroAcesso, Usuario
from backend.security import criar_assinado, criar_token_sessao
from backend.services import acessos, email, notificacoes

DESAFIO_2FA_S = 300


def sessao_dict(u: Usuario) -> dict:
    from backend.api.auth import _usuario_dict
    return {"token": criar_token_sessao(u.id, u.empresa_id, u.sessao_versao or 0), "usuario": _usuario_dict(u)}


def finalizar_login(db: Session, request: Request | None, u: Usuario, evento: str = "login") -> dict:
    if u.totp_ativo:
        acessos.registrar(db, request, "senha_ok_2fa", u)
        db.commit()
        return {"precisa_2fa": True,
                "desafio": criar_assinado("2fa", {"u": u.id, "v": u.sessao_versao or 0, "ev": evento}, DESAFIO_2FA_S)}
    ip_novo = _ip_novo(db, u, request)
    acessos.registrar(db, request, evento, u)
    if ip_novo:
        avisar(db, u, "Novo acesso à sua conta", f"Entrada a partir do endereço {ip_novo}. Se não foi você, troque a senha e use "
               "“Sair de todos os aparelhos” em Minha conta.", email_tambem=False)
    db.commit()
    return sessao_dict(u)


def _ip_novo(db: Session, u: Usuario, request: Request | None) -> str:
    """IP que a pessoa nunca usou, quando ela já tem entradas anteriores."""
    if request is None:
        return ""
    from backend.api.limites import ip_do_cliente
    ip = ip_do_cliente(request)
    anteriores = {i for (i,) in db.query(RegistroAcesso.ip).filter(
        RegistroAcesso.usuario_id == u.id, RegistroAcesso.sucesso.is_(True),
        RegistroAcesso.evento.in_(("login", "login_google", "login_2fa"))).order_by(RegistroAcesso.id.desc()).limit(50)}
    return ip if anteriores and ip and ip not in anteriores else ""


def avisar(db: Session, u: Usuario, titulo: str, texto: str, email_tambem: bool = True) -> None:
    notificacoes.notificar(db, None, "seguranca_conta", titulo, texto, "#/inicio" if u.papel != "cliente" else "#/acompanhamento",
                           usuarios=[u.id], empresa_id=u.empresa_id)
    if email_tambem:
        email.enviar(u.email, f"Monvatti Radar: {titulo.lower()}",
                     f"Olá, {u.nome}.\n\n{texto}\n\nSe não foi você, troque a senha agora em {config.PUBLIC_BASE_URL} "
                     "(Esqueci minha senha) e avise a sua agência.")
