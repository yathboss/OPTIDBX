#!/usr/bin/env bash
# OptiDBX Standard Workload Runner (WSL2 / Linux)

PROFILE=${1:-LOW}
DURATION=${2:-60}
HOST=${POSTGRES_HOST:-localhost}
PORT=${POSTGRES_PORT:-5432}
DB=${POSTGRES_DB:-optidbx}
USER=${POSTGRES_USER:-postgres}

echo "=========================================="
echo " OptiDBX Workload Runner: ${PROFILE}"
echo " Host: ${HOST}:${PORT} | DB: ${DB}"
echo "=========================================="

python3 "$(dirname "$0")/run_workload.py" --profile "${PROFILE}" --duration "${DURATION}" --host "${HOST}" --port "${PORT}" --db "${DB}" --user "${USER}"

