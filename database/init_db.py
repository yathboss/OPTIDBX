#!/usr/bin/env python3
"""
OptiDBX Database Initializer
Initializes the PostgreSQL database and executes schema.sql.
"""

import os
import sys
from pathlib import Path
import psycopg2
from psycopg2 import sql
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Project root directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_db_config():
    """Retrieve database connection config from environment or defaults."""
    return {
        "host": os.environ.get("POSTGRES_HOST", "localhost"),
        "port": int(os.environ.get("POSTGRES_PORT", 5432)),
        "db": os.environ.get("POSTGRES_DB", "optidbx"),
        "user": os.environ.get("POSTGRES_USER", "postgres"),
        "password": os.environ.get("POSTGRES_PASSWORD", "postgres"),
        "admin_user": os.environ.get("POSTGRES_ADMIN_USER", "postgres"),
        "admin_password": os.environ.get("POSTGRES_ADMIN_PASSWORD", "postgres"),
    }


def ensure_database_exists(cfg):
    """Ensure the target database exists; if not, create it using maintenance db."""
    try:
        conn = psycopg2.connect(
            host=cfg["host"],
            port=cfg["port"],
            dbname="postgres",
            user=cfg["admin_user"],
            password=cfg["admin_password"],
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s;", (cfg["db"],)
        )
        exists = cursor.fetchone()

        if not exists:
            print(f"[OptiDBX] Database '{cfg['db']}' not found. Creating...")
            cursor.execute(
                sql.SQL("CREATE DATABASE {};").format(sql.Identifier(cfg["db"]))
            )
            print(f"[OptiDBX] Database '{cfg['db']}' created successfully.")
        else:
            print(f"[OptiDBX] Database '{cfg['db']}' already exists.")

        cursor.close()
        conn.close()
        return True
    except Exception as exc:
        print(f"[OptiDBX Warning] Could not check/create database via admin: {exc}")
        return False


def run_schema(cfg):
    """Execute database/schema.sql and enable pg_stat_statements."""
    schema_path = PROJECT_ROOT / "database" / "schema.sql"
    if not schema_path.exists():
        print(f"[OptiDBX Error] schema.sql not found at {schema_path}")
        return False

    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    try:
        conn = psycopg2.connect(
            host=cfg["host"],
            port=cfg["port"],
            dbname=cfg["db"],
            user=cfg["user"],
            password=cfg["password"],
        )
        cursor = conn.cursor()

        # Try enabling pg_stat_statements
        try:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements;")
            conn.commit()
            print("[OptiDBX] Extension 'pg_stat_statements' enabled.")
        except Exception as ext_err:
            conn.rollback()
            print(f"[OptiDBX Note] Could not enable pg_stat_statements extension (may require superuser or preloading): {ext_err}")

        # Execute schema.sql
        print(f"[OptiDBX] Applying schema from {schema_path.name}...")
        cursor.execute(schema_sql)
        conn.commit()

        # Verify tables
        expected_tables = ["experiment_runs", "db_metrics", "system_metrics", "tuning_actions"]
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        """)
        existing_tables = [row[0] for row in cursor.fetchall()]

        print("[OptiDBX] Table Verification:")
        all_ok = True
        for table in expected_tables:
            if table in existing_tables:
                print(f"  [OK] Table '{table}' verified.")
            else:
                print(f"  [MISSING] Table '{table}' was not created.")
                all_ok = False

        cursor.close()
        conn.close()

        if all_ok:
            print("[OptiDBX] Database initialization completed successfully!")
            return True
        else:
            print("[OptiDBX Error] One or more tables were missing.")
            return False

    except Exception as exc:
        print(f"[OptiDBX Error] Failed to initialize schema: {exc}")
        return False


def main():
    print("========================================")
    print("   OptiDBX Database Initializer (Phase 1)")
    print("========================================")
    cfg = get_db_config()
    print(f"Target: {cfg['user']}@{cfg['host']}:{cfg['port']}/{cfg['db']}")

    ensure_database_exists(cfg)
    success = run_schema(cfg)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

