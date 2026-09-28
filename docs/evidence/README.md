# Live evidence

The included snapshot and report were downloaded from successful [Testnet verification run 36320485606](https://github.com/redsun/guardian/actions/runs/36320485606). They were captured on 2026-09-27 at 12:53:23 UTC from source commit `c2ac23273a086f757c518a973e5edafa537cdd4c`. The downloaded snapshot's SHA-256 matches the report: `e1471696855344a1f07bc6d85b19022983f881a506fcd857ecfb4b5ec386a5ff`.

The read covered ledger 4898003, contained both collateral and debt, and passed freshness validation at capture time. The reported health factor was 36.2238760. These are historical testnet observations using mock oracle prices, not current market data or evidence of a public demo deployment.

To refresh the evidence, run `npm run verify:live -- --capture` from a network-enabled environment, or run the **Verify live testnet position** workflow in GitHub Actions. A successful capture writes:

- `testnet-snapshot.json`: raw adapter inputs, timestamps, and ledger range.
- `verification.json`: derived risk, snapshot SHA-256, verification time, and the source commit when the checkout is clean.

Check the workflow result before using its artifacts. Browser fixtures and synthetic sample balances are not live evidence. A successful past capture does not establish current testnet availability. Do not replace a failed capture with sample data.
