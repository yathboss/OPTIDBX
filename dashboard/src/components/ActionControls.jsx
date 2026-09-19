import React from 'react';
import { Play, Square, CheckCircle, RotateCcw, RefreshCw } from 'lucide-react';
import { actionState } from '../actionState.mjs';

export default function ActionControls({tunerStatus, onToggleMonitoring, onManualRefresh,
  lastUpdated, isRefreshing, pending, onMode, onApprove, onRollback}) {
  const state = actionState(tunerStatus || {}, pending);
  const running = Boolean(tunerStatus?.running);
  return <div className="action-controls-bar">
    <div className="control-group">
      <span>Operating mode</span>
      <div className="mode-toggle">
        <button className={`mode-btn ${tunerStatus?.mode === 'recommendation' ? 'active' : ''}`}
          disabled={pending || !tunerStatus || tunerStatus.recovery_required} onClick={() => onMode('recommendation')}>Recommendation Mode</button>
        <button className={`mode-btn ${tunerStatus?.mode === 'auto' ? 'active' : ''}`}
          disabled={!state.canAuto} onClick={() => onMode('auto')}
          title={state.canAuto ? 'Tune owned workload sessions only' : 'Start an owned workload to enable automatic tuning'}>Auto-Tuning</button>
      </div>
      <button className={`btn ${running ? 'btn-danger' : 'btn-primary'}`} disabled={pending || !tunerStatus}
        onClick={() => onToggleMonitoring(!running)}>
        {running ? <Square size={14}/> : <Play size={14}/>}{running ? 'Stop Telemetry Loop' : 'Start Telemetry Loop'}
      </button>
    </div>
    <div className="control-group">
      <button className="btn btn-secondary" disabled={!state.canApply} onClick={() => onApprove(state.approveId)}>
        <CheckCircle size={14}/>Apply Recommendation</button>
      <button className="btn btn-secondary" disabled={!state.canRollback} onClick={() => onRollback(state.rollbackId)}>
        <RotateCcw size={14}/>{tunerStatus?.recovery_required ? 'Retry Rollback' : 'Rollback'}</button>
      <button className="btn btn-secondary btn-sm" onClick={onManualRefresh} disabled={isRefreshing}>
        <RefreshCw size={12}/>{lastUpdated ? `Refreshed: ${lastUpdated.toLocaleTimeString()}` : 'Refresh'}</button>
    </div>
  </div>;
}
