@echo off
REM Coloca o Replique na internet PARA TESTE, de graca, pelo Cloudflare Tunnel.
REM Funciona enquanto este computador e esta janela ficarem abertos.
REM O endereco (https://....trycloudflare.com) muda a cada vez que voce roda.
cd /d "%~dp0"
chcp 65001 >nul
if not exist .venv (
  echo Rode o iniciar.bat uma vez antes, para preparar o ambiente.
  pause
  exit /b 1
)
set CLOUDFLARED="%~dp0ferramentas\cloudflared.exe"
if not exist %CLOUDFLARED% (
  echo Baixando o cloudflared oficial da Cloudflare...
  if not exist ferramentas mkdir ferramentas
  curl -sSL -o ferramentas\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
if not exist .env copy .env.example .env >nul

echo.
echo  == Replique: publicacao de TESTE ==
echo  Conferindo seguranca antes de abrir para a internet...
.venv\Scripts\python checar_publicacao.py || (pause & exit /b 1)

REM servidor sem recarregamento automatico e sem documentacao da API
start "Replique (servidor)" /min .venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-server-header
timeout /t 4 >nul

echo.
echo  Abrindo o tunel. Procure abaixo a linha com  https://....trycloudflare.com
echo  Esse e o endereco para abrir de qualquer lugar (celular, outro computador, cliente).
echo  Para encerrar: feche esta janela e a janela "Replique (servidor)".
echo.
%CLOUDFLARED% tunnel --no-autoupdate --url http://127.0.0.1:8000
pause
