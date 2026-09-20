-- Read-only parallel aggregate over the standard pgbench dataset.
-- Used by tests.live_phase2 through Kartikeya's existing workload runner.
SELECT sum(sqrt(aid::numeric) * sqrt(abs(abalance::numeric) + 1))
FROM pgbench_accounts;
