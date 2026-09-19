# OS and dashboard contributor merge

Imported `origin/aryaman_os` at `746e31b`, which already contains
`origin/shivansh-dashboard` at `81eba89`. Kartikeya's previously integrated work
and the local autotuner fixes remain present. This merge is local to
`yatharth-autotuner`; it does not merge into main or publish the branch.

Included modules: OS telemetry and storage fallback, OS health diagnostics,
FastAPI mock API, React dashboard, evaluation helpers, tests, and contributor docs.

Shared-file resolution:

- Preserve the canonical config and YAML aliases from the Kartikeya merge.
- Preserve strict autotuner config validation and explicit DB-owned sections.
- Combine frontend/backend environment placeholders; keep passwords blank.
- Include frontend output/dependency ignores alongside existing secret exclusions.
- Keep the existing PostgreSQL driver constraint and add psutil.
- Include backend requirements and TestClient's httpx dependency in development setup.

Python validation on Windows: **83 tests passed**, two upstream TestClient
deprecation warnings. Coverage is **92.14% for autotuner/config only**. The OS
storage tests assume an offline database. This invocation enforces that condition,
prevents test writes to a developer's DB, and preserves the imported test sources:

```python
from unittest.mock import patch
import psycopg2
import pytest

with patch("psycopg2.connect", side_effect=psycopg2.OperationalError("offline test run")):
    raise SystemExit(pytest.main(["-q", "--cov", "--cov-report=term-missing"]))
```

Install development dependencies with `python -m pip install -r requirements-dev.txt`.
The Python snippet above can be piped into the virtual environment's Python.

Dashboard validation from `dashboard/`: `npm ci --ignore-scripts` and
`npm run build` passed on Node 24.11.1. `npm audit --json` reported zero
vulnerabilities. Generated `node_modules` and `dist` are ignored by Git.

Python audit: auditing the exact installed dependency versions (exported with
`pip freeze` into ignored `.venv/audit-requirements.txt`) reported **No known
vulnerabilities found**, using `python -m pip_audit --disable-pip --no-deps
-r .venv/audit-requirements.txt`. This includes installed transitive dependencies.
The broad requirements audit was stopped while its temporary pip resolver was
still running; the successful audit covers the versions actually tested here.
`python -m pip check` passed.

This is a source integration, not completion of the live tuning loop. Backend
metrics/tuner services still use mock providers. OS/DB interval alignment,
live PostgreSQL persistence, and browser interaction require separate validation.
The DB collector caveats recorded in `docs/kartikeya_merge.md` still apply.
