const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'demo/browser-api.js'), 'utf8');
const base = 'https://example.test/shiguang-study-tracker/';
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }

function browser({ store = new Map(), instant = '2026-10-24T16:30:00Z', offset = -480, blocked = false } = {}) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    getTimezoneOffset() { return offset; }
    static now() { return new RealDate(instant).getTime(); }
  }
  const forwarded = [];
  const context = {
    Date: FixedDate, Response, URL, URLSearchParams, Blob, Set, Map, setTimeout,
    window: { fetch: async input => {
      forwarded.push(String(input));
      if (String(input) === base + 'static/lessons.json') {
        return new Response(fs.readFileSync(path.join(root, 'frontend/lessons.json'), 'utf8'));
      }
      return new Response('{}', {status: 418});
    } },
    document: { baseURI: base, readyState: 'complete', addEventListener() {}, getElementById() { return null; } },
    location: { href: base, origin: new URL(base).origin },
    localStorage: {
      getItem(key) { if (blocked) throw new Error('blocked'); return store.get(key) || null; },
      setItem(key, value) { if (blocked) throw new Error('blocked'); store.set(key, String(value)); },
      removeItem(key) { store.delete(key); }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, {timeout: 3000});
  return {
    store, forwarded,
    async call(endpoint, method = 'GET', body) {
      const response = await context.window.fetch('./api' + endpoint, {
        method, body: body === undefined ? undefined : JSON.stringify(body)
      });
      return {status: response.status, body: response.status === 204 ? null : await response.json()};
    },
    fetch: context.window.fetch
  };
}

async function run() {
  // Date validation must work across devices and Beijing midnight, independent of host time.
  for (const offset of [0, -480, 300]) {
    const tab = browser({offset});
    equal((await tab.call('/health')).body.today, '2026-10-25');
  }
  for (const [instant, today] of [
    ['2026-10-24T15:59:59Z', '2026-10-24'],
    ['2026-10-24T16:00:00Z', '2026-10-25'],
    ['2026-10-25T15:59:59Z', '2026-10-25'],
    ['2026-10-25T16:00:00Z', '2026-10-26']
  ]) equal((await browser({instant}).call('/health')).body.today, today);

  const tab = browser();
  equal((await tab.call('/records')).body.length, 8);
  equal((await tab.call('/lessons')).body.length, 28);
  equal(tab.forwarded[0], base + 'static/lessons.json');
  const plan = {name: '独立演示计划', start_date: '2026-10-20', days: 14, target_minutes: 30};
  const createdPlan = await tab.call('/plans', 'POST', plan);
  equal(createdPlan.status, 201);
  const id = createdPlan.body.id;
  const record = {plan_id: id, study_date: '2026-10-25', topic: '  =1+1', minutes: 30,
    takeaway: '第一行,含逗号\n第二行含"引号"', next_step: '继续测试', shared: true};
  const created = await tab.call('/records', 'POST', record);
  equal(created.status, 201);
  equal((await tab.call('/records', 'POST', record)).status, 409);
  equal((await tab.call('/records', 'POST', {...record, study_date: '2026-10-26'})).status, 422);
  equal((await tab.call('/records', 'POST', {...record, minutes: true})).status, 422);
  equal((await tab.call('/records', 'POST', {...record, unexpected: 1})).status, 422);
  equal((await tab.call('/records', 'POST', {...record, study_date: '2026-02-30'})).status, 422);
  equal((await tab.call('/records', 'POST', {...record, study_date: '2026-10-19'})).status, 422);
  equal((await tab.call('/stats?plan_id=' + id)).body.minutes, 30);
  equal((await tab.call('/plans/' + id, 'DELETE')).status, 409);
  equal((await tab.call('/plans/' + id, 'PUT', {...plan, start_date: '2026-10-26'})).status, 409);
  equal((await tab.call('/records?plan_id=' + id)).body.length, 1);

  // A second plan on the same day increases minutes, without increasing unique days twice.
  equal((await tab.call('/records', 'POST', {...record, plan_id: 1, minutes: 45})).status, 201);
  equal((await tab.call('/stats')).body.days, 9);
  equal((await tab.call('/stats?plan_id=' + id)).body.days, 1);

  const csv = await (await tab.fetch('./api/export.csv?plan_id=' + id)).text();
  assert(csv.includes("'=1+1")); checks++;
  assert(csv.includes('"第一行,含逗号\n第二行含""引号"""')); checks++;
  equal((await tab.call('/export.csv?plan_id=999')).status, 404);

  // Reloading preserves this visitor's edits, another visitor gets an independent seeded store.
  equal((await browser({store: tab.store}).call('/records')).body.length, 10);
  equal((await browser().call('/records')).body.length, 8);
  equal((await browser({blocked: true}).call('/health')).status, 503);
  equal((await browser({store: new Map([['shiguang.pages.demo.v1', 'invalid json']])}).call('/health')).status, 503);
  equal((await tab.fetch('https://other.test/shiguang-study-tracker/api/health')).status, 418);

  equal((await tab.call('/records/' + created.body.id, 'PUT', {...record, minutes: 60})).status, 200);
  equal((await tab.call('/stats?plan_id=' + id)).body.minutes, 60);
  equal((await tab.call('/records/' + created.body.id, 'DELETE')).status, 204);
  equal((await tab.call('/plans/' + id, 'DELETE')).status, 204);

  // GitHub project sites have a path prefix, so all generated assets must remain relative.
  const output = path.join(root, '.site');
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"\s]+)"/g)].map(match => match[1]);
  for (const asset of assets) assert(fs.existsSync(path.join(output, asset)), asset);
  assert(html.indexOf('browser-api.js') < html.indexOf('static/app.js')); checks++;
  assert(!html.includes('="/static/')); checks++;
  assert(!fs.readFileSync(path.join(output, 'static/app.js'), 'utf8').includes("fetch('/api")); checks++;
  console.log(`${checks} demo behavior and deployment checks passed`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
