import React, { useState } from 'react';
import { LineChart as ChartIcon } from 'lucide-react';

export default function TimeSeriesChart({ historyData = [] }) {
  const [metricKey, setMetricKey] = useState('cpu'); // 'cpu', 'latency', 'throughput'

  // Metric definitions
  const metricsConfig = {
    cpu: {
      label: 'CPU Utilization',
      unit: '%',
      color: '#3b82f6',
      fillColor: 'rgba(59, 130, 246, 0.15)',
      getValue: (item) => item?.os?.cpu_percent ?? 0,
    },
    latency: {
      label: 'Query Latency',
      unit: 'ms',
      color: '#f59e0b',
      fillColor: 'rgba(245, 158, 11, 0.15)',
      getValue: (item) => item?.db?.query_latency_ms ?? 0,
    },
    throughput: {
      label: 'Throughput',
      unit: 'TPS',
      color: '#10b981',
      fillColor: 'rgba(16, 185, 129, 0.15)',
      getValue: (item) => item?.db?.throughput_tps ?? 0,
    },
    memory: {
      label: 'Memory Usage',
      unit: '%',
      color: '#8b5cf6',
      fillColor: 'rgba(139, 92, 246, 0.15)',
      getValue: (item) => item?.os?.memory_percent ?? 0,
    },
    temp_spill: {
      label: 'Temp File Spill',
      unit: 'MB',
      color: '#ec4899',
      fillColor: 'rgba(236, 72, 153, 0.15)',
      getValue: (item) => {
        const bytes = item?.db?.temp_files_bytes ?? item?.db?.temp_bytes ?? 0;
        return Number((Number(bytes) / (1024 * 1024)).toFixed(2));
      },
    },
  };

  const currentConfig = metricsConfig[metricKey];

  // Prepare data points
  const points = (historyData.length > 0 ? historyData : []).map((item, idx) => ({
    val: currentConfig.getValue(item),
    time: item?.timestamp ? new Date(item.timestamp).toLocaleTimeString() : `#${idx}`,
  }));

  const values = points.map((p) => p.val);
  const minVal = values.length ? Math.floor(Math.min(...values) * 0.9) : 0;
  const maxVal = values.length ? Math.ceil(Math.max(...values) * 1.1) : 100;
  const range = maxVal - minVal || 1;

  // SVG dimensions
  const width = 800;
  const height = 220;
  const paddingX = 40;
  const paddingY = 25;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  // Calculate coordinates
  const coords = points.map((p, idx) => {
    const x = paddingX + (idx / Math.max(1, points.length - 1)) * chartW;
    const y = paddingY + chartH - ((p.val - minVal) / range) * chartH;
    return { ...p, x, y };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPoints = coords.length
    ? `${paddingX},${paddingY + chartH} ` +
      polylinePoints +
      ` ${coords[coords.length - 1].x},${paddingY + chartH}`
    : '';

  const [hoveredPoint, setHoveredPoint] = useState(null);

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ChartIcon size={18} color="var(--accent-blue)" />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
            Real-Time Telemetry Trend (5s Resolution)
          </span>
        </div>

        <div className="chart-tabs">
          <button
            className={`chart-tab-btn ${metricKey === 'cpu' ? 'active' : ''}`}
            onClick={() => setMetricKey('cpu')}
          >
            CPU %
          </button>
          <button
            className={`chart-tab-btn ${metricKey === 'latency' ? 'active' : ''}`}
            onClick={() => setMetricKey('latency')}
          >
            Latency (ms)
          </button>
          <button
            className={`chart-tab-btn ${metricKey === 'throughput' ? 'active' : ''}`}
            onClick={() => setMetricKey('throughput')}
          >
            Throughput (TPS)
          </button>
          <button
            className={`chart-tab-btn ${metricKey === 'memory' ? 'active' : ''}`}
            onClick={() => setMetricKey('memory')}
          >
            Memory %
          </button>
          <button
            className={`chart-tab-btn ${metricKey === 'temp_spill' ? 'active' : ''}`}
            onClick={() => setMetricKey('temp_spill')}
          >
            Temp Spill (MB)
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <defs>
            <linearGradient id={`grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentConfig.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={currentConfig.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid horizontal lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = paddingY + chartH * ratio;
            const labelVal = Math.round(maxVal - ratio * range);
            return (
              <g key={i}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="var(--border-color)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={paddingX - 8}
                  y={y + 4}
                  fill="var(--text-muted)"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Fill area */}
          {coords.length > 1 && (
            <polygon points={areaPoints} fill={`url(#grad-${metricKey})`} />
          )}

          {/* Line */}
          {coords.length > 1 && (
            <polyline
              fill="none"
              stroke={currentConfig.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylinePoints}
            />
          )}

          {/* Data point circles */}
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={hoveredPoint?.idx === i ? 5 : 3}
              fill={currentConfig.color}
              stroke="var(--bg-secondary)"
              strokeWidth="2"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredPoint({ ...c, idx: i })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div
            style={{
              position: 'absolute',
              top: Math.max(10, (hoveredPoint.y / height) * 100 - 15) + '%',
              left: (hoveredPoint.x / width) * 100 + '%',
              transform: 'translate(-50%, -100%)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: '#fff',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
              zIndex: 10,
            }}
          >
            <div>{hoveredPoint.time}</div>
            <div style={{ color: currentConfig.color, fontWeight: 700 }}>
              {hoveredPoint.val} {currentConfig.unit}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 40px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <span>{points[0]?.time || 'T-95s'}</span>
        <span>{currentConfig.label} ({currentConfig.unit})</span>
        <span>{points[points.length - 1]?.time || 'Now'}</span>
      </div>
    </div>
  );
}

