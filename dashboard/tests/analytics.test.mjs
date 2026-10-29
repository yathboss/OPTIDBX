import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMetricSeverity,
  computeMovingAverage,
  detectSpillBottleneck,
  calculateMemorySafetyScore,
  summarizeTelemetryTrend,
} from '../src/utils/analytics.mjs';

test('getMetricSeverity evaluates standard higher-is-worse thresholds', () => {
  assert.equal(getMetricSeverity(40, 70, 90), 'normal');
  assert.equal(getMetricSeverity(75, 70, 90), 'warning');
  assert.equal(getMetricSeverity(92, 70, 90), 'critical');
  assert.equal(getMetricSeverity(null, 70, 90), 'normal');
  assert.equal(getMetricSeverity(undefined, 70, 90), 'normal');
});

test('getMetricSeverity evaluates lower-is-worse metrics like throughput', () => {
  assert.equal(getMetricSeverity(1200, 500, 200, true), 'normal');
  assert.equal(getMetricSeverity(450, 500, 200, true), 'warning');
  assert.equal(getMetricSeverity(150, 500, 200, true), 'critical');
});

test('computeMovingAverage produces smoothed telemetry averages', () => {
  const points = [{ val: 10 }, { val: 20 }, { val: 30 }, { val: 40 }, { val: 50 }];
  const ma = computeMovingAverage(points, 'val', 3);
  assert.equal(ma.length, 5);
  assert.equal(ma[0], 10);
  assert.equal(ma[1], 15); // (10+20)/2
  assert.equal(ma[2], 20); // (10+20+30)/3
  assert.equal(ma[3], 30); // (20+30+40)/3
  assert.equal(ma[4], 40); // (30+40+50)/3
});

test('computeMovingAverage handles empty data or invalid inputs gracefully', () => {
  assert.deepEqual(computeMovingAverage([]), []);
  assert.deepEqual(computeMovingAverage(null), []);
  assert.deepEqual(computeMovingAverage([{ val: 'abc' }], 'val', 3), [null]);
});

test('detectSpillBottleneck flags temp disk file spills accurately', () => {
  assert.equal(detectSpillBottleneck(0), false);
  assert.equal(detectSpillBottleneck(500000), false);
  assert.equal(detectSpillBottleneck(1048576), true);
  assert.equal(detectSpillBottleneck(52428800), true);
  assert.equal(detectSpillBottleneck(null), false);
});

test('calculateMemorySafetyScore identifies safe vs high-pressure states', () => {
  const low = calculateMemorySafetyScore(45, 10);
  assert.equal(low.safe, true);
  assert.equal(low.pressure, 'low');

  const mod = calculateMemorySafetyScore(72, 20);
  assert.equal(mod.safe, true);
  assert.equal(mod.pressure, 'moderate');

  const critical = calculateMemorySafetyScore(92, 60);
  assert.equal(critical.safe, false);
  assert.equal(critical.pressure, 'high');
});

test('summarizeTelemetryTrend calculates window percentage change', () => {
  const history = [{ cpu: 50 }, { cpu: 60 }, { cpu: 75 }];
  assert.equal(summarizeTelemetryTrend(history, 'cpu'), '+50.0%');

  const drop = [{ cpu: 80 }, { cpu: 60 }, { cpu: 40 }];
  assert.equal(summarizeTelemetryTrend(drop, 'cpu'), '-50.0%');

  assert.equal(summarizeTelemetryTrend([]), null);
  assert.equal(summarizeTelemetryTrend([{ cpu: 50 }]), null);
  assert.equal(summarizeTelemetryTrend([{ cpu: 0 }, { cpu: 50 }], 'cpu'), null);
});
