@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Criar o administrador no banco do site (Neon)
echo  ---------------------------------------------
echo  Cole o valor do DATABASE_URL copiado da Vercel e aperte Enter.
echo  Para colar aqui: clique com o botao direito dentro desta janela.
echo.
set "DATABASE_URL="
set /p "DATABASE_URL=DATABASE_URL: "
if not defined DATABASE_URL goto vazio
.venv\Scripts\python -c "import os,sys,runpy; v=os.environ['DATABASE_URL'].strip().strip(chr(34)+chr(39)); v=v.split('=',1)[1].strip().strip(chr(34)+chr(39)) if v.upper().startswith('DATABASE_URL') else v; sys.exit(2) if not v.startswith(('postgres://','postgresql://')) else None; os.environ['DATABASE_URL']=v; print(); runpy.run_path('criar_admin.py', run_name='__main__')"
if errorlevel 2 goto invalido
echo.
pause
exit /b

:vazio
echo.
echo  Nada foi colado. Feche e abra de novo.
pause
exit /b

:invalido
echo.
echo  Esse valor nao parece o DATABASE_URL do Neon. Ele comeca com postgresql:// ou postgres://
pause
exit /b
