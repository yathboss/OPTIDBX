-- ==============================================================================
-- OptiDBX: Relational Telemetry & Experiment Schema
-- Database: PostgreSQL 14+
-- Developer: Kartikeya Kushwaha (DBMS & Workload Engineer)
-- ==============================================================================

-- 1. Experiment Runs Table
-- Tracks benchmark/workload execution sessions
CREATE TABLE IF NOT EXISTS experiment_runs (
    id SERIAL PRIMARY KEY,
    workload_type VARCHAR(50) NOT NULL, -- e.g., 'LOW', 'MEDIUM', 'HIGH', 'READ_HEAVY', 'WRITE_HEAVY'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(30) NOT NULL DEFAULT 'RUNNING', -- 'RUNNING', 'COMPLETED', 'FAILED', 'ABORTED'
    notes TEXT
);

-- 2. Database Metrics Table
-- Stores time-series DBMS telemetry collected every 5 seconds
CREATE TABLE IF NOT EXISTS db_metrics (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INT REFERENCES experiment_runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    query_latency_ms NUMERIC(10, 3) NOT NULL,
    throughput_tps NUMERIC(10, 2) NOT NULL,
    temp_files_bytes BIGINT NOT NULL DEFAULT 0,
    active_workers INT NOT NULL DEFAULT 0
);

-- 3. System (OS) Metrics Table
-- Stores time-series OS telemetry collected every 5 seconds (owned jointly with Aryaman)
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INT REFERENCES experiment_runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cpu_percent NUMERIC(5, 2) NOT NULL,
    memory_percent NUMERIC(5, 2) NOT NULL,
    disk_read_bytes BIGINT DEFAULT 0,
    disk_write_bytes BIGINT DEFAULT 0,
    context_switches BIGINT DEFAULT 0
);

-- 4. Tuning Actions Table
-- Stores autotuner recommendations and applied tuning adjustments
CREATE TABLE IF NOT EXISTS tuning_actions (
    id SERIAL PRIMARY KEY,
    experiment_id INT REFERENCES experiment_runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(50) NOT NULL, -- 'RECOMMENDED', 'APPLIED_AUTO', 'APPLIED_MANUAL'
    parameter VARCHAR(100) NOT NULL,  -- e.g., 'work_mem', 'max_parallel_workers_per_gather'
    old_value VARCHAR(100) NOT NULL,
    new_value VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'APPLIED', -- 'APPLIED', 'EVALUATING', 'KEPT', 'ROLLED_BACK'
    before_latency_ms NUMERIC(10, 3),
    after_latency_ms NUMERIC(10, 3),
    before_throughput_tps NUMERIC(10, 2),
    after_throughput_tps NUMERIC(10, 2)
);

-- ==============================================================================
-- Indexes for Telemetry Queries
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_db_metrics_exp_time ON db_metrics(experiment_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sys_metrics_exp_time ON system_metrics(experiment_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_tuning_actions_exp_time ON tuning_actions(experiment_id, timestamp);

