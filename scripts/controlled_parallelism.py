"""Local fixed-setting experiment; no automatic tuning and no server-setting writes.

Run with explicit PostgreSQL environment variables. Every planned run (including
errors) is retained. The default short sweep is exploratory, not a performance claim.
"""

import argparse
import hashlib
import json
import os
import platform
import random
import subprocess
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

import psutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config.config_loader import load_config
from db_monitor.storage import get_connection
from workload.measurements import QueryMeasurements
from workload.runner import QUERY


def connect():
    conn = get_connection()
    conn.autocommit = True
    return conn


def run_fixed(level, clients, warmup, seconds):
    connections, threads, samples, errors = [], [], [], []
    stop = threading.Event()
    try:
        for _ in range(clients):
            conn = connect()
            connections.append(conn)
            with conn.cursor() as cur:
                cur.execute("SELECT set_config('max_parallel_workers_per_gather',%s,false)", (str(level),))
                cur.execute("SET statement_timeout='3s'")
                cur.execute("SET application_name='optidbx-fixed-study'")
                cur.execute("SHOW max_parallel_workers_per_gather")
                assert int(cur.fetchone()[0]) == level
        with connections[0].cursor() as cur:
            cur.execute("EXPLAIN (ANALYZE, FORMAT JSON) " + QUERY)
            plan = cur.fetchone()[0]
        # The query plan is captured, but none of its timings count as a measured run.
        begin = time.monotonic()
        measure = QueryMeasurements(begin + warmup, seconds)

        def worker(conn):
            while not stop.is_set():
                started = time.monotonic()
                try:
                    with conn.cursor() as cur:
                        cur.execute(QUERY)
                        cur.fetchall()
                    measure.record(started, time.monotonic())
                except Exception as exc:
                    measure.record(started, time.monotonic(), error=True, timeout=getattr(exc, "pgcode", None) == "57014")
                    errors.append({"type": type(exc).__name__, "phase": "warmup" if started < begin + warmup else "measurement"})
                    stop.set()

        for conn in connections:
            thread = threading.Thread(target=worker, args=(conn,), daemon=True)
            threads.append(thread)
            thread.start()
        monitor = connect()
        try:
            psutil.cpu_percent(None)
            while time.monotonic() < begin + warmup + seconds and not stop.wait(1):
                with monitor.cursor() as cur:
                    cur.execute("SELECT count(*) FILTER (WHERE backend_type='parallel worker'), count(*) FILTER (WHERE backend_type='client backend' AND application_name='optidbx-fixed-study') FROM pg_stat_activity WHERE state='active'")
                    workers, leaders = cur.fetchone()
                samples.append({"elapsed":time.monotonic()-begin,"workers":workers,"leaders":leaders,"cpu_percent":psutil.cpu_percent(None)})
        finally:
            monitor.close()
        ended = time.monotonic()
        stop.set()
        for thread in threads:
            thread.join(5)
        return {"parallelism":level,"status":"FAILED" if errors else "COMPLETED", "metrics":measure.summary(ended), "errors":errors, "resource_samples":samples, "query_plan":plan}
    except Exception as exc:
        return {"parallelism":level,"status":"FAILED","errors":[{"type":type(exc).__name__,"phase":"setup"}]}
    finally:
        stop.set()
        for thread in threads:
            thread.join(5)
        for conn in connections:
            conn.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--clients',type=int,choices=range(1,17),default=10)
    parser.add_argument('--levels',type=int,nargs='+',default=[8,6,4,2,1])
    parser.add_argument('--warmup',type=int,choices=range(15,121),default=20)
    parser.add_argument('--seconds',type=int,choices=range(30,481),default=30)
    parser.add_argument('--repetitions',type=int,choices=range(1,11),default=1)
    parser.add_argument('--seed',type=int,default=20260920)
    args=parser.parse_args()
    if args.output.exists():
        parser.error('Use a new output filename; previous evidence must not be overwritten')
    if any(level not in load_config().safe_values.max_parallel_workers_per_gather for level in args.levels):
        parser.error('Use approved parallelism values')
    plan=[]
    rng=random.Random(args.seed)
    for repetition in range(args.repetitions):
        levels=list(args.levels)
        rng.shuffle(levels)
        plan.extend({"repetition":repetition,"parallelism":level} for level in levels)
    conn=connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name,setting FROM pg_settings WHERE name IN ('max_parallel_workers','max_worker_processes','max_parallel_workers_per_gather','server_version')")
            settings=dict(cur.fetchall())
            cur.execute("SELECT reloptions FROM pg_class WHERE relname='pgbench_accounts'")
            table_options=cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM pgbench_accounts")
            rows=cur.fetchone()[0]
    finally:
        conn.close()
    record={"source":"REAL_FIXED_SETTING_STUDY","purpose":"Exploratory warm-up-excluded measurement; no KEEP-rate or superiority claim", "started_at":datetime.now(UTC).isoformat(),"config":{**vars(args),"output":str(args.output)},"settings":settings,"table_options":table_options,"dataset_rows":rows,"cpu_logical":psutil.cpu_count(),"cpu_physical":psutil.cpu_count(logical=False),"platform":platform.platform(),"database":os.environ.get('POSTGRES_DB'),"port":os.environ.get('POSTGRES_PORT','5432'),"query_sha256":hashlib.sha256(QUERY.encode()).hexdigest(),"revision":subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),"working_tree_dirty":bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),"plan":plan,"runs":[],"status":"RUNNING"}
    def save():
        args.output.parent.mkdir(parents=True,exist_ok=True)
        temp=args.output.with_suffix('.tmp')
        temp.write_text(json.dumps(record,indent=2))
        os.replace(temp,args.output)
    save()
    try:
        for spec in plan:
            result=run_fixed(spec['parallelism'],args.clients,args.warmup,args.seconds)
            record['runs'].append({**spec,**result})
            save()
            print(json.dumps({k:v for k,v in result.items() if k not in ('query_plan','resource_samples')}),flush=True)
        record['status']='COMPLETED' if all(run['status']=='COMPLETED' for run in record['runs']) else 'COMPLETED_WITH_FAILURES'
    finally:
        record['ended_at']=datetime.now(UTC).isoformat()
        if len(record['runs']) != len(plan): record['status']='INTERRUPTED'
        save()


if __name__ == '__main__':
    main()
