#!/usr/bin/env python3
"""
OptiDBX Local PostgreSQL Setup & Lifecycle Manager
Extracts, initializes, and starts local PostgreSQL with pg_stat_statements preloaded.
"""

import os
import sys
import zipfile
import subprocess
from pathlib import Path

PG_ZIP = Path(r"C:\Users\karti\pgsql.zip")
PG_DIR = Path(r"C:\Users\karti\pgsql")
PG_BIN = PG_DIR / "pgsql" / "bin"
PG_DATA = PG_DIR / "data"
PG_LOG = PG_DIR / "postgres.log"


def extract_binaries():
    """Extract pgsql.zip if binary directory does not exist."""
    if (PG_BIN / "postgres.exe").exists():
        print(f"[PostgreSQL Manager] PostgreSQL binaries already exist at {PG_BIN}")
        return True

    if not PG_ZIP.exists():
        print(f"[PostgreSQL Manager Error] Archive {PG_ZIP} not found.")
        return False

    print(f"[PostgreSQL Manager] Extracting {PG_ZIP} to {PG_DIR}...")
    with zipfile.ZipFile(PG_ZIP, "r") as z:
        z.extractall(PG_DIR)
    print("[PostgreSQL Manager] Extraction complete.")
    return True


def initialize_cluster():
    """Run initdb to create cluster with UTF-8 and trust auth for local dev."""
    if (PG_DATA / "PG_VERSION").exists():
        print(f"[PostgreSQL Manager] Data cluster already exists at {PG_DATA}")
        return True

    initdb_exe = PG_BIN / "initdb.exe"
    cmd = [
        str(initdb_exe),
        "-D", str(PG_DATA),
        "-U", "postgres",
        "-A", "trust",
        "-E", "UTF8",
    ]
    print(f"[PostgreSQL Manager] Initializing cluster with command: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[PostgreSQL Manager Error] initdb failed:\n{res.stderr}")
        return False

    # Configure postgresql.conf to enable pg_stat_statements
    conf_file = PG_DATA / "postgresql.conf"
    if conf_file.exists():
        print("[PostgreSQL Manager] Configuring shared_preload_libraries in postgresql.conf...")
        with open(conf_file, "a", encoding="utf-8") as f:
            f.write("\n# OptiDBX Telemetry Settings\n")
            f.write("shared_preload_libraries = 'pg_stat_statements'\n")
            f.write("pg_stat_statements.max = 10000\n")
            f.write("pg_stat_statements.track = all\n")
            f.write("track_io_timing = on\n")

    print("[PostgreSQL Manager] Cluster initialization and configuration complete.")
    return True


def start_server():
    """Start PostgreSQL using pg_ctl."""
    pg_ctl = PG_BIN / "pg_ctl.exe"
    # Check if already running
    status_cmd = [str(pg_ctl), "-D", str(PG_DATA), "status"]
    s = subprocess.run(status_cmd, capture_output=True, text=True)
    if s.returncode == 0:
        print("[PostgreSQL Manager] PostgreSQL server is already running.")
        return True

    cmd = [
        str(pg_ctl),
        "-D", str(PG_DATA),
        "-l", str(PG_LOG),
        "start",
    ]
    print(f"[PostgreSQL Manager] Starting PostgreSQL server...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print("[PostgreSQL Manager] Server started successfully.")
        return True
    else:
        print(f"[PostgreSQL Manager Error] Failed to start server:\n{res.stderr}")
        return False


def stop_server():
    """Stop PostgreSQL using pg_ctl."""
    pg_ctl = PG_BIN / "pg_ctl.exe"
    cmd = [str(pg_ctl), "-D", str(PG_DATA), "stop"]
    subprocess.run(cmd)
    print("[PostgreSQL Manager] Server stopped.")


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "start"
    if action == "stop":
        stop_server()
        return

    if not extract_binaries():
        sys.exit(1)
    if not initialize_cluster():
        sys.exit(1)
    if not start_server():
        sys.exit(1)

    print("[PostgreSQL Manager] Environment is READY!")


if __name__ == "__main__":
    main()

