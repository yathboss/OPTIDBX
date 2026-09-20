import {test, expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test('real PostgreSQL pilot records both modes without an improvement claim', async ({page, request}) => {
  test.skip(process.env.OPTIDBX_EVIDENCE_LIVE !== '1', 'Requires local WSL PostgreSQL and idle API');
  test.setTimeout(160000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', {name:'Performance Evidence', exact:true}).click();
  await expect(page.getByRole('button', {name:'Start comparison', exact:true})).toBeEnabled();
  const created = page.waitForResponse(response => response.url().endsWith('/benchmarks/start'));
  await page.getByRole('button', {name:'Start comparison', exact:true}).click();
  const response = await created;
  expect(response.status()).toBe(200);
  const {id} = await response.json();
  let record;
  try {
    await expect.poll(async () => {
      record = await (await request.get(`http://localhost:8000/benchmarks/${id}/export`)).json();
      return ['COMPLETED','FAILED','CANCELLED'].includes(record.status);
    }, {timeout:125000, intervals:[2000]}).toBe(true);
    expect(record.status, record.error).toBe('COMPLETED');
    expect(record.evaluation.verdict).toBe('INCONCLUSIVE');
    expect(record.runs).toHaveLength(2);
    expect(record.runs.map(run => run.mode).sort()).toEqual(['adaptive','baseline']);
    for (const run of record.runs) {
      expect(run.metrics.successful_queries).toBeGreaterThan(0);
      expect(run.metrics.throughput_qps).toBeGreaterThan(0);
      expect(run.metrics.p95_latency_ms).toBeGreaterThan(0);
      expect(run.experiment_id).toBeGreaterThan(0);
      const history = await (await request.get(`http://localhost:8000/metrics/history?experiment_id=${run.experiment_id}`)).json();
      expect(history.length).toBeGreaterThan(0);
    }
    await page.getByRole('button', {name:'Refresh evidence', exact:true}).click();
    await expect(page.getByRole('heading', {name:'Inconclusive', exact:true})).toBeVisible();
    await expect(page.getByRole('cell', {name:'COMPLETED', exact:true})).toHaveCount(2);
    await expect(page.getByText('Insufficient repetitions to estimate uncertainty.', {exact:true})).toHaveCount(2);
    const download = page.waitForEvent('download');
    await page.getByRole('link', {name:'Download CSV', exact:true}).click();
    expect((await download).suggestedFilename()).toBe(`benchmark-${id}.csv`);
    expect(errors).toEqual([]);
    await writeFile('../docs/testing/evidence/performance-evidence-pilot.json', JSON.stringify(record, null, 2));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:'../docs/testing/evidence/performance-evidence-pilot.png', fullPage:true});
  } finally {
    if (!record || ['RUNNING','CANCELLING'].includes(record.status)) {
      await request.post('http://localhost:8000/benchmarks/cancel');
    }
  }
});
