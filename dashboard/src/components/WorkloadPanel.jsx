import React, { useState } from 'react';
import { PlayCircle, StopCircle, Layers, Clock, Hash, Activity } from 'lucide-react';

export default function WorkloadPanel({ workloadStatus, pending, onStart, onStop, canStart }) {
  const [selectedProfile, setSelectedProfile] = useState('LOW');
  const [duration, setDuration] = useState(180);
  const isRunning = Boolean(workloadStatus?.running);
  const comparisonActive = Boolean(workloadStatus?.benchmark_id);
  const locked = pending || comparisonActive;
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
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Owned PostgreSQL workload</span>
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

      <div className="control-group" style={{marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center'}}>
        <label style={{display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem'}}>Profile <select aria-label="Workload profile" value={isRunning ? profile : selectedProfile} disabled={locked || isRunning}
          onChange={e => setSelectedProfile(e.target.value)}>
          {['LOW', 'MEDIUM', 'HIGH'].map(p => <option key={p}>{p}</option>)}
        </select></label>
        <label style={{display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem'}}>Duration (s) <input aria-label="Duration (seconds)" type="number" min="30" max="600" style={{width: 80}}
          value={isRunning ? workloadStatus?.duration_seconds ?? duration : duration} disabled={locked || isRunning} onChange={e => setDuration(Number(e.target.value))}/></label>
        <button className="btn btn-primary" disabled={locked || isRunning || !canStart || !Number.isInteger(duration) || duration < 30 || duration > 600}
          onClick={() => onStart(selectedProfile, duration)}>Start Workload</button>
        <div style={{display: 'inline-flex', gap: '0.35rem', marginLeft: '0.5rem'}}>
          <button className="btn btn-secondary btn-sm" disabled={locked || isRunning || !canStart} onClick={() => onStart('LOW', 300)}>Quick LOW</button>
          <button className="btn btn-secondary btn-sm" disabled={locked || isRunning || !canStart} onClick={() => onStart('MEDIUM', 300)}>Quick MEDIUM</button>
          <button className="btn btn-secondary btn-sm" disabled={locked || isRunning || !canStart} onClick={() => onStart('HIGH', 300)}>Quick HIGH</button>
        </div>
        <button className="btn btn-danger" disabled={locked || !isRunning} onClick={onStop}>Stop Workload</button>
        <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto'}}>{workloadStatus?.completed_queries ?? 0} completed queries</span>
      </div>
      {isRunning && !comparisonActive && <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem'}}>A workload is currently executing. Stop it before launching another profile.</p>}
      {workloadStatus?.error && <p role="alert">{workloadStatus.error}</p>}
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

