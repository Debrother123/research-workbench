$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (Get-Command python -ErrorAction SilentlyContinue) {
    python bootstrap_workspace.py
    python server.py --workspace workspace --port 8765 --open
    exit $LASTEXITCODE
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    py -3 bootstrap_workspace.py
    py -3 server.py --workspace workspace --port 8765 --open
    exit $LASTEXITCODE
}

Write-Error "Python 3.9+ was not found. Install Python or use Docker: docker compose up --build"