import React from 'react';
import { Play, Square, CheckCircle, RotateCcw, Sliders, RefreshCw } from 'lucide-react';

export default function ActionControls({
  tunerStatus,
  onModeChange,
  onToggleMonitoring,
  onApplyAction,
  onRollbackAction,
  onManualRefresh,
  lastUpdated,
  isRefreshing,
}) {
  const isMonitoring = tunerStatus?.state !== 'idle';
  const hasRecommendation = tunerStatus?.recommended_action != null;

  return (
    <div className="action-controls-bar">
      <div className="control-group">
        {/* Mode Toggle Switch */}
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Mode:
        </span>
        <div className="mode-toggle">
          <button
            className={`mode-btn ${tunerStatus?.mode === 'recommendation' ? 'active' : ''}`}
            onClick={() => onModeChange('recommendation')}
          >
            Recommendation
          </button>
          <button
            className={`mode-btn ${tunerStatus?.mode === 'auto' ? 'active' : ''}`}
            onClick={() => onModeChange('auto')}
          >
            Auto-Tuning
          </button>
        </div>

        <div className="control-divider" />

        {/* Start / Stop Monitoring Controls */}
        <button
          className={`btn ${isMonitoring ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => onToggleMonitoring(!isMonitoring)}
        >
          {isMonitoring ? (
            <>
              <Square size={14} /> Stop Monitoring
            </>
          ) : (
            <>
              <Play size={14} /> Start Monitoring
            </>
          )}
        </button>
      </div>

      <div className="control-group">
        {/* Manual Apply & Rollback UI */}
        <button
          className="btn btn-secondary"
          onClick={onApplyAction}
          disabled={!hasRecommendation}
          title={hasRecommendation ? "Apply currently recommended parameter" : "No pending recommendation"}
        >
          <CheckCircle size={14} color="#10b981" /> Apply Recommended Action
        </button>

        <button
          className="btn btn-secondary"
          onClick={onRollbackAction}
          title="Roll back to previous parameter value"
        >
          <RotateCcw size={14} color="#f43f5e" /> Rollback Last Action
        </button>

        <div className="control-divider" />

        {/* Refresh button with timestamp */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onManualRefresh}
          disabled={isRefreshing}
          title="Polling every 5s"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Refreshing...'}
        </button>
      </div>
    </div>
  );
}

