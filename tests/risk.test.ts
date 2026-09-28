import test from 'node:test';
import assert from 'node:assert/strict';
import { ReserveConfig, ReserveData, ReserveV2 } from '@blend-capital/blend-sdk';
import { amounts, calculate, decimal, dropBoundary, freshness, parseAmount, simulate, S12 } from '../src/risk';
import { samplePosition } from '../src/sample';

test('sample has $2,000 collateral, $1,200 debt and a 1.2 health factor before floor rounding', () => {
  const risk = calculate(samplePosition());
  assert.equal(risk.rawCollateral, 2000_0000000n);
  assert.equal(risk.rawDebt, 1200_0000000n);
  assert.equal(risk.collateral, 1600_0000000n);
  assert.equal(risk.liabilities, 1333_3333334n);
  assert.equal(risk.healthFactor, 1_1999999n);
  assert.equal(risk.status, 'Above boundary');
});

test('20% price decline crosses boundary; 200 USDC repayment restores margin without mutating input', () => {
  const snapshot = samplePosition();
  const original = structuredClone(snapshot);
  const [collateral, debt] = snapshot.assets;
  const market = simulate(snapshot, collateral.id, -2000, debt.id, '0');
  const repaid = simulate(snapshot, collateral.id, -2000, debt.id, '200');
  assert.equal(market.risk.status, 'Liquidatable');
  assert.equal(market.risk.healthFactor, 9599999n);
  assert.equal(repaid.risk.rawDebt, 1000_0000000n);
  assert.equal(repaid.risk.status, 'Above boundary');
  assert.equal(repaid.risk.healthFactor, 1_1519999n);
  assert.deepEqual(snapshot, original);
});

test('savings never contribute to collateral', () => {
  const snapshot = samplePosition();
  const before = calculate(snapshot);
  snapshot.assets[1].supplyShares = '900000000000000000';
  assert.deepEqual(calculate(snapshot), before);
});

test('exact boundary, no debt, and empty position have distinct states', () => {
  const snapshot = samplePosition();
  for (const a of snapshot.assets) { a.cFactor = 10000000; a.lFactor = 10000000; }
  snapshot.assets[1].debtShares = '20000000000';
  assert.equal(calculate(snapshot).status, 'At boundary');
  snapshot.assets[1].debtShares = '0';
  assert.equal(calculate(snapshot).healthFactor, null);
  assert.equal(calculate(snapshot).status, 'No debt');
  snapshot.assets[0].collateralShares = '0';
  assert.equal(calculate(snapshot).rawCollateral, 0n);
  assert.equal(dropBoundary(snapshot, snapshot.assets[0].id), 'Not applicable: no debt.');
});

test('repayment is capped at outstanding debt, including non-integral exchange rates', () => {
  for (const rate of ['1000000000000', '1123456789012', '500000000000']) {
    const snapshot = samplePosition();
    snapshot.assets[1].dRate = rate;
    const debt = amounts(snapshot.assets[1]).debt;
    const result = simulate(snapshot, snapshot.assets[0].id, 0, snapshot.assets[1].id, '99999');
    assert.equal(result.applied, debt);
    assert.equal(result.unused, 99999_0000000n - debt);
    assert.equal(result.risk.liabilities, 0n);
    assert.equal(result.risk.status, 'No debt');
  }
});

test('decimal parsing is exact and rejects unsupported precision or notation', () => {
  assert.equal(parseAmount('0001.0000001', 7), 10000001n);
  assert.equal(decimal(-10000001n, 7), '-1.0000001');
  assert.equal(parseAmount('0', 0), 0n);
  for (const input of ['-1', '1e3', '', 'NaN', '1.00000001', '.5', '1,000']) assert.throws(() => parseAmount(input, 7));
  assert.throws(() => parseAmount('1', 19));
});

test('simulation rejects unknown assets, invalid shocks, and invalid repayment', () => {
  const snapshot = samplePosition();
  const [a, b] = snapshot.assets;
  for (const shock of [-10000, 20001, NaN, 0.5]) assert.throws(() => simulate(snapshot, a.id, shock, b.id, '0'));
  assert.throws(() => simulate(snapshot, 'unknown', 0, b.id, '0'));
  assert.throws(() => simulate(snapshot, a.id, 0, 'unknown', '0'));
  assert.throws(() => simulate(snapshot, a.id, 0, '', '1'));
  assert.throws(() => simulate(snapshot, a.id, 0, b.id, '-1'));
});

test('invalid risk inputs fail closed', () => {
  for (const mutate of [
    (s: ReturnType<typeof samplePosition>) => { s.assets[0].price = '0'; },
    (s: ReturnType<typeof samplePosition>) => { s.assets[0].bRate = '0'; },
    (s: ReturnType<typeof samplePosition>) => { s.assets[1].lFactor = 0; },
    (s: ReturnType<typeof samplePosition>) => { s.assets[0].cFactor = 10000001; },
    (s: ReturnType<typeof samplePosition>) => { s.assets[0].debtShares = '-1'; },
    (s: ReturnType<typeof samplePosition>) => { s.assets[0].price = (2n ** 127n).toString(); },
    (s: ReturnType<typeof samplePosition>) => { s.assets.push(s.assets[0]); },
  ]) { const s = samplePosition(); mutate(s); assert.throws(() => calculate(s)); }
});

test('freshness distinguishes sample data, stale reads, stale or future oracle data', () => {
  const s = samplePosition(); const now = s.fetchedAt;
  assert.deepEqual(freshness(s, now + 1e9), []);
  s.mode = 'live';
  assert.deepEqual(freshness(s, now), []);
  assert.match(freshness(s, now + 121).join(), /Snapshot is stale/);
  s.assets[0].priceTimestamp = now - 86401;
  assert.match(freshness(s, now).join(), /24-hour/);
  s.assets[0].priceTimestamp = now + 61;
  assert.match(freshness(s, now).join(), /future/);
  s.assets[0].priceTimestamp = NaN;
  assert.match(freshness(s, now).join(), /missing/);
  s.fetchedAt = NaN;
  assert.match(freshness(s, now).join(), /Snapshot or ledger timestamp is missing or invalid/);
});

test('single asset boundary brackets the effective margin and debt-asset decline has no downward boundary', () => {
  const s = samplePosition();
  const boundary = dropBoundary(s, s.assets[0].id);
  assert.match(boundary, /0\.1666667 USD per XLM/);
  s.assets[0].price = '1666667';
  assert.ok(calculate(s).margin >= 0n);
  s.assets[0].price = '1666666';
  assert.ok(calculate(s).margin < 0n);
  const original = samplePosition();
  assert.match(dropBoundary(original, original.assets[1].id), /No downward boundary/);
});

test('fixed-point conversions agree with Blend SDK 3.3.1 across token precisions and fractional rates', () => {
  for (const decimals of [6, 7, 9, 18]) {
    for (let i = 1; i <= 50; i++) {
      const s = samplePosition(); const a = s.assets[0];
      a.decimals = decimals;
      a.collateralShares = (BigInt(i) * 987654321n + 1n).toString();
      a.debtShares = (BigInt(i) * 123456789n + 3n).toString();
      a.bRate = (S12 + BigInt(i) * 112345678n).toString();
      a.dRate = (S12 + BigInt(i) * 212345678n).toString();
      a.cFactor = 7000000 + i * 300;
      a.lFactor = 8000000 + i * 200;
      const config = new ReserveConfig(0, decimals, a.cFactor, a.lFactor, 7500000, 9500000, 0, 0, 0, 0, 0);
      const data = new ReserveData(BigInt(a.dRate), BigInt(a.bRate), 10000000n, 0n, 0n, 0n, 0);
      const reserve = new ReserveV2('pool', a.id, config, data, undefined, undefined, 0, 0, 0, 0, 0);
      s.assets = [a];
      const risk = calculate(s);
      const unit = 10n ** BigInt(decimals); const price = BigInt(a.price);
      assert.equal(amounts(a).collateral, reserve.toAssetFromBToken(BigInt(a.collateralShares)));
      assert.equal(amounts(a).debt, reserve.toAssetFromDToken(BigInt(a.debtShares)));
      assert.equal(risk.collateral, reserve.toEffectiveAssetFromBToken(BigInt(a.collateralShares)) * price / unit);
      assert.equal(risk.liabilities, (reserve.toEffectiveAssetFromDToken(BigInt(a.debtShares)) * price + unit - 1n) / unit);
    }
  }
});

test('larger collateral price shocks never improve margin; increasing repayments never worsens it', () => {
  const s = samplePosition(); const [a, b] = s.assets;
  let last = calculate(s).margin;
  for (let shock = 0; shock >= -9000; shock -= 100) {
    const next = simulate(s, a.id, shock, b.id, '0').risk.margin;
    assert.ok(next <= last); last = next;
  }
  last = simulate(s, a.id, -2000, b.id, '0').risk.margin;
  for (let repayment = 0; repayment <= 1500; repayment += 10) {
    const next = simulate(s, a.id, -2000, b.id, String(repayment)).risk.margin;
    assert.ok(next >= last); last = next;
  }
});
