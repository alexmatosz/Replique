@echo off
cd /d "%~dp0"
if not exist .venv (
  echo Preparando o ambiente pela primeira vez...
  python -m venv .venv
  .venv\Scripts\pip install -r requirements.txt
)
start "" http://127.0.0.1:8000
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-server-header
