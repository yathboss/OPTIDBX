import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, StepForward, RotateCcw, Activity, Search, Wrench, Eye, Scale,
  CheckCircle2, XCircle, MinusCircle, Info, ShieldAlert, Radio,
} from 'lucide-react';
import { SCENARIOS, scenarioById } from '../scenarios.mjs';
import { comparison } from '../actionState.mjs';
import { api } from '../services/api';
import { EvidenceChart } from './SessionRunner';

const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

const VERDICT_META = {
  KEEP: { label: 'Change kept', icon: CheckCircle2, cls: 'keep' },
  ROLLBACK: { label: 'Change reverted', icon: XCircle, cls: 'rollback' },
  NO_ACTION: { label: 'No change required', icon: MinusCircle, cls: 'noaction' },
  RECOMMENDATION: { label: 'Recommendation only', icon: Info, cls: 'recommendation' },
  RECOVERY: { label: 'Recovery engaged', icon: ShieldAlert, cls: 'recovery' },
};

const NODES = [
  { key: 'sample', label: 'Sample', icon: Activity },
  { key: 'detect', label: 'Detect', icon: Search },
  { key: 'apply', label: 'Apply', icon: Wrench },
  { key: 'observe', label: 'Observe', icon: Eye },
  { key: 'decide', label: 'Decide', icon: Scale },
];

/** Illustrative combined net benefit from a CHANGE evidence block. */
function netBenefit(evidence) {
  if (!evidence || evidence.kind !== 'CHANGE') return null;
  const t = evidence.rows.find((r) => /throughput/i.test(r.label));
  const p = evidence.rows.find((r) => /p95|latency/i.test(r.label));
  const tGain = t?.change ?? 0;
  const pImprove = p ? -p.change : 0; // latency drop is the improvement
  const net = round1(tGain + pImprove);
  return { tGain: round1(tGain), pImprove: round1(pImprove), net, regression: !!p && p.change > 10, threshold: 5 };
}

/** Parse "max_parallel_workers_per_gather 8 → 6 kept" → {param, from, to}. */
function parseAction(headline = '') {
  const m = headline.match(/([a-z_]+)\s+(\d+)\s*(?:→|->)\s*(\d+)/i);
  if (m) return { param: m[1], from: m[2], to: m[3] };
  const rev = headline.match(/(\d+)\b/);
  return rev ? { param: 'max_parallel_workers_per_gather', from: null, to: rev[1] } : null;
}

function detectionTape(scenario) {
  if (!scenario.stages.some((s) => s.key === 'detect')) return null;
  if (scenario.id === 'transient-spike') return ['ok', 'hi', 'ok'];
  if (scenario.id === 'well-provisioned') return ['ok', 'ok', 'ok'];
  return ['hi', 'hi', 'hi'];
}

export function exampleModel(scenario) {
  const stage = scenario.stages.find((s) => s.key === 'detect')
    || scenario.stages.find((s) => s.key === 'baseline') || scenario.stages[0];
  const t = stage?.telemetry || {};
  return {
    source: 'example',
    title: scenario.title,
    telemetry: { cpu: t.cpu_percent, workers: t.active_workers, latency: t.query_latency_ms },
    tape: detectionTape(scenario),
    hasApply: scenario.stages.some((s) => s.key === 'apply'),
    hasObserve: scenario.stages.some((s) => s.key === 'observe'),
    evidence: scenario.outcome.evidence,
    verdict: scenario.outcome.verdict,
    detail: scenario.outcome.detail,
    action: parseAction(scenario.outcome.headline),
  };
}

/** Build a CHANGE evidence + model from a real tuner action (live or recorded). */
export function actionModel(action, source, title) {
  const cmp = action ? comparison(action) : null;
  const evidence = cmp ? {
    kind: 'CHANGE',
    label: 'Effect measured on the owned workload',
    rows: [
      { label: 'Owned throughput', unit: 'qps', before: round(cmp.throughput.before), after: round(cmp.throughput.after), betterWhen: 'higher', change: round1(cmp.throughput.delta) },
      { label: 'Owned p95 latency', unit: 'ms', before: round(cmp.latency.before), after: round(cmp.latency.after), betterWhen: 'lower', change: round1(cmp.latency.delta) },
    ],
  } : null;
  const act = action?.action;
  return {
    source,
    title,
    telemetry: {
      cpu: action?.before?.cpu_percent,
      workers: action?.before_owned?.active_workers ?? action?.before?.active_workers,
      latency: cmp?.latency?.before,
    },
    tape: action ? ['hi', 'hi', 'hi'] : null,
    hasApply: !!act,
    hasObserve: !!evidence,
    evidence,
    verdict: action?.outcome || 'NO_ACTION',
    detail: action?.reason || 'No sustained contention was confirmed, so no change was applied.',
    action: act ? { param: act.parameter, from: act.old_value, to: act.new_value } : null,
  };
}

export function buildBeats(model) {
  const beats = [{ phase: 'sample' }];
  if (model.tape) model.tape.forEach((_, i) => beats.push({ phase: 'detect', i }));
  if (model.hasApply) beats.push({ phase: 'apply' });
  if (model.hasObserve) beats.push({ phase: 'observe' });
  beats.push({ phase: 'decide' });
  return beats;
}

// Detection thresholds mirror config/config.yaml → thresholds. Each interval the
// detector threshold-tests every signal; a contention flag needs at least one hot.
const DETECT_SIGNALS = [
  { key: 'cpu', label: 'CPU', unit: '%', limit: 90 },
  { key: 'workers', label: 'Parallel workers', unit: '', limit: 4 },
  { key: 'latency', label: 'p95 latency', unit: 'ms', limit: 200 },
];

// The named algorithms the detector layers to avoid acting on noise.
const DETECT_ALGOS = ['Threshold test', '3-reading confirmation', 'Hysteresis reset', 'Transient-spike filter'];

// The parameter search space the tuner weighs before choosing one safe step.
const TUNING_KNOBS = ['max_parallel_workers_per_gather', 'work_mem', 'effective_cache_size', 'random_page_cost'];

function DetectionCounter({ tape, revealed, telemetry }) {
  // running count over revealed readings
  let count = 0;
  const seq = tape.slice(0, revealed).map((r) => {
    count = r === 'hi' ? count + 1 : 0;
    return { r, count };
  });
  const confirmed = count >= 3;
  return (
    <div className="alg-detect">
      {telemetry && (
        <div className="alg-signals">
          {DETECT_SIGNALS.map((s) => {
            const v = telemetry[s.key];
            const hot = Number.isFinite(v) && v > s.limit;
            return (
              <div key={s.key} className={`alg-signal ${hot ? 'hot' : ''}`}>
                <span className="alg-signal-name">{s.label}</span>
                <span className="alg-signal-val">{Number.isFinite(v) ? Math.round(v) : '—'}{s.unit}</span>
                <span className="alg-signal-cmp">{hot ? '>' : '≤'} {s.limit}{s.unit} {hot ? 'hot' : 'ok'}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="alg-slots">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`alg-slot ${count > i ? 'on' : ''}`}>{count > i ? '✓' : i + 1}</span>
        ))}
        <span className={`alg-confirm ${confirmed ? 'on' : ''}`}>{confirmed ? 'Confirmed' : `${count}/3`}</span>
      </div>
      <div className="alg-readings">
        {seq.map((s, i) => (
          <span key={i} className={`alg-reading ${s.r === 'hi' ? 'hi' : 'ok'}`}>
            {s.r === 'hi' ? 'high' : 'normal'}{s.r === 'ok' && s.count === 0 ? ' · reset' : ''}
          </span>
        ))}
      </div>
      <p className="alg-hint">
        Every interval each signal above is threshold-tested; a bottleneck must then persist for
        <b> three consecutive</b> readings (a single normal reading resets the counter via hysteresis),
        so a transient spike is filtered out before any change is considered.
      </p>
      <div className="alg-algos" aria-label="Detection algorithms">
        {DETECT_ALGOS.map((a) => <span key={a} className="alg-algo">{a}</span>)}
      </div>
    </div>
  );
}

function NetBenefit({ nb, verdict }) {
  if (!nb) return null;
  const pass = nb.net >= nb.threshold && !nb.regression;
  return (
    <div className="alg-net">
      <div className="alg-net-rows">
        <div className="alg-net-row"><span>Δ throughput</span><b className={nb.tGain >= 0 ? 'good' : ''}>{nb.tGain >= 0 ? '+' : ''}{nb.tGain}%</b></div>
        <div className="alg-net-row"><span>p95 improvement</span><b className={nb.pImprove >= 0 ? 'good' : ''}>{nb.pImprove >= 0 ? '+' : ''}{nb.pImprove}%</b></div>
        <div className="alg-net-row total"><span>Combined net</span><b className={pass ? 'good' : ''}>{nb.net >= 0 ? '+' : ''}{nb.net}%</b></div>
      </div>
      <div className="alg-net-scale">
        <div className="alg-scale-track">
          <div className="alg-scale-th" style={{ left: '50%' }}><span>+{nb.threshold}% threshold</span></div>
          <div className={`alg-scale-mark ${pass ? 'good' : 'bad'}`}
            style={{ left: `${Math.max(2, Math.min(98, 50 + nb.net * 2))}%` }} />
        </div>
      </div>
      <p className="alg-net-rule">
        Keep only if combined net clears <b>+{nb.threshold}%</b> with no tail-latency regression beyond <b>10%</b>.
        {nb.regression ? ' Regression guard tripped → revert.' : pass ? ' Cleared → keep.' : ' Below threshold → revert.'}
      </p>
    </div>
  );
}

export default function AlgorithmView() {
  const [source, setSource] = useState('example');
  const [scenarioId, setScenarioId] = useState('cpu-contention');
  const [experiments, setExperiments] = useState([]);
  const [recordId, setRecordId] = useState('');
  const [recordAction, setRecordAction] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('standard');

  // Load experiments for the recorded picker.
  useEffect(() => {
    api.getExperiments?.().then((r) => {
      if (Array.isArray(r?.data)) setExperiments(r.data);
    });
  }, []);

  // Poll live tuner status when bound to a live session.
  useEffect(() => {
    if (source !== 'live') return undefined;
    let cancelled = false;
    const tick = () => api.getTunerStatus().then((r) => { if (!cancelled) setLiveStatus(r?.data || null); });
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [source]);

  // Load a recorded experiment's first action.
  useEffect(() => {
    if (source !== 'recorded' || !recordId) return;
    api.getExperimentDetail(recordId).then((r) => {
      setRecordAction(r?.data?.actions?.[0] || null);
    });
  }, [source, recordId]);

  const model = useMemo(() => {
    if (source === 'example') return exampleModel(scenarioById(scenarioId) || SCENARIOS[0]);
    if (source === 'live') {
      const a = liveStatus?.active_action;
      if (!a && !liveStatus) return null;
      return actionModel(a, 'live', 'Live session');
    }
    if (source === 'recorded') return recordAction ? actionModel(recordAction, 'recorded', `Session #${recordId}`) : null;
    return null;
  }, [source, scenarioId, liveStatus, recordAction, recordId]);

  const beats = useMemo(() => (model ? buildBeats(model) : []), [model]);
  const controllable = source !== 'live';

  // Reset the timeline when the model changes; live follows to the end.
  useEffect(() => {
    setPlaying(false);
    setBeat(controllable ? 0 : Math.max(0, beats.length - 1));
  }, [source, scenarioId, recordId, controllable, beats.length]);

  // Live auto-follows to the latest state.
  useEffect(() => {
    if (source === 'live') setBeat(Math.max(0, beats.length - 1));
  }, [source, beats.length, liveStatus]);

  // Autoplay.
  useEffect(() => {
    if (!playing || !controllable) return undefined;
    if (beat >= beats.length - 1) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setBeat((b) => Math.min(beats.length - 1, b + 1)),
      speed === 'quick' ? 850 : 1500);
    return () => clearTimeout(t);
  }, [playing, beat, beats.length, speed, controllable]);

  const step = useCallback(() => setBeat((b) => Math.min(beats.length - 1, b + 1)), [beats.length]);
  const restart = useCallback(() => { setBeat(0); setPlaying(true); }, []);

  const done = beat >= beats.length - 1;

  return (
    <section className="algorithm-view">
      <p className="section-eyebrow">Algorithm</p>
      <h2 className="section-heading">How the decision is made</h2>
      <p className="section-sub">
        Watch OptiDBX sample telemetry, confirm a bottleneck over three readings, apply one safe step,
        measure the owned workload, and judge the result under the net-benefit rule. Play it on an example,
        or bind it to a live or recorded run.
      </p>

      <div className="alg-controls">
        <div className="alg-source" role="group" aria-label="Source">
          {[['example', 'Example scenario'], ['live', 'Live session'], ['recorded', 'Recorded run']].map(([v, l]) => (
            <button key={v} className={source === v ? 'active' : ''} onClick={() => setSource(v)}>{l}</button>
          ))}
        </div>
        {source === 'example' && (
          <select aria-label="Scenario" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
        {source === 'recorded' && (
          <select aria-label="Recorded run" value={recordId} onChange={(e) => setRecordId(e.target.value)}>
            <option value="">Choose a session…</option>
            {experiments.map((e) => <option key={e.id} value={e.id}>Session #{e.id} · {e.workload_type || '—'}</option>)}
          </select>
        )}
        {controllable && model && (
          <div className="alg-play">
            <button className="btn-secondary" onClick={() => setPlaying((p) => !p)} disabled={done && !playing}>
              {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Play</>}
            </button>
            <button className="btn-secondary" onClick={step} disabled={done}><StepForward size={15} /> Step</button>
            <button className="btn-secondary" onClick={restart}><RotateCcw size={15} /> Restart</button>
            <div className="speed-toggle" role="group" aria-label="Speed">
              {['standard', 'quick'].map((s) => (
                <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
                  {s === 'standard' ? 'Standard' : 'Quick'}</button>
              ))}
            </div>
          </div>
        )}
        {source === 'live' && <span className={`sys-pill ${liveStatus ? 'on' : ''}`}><Radio size={13} /> {liveStatus ? 'Following live' : 'No live session'}</span>}
      </div>

      <AlgorithmVisual
        model={model}
        beat={beat}
        emptyTitle={source === 'live' ? 'No live session to follow' : 'Choose a recorded run'}
        emptyText={source === 'live'
          ? 'Start a Live Session, then return here to watch the algorithm on real data.'
          : 'Pick a session from the dropdown to replay its decision.'}
      />
    </section>
  );
}

/* ---------------------------------------------------------- presentational */

/** Pure flow + stage renderer. Given a decision `model` and how far the timeline
 *  has advanced (`beat`), it draws the five-node flow and the stage panels.
 *  Shared by the standalone page and the inline in-session visualization. */
export function AlgorithmVisual({ model, beat, emptyTitle, emptyText }) {
  const beats = useMemo(() => (model ? buildBeats(model) : []), [model]);
  const b = Math.max(0, Math.min(beat ?? 0, beats.length - 1));
  const reachedPhases = useMemo(() => new Set(beats.slice(0, b + 1).map((x) => x.phase)), [beats, b]);
  const currentPhase = beats[b]?.phase || 'sample';
  const detectRevealed = beats.slice(0, b + 1).filter((x) => x.phase === 'detect').length;
  const nb = netBenefit(model?.evidence);
  const vmeta = model ? VERDICT_META[model.verdict] || VERDICT_META.NO_ACTION : null;

  const nodeState = (key) => {
    const has = key === 'sample' || key === 'decide' || (key === 'detect' && model?.tape)
      || (key === 'apply' && model?.hasApply) || (key === 'observe' && model?.hasObserve);
    if (!has) return 'skipped';
    if (reachedPhases.has(key)) return currentPhase === key ? 'current' : 'done';
    return 'upcoming';
  };

  if (!model) {
    return (
      <div className="empty-state">
        <Search size={26} />
        <h3>{emptyTitle || 'Nothing to visualize yet'}</h3>
        <p>{emptyText || 'Start or select a run to watch the decision unfold.'}</p>
      </div>
    );
  }

  return (
    <>
      {/* flow */}
      <ol className="alg-flow" aria-label="Algorithm flow">
        {NODES.map((n) => {
          const st = nodeState(n.key);
          const Icon = n.icon;
          return (
            <li key={n.key} className={`alg-node ${st}`}>
              <span className="alg-node-dot"><Icon size={15} /></span>
              <span className="alg-node-label">{n.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="alg-stage">
        {/* Sample */}
        <div className={`alg-panel ${currentPhase === 'sample' ? 'live' : ''}`}>
          <h4><Activity size={14} /> Telemetry sample</h4>
          <div className="alg-ticker">
            <div><span>CPU</span><b>{model.telemetry.cpu ?? '—'}%</b></div>
            <div><span>Workers</span><b>{model.telemetry.workers ?? '—'}</b></div>
            <div><span>Latency</span><b>{model.telemetry.latency != null ? `${Math.round(model.telemetry.latency)} ms` : '—'}</b></div>
          </div>
        </div>

        {/* Detect */}
        {model.tape && reachedPhases.has('detect') && (
          <div className={`alg-panel ${currentPhase === 'detect' ? 'live' : ''}`}>
            <h4><Search size={14} /> Detection — multi-signal, three-reading rule</h4>
            <DetectionCounter tape={model.tape} revealed={detectRevealed} telemetry={model.telemetry} />
          </div>
        )}

        {/* Apply */}
        {model.hasApply && reachedPhases.has('apply') && model.action && (
          <div className={`alg-panel ${currentPhase === 'apply' ? 'live' : ''}`}>
            <h4><Wrench size={14} /> Apply — journalled &amp; verified</h4>
            <div className="alg-apply">
              <code>{model.action.param}</code>
              <span className="alg-apply-move">{model.action.from ?? '?'} <b>→</b> {model.action.to}</span>
              <span className="alg-apply-note">written to the recovery journal before any change, then read back to confirm</span>
            </div>
            <div className="alg-knobs" aria-label="Candidate parameters">
              <span className="alg-knobs-label">Weighed knobs</span>
              {TUNING_KNOBS.map((k) => (
                <span key={k} className={`alg-knob ${model.action.param === k ? 'chosen' : ''}`}>{k}</span>
              ))}
            </div>
          </div>
        )}

        {/* Observe */}
        {model.hasObserve && reachedPhases.has('observe') && model.evidence && (
          <div className={`alg-panel ${currentPhase === 'observe' ? 'live' : ''}`}>
            <h4><Eye size={14} /> Observation — owned workload</h4>
            <EvidenceChart evidence={model.evidence} />
          </div>
        )}

        {/* Decide */}
        {reachedPhases.has('decide') && (
          <div className={`alg-panel decide ${vmeta.cls} ${currentPhase === 'decide' ? 'live' : ''}`}>
            <h4><Scale size={14} /> Decision</h4>
            {nb ? <NetBenefit nb={nb} verdict={model.verdict} />
              : <p className="alg-noaction">No change was applied — {model.detail}</p>}
            <div className={`alg-verdict ${vmeta.cls}`}>
              <vmeta.icon size={20} />
              <div><b>{vmeta.label}</b><span>{model.detail}</span></div>
            </div>
            <div className="alg-guards" aria-label="Decision guards">
              <span className="alg-guard">Net-benefit gate ≥ +5%</span>
              <span className="alg-guard">Regression guard &lt; 10%</span>
              <span className="alg-guard">Cooldown before re-tuning</span>
              <span className="alg-guard">One-step rollback</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------- inline in a session */

// Phase ranks unify the scenario/live stage keys with the algorithm's own flow
// nodes, so the inline visual advances in lockstep with the pipeline.
const PHASE_RANK = { sample: 0, baseline: 0, detect: 1, apply: 2, observe: 3, decide: 4, decision: 4 };

function sessionPhaseRank({ isLive, phase, activeStage, stageIndex }) {
  if (phase === 'complete') return 4;
  if (isLive) return Math.min(4, Math.max(0, stageIndex ?? 0));
  if (phase === 'setup') return 0;
  return PHASE_RANK[activeStage?.key] ?? 0;
}

function beatForRank(beats, rank) {
  let idx = 0;
  beats.forEach((bt, i) => { if ((PHASE_RANK[bt.phase] ?? 0) <= rank) idx = i; });
  return idx;
}

/** Model for a live session while it runs: the real action once a verdict lands,
 *  otherwise an in-progress model synthesised from live telemetry and how far the
 *  pipeline has advanced, so the flow still animates before a decision exists. */
function liveInlineModel(live, stageIndex) {
  const status = live?.tunerStatus || {};
  const action = status.active_action;
  if (action && (action.outcome === 'KEEP' || action.outcome === 'ROLLBACK')) {
    return actionModel(action, 'live', 'Live session');
  }
  const m = live?.metrics || {};
  const ev = status.evidence || {};
  const cpu = m.os?.cpu_percent ?? ev.cpu_percent;
  const workers = m.db?.active_workers ?? ev.active_workers;
  const latency = m.db?.query_latency_ms ?? ev.query_latency_ms;
  const idx = Math.max(0, stageIndex ?? 0);
  return {
    source: 'live',
    title: 'Live session',
    telemetry: { cpu: round(cpu), workers, latency },
    tape: idx >= 1 ? ['hi', 'hi', 'hi'] : null,
    hasApply: idx >= 2,
    hasObserve: idx >= 3,
    evidence: null,
    verdict: 'NO_ACTION',
    detail: idx >= 4
      ? 'No sustained contention was confirmed, so no change was applied.'
      : 'Session in progress — following the live pipeline.',
    action: null,
  };
}

/** Reserved, self-driving algorithm visualization embedded inside a running
 *  session. No play controls — it mirrors the session's own progress, for every
 *  scenario and for the live session alike. */
export function SessionAlgorithm({ isLive, phase, activeStage, stageIndex, session, live }) {
  const model = useMemo(
    () => (isLive ? liveInlineModel(live, stageIndex) : exampleModel(session)),
    [isLive, live, stageIndex, session],
  );
  const beats = useMemo(() => (model ? buildBeats(model) : []), [model]);
  const rank = sessionPhaseRank({ isLive, phase, activeStage, stageIndex });
  const beat = beatForRank(beats, rank);

  return (
    <section className="mission-panel algorithm-panel">
      <div className="panel-head">
        <h3>How the decision is being made</h3>
        <span className={`alg-sync-tag ${isLive ? 'live' : ''}`}>
          {isLive ? <><Radio size={12} /> Following this session</> : 'Synced to the run'}
        </span>
      </div>
      <AlgorithmVisual
        model={model}
        beat={beat}
        emptyTitle="Preparing the visualization"
        emptyText="The algorithm view follows this session as it runs."
      />
      <p className="alg-inline-foot">
        This mirrors the exact decision path OptiDBX is taking for this {isLive ? 'live session' : 'scenario'}.
      </p>
    </section>
  );
}
