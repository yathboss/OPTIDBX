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
// Columns A (terminals left), B (main path), C (side branches). viewBox 920×1130.
const A = 130;
const B = 440;
const C = 750;

export const FLOW_NODES = {
  sample: { x: B, y: 60, shape: 'rect', title: 'Sample telemetry', sub: 'OS + PostgreSQL, every 5 s' },
  test: { x: B, y: 175, shape: 'diamond', title: 'All 4 signals HOT?', sub: 'CPU · ctx sw · workers · latency' },
  count: { x: B, y: 290, shape: 'rect', title: 'Confirmation counter +1', sub: 'consecutive HOT readings' },
  confirm: { x: B, y: 405, shape: 'diamond', title: 'Counter reached 3?', sub: 'sustained, not a blip' },
  ladder: { x: B, y: 520, shape: 'rect', title: 'Pick ONE safe step', sub: 'parallelism ladder 8·6·4·2·1' },
  apply: { x: B, y: 630, shape: 'rect', title: 'Journal → apply → verify', sub: 'owned sessions only' },
  observe: { x: B, y: 740, shape: 'rect', title: 'Observe owned workload', sub: '30 s window · qps + p95' },
  net: { x: B, y: 855, shape: 'diamond', title: 'Net ≥ +5% & no veto?', sub: '1.0·Δqps − 0.5·Δp95' },
  keep: { x: B, y: 970, shape: 'terminal', tone: 'keep', title: 'KEEP the change', sub: 'improvement proven' },
  reset: { x: C, y: 175, shape: 'rect', title: 'Reset counter to 0', sub: 'a normal reading breaks the streak' },
  mem: { x: C, y: 290, shape: 'diamond', title: 'Memory ≥ 85%?', sub: 'out-of-scope pressure' },
  rec: { x: C, y: 405, shape: 'terminal', tone: 'recommendation', title: 'Explain to operator', sub: 'no automatic change' },
  noaction: { x: A, y: 60, shape: 'terminal', tone: 'noaction', title: 'No change required', sub: 'never confirmed' },
  rollback: { x: C, y: 855, shape: 'rect', title: 'Roll back + verify', sub: 'restore original value' },
  verified: { x: C, y: 970, shape: 'diamond', title: 'Rollback verified?', sub: 'read back the setting' },
  reverted: { x: C, y: 1080, shape: 'terminal', tone: 'rollback', title: 'Change REVERTED', sub: 'safe original restored' },
  recovery: { x: B, y: 1080, shape: 'terminal', tone: 'recovery', title: 'Fail-closed RECOVERY', sub: 'actions blocked' },
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
  'sample-test': { from: 'sample', to: 'test', points: [bottom('sample'), top('test')] },
  'test-count': { from: 'test', to: 'count', label: 'Yes', points: [bottom('test'), top('count')] },
  'test-reset': { from: 'test', to: 'reset', label: 'No', points: [right('test'), left('reset')] },
  'count-confirm': { from: 'count', to: 'confirm', points: [bottom('count'), top('confirm')] },
  'confirm-sample': {
    from: 'confirm', to: 'sample', label: 'No → next reading', loop: true, labelAt: [262, 424, 'end'],
    points: [left('confirm'), [270, 405], [270, 112], [400, 112], [400, 89]],
  },
  'confirm-ladder': { from: 'confirm', to: 'ladder', label: 'Yes', points: [bottom('confirm'), top('ladder')] },
  'reset-mem': { from: 'reset', to: 'mem', points: [bottom('reset'), top('mem')] },
  'mem-sample': {
    from: 'mem', to: 'sample', label: 'No → keep sampling', loop: true, labelAt: [718, 50, 'middle'],
    points: [right('mem'), [890, 290], [890, 60], right('sample')],
  },
  'mem-rec': { from: 'mem', to: 'rec', label: 'Yes', points: [bottom('mem'), top('rec')] },
  'sample-noaction': { from: 'sample', to: 'noaction', label: 'session ends', points: [left('sample'), right('noaction')] },
  'ladder-apply': { from: 'ladder', to: 'apply', points: [bottom('ladder'), top('apply')] },
  'apply-observe': { from: 'apply', to: 'observe', points: [bottom('apply'), top('observe')] },
  'observe-net': { from: 'observe', to: 'net', points: [bottom('observe'), top('net')] },
  'net-keep': { from: 'net', to: 'keep', label: 'Yes', points: [bottom('net'), top('keep')] },
  'net-rollback': { from: 'net', to: 'rollback', label: 'No', points: [right('net'), left('rollback')] },
  'rollback-verified': { from: 'rollback', to: 'verified', points: [bottom('rollback'), top('verified')] },
  'verified-reverted': { from: 'verified', to: 'reverted', label: 'Yes', points: [bottom('verified'), top('reverted')] },
  'verified-recovery': {
    from: 'verified', to: 'recovery', label: 'No',
    points: [left('verified'), [610, 970], [610, 1080], right('recovery')],
  },
};

export const FLOW_VIEWBOX = '0 0 920 1130';
