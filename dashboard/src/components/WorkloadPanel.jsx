import React from 'react';
import { PlayCircle, StopCircle, Layers, Clock, Hash, Activity } from 'lucide-react';

export default function WorkloadPanel({ workloadStatus }) {
  const isRunning = Boolean(workloadStatus?.running);
  const profile = workloadStatus?.profile || 'IDLE';
  const expId = workloadStatus?.experiment_id;
  const startedAt = workloadStatus?.started_at
    ? new Date(workloadStatus.started_at).toLocaleTimeString()
    : 'None';
  const details = workloadStatus?.details || (isRunning ? 'Active benchmark in progress' : 'No active workload');

  const getProfileBadgeClass = (p) => {
    switch (p?.toUpperCase()) {
      case 'HIGH':
        return 'badge-rose';
      case 'MEDIUM':
        return 'badge-amber';
      case 'LOW':
        return 'badge-blue';
      default:
        return 'badge-purple';
    }
  };

  return (
    <div className="summary-card" style={{ marginBottom: '1.5rem', borderColor: isRunning ? 'var(--accent-blue)' : 'var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={18} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>PostgreSQL Workload Status (Kartikeya - Dev 2)</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className={`badge ${isRunning ? 'badge-green' : 'badge-amber'}`}>
            {isRunning ? <PlayCircle size={12} /> : <StopCircle size={12} />}
            {isRunning ? 'WORKLOAD RUNNING' : 'WORKLOAD STOPPED'}
          </span>
          {isRunning && (
            <span className={`badge ${getProfileBadgeClass(profile)}`}>
              Profile: {profile}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: 'var(--bg-card)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Workload Profile
          </span>
          <div style={{ fontWeight: 600, fontSize: '1.05rem', color: isRunning ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
            {profile}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Experiment ID
          </span>
          <div style={{ fontWeight: 600, fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}>
            {expId !== null && expId !== undefined ? `#${expId}` : 'N/A'}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Started At
          </span>
          <div style={{ fontWeight: 500, fontSize: '0.95rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {startedAt}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Execution Notes
          </span>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {details}
          </div>
        </div>
      </div>
    </div>
  );
}

