import assert from 'node:assert/strict';
import test from 'node:test';
import {
  netBenefit,
  getDetectSignals,
  liveTraceModel,
  actionModel,
  exampleModel,
} from '../src/algorithmModel.mjs';

test('netBenefit computes 1.0 * throughput - 0.5 * latency with real weights', () => {
  const evidence = {
    kind: 'CHANGE',
    rows: [
      { label: 'Owned throughput', change: 10.0 },
      { label: 'Owned p95 latency', change: 2.0 },
    ],
  };
  // net = 1.0 * 10 - 0.5 * 2 = 9.0% >= 5% -> pass
  const res = netBenefit(evidence);
  assert.equal(res.net, 9.0);
  assert.equal(res.pass, true);
  assert.equal(res.wT, 1.0);
  assert.equal(res.wL, 0.5);
});

test('netBenefit rejects tail-latency blowout >= 10% regardless of throughput gain', () => {
  const evidence = {
    kind: 'CHANGE',
    rows: [
      { label: 'Owned throughput', change: 40.0 },
      { label: 'Owned p95 latency', change: 12.0 }, // blowout >= 10%
    ],
  };
  const res = netBenefit(evidence);
  assert.equal(res.pass, false);
  const latVeto = res.vetoes.find((v) => v.name === 'latency_cap');
  assert.equal(latVeto.passed, false);
});

test('netBenefit uses stored backend numbers when available without recomputing', () => {
  const evidence = {
    kind: 'CHANGE',
    rows: [
      { label: 'Owned throughput', change: 5.0 },
      { label: 'Owned p95 latency', change: 1.0 },
    ],
  };
  const storedVetoes = [
    { name: 'errors', label: 'Error rate did not increase', passed: true },
    { name: 'latency_cap', label: 'Tail latency < +10%', passed: true },
  ];
  const res = netBenefit(evidence, 4.2, { throughput: 1.0, latency: 0.5 }, storedVetoes, 5);
  assert.equal(res.stored, true);
  assert.equal(res.net, 4.2);
  assert.equal(res.pass, false); // 4.2 < 5
  assert.deepEqual(res.vetoes, storedVetoes);
});

test('getDetectSignals returns all 4 signals with configured thresholds', () => {
  const sigs = getDetectSignals({
    cpu_high_percent: 85,
    context_switches_high_per_interval: 3500,
    active_workers_high: 6,
    query_latency_high_ms: 150,
  });
  assert.equal(sigs.length, 4);
  assert.equal(sigs[0].key, 'cpu_percent');
  assert.equal(sigs[0].limit, 85);
  assert.equal(sigs[1].key, 'context_switches');
  assert.equal(sigs[1].limit, 3500);
  assert.equal(sigs[2].key, 'active_workers');
  assert.equal(sigs[2].limit, 6);
  assert.equal(sigs[3].key, 'query_latency_ms');
  assert.equal(sigs[3].limit, 150);
});

test('liveTraceModel creates live model from backend trace ticks', () => {
  const trace = {
    ticks: [
      {
        timestamp: '2026-01-01T12:00:00Z',
        candidate: true,
        consecutive: 1,
        required: 3,
        signals: {
          cpu_percent: { value: 92, threshold: 90, passed: true },
          context_switches: { value: 4200, threshold: 4000, passed: true },
          active_workers: { value: 5, threshold: 4, passed: true },
          query_latency_ms: { value: 210, threshold: 200, passed: true },
        },
      },
    ],
    algorithm: {
      required_consecutive: 3,
      allowed_workers: [1, 2, 4, 6, 8],
    },
  };
  const model = liveTraceModel({ tunerStatus: {} }, trace, 1);
  assert.equal(model.source, 'live');
  assert.match(model.badge, /LIVE/);
  assert.equal(model.traceTicks.length, 1);
  assert.equal(model.consecutive, 1);
  assert.equal(model.telemetry.cpu_percent, 92);
});

test('actionModel notes unrecorded evaluations for older runs without back-filling', () => {
  const legacyAction = {
    action: { parameter: 'max_parallel_workers_per_gather', old_value: 8, new_value: 6 },
    outcome: 'KEEP',
    before: { cpu_percent: 80 },
    after: { cpu_percent: 70 },
  };
  const model = actionModel(legacyAction, 'recorded', 'Legacy Run');
  assert.equal(model.notRecorded, true);
  assert.equal(model.storedNet, null);
  assert.equal(model.tapeLabel, 'inferred (3 readings required before any action)');
});

test('getDetectSignals uses default fallback of 3000 for context switches', () => {
  const sigs = getDetectSignals({});
  const ctx = sigs.find((s) => s.key === 'context_switches');
  assert.equal(ctx.limit, 3000);
});

test('liveTraceModel shows waiting badge when no ticks yet', () => {
  const model = liveTraceModel({ tunerStatus: {} }, { ticks: [] }, 0);
  assert.equal(model.badge, 'LIVE · waiting for first backend tick');
  assert.equal(model.algorithm.thresholds.context_switches_high_per_interval, 3000);
});

