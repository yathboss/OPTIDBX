/**
 * Algorithm Visualization Model & Calculation Engine.
 * 
 * Truthful, provable representation of OptiDBX's multi-signal detection rule,
 * single-step parallelism ladder, and net-benefit evaluation formula with vetoes.
 */

import { comparison } from './actionState.mjs';
import { SCENARIOS, scenarioById } from './scenarios.mjs';

export const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
export const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export const DEFAULT_ALLOWED_WORKERS = [1, 2, 4, 6, 8];

export const VERDICT_META = {
  KEEP: { label: 'Change kept', cls: 'keep' },
  ROLLBACK: { label: 'Change reverted', cls: 'rollback' },
  NO_ACTION: { label: 'No change required', cls: 'noaction' },
  RECOMMENDATION: { label: 'Recommendation ready', cls: 'recommendation' },
  RECOVERY: { label: 'Recovery engaged', cls: 'recovery' },
};

export const NODES = [
  { key: 'sample', label: 'Sample' },
  { key: 'detect', label: 'Detect' },
  { key: 'apply', label: 'Apply' },
  { key: 'observe', label: 'Observe' },
  { key: 'decide', label: 'Decide' },
];

/** Return the 4 detection signals mapped against backend thresholds. */
export function getDetectSignals(thresholds = {}) {
  return [
    {
      key: 'cpu_percent',
      label: 'CPU',
      unit: '%',
      limit: thresholds.cpu_high_percent ?? 90,
    },
    {
      key: 'context_switches',
      label: 'Context switches',
      unit: '/int',
      limit: thresholds.context_switches_high_per_interval ?? 3000,
    },
    {
      key: 'active_workers',
      label: 'Parallel workers',
      unit: '',
      limit: thresholds.active_workers_high ?? 4,
    },
    {
      key: 'query_latency_ms',
      label: 'Query latency',
      unit: 'ms',
      limit: thresholds.query_latency_high_ms ?? 200,
    },
  ];
}

/**
 * Real net-benefit calculation using backend weights:
 * net = 1.0 * Δqps - 0.5 * Δp95, with safety veto guards.
 */
export function netBenefit(evidence, storedNet = null, weights = null, vetoes = null, threshold = 5) {
  const wT = weights?.throughput ?? 1.0;
  const wL = weights?.latency ?? 0.5;

  // 1. If real backend stored numbers exist, present them without recalculating
  if (storedNet != null) {
    const t = evidence?.rows?.find((r) => /throughput/i.test(r.label));
    const p = evidence?.rows?.find((r) => /p95|latency/i.test(r.label));
    const tGain = t?.change != null ? round1(t.change) : 0;
    const p95Change = p?.change != null ? round1(p.change) : 0;
    const pass = storedNet >= threshold && (!vetoes || vetoes.every((v) => v.passed));
    return {
      tGain,
      p95Change,
      wT,
      wL,
      net: round1(storedNet),
      pass,
      threshold,
      vetoes: vetoes || [],
      stored: true,
      formulaStr: `net = ${wT}×(${tGain >= 0 ? '+' : ''}${tGain}%) − ${wL}×(${p95Change >= 0 ? '+' : ''}${p95Change}%) = ${storedNet >= 0 ? '+' : ''}${round1(storedNet)}%`,
    };
  }

  // 2. Otherwise derive from CHANGE evidence rows
  if (!evidence || evidence.kind !== 'CHANGE') return null;
  const t = evidence.rows?.find((r) => /throughput/i.test(r.label));
  const p = evidence.rows?.find((r) => /p95|latency/i.test(r.label));
  const tGain = t?.change != null ? round1(t.change) : 0;
  const p95Change = p?.change != null ? round1(p.change) : 0; // positive is latency increase (regression)

  const net = round1(wT * tGain - wL * p95Change);
  const regression = p != null && p95Change >= 10;
  const throughputDrop = tGain <= -10;
  const pass = net >= threshold && !regression && !throughputDrop;

  const derivedVetoes = [
    {
      name: 'latency_cap',
      label: 'Tail latency blowout < +10%',
      passed: !regression,
      value: `${p95Change >= 0 ? '+' : ''}${p95Change}%`,
    },
    {
      name: 'throughput_cap',
      label: 'Throughput regression > -10%',
      passed: !throughputDrop,
      value: `${tGain >= 0 ? '+' : ''}${tGain}%`,
    },
  ];

  return {
    tGain,
    p95Change,
    wT,
    wL,
    net,
    pass,
    threshold,
    vetoes: vetoes && vetoes.length ? vetoes : derivedVetoes,
    stored: false,
    formulaStr: `net = ${wT}×(${tGain >= 0 ? '+' : ''}${tGain}%) − ${wL}×(${p95Change >= 0 ? '+' : ''}${p95Change}%) = ${net >= 0 ? '+' : ''}${net}%`,
  };
}

export function parseAction(headline = '') {
  const m = headline.match(/([a-z_]+)\s+(\d+)\s*(?:→|->)\s*(\d+)/i);
  if (m) return { param: m[1], from: Number(m[2]), to: Number(m[3]) };
  const rev = headline.match(/(\d+)\b/);
  return rev ? { param: 'max_parallel_workers_per_gather', from: null, to: Number(rev[1]) } : null;
}

export function detectionTape(scenario) {
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
    badge: 'SIMULATED · seeded from measured pgbench runs',
    telemetry: {
      cpu_percent: t.cpu_percent,
      context_switches: 4500,
      active_workers: t.active_workers,
      query_latency_ms: t.query_latency_ms,
    },
    tape: detectionTape(scenario),
    hasApply: scenario.stages.some((s) => s.key === 'apply'),
    hasObserve: scenario.stages.some((s) => s.key === 'observe'),
    evidence: scenario.outcome.evidence,
    verdict: scenario.outcome.verdict,
    detail: scenario.outcome.detail,
    action: parseAction(scenario.outcome.headline),
    algorithm: {
      allowed_workers: DEFAULT_ALLOWED_WORKERS,
      keep_policy: 'net_benefit',
      weights: { throughput: 1.0, latency: 0.5 },
      thresholds: { cpu_high_percent: 90, context_switches_high_per_interval: 4000, active_workers_high: 4, query_latency_high_ms: 200 },
      required_consecutive: 3,
    },
  };
}

/** Build model from a recorded action from /tuner/actions or experiments. */
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
  const hasStoredEval = action?.net_percent != null || (Array.isArray(action?.vetoes) && action.vetoes.length > 0);

  return {
    source,
    title,
    badge: source === 'live' ? 'LIVE · computed by backend' : `RECORDED · Session action`,
    telemetry: {
      cpu_percent: action?.before?.cpu_percent,
      context_switches: action?.before?.context_switches,
      active_workers: action?.before_owned?.active_workers ?? action?.before?.active_workers,
      query_latency_ms: cmp?.latency?.before ?? action?.before?.query_latency_ms,
    },
    tape: action ? ['hi', 'hi', 'hi'] : null,
    tapeLabel: action ? 'inferred (3 readings required before any action)' : null,
    hasApply: !!act,
    hasObserve: !!evidence,
    evidence,
    verdict: action?.outcome || 'NO_ACTION',
    detail: action?.reason || 'No sustained contention was confirmed, so no change was applied.',
    action: act ? { param: act.parameter, from: act.old_value, to: act.new_value, actionId: act.action_id } : null,
    storedNet: action?.net_percent ?? null,
    weights: action?.weights ?? { throughput: 1.0, latency: 0.5 },
    vetoes: action?.vetoes ?? null,
    notRecorded: !hasStoredEval && source === 'recorded',
    algorithm: {
      allowed_workers: DEFAULT_ALLOWED_WORKERS,
      keep_policy: action?.keep_policy || 'net_benefit',
      weights: action?.weights || { throughput: 1.0, latency: 0.5 },
    },
    rawRecord: action,
  };
}

/**
 * Builds live model from real backend decision trace ticks, algorithm config,
 * and tuner active action.
 */
export function liveTraceModel(live, traceData, stageIndex = 0) {
  const status = live?.tunerStatus || {};
  const activeAction = status.active_action;
  const traceTicks = traceData?.ticks || [];
  const algorithm = traceData?.algorithm || {
    thresholds: { cpu_high_percent: 90, context_switches_high_per_interval: 3000, active_workers_high: 4, query_latency_high_ms: 200 },
    required_consecutive: 3,
    allowed_workers: DEFAULT_ALLOWED_WORKERS,
    keep_policy: 'net_benefit',
    weights: { throughput: 1.0, latency: 0.5 },
    improvement_percent: 5,
    degradation_percent: 10,
  };

  const thresholds = algorithm.thresholds || {};
  const lastTick = traceTicks.length ? traceTicks[traceTicks.length - 1] : null;

  // Real comparison if action was observed
  const cmp = activeAction ? comparison(activeAction) : null;
  const evidence = cmp ? {
    kind: 'CHANGE',
    label: 'Effect measured on the owned workload',
    rows: [
      { label: 'Owned throughput', unit: 'qps', before: round(cmp.throughput.before), after: round(cmp.throughput.after), betterWhen: 'higher', change: round1(cmp.throughput.delta) },
      { label: 'Owned p95 latency', unit: 'ms', before: round(cmp.latency.before), after: round(cmp.latency.after), betterWhen: 'lower', change: round1(cmp.latency.delta) },
    ],
  } : null;

  const act = activeAction?.action || status.recommendation;
  const hasApply = Boolean(act) || stageIndex >= 2;
  const hasObserve = Boolean(evidence) || stageIndex >= 3;

  const verdict = activeAction?.outcome
    || (status.state === 'RECOMMENDATION_READY' ? 'RECOMMENDATION' : 'NO_ACTION');

  const detail = activeAction?.reason || status.reason
    || (status.state === 'MONITORING'
      ? 'Continuously evaluating multi-signal contention every 5s against thresholds.'
      : 'Live evaluation in progress.');

  const badge = lastTick?.timestamp
    ? `LIVE · computed by backend at ${new Date(lastTick.timestamp).toLocaleTimeString()}`
    : 'LIVE · waiting for first backend tick';

  return {
    source: 'live',
    title: 'Live session',
    badge,
    telemetry: {
      cpu_percent: lastTick?.signals?.cpu_percent?.value ?? live?.metrics?.os?.cpu_percent,
      context_switches: lastTick?.signals?.context_switches?.value ?? live?.metrics?.os?.context_switches,
      active_workers: lastTick?.signals?.active_workers?.value ?? live?.metrics?.db?.active_workers,
      query_latency_ms: lastTick?.signals?.query_latency_ms?.value ?? live?.metrics?.db?.query_latency_ms,
    },
    traceTicks,
    algorithm,
    thresholds,
    consecutive: lastTick?.consecutive ?? status.consecutive_bad_readings ?? 0,
    required: algorithm.required_consecutive ?? 3,
    tape: traceTicks.length ? traceTicks.map((t) => (t.candidate ? 'hi' : 'ok')) : null,
    hasApply,
    hasObserve,
    evidence,
    verdict,
    detail,
    action: act ? {
      param: act.parameter || 'max_parallel_workers_per_gather',
      from: act.old_value,
      to: act.new_value,
      actionId: act.action_id,
    } : null,
    storedNet: activeAction?.net_percent ?? null,
    weights: activeAction?.weights ?? algorithm.weights,
    vetoes: activeAction?.vetoes ?? null,
    lastTick,
    rawTrace: traceData,
    activeAction,
  };
}

export function buildBeats(model) {
  const beats = [{ phase: 'sample' }];
  if (model.tape && model.tape.length) {
    model.tape.forEach((_, i) => beats.push({ phase: 'detect', i }));
  } else if (model.traceTicks && model.traceTicks.length) {
    model.traceTicks.forEach((_, i) => beats.push({ phase: 'detect', i }));
  }
  if (model.hasApply) beats.push({ phase: 'apply' });
  if (model.hasObserve) beats.push({ phase: 'observe' });
  beats.push({ phase: 'decide' });
  return beats;
}
