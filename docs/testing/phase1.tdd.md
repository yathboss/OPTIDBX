# Phase 1 TDD evidence

Scope came from the user-provided `promp1.md` and `Context.md`; these local briefing
files are not included in implementation commits. Journeys:

1. Collectors exchange valid, aligned telemetry without ambiguous counter units.
2. The integrator confirms sustained four-signal CPU contention, not isolated spikes.
3. The dashboard receives explanations and safe recommendations without executing changes.
4. A developer can run the complete mock path without PostgreSQL.

## RED / GREEN

Windows, Python 3.11.9, isolated `.venv`.

- RED command: `.\.venv\Scripts\python.exe -m pytest -q --tb=short`.
  Result: **51 failed**. Tests executed and referenced the new contracts; failures
  were missing `autotuner` / `config` implementation (including the CLI module).
  Dependencies were installed before this run. RED checkpoint: `28f5f44`.
- GREEN command: `.\.venv\Scripts\python.exe -m pytest -q --cov --cov-report=term-missing`.
  Result: **51 passed**, **92.00%** combined statement/branch coverage.
  GREEN checkpoint: `aa763f5`.

| Guarantee | Test target | Kind | Result |
|---|---|---|---|
| Valid config loads independently of cwd; missing/unsafe/invalid YAML fails clearly | test_config_and_models.py | Unit | PASS |
| Invalid config ranges, unsupported modes, unsafe lists are rejected | test_config_and_models.py | Unit | PASS |
| Telemetry rejects missing fields, non-finite/negative values and timestamp mismatch | test_config_and_models.py | Unit | PASS |
| Models round-trip through JSON and telemetry cannot be reassigned | test_config_and_models.py | Unit | PASS |
| One/two bad readings do not confirm; three do, with evidence and logging | test_autotuner_mock.py | Integration | PASS |
| All four signals are required and normal/invalid inputs reset the streak | test_autotuner_mock.py | Integration | PASS |
| Duplicates/out-of-order timestamps fail; gaps reset; history is bounded | test_autotuner_mock.py | Integration | PASS |
| Configured count/thresholds affect detection | test_autotuner_mock.py | Integration | PASS |
| Selection steps through approved values; unknown/current-floor/invalid values are safe | test_autotuner_mock.py | Integration | PASS |
| CLI emits three snapshots and the final safe recommendation | test_autotuner_mock.py::test_cli_demo_end_to_end | CLI E2E | PASS |

Coverage instruments all `autotuner` and `config` modules. Core engine, selector,
detector, models, and loader measured 100%; demo execution occurs in a subprocess
and is not captured by coverage (0% measured for that module). The CLI E2E test
does execute and assert its actual output. No browser exists in this phase.

Dependency audit: `python -m pip_audit -r requirements-dev.txt` reported
**No known vulnerabilities found**. This audits project dependencies rather than
unrelated system Python packages.

Final checks: `python -m ruff check .`, `python -m ruff format --check .`,
`python -m pip check`, and `git diff --check` passed. The terminal demo was also
run directly and printed two NONE results followed by CPU_PARALLELISM / 8 -> 6.

## Limits

Validated on Windows Python 3.11.9; WSL/Linux execution has not been tested here.
No claims about live PostgreSQL performance, application/rollback, persistence,
backend endpoints, or dashboard behavior are made. Thresholds are development
fixtures; real benchmark calibration and collector alignment remain team work.
Preserve this RED/GREEN record if the feature commits are later squashed.
