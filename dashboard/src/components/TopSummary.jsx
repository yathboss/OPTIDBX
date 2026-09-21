import React from 'react';
import { Layers, Sliders, ShieldAlert, Cpu, Clock, CheckCircle2, AlertOctagon } from 'lucide-react';

export default function TopSummary({ tunerStatus, workloadStatus }) {
  const isBottleneck = tunerStatus?.detected_bottleneck && tunerStatus.detected_bottleneck !== 'NONE';
  const isWorkloadRunning = Boolean(workloadStatus?.running);
  const workloadLabel = isWorkloadRunning
    ? `${workloadStatus.profile || 'ACTIVE'} Workload (Exp #${workloadStatus.experiment_id || '?'})`
    : 'No Active Workload (Idle)';
  const streak = tunerStatus?.consecutive_bad_readings ?? 0;
  const state = tunerStatus?.state || 'MONITORING';
  const mode = tunerStatus?.mode === 'auto' ? 'Auto-Tuning Mode' : 'Recommendation Mode';

  // Format state display with timer if observing or in cooldown
  const getStateDisplay = () => {
    if (state === 'OBSERVING') {
      const remaining = tunerStatus?.observation_remaining_seconds ?? 0;
      return `OBSERVING (${remaining}s remaining)`;
    }
    if (state === 'COOLDOWN') {
      const remaining = tunerStatus?.cooldown_remaining_seconds ?? 0;
      return `COOLDOWN (${remaining}s remaining)`;
    }
    if (state === 'ACTION_APPLIED') {
      return 'ACTION APPLIED';
    }
    if (state === 'RECOMMENDATION_READY') {
      return 'RECOMMENDATION READY';
    }
    if (state === 'BOTTLENECK_CONFIRMED') {
      return 'BOTTLENECK CONFIRMED';
    }
    if (state === 'BOTTLENECK_CANDIDATE') {
      return `BOTTLENECK CANDIDATE (${streak}/3)`;
    }
    if (state === 'ROLLBACK_FAILED') {
      return 'ROLLBACK FAILED (RECOVERY)';
    }
    return state;
  };

  const getStateColor = () => {
    switch (state) {
      case 'KEEP':
        return '#10b981';
      case 'ROLLBACK':
        return '#f59e0b';
      case 'ROLLBACK_FAILED':
      case 'FAILED':
        return '#f43f5e';
      case 'ACTION_APPLIED':
      case 'OBSERVING':
        return '#3b82f6';
      case 'RECOMMENDATION_READY':
        return '#a855f7';
      case 'BOTTLENECK_CONFIRMED':
        return '#f43f5e';
      case 'BOTTLENECK_CANDIDATE':
        return '#f59e0b';
      case 'COOLDOWN':
        return '#60a5fa';
      default:
        return '#38bdf8';
    }
  };

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
              marginRight: '0.4rem',
            }}
          />
          {workloadLabel}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">
          <Sliders size={14} /> Operating Mode
        </span>
        <span className="summary-value" style={{ fontSize: '0.95rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: tunerStatus?.mode === 'auto' ? '#a855f7' : '#3b82f6',
              marginRight: '0.4rem',
            }}
          />
          {mode}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">
          <Cpu size={14} /> Autotuner State
        </span>
        <span
          className="summary-value"
          style={{
            fontSize: '0.95rem',
            color: getStateColor(),
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span
            className="pulse-indicator"
            style={{ backgroundColor: getStateColor(), marginRight: '0.4rem' }}
          />
          {getStateDisplay()}
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
