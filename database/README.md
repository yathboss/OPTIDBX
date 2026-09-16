# Telemetry storage

Coordinate schema design with Kartikeya before adding migrations. Planned tables:
system_metrics, db_metrics, tuning_actions, experiment_runs.
Phase 1 uses bounded in-memory history; it requires no PostgreSQL connection.
