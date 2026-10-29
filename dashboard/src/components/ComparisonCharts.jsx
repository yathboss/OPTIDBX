import React from 'react';
import { BarChart3 } from 'lucide-react';

/**
 * Graphical baseline-vs-tuned comparison for a benchmark record.
 * Folded into the Performance Study page above the runs table.
 *
 *   - grouped bars per metric: Baseline (slate) vs Tuned (orange) with a
 *     direction-aware % delta chip (orange = better, slate = worse)
 *   - per-pair dumbbell for p95 latency, so consistency across pairs is visible
 *
 * Strict orange + white: no green/red; meaning via labels + fill-vs-outline.
 */

const METRICS = [
  { key: 'throughput_qps', label: 'Throughput', unit: 'qps', betterWhen: 'higher' },
  { key: 'median_latency_ms', label: 'Median latency', unit: 'ms', betterWhen: 'lower' },
  { key: 'p95_latency_ms', label: 'p95 latency', unit: 'ms', betterWhen: 'lower' },
];

const mean = (arr) => {
  const v = arr.filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const round = (v) => (v == null ? null : Math.round(v * 100) / 100);
const pct = (b, a) => (!b || a == null ? null : Math.round(((a - b) / b) * 1000) / 10);

export default function ComparisonCharts({ current }) {
  const runs = (current?.runs || []).filter((r) => r?.metrics);
  if (runs.length < 2) return null;

  const isBaseline = (r) => r.mode === 'baseline';
  const baseRuns = runs.filter(isBaseline);
  const tunedRuns = runs.filter((r) => !isBaseline(r));
  if (!baseRuns.length || !tunedRuns.length) return null;

  const agg = METRICS.map((m) => {
    const before = round(mean(baseRuns.map((r) => r.metrics[m.key])));
    const after = round(mean(tunedRuns.map((r) => r.metrics[m.key])));
    const change = pct(before, after);
    const improved = change == null ? null : m.betterWhen === 'lower' ? change < 0 : change > 0;
    return { ...m, before, after, change, improved };
  });

  // per-pair p95 dumbbell data
  const pairs = {};
  runs.forEach((r) => {
    const p = r.pair ?? 0;
    pairs[p] = pairs[p] || {};
    pairs[p][isBaseline(r) ? 'base' : 'tuned'] = r.metrics.p95_latency_ms;
  });
  const pairRows = Object.entries(pairs)
    .map(([p, v]) => ({ pair: Number(p), base: v.base, tuned: v.tuned }))
    .filter((r) => Number.isFinite(r.base) && Number.isFinite(r.tuned))
    .sort((a, b) => a.pair - b.pair);

  const allP95 = pairRows.flatMap((r) => [r.base, r.tuned]);
  const lo = allP95.length ? Math.min(...allP95) : 0;
  const hi = allP95.length ? Math.max(...allP95) : 1;
  const span = hi - lo || 1;
  const xOf = (v) => 6 + ((v - lo) / span) * 88; // percent, padded

  const interval = current?.evaluation?.p95_change?.interval_95;
  const pairsDone = current?.evaluation?.completed_pairs ?? 0;

  return (
    <div className="cmp">
      <div className="cmp-head"><BarChart3 size={16} /><h3>Baseline vs tuned — at a glance</h3></div>

      <div className="cmp-bars">
        {agg.map((m) => {
          const max = Math.max(m.before ?? 0, m.after ?? 0) || 1;
          return (
            <div className="cmp-metric" key={m.key}>
              <div className="cmp-metric-head">
                <span className="cmp-metric-name">{m.label} <span className="muted">({m.unit})</span></span>
                {m.change != null && (
                  <span className={`cmp-chg ${m.improved ? 'better' : m.change === 0 ? 'flat' : 'worse'}`}>
                    {m.change >= 0 ? '+' : ''}{m.change}%
                  </span>
                )}
              </div>
              <div className="cmp-bar">
                <span className="cmp-tag">Baseline</span>
                <div className="cmp-track"><div className="cmp-fill base" style={{ width: `${((m.before ?? 0) / max) * 100}%` }} /></div>
                <span className="cmp-num">{m.before ?? '—'}</span>
              </div>
              <div className="cmp-bar">
                <span className="cmp-tag">Tuned</span>
                <div className="cmp-track"><div className="cmp-fill tuned" style={{ width: `${((m.after ?? 0) / max) * 100}%` }} /></div>
                <span className="cmp-num">{m.after ?? '—'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {pairRows.length > 0 && (
        <div className="cmp-dumbbell">
          <div className="cmp-metric-head">
            <span className="cmp-metric-name">p95 latency by pair <span className="muted">(ms · lower is better)</span></span>
            <span className="cmp-legend"><i className="dot base" /> Baseline <i className="dot tuned" /> Tuned</span>
          </div>
          {pairRows.map((r) => {
            const left = Math.min(xOf(r.base), xOf(r.tuned));
            const w = Math.abs(xOf(r.tuned) - xOf(r.base));
            const improved = r.tuned < r.base;
            return (
              <div className="db-row" key={r.pair}>
                <span className="db-label">Pair {r.pair + 1}</span>
                <div className="db-track">
                  <div className={`db-conn ${improved ? 'better' : 'worse'}`} style={{ left: `${left}%`, width: `${w}%` }} />
                  <div className="db-dot base" style={{ left: `${xOf(r.base)}%` }} title={`Baseline ${Math.round(r.base)} ms`} />
                  <div className="db-dot tuned" style={{ left: `${xOf(r.tuned)}%` }} title={`Tuned ${Math.round(r.tuned)} ms`} />
                </div>
                <span className="db-vals">{Math.round(r.base)} → {Math.round(r.tuned)}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="cmp-caption">
        Bars are means across {baseRuns.length} baseline and {tunedRuns.length} tuned run(s).
        {pairsDone >= 2 && interval
          ? ` 95% paired interval on p95: ${interval.map((v) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%`).join(' to ')}.`
          : ' Run more pairs to estimate uncertainty.'}
      </p>
    </div>
  );
}
