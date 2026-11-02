"""Registro de acessos (Marco Civil da Internet, art. 15).

Cada entrada, falha de senha, redefinição e troca de senha vira uma linha com
data, hora, IP, porta de origem e navegador. Os registros ficam no banco por
pelo menos 6 meses (o Replique não apaga nenhum) e só o administrador da
empresa os vê; cada pessoa vê os próprios em Minha conta.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from backend.api.limites import ip_do_cliente
from backend.banco.models import RegistroAcesso, Usuario

EVENTOS = {"login": "Entrou", "login_falha": "Senha errada", "login_google": "Entrou com Google", "cadastro": "Criou o acesso",
           "senha_trocada": "Trocou a senha", "senha_redefinida": "Redefiniu a senha pelo e-mail",
           "redefinicao_pedida": "Pediu para redefinir a senha", "sair_todos": "Saiu de todos os aparelhos",
           "senha_ok_2fa": "Senha certa, aguardando o código", "login_2fa": "Entrou com senha e código", "2fa_falha": "Código errado",
           "2fa_ligado": "Ligou a verificação em duas etapas", "2fa_desligado": "Desligou a verificação em duas etapas"}


def _mascarar(email: str) -> str:
    nome, _, dominio = (email or "").partition("@")
    return f"{nome[:2]}***@{dominio}" if dominio else ""


def registrar(db: Session, request: Request | None, evento: str, usuario: Usuario | None = None, email: str = "",
              sucesso: bool = True) -> None:
    """E-mail digitado que não existe fica mascarado: é dado de quem talvez nem seja usuário."""
    ip = ip_do_cliente(request) if request is not None else ""
    porta = str(request.client.port) if request is not None and request.client else ""
    navegador = (request.headers.get("user-agent", "") if request is not None else "")[:300]
    db.add(RegistroAcesso(empresa_id=usuario.empresa_id if usuario else None, usuario_id=usuario.id if usuario else None,
                          email=(usuario.email if usuario else _mascarar(email))[:200], evento=evento, sucesso=sucesso,
                          ip=ip[:64], porta=porta[:10], navegador=navegador))


def acesso_dict(a: RegistroAcesso, nomes: dict[int, str] | None = None) -> dict:
    return {"id": a.id, "evento": a.evento, "evento_nome": EVENTOS.get(a.evento, a.evento), "sucesso": a.sucesso, "ip": a.ip,
            "navegador": a.navegador, "email": a.email, "usuario": (nomes or {}).get(a.usuario_id, ""), "criado_em": a.criado_em}
