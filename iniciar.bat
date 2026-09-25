@echo off
REM Duplo clique para abrir o Replique em http://127.0.0.1:8000
cd /d "%~dp0"
if not exist .venv (
  echo Preparando o ambiente pela primeira vez...
  python -m venv .venv
  .venv\Scripts\pip install -r requirements.txt
)
if not exist .env copy .env.example .env >nul
start "" http://127.0.0.1:8000
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
