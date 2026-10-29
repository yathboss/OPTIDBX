import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeCSVField,
  exportTelemetryToCSV,
  exportTuningHistoryToCSV,
  exportTelemetryToJSON,
  downloadFile,
} from '../src/utils/exportTelemetry.mjs';

test('escapeCSVField properly handles delimiters and quotes', () => {
  assert.equal(escapeCSVField('hello'), 'hello');
  assert.equal(escapeCSVField('hello, world'), '"hello, world"');
  assert.equal(escapeCSVField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCSVField('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeCSVField(null), '');
  assert.equal(escapeCSVField(undefined), '');
});

test('exportTelemetryToCSV formats headers and data rows correctly', () => {
  const emptyCsv = exportTelemetryToCSV([]);
  assert.match(emptyCsv, /^timestamp,cpu_percent,memory_percent/);
  assert.equal(emptyCsv.split('\n').length, 1);

  const sampleHistory = [
    {
      timestamp: '2026-10-25T12:00:00Z',
      cpu_percent: 74.5,
      memory_percent: 42.1,
      throughput_tps: 850.2,
      query_latency_ms: 15.4,
      disk_read_bytes: 1048576,
      disk_write_bytes: 2097152,
      temp_files_bytes: 0,
      active_connections: 8,
    },
  ];

  const csv = exportTelemetryToCSV(sampleHistory);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /2026-10-25T12:00:00Z,74.5,42.1,850.2,15.4/);
});

test('exportTuningHistoryToCSV formats tuning decision records', () => {
  const empty = exportTuningHistoryToCSV([]);
  assert.match(empty, /^action_id,timestamp,knob/);

  const tuningActions = [
    {
      action_id: 'act-001',
      timestamp: '2026-10-25T12:10:00Z',
      action: {
        target: 'work_mem',
        action_type: 'INCREASE_WORK_MEM',
        old_value: 4,
        new_value: 16,
        bottleneck: 'WORK_MEM_SPILL',
      },
      outcome: 'KEEP',
      reason: 'Reduced temp disk spill to 0MB',
    },
  ];

  const csv = exportTuningHistoryToCSV(tuningActions);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /act-001,2026-10-25T12:10:00Z,work_mem,INCREASE_WORK_MEM,4,16,KEEP,WORK_MEM_SPILL/);
});

test('exportTelemetryToJSON generates valid JSON with metadata', () => {
  const data = [{ cpu_percent: 50 }];
  const jsonStr = exportTelemetryToJSON(data, { experiment_id: 'exp-v1' });
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.system, 'OptiDBX Safe V1 Autotuner');
  assert.equal(parsed.count, 1);
  assert.equal(parsed.metadata.experiment_id, 'exp-v1');
  assert.ok(parsed.exportDate);
  assert.equal(parsed.records.length, 1);
});

test('downloadFile returns false in non-browser environment safely', () => {
  assert.equal(downloadFile('test.csv', 'data'), false);
});
