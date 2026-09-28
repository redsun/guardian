import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfig } from '../server/runtime';

test('development stays local; production accepts platform traffic and its assigned port', () => {
  assert.deepEqual(runtimeConfig({}), { host: '127.0.0.1', port: 5173, production: false });
  assert.deepEqual(runtimeConfig({ NODE_ENV: 'production', PORT: '10000' }), { host: '0.0.0.0', port: 10000, production: true });
  assert.equal(runtimeConfig({ NODE_ENV: 'production', HOST: '127.0.0.1' }).host, '127.0.0.1');
});

test('invalid platform ports fail with a clear message', () => {
  for (const PORT of ['', '0', '-1', '1.5', '65536', 'abc']) assert.throws(() => runtimeConfig({ PORT }), /PORT must/);
});
