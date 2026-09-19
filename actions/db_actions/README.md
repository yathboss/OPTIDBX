# PostgreSQL actions

`parallelism.BoundWorkloadSession` reads, applies, verifies, and restores only
`max_parallel_workers_per_gather` on a named, dedicated workload connection.
It uses the caller's existing connection and checks backend identity and safe values.
It cannot tune a separate pgbench or monitor session.

The orchestration pipeline is in `autotuner/lifecycle.py`; recommendation mode
remains read-only unless explicitly approved. See [Phase 3 integration](../../docs/phase3_integration.md).
