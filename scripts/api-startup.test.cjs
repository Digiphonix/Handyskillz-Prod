const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function start(port) {
  const calls = [], handlers = {};
  let closes = 0;
  const server = { close(cb) { closes++; cb(); } };
  const app = { listen(port, host, cb) { calls.push({ port, host }); cb(); return server; } };
  const process = { env: port === undefined ? {} : { PORT: port }, on(signal, fn) { handlers[signal] = fn; }, exit(code) { calls.push({ exit: code }); } };
  vm.runInNewContext(code, { exports: {}, process, setTimeout, clearTimeout,
    require: (name) => name === './app' ? { __esModule: true, default: app } : { logger: { info() {}, error() {} } },
  });
  return { calls, handlers, get closes() { return closes; } };
}
test('local startup defaults to 3000 and binds all interfaces', () => {
  const result = start();
  assert.equal(result.calls[0].port, 3000);
  assert.equal(result.calls[0].host, '0.0.0.0');
});
test('Render supplied port is respected', () => {
  assert.equal(start('10000').calls[0].port, 10000);
});
test('invalid or out-of-range ports fail before listening', () => {
  for (const value of ['', 'abc', '0', '-1', '65536', '3.5', 'Infinity']) {
    assert.throws(() => start(value), /PORT must be an integer between 1 and 65535/);
  }
});
test('shutdown closes once and exits cleanly', () => {
  const result = start('10000');
  result.handlers.SIGTERM(); result.handlers.SIGINT();
  assert.equal(result.closes, 1);
  assert.equal(result.calls[1].exit, 0);
});
