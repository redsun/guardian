import { test, expect } from '@playwright/test';

test.use({ video: 'on', reducedMotion: 'reduce' });

test('reviewer walkthrough with screenshots and recording', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/');
  await page.locator('[data-demo-step="baseline"]').click();
  await expect(page.locator('.scenario').nth(2)).toContainText('1.200');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('01-starting-position.png'), fullPage: true });
  await expect(page.locator('#walkthrough-status')).toContainText('Step 1 of 3');
  await expect(page.locator('#previous-step')).toBeDisabled();
  await page.locator('#next-step').click();
  await expect(page.locator('.scenario').nth(2)).toContainText('0.960');
  await expect(page.locator('#outcome-message')).toContainText('falls below');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('02-price-shock.png'), fullPage: true });
  await expect(page.locator('[data-demo-step="shock"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#next-step').click();
  await expect(page.locator('.scenario').nth(2)).toContainText('1.152');
  await expect(page.locator('#outcome-message')).toContainText('above');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('03-repayment-simulation.png'), fullPage: true });
  await page.locator('#previous-step').click();
  await expect(page.locator('.scenario').nth(2)).toContainText('0.960');
  await page.locator('#next-step').click();
  await page.getByRole('button', { name: 'Restart walkthrough' }).click();
  await expect(page.locator('.scenario').nth(2)).toContainText('1.200');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('custom input and resets clear walkthrough state', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/');
  await page.locator('[data-demo-step="repay"]').click();
  await page.locator('#repayment').fill('0');
  await expect(page.locator('#walkthrough-controls')).toBeHidden();
  await expect(page.locator('[data-demo-step="repay"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#demo-step-description')).toContainText('custom scenario');
  await expect(page.locator('#outcome-message')).toContainText('falls below');
  await page.locator('[data-demo-step="shock"]').click();
  await page.locator('#load-sample').click();
  await expect(page.locator('#walkthrough-controls')).toBeHidden();
  await expect(page.locator('[data-demo-step="shock"]')).toHaveAttribute('aria-pressed', 'false');
});
