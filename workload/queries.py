"""Workload query variants for owned live sessions.

Each variant runs on the pgbench dataset through the bound workload session.
READ/WRITE target a single account by a random ``aid`` chosen by the caller;
that id is an integer we generate here (never user input), so embedding it as a
SQL literal is safe and keeps the operation a true single-row index lookup.

ANALYTICAL is the existing parallel aggregate — the one heavy enough to create
CPU/parallelism contention the autotuner can act on. READ/WRITE/MIXED exercise
genuine but lighter load, giving the live page real workload variety.
"""

from pathlib import Path

ANALYTICAL = (Path(__file__).resolve().parents[1] / "experiments/phase2_analytical.sql").read_text()

# Canonical, user-selectable workload types. ANALYTICAL preserves the historic
# default behaviour of the managed workload.
WORKLOAD_TYPES = ("READ", "WRITE", "ANALYTICAL", "MIXED")

WORKLOAD_TYPE_META = [
    {
        "id": "READ",
        "label": "Read-heavy",
        "description": "Single-row indexed lookups on pgbench_accounts. Light, read-only.",
    },
    {
        "id": "WRITE",
        "label": "Write-heavy",
        "description": "Single-row UPDATEs on pgbench_accounts. Mutates data (regenerable).",
    },
    {
        "id": "ANALYTICAL",
        "label": "Analytical",
        "description": "Parallel aggregate scan - most likely to create parallelism contention.",
    },
    {
        "id": "MIXED",
        "label": "Mixed",
        "description": "Blend of reads and periodic writes, TPC-B-like.",
    },
]

# Fraction of MIXED iterations that perform a write.
_MIXED_WRITE_SHARE = 0.3


def _read_query(aid):
    return f"SELECT abalance FROM pgbench_accounts WHERE aid = {int(aid)}"


def _write_query(aid, delta):
    return f"UPDATE pgbench_accounts SET abalance = abalance + {int(delta)} WHERE aid = {int(aid)}"


def next_query(workload_type, max_aid, rng):
    """Return the SQL string for the next iteration of ``workload_type``.

    ``rng`` is a ``random.Random`` owned by the calling worker so each client
    hits different rows without contending on a shared generator.
    """
    if workload_type == "ANALYTICAL":
        return ANALYTICAL
    if workload_type == "READ":
        return _read_query(rng.randint(1, max_aid))
    if workload_type == "WRITE":
        return _write_query(rng.randint(1, max_aid), rng.randint(-500, 500))
    if workload_type == "MIXED":
        if rng.random() < _MIXED_WRITE_SHARE:
            return _write_query(rng.randint(1, max_aid), rng.randint(-500, 500))
        return _read_query(rng.randint(1, max_aid))
    raise ValueError(f"Unknown workload type: {workload_type}")
