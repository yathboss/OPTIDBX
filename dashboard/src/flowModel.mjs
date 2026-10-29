/**
 * Flowchart model for the full-page algorithm visualizer.
 *
 * Turns one incident — a scripted scenario or a live session's real backend
 * decision trace — into the exact path it takes through OptiDBX's decision
 * flowchart, as an ordered list of "beats". Each beat lights one node (and the
 * edge used to reach it) and carries the real numbers behind that step.
 *
 * Scenario beats are SIMULATED (seeded from measured pgbench runs). Live beats
 * are built only from GET /tuner/decision-trace ticks and /tuner/status.
 */

import { comparison } from './actionState.mjs';
import { netBenefit, round1 } from './algorithmModel.mjs';

export const FLOW_DEFAULTS = {
  thresholds: {
    cpu_high_percent: 90,
    context_switches_high_per_interval: 3000,
    active_workers_high: 4,
    query_latency_high_ms: 200,
    memory_high_percent: 85,
  },
  required_consecutive: 3,
  interval_seconds: 5,
  allowed_workers: [1, 2, 4, 6, 8],
  improvement_percent: 5,
  max_latency_regression_percent: 10,
  degradation_percent: 10,
  observation_window_seconds: 30,
};

/* ---------------------------------------------------------------- layout */
// Horizontal layout, read left → right in wrapped rows. viewBox 1440×790.
//   upper lane  : reset → mem → rec (the "not every signal is HOT" branch)
//   DETECT row  : noaction · sample → test → count → confirm
//   ACT row     : ladder → apply → observe → net → keep
//   failure lane: reverted ← verified ← rollback, recovery below verified
const X = [120, 400, 680, 960, 1240];
const UP = 100;
const DETECT = 250;
const ACT = 470;
const FAIL = 620;

export const FLOW_NODES = {
  sample: { x: X[1], y: DETECT, shape: 'rect', title: 'Sample telemetry', sub: 'OS + PostgreSQL, every 5 s' },
  test: { x: X[2], y: DETECT, shape: 'diamond', title: 'All 4 signals HOT?', sub: 'CPU · ctx sw · workers · latency' },
  count: { x: X[3], y: DETECT, shape: 'rect', title: 'Confirmation counter +1', sub: 'consecutive HOT readings' },
  confirm: { x: X[4], y: DETECT, shape: 'diamond', title: 'Counter reached 3?', sub: 'sustained, not a blip' },
  ladder: { x: X[0], y: ACT, shape: 'rect', title: 'Pick ONE safe step', sub: 'parallelism ladder 8·6·4·2·1' },
  apply: { x: X[1], y: ACT, shape: 'rect', title: 'Journal → apply → verify', sub: 'owned sessions only' },
  observe: { x: X[2], y: ACT, shape: 'rect', title: 'Observe owned workload', sub: '30 s window · qps + p95' },
  net: { x: X[3], y: ACT, shape: 'diamond', title: 'Net ≥ +5% & no veto?', sub: '1.0·Δqps − 0.5·Δp95' },
  keep: { x: X[4], y: ACT, shape: 'terminal', tone: 'keep', title: 'KEEP the change', sub: 'improvement proven' },
  reset: { x: X[2], y: UP, shape: 'rect', title: 'Reset counter to 0', sub: 'a normal reading breaks the streak' },
  mem: { x: X[3], y: UP, shape: 'diamond', title: 'Memory ≥ 85%?', sub: 'out-of-scope pressure' },
  rec: { x: X[4], y: UP, shape: 'terminal', tone: 'recommendation', title: 'Explain to operator', sub: 'no automatic change' },
  noaction: { x: X[0], y: DETECT, shape: 'terminal', tone: 'noaction', title: 'No change required', sub: 'never confirmed' },
  rollback: { x: X[3], y: FAIL, shape: 'rect', title: 'Roll back + verify', sub: 'restore original value' },
  verified: { x: X[2], y: FAIL, shape: 'diamond', title: 'Rollback verified?', sub: 'read back the setting' },
  reverted: { x: X[1], y: FAIL, shape: 'terminal', tone: 'rollback', title: 'Change REVERTED', sub: 'safe original restored' },
  recovery: { x: X[2], y: 740, shape: 'terminal', tone: 'recovery', title: 'Fail-closed RECOVERY', sub: 'actions blocked' },
};

export const RECT_W = 210;
export const RECT_H = 58;
export const DIA_W = 100; // half-width
export const DIA_H = 48; // half-height

const top = (n) => [FLOW_NODES[n].x, FLOW_NODES[n].y - (FLOW_NODES[n].shape === 'diamond' ? DIA_H : RECT_H / 2)];
const bottom = (n) => [FLOW_NODES[n].x, FLOW_NODES[n].y + (FLOW_NODES[n].shape === 'diamond' ? DIA_H : RECT_H / 2)];
const left = (n) => [FLOW_NODES[n].x - (FLOW_NODES[n].shape === 'diamond' ? DIA_W : RECT_W / 2), FLOW_NODES[n].y];
const right = (n) => [FLOW_NODES[n].x + (FLOW_NODES[n].shape === 'diamond' ? DIA_W : RECT_W / 2), FLOW_NODES[n].y];

export const FLOW_EDGES = {
  'sample-test': { from: 'sample', to: 'test', points: [right('sample'), left('test')] },
  'test-count': { from: 'test', to: 'count', label: 'Yes', points: [right('test'), left('count')] },
  'test-reset': { from: 'test', to: 'reset', label: 'No', points: [top('test'), bottom('reset')] },
  'count-confirm': { from: 'count', to: 'confirm', points: [right('count'), left('confirm')] },
  'confirm-sample': {
    from: 'confirm', to: 'sample', label: 'No → next reading', loop: true, labelAt: [1232, 322, 'end'],
    points: [bottom('confirm'), [X[4], 330], [X[1], 330], bottom('sample')],
  },
  // Wraps from the end of the DETECT row to the start of the ACT row.
  'confirm-ladder': {
    from: 'confirm', to: 'ladder', label: 'Yes',
    points: [right('confirm'), [1400, DETECT], [1400, 380], [X[0], 380], top('ladder')],
  },
  'reset-mem': { from: 'reset', to: 'mem', points: [right('reset'), left('mem')] },
  'mem-sample': {
    from: 'mem', to: 'sample', label: 'No → keep sampling', loop: true, labelAt: [840, 16, 'middle'],
    points: [top('mem'), [X[3], 24], [X[1], 24], top('sample')],
  },
  'mem-rec': { from: 'mem', to: 'rec', label: 'Yes', points: [right('mem'), left('rec')] },
  'sample-noaction': {
    from: 'sample', to: 'noaction', label: 'session ends', labelAt: [260, 212, 'middle'],
    points: [left('sample'), right('noaction')],
  },
  'ladder-apply': { from: 'ladder', to: 'apply', points: [right('ladder'), left('apply')] },
  'apply-observe': { from: 'apply', to: 'observe', points: [right('apply'), left('observe')] },
  'observe-net': { from: 'observe', to: 'net', points: [right('observe'), left('net')] },
  'net-keep': { from: 'net', to: 'keep', label: 'Yes', points: [right('net'), left('keep')] },
  'net-rollback': { from: 'net', to: 'rollback', label: 'No', points: [bottom('net'), top('rollback')] },
  'rollback-verified': { from: 'rollback', to: 'verified', points: [left('rollback'), right('verified')] },
  'verified-reverted': { from: 'verified', to: 'reverted', label: 'Yes', points: [left('verified'), right('reverted')] },
  'verified-recovery': { from: 'verified', to: 'recovery', label: 'No', points: [bottom('verified'), top('recovery')] },
};

export const FLOW_VIEWBOX = '0 0 1440 790';

// Zone captions, placed in the free corner next to the row they describe.
export const FLOW_ZONES = [
  { x: X[0], y: 96, title: 'DETECT', sub: 'confirm sustained contention' },
  { x: X[0], y: 616, title: 'ACT & VERIFY', sub: 'one step, measured, reversible' },
];

/* --------------------------------------------------------------- helpers */
const SIGNALS = [
  { key: 'cpu_percent', label: 'CPU', unit: '%', th: 'cpu_high_percent' },
  { key: 'context_switches', label: 'Context switches', unit: '/int', th: 'context_switches_high_per_interval' },
  { key: 'active_workers', label: 'Parallel workers', unit: '', th: 'active_workers_high' },
  { key: 'query_latency_ms', label: 'Query latency', unit: 'ms', th: 'query_latency_high_ms' },
];

const fmt = (v, unit = '') => (Number.isFinite(v) ? `${Math.round(v * 10) / 10}${unit}` : '—');
const signed = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v}%` : '—');

/** Evaluate the four signals against thresholds (or take the backend's verdicts). */
function signalChecks(values, thresholds, backendSignals = null) {
  return SIGNALS.map((s) => {
    const b = backendSignals?.[s.key];
    const value = b ? b.value : values?.[s.key];
    const limit = b?.threshold ?? thresholds[s.th];
    const hot = b ? Boolean(b.passed) : Number.isFinite(value) && value >= limit;
    return { key: s.key, label: s.label, unit: s.unit, value, limit, hot };
  });
}

function sampleText(checks) {
  return checks.map((c) => `${c.label} ${fmt(c.value, c.unit)}`).join(' · ');
}

/** Small builder that tracks node annotations as beats are pushed. */
function flowBuilder() {
  const beats = [];
  const ctx = { stage: null };
  // Each beat records the scenario stage it belongs to, so the flowchart can
  // follow a running scenario stage by stage.
  const push = (node, via, info) => beats.push({ node, via: via || null, stage: ctx.stage, ...info });
  const setStage = (stage) => { ctx.stage = stage; };
  return { beats, push, setStage };
}

/** Beats for one telemetry reading entering the detector. */
function readingBeats(push, { checks, counterBefore, counterAfter, required, via, label, memory, memThreshold, memTerminal, invalidated, isLive }) {
  const hot = checks.every((c) => c.hot);
  const nHot = checks.filter((c) => c.hot).length;
  push('sample', via, {
    title: `${label}: telemetry sampled`,
    body: invalidated && checks.every((c) => c.value == null)
      ? `No valid paired OS/DB sample (${invalidated}).`
      : sampleText(checks),
    note: label,
    checks,
  });
  push('test', 'sample-test', {
    title: hot ? 'All four signals are HOT' : `${nHot} of 4 signals HOT — not contention`,
    body: hot
      ? 'CPU, context switches, parallel workers and latency are all at or above their thresholds in the same interval.'
      : `Contention needs all four at once. Failing: ${checks.filter((c) => !c.hot).map((c) => `${c.label} ${fmt(c.value, c.unit)} < ${c.limit}${c.unit}`).join(', ')}.`,
    note: hot ? 'Yes — 4/4 HOT' : `No — ${nHot}/4 HOT`,
    checks,
  });
  if (hot) {
    push('count', 'test-count', {
      title: `Counter ${counterBefore} → ${counterAfter} of ${required}`,
      body: `One more consecutive HOT reading. ${counterAfter < required ? `${required - counterAfter} more needed before anything can change.` : 'The streak is long enough.'}`,
      note: `${counterAfter}/${required}`,
      counter: counterAfter,
    });
    push('confirm', 'count-confirm', {
      title: counterAfter >= required ? 'Bottleneck CONFIRMED' : `Not yet — ${counterAfter}/${required}`,
      body: counterAfter >= required
        ? `${required} consecutive HOT readings: this is sustained CPU/parallelism contention, not a transient spike.`
        : 'Keep sampling. A single normal reading would reset the streak to zero.',
      note: counterAfter >= required ? 'Yes — confirmed' : `No — ${counterAfter}/${required}`,
      counter: counterAfter,
    });
    return counterAfter >= required ? 'confirmed' : 'loop-confirm';
  }
  push('reset', 'test-reset', {
    title: counterBefore > 0 ? `Streak broken: ${counterBefore} → 0` : 'Counter stays at 0',
    body: invalidated || (counterBefore > 0
      ? 'A normal reading interrupted the streak, so the counter resets. This is what filters transient spikes.'
      : 'No streak in progress — nothing to confirm.'),
    note: `${counterBefore} → 0`,
    counter: 0,
  });
  const memHot = Number.isFinite(memory) && memory >= memThreshold;
  push('mem', 'reset-mem', {
    title: memHot ? `Memory ${fmt(memory, '%')} ≥ ${memThreshold}%` : (Number.isFinite(memory) ? `Memory ${fmt(memory, '%')} < ${memThreshold}%` : 'Memory check'),
    body: isLive
      ? 'The live engine only acts on CPU/parallelism contention; memory pressure is never auto-tuned, so sampling continues.'
      : memHot
        ? 'Memory pressure is real, but memory/OS tuning is outside the approved automatic action set.'
        : 'No out-of-scope pressure either. Keep sampling.',
    note: memHot ? 'Yes' : 'No',
  });
  if (memHot && memTerminal) return 'memory';
  return 'loop-mem';
}

/** Beats for the act/observe/decide tail of the flow. */
function actionBeats(push, { setStage = () => {}, action, allowed, evidence, verdict, detail, storedNet, weights, vetoes, threshold, observing, latRegLimit }) {
  setStage('apply');
  push('ladder', 'confirm-ladder', {
    title: action ? `Step ${action.from ?? '?'} → ${action.to}` : 'Choosing a step',
    body: action
      ? `Exactly one step down the allowed ladder [${allowed.join(', ')}] for ${action.param || 'max_parallel_workers_per_gather'} — never a jump.`
      : 'Confirmed contention; the engine picks the next lower value on the allowed ladder.',
    note: action ? `${action.from ?? '?'} → ${action.to}` : '',
    ladder: { allowed, from: action?.from, to: action?.to },
  });
  if (verdict === 'RECOMMENDATION_PENDING') return;
  push('apply', 'ladder-apply', {
    title: 'Journaled, applied, verified',
    body: 'The action is written to the on-disk recovery journal first, applied to the owned sessions only, then the new value is read back to verify it took effect.',
    note: action ? `${action.param ? action.param.replace('max_parallel_workers_per_gather', 'workers/gather') : 'workers/gather'} = ${action.to}` : 'applied',
  });
  const nb = netBenefit(evidence, storedNet, weights, vetoes, threshold);
  setStage('observe');
  if (observing) {
    push('observe', 'apply-observe', {
      title: `Observing… ${Math.ceil(observing)} s left`,
      body: 'Measuring client-side throughput and p95 latency of the owned workload against its own fresh baseline.',
      note: `${Math.ceil(observing)} s left`,
    });
    return;
  }
  push('observe', 'apply-observe', {
    title: 'Observation window complete',
    body: nb
      ? `Owned throughput ${signed(nb.tGain)}, owned p95 latency ${signed(nb.p95Change)} versus the pre-change baseline.`
      : 'The change underperformed during observation.',
    note: nb ? `qps ${signed(nb.tGain)} · p95 ${signed(nb.p95Change)}` : 'underperformed',
    evidence,
  });
  const keep = verdict === 'KEEP';
  setStage('decision');
  push('net', 'observe-net', {
    title: keep ? `Net ${signed(nb?.net)} clears +${threshold}%` : (nb ? `Net ${signed(nb.net)} fails the rule` : 'Rule failed'),
    body: nb
      ? `${nb.formulaStr}. Kept only if net ≥ +${threshold}% and p95 rises less than ${latRegLimit}% and throughput falls less than 10%.`
      : 'The observed effect did not justify the change, so a rollback is requested.',
    note: nb ? `net ${signed(nb.net)}` : 'No',
    nb,
  });
  if (keep) {
    push('keep', 'net-keep', { title: 'Change KEPT', body: detail, note: 'kept', terminal: true });
    return;
  }
  push('rollback', 'net-rollback', {
    title: 'Rolling back',
    body: `Restoring ${action?.param || 'max_parallel_workers_per_gather'} to its original value${action?.from != null ? ` (${action.from})` : ''}.`,
    note: action?.from != null ? `→ ${action.from}` : 'restore',
  });
  if (verdict === 'RECOVERY') {
    push('verified', 'rollback-verified', {
      title: 'Restoration could NOT be verified',
      body: 'The read-back did not confirm the original value, so the system refuses to guess.',
      note: 'No',
    });
    push('recovery', 'verified-recovery', { title: 'Fail-closed recovery', body: detail, note: 'blocked', terminal: true });
    return;
  }
  push('verified', 'rollback-verified', {
    title: 'Original value verified',
    body: 'The setting was read back and matches the pre-change value.',
    note: 'Yes',
  });
  push('reverted', 'verified-reverted', { title: 'Change REVERTED', body: detail, note: 'reverted', terminal: true });
}

/* ------------------------------------------------------- scripted scenario */
export function scenarioFlow(scenario) {
  const th = FLOW_DEFAULTS.thresholds;
  const required = FLOW_DEFAULTS.required_consecutive;
  const stage = (k) => scenario.stages.find((s) => s.key === k)?.telemetry;
  const baseline = stage('baseline');
  const detect = stage('detect');
  const decision = stage('decision');
  const { beats, push, setStage } = flowBuilder();
  const verdict = scenario.outcome.verdict;
  const action = (() => {
    const m = scenario.outcome.headline.match(/([a-z_]+)\s+(\d+)\s*(?:→|->)\s*(\d+)/i);
    if (m) return { param: m[1], from: Number(m[2]), to: Number(m[3]) };
    if (verdict === 'ROLLBACK' || verdict === 'RECOVERY') return { param: 'max_parallel_workers_per_gather', from: 8, to: 6 };
    return null;
  })();
  const prior = [];

  // Which readings reach the detector, in order.
  // `readingStages` says which scenario stage each reading plays during.
  let readings;
  let readingStages;
  if (verdict === 'RECOVERY') { readings = []; readingStages = []; }
  else if (verdict === 'RECOMMENDATION') { readings = [baseline, detect]; readingStages = ['baseline', 'detect']; }
  else if (verdict === 'NO_ACTION') { readings = [baseline, detect, decision]; readingStages = ['baseline', 'detect', 'decision']; }
  else { readings = [detect, detect, detect]; readingStages = ['detect', 'detect', 'detect']; }

  let counter = 0;
  let via = null;
  let ended = null;
  readings.forEach((t, i) => {
    if (ended) return;
    setStage(readingStages[i]);
    const checks = signalChecks(t, th);
    const hot = checks.every((c) => c.hot);
    const after = hot ? Math.min(counter + 1, required) : 0;
    const r = readingBeats(push, {
      checks, counterBefore: counter, counterAfter: after, required, via,
      label: `Reading ${i + 1}`, memory: t?.memory_percent, memThreshold: th.memory_high_percent,
      memTerminal: verdict === 'RECOMMENDATION',
    });
    counter = after;
    if (r === 'confirmed' || r === 'memory') ended = r;
    via = r === 'loop-confirm' ? 'confirm-sample' : 'mem-sample';
  });

  setStage('decision');
  if (ended === 'memory') {
    push('rec', 'mem-rec', { title: 'Surfaced as a recommendation', body: scenario.outcome.detail, note: 'explained', terminal: true });
  } else if (verdict === 'NO_ACTION') {
    push('sample', via, {
      title: 'Session window ended',
      body: `The counter never reached ${required}. No bottleneck was confirmed, so nothing is changed.`,
      note: 'window over',
    });
    push('noaction', 'sample-noaction', { title: 'No change required', body: scenario.outcome.detail, note: 'no action', terminal: true });
  } else {
    if (verdict === 'RECOVERY') prior.push('sample', 'test', 'count', 'confirm');
    actionBeats(push, {
      setStage,
      action,
      allowed: FLOW_DEFAULTS.allowed_workers,
      evidence: scenario.outcome.evidence,
      verdict,
      detail: scenario.outcome.detail,
      threshold: FLOW_DEFAULTS.improvement_percent,
      latRegLimit: FLOW_DEFAULTS.max_latency_regression_percent,
    });
    // The recovery scenario opens at Apply: everything upstream happened earlier.
    if (verdict === 'RECOVERY') {
      beats.shift();
      prior.push('ladder');
      beats[0].via = null;
    }
  }

  return {
    source: 'scenario',
    title: scenario.title,
    subtitle: scenario.subtitle,
    badge: 'SIMULATED · seeded from measured pgbench runs',
    verdict,
    beats,
    prior,
    priorNote: verdict === 'RECOVERY' ? 'This scenario starts after contention was already confirmed (dashed).' : null,
  };
}

/* ------------------------------------------------------------ live session */
export function liveFlow(live, maxTicks = 9) {
  const trace = live?.trace || {};
  const algorithm = { ...FLOW_DEFAULTS, ...(trace.algorithm || {}) };
  const th = { ...FLOW_DEFAULTS.thresholds, ...(algorithm.thresholds || {}) };
  const required = algorithm.required_consecutive ?? 3;
  const status = live?.tunerStatus || {};
  const activeAction = status.active_action || null;
  const ticks = (trace.ticks || []).slice(-maxTicks);
  const { beats, push } = flowBuilder();

  const base = {
    source: 'live',
    title: 'Live session',
    subtitle: 'Real PostgreSQL workload · backend decision trace',
    badge: ticks.length
      ? `LIVE · last backend tick ${new Date(ticks[ticks.length - 1].timestamp).toLocaleTimeString()}`
      : 'LIVE · waiting for the first backend tick',
    prior: [],
  };
  if (!ticks.length) {
    push('sample', null, {
      title: 'Waiting for the first paired sample',
      body: 'The detector starts once the workload is running and a valid OS + PostgreSQL interval is available (every 5 s).',
      note: 'waiting…',
    });
    return { ...base, verdict: null, beats, waiting: true };
  }

  let via = null;
  let counter = 0;
  let confirmedAt = -1;
  for (let i = 0; i < ticks.length; i += 1) {
    const tk = ticks[i];
    const checks = signalChecks(null, th, tk.signals);
    const allHot = checks.every((c) => c.hot);
    // Trust the backend's own verdict for the streak.
    const hot = Boolean(tk.candidate) && allHot;
    const after = tk.consecutive ?? (hot ? counter + 1 : 0);
    const isLast = i === ticks.length - 1;
    const r = readingBeats(push, {
      checks: hot ? checks : checks.map((c) => (tk.candidate === false && allHot ? { ...c, hot: false } : c)),
      counterBefore: hot ? Math.max(0, after - 1) : counter,
      counterAfter: after,
      required,
      via,
      label: new Date(tk.timestamp).toLocaleTimeString(),
      memory: isLast ? live?.metrics?.os?.memory_percent : null,
      memThreshold: th.memory_high_percent ?? 85,
      memTerminal: false,
      invalidated: tk.invalidated,
      isLive: true,
    });
    counter = after;
    via = r === 'loop-confirm' ? 'confirm-sample' : 'mem-sample';
    if (r === 'confirmed') { confirmedAt = i; if (tk.recommended || activeAction) break; via = null; }
  }

  let verdict = null;
  if (confirmedAt >= 0) {
    const tk = ticks[confirmedAt];
    const act = activeAction?.action || status.recommended_action || status.recommendation;
    const action = act
      ? { param: act.parameter, from: act.old_value, to: act.new_value }
      : tk.old_value != null ? { param: 'max_parallel_workers_per_gather', from: tk.old_value, to: tk.new_value } : null;
    if (tk.suppressed_reason && !activeAction) {
      push('ladder', 'confirm-ladder', {
        title: 'Step suppressed', body: tk.suppressed_reason, note: 'suppressed',
        ladder: { allowed: algorithm.allowed_workers, from: tk.old_value, to: null },
      });
    } else if (!activeAction) {
      verdict = 'RECOMMENDATION';
      actionBeats(push, {
        action, allowed: algorithm.allowed_workers, verdict: 'RECOMMENDATION_PENDING',
        threshold: algorithm.improvement_percent, latRegLimit: algorithm.max_latency_regression_percent,
      });
      const last = beats[beats.length - 1];
      last.body += ' Waiting for approval or auto mode before anything is applied.';
    } else {
      const cmp = comparison(activeAction);
      const evidence = cmp ? {
        kind: 'CHANGE',
        rows: [
          { label: 'Owned throughput', change: round1(cmp.throughput.delta) },
          { label: 'Owned p95 latency', change: round1(cmp.latency.delta) },
        ],
      } : null;
      const outcome = status.recovery_required ? 'RECOVERY' : activeAction.outcome;
      const observing = !outcome ? (status.observation_remaining_seconds || 1) : 0;
      verdict = outcome || null;
      actionBeats(push, {
        action,
        allowed: algorithm.allowed_workers,
        evidence,
        verdict: outcome,
        detail: activeAction.reason || status.reason || '',
        storedNet: activeAction.net_percent ?? null,
        weights: activeAction.weights ?? algorithm.weights,
        vetoes: activeAction.vetoes ?? null,
        threshold: algorithm.improvement_percent,
        latRegLimit: algorithm.max_latency_regression_percent,
        observing,
      });
    }
  }

  return { ...base, verdict, beats, algorithm };
}

/* ----------------------------------------------- scenario run synchronisation */
const STAGE_RANK = { baseline: 0, detect: 1, apply: 2, observe: 3, decision: 4 };

/**
 * The beat a running scenario has reached: beats belonging to the current stage
 * are revealed evenly across that stage's duration.
 */
export function scenarioSyncBeat(model, scenario, run) {
  const last = model.beats.length - 1;
  if (!run || run.phase === 'complete') return last;
  if (run.phase !== 'running' || run.stageIndex == null || run.stageIndex < 0) return 0;
  const stages = scenario.stages;
  if (run.stageIndex >= stages.length) return last;
  const mult = run.speedMult || 1;
  let start = 0;
  for (let i = 0; i < run.stageIndex; i += 1) start += (stages[i].durationMs || 0) * mult;
  const dur = (stages[run.stageIndex].durationMs || 1) * mult;
  const frac = Math.min(0.999, Math.max(0, ((run.elapsedMs || 0) - start) / dur));
  const key = stages[run.stageIndex].key;
  const rank = STAGE_RANK[key] ?? 0;
  const inStage = [];
  let before = 0;
  model.beats.forEach((b, i) => {
    const r = STAGE_RANK[b.stage] ?? 0;
    if (b.stage === key) inStage.push(i);
    else if (r < rank) before = i;
  });
  if (!inStage.length) return before;
  return inStage[Math.min(inStage.length - 1, Math.floor(frac * inStage.length))];
}

/* ------------------------------------------------- derived render state */
/** Visit counts and latest per-node annotations up to (and including) beat `b`. */
export function flowState(model, b) {
  const nodes = {};
  const edges = {};
  (model?.prior || []).forEach((n) => { nodes[n] = { visits: 0, prior: true }; });
  (model?.beats || []).slice(0, b + 1).forEach((beat, i) => {
    const n = nodes[beat.node] || { visits: 0 };
    nodes[beat.node] = { ...n, visits: n.visits + 1, note: beat.note ?? n.note, lastBeat: i, prior: false };
    if (beat.via) edges[beat.via] = (edges[beat.via] || 0) + 1;
  });
  const current = model?.beats?.[b] || null;
  return { nodes, edges, current, currentNode: current?.node, currentEdge: current?.via };
}
