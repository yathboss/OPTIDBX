import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export default function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  status = 'normal', // 'normal', 'warning', 'critical'
  subtitle,
  isWaiting = false,
  tooltip,
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const getBorderColor = () => {
    if (status === 'critical') return 'rgba(244, 63, 94, 0.4)';
    if (status === 'warning') return 'rgba(245, 158, 11, 0.4)';
    return 'var(--border-color)';
  };

  const getValueColor = () => {
    if (isWaiting || value === null || value === undefined) return 'var(--text-muted)';
    if (status === 'critical') return 'var(--accent-rose)';
    if (status === 'warning') return 'var(--accent-amber)';
    return 'var(--text-primary)';
  };

  const displayValue = () => {
    if (isWaiting) {
      return (
        <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Waiting for telemetry...
        </span>
      );
    }
    if (value === null || value === undefined) {
      return <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>N/A</span>;
    }
    return value;
  };

  return (
    <div className="metric-card" style={{ borderColor: getBorderColor(), position: 'relative' }}>
      <div className="metric-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="metric-name">{title}</span>
          {tooltip && (
            <div
              style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <HelpCircle size={14} style={{ color: 'var(--text-muted, #94a3b8)', opacity: 0.8 }} />
              {showTooltip && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    transform: 'translateY(4px)',
                    zIndex: 50,
                    width: '210px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
                    fontSize: '0.75rem',
                    lineHeight: '1.25',
                    color: '#e2e8f0',
                    pointerEvents: 'none',
                  }}
                >
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
        {Icon && <Icon size={18} className="metric-icon" />}
      </div>

      <div className="metric-value-row">
        <span className="metric-value" style={{ color: getValueColor() }}>
          {displayValue()}
        </span>
        {!isWaiting && value !== null && value !== undefined && unit && (
          <span className="metric-unit">{unit}</span>
        )}
      </div>

      <div className="metric-footer">
        <span>{subtitle || 'Telemetry Window'}</span>
        {trend && !isWaiting && (
          <span style={{ color: trend.startsWith('+') ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
