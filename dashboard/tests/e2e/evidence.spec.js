import {test, expect} from '@playwright/test';

test('evidence has no invented claims and a pilot remains inconclusive', async ({page}) => {
  let records = [];
  let started;
  await page.route('http://localhost:8000/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/benchmarks/start') {
      started = route.request().postDataJSON();
      records = [{id: 'pilot-id', status: 'COMPLETED', config: started, runs: [],
        started_at: new Date().toISOString(), progress: {phase: 'COMPLETED'},
        evaluation: {verdict: 'INCONCLUSIVE', reason: 'Pilot only: more repeated runs required.', completed_pairs: 1},
        criteria: {minimum_pairs: 5}, manifest: {source: 'REAL_OWNED_WORKLOAD'}}];
      return route.fulfill({json: records[0]});
    }
    if (path === '/benchmarks') return route.fulfill({json: records});
    if (path === '/tuner/status') return route.fulfill({json: {state: 'MONITORING', mode: 'recommendation'}});
    if (path === '/workload/status') return route.fulfill({json: {running: false}});
    return route.fulfill({json: []});
  });
  await page.goto('/');
  await page.getByRole('button', {name: 'Performance Evidence', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Not evaluated', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Start comparison', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Inconclusive', exact: true})).toBeVisible();
  expect(started).toMatchObject({repetitions: 1, measurement_seconds: 30, warmup_seconds: 5});
  await expect(page.getByRole('link', {name: 'Download JSON'})).toHaveAttribute('href', /pilot-id\/export/);
});

test('failed evidence is visible and cancellation is connected', async ({page}) => {
  let cancelled = false;
  await page.route('http://localhost:8000/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/benchmarks/cancel') cancelled = true;
    if (path.startsWith('/benchmarks')) return route.fulfill({json: [{id:'running-id',
      status: cancelled ? 'CANCELLED' : 'RUNNING', config: {repetitions: 5, profile:'HIGH'}, runs:[],
      progress:{phase:cancelled ? 'CANCELLED':'MEASURING',run_number:1,total_runs:10},
      evaluation:{verdict:cancelled ? 'INCONCLUSIVE':'NOT_EVALUATED',reason:cancelled?'Comparison cancelled by user':'No completed comparison yet.'}}]});
    return route.fulfill({json: path === '/tuner/status' ? {state:'MONITORING'} : []});
  });
  await page.goto('/');
  await page.getByRole('button', {name: 'Performance Evidence', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Start comparison', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Cancel comparison', exact: true}).click();
  await expect(page.getByText('Comparison cancelled by user', {exact:true})).toBeVisible();
  expect(cancelled).toBe(true);
});
