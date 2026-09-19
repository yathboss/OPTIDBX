import React from 'react';
import { FlaskConical, CheckCircle2, Clock, Activity, BarChart2, Layers, Cpu, ShieldCheck } from 'lucide-react';

export default function EvaluationView({ experiments = [] }) {
  return (
    <div>
      {/* Title & Description */}
      <div className="section-title">
        <FlaskConical size={18} color="var(--accent-purple)" />
        Phase 2 Evaluation: Workload Baselines & Performance Benchmarks
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        In Phase 2, evaluation focuses on measuring and establishing reliable <strong>baseline metrics</strong> across standard workload profiles (LOW, MEDIUM, HIGH) before autotuner actuation is engaged.
      </p>

      {/* Baseline Experiments Table (Task 21) */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Experiment ID</th>
              <th>Workload Profile</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Avg Latency</th>
              <th>Avg Throughput</th>
              <th>Avg CPU</th>
              <th>Active Workers</th>
            </tr>
          </thead>
          <tbody>
            {experiments.map((exp) => {
              const metrics = exp.before_metrics || {};
              const isRunning = exp.status === 'RUNNING';

              return (
                <tr key={exp.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    #{exp.id}
                  </td>
                  <td>
                    <span className="badge badge-blue" style={{ textTransform: 'uppercase' }}>
                      {exp.workload_type}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${isRunning ? 'badge-amber' : 'badge-green'}`}>
                      {isRunning ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                      {exp.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {exp.duration_seconds ? `${exp.duration_seconds}s` : '--'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f59e0b' }}>
                    {metrics.query_latency_ms ? `${metrics.query_latency_ms} ms` : 'Waiting...'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#10b981' }}>
                    {metrics.throughput_tps ? `${metrics.throughput_tps} TPS` : 'Waiting...'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#93c5fd' }}>
                    {metrics.cpu_percent ? `${metrics.cpu_percent}%` : '--'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>
                    {metrics.active_workers ?? '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phase 2 Development & Roadmap Progress Section (Task 29) */}
      <div className="summary-card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <ShieldCheck size={18} color="var(--accent-green)" />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
            OptiDBX Project Roadmap & Integration Matrix
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
          {/* Completed */}
          <div style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-green)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              ✓ Phase 2 Completed Features
            </div>
            <ul style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', lineHeight: '1.7' }}>
              <li>Continuous OS telemetry (CPU, RAM, Disk I/O, Context Switches)</li>
              <li>PostgreSQL DBMS telemetry (latency, TPS, workers, temp spill)</li>
              <li>Real-time telemetry coordinator with time-skew protection</li>
              <li>Rule-based CPU contention detection (3 consecutive bad samples)</li>
              <li>Explainable recommendation engine & PostgreSQL persistence</li>
              <li>Live FastAPI & React dashboard integration (5s polling)</li>
            </ul>
          </div>

          {/* In Progress */}
          <div style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              ⚡ In Progress / Staging
            </div>
            <ul style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', lineHeight: '1.7' }}>
              <li>Full end-to-end pgbench workload runner automation</li>
              <li>PostgreSQL <code>pg_stat_statements</code> interval reset synchronization</li>
              <li>Multi-client concurrent stress testing in WSL2</li>
            </ul>
          </div>

          {/* Phase 3 Planned */}
          <div style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-blue)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              🎯 Phase 3 Planned Actuation
            </div>
            <ul style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', lineHeight: '1.7' }}>
              <li>Automated parameter tuning (<code>max_parallel_workers_per_gather</code>)</li>
              <li>30-second observation window and KEEP / ROLLBACK loop</li>
              <li>Memory pressure and <code>work_mem</code> temporary-file tuning</li>
              <li>OS-level process priority (<code>nice</code>) & cgroups CPU limits</li>
              <li>Static vs OptiDBX benchmark performance comparative reports</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

