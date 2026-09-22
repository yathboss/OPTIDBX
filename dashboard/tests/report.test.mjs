import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReport, reportCsv, phaseIndex} from '../src/demoModel.mjs';

test('report keeps measurements, verification and provenance without claiming causation', () => {
  const action = {action:{action_id:'a',old_value:2,new_value:1}, experiment_id:7,
    outcome:'ROLLBACK', verified_applied_value:1, verified_restored_value:2,
    before:{query_latency_ms:100,throughput_tps:10,cpu_percent:0},
    after:{query_latency_ms:120,throughput_tps:8,cpu_percent:2}};
  const report = buildReport({actions:[action],id:7,status:'completed'});
  assert.equal(report.actions[0].metrics[0].percent,20);
  assert.equal(report.actions[0].metrics[2].percent,null);
  assert.match(report.limitations.join(' '), /causation/);
  action.after.query_latency_ms = 1;
  assert.equal(report.actions[0].metrics[0].after,120);
  assert.equal(report.actions[0].verified_restored_value,2);
});
test('no action and missing metrics remain explicit; CSV is safe for spreadsheet text', () => {
  assert.equal(buildReport({id:1,actions:[]}).actions.length,0);
  const report=buildReport({id:2,actions:[{action:{action_id:'=CMD()'}, outcome:'ROLLBACK_FAILED',before:{},after:{}}]});
  assert.equal(report.actions[0].metrics[0].after,null);
  assert.match(reportCsv(report), /'=CMD\(\)/);
  assert.match(reportCsv(report), /ROLLBACK_FAILED/);
});
test('lifecycle maps to honest steps, including blocked recovery', () => {
  assert.equal(phaseIndex('MONITORING',false),0);
  assert.equal(phaseIndex('MONITORING',true),1);
  assert.equal(phaseIndex('RECOMMENDATION_READY',true),2);
  assert.equal(phaseIndex('OBSERVING',true),4);
  assert.equal(phaseIndex('ROLLBACK_FAILED',true),5);
});

test('owned decisions report owned p95/QPS rather than misleading database averages', () => {
  const report=buildReport({actions:[{evaluation_source:'OWNED_WORKLOAD',before:{query_latency_ms:999,throughput_tps:999},after:{query_latency_ms:1,throughput_tps:2000},before_owned:{p95_latency_ms:100,qps:10},after_owned:{p95_latency_ms:120,qps:8}}]});
  assert.equal(report.actions[0].metrics[0].before,100);
  assert.equal(report.actions[0].metrics[0].percent,20);
  assert.equal(report.actions[0].metrics[1].after,8);
  assert.match(report.actions[0].metrics[1].unit,/owned/);
  const missing=buildReport({actions:[{evaluation_source:'OWNED_WORKLOAD',before:{query_latency_ms:123},after:{query_latency_ms:100}}]});
  assert.equal(missing.actions[0].metrics[0].before,null);
});
