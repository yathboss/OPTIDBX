import { test, expect } from '@playwright/test';

test('real WSL PostgreSQL workload and persisted evaluation', async ({page, request}) => {
  test.skip(process.env.OPTIDBX_LIVE !== '1', 'Requires initialized local PostgreSQL and API');
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
  await page.getByRole('button', {name: 'Start Workload', exact: true}).click();
  try {
    await expect(page.getByText('WORKLOAD RUNNING', {exact: true})).toBeVisible();
    await expect(page.getByText('Live Telemetry Active', {exact: true})).toBeVisible({timeout: 25000});
    await page.getByRole('button', {name: 'Auto-Tuning', exact: true}).click();
    await expect(page.getByText('auto Mode', {exact: true})).toBeVisible();
    const status = await (await request.get('http://localhost:8000/workload/status')).json();
    expect(status.completed_queries).toBeGreaterThan(0);
    await page.screenshot({path: '../docs/testing/evidence/v1-live-dashboard.png', fullPage: true});
    await page.getByRole('button', {name: 'Stop Workload', exact: true}).click();
    await expect(page.getByText('WORKLOAD STOPPED', {exact: true})).toBeVisible({timeout: 20000});
    await page.getByRole('button', {name: 'Results & Reports'}).click();
    await page.getByRole('button', {name: `View run ${status.experiment_id}`, exact: true}).click();
    await expect(page.getByRole('heading', {name: `Run #${status.experiment_id}: BASELINE`})).toBeVisible();
    const history = await (await request.get(`http://localhost:8000/metrics/history?experiment_id=${status.experiment_id}`)).json();
    expect(history.length).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: '../docs/testing/evidence/v1-live-evaluation.png', fullPage: true});
    const runs = await (await request.get('http://localhost:8000/experiments')).json();
    for (const run of runs.filter(run => run.workload_type === 'HIGH')) {
      const detail = await (await request.get(`http://localhost:8000/experiments/${run.id}`)).json();
      const evaluated = detail.actions?.find(action => action.after && action.outcome);
      if (!evaluated) continue;
      await page.getByRole('button', {name: `View run ${run.id}`, exact: true}).click();
      await expect(page.getByRole('heading', {name: `Observation result: ${evaluated.outcome}`})).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({path: '../docs/testing/evidence/v1-live-comparison.png', fullPage: true});
      break;
    }
  } finally {
    await request.post('http://localhost:8000/workload/stop');
  }
});
