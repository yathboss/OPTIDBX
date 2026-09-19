import React from 'react';
import { Info, Check, X, HelpCircle, Clock } from 'lucide-react';

export default function BeforeAfterCard({
  hasCompletedTuning = false,
  before = null,
  after = null,
  decision = null,
  parameter = null,
}) {
  if (!hasCompletedTuning || !before || !after) {
    return (
      <div className="comparison-card" style={{ textAlign: 'center', padding: '1.75rem 1.25rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', marginBottom: '0.5rem' }}>
          <Clock size={20} />
        </div>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          No completed tuning evaluation yet.
        </div>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', maxWidth: '540px', margin: '0 auto' }}>
          Phase 2 operates in <strong>Recommendation Mode</strong> (generating explainable recommendations without applying automated database modifications). The 30-second observation window and automatic <strong>KEEP / ROLLBACK</strong> loop will be active once tuning actuators are enabled in Phase 3.
        </p>
      </div>
    );
  }

  const getBadgeClass = () => {
    if (decision === 'KEEP') return 'badge-green';
    if (decision === 'ROLLBACK') return 'badge-rose';
    return 'badge-amber';
  };

  const latencyDelta = Math.round(((after.latency - before.latency) / before.latency) * 100);
  const tpsDelta = Math.round(((after.throughput - before.throughput) / before.throughput) * 100);
  const cpuDelta = Math.round(((after.cpu - before.cpu) / before.cpu) * 100);

  return (
    <div className="comparison-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            30-Second Observation Window Evaluation
          </span>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            Parameter: <code style={{ color: '#93c5fd' }}>{parameter}</code>
          </div>
        </div>

        <span className={`badge ${getBadgeClass()}`}>
          DECISION: {decision}
        </span>
      </div>

      <div className="comparison-grid">
        <div className="comp-col">
          <div className="comp-col-title">Before Tuning</div>
          <div className="comp-row">
            <span style={{ color: 'var(--text-secondary)' }}>Latency:</span>
            <span className="comp-val">{before.latency} ms</span>
          </div>
          <div className="comp-row">
            <span style={{ color: 'var(--text-secondary)' }}>Throughput:</span>
            <span className="comp-val">{before.throughput} TPS</span>
          </div>
          <div className="comp-row">
            <span style={{ color: 'var(--text-secondary)' }}>CPU Usage:</span>
            <span className="comp-val">{before.cpu}%</span>
          </div>
        </div>

        <div className="comp-col" style={{ borderColor: 'rgba(59, 130, 246, 0.3)', backgroundColor: 'rgba(59, 130, 246, 0.05)' }}>
          <div className="comp-col-title" style={{ color: 'var(--accent-blue)' }}>After 30s Observation</div>
          <div className="comp-row">
            <span style={{ color: 'var(--text-secondary)' }}>Latency:</span>
            <span className="comp-val" style={{ color: latencyDelta < 0 ? '#10b981' : '#f43f5e' }}>
              {after.latency} ms ({latencyDelta > 0 ? `+${latencyDelta}` : latencyDelta}%)
            </span>
          </div>
          <div className="comp-row">
            <span style={{ color: 'var(--text-secondary)' }}>Throughput:</span>
            <span className="comp-val" style={{ color: tpsDelta > 0 ? '#10b981' : '#f43f5e' }}>
              {after.throughput} TPS ({tpsDelta > 0 ? `+${tpsDelta}` : tpsDelta}%)
            </span>
          </div>
          <div className="comp-row">
            <span style={{ color: 'var(--text-secondary)' }}>CPU Usage:</span>
            <span className="comp-val" style={{ color: cpuDelta < 0 ? '#10b981' : '#f43f5e' }}>
              {after.cpu}% ({cpuDelta > 0 ? `+${cpuDelta}` : cpuDelta}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
