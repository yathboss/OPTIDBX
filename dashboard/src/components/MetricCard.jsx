import React from 'react';

export default function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  status = 'normal', // 'normal', 'warning', 'critical'
  subtitle,
  isWaiting = false,
}) {
  const getBorderColor = () => {
    if (status === 'critical') return 'rgba(244, 97, 12, 0.45)';
    if (status === 'warning') return 'rgba(245, 158, 11, 0.4)';
    return 'var(--border-color)';
  };

  const getValueColor = () => {
    if (isWaiting || value === null || value === undefined) return 'var(--text-muted)';
    if (status === 'critical') return 'var(--accent-blue)';
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
    <div className="metric-card" style={{ borderColor: getBorderColor() }}>
      <div className="metric-header">
        <span className="metric-name">{title}</span>
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
          <span style={{ color: trend.startsWith('+') ? '#f59e0b' : '#5b6675', fontWeight: 600 }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
