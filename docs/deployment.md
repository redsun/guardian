# Deploying Guardian

The application requires a Node.js service for `/api/position`. Serve the frontend, documentation, and API from the same origin. Deploying only `dist/` omits the live adapter and the `/docs/` route.

## Render

The repository includes a [Render Blueprint](https://render.com/docs/blueprint-spec) for a Node web service. It selects the free plan and does not provision a database.

1. Push the current source to the repository and check the **Demo checks** workflow.
2. Open [Deploy Guardian to Render](https://render.com/deploy?repo=https://github.com/redsun/guardian), sign in, and select the repository. The shortcut uses `render.yaml` at its root. For a private repository, grant Render's GitHub App access to that repository.
3. Review the generated service configuration and deploy it. The build installs dependencies, runs tests, and builds the frontend and server.
4. Open the URL returned by Render and confirm the service is running.
5. In the repository's Actions tab, select **Verify deployed demo**, click **Run workflow**, and enter the actual public URL. This verifies the sample walkthrough, `/docs/`, `/healthz`, and an invalid address response. Run live verification separately.

The blueprint uses `autoDeployTrigger: checksPass` for subsequent deployments. See [Render's Express deployment guide](https://render.com/docs/deploy-node-express-app).

The setup shortcut is a [Deploy to Render button](https://render.com/docs/deploy-to-render), not a running demo. Confirm that the remote repository contains the latest commit before creating the service.

## Other Node.js hosts

| Setting | Value |
| --- | --- |
| Runtime | Node.js 22 or later |
| Build | `npm ci --include=dev && npm test && npm run build` |
| Start | `npm start` |
| Environment | `NODE_ENV=production`, `HOST=0.0.0.0` |
| Port | Use the provider's `PORT` variable; default is 5173 |
| Health check | `/healthz` |

The frontend is built into `dist/` and the server into `dist-server/`. After building, the running server only needs production dependencies, those two directories, `docs/`, and `package.json`. Run from the repository root. `/healthz` checks the service process; it deliberately does not claim RPC availability.

## Docker

```sh
docker build -t guardian-demo .
docker run --rm -p 5173:5173 guardian-demo
```

The multi-stage image runs as the unprivileged `node` user and contains the production build. It needs outbound HTTPS access to the configured Stellar Testnet RPC. No wallet credentials, private keys, or database are required.

## Browser acceptance against the deployed URL

```sh
npm ci
npx playwright install chromium
DEMO_BASE_URL=https://your-deployed-origin.example npm run test:e2e
```

Set `DEMO_BASE_URL` to the actual deployed origin. The browser suite uses synthetic API fixtures for predictable error and state tests. It is not a live-chain verification suite. It checks the production UI and saves screenshots, traces on failure, and a walkthrough recording under `test-results/`.

## Operational boundaries

The demo accepts up to three concurrent public position reads per process. It returns a timeout after 75 seconds, while keeping outstanding RPC work counted until it settles. This prevents stalled work from bypassing the concurrency cap. The sample experience works without RPC access. If all upstream reads remain stalled, restart the service and investigate RPC availability.

The service exposes read-only position analysis and simulation. It does not provide background monitoring, alerts, wallet connection, or automatic protection.
