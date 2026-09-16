import React from 'react';
import { Layers, Sliders, ShieldAlert, Cpu } from 'lucide-react';

export default function TopSummary({ tunerStatus, currentWorkload = "TPC-B Mixed (Scale 50)" }) {
  const isBottleneck = tunerStatus?.detected_bottleneck && tunerStatus.detected_bottleneck !== 'NONE';

  return (
    <div className="summary-bar">
      <div className="summary-card">
        <span className="summary-label">
          <Layers size={14} /> Current Workload
        </span>
        <span className="summary-value" style={{ fontSize: '1rem' }}>
          {currentWorkload}
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
              backgroundColor: tunerStatus?.mode === 'auto' ? '#8b5cf6' : '#3b82f6',
            }}
          />
          {tunerStatus?.mode === 'auto' ? 'Auto-Tuning' : 'Recommendation'}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-label">
          <Cpu size={14} /> System State
        </span>
        <span className="summary-value" style={{ textTransform: 'capitalize' }}>
          <span className="pulse-indicator" />
          {tunerStatus?.state || 'Monitoring'}
        </span>
      </div>

      <div className="summary-card" style={{ borderColor: isBottleneck ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)' }}>
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

