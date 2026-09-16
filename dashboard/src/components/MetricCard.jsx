import React from 'react';

export default function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  status = 'normal', // 'normal', 'warning', 'critical'
  subtitle,
}) {
  const getBorderColor = () => {
    if (status === 'critical') return 'rgba(244, 63, 94, 0.4)';
    if (status === 'warning') return 'rgba(245, 158, 11, 0.4)';
    return 'var(--border-color)';
  };

  const getValueColor = () => {
    if (status === 'critical') return 'var(--accent-rose)';
    if (status === 'warning') return 'var(--accent-amber)';
    return 'var(--text-primary)';
  };

  return (
    <div className="metric-card" style={{ borderColor: getBorderColor() }}>
      <div className="metric-header">
        <span className="metric-name">{title}</span>
        {Icon && <Icon size={18} className="metric-icon" />}
      </div>

      <div className="metric-value-row">
        <span className="metric-value" style={{ color: getValueColor() }}>
          {value !== undefined && value !== null ? value : '--'}
        </span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>

      <div className="metric-footer">
        <span>{subtitle || 'Telemetry Window'}</span>
        {trend && (
          <span style={{ color: trend.startsWith('+') ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

