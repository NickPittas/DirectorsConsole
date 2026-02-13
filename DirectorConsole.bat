@Echo off&&cd /D %~dp0
Title Director Console
git pull
.\venv\Scripts\python.exe .\start.py
pause