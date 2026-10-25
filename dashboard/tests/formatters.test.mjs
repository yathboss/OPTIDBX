import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatBytes,
  formatBytesToMB,
  formatPercent,
  formatLatency,
  formatThroughput,
  formatDelta,
  formatTimestamp,
} from '../src/utils/formatters.mjs';

test('formatBytes handles zero and standard metric boundaries', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1048576), '1 MB');
  assert.equal(formatBytes(1073741824), '1 GB');
  assert.equal(formatBytes(1572864), '1.5 MB');
});

test('formatBytes safely handles non-numeric or missing inputs', () => {
  assert.equal(formatBytes(null), 'N/A');
  assert.equal(formatBytes(undefined), 'N/A');
  assert.equal(formatBytes(NaN), 'N/A');
  assert.equal(formatBytes('invalid'), 'N/A');
});

test('formatBytesToMB correctly computes megabyte conversions', () => {
  assert.equal(formatBytesToMB(1048576), '1.0');
  assert.equal(formatBytesToMB(52428800), '50.0');
  assert.equal(formatBytesToMB(0), '0.0');
  assert.equal(formatBytesToMB(null), null);
  assert.equal(formatBytesToMB(undefined), null);
});

test('formatPercent produces clean percentage representations', () => {
  assert.equal(formatPercent(45.289), '45.3%');
  assert.equal(formatPercent(0), '0.0%');
  assert.equal(formatPercent(100), '100.0%');
  assert.equal(formatPercent(null), 'N/A');
  assert.equal(formatPercent(undefined), 'N/A');
  assert.equal(formatPercent(NaN), 'N/A');
});

test('formatLatency handles latency measurements with precision', () => {
  assert.equal(formatLatency(12.3456), '12.35 ms');
  assert.equal(formatLatency(0.5, 1), '0.5 ms');
  assert.equal(formatLatency(null), 'N/A');
});

test('formatThroughput formats transactions per second accurately', () => {
  assert.equal(formatThroughput(1450.75), '1450.8 tps');
  assert.equal(formatThroughput(0), '0.0 tps');
  assert.equal(formatThroughput(null), 'N/A');
});

test('formatDelta produces signed delta percentages', () => {
  assert.equal(formatDelta(15.42), '+15.4%');
  assert.equal(formatDelta(-8.3), '-8.3%');
  assert.equal(formatDelta(0), '0.0%');
  assert.equal(formatDelta(null), null);
  assert.equal(formatDelta(NaN), null);
});

test('formatTimestamp parses valid dates and falls back gracefully', () => {
  const ts = new Date('2026-10-25T12:00:00Z').toISOString();
  const formatted = formatTimestamp(ts);
  assert.notEqual(formatted, 'N/A');
  assert.equal(formatTimestamp(''), 'N/A');
  assert.equal(formatTimestamp(null), 'N/A');
  assert.equal(formatTimestamp('not-a-date'), 'N/A');
});
