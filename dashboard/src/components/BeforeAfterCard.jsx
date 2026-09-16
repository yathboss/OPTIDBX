import React from 'react';
import { ArrowRight, Check, X, HelpCircle } from 'lucide-react';

export default function BeforeAfterCard({
  before = { latency: 250, throughput: 500, cpu: 84 },
  after = { latency: 180, throughput: 620, cpu: 68 },
  decision = 'KEEP',
  parameter = 'max_parallel_workers_per_gather (8 → 4)',
}) {
  const getBadgeClass = () => {
    if (decision === 'KEEP') return 'badge-green';
    if (decision === 'ROLLBACK') return 'badge-rose';
    return 'badge-amber';
  };

  const getIcon = () => {
    if (decision === 'KEEP') return <Check size={14} />;
    if (decision === 'ROLLBACK') return <X size={14} />;
    return <HelpCircle size={14} />;
  };

  const latencyDelta = Math.round(((after.latency - before.latency) / before.latency) * 100);
  const tpsDelta = Math.round(((after.throughput - before.throughput) / before.throughput) * 100);
  const cpuDelta = Math.round(((after.cpu - before.cpu) / before.cpu) * 100);

  return (
    <div className="comparison-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Latest Evaluation Window (30s)
          </span>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            Parameter: <code style={{ color: '#93c5fd' }}>{parameter}</code>
          </div>
        </div>

        <span className={`badge ${getBadgeClass()}`}>
          {getIcon()}
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

      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Check size={14} color="#10b981" />
        Result: Overall throughput increased and latency decreased by {Math.abs(latencyDelta)}%. Modification permanently kept.
      </div>
    </div>
  );
}

