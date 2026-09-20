#!/usr/bin/env python3
"""
OptiDBX Database Health & Readiness Checker
Checks database connectivity, extension status, and table integrity.
"""

import os
import sys
from pathlib import Path
import psycopg2

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from db_monitor.storage import get_connection


def check_db_health() -> bool:
    """
    Performs full health inspection of PostgreSQL environment:
    1. Connection test
    2. Version and uptime check
    3. pg_stat_statements extension check
    4. Required telemetry tables presence
    """
    print("==========================================")
    print("   OptiDBX Database Health Inspection")
    print("==========================================")

    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", 5432)
    db = os.environ.get("POSTGRES_DB", "optidbx")
    user = os.environ.get("POSTGRES_USER", "postgres")

    print(f"Target: {user}@{host}:{port}/{db}\n")
    all_healthy = True

    # 1. Connectivity
    try:
        conn = get_connection()
        print("  [PASS] PostgreSQL server is reachable.")
    except Exception as e:
        print(f"  [FAIL] Cannot connect to PostgreSQL: {e}")
        return False

    try:
        with conn.cursor() as cur:
            # 2. Version
            cur.execute("SELECT version();")
            ver = cur.fetchone()[0]
            print(f"  [INFO] PostgreSQL Version: {ver.split(',')[0]}")

            # 3. pg_stat_statements check
            cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';")
            if cur.fetchone():
                print("  [PASS] pg_stat_statements extension is enabled.")
            else:
                print("  [WARN] pg_stat_statements extension is NOT installed in this DB.")
                print("         (Run: CREATE EXTENSION pg_stat_statements; in database/init_db.py)")

            # Check shared_preload_libraries
            cur.execute("SHOW shared_preload_libraries;")
            preload = cur.fetchone()[0]
            if "pg_stat_statements" in preload:
                print(f"  [PASS] shared_preload_libraries includes pg_stat_statements ({preload}).")
            else:
                print(f"  [WARN] shared_preload_libraries is '{preload}'.")
                print("         To enable full query stats, add 'pg_stat_statements' to postgresql.conf and restart.")

            # 4. Required tables check
            expected_tables = ["experiment_runs", "db_metrics", "system_metrics", "tuning_actions"]
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public';
            """)
            existing_tables = [r[0] for r in cur.fetchall()]

            print("\n  Table Verification:")
            for t in expected_tables:
                if t in existing_tables:
                    # Count rows
                    cur.execute(f"SELECT count(*) FROM {t};")
                    count = cur.fetchone()[0]
                    print(f"    - {t}: OK ({count} rows)")
                else:
                    print(f"    - {t}: MISSING")
                    all_healthy = False

    finally:
        conn.close()

    print("\n------------------------------------------")
    if all_healthy:
        print("  [STATUS] Database environment is HEALTHY and ready!")
    else:
        print("  [STATUS] Database environment has warnings or missing tables.")
        print("           Run 'python -m database.init_db' to initialize.")
    print("------------------------------------------")
    return all_healthy


if __name__ == "__main__":
    ok = check_db_health()
    sys.exit(0 if ok else 1)

