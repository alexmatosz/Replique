"""Monitor de lentidão: avisa quando uma resposta passa de 2 segundos.

Para o dono do servidor saber do problema antes do cliente. Não fica mandando
mensagem a cada resposta lenta (isso viraria spam): junta tudo durante o dia e
manda um relatório só, uma vez por dia, com onde e quando houve demora.

O relatório vai por e-mail (SMTP, se configurado) e por um webhook de WhatsApp
(ALERTA_WHATSAPP_WEBHOOK, se configurado); sem nenhum dos dois, fica guardado
para ver em Segurança › Desempenho. Os eventos são gravados num arquivo do dia
em DATA_DIR para não se perderem se o servidor reiniciar.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from backend import config

log = logging.getLogger("replique.latencia")
FUSO = ZoneInfo("America/Sao_Paulo")
_trava = threading.Lock()
_eventos: list[dict] = []
_total = 0
_dia: str | None = None


def _hoje() -> str:
    return datetime.now(FUSO).date().isoformat()


def _arquivo(dia: str) -> Path:
    return config.DATA_DIR / f"lentidao-{dia}.json"


def _carregar(dia: str) -> None:
    """Traz do disco os eventos já gravados hoje (sobrevive a reinício do servidor)."""
    global _eventos, _total, _dia
    _dia = dia
    _eventos = []
    _total = 0
    try:
        dados = json.loads(_arquivo(dia).read_text(encoding="utf-8"))
        _eventos = dados.get("eventos", [])[: config.LATENCIA_MAX_EVENTOS]
        _total = int(dados.get("total", len(_eventos)))
    except (FileNotFoundError, ValueError, OSError):
        pass


def _gravar() -> None:
    try:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        _arquivo(_dia).write_text(json.dumps({"dia": _dia, "total": _total, "eventos": _eventos}), encoding="utf-8")
    except OSError as e:
        log.warning("Não consegui gravar o registro de lentidão: %s", e)


def _rota(caminho: str) -> str:
    """Agrupa /api/anuncios/123 como /api/anuncios/{id} para o relatório não virar uma lista de ids."""
    partes = []
    for p in caminho.split("/"):
        partes.append("{id}" if p.isdigit() or (len(p) > 20 and any(c.isdigit() for c in p)) else p)
    return "/".join(partes) or "/"


def registrar(caminho: str, metodo: str, ms: float, status: int) -> None:
    """Chamado pelo middleware quando uma resposta passa do limite."""
    global _eventos, _total, _dia
    dia = _hoje()
    with _trava:
        if dia != _dia:
            _carregar(dia)
        _total += 1
        if len(_eventos) < config.LATENCIA_MAX_EVENTOS:
            _eventos.append({"rota": _rota(caminho), "metodo": metodo, "ms": round(ms),
                             "status": status, "em": datetime.now(timezone.utc).isoformat()})
        if _total % 10 == 1:
            _gravar()


def limite_ms() -> float:
    return config.LATENCIA_LIMITE_S * 1000


def relatorio(dia: str | None = None) -> dict:
    """Resumo do dia: quantas respostas passaram do limite, por rota e por hora, com as piores."""
    dia = dia or _hoje()
    with _trava:
        if dia != _dia:
            _carregar(dia)
        eventos = list(_eventos)
        total = _total
    por_rota = Counter(e["rota"] for e in eventos)
    por_hora = Counter(datetime.fromisoformat(e["em"]).astimezone(FUSO).strftime("%H") + "h" for e in eventos)
    piores = sorted(eventos, key=lambda e: -e["ms"])[:15]
    return {"dia": dia, "limite_s": config.LATENCIA_LIMITE_S, "total": total, "amostrados": len(eventos),
            "por_rota": por_rota.most_common(15), "por_hora": sorted(por_hora.items()), "piores": piores}


def texto_relatorio(r: dict) -> str:
    if not r["total"]:
        return ""
    linhas = [f"Monvatti Radar — respostas acima de {r['limite_s']:g}s em {_br(r['dia'])}: {r['total']}.", "",
              "Rotas mais lentas:"]
    linhas += [f"- {rota}: {n}x" for rota, n in r["por_rota"][:8]]
    if r["piores"]:
        pior = r["piores"][0]
        linhas += ["", f"Pior: {pior['rota']} levou {pior['ms'] / 1000:.1f}s."]
    if r["por_hora"]:
        linhas += ["", "Por hora: " + ", ".join(f"{h} ({n})" for h, n in r["por_hora"])]
    return "\n".join(linhas)


def _br(dia: str) -> str:
    try:
        return datetime.fromisoformat(dia).strftime("%d/%m/%Y")
    except ValueError:
        return dia


def enviar_relatorio(dia: str | None = None) -> dict:
    """Manda o relatório do dia por e-mail e/ou webhook de WhatsApp. Uma vez só por dia."""
    from backend.services import email

    r = relatorio(dia)
    if not r["total"]:
        return {"enviado": False, "motivo": "nenhuma resposta lenta no dia", "total": 0}
    texto = texto_relatorio(r)
    destinos, falhas = [], []
    alvo_email = config.ALERTA_EMAIL or config.ENCARREGADO_EMAIL
    if alvo_email and email.disponivel():
        ok, motivo = email.enviar(alvo_email, f"Monvatti Radar: respostas lentas em {_br(r['dia'])}", texto)
        destinos.append("e-mail") if ok else falhas.append(f"e-mail: {motivo}")
    if config.ALERTA_WHATSAPP_WEBHOOK:
        ok, motivo = _whatsapp(texto)
        destinos.append("WhatsApp") if ok else falhas.append(f"WhatsApp: {motivo}")
    return {"enviado": bool(destinos), "por": destinos, "falhas": falhas, "total": r["total"], "dia": r["dia"]}


def _whatsapp(texto: str) -> tuple[bool, str]:
    """POST simples num webhook de WhatsApp (API não oficial ou provedor). Sem webhook, não envia."""
    import httpx

    url = config.ALERTA_WHATSAPP_WEBHOOK
    if not url:
        return False, "sem webhook de WhatsApp configurado (ALERTA_WHATSAPP_WEBHOOK)"
    corpo = {"texto": texto}
    if config.ALERTA_WHATSAPP_DESTINO:
        corpo["para"] = config.ALERTA_WHATSAPP_DESTINO
    try:
        r = httpx.post(url, json=corpo, timeout=15)
        if r.status_code >= 400:
            return False, f"o webhook respondeu {r.status_code}"
        return True, ""
    except httpx.HTTPError as e:
        return False, f"não consegui falar com o webhook ({e.__class__.__name__})"
