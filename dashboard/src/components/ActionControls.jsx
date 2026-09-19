import React from 'react';
import { Play, Square, CheckCircle, RotateCcw, RefreshCw, Lock } from 'lucide-react';

export default function ActionControls({
  tunerStatus,
  onToggleMonitoring,
  onManualRefresh,
  lastUpdated,
  isRefreshing,
}) {
  const isRunning = Boolean(tunerStatus?.running);

  return (
    <div className="action-controls-bar">
      <div className="control-group">
        {/* Mode Display & Guardrail (Tasks 15 & 16) */}
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Operating Mode:
        </span>
        <div className="mode-toggle">
          <button className="mode-btn active" title="Active Mode: Phase 2 Recommendation Only">
            Recommendation Mode
          </button>
          <button
            className="mode-btn"
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            title="Auto-Tuning is disabled in Phase 2. Coming in next development phase."
          >
            <Lock size={11} /> Auto-Tuning (Phase 3)
          </button>
        </div>

        <div className="control-divider" />

        {/* Start / Stop Real Telemetry Loop (Task 17) */}
        <button
          className={`btn ${isRunning ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => onToggleMonitoring(!isRunning)}
        >
          {isRunning ? (
            <>
              <Square size={14} /> Stop Telemetry Loop
            </>
          ) : (
            <>
              <Play size={14} /> Start Telemetry Loop
            </>
          )}
        </button>
      </div>

      <div className="control-group">
        {/* Manual Action & Rollback Placeholders */}
        <button
          className="btn btn-secondary"
          disabled
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
          title="Manual execution of recommendations will be enabled with DB actions in Phase 3"
        >
          <CheckCircle size={14} color="#10b981" /> Apply Recommendation (Phase 3)
        </button>

        <button
          className="btn btn-secondary"
          disabled
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
          title="Rollback engine will be active in Phase 3"
        >
          <RotateCcw size={14} color="#f43f5e" /> Rollback (Phase 3)
        </button>

        <div className="control-divider" />

        {/* 5-Second Live Refresh Indicator */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onManualRefresh}
          disabled={isRefreshing}
          title="Polling real telemetry every 5s"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          {lastUpdated ? `Refreshed: ${lastUpdated.toLocaleTimeString()}` : 'Refreshing...'}
        </button>
      </div>
    </div>
  );
}
