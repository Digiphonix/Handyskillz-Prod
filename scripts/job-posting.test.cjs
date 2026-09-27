const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(file, results) {
  const handlers = {}, calls = [];
  const router = {};
  for (const method of ['get', 'post']) router[method] = (path, ...functions) => { handlers[`${method} ${path}`] = functions.at(-1); };
  const db = { from(table) {
    calls.push(['from', table]);
    const query = {};
    for (const method of ['select', 'eq', 'or', 'ilike', 'order', 'limit', 'insert', 'in']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
    const resolve = async () => { assert.ok(results.length, 'unexpected database query'); return { data: results.shift(), error: null }; };
    query.single = resolve; query.maybeSingle = resolve; query.then = (a, b) => resolve().then(a, b);
    return query;
  } };
  const modules = { express: { Router: () => router }, '../middlewares/requireAuth': { requireAuth() {} }, '../lib/supabase': { requireSupabase: () => db }, '../lib/admin': { isPlatformAdmin: async () => false }, '../lib/notifications': { createNotification: async () => {} } };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: {}, require: (name) => { assert.ok(modules[name], name); return modules[name]; } });
  return { calls, async run(method, route, extra = {}) {
    const res = { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
    await handlers[`${method} ${route}`]({ userId: 'viewer', query: {}, params: {}, body: {}, ...extra }, res);
    return res;
  } };
}
const jobs = 'artifacts/api-server/src/routes/jobs.ts';
const chats = 'artifacts/api-server/src/routes/conversations.ts';
test('customers and all provider roles can post; ownership comes from auth', async () => {
  for (const role of ['customer', 'artisan', 'professional', 'business']) {
    const h = harness(jobs, [{ role }, { id: 'job1' }]);
    const result = await h.run('post', '/jobs', { body: { title: 'Repair', category: 'Plumbing', description: 'Fix a tap', customer_id: 'spoofed', budgetMinNgn: null, budgetMaxNgn: null } });
    assert.equal(result.code, 201);
    const inserted = h.calls.find((call) => call[0] === 'insert')[1];
    assert.equal(inserted.customer_id, 'viewer'); assert.equal(inserted.status, 'open');
    assert.equal(inserted.budget_min_ngn, null); assert.equal(inserted.budget_max_ngn, null);
  }
});
test('invalid budgets never write a job', async () => {
  for (const budget of [{ budgetMinNgn: -1 }, { budgetMaxNgn: 'bad' }, { budgetMinNgn: 100, budgetMaxNgn: 10 }]) {
    const h = harness(jobs, []);
    assert.equal((await h.run('post', '/jobs', { body: { title: 'Task', description: 'Task description', category: 'Repairs', ...budget } })).code, 400);
    assert.equal(h.calls.length, 0);
  }
});
test('open jobs are visible across customer and provider workspaces', async () => {
  for (const role of ['customer', 'artisan', 'professional', 'business']) {
    const h = harness(jobs, [{ role }, []]);
    assert.equal((await h.run('get', '/jobs', { query: { status: 'open' } })).code, 200);
    assert.equal(h.calls.some((c) => c[0] === 'eq' && c[1] === 'customer_id'), false);
    assert.ok(h.calls.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'open'));
  }
});
test('non-open listings stay restricted to owner or assigned provider', async () => {
  const h = harness(jobs, [{ role: 'artisan' }, []]);
  await h.run('get', '/jobs', { query: { status: 'matched' } });
  assert.ok(h.calls.some((c) => c[0] === 'or' && c[1] === 'customer_id.eq.viewer,selected_provider_id.eq.viewer'));
});
test('provider profile listings contain only that poster’s open jobs', async () => {
  const h = harness(jobs, [{ role: 'customer' }, []]);
  await h.run('get', '/jobs', { query: { postedBy: 'poster' } });
  assert.ok(h.calls.some((c) => c[0] === 'eq' && c[1] === 'customer_id' && c[2] === 'poster'));
  assert.ok(h.calls.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'open'));
});
test('job enquiries reuse the correct private chat among multiple job conversations', async () => {
  const h = harness(chats, [
    { id: 'job1', customer_id: 'poster', selected_provider_id: null, status: 'open' },
    { id: 'poster', role: 'artisan' }, [{ id: 'other' }, { id: 'ours' }],
    [{ conversation_id: 'other', profile_id: 'poster' }, { conversation_id: 'other', profile_id: 'someone' },
      { conversation_id: 'ours', profile_id: 'viewer' }, { conversation_id: 'ours', profile_id: 'poster' }],
  ]);
  const result = await h.run('post', '/conversations', { body: { jobId: 'job1', providerId: 'unrelated' } });
  assert.equal(result.code, 200); assert.equal(result.payload.conversation.id, 'ours');
  assert.equal(h.calls.some((c) => c[0] === 'insert'), false);
  assert.ok(h.calls.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'poster'));
});
test('unrelated users cannot start enquiries for closed jobs', async () => {
  const h = harness(chats, [{ id: 'job1', customer_id: 'poster', selected_provider_id: 'assigned', status: 'completed' }]);
  assert.equal((await h.run('post', '/conversations', { body: { jobId: 'job1' } })).code, 403);
});
