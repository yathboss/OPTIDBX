import {test, expect} from '@playwright/test';

test('real browser reads comparison conflict then starts a manual workload after cancel', async ({page, request}) => {
  test.skip(process.env.OPTIDBX_CONTROLS_LIVE !== '1', 'Requires idle local API and WSL PostgreSQL');
  test.setTimeout(90000);
  let id;
  try {
    await page.goto('/');
  await page.getByText('Advanced controls & live status', {exact:true}).click();
    await page.getByRole('button', {name: 'Results & Reports', exact:true}).click();
  await page.getByText('Performance Evidence: paired comparisons', {exact:true}).click();
    const created = page.waitForResponse(response => response.url().endsWith('/benchmarks/start'));
    await page.getByRole('button', {name:'Start comparison', exact:true}).click();
    const response = await created;
    expect(response.status()).toBe(200);
    ({id} = await response.json());
    await expect(page.getByText('A comparison controls this workload.', {exact:false})).toBeVisible({timeout:12000});
    await expect(page.getByRole('button', {name:'Stop Workload', exact:true})).toBeDisabled();
    // A real cross-origin browser fetch must expose the 409 body, not reject with TypeError.
    const blocked = await page.evaluate(async () => {
      const response = await fetch('http://localhost:8000/tuner/mode', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({mode:'auto'}),
      });
      return {status:response.status, body:await response.json()};
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.detail).toContain('Cancel the comparison');
    await page.getByRole('button', {name:'Cancel active comparison', exact:true}).click();
    await expect(page.getByRole('button', {name:'Start Workload', exact:true})).toBeEnabled({timeout:20000});
    await page.getByLabel('Duration (seconds)', {exact:true}).fill('30');
    await page.getByRole('button', {name:'Start Workload', exact:true}).click();
    await expect(page.getByText('WORKLOAD RUNNING', {exact:true})).toBeVisible({timeout:15000});
    await expect.poll(async () => {
      const workload = await (await request.get('http://localhost:8000/workload/status')).json();
      return workload.completed_queries;
    }, {timeout:10000}).toBeGreaterThan(0);
    await page.getByRole('button', {name:'Stop Workload', exact:true}).click();
    await expect(page.getByRole('button', {name:'Start Workload', exact:true})).toBeEnabled({timeout:20000});
    await expect(page.getByText('Failed to fetch', {exact:true})).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:'../docs/testing/evidence/control-feedback-fixed.png', fullPage:true});
  } finally {
    if (id) {
      await request.post('http://localhost:8000/benchmarks/cancel');
      await expect.poll(async () => {
        const workload = await (await request.get('http://localhost:8000/workload/status')).json();
        return workload.benchmark_id;
      }, {timeout:20000}).toBeNull();
      await request.post('http://localhost:8000/workload/stop');
    }
  }
});
