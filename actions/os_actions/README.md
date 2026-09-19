# OS actions

Owned by Aryaman (Developer 3). `process.ProcessActions` provides manual Linux
affinity and nice read/apply/verify/restore, PID creation-time checks, same-user
targeting, configuration whitelists, and structured failure results.

It shares the action gate with DB execution and is never called by the automatic
tuning loop. Keep the framework instance and receipts until restore succeeds.
`cgroup_capabilities()` is a read-only cgroup-v2 detection scaffold.
See [scope and limitations](../../docs/phase3_integration.md).
