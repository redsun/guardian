import test from 'node:test';
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createApp } from '../server/app';
import { REVIEW_ADDRESS } from '../src/config';
import { samplePosition } from '../src/sample';

// Exercise Express routing in memory. No listening socket or external RPC is needed.
function request(app: ReturnType<typeof createApp>, url: string, method = 'GET') {
  return new Promise<{ status: number; body: any; cache: unknown }>((resolve, reject) => {
    const req = new IncomingMessage(new Socket());
    req.method = method; req.url = url;
    const res = new ServerResponse(req);
    res.end = ((body: string) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(body), cache: res.getHeader('Cache-Control') }); }
      catch (error) { reject(error); }
      return res;
    }) as typeof res.end;
    app(req, res);
  });
}

test('missing and malformed addresses return 400 without calling the adapter', async () => {
  let reads = 0;
  const app = createApp(() => ({ read: async () => { reads++; return samplePosition(); } }));
  for (const query of ['', '?address=hello', '?address=G123', '?address=a&address=b']) {
    const response = await request(app, `/api/position${query}`);
    assert.equal(response.status, 400);
    assert.ok(response.body.error);
  }
  assert.equal(reads, 0);
});

test('position response preserves adapter data and disables caching', async () => {
  const fixture = { ...samplePosition(), mode: 'live' as const, address: REVIEW_ADDRESS };
  const app = createApp(() => ({ read: async address => { assert.equal(address, REVIEW_ADDRESS); return fixture; } }));
  const result = await request(app, `/api/position?address=${REVIEW_ADDRESS}`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, fixture);
  assert.equal(result.cache, 'no-store');
});

test('RPC failures return 502 without substituting sample data or exposing internal errors', async () => {
  const app = createApp(() => ({ read: async () => { throw Error('private diagnostic'); } }));
  const response = await request(app, `/api/position?address=${REVIEW_ADDRESS}`);
  assert.equal(response.status, 502);
  assert.match(response.body.error, /No sample data was substituted/);
  assert.doesNotMatch(response.body.error, /private diagnostic/);
  assert.equal(response.body.assets, undefined);
});

test('concurrent reads are bounded and capacity recovers after completion', async () => {
  let resolve!: (value: ReturnType<typeof samplePosition>) => void;
  const pending = new Promise<ReturnType<typeof samplePosition>>(done => { resolve = done; });
  const app = createApp(() => ({ read: () => pending }));
  const url = `/api/position?address=${REVIEW_ADDRESS}`;
  const reads = [request(app, url), request(app, url), request(app, url)];
  assert.equal((await request(app, url)).status, 429);
  resolve(samplePosition());
  assert.ok((await Promise.all(reads)).every(result => result.status === 200));
  assert.equal((await request(app, url)).status, 200);
});

test('write methods are unavailable', async () => {
  const app = createApp();
  assert.equal((await request(app, '/api/position', 'POST')).status, 405);
});

test('health check reports service availability without making a testnet claim or RPC call', async () => {
  let calls = 0;
  const app = createApp(() => { calls++; throw Error('Do not read the chain for health checks.'); });
  const response = await request(app, '/healthz');
  assert.equal(response.status, 200);
  assert.equal(response.body.rpc, 'not-checked');
  assert.equal(response.body.mode, 'read-only');
  assert.equal(response.cache, 'no-store');
  assert.equal(calls, 0);
});

test('read deadlines return 504 while outstanding work remains bounded', async () => {
  let resolve!: (value: ReturnType<typeof samplePosition>) => void;
  const pending = new Promise<ReturnType<typeof samplePosition>>(done => { resolve = done; });
  const app = createApp(() => ({ read: () => pending }), 5);
  const url = `/api/position?address=${REVIEW_ADDRESS}`;
  const responses = await Promise.all([request(app, url), request(app, url), request(app, url)]);
  assert.ok(responses.every(result => result.status === 504 && result.body.assets === undefined));
  assert.equal((await request(app, url)).status, 429);
  resolve(samplePosition());
  await new Promise(done => setImmediate(done));
  assert.equal((await request(app, url)).status, 200);
});

test('adapter failures release capacity for later requests', async () => {
  let calls = 0;
  const app = createApp(() => ({ read: async () => { if (calls++ < 3) throw Error('Unavailable'); return samplePosition(); } }));
  const url = `/api/position?address=${REVIEW_ADDRESS}`;
  assert.ok((await Promise.all([request(app, url), request(app, url), request(app, url)])).every(result => result.status === 502));
  assert.equal((await request(app, url)).status, 200);
});
