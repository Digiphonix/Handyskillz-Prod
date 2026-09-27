const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules = {}) {
  const context = { exports: {}, require: (name) => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const helpers = load('artifacts/api-server/src/lib/tracking.ts');
const jobId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';

test('coordinates accept boundaries and reject malformed or nonfinite GPS input', () => {
  const good = { latitude: 6.5, longitude: 3.3, accuracy: 8, travelStatus: 'en_route' };
  assert.equal(helpers.validTrackingPosition(good), true);
  assert.equal(helpers.validTrackingPosition({ ...good, latitude: -90, longitude: 180, accuracy: null, travelStatus: 'arrived' }), true);
  for (const patch of [{ latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { longitude: Infinity }, { latitude: '6.5' }, { latitude: null }, { accuracy: -1 }, { accuracy: 100001 }, { travelStatus: 'fake' }]) {
    assert.equal(helpers.validTrackingPosition({ ...good, ...patch }), false);
  }
});

function routeHarness({ job, admin = false, position = null, rpcError = null } = {}) {
  const handlers = {};
  const calls = [];
  const router = { use() {}, get(path, handler) { handlers[`GET ${path}`] = handler; }, post(path, handler) { handlers[`POST ${path}`] = handler; } };
  const db = {
    from(table) {
      calls.push(['from', table]);
      const query = {};
      for (const name of ['select', 'eq', 'gt', 'in', 'not', 'order', 'limit', 'or']) query[name] = (...args) => { calls.push([name, ...args]); return query; };
      const result = { data: table === 'jobs' ? job : table === 'profiles' ? { display_name: 'Provider' } : position, error: null };
      query.maybeSingle = async () => result;
      query.then = (resolve) => Promise.resolve(result).then(resolve);
      return query;
    },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { data: sessionId, error: rpcError }; },
  };
  load('artifacts/api-server/src/routes/tracking.ts', {
    express: { Router: () => router }, '../middlewares/requireAuth': { requireAuth() {} },
    '../lib/supabase': { requireSupabase: () => db }, '../lib/admin': { isPlatformAdmin: async () => admin }, '../lib/tracking': helpers,
  });
  return { calls, async invoke(method, path, userId, body) {
    const res = { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
    await handlers[`${method} ${path}`]({ userId, params: { jobId }, body }, res);
    return res;
  } };
}
const job = { id: jobId, customer_id: 'customer', selected_provider_id: 'provider', status: 'matched', title: 'Repair' };

test('unrelated accounts cannot read tracking or provider coordinates', async () => {
  const h = routeHarness({ job });
  assert.equal((await h.invoke('GET', '/tracking/jobs/:jobId', 'stranger')).code, 404);
  assert.equal(h.calls.some((c) => c[0] === 'from' && c[1] === 'job_tracking'), false);
});
test('only assigned provider receives sharing controls', async () => {
  for (const [userId, admin, canShare] of [['customer', false, false], ['provider', false, true], ['admin', true, false]]) {
    const h = routeHarness({ job, admin, position: { latitude: 0, longitude: 0 } });
    const res = await h.invoke('GET', '/tracking/jobs/:jobId', userId);
    assert.equal(res.code, 200); assert.equal(res.payload.canShare, canShare);
    assert.equal(res.payload.position.latitude, 0);
    assert.ok(h.calls.some((c) => c[0] === 'gt' && c[1] === 'expires_at'));
    assert.ok(h.calls.some((c) => c[0] === 'eq' && c[1] === 'sharing' && c[2] === true));
  }
});
test('closed jobs hide coordinates and cannot be shared', async () => {
  const h = routeHarness({ job: { ...job, status: 'completed' } });
  const res = await h.invoke('GET', '/tracking/jobs/:jobId', 'provider');
  assert.equal(res.payload.position, null); assert.equal(res.payload.canShare, false);
  assert.equal(h.calls.some((c) => c[0] === 'from' && c[1] === 'job_tracking'), false);
});
test('list is participant-scoped except for authorized admin', async () => {
  for (const admin of [false, true]) {
    const h = routeHarness({ admin, job: [] });
    await h.invoke('GET', '/tracking/jobs', 'customer');
    assert.equal(h.calls.some((c) => c[0] === 'or' && c[1] === 'customer_id.eq.customer,selected_provider_id.eq.customer'), !admin);
  }
});
test('invalid updates never reach the database', async () => {
  for (const body of [{ action: 'update', sessionId, latitude: 200 }, { action: 'stop', sessionId: 'invalid' }, { action: 'unknown' }]) {
    const h = routeHarness();
    assert.equal((await h.invoke('POST', '/tracking/jobs/:jobId', 'provider', body)).code, 400);
    assert.equal(h.calls.length, 0);
  }
});
test('authenticated identity overrides client identity and database denial is preserved', async () => {
  const h = routeHarness({ rpcError: { code: '42501', message: 'Only the assigned provider can share location' } });
  const res = await h.invoke('POST', '/tracking/jobs/:jobId', 'stranger', { action: 'start', providerId: 'provider' });
  assert.equal(res.code, 403);
  assert.equal(h.calls[0][2].p_provider_id, 'stranger');
});
test('expired or revoked sharing sessions return conflict', async () => {
  const h = routeHarness({ rpcError: { code: '22023', message: 'Sharing session expired' } });
  const res = await h.invoke('POST', '/tracking/jobs/:jobId', 'provider', { action: 'update', sessionId, latitude: 6.5, longitude: 3.3, accuracy: 10, travelStatus: 'arrived' });
  assert.equal(res.code, 409);
});
