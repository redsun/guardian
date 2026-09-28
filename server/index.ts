import express from 'express';
import { createServer } from 'node:http';
import { createApp } from './app';
import { runtimeConfig } from './runtime';
const { port, host, production } = runtimeConfig();
const app = createApp();
const httpServer = createServer(app);
app.use('/docs', express.static('docs'));
if (production) app.use(express.static('dist'));
else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
  app.use(vite.middlewares);
}
httpServer.on('error', error => { console.error(`Guardian could not start: ${error.message}`); process.exit(1); });
httpServer.listen(port, host, () => console.log(`Guardian read-only demo listening on ${host}:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
});
