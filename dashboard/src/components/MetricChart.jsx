import React, { useState } from 'react';

/**
 * Themed area + line SVG chart (strict orange + white).
 *
 * Dependency-free — the coordinate math is ported from TimeSeriesChart but the
 * styling uses the `--s-*` design tokens so it matches the rest of the app.
 *
 * Props:
 *   data       array of records
 *   accessor   (item) => number | null   how to read the metric from a record
 *   label      metric name
 *   unit       display unit
 *   color      line/fill colour (default orange)
 *   threshold  optional { value, label } → dashed amber marker line
 *   height     svg height (default 190; compact uses 74)
 *   compact    small-multiple mode (no axis labels, no hover)
 */
export default function MetricChart({
  data = [], accessor, label, unit = '', color = 'var(--s-primary)',
  threshold = null, height = 190, compact = false,
}) {
  const [hover, setHover] = useState(null);

  const points = data
    .map((item, idx) => {
      const v = accessor(item);
      return {
        val: Number.isFinite(v) ? v : null,
        time: item?.timestamp ? new Date(item.timestamp).toLocaleTimeString() : `#${idx}`,
      };
    })
    .filter((p) => p.val != null);

  const values = points.map((p) => p.val);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  // include the threshold in the visible range so its marker is always on-chart
  const lo = threshold ? Math.min(rawMin, threshold.value) : rawMin;
  const hi = threshold ? Math.max(rawMax, threshold.value) : rawMax;
  const minVal = lo === hi ? lo - 1 : lo - (hi - lo) * 0.1;
  const maxVal = lo === hi ? hi + 1 : hi + (hi - lo) * 0.1;
  const range = maxVal - minVal || 1;

  const width = 800;
  const padX = compact ? 6 : 40;
  const padY = compact ? 8 : 22;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const coords = points.map((p, idx) => ({
    ...p,
    x: padX + (idx / Math.max(1, points.length - 1)) * chartW,
    y: padY + chartH - ((p.val - minVal) / range) * chartH,
    idx,
  }));

  const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const area = coords.length
    ? `${padX},${padY + chartH} ${line} ${coords[coords.length - 1].x},${padY + chartH}`
    : '';

  const gid = `mc-${label.replace(/\W+/g, '')}`;
  const fmt = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const latest = values.length ? values[values.length - 1] : null;
  const thY = threshold ? padY + chartH - ((threshold.value - minVal) / range) * chartH : null;

  return (
    <div className={`metric-chart ${compact ? 'compact' : ''}`}>
      <div className="mc-head">
        <span className="mc-label">{label}</span>
        <span className="mc-latest">
          {latest == null ? '—' : fmt(latest)}<span className="mc-unit">{unit}</span>
        </span>
      </div>

      {!points.length ? (
        <div className="mc-empty" style={{ height }}>No data yet</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="mc-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {!compact && [0, 0.5, 1].map((r, i) => {
            const y = padY + chartH * r;
            return (
              <g key={i}>
                <line x1={padX} y1={y} x2={width - padX} y2={y}
                  stroke="var(--s-border)" strokeDasharray="4 4" strokeWidth="1" />
                <text x={padX - 8} y={y + 3} fill="var(--s-text-soft)" fontSize="11"
                  textAnchor="end">{fmt(maxVal - r * range)}</text>
              </g>
            );
          })}

          {thY != null && (
            <g>
              <line x1={padX} y1={thY} x2={width - padX} y2={thY}
                stroke="#f59e0b" strokeDasharray="5 4" strokeWidth="1.4" />
              {!compact && (
                <text x={width - padX} y={thY - 4} fill="#b7560a" fontSize="10.5"
                  textAnchor="end">{threshold.label}</text>
              )}
            </g>
          )}

          {coords.length > 1 && <polygon points={area} fill={`url(#${gid})`} />}
          {coords.length > 1 && (
            <polyline points={line} fill="none" stroke={color}
              strokeWidth={compact ? 2 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {!compact && coords.map((c) => (
            <circle key={c.idx} cx={c.x} cy={c.y} r={hover?.idx === c.idx ? 5 : 3}
              fill={color} stroke="#fff" strokeWidth="2" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} />
          ))}

          {hover && !compact && (
            <g>
              <line x1={hover.x} y1={padY} x2={hover.x} y2={padY + chartH}
                stroke="var(--s-border)" strokeWidth="1" />
            </g>
          )}
        </svg>
      )}

      {hover && !compact && (
        <div className="mc-tip" style={{ left: `${(hover.x / width) * 100}%` }}>
          <span className="mc-tip-time">{hover.time}</span>
          <span className="mc-tip-val" style={{ color }}>{fmt(hover.val)} {unit}</span>
        </div>
      )}
    </div>
  );
}
