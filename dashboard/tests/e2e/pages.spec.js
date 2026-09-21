import {test,expect} from '@playwright/test';

async function backend(page) {
  const posts=[];
  await page.route('http://localhost:8000/**',route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()==='OPTIONS') return route.fulfill({status:204});
    if(req.method()==='POST') posts.push(path);
    return route.fulfill({json:path==='/tuner/status'?{state:'MONITORING',mode:'recommendation',telemetry_available:false}
      :path==='/workload/status'?{running:false}
      :path==='/metrics/current'?{os:{cpu_percent:10,memory_percent:25},db:{query_latency_ms:100,throughput_tps:12}}:[]});
  });
  return posts;
}
test('scenario gallery and runner are separate pages with refresh and browser history',async({page})=>{
  const posts=await backend(page);await page.goto('/');
  await page.getByRole('button',{name:'Explore demo scenarios'}).click();
  await expect(page).toHaveURL(/#\/scenarios$/);
  await expect(page.locator('.welcome')).toHaveCount(0);
  await page.locator('.scenario-card').filter({hasText:'CPU / Parallelism Contention'}).click();
  await expect(page).toHaveURL(/#\/scenarios\/[^/]+$/);
  await expect(page.locator('.scenario-grid')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Begin scenario'})).toBeVisible();
  const url=page.url();await page.reload();await expect(page).toHaveURL(url);
  await expect(page.getByRole('button',{name:'Begin scenario'})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(/#\/scenarios$/);
  await page.goForward();await expect(page).toHaveURL(url);
  expect(posts).toEqual([]);
});
test('Performance Study has its own page and is absent from Results & History',async({page})=>{
  await backend(page);await page.goto('/#/results');
  await expect(page.getByRole('heading',{name:'Every session, with its evidence'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Start comparison'})).toHaveCount(0);
  await page.getByRole('link',{name:'Performance Study',exact:true}).click();
  await expect(page).toHaveURL(/#\/performance-study$/);
  await expect(page.getByRole('button',{name:'Start comparison'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Every session, with its evidence'})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('button',{name:'Start comparison'})).toBeVisible();
});
test('stepper connectors stay above every label on desktop and mobile',async({page})=>{
  await backend(page);await page.goto('/#/scenarios');
  await page.locator('.scenario-card').filter({hasText:'CPU / Parallelism Contention'}).click();
  await page.getByRole('button',{name:'Begin scenario'}).click();
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000});
    const geometry=await page.locator('.pipeline-step').evaluateAll(steps=>steps.map(step=>{
      const line=getComputedStyle(step,'::after'),label=step.querySelector('.pipeline-label').getBoundingClientRect(),rect=step.getBoundingClientRect();
      return {hasLine:line.content!=='none',lineBottom:rect.top+parseFloat(line.top)+parseFloat(line.height),labelTop:label.top};
    }));
    expect(geometry.filter(x=>x.hasLine).every(x=>x.lineBottom<x.labelTop)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width===1440 || width===390) await page.screenshot({path:`../docs/testing/evidence/scenario-page-${width}.png`,fullPage:true});
  }
});
test('generated OS and DBMS artwork loads and is labelled as conceptual',async({page})=>{
  await backend(page);await page.goto('/');
  const illustration=page.getByRole('img',{name:/Concept illustration connecting CPU/});
  await expect(illustration).toBeVisible();
  expect(await illustration.evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
  await expect(page.locator('.systems-illustration figcaption')).toContainText('not live measurements');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'../docs/testing/evidence/home-systems-illustration.png',fullPage:true});
  await page.getByRole('link',{name:'Performance Study',exact:true}).click();
  await page.screenshot({path:'../docs/testing/evidence/performance-study-page.png',fullPage:true});
});
test('unknown scenario has a recovery link and live scenario opens real setup',async({page})=>{
  const posts=await backend(page);await page.goto('/#/scenarios/not-a-real-scenario');
  await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();
  await page.getByRole('link',{name:'Browse scenarios'}).click();
  await page.locator('.scenario-card').filter({hasText:'Well-Provisioned Server'}).click();
  await expect(page).toHaveURL(/#\/scenarios\/[^/]+$/);
  await expect(page.getByRole('heading',{name:'Run OptiDBX on the real database'})).toBeVisible();
  expect(posts).toEqual([]);
});
