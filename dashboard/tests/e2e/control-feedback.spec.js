import {test, expect} from '@playwright/test';

test('comparison explains locked controls and cancellation restores manual start', async ({page}) => {
  let owned = true;
  const mutations = [];
  await page.route('http://localhost:8000/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/demo/setup') return route.fulfill({json:{profiles:{LOW:1,MEDIUM:4,HIGH:10},approved_values:[1,2,4,6,8],os:{automatic:false}}});
    if (req.method() === 'OPTIONS') return route.fulfill({status:204});
    if (req.method() === 'POST') {
      mutations.push(path);
      if (path === '/benchmarks/cancel') owned = false;
    }
    const data = path === '/workload/status' ? {running:owned, benchmark_id:owned?'study-1':null,
      profile:'HIGH', duration_seconds:210, experiment_id:23}
      : path === '/tuner/status' ? {state:'MONITORING', mode:'recommendation', running:owned,
        capabilities:{available:owned}, telemetry_available:owned} : [];
    return route.fulfill({json:data});
  });
  await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
  await expect(page.getByText('A comparison controls this workload.', {exact:false})).toBeVisible();
  for (const name of ['Start Workload','Stop Workload','Auto-Tuning','Recommendation Mode','Stop Telemetry Loop']) {
    await expect(page.getByRole('button', {name, exact:true})).toBeDisabled();
  }
  await expect(page.getByLabel('Workload profile', {exact:true})).toHaveValue('HIGH');
  await expect(page.getByLabel('Duration (seconds)', {exact:true})).toHaveValue('210');
  await page.getByRole('button', {name:'Cancel active comparison', exact:true}).click();
  await expect(page.getByRole('button', {name:'Start Workload', exact:true})).toBeEnabled();
  expect(mutations).toEqual(['/benchmarks/cancel']);
});

test('missing workload status cannot falsely enable Start Workload', async ({page}) => {
  await page.route('http://localhost:8000/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/workload/status') return route.fulfill({status:503, json:{detail:'Workload status unavailable'}});
    return route.fulfill({json:path === '/tuner/status' ? {state:'MONITORING'} : []});
  });
  await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
  await expect(page.getByRole('button', {name:'Start Workload', exact:true})).toBeDisabled();
  await expect(page.getByRole('alert').filter({hasText:'Workload status unavailable'})).toContainText('Workload status unavailable');
});
