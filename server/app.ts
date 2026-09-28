import express from 'express';
import { BlendAdapter, validateAddress } from './blend';
import type { ProtocolAdapter } from '../src/model';
export function createApp(makeAdapter: () => ProtocolAdapter = () => new BlendAdapter(), readTimeoutMs = 75000) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.get('/healthz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', service: 'guardian', network: 'Testnet', mode: 'read-only', rpc: 'not-checked' });
  });
  let active = 0;
  app.get('/api/position', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const address = req.query.address;
    try { if (typeof address !== 'string') throw Error('A public address is required.'); validateAddress(address); }
    catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
    if (active >= 3) { res.setHeader('Retry-After', '15'); res.status(429).json({ error: 'Too many reads in progress. Please retry shortly.' }); return; }
    active++;
    // Keep timed-out work counted until it settles, so stalled RPCs cannot exceed the cap.
    const read = Promise.resolve().then(() => makeAdapter().read(address)).finally(() => { active--; });
    const timeoutError = new Error('Read deadline exceeded.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(timeoutError), readTimeoutMs); });
    try { res.json(await Promise.race([read, deadline])); }
    catch (error) {
      if (error === timeoutError) res.status(504).json({ error: 'The testnet read timed out. Please try again later. No sample data was substituted.' });
      else res.status(502).json({ error: 'Testnet data could not be verified. The RPC, pool, position or oracle may be unavailable, archived or unsupported. Retry later. No sample data was substituted.' });
    }
    finally { clearTimeout(timer); }
  });
  app.all('/api/{*path}', (_req, res) => res.status(405).json({ error: 'Only GET /api/position is supported.' }));
  return app;
}
