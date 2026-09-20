# Kartikeya DBMS branch integration

Merged `origin/kartikeya-dbms` through `99a49a9` into `yatharth-autotuner` locally.
Includes PostgreSQL setup, schema, workload runner, collector, storage, and tests.

Conflict resolutions:

- `.gitignore`: union of both branches' exclusions, including local secrets.
- `.env.example`: use the DB module's `POSTGRES_*` names; passwords are blank.
- `config/config.yaml`: retain both modules' sections. YAML aliases connect the
  DB collector's legacy `system` interval/mode/timing fields to canonical values
  under `monitoring`, `modes`, and `tuning`. Edit the canonical anchored values.
- `config_loader.py`: explicitly accept four DB-owned mapping sections while
  retaining strict validation of autotuner policy. DB mappings are preserved,
  not interpreted or fully validated by the autotuner. Legacy `tuning_rules`
  does not authorize new autotuner actions.
- `requirements.txt`: declare the imported `psycopg2-binary` dependency.

Validation: the merged config first produced 35 failing tests (19 passing),
because its four DB sections were rejected. The additional shared-interval
regression also failed before updating the loader. After that change,
`python -m pytest -q --cov --cov-report=term-missing` passed **55 tests**.
Coverage remains scoped to `autotuner` and `config`: **92.14%**; it does not
measure live DB integration. RED/GREEN evidence is preserved here in the merge
commit because Git cannot create a separate checkpoint within an unresolved merge.

No database initialization, credentials changes, workload execution, or live
integration test was performed. `tests/test_db_monitor.py` is a manually invoked
script, not a pytest test function; pytest passing does not validate that flow.

Before connecting live DB telemetry to tuning decisions, coordinate with Kartikeya:

- `active_workers` currently counts active sessions, not specifically parallel workers.
- Latency currently uses cumulative statement statistics or elapsed active-query
  duration, rather than interval completed-workload query latency.
- `get_current_parallelism()` substitutes 2 on failure; the engine contract expects
  unknown (`None`), and the setting must describe the workload session.
- Collector timestamps and windows still require alignment with the OS collector.
- DB helpers currently read process environment variables; copying `.env.example`
  does not automatically load `.env`. Existing fallback credentials and environment
  loading need review before using the DB scripts.

These inherited collector behaviors were preserved during the pull; the imported
modules are not yet certified for live autotuner integration.
