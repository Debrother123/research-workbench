#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 server.py --workspace demo-workspace --port 8765 --open
