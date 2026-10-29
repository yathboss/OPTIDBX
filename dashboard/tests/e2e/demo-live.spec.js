import {test,expect} from '@playwright/test';

test('real guided workload and report from stored PostgreSQL evidence',async({page,request})=>{
  test.skip(process.env.OPTIDBX_DEMO_LIVE!=='1','Requires idle WSL PostgreSQL and API');
  test.setTimeout(90000);
  const initial=await (await request.get('http://localhost:8000/workload/status')).json();
  expect(initial.running).toBe(false);expect(initial.benchmark_id).toBeFalsy();
  let started=false;
  try {
    await page.goto('/');await page.getByLabel('Demo workload').selectOption('LOW');
    await page.getByRole('button',{name:'Start demo',exact:true}).click();started=true;
    await expect.poll(async()=> (await (await request.get('http://localhost:8000/workload/status')).json()).completed_queries,{timeout:20000}).toBeGreaterThan(0);
    await expect(page.getByText('Live Telemetry Active',{exact:true})).toBeVisible({timeout:20000});
    await page.screenshot({path:'../docs/testing/evidence/guided-demo-live.png',fullPage:true});
    await page.getByRole('button',{name:'Stop demo',exact:true}).click();
    await expect(page.getByRole('button',{name:'Start demo',exact:true})).toBeEnabled({timeout:20000});
    // Report real, previously stored observations without asserting a new tuning benefit.
    const runs=await (await request.get('http://localhost:8000/experiments')).json();
    let measured;
    for(const run of runs) {
      const detail=await (await request.get(`http://localhost:8000/experiments/${run.id}`)).json();
      if(detail.actions?.some(a=>a.after && a.verified_restored_value!==undefined)){measured=detail;break;}
    }
    expect(measured).toBeTruthy();
    await page.getByRole('button',{name:'Results & Reports',exact:true}).click();
    await page.getByRole('button',{name:`View run ${measured.id}`,exact:true}).click();
    await page.getByRole('button',{name:'Generate Report',exact:true}).first().click();
    await expect(page.getByRole('dialog')).toContainText('Verified restored value: 2');
    await expect(page.getByRole('dialog')).toContainText('ROLLBACK');
    await page.screenshot({path:'../docs/testing/evidence/guided-report-live.png'});
    await page.pdf({path:'../docs/testing/evidence/guided-report-live.pdf',format:'A4',printBackground:true});
  } finally {if(started) await request.post('http://localhost:8000/workload/stop');}
});
