import React from 'react';
import { Layers, Sliders, ShieldAlert, Cpu } from 'lucide-react';

export default function TopSummary({ tunerStatus, workloadStatus }) {
  const isBottleneck = tunerStatus?.detected_bottleneck && tunerStatus.detected_bottleneck !== 'NONE';
  const isWorkloadRunning = Boolean(workloadStatus?.running);
  const workloadLabel = isWorkloadRunning
    ? `${workloadStatus.profile || 'ACTIVE'} Workload (Exp #${workloadStatus.experiment_id || '?'})`
    : 'No Active Workload (Idle)';
  const streak = tunerStatus?.consecutive_bad_readings ?? 0;

  return (
    <div className="summary-bar">
      <div className="summary-card">
        <span className="summary-label">
          <Layers size={14} /> Current Workload
        </span>
        <span className="summary-value" style={{ fontSize: '0.95rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isWorkloadRunning ? '#10b981' : '#6b7280',
            }}
          />
          {workloadLabel}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">
          <Sliders size={14} /> Operating Mode
        </span>
        <span className="summary-value" style={{ textTransform: 'capitalize' }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
            }}
          />
          {tunerStatus?.mode || 'Recommendation'} Mode
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">
          <Cpu size={14} /> Autotuner State
        </span>
        <span className="summary-value" style={{ textTransform: 'capitalize', fontSize: '0.95rem' }}>
          <span className="pulse-indicator" />
          {tunerStatus?.state || 'MONITORING'}
          {streak > 0 && streak < 3 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-amber)', marginLeft: '0.25rem' }}>
              ({streak}/3)
            </span>
          )}
        </span>
      </div>

      <div
        className="summary-card"
        style={{ borderColor: isBottleneck ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)' }}
      >
        <span className="summary-label">
          <ShieldAlert size={14} /> Detected Bottleneck
        </span>
        <span
          className="summary-value"
          style={{
            color: isBottleneck ? '#f59e0b' : '#10b981',
            fontSize: '1rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {tunerStatus?.detected_bottleneck || 'NONE'}
        </span>
      </div>
    </div>
  );
}
