#!/usr/bin/env bash
# Phase 0 noise pilot. Run as root inside WSL:
#   bash experiments/replay/run_phase0.sh
# Condition 1 (pin8): PostgreSQL pinned to cores 0-7 (oversubscription regime, report 6.5);
#                     the recorder runs on cores 12-15 so it never competes with the DB.
# Condition 2 (unpinned16): PostgreSQL on all 16 cores (well-provisioned regime, report 6.1).
set -euo pipefail
cd "$(dirname "$0")/../.."
PY="${OPTIDBX_PYTHON:-/opt/optidbx-venv/bin/python}"
export POSTGRES_HOST=/var/run/postgresql POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres

pin_pg() {  # $1 = hex affinity mask
  local pm
  pm="$(head -1 /var/lib/postgresql/16/main/postmaster.pid)"
  taskset -a -p "$1" "$pm" >/dev/null
  for b in $(pgrep -x postgres); do taskset -a -p "$1" "$b" >/dev/null 2>&1 || true; done
  echo "postgres affinity: $(taskset -p "$pm")"
}

run() {  # $1 = condition label
  runuser -u postgres --preserve-environment -- taskset -c 12-15 \
    "$PY" -m experiments.replay.record_traces --condition "$1" "${@:2}"
}

pin_pg 0xff
run pin8
pin_pg 0xffff
run unpinned16
echo "PHASE0 COMPLETE"
