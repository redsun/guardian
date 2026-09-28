import { test, expect } from '@playwright/test';

test('deployed service responds without claiming the chain was verified', async ({ request }) => {
  const health = await request.get('/healthz');
  expect(health.status()).toBe(200);
  expect(health.headers()['content-type']).toContain('application/json');
  expect(await health.json()).toMatchObject({ status: 'ok', service: 'guardian', mode: 'read-only', rpc: 'not-checked' });

  // This intentionally invalid address must fail before making any RPC requests.
  const invalid = await request.get('/api/position?address=not-a-stellar-address');
  expect(invalid.status()).toBe(400);
  expect(invalid.headers()['cache-control']).toBe('no-store');
  expect((await invalid.json()).error).toContain('valid public Stellar');
});

test('documentation and favicon are served by the deployed application', async ({ request }) => {
  const docs = await request.get('/docs/');
  expect(docs.status()).toBe(200);
  expect(docs.headers()['content-type']).toContain('text/html');
  expect(await docs.text()).toContain('Understand the numbers.');

  const favicon = await request.get('/favicon.svg');
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
});
