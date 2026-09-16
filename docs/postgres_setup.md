# OptiDBX: PostgreSQL Setup Guide (Phase 1)

This guide provides instructions for setting up PostgreSQL 14+ for local development with `pg_stat_statements` enabled across team members (WSL2 Ubuntu or Windows).

---

## 1. Installation

### Option A: WSL2 Ubuntu (Recommended for team standard)
In your WSL2 terminal:
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo service postgresql start
```

### Option B: Windows Native
Install PostgreSQL 15 or 16 via official installer or package manager:
```powershell
winget install PostgreSQL.PostgreSQL.16
```

---

## 2. Enabling `pg_stat_statements`

`pg_stat_statements` tracks execution statistics of all SQL statements executed by a server. It requires preloading into shared memory.

### Step 1: Modify `postgresql.conf`
Find your `postgresql.conf` file:
- **WSL2:** `/etc/postgresql/<version>/main/postgresql.conf`
- **Windows:** `C:\Program Files\PostgreSQL\<version>\data\postgresql.conf`

Add or update the following settings:
```ini
# Preload the extension module at server startup
shared_preload_libraries = 'pg_stat_statements'

# Optional tuning parameters for pg_stat_statements:
pg_stat_statements.max = 10000
pg_stat_statements.track = all
pg_stat_statements.save = on
```

### Step 2: Restart PostgreSQL
- **WSL2:**
  ```bash
  sudo service postgresql restart
  ```
- **Windows:**
  ```powershell
  Restart-Service postgresql-x64-16
  ```

### Step 3: Verify Preloading
Connect via `psql` and check:
```sql
SHOW shared_preload_libraries;
-- Output should include 'pg_stat_statements'
```

---

## 3. Database & User Setup

Create the dedicated project database and non-superuser role:

```sql
-- Connect as postgres superuser:
-- psql -U postgres

CREATE USER optidbx_user WITH PASSWORD 'optidbx_password';
CREATE DATABASE optidbx OWNER optidbx_user;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE optidbx TO optidbx_user;

-- Connect to optidbx and enable pg_stat_statements extension
\c optidbx
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
GRANT EXECUTE ON FUNCTION pg_stat_statements_reset() TO optidbx_user;
```

---

## 4. Environment Variables (`.env`)

Copy the template file `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your local credentials:
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=optidbx
POSTGRES_USER=optidbx_user
POSTGRES_PASSWORD=optidbx_password
METRIC_COLLECT_INTERVAL_SEC=5
```

---

## 5. Schema Initialization & Health Verification

Run the OptiDBX initialization and health inspection scripts:
```bash
python -m database.init_db
python -m db_monitor.health
```

