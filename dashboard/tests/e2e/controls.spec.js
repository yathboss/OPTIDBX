import { test, expect } from '@playwright/test';

// Simulated HTTP responses exercise browser wiring, not PostgreSQL performance.
async function simulatedApi(page, overrides = {}) {
  let tuner = {mode: 'recommendation', state: 'MONITORING', running: false,
    telemetry_available: false, capabilities: {available: false}, ...overrides};
  let workload = {running: false};
  const requests = [];
  await page.route('http://localhost:8000/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/demo/setup') return route.fulfill({json:{profiles:{LOW:1,MEDIUM:4,HIGH:10},approved_values:[1,2,4,6,8],os:{automatic:false}}});
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204});
    if (request.method() === 'POST') {
      requests.push({path, body: request.postDataJSON()});
      if (path === '/workload/start') {
        workload = {running: true, profile: 'LOW', experiment_id: 42, completed_queries: 12};
        tuner = {...tuner, running: true, capabilities: {available: true}};
      } else if (path === '/workload/stop') {
        workload = {running: false}; tuner = {...tuner, running: false, capabilities: {available: false}};
      } else if (path === '/tuner/mode') tuner.mode = request.postDataJSON().mode;
      else if (path.endsWith('/approve')) tuner = {...tuner, state: 'OBSERVING', recommendation: null};
      else if (path.endsWith('/rollback')) return route.fulfill({status: 409, json: {detail: 'Restore verification failed; recovery remains blocked'}});
    }
    const body = path === '/tuner/status' || path === '/tuner/mode' || path.includes('/actions/') ? tuner
      : path.startsWith('/workload/') ? workload : [];
    return route.fulfill(path === '/metrics/current'
      ? {status: 503, json: {detail: 'Waiting for telemetry'}} : {json: body});
  });
  return requests;
}

test('owned workload start, auto mode, and stop are connected', async ({page}) => {
  const requests = await simulatedApi(page);
  await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
  await expect(page.getByRole('button', {name: 'Auto-Tuning', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Start Workload', exact: true}).click();
  await expect(page.getByText('WORKLOAD RUNNING', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Auto-Tuning', exact: true}).click();
  await expect(page.getByText('auto Mode', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Stop Workload', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Auto-Tuning', exact: true})).toBeDisabled();
  expect(requests.map(r => r.path)).toEqual(['/workload/start', '/tuner/mode', '/workload/stop']);
  expect(requests[0].body).toEqual({profile: 'LOW', duration_seconds: 180});
});

test('manual approval uses current action ID and becomes unavailable during observation', async ({page}) => {
  const requests = await simulatedApi(page, {state: 'RECOMMENDATION_READY', telemetry_available: true,
    capabilities: {available: true}, recommendation: {action_id: 'current-id', new_value: 1}});
  await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
  await page.getByRole('button', {name: 'Apply Recommendation', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Apply Recommendation', exact: true})).toBeDisabled();
  expect(requests[0].path).toBe('/tuner/actions/current-id/approve');
});

test('failed rollback stays explicit and blocks auto mode', async ({page}) => {
  await simulatedApi(page, {state: 'ROLLBACK_FAILED', recovery_required: true,
    capabilities: {available: true}, active_action: {action: {action_id: 'recover-id'}}});
  await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
  await page.getByRole('button', {name: 'Retry Rollback'}).click();
  await expect(page.getByRole('alert').filter({hasText:'Restore verification failed'})).toContainText('Restore verification failed');
  await expect(page.getByRole('button', {name: 'Auto-Tuning', exact: true})).toBeDisabled();
});

test('empty experiment storage never displays invented benchmarks', async ({page}) => {
  await simulatedApi(page);
  await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
  await page.getByRole('button', {name: 'Results & Reports'}).click();
  await expect(page.getByText('No experiments recorded yet.', {exact: false})).toBeVisible();
  await expect(page.getByText('exp-baseline-01')).toHaveCount(0);
});
