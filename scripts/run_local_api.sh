#!/usr/bin/env bash
# Local WSL demo only. One process owns the workload and action gate.
set -euo pipefail
cd "$(dirname "$0")/.."
export POSTGRES_HOST="${POSTGRES_HOST:-/var/run/postgresql}"
export POSTGRES_DB="${POSTGRES_DB:-optidbx_phase2}"
export POSTGRES_USER="${POSTGRES_USER:-postgres}"
runtime_python="${OPTIDBX_PYTHON:-/opt/optidbx-venv/bin/python}"
if [[ ! -x "$runtime_python" ]]; then
  echo "Python environment missing: $runtime_python. Follow docs/safe_v1.md setup." >&2
  exit 1
fi
if [[ "$(id -u)" == 0 && "$POSTGRES_HOST" == /var/run/postgresql && "$POSTGRES_USER" == postgres ]]; then
  exec runuser -u postgres --preserve-environment -- "$runtime_python" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
fi
exec "$runtime_python" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
