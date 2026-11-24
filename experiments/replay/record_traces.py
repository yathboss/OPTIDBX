"""Record raw per-query latency traces for fixed PostgreSQL settings (Phase 0 / RQ1).

Each run opens fresh owned sessions, fixes ``max_parallel_workers_per_gather``,
and hammers the shared analytical query for ``warmup + measure`` seconds. Every
query is recorded (start offset, latency, ok) INCLUDING warm-up, so decision
rules can later be replayed offline on arbitrary windows. Nothing is aggregated
or discarded here; analysis lives in ``analyze_noise.py``.

Run inside WSL as the postgres role (peer auth), e.g. via ``run_phase0.sh``.
"""

import argparse
import json
import os
import platform
import random
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

import psycopg2

QUERY = Path(__file__).resolve().parents[1].joinpath("phase2_analytical.sql").read_text()


def connect(timeout_ms):
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "/var/run/postgresql"),
        dbname=os.environ.get("POSTGRES_DB", "optidbx_phase2"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        connect_timeout=5,
        options=f"-c statement_timeout={timeout_ms}",
    )


def settings_snapshot():
    conn = connect(5000)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT name, setting FROM pg_settings WHERE name IN ("
                "'max_parallel_workers_per_gather','max_parallel_workers',"
                "'max_worker_processes','shared_buffers','work_mem','jit','server_version')"
            )
            return dict(cur.fetchall())
    finally:
        conn.close()


def run_fixed(parallelism, sessions, warmup, measure, timeout_ms):
    conns = []
    for i in range(sessions):
        c = connect(timeout_ms)
        c.autocommit = True
        with c.cursor() as cur:
            cur.execute("SELECT set_config('application_name', %s, false)", (f"p0trace-{i}",))
            cur.execute(
                "SELECT set_config('max_parallel_workers_per_gather', %s, false)",
                (str(parallelism),),
            )
            cur.execute("SELECT current_setting('max_parallel_workers_per_gather')")
            assert int(cur.fetchone()[0]) == parallelism
        conns.append(c)

    records, lock = [], threading.Lock()
    stop = threading.Event()
    t0 = time.monotonic()

    def worker(idx, c):
        while not stop.is_set():
            s = time.monotonic()
            ok = True
            try:
                with c.cursor() as cur:
                    cur.execute(QUERY)
                    cur.fetchall()
            except Exception:
                ok = False
            f = time.monotonic()
            with lock:
                records.append((round(s - t0, 4), round((f - s) * 1000, 3), int(ok), idx))

    threads = [threading.Thread(target=worker, args=(i, c), daemon=True)
               for i, c in enumerate(conns)]
    for t in threads:
        t.start()
    time.sleep(warmup + measure)
    stop.set()
    for t in threads:
        t.join(timeout=max(30, timeout_ms / 1000 + 5))
    for c in conns:
        c.close()
    records.sort()
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", default="8,2", help="per_gather values to compare")
    ap.add_argument("--pairs", type=int, default=5, help="blocks; each runs every config once")
    ap.add_argument("--sessions", type=int, default=6)
    ap.add_argument("--warmup", type=int, default=20)
    ap.add_argument("--measure", type=int, default=180)
    ap.add_argument("--timeout-ms", type=int, default=60000)
    ap.add_argument("--seed", type=int, default=20261121)
    ap.add_argument("--condition", required=True, help="label, e.g. pin8 or unpinned16")
    ap.add_argument("--out", default="experiments/replay/data/phase0")
    args = ap.parse_args()

    configs = [int(x) for x in args.configs.split(",")]
    rng = random.Random(args.seed)
    out = Path(args.out) / args.condition
    out.mkdir(parents=True, exist_ok=True)
    meta = {
        "condition": args.condition,
        "args": vars(args),
        "settings": settings_snapshot(),
        "host": {"cpus_visible": os.cpu_count(), "platform": platform.platform(),
                 "affinity": sorted(os.sched_getaffinity(0))},
        "started_utc": datetime.now(UTC).isoformat(),
        "runs": [],
    }
    run_no = 0
    for block in range(args.pairs):
        order = configs[:]
        rng.shuffle(order)  # randomized order within each block blunts drift/order effects
        for p in order:
            print(f"[{args.condition}] block {block} run {run_no} per_gather={p}", flush=True)
            started = datetime.now(UTC).isoformat()
            recs = run_fixed(p, args.sessions, args.warmup, args.measure, args.timeout_ms)
            name = f"run{run_no:02d}_pg{p}.json"
            (out / name).write_text(json.dumps({
                "run": run_no, "block": block, "per_gather": p, "started_utc": started,
                "warmup": args.warmup, "measure": args.measure, "sessions": args.sessions,
                "fields": ["start_s", "latency_ms", "ok", "session"], "records": recs,
            }))
            ok = [r for r in recs if r[2] and args.warmup <= r[0] and
                  r[0] + r[1] / 1000 <= args.warmup + args.measure]
            print(f"    {len(recs)} queries, {len(ok)} ok in window, "
                  f"qps={len(ok) / args.measure:.2f}", flush=True)
            meta["runs"].append({"run": run_no, "block": block, "per_gather": p, "file": name})
            run_no += 1
            time.sleep(5)  # let backends exit between runs
    meta["finished_utc"] = datetime.now(UTC).isoformat()
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    print("DONE", out, flush=True)


if __name__ == "__main__":
    main()
