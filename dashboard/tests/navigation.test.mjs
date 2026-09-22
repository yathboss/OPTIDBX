import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeHref, resolveRoute} from '../src/navigation.mjs';

test('all application pages have independent bookmarkable locations',()=>{
  for(const page of ['home','scenarios','algorithm','live','system','results','study']) {
    assert.equal(resolveRoute(routeHref(page)).page,page);
  }
  assert.notEqual(routeHref('results'),routeHref('study'));
  assert.deepEqual(resolveRoute(''),{page:'home'});
});
test('scenario routes survive refresh and encode identifiers',()=>{
  assert.deepEqual(resolveRoute(routeHref('scenario','cpu-contention')),{page:'scenario',scenarioId:'cpu-contention'});
  assert.deepEqual(resolveRoute('#/scenarios/cpu-contention/'),{page:'scenario',scenarioId:'cpu-contention'});
  assert.deepEqual(resolveRoute(routeHref('scenario','a b')),{page:'scenario',scenarioId:'a b'});
});
test('invalid routes do not silently launch another scenario',()=>{
  assert.equal(resolveRoute('#/scenarios/%E0%A4%A').page,'not-found');
  assert.equal(resolveRoute('#/missing').page,'not-found');
  assert.equal(resolveRoute('#/scenarios/a/b').page,'not-found');
  assert.throws(()=>routeHref('missing'));
});
