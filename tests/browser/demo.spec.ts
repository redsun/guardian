import { test, expect } from '@playwright/test';
import { samplePosition } from '../../src/sample';
import { REVIEW_ADDRESS } from '../../src/config';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/');
});

test('offline sample demonstrates price shock and repayment recovery', async ({ page }) => {
  await expect(page.locator('#mode-banner')).toContainText('SAMPLE MODE');
  await expect(page.locator('#health-value')).toHaveText('1.200');
  const scenarios = page.locator('.scenario');
  await expect(scenarios.nth(1)).toContainText('0.960');
  await expect(scenarios.nth(1)).toContainText('Liquidatable');
  await expect(scenarios.nth(2)).toContainText('1.152');
  await page.locator('#repayment').fill('0');
  await expect(page.locator('#outcome-message')).toContainText('falls below');
  await page.locator('#repayment').fill('200');
  await expect(page.locator('#outcome-message')).toContainText('above');
  await page.locator('#repayment').fill('-1');
  await expect(page.locator('#simulation-error')).toBeVisible();
  await expect(page.locator('.scenario')).toHaveCount(0);
  await page.locator('#reset-simulation').click();
  await expect(page.locator('#shock-output')).toHaveText('0%');
  await expect(scenarios.nth(2)).toContainText('1.200');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('stress presets update the shared scenario and oversized repayment is capped', async ({ page }) => {
  await page.locator('[data-stress="-30"]').click();
  await expect(page.locator('#shock-output')).toHaveText('−30%');
  await page.locator('#repayment').fill('9999');
  await expect(page.locator('#outcome-message')).toContainText('no remaining debt');
  await expect(page.locator('#outcome-message')).toContainText('unused');
});

test('failed live read preserves clearly labeled sample and displays the error', async ({ page }) => {
  await page.route('**/api/position?*', route => route.fulfill({ status: 502, json: { error: 'Testnet temporarily unavailable.' } }));
  await page.locator('#open-position').click();
  await page.locator('#example-address').click();
  await page.locator('#read-position').click();
  await expect(page.locator('#address-error')).toContainText('Testnet temporarily unavailable');
  await expect(page.locator('#mode-banner')).toContainText('SAMPLE MODE');
  await page.locator('#close-dialog').click();
  await expect(page.locator('#data-alert')).toBeVisible();
});

test('empty live position has no debt and does not retain sample balances', async ({ page }) => {
  const snapshot = samplePosition(); snapshot.mode = 'live'; snapshot.address = REVIEW_ADDRESS;
  snapshot.fetchedAt = snapshot.ledgerTime = Math.floor(Date.now() / 1000);
  snapshot.assets.forEach(a => { a.collateralShares = a.supplyShares = a.debtShares = '0'; });
  await page.route('**/api/position?*', route => route.fulfill({ json: snapshot }));
  await page.locator('#open-position').click(); await page.locator('#example-address').click(); await page.locator('#read-position').click();
  await expect(page.locator('#address-dialog')).not.toBeVisible();
  await expect(page.locator('#mode-banner')).toContainText('TESTNET READ');
  await expect(page.locator('#debt-value')).toHaveText('$0.00');
  await expect(page.locator('#health-status')).toHaveText('No debt');
  await expect(page.locator('#repayment')).toBeDisabled();
  await page.locator('#load-sample').click();
  await expect(page.locator('#collateral-value')).toHaveText('$2,000.00');
});

test('snapshot can be inspected and exported, and methodology is reachable', async ({ page }) => {
  await page.locator('summary').click();
  await expect(page.locator('#raw-snapshot')).toContainText('"mode": "sample"');
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  expect((await download).suggestedFilename()).toBe('guardian-sample-snapshot.json');
  await page.locator('footer a[href="/docs/"]').click();
  await expect(page.locator('h1')).toContainText('Understand the numbers');
});

test('stale live data stays visibly stale when a subsequent read fails', async ({ page }) => {
  const snapshot = samplePosition(); snapshot.mode = 'live'; snapshot.address = REVIEW_ADDRESS;
  await page.route('**/api/position?*', route => route.fulfill({ json: snapshot }));
  await page.locator('#open-position').click(); await page.locator('#example-address').click(); await page.locator('#read-position').click();
  await expect(page.locator('#health-status')).toHaveText('Stale data · estimate only');
  await expect(page.locator('#data-alert')).toContainText('Snapshot is stale');
  await page.route('**/api/position?*', route => route.fulfill({ status: 502, json: { error: 'RPC unavailable.' } }));
  await page.locator('#open-position').click(); await page.locator('#read-position').click();
  await expect(page.locator('#address-error')).toBeVisible(); await page.locator('#close-dialog').click();
  await expect(page.locator('#data-alert')).toContainText('previous snapshot');
  await expect(page.locator('#data-alert')).toContainText('Snapshot is stale');
});

test('canceling a pending lookup cannot replace the sample and allows another lookup', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/position?*', async route => { await pending; await route.fulfill({ status: 502, json: { error: 'Unavailable.' } }).catch(() => {}); });
  await page.locator('#open-position').click(); await page.locator('#example-address').click(); await page.locator('#read-position').click();
  await expect(page.locator('#read-position')).toBeDisabled();
  await page.locator('#close-dialog').click();
  release();
  await page.locator('#open-position').click();
  await expect(page.locator('#read-position')).toBeEnabled();
  await expect(page.locator('#mode-banner')).toContainText('SAMPLE MODE');
});

test('non-JSON hosting errors are understandable', async ({ page }) => {
  await page.route('**/api/position?*', route => route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Service unavailable</h1>' }));
  await page.locator('#open-position').click(); await page.locator('#example-address').click(); await page.locator('#read-position').click();
  await expect(page.locator('#address-error')).toContainText('position service is unavailable');
});
