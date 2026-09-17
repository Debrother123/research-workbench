@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py --workspace demo-workspace --port 8765 --open
  exit /b %errorlevel%
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py --workspace demo-workspace --port 8765 --open
  exit /b %errorlevel%
)
echo Python 3.9+ was not found. Install Python or use Docker: docker compose up --build
pause