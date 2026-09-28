# Guardian

A read-only position risk analysis prototype for Stellar and Blend V2. Explore collateral, debt, price declines, and hypothetical repayments using a built-in sample or a public position in the supported testnet pool.

[Usage](docs/reviewer-guide.md) · [Methodology](docs/index.html) · [Testing](docs/verification.md) · [Deployment](docs/deployment.md)

## Features

- Position dashboard with collateral, debt, savings, borrowing capacity usage, and effective margin.
- Price shock controls, repayment simulation, health factor comparisons, and stress tests.
- Public address lookup for one configured Blend V2 pool on Stellar Testnet.
- Explicit states for stale data, failed reads, debt-free positions, and invalid inputs.
- Inspectable calculation inputs and JSON snapshot export.
- Responsive layouts and keyboard-accessible controls.

## Getting started

Requires Node.js 22 or later. From the repository root:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The default experience uses synthetic sample data and requires no wallet or funds.

For a production build:

```sh
npm run build
npm start
```

Development listens on localhost. Production listens on `0.0.0.0` and respects the `PORT` environment variable, defaulting to 5173. Set `HOST=127.0.0.1` to restrict a production process to localhost.

## Using the sample

Select **1. Starting position**, then use **Next step** to explore a 20% XLM price decline and a hypothetical 200 USDC repayment. The displayed health factors are 1.200, 0.960, and 1.152 respectively. Each step loads synthetic data; no transaction is sent.

Change the price or repayment amount to explore other scenarios. Use **View an address** to read a public testnet position, or **Data & sources** to inspect and export the inputs. See the [usage guide](docs/reviewer-guide.md) for details.

## Testing

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs the repository language check, deterministic tests, type checking, and production builds. Browser tests cover desktop and mobile flows using API fixtures. Run `npm run verify:live` separately to check the configured testnet position.

See [testing and verification](docs/verification.md) for commands, coverage, and CI workflows. A historical testnet snapshot and its source metadata are available in [docs/evidence](docs/evidence/README.md).

## Deployment

Guardian requires a Node.js service for its frontend, documentation, and read-only API. The repository includes `render.yaml` and a `Dockerfile`; see the [deployment guide](docs/deployment.md) for setup and service checks. A frontend-only deployment does not include the live adapter.

## Repository layout

```text
src/                 Application UI, sample data, and fixed-point risk calculations
server/              Read-only Blend adapter, API, and server runtime
scripts/             Repository checks and live evidence capture
.github/workflows/   CI and on-demand verification
docs/               Usage, methodology, deployment, and verification evidence
tests/              Risk, API, runtime, and browser tests
```

## Scope and limitations

This prototype supports read-only analysis and simulation. Wallet connection, background alerts, protection contracts, automatic repayments, and mainnet are not implemented. Testnet oracles use mock prices. Separate RPC reads do not form an atomic snapshot of a single ledger, and simulation results do not guarantee execution or liquidation prevention.

Calculations reference Blend's [health_factor.rs](https://github.com/blend-capital/blend-contracts-v2/blob/main/pool/src/pool/health_factor.rs) and [reserve.rs](https://github.com/blend-capital/blend-contracts-v2/blob/main/pool/src/pool/reserve.rs). Reserve conversions are checked against the pinned dependency `@blend-capital/blend-sdk@3.3.1`. The [methodology](docs/index.html) describes rounding, risk factors, assumptions, and data freshness.
