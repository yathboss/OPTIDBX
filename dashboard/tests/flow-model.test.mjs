import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENARIOS, scenarioById } from '../src/scenarios.mjs';
import { FLOW_EDGES, FLOW_NODES, scenarioFlow, liveFlow, flowState } from '../src/flowModel.mjs';

const path = (m) => m.beats.map((b) => b.node);

test('every scenario ends at the terminal matching its verdict, using only real edges', () => {
  const terminal = { KEEP: 'keep', ROLLBACK: 'reverted', NO_ACTION: 'noaction', RECOMMENDATION: 'rec', RECOVERY: 'recovery' };
  for (const s of SCENARIOS) {
    const m = scenarioFlow(s);
    assert.equal(m.beats.at(-1).node, terminal[s.outcome.verdict], s.id);
    for (const b of m.beats) {
      assert.ok(FLOW_NODES[b.node], `${s.id}: unknown node ${b.node}`);
      if (b.via) {
        assert.ok(FLOW_EDGES[b.via], `${s.id}: unknown edge ${b.via}`);
        assert.equal(FLOW_EDGES[b.via].to, b.node, `${s.id}: edge ${b.via} does not lead to ${b.node}`);
      }
    }
  }
});

test('transient spike resets the counter instead of confirming', () => {
  const m = scenarioFlow(scenarioById('transient-spike'));
  assert.ok(!path(m).includes('ladder'));
  const counts = m.beats.filter((b) => b.node === 'count').map((b) => b.counter);
  assert.deepEqual(counts, [1]);
  assert.equal(m.beats.filter((b) => b.node === 'reset').at(-1).title, 'Streak broken: 1 → 0');
});

test('kept change needs three consecutive confirmations before the ladder', () => {
  const m = scenarioFlow(scenarioById('cpu-contention'));
  const p = path(m);
  assert.equal(p.filter((n) => n === 'count').length, 3);
  assert.ok(p.indexOf('ladder') > p.lastIndexOf('confirm'));
  assert.equal(flowState(m, m.beats.length - 1).edges['confirm-sample'], 2);
});

test('recovery scenario marks upstream nodes as having happened earlier', () => {
  const m = scenarioFlow(scenarioById('recovery'));
  assert.equal(m.beats[0].node, 'apply');
  assert.ok(m.prior.includes('ladder'));
  assert.ok(flowState(m, 0).nodes.sample.prior);
});

const sig = (hot) => ({
  cpu_percent: { value: hot ? 95 : 40, threshold: 90, passed: hot },
  context_switches: { value: hot ? 5000 : 900, threshold: 3000, passed: hot },
  active_workers: { value: hot ? 8 : 2, threshold: 4, passed: hot },
  query_latency_ms: { value: hot ? 300 : 80, threshold: 200, passed: hot },
});
const tick = (i, hot, consecutive, extra = {}) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i * 5)).toISOString(),
  signals: sig(hot), candidate: hot, consecutive, required: 3, ...extra,
});

test('live flow follows backend ticks and stops at observation while it is running', () => {
  const m = liveFlow({
    trace: { ticks: [tick(0, false, 0), tick(1, true, 1), tick(2, true, 2), tick(3, true, 3, { recommended: '8→6', old_value: 8, new_value: 6 })] },
    tunerStatus: {
      active_action: { action: { parameter: 'max_parallel_workers_per_gather', old_value: 8, new_value: 6 }, outcome: null },
      observation_remaining_seconds: 12,
    },
  });
  assert.equal(m.source, 'live');
  assert.equal(m.beats.at(-1).node, 'observe');
  assert.match(m.beats.at(-1).title, /12 s left/);
  assert.equal(m.beats.find((b) => b.node === 'ladder').note, '8 → 6');
});

test('live flow without ticks waits at the sample node', () => {
  const m = liveFlow({ trace: { ticks: [] } });
  assert.ok(m.waiting);
  assert.deepEqual(path(m), ['sample']);
});
