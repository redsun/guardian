# Testing and verification

## Deterministic checks

```sh
npm ci
npm run check
```

This runs the repository language check, deterministic tests, TypeScript checking, and frontend/server production builds. Tests cover fixed-point risk calculations, 200 conversion comparisons with Blend SDK 3.3.1, price and repayment monotonicity, API routing and errors, concurrency limits, read deadlines, evidence serialization, and runtime settings.

## Browser tests

After building the application:

```sh
npx playwright install chromium
npm run test:e2e
```

To use an installed Chrome browser, set `PLAYWRIGHT_CHANNEL=chrome`. The suite starts the production server and covers desktop/mobile layouts, scenario controls, guided navigation, address lookup states, errors, snapshot export, documentation, and service endpoints. API responses in browser scenarios use fixtures; these tests do not establish live RPC availability.

The HTML report is written to `playwright-report/`. Screenshots, traces on failure, and walkthrough recordings are written to `test-results/`.

To test an existing deployment:

```sh
DEMO_BASE_URL=https://your-deployed-origin.example npm run test:e2e
```

This uses the supplied origin instead of starting a local server. It checks `/healthz`, `/docs/`, static assets, invalid-address handling, and the browser flows. See [deployment](deployment.md) for hosting requirements.

## Live testnet verification

```sh
npm run verify:live
npm run verify:live -- --capture
```

Set `REVIEW_ADDRESS` to select a different public account or contract address. The configured address must have both collateral and debt in the supported pool. A successful capture writes `docs/evidence/testnet-snapshot.json` and `docs/evidence/verification.json`, including the snapshot hash, timestamps, ledger range, and source commit when the checkout is clean.

Live verification rejects synthetic snapshots, missing collateral or debt, and freshness issues. Testnet state changes over time, so a historical capture does not guarantee that a later read will succeed. The [evidence documentation](evidence/README.md) identifies the included capture and its limitations.

## GitHub Actions

| Workflow | Trigger | Checks |
| --- | --- | --- |
| **Demo checks** | Push to `main`, pull request, or manual dispatch | Deterministic checks, production builds, and browser tests. |
| **Verify live testnet position** | Manual dispatch, optional public address | Real testnet read, validation, and evidence capture on success. |
| **Verify deployed demo** | Manual dispatch with a deployed HTTPS origin | Browser and service checks against that deployment. |

Browser artifacts are retained for 14 days; live evidence artifacts are retained for 30 days. A successful workflow result applies to its recorded commit and inputs.

## Recorded evidence

Both runs below tested source commit `c2ac23273a086f757c518a973e5edafa537cdd4c` on 2026-09-27:

- [Demo checks 36310683814](https://github.com/redsun/guardian/actions/runs/36310683814): deterministic checks, builds, and desktop/mobile browser tests passed.
- [Testnet verification 36320485606](https://github.com/redsun/guardian/actions/runs/36320485606): a real position was captured at ledger 4898003, with no freshness issues at capture time. Its raw inputs and provenance report are included in [evidence](evidence/README.md).

These records establish results for that source version at the recorded time. They do not establish a public deployment or verify later changes.
