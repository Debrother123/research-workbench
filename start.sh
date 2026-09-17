#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 bootstrap_workspace.py
python3 server.py --workspace workspace --port 8765 --open