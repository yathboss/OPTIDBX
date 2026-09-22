import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Play, RotateCcw, Cpu, Users, Timer, Activity, MemoryStick,
  CheckCircle2, XCircle, MinusCircle, ShieldAlert, Info, Download, Radio,
  FileDown, Gauge as GaugeIcon, Square,
} from 'lucide-react';
import { PIPELINE, VERDICTS } from '../scenarios.mjs';

const VERDICT_ICON = {
  KEEP: CheckCircle2, ROLLBACK: XCircle, NO_ACTION: MinusCircle,
  RECOMMENDATION: Info, RECOVERY: ShieldAlert,
};

/** Stage script for a real session; the same six pipeline steps as a scenario. */
export const LIVE_STAGES = [
  { key: 'baseline', label: 'Baseline',
    narration: 'Collecting a warm, steady-state baseline from the owned workload. No change is made yet.' },
  { key: 'detect', label: 'Detection',
    narration: 'Watching every interval for sustained CPU/parallelism contention. Three consecutive problematic readings are required — a single spike will not trigger a change.' },
  { key: 'apply', label: 'Apply',
    narration: 'The action is journaled to disk and audited before any change, then parallelism is reduced one approved step and the new value is verified.' },
  { key: 'observe', label: 'Observation',
    narration: 'Measuring the effect on the owned workload itself — client-observed p95 latency and throughput, not noisy database-wide counters.' },
  { key: 'decision', label: 'Decision',
    narration: 'Comparing before and after against the net-benefit rule. The change is kept only if it measurably helped; otherwise it is reverted.' },
];

function Gauge({ icon: Icon, label, value, unit, max, tone }) {
  const numeric = Number.isFinite(value) ? value : null;
  const fill = max && numeric != null ? Math.max(0, Math.min(100, (numeric / max) * 100)) : null;
  return (
    <div className="gauge">
      <div className="gauge-head"><Icon size={15} /><span>{label}</span></div>
      <div className="gauge-value">
        {numeric == null ? '—' : numeric.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        <span className="gauge-unit">{unit}</span>
      </div>
      {fill != null && <div className="gauge-track"><div className={`gauge-fill tone-${tone || 'accent'}`} style={{ width: `${fill}%` }} /></div>}
    </div>
  );
}

/** Map the real tuner state onto the shared pipeline index. */
function liveStageIndex(state, running) {
  if (['KEEP', 'ROLLBACK', 'ROLLBACK_FAILED', 'COOLDOWN'].includes(state)) return 4;
  if (state === 'OBSERVING') return 3;
  if (state === 'ACTION_APPLIED') return 2;
  if (state === 'RECOMMENDATION_READY') return 1;
  return running ? 0 : 0;
}

/** Shape a completed live action into the same outcome contract a scenario uses. */
function liveOutcome(action) {
  const b = action?.before_owned, a = action?.after_owned;
  const change = (before, after) => (!before ? null : Math.round(((after - before) / before) * 1000) / 10);
  const evidence = b && a ? {
    kind: 'CHANGE',
    label: 'Effect of the change, measured on the owned workload',
    rows: [
      { label: 'Owned throughput', unit: 'qps', before: round(b.qps), after: round(a.qps),
        betterWhen: 'higher', change: action.owned_change?.qps_percent ?? change(b.qps, a.qps) },
      { label: 'Owned p95 latency', unit: 'ms', before: round(b.p95_latency_ms), after: round(a.p95_latency_ms),
        betterWhen: 'lower', change: action.owned_change?.p95_percent ?? change(b.p95_latency_ms, a.p95_latency_ms) },
    ],
  } : null;
  const kept = action?.outcome === 'KEEP';
  const param = action?.action;
  return {
    verdict: kept ? 'KEEP' : 'ROLLBACK',
    headline: param
      ? `${param.parameter} ${param.old_value} → ${param.new_value} ${kept ? 'kept' : 'reverted'}`
      : kept ? 'Change kept' : 'Change reverted',
    detail: action?.reason || (kept
      ? 'The measured improvement met the configured tolerance, so the change was kept.'
      : 'The observation did not support the change, so the original setting was restored and verified.'),
    evidence,
  };
}
const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/** Build "conditions observed" evidence from live telemetry snapshots — matches
 *  the shape the demo NO_ACTION / recommendation scenarios use, so live reports
 *  render the identical before/after graphic. Returns null if nothing was captured. */
function liveObserved(baseline, latest) {
  if (!baseline || !latest) return null;
  const r = (label, unit, key, betterWhen = 'lower') => {
    const before = round(baseline[key]);
    const after = round(latest[key]);
    if (before == null && after == null) return null;
    const change = before ? Math.round(((after - before) / before) * 1000) / 10 : null;
    return { label, unit, before, after, betterWhen, change };
  };
  const rows = [
    r('CPU utilisation', '%', 'cpu_percent'),
    r('Query latency', 'ms', 'query_latency_ms'),
    r('Parallel workers', '', 'active_workers'),
  ].filter(Boolean);
  if (!rows.length) return null;
  return {
    kind: 'OBSERVED',
    label: 'Conditions observed during the session — no change was applied',
    rows,
  };
}

/** Graphical before/after comparison shared by the outcome card and history. */
export function EvidenceChart({ evidence }) {
  if (!evidence?.rows?.length) return null;
  return (
    <div className="evidence">
      <p className="evidence-label">{evidence.label}</p>
      <div className="evidence-rows">
        {evidence.rows.map((r) => {
          const max = Math.max(r.before ?? 0, r.after ?? 0) || 1;
          const improved = r.change == null ? null
            : r.betterWhen === 'lower' ? r.change < 0 : r.change > 0;
          return (
            <div className="evidence-row" key={r.label}>
              <div className="evidence-row-head">
                <span className="evidence-metric">{r.label}</span>
                {r.change != null && (
                  <span className={`evidence-change ${improved ? 'better' : r.change === 0 ? 'flat' : 'worse'}`}>
                    {r.change >= 0 ? '+' : ''}{r.change}%
                  </span>
                )}
              </div>
              <div className="evidence-bar">
                <span className="evidence-bar-tag">Before</span>
                <div className="evidence-track"><div className="evidence-fill before" style={{ width: `${((r.before ?? 0) / max) * 100}%` }} /></div>
                <span className="evidence-num">{r.before ?? '—'}{r.unit && ` ${r.unit}`}</span>
              </div>
              <div className="evidence-bar">
                <span className="evidence-bar-tag">After</span>
                <div className="evidence-track"><div className="evidence-fill after" style={{ width: `${((r.after ?? 0) / max) * 100}%` }} /></div>
                <span className="evidence-num">{r.after ?? '—'}{r.unit && ` ${r.unit}`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SessionRunner({ session, onExit, onOpenMetrics, live, onComplete }) {
  const isLive = session.kind === 'live';
  const stages = isLive ? LIVE_STAGES : session.stages;

  const [phase, setPhase] = useState(isLive ? 'running' : 'setup'); // setup | running | complete
  const [stageIndex, setStageIndex] = useState(isLive ? 0 : -1);
  const [telemetry, setTelemetry] = useState(null);
  const [cue, setCue] = useState(isLive ? LIVE_STAGES[0].narration : session.summary);
  const [outcome, setOutcome] = useState(null);
  const [speed, setSpeed] = useState('standard');
  const [runToken, setRunToken] = useState(0);
  const reported = useRef(false);
  const liveBaseline = useRef(null); // first meaningful live telemetry snapshot
  const liveLatest = useRef(null);   // most recent live telemetry snapshot
  const liveRan = useRef(false);     // guards against completing before the workload truly started

  const presentKeys = useMemo(() => new Set(stages.map((s) => s.key)), [stages]);
  const activeStage = stageIndex >= 0 && stageIndex < stages.length ? stages[stageIndex] : null;

  // Reset only when the session identity changes — NOT on every render. The live
  // parent rebuilds the `session` object literal each poll, so depending on the
  // object reference here would re-run every 5 s and wipe run state (phase,
  // liveRan, baseline), leaving a live session stuck "running" forever.
  useEffect(() => {
    reported.current = false;
    liveBaseline.current = null;
    liveLatest.current = null;
    liveRan.current = false;
    setPhase(isLive ? 'running' : 'setup');
    setStageIndex(isLive ? 0 : -1);
    setTelemetry(null);
    setCue(isLive ? LIVE_STAGES[0].narration : session.summary);
    setOutcome(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, isLive]);

  // --- Scripted player -----------------------------------------------------
  useEffect(() => {
    if (phase !== 'running' || isLive) return;
    let cancelled = false;
    const timers = [];
    const mult = speed === 'quick' ? 0.5 : 1;
    let acc = 0;
    stages.forEach((stage, i) => {
      timers.push(setTimeout(() => {
        if (cancelled) return;
        setStageIndex(i); setTelemetry(stage.telemetry); setCue(stage.narration);
      }, acc));
      acc += stage.durationMs * mult;
    });
    timers.push(setTimeout(() => {
      if (cancelled) return;
      setStageIndex(stages.length);
      setOutcome(session.outcome); setCue(session.outcome.detail); setPhase('complete');
    }, acc));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [phase, session, stages, speed, runToken, isLive]);

  // --- Live player: driven by the app's real polling -----------------------
  useEffect(() => {
    if (!isLive || phase === 'complete') return;
    const status = live?.tunerStatus || {};
    const work = live?.workloadStatus || {};
    const m = live?.metrics || {};
    const ev = status.evidence || {};

    const t = {
      cpu_percent: m.os?.cpu_percent ?? ev.cpu_percent,
      active_workers: m.db?.active_workers ?? ev.active_workers,
      query_latency_ms: m.db?.query_latency_ms ?? ev.query_latency_ms,
      context_switches: m.os?.context_switches ?? ev.context_switches,
      memory_percent: m.os?.memory_percent ?? ev.memory_percent,
    };
    setTelemetry(t);
    // Capture baseline (first meaningful reading) and latest for the observed-conditions report.
    if (t.cpu_percent != null || t.query_latency_ms != null) {
      if (!liveBaseline.current) liveBaseline.current = t;
      liveLatest.current = t;
    }

    if (work.running) liveRan.current = true;

    const idx = liveStageIndex(status.state, work.running);
    setStageIndex(idx);
    setCue(LIVE_STAGES[idx]?.narration || '');

    const action = status.active_action;
    if (action && (action.outcome === 'KEEP' || action.outcome === 'ROLLBACK')) {
      setOutcome(liveOutcome(action));
      setStageIndex(stages.length);
      setPhase('complete');
    } else if (liveRan.current && !work.running && work.experiment_id && !action) {
      setOutcome({
        verdict: 'NO_ACTION',
        headline: 'No change required',
        detail: 'No sustained contention was confirmed during this session, so no change was applied — the correct outcome on a healthy database.',
        evidence: liveObserved(liveBaseline.current, liveLatest.current),
      });
      setStageIndex(stages.length);
      setPhase('complete');
    }
  }, [isLive, phase, live?.tunerStatus, live?.workloadStatus, live?.metrics, stages.length]);

  // Report completion once (history + notifications).
  useEffect(() => {
    if (phase === 'complete' && outcome && !reported.current) {
      reported.current = true;
      onComplete?.({ session, outcome });
    }
  }, [phase, outcome, onComplete, session]);

  const begin = () => {
    setStageIndex(-1); setTelemetry(stages[0]?.telemetry || null);
    setOutcome(null); reported.current = false; setPhase('running'); setRunToken((t) => t + 1);
  };
  const restart = () => begin();

  const stepState = (key) => {
    if (key === 'report') return phase === 'complete' ? 'current' : 'upcoming';
    if (!presentKeys.has(key)) return 'skipped';
    const order = stages.findIndex((s) => s.key === key);
    if (phase === 'complete') return 'complete';
    if (order < stageIndex) return 'complete';
    if (order === stageIndex) return 'current';
    return 'upcoming';
  };

  const Vicon = outcome ? VERDICT_ICON[outcome.verdict] : null;
  const vtone = outcome ? VERDICTS[outcome.verdict]?.tone : 'neutral';
  const running = phase === 'running';

  return (
    <div className="mission">
      <div className="mission-topbar">
        <button className="btn-ghost" onClick={onExit} disabled={isLive && running}>
          <ArrowLeft size={16} /> {isLive ? 'Session setup' : 'Scenarios'}
        </button>
        <div className="mission-title">
          <span className={`kind-badge ${isLive ? 'kind-live' : 'kind-sim'}`}>
            {isLive ? <><Radio size={12} /> Live</> : 'Simulated'}
          </span>
          <h2>{session.title}</h2>
        </div>
        <div className="mission-actions">
          {isLive && (
            <button className="btn-ghost" onClick={onOpenMetrics}><GaugeIcon size={16} /> Live metrics</button>
          )}
          {!isLive && (
            <div className="speed-toggle" role="group" aria-label="Playback speed">
              {['standard', 'quick'].map((s) => (
                <button key={s} className={speed === s ? 'active' : ''} disabled={running}
                  onClick={() => setSpeed(s)}>{s === 'standard' ? 'Standard' : 'Quick'}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLive && running && (
        <div className="session-lock">
          <span className="running-pill"><span className="pulse" /> Session in progress</span>
          <span className="session-lock-text">Controls are locked while the session runs so the measurement stays clean.</span>
          <button className="btn-secondary" disabled={live?.pending} onClick={live?.onStop}><Square size={14} /> Stop session</button>
        </div>
      )}

      <ol className="pipeline" aria-label="Decision pipeline">
        {PIPELINE.map((p, i) => {
          const st = stepState(p.key);
          return (
            <li key={p.key} className={`pipeline-step ${st}`}>
              <span className="pipeline-dot">{st === 'complete' ? <CheckCircle2 size={16} /> : i + 1}</span>
              <span className="pipeline-label">{p.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="mission-body">
        <section className="mission-panel telemetry-panel">
          <div className="panel-head"><h3>{isLive ? 'Live telemetry' : 'Illustrative telemetry'}</h3>
            {running && <span className="running-pill"><span className="pulse" /> Running</span>}
          </div>
          <div className="gauge-grid">
            <Gauge icon={Cpu} label="CPU" value={telemetry?.cpu_percent} unit="%" max={100}
              tone={(telemetry?.cpu_percent ?? 0) > 85 ? 'danger' : 'accent'} />
            <Gauge icon={Users} label="Parallel workers" value={telemetry?.active_workers} unit="" max={32}
              tone={(telemetry?.active_workers ?? 0) > 8 ? 'danger' : 'accent'} />
            <Gauge icon={Timer} label="Query latency" value={telemetry?.query_latency_ms} unit="ms" max={600}
              tone={(telemetry?.query_latency_ms ?? 0) > 200 ? 'warning' : 'accent'} />
            <Gauge icon={Activity} label="Context switches" value={telemetry?.context_switches} unit="/int" max={30000} tone="accent" />
            <Gauge icon={MemoryStick} label="Memory" value={telemetry?.memory_percent} unit="%" max={100}
              tone={(telemetry?.memory_percent ?? 0) > 85 ? 'warning' : 'accent'} />
          </div>
        </section>
      </div>

      {phase === 'setup' && !isLive && (
        <div className="mission-cta">
          <div><h3>{session.subtitle}</h3><p>{session.summary}</p></div>
          <button className="btn-primary lg" onClick={begin}><Play size={18} /> Begin scenario</button>
        </div>
      )}

      {phase === 'complete' && outcome && (
        <div className={`outcome-card tone-${vtone}`}>
          <div className="outcome-head">
            {Vicon && <Vicon size={28} />}
            <div><p className="outcome-verdict">{VERDICTS[outcome.verdict]?.label}</p><h3>{outcome.headline}</h3></div>
          </div>
          <p className="outcome-detail">{outcome.detail}</p>
          <EvidenceChart evidence={outcome.evidence} />
          <div className="outcome-actions">
            <button className="btn-primary" onClick={() => printSessionReport(session, outcome)}><FileDown size={16} /> Download PDF report</button>
            <button className="btn-secondary" onClick={() => downloadJson(session, outcome)}><Download size={16} /> Data (JSON)</button>
            {!isLive && <button className="btn-secondary" onClick={restart}><RotateCcw size={16} /> Replay</button>}
            <button className="btn-secondary" onClick={onExit}>{isLive ? 'New session' : 'Back to scenarios'}</button>
          </div>
          <p className="outcome-note">
            {isLive
              ? 'Live result measured on the real PostgreSQL backend.'
              : 'Illustrative simulation — values seeded from measured runs (see the technical report).'}
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- reports */

export function printSessionReport(session, outcome) {
  const ev = outcome.evidence;
  const sign = (v) => (v >= 0 ? '+' : '') + v + '%';
  const bars = (r) => {
    const max = Math.max(r.before ?? 0, r.after ?? 0) || 1;
    const improved = r.change == null ? null : (r.betterWhen === 'lower' ? r.change < 0 : r.change > 0);
    const w = (v) => `${(((v ?? 0) / max) * 100).toFixed(1)}%`;
    return `<div class="row">
      <div class="rowhead"><span class="metric">${r.label}</span>
        ${r.change == null ? '' : `<span class="chg ${improved ? 'good' : r.change === 0 ? 'flat' : 'bad'}">${sign(r.change)}</span>`}</div>
      <div class="bar"><span class="tag">Before</span><div class="track"><div class="fill before" style="width:${w(r.before)}"></div></div><span class="num">${r.before ?? '—'} ${r.unit || ''}</span></div>
      <div class="bar"><span class="tag">After</span><div class="track"><div class="fill after" style="width:${w(r.after)}"></div></div><span class="num">${r.after ?? '—'} ${r.unit || ''}</span></div>
    </div>`;
  };
  const rows = ev?.rows?.length
    ? `<h3 class="evh">Before vs after</h3><p class="evlabel">${ev.label}</p>
       <div class="chart">${ev.rows.map(bars).join('')}</div>
       <table><thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>
       ${ev.rows.map((r) => {
         const improved = r.change == null ? null : (r.betterWhen === 'lower' ? r.change < 0 : r.change > 0);
         return `<tr><td>${r.label}</td><td>${r.before ?? '—'} ${r.unit || ''}</td><td>${r.after ?? '—'} ${r.unit || ''}</td>
           <td class="${improved ? 'good' : 'bad'}">${r.change == null ? '—' : sign(r.change)}</td></tr>`;
       }).join('')}
       </tbody></table>`
    : `<p class="noowned">No before/after measurements were recorded for this session.</p>`;
  const provenance = session.kind === 'live'
    ? 'LIVE — measured on the real PostgreSQL backend'
    : 'SIMULATED — values seeded from measured runs (see technical report)';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>OptiDBX Report — ${session.title}</title><style>
    body{font-family:"Segoe UI",Arial,sans-serif;color:#1a2230;margin:40px}
    .brand{display:flex;align-items:center;gap:10px;border-bottom:3px solid #f4610c;padding-bottom:12px}
    .logo{width:34px;height:34px;border-radius:8px;background:#f4610c;color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px}
    .brand h2{margin:0;font-size:18px}.brand span{color:#5b6675;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    h1{font-size:24px;margin:22px 0 4px}.sub{color:#5b6675;margin:0 0 18px}
    .verdict{display:inline-block;background:#fff3ea;color:#d24e05;font-weight:700;padding:8px 14px;border-radius:8px;border:1px solid #f7d6bf}
    p{line-height:1.6}table{border-collapse:collapse;width:100%;margin:18px 0;font-size:14px}
    th,td{border:1px solid #e4e8ee;padding:9px 12px;text-align:left}th{background:#f7f8fa}
    td.good{color:#d24e05;font-weight:700}td.bad{color:#5b6675;font-weight:700}
    .noowned{background:#f7f8fa;border:1px solid #e4e8ee;border-radius:8px;padding:14px}
    .meta{color:#5b6675;font-size:12px;margin:4px 0}
    .evh{font-size:15px;margin:26px 0 2px}
    .evlabel{color:#5b6675;font-size:12px;margin:0 0 12px}
    .chart{background:#f7f8fa;border:1px solid #e4e8ee;border-radius:10px;padding:16px 18px}
    .row{margin-bottom:16px}.row:last-child{margin-bottom:0}
    .rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .metric{font-weight:700;font-size:13px}
    .chg{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#eef1f5;color:#5b6675}
    .chg.good{background:#fff3ea;color:#d24e05}
    .bar{display:flex;align-items:center;gap:8px;margin:4px 0}
    .tag{width:46px;font-size:11px;color:#8a94a3;text-transform:uppercase;letter-spacing:.04em}
    .track{flex:1;height:14px;background:#e9edf2;border-radius:999px;overflow:hidden}
    .fill{height:100%;border-radius:999px}
    .fill.before{background:#b6c0cc}.fill.after{background:#f4610c}
    .num{width:92px;text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
    footer{margin-top:28px;border-top:1px solid #e4e8ee;padding-top:12px;color:#8a94a3;font-size:11px}
  </style></head><body>
  <div class="brand"><div class="logo">O</div><div><h2>OptiDBX &mdash; Session Report</h2><span>Understand. Tune. Verify.</span></div></div>
  <h1>${session.title}</h1><p class="sub">${session.subtitle || ''}</p>
  <div class="verdict">${VERDICTS[outcome.verdict]?.label || outcome.verdict} &middot; ${outcome.headline}</div>
  <p>${outcome.detail}</p>
  ${rows}
  <p class="meta"><strong>Provenance:</strong> ${provenance}</p>
  <p class="meta"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  <footer>A before/after observation does not by itself establish causation or a general speedup. See the OptiDBX technical report for methodology and limitations.</footer>
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to download the PDF report.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function downloadJson(session, outcome) {
  const report = {
    tool: 'OptiDBX', generated_at: new Date().toISOString(),
    session: { id: session.id, title: session.title, kind: session.kind, category: session.category },
    provenance: session.kind === 'live' ? 'LIVE — real PostgreSQL backend'
      : 'SIMULATED — values seeded from measured runs (docs/optidbx_technical_report.md)',
    outcome,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `optidbx-${session.id}-report.json`; a.click();
  URL.revokeObjectURL(url);
}
