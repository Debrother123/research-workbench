@echo off
setlocal
cd /d "%~dp0"
if exist "%SystemRoot%\py.exe" (
  py -3 bootstrap_workspace.py && py -3 server.py --workspace workspace --port 8765 --open
  exit /b %errorlevel%
)
where python >nul 2>nul
if %errorlevel%==0 (
  python bootstrap_workspace.py && python server.py --workspace workspace --port 8765 --open
  exit /b %errorlevel%
)
echo Python 3.9+ was not found. Install Python or use Docker: docker compose up --build
pause