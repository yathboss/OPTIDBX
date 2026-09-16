#!/usr/bin/env python3
"""
OptiDBX Standard Workload Generator
Executes standard, repeatable PostgreSQL workloads across defined profiles (LOW, MEDIUM, HIGH).
"""

import os
import sys
import shutil
import argparse
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from workload.profiles import get_profile, DEFAULT_PROFILES


def find_pgbench() -> str:
    """Locate the pgbench executable from PATH or common directories."""
    pgbench = shutil.which("pgbench")
    if pgbench:
        return pgbench

    # Check common locations (Windows/WSL)
    candidates = [
        Path(r"C:\Program Files\PostgreSQL\16\bin\pgbench.exe"),
        Path(r"C:\Program Files\PostgreSQL\15\bin\pgbench.exe"),
        Path(r"C:\pgsql\bin\pgbench.exe"),
        Path(r"C:\Users\karti\pgsql\pgsql\bin\pgbench.exe"),
        Path(r"C:\Users\karti\pgsql\bin\pgbench.exe"),
        Path("/usr/lib/postgresql/16/bin/pgbench"),
        Path("/usr/lib/postgresql/15/bin/pgbench"),
        Path("/usr/bin/pgbench"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    # Custom override
    env_path = os.environ.get("PGBENCH_BIN")
    if env_path and Path(env_path).exists():
        return env_path

    raise FileNotFoundError(
        "pgbench executable not found. Ensure PostgreSQL client tools are installed and in PATH."
    )


def init_workload_schema(host: str, port: int, db: str, user: str, scale: int = 10, pgbench_bin: str = None):
    """Initialize pgbench tables (pgbench_accounts, pgbench_branches, etc.)."""
    bin_path = pgbench_bin or find_pgbench()
    cmd = [
        bin_path,
        "-i",
        "-s", str(scale),
        "-h", host,
        "-p", str(port),
        "-U", user,
        db,
    ]
    print(f"[Workload Generator] Initializing schema with scale {scale}...")
    env = os.environ.copy()
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"[Workload Generator Error] Init failed:\n{proc.stderr}")
        return False
    print("[Workload Generator] Schema initialization completed successfully.")
    return True


def run_workload(
    profile_name: str = "LOW",
    duration_sec: int = None,
    host: str = None,
    port: int = None,
    db: str = None,
    user: str = None,
    async_mode: bool = False,
    pgbench_bin: str = None,
):
    """
    Run a standard workload profile against the target PostgreSQL database.
    If async_mode is True, returns the subprocess.Popen object without blocking.
    """
    profile = get_profile(profile_name)
    host = host or os.environ.get("POSTGRES_HOST", "localhost")
    port = port or int(os.environ.get("POSTGRES_PORT", 5432))
    db = db or os.environ.get("POSTGRES_DB", "optidbx")
    user = user or os.environ.get("POSTGRES_USER", "postgres")
    duration = duration_sec or profile["duration_seconds"]

    bin_path = pgbench_bin or find_pgbench()

    cmd = [
        bin_path,
        "-c", str(profile["clients"]),
        "-j", str(profile["threads"]),
        "-T", str(duration),
        "-h", host,
        "-p", str(port),
        "-U", user,
        db,
    ]

    print(f"[Workload Generator] Launching '{profile_name}' profile:")
    print(f"  Clients: {profile['clients']} | Threads: {profile['threads']} | Duration: {duration}s")
    print(f"  Command: {' '.join(cmd)}")

    env = os.environ.copy()
    if async_mode:
        return subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    proc = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if proc.returncode == 0:
        print("[Workload Generator] Workload completed successfully.")
        print(proc.stdout)
    else:
        print(f"[Workload Generator Error] Workload exited with error:\n{proc.stderr}")
    return proc


def main():
    parser = argparse.ArgumentParser(description="OptiDBX Standard Workload Generator")
    parser.add_argument(
        "--profile",
        choices=list(DEFAULT_PROFILES.keys()),
        default="LOW",
        help="Workload intensity profile (default: LOW)",
    )
    parser.add_argument("--init", action="store_true", help="Initialize pgbench schema")
    parser.add_argument("--scale", type=int, default=10, help="Scale factor for initialization")
    parser.add_argument("--duration", type=int, default=None, help="Duration in seconds (overrides profile)")
    parser.add_argument("--host", default=os.environ.get("POSTGRES_HOST", "localhost"), help="DB Host")
    parser.add_argument("--port", type=int, default=int(os.environ.get("POSTGRES_PORT", 5432)), help="DB Port")
    parser.add_argument("--db", default=os.environ.get("POSTGRES_DB", "optidbx"), help="Database Name")
    parser.add_argument("--user", default=os.environ.get("POSTGRES_USER", "postgres"), help="DB User")

    args = parser.parse_args()

    if args.init:
        init_workload_schema(args.host, args.port, args.db, args.user, scale=args.scale)
    else:
        run_workload(
            profile_name=args.profile,
            duration_sec=args.duration,
            host=args.host,
            port=args.port,
            db=args.db,
            user=args.user,
        )


if __name__ == "__main__":
    main()

