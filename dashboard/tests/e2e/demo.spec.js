import {test,expect} from '@playwright/test';

// Controlled API fixtures validate UX, never a real tuning/performance result.
async function fixture(page, options={}) {
  const calls=[];
  let state=options.state || 'MONITORING', running=false;
  const action={experiment_id:9,action:{action_id:'safe-9',parameter:'max_parallel_workers_per_gather',old_value:2,new_value:1},outcome:'ROLLBACK',reason:'Latency degraded.',verified_applied_value:1,verified_restored_value:2,baseline_samples:3,observation_samples:6,before:{query_latency_ms:100,throughput_tps:20,cpu_percent:95,memory_percent:30,disk_read_bytes:0,disk_write_bytes:10},after:{query_latency_ms:120,throughput_tps:18,cpu_percent:90,memory_percent:30,disk_read_bytes:0,disk_write_bytes:10}};
  if(options.owned) Object.assign(action,{evaluation_source:'OWNED_WORKLOAD',keep_policy:'net_benefit',before_owned:{p95_latency_ms:200,qps:10,successful_queries:250},after_owned:{p95_latency_ms:240,qps:8,successful_queries:200},owned_window_seconds:25,baseline_warmup_seconds:15});
  await page.route('http://localhost:8000/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()==='OPTIONS') return route.fulfill({status:204});
    if(req.method()==='POST') {
      calls.push({path,body:req.postDataJSON()});
      if(options.failStart && path==='/workload/start') return route.fulfill({status:409,json:{detail:'Database unavailable: demo could not start'}});
      if(path==='/workload/start') running=true;
      if(path.endsWith('/approve')) state='OBSERVING';
    }
    const tuner={mode:'recommendation',state,running,telemetry_available:true,capabilities:{available:true},recommendation:state==='RECOMMENDATION_READY'?{action_id:'safe-9',old_value:2,new_value:1,reason:'Three readings show contention.'}:null,active_action:options.report?action:null};
    const data=path==='/demo/setup'?{profiles:{LOW:1,MEDIUM:4,HIGH:10},approved_values:[1,2,4,6,8],confirmation_readings:3,baseline_samples:3,observation_seconds:30,cooldown_seconds:30,os:{automatic:false,affinity:true,nice:true,allowed_pids:[]}}
      :path.startsWith('/tuner/')?tuner:path.startsWith('/workload/')?{running,profile:'MEDIUM',experiment_id:9}
      :path==='/experiments/9'?{id:9,status:'completed',workload_type:'MEDIUM',actions:[],aggregate_metrics:{}}
      :path==='/experiments'?[{id:9,status:'completed',workload_type:'MEDIUM'}]:[];
    return route.fulfill({json:data});
  });
  return calls;
}
test('guided start uses recommendation mode and shared workload configuration',async({page})=>{
  const calls=await fixture(page);await page.goto('/');
  await expect(page.getByText('4 owned sessions · 180 seconds')).toBeVisible();
  await page.getByRole('button',{name:'Start demo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Start demo',exact:true})).toBeDisabled();
  await expect.poll(()=>calls.length).toBe(2);
  expect(calls).toEqual([{path:'/tuner/mode',body:{mode:'recommendation'}},{path:'/workload/start',body:{profile:'MEDIUM',duration_seconds:180}}]);
  await expect(page.getByRole('status').filter({hasText:'Demo started'})).toBeVisible();
  await expect(page.getByText('Recommended: keep unchanged')).toBeVisible();
});
test('approval uses safe action ID; observed report supports download and keyboard close',async({page})=>{
  const calls=await fixture(page,{state:'RECOMMENDATION_READY',report:true});await page.goto('/');
  await page.getByRole('button',{name:'Apply & Observe',exact:true}).click();
  expect(calls[0].path).toBe('/tuner/actions/safe-9/approve');
  await expect(page.getByRole('button',{name:'Apply & Observe',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Generate Report',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toContainText('ROLLBACK');
  await expect(dialog).toContainText('20%');await expect(dialog).toContainText('does not establish causation');
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download CSV'}).click();
  expect((await download).suggestedFilename()).toBe('optidbx-9.csv');
  await page.screenshot({path:'../docs/testing/evidence/guided-report-simulated.png'});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('failed start produces an actionable popup without claiming success',async({page})=>{
  await fixture(page,{failStart:true});await page.goto('/');await page.getByRole('button',{name:'Start demo',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Database unavailable');
  await expect(page.getByText('Demo started.',{exact:false})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start demo',exact:true})).toBeEnabled();
});
test('stored no-action run generates an honest report',async({page})=>{
  await fixture(page);await page.goto('/');await page.getByRole('button',{name:'Results & Reports',exact:true}).click();
  await page.getByRole('button',{name:'View run 9',exact:true}).click();await page.getByRole('button',{name:'Generate Report',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('No tuning action was recorded');
});
test('print uses the full report outside the scrollable dialog',async({page})=>{
  await fixture(page,{report:true});await page.goto('/');
  await page.getByRole('button',{name:'Generate Report',exact:true}).click();
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.print-export')).toBeVisible();
  await expect(page.locator('.report-dialog')).toBeHidden();
  await expect(page.locator('.print-export')).toContainText('Tuning observation report');
  await expect(page.locator('.print-export')).toContainText('Scope & limitations');
});
test('owned-workload decisions show their actual p95 and QPS in the card and report',async({page})=>{
  await fixture(page,{report:true,owned:true});await page.goto('/');
  await expect(page.getByRole('cell',{name:'Owned p95 latency (ms)',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Generate Report',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('OWNED_WORKLOAD');
  await expect(dialog).toContainText('250 before / 200 after');
  await expect(dialog.getByRole('row').filter({hasText:'Owned query p95 latency'})).toContainText('240');
  await expect(dialog.getByRole('row').filter({hasText:'Owned throughput'})).toContainText('-20%');
});
test('navigation stays horizontal and readable on desktop and mobile',async({page})=>{
  await fixture(page);await page.goto('/');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    const tops=await page.getByRole('navigation').locator('button').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'../docs/testing/evidence/guided-demo-simulated.png',fullPage:true});
});
