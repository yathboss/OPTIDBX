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
test('comparison has no fabricated numbers or zero-division percentages', () => {
  assert.equal(comparison(null), null);
  assert.deepEqual(comparison({before: {query_latency_ms: 0}, after: {query_latency_ms: 10}, outcome: 'ROLLBACK'}).latency.delta, null);
});
