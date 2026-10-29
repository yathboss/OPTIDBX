import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPing, getConnectionState } from '../src/utils/connection.mjs';

test('formatPing formats ping latency with rounding', () => {
  assert.equal(formatPing(14.2), '14 ms');
  assert.equal(formatPing(28.8), '29 ms');
  assert.equal(formatPing(0), '0 ms');
  assert.equal(formatPing(null), null);
  assert.equal(formatPing(undefined), null);
  assert.equal(formatPing(NaN), null);
});

test('getConnectionState returns offline status when backend is down', () => {
  const state = getConnectionState(false, false, false);
  assert.equal(state.status, 'offline');
  assert.equal(state.variant, 'error');
  assert.equal(state.badgeClass, 'badge-rose');
  assert.equal(state.isHealthy, false);
  assert.match(state.label, /Offline/);
});

test('getConnectionState returns waiting status when interval is priming', () => {
  const stateWaiting = getConnectionState(true, true, true, 20);
  assert.equal(stateWaiting.status, 'waiting');
  assert.equal(stateWaiting.variant, 'warning');
  assert.equal(stateWaiting.badgeClass, 'badge-amber');
  assert.equal(stateWaiting.isHealthy, true);
  assert.equal(stateWaiting.ping, '20 ms');

  const stateNoTelemetry = getConnectionState(true, false, false, 15);
  assert.equal(stateNoTelemetry.status, 'waiting');
});

test('getConnectionState returns active status when telemetry is flowing', () => {
  const state = getConnectionState(true, false, true, 18.4);
  assert.equal(state.status, 'active');
  assert.equal(state.variant, 'success');
  assert.equal(state.badgeClass, 'badge-green');
  assert.equal(state.isHealthy, true);
  assert.equal(state.ping, '18 ms');
  assert.match(state.label, /Live Telemetry Active/);
});
