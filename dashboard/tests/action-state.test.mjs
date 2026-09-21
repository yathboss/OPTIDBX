import assert from 'node:assert/strict';
import test from 'node:test';
import { actionState, comparison } from '../src/actionState.mjs';

test('unbound or stale telemetry never enables apply', () => {
  assert.equal(actionState({}).canApply, false);
  assert.equal(actionState({capabilities: {available: true}, state: 'RECOMMENDATION_READY', recommendation: {action_id: 'x'}}).canApply, false);
});
test('fresh recommendation uses current action ID and rejects duplicate pending request', () => {
  const status = {capabilities: {available: true}, telemetry_available: true, state: 'RECOMMENDATION_READY', recommendation: {action_id: 'x', new_value: 1}};
  assert.equal(actionState(status).canApply, true);
  assert.equal(actionState(status).approveId, 'x');
  assert.equal(actionState(status, true).canApply, false);
});
test('recovery exposes rollback independently of stale telemetry', () => {
  assert.equal(actionState({capabilities: {available: true}, state: 'ROLLBACK_FAILED', active_action: {action: {action_id: 'x'}}}).canRollback, true);
});
test('work_mem recommendation is blocked when memory safety indicates unsafe', () => {
  const status = {
    capabilities: {available: true},
    telemetry_available: true,
    state: 'RECOMMENDATION_READY',
    recommendation: {action_id: 'rec-wm-1', target: 'work_mem', action_type: 'INCREASE_WORK_MEM', new_value: 16},
    memory_safety: {safe_for_memory_increase: false, reason: 'High OS memory pressure (88%)'}
  };
  const state = actionState(status);
  assert.equal(state.canApply, false);
  assert.equal(state.memoryBlocked, true);
  assert.match(state.memoryReason, /High OS memory pressure/);
});
test('work_mem recommendation is enabled when memory safety is safe', () => {
  const status = {
    capabilities: {available: true},
    telemetry_available: true,
    state: 'RECOMMENDATION_READY',
    recommendation: {action_id: 'rec-wm-2', target: 'work_mem', action_type: 'INCREASE_WORK_MEM', new_value: 16},
    memory_safety: {safe_for_memory_increase: true}
  };
  const state = actionState(status);
  assert.equal(state.canApply, true);
  assert.equal(state.memoryBlocked, false);
});
test('cpu action is not blocked by memory safety', () => {
  const status = {
    capabilities: {available: true},
    telemetry_available: true,
    state: 'RECOMMENDATION_READY',
    recommendation: {action_id: 'rec-cpu-1', target: 'max_parallel_workers_per_gather', action_type: 'REDUCE_DB_PARALLELISM', new_value: 6},
    memory_safety: {safe_for_memory_increase: false}
  };
  const state = actionState(status);
  assert.equal(state.canApply, true);
  assert.equal(state.memoryBlocked, false);
});
test('comparison has no fabricated numbers or zero-division percentages', () => {
  assert.equal(comparison(null), null);
  assert.deepEqual(comparison({before: {query_latency_ms: 0}, after: {query_latency_ms: 10}, outcome: 'ROLLBACK'}).latency.delta, null);
});
test('comparison detects WORK_MEM_SPILL and includes tempFilesBytes', () => {
  const action = {
    outcome: 'KEEP',
    action: {action_type: 'INCREASE_WORK_MEM', target: 'work_mem'},
    before: {query_latency_ms: 420, temp_files_bytes: 52428800, memory_percent: 45},
    after: {query_latency_ms: 110, temp_files_bytes: 0, memory_percent: 49}
  };
  const res = comparison(action);
  assert.equal(res.bottleneck, 'WORK_MEM_SPILL');
  assert.equal(res.tempFilesBytes.before, 52428800);
  assert.equal(res.tempFilesBytes.after, 0);
  assert.equal(res.tempFilesBytes.delta, -100);
});

