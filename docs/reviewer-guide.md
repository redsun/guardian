# Using Guardian

Guardian displays a Blend position and compares hypothetical price and repayment scenarios. The default sample works without a wallet. Public address lookup reads one configured Blend V2 pool on Stellar Testnet.

## Explore the sample

The sample contains 10,000 XLM at $0.20, 1,200 USDC of debt, and 50 USDC of separate savings. Savings do not increase borrowing capacity.

| Step | Scenario | Displayed health factor |
| --- | --- | --- |
| **1. Starting position** | $2,000 collateral and $1,200 debt. | 1.200 |
| **2. Price drops 20%** | XLM falls from $0.20 to $0.16; effective margin becomes negative. | 0.960 |
| **3. Repay 200 USDC** | A hypothetical repayment restores positive effective margin at the lower price. | 1.152 |

Each step loads synthetic sample data. Use **Next step** and **Previous step** beside the simulator to navigate, or **Restart walkthrough** to return to the initial scenario.

The position overview shows the original snapshot. The simulator compares the current position, the price change, and the repayment. Displayed health factors round to three decimals; risk status uses full fixed-point precision.

## Adjust a scenario

Choose a price shock asset and change its price with the slider or presets. Select a debt asset and enter a repayment amount to compare the outcome. Repayments use hypothetical external funds and are capped at the outstanding debt. No transaction is sent.

Manual input, stress presets, and resets clear the active guided step. **Reset scenario** restores zero price change and zero repayment. **Reset demo** reloads the sample and its default comparison.

## Read a public position

Select **View an address**, enter a public Stellar account or contract address, and select **Read testnet position**. The lookup only covers the configured pool; it is not a wallet-wide balance view.

The **TESTNET READ** label distinguishes a live read from **SAMPLE MODE**. Testnet oracle prices are mock prices. Stale data and read failures are shown explicitly; a failed read retains the previous labeled snapshot. Read the address again to refresh its data. **Switch to sample** returns to synthetic data.

## Inspect the inputs

Expand **Data & sources** to inspect the pool, address, oracle, ledger range, timestamps, reserve factors, and raw snapshot. **Export snapshot** downloads the displayed inputs as JSON.

See the [methodology](index.html) for calculation details and limitations. Guardian does not connect a wallet, send transactions, or provide automatic protection.
