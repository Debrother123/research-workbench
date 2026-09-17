$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (Get-Command python -ErrorAction SilentlyContinue) {
    python server.py --workspace demo-workspace --port 8765 --open
    exit $LASTEXITCODE
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    py -3 server.py --workspace demo-workspace --port 8765 --open
    exit $LASTEXITCODE
}

Write-Error "Python 3.9+ was not found. Install Python or use Docker: docker compose up --build"