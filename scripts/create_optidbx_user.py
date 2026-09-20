#!/usr/bin/env python3
"""
Creates optidbx_user and grants required privileges on the optidbx database.
"""

import psycopg2
from psycopg2 import sql

def create_user():
    # Connect as postgres superuser
    conn = psycopg2.connect("host=localhost port=5432 dbname=postgres user=postgres")
    conn.autocommit = True
    cur = conn.cursor()

    # Check if user exists
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'optidbx_user';")
    if not cur.fetchone():
        cur.execute("CREATE USER optidbx_user WITH PASSWORD 'optidbx_password';")
        print("[OptiDBX] User 'optidbx_user' created.")
    else:
        print("[OptiDBX] User 'optidbx_user' already exists.")

    cur.execute("GRANT ALL PRIVILEGES ON DATABASE optidbx TO optidbx_user;")
    cur.close()
    conn.close()

    # Connect to optidbx db to grant schema and table permissions
    conn2 = psycopg2.connect("host=localhost port=5432 dbname=optidbx user=postgres")
    conn2.autocommit = True
    cur2 = conn2.cursor()
    cur2.execute("GRANT ALL ON SCHEMA public TO optidbx_user;")
    cur2.execute("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO optidbx_user;")
    cur2.execute("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO optidbx_user;")
    cur2.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO optidbx_user;")
    cur2.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO optidbx_user;")
    cur2.close()
    conn2.close()
    print("[OptiDBX] All database privileges successfully granted to 'optidbx_user'!")

if __name__ == "__main__":
    create_user()
