import React from 'react';
import { Play, Square, CheckCircle, RotateCcw, RefreshCw, ShieldAlert, AlertTriangle } from 'lucide-react';
import { actionState } from '../actionState.mjs';

export default function ActionControls({
  tunerStatus,
  onToggleMonitoring,
  onManualRefresh,
  lastUpdated,
  isRefreshing,
  pending,
  controlsLocked = false,
  onMode,
  onApprove,
  onRollback,
}) {
  const unavailable = pending || controlsLocked;
  const state = actionState(tunerStatus || {}, unavailable);
  const running = Boolean(tunerStatus?.running);

  const handleRollbackClick = () => {
    if (!state.canRollback) return;
    const confirmed = window.confirm(
      'Confirm Rollback: Are you sure you want to rollback the last applied tuning action and restore previous settings?'
    );
    if (confirmed) {
      onRollback(state.rollbackId);
    }
  };

  return (
    <div className="action-controls-container">
      <div className="action-controls-bar">
        {/* Operating Mode Group */}
        <div className="control-group">
          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Operating Mode:
          </span>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${tunerStatus?.mode === 'recommendation' ? 'active' : ''}`}
              disabled={unavailable || !state.canChangeMode}
              onClick={() => onMode('recommendation')}
              title="Recommendation Mode: Evaluates bottlenecks and suggests actions for manual approval"
            >
              Recommendation Mode
            </button>
            <button
              className={`mode-btn ${tunerStatus?.mode === 'auto' ? 'active' : ''}`}
              disabled={!state.canAuto}
              onClick={() => onMode('auto')}
              title={
                controlsLocked
                  ? 'Active comparison owns this workload'
                  : state.canAuto
                  ? 'Auto-Tuning Mode: Automatically applies safe actions upon confirmed bottlenecks'
                  : 'Requires an owned workload session to enable automatic tuning'
              }
            >
              Auto-Tuning Mode
            </button>
          </div>

          <button
            className={`btn ${running ? 'btn-danger' : 'btn-primary'}`}
            disabled={unavailable || !tunerStatus}
            onClick={() => onToggleMonitoring(!running)}
            title={running ? 'Stop background telemetry collection' : 'Start background telemetry collection'}
          >
            {running ? <Square size={14} /> : <Play size={14} />}
            {running ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
        </div>

        {/* Action Controls Group */}
        <div className="control-group">
          <button
            className="btn btn-secondary"
            disabled={!state.canApply}
            onClick={() => onApprove(state.approveId)}
            title={
              state.canApply
                ? 'Apply the currently recommended safe parameter change'
                : 'No approved recommendation available to apply'
            }
          >
            <CheckCircle size={14} />
            Apply Recommended Action
          </button>

          <button
            className="btn btn-secondary"
            disabled={!state.canRollback}
            onClick={handleRollbackClick}
            title={
              state.canRollback
                ? 'Rollback the last applied tuning action to its previous value'
                : 'Rollback is only valid after an action is applied or in recovery'
            }
          >
            <RotateCcw size={14} />
            {tunerStatus?.recovery_required ? 'Retry Rollback' : 'Rollback Last Action'}
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={onManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={12} className={isRefreshing ? 'spin' : ''} />
            {lastUpdated ? `Refreshed: ${lastUpdated.toLocaleTimeString()}` : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Safety Notice Banner if in Action Lifecycle */}
      {state.inLifecycle && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '4px',
            padding: '0.4rem 0.8rem',
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
            color: '#93c5fd',
          }}
        >
          <ShieldAlert size={14} />
          <span>
            <strong>Safety Mechanism Active:</strong> Another tuning action is blocked until evaluation and cooldown complete (One-Action-at-a-Time Rule).
          </span>
        </div>
      )}
    </div>
  );
}
