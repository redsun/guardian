import type { AssetPosition, PositionSnapshot } from './model';
export const S7 = 10n ** 7n;
export const S12 = 10n ** 12n;
export const floor = (a: bigint, b: bigint) => a / b;
export const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
const I128_MAX = (1n << 127n) - 1n;
function uint(value: string): bigint {
  if (!/^\d{1,39}$/.test(value)) throw Error('Invalid unsigned fixed-point value.');
  const result = BigInt(value);
  if (result > I128_MAX) throw Error('Value exceeds the supported i128 range.');
  return result;
}
export function parseAmount(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw Error('Unsupported token precision.');
  if (!/^\d+(\.\d+)?$/.test(value) || value.length > 60) throw Error('Enter a non-negative decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw Error(`Use at most ${decimals} decimal places.`);
  return uint((whole + fraction.padEnd(decimals, '0')).replace(/^0+(?=\d)/, ''));
}
export function decimal(value: bigint | string, decimals: number): string {
  const n = BigInt(value); const sign = n < 0n ? '-' : '';
  const digits = (n < 0n ? -n : n).toString().padStart(decimals + 1, '0');
  if (!decimals) return sign + digits;
  return sign + digits.slice(0, -decimals) + '.' + digits.slice(-decimals);
}
export function amounts(asset: AssetPosition) {
  return {
    collateral: floor(uint(asset.collateralShares) * uint(asset.bRate), S12),
    savings: floor(uint(asset.supplyShares) * uint(asset.bRate), S12),
    debt: ceil(uint(asset.debtShares) * uint(asset.dRate), S12),
  };
}
export function calculate(snapshot: PositionSnapshot) {
  if (!Number.isInteger(snapshot.oracleDecimals) || snapshot.oracleDecimals < 0 || snapshot.oracleDecimals > 18) throw Error('Unsupported oracle precision.');
  let collateral = 0n, liabilities = 0n, rawCollateral = 0n, rawDebt = 0n;
  const seen = new Set<string>();
  for (const a of snapshot.assets) {
    if (seen.has(a.id)) throw Error('Duplicate reserve.');
    seen.add(a.id);
    if (!Number.isInteger(a.decimals) || a.decimals < 0 || a.decimals > 18 ||
        !Number.isInteger(a.cFactor) || a.cFactor < 0 || a.cFactor > 1e7 ||
        !Number.isInteger(a.lFactor) || a.lFactor < 0 || a.lFactor > 1e7 ||
        uint(a.bRate) === 0n || uint(a.dRate) === 0n) throw Error('Invalid reserve configuration.');
    const { collateral: c, debt: d } = amounts(a);
    if (c === 0n && d === 0n) continue;
    const price = uint(a.price), unit = 10n ** BigInt(a.decimals);
    if (!price) throw Error(`Missing or non-positive ${a.symbol} price.`);
    if (d > 0n && a.lFactor === 0) throw Error(`Invalid ${a.symbol} liability factor.`);
    collateral += floor(price * floor(c * BigInt(a.cFactor), S7), unit);
    liabilities += d === 0n ? 0n : ceil(price * ceil(d * S7, BigInt(a.lFactor)), unit);
    rawCollateral += floor(price * c, unit);
    rawDebt += ceil(price * d, unit);
  }
  const scalar = 10n ** BigInt(snapshot.oracleDecimals);
  const healthFactor = liabilities === 0n ? null : floor(collateral * scalar, liabilities);
  const status = liabilities === 0n ? 'No debt' : liabilities > collateral ? 'Liquidatable' :
    liabilities === collateral ? 'At boundary' : collateral * 100n < liabilities * 110n ? 'Low margin' : 'Above boundary';
  return { collateral, liabilities, rawCollateral, rawDebt, margin: collateral - liabilities, healthFactor, status };
}
export function freshness(snapshot: PositionSnapshot, now = Math.floor(Date.now() / 1000)): string[] {
  if (snapshot.mode === 'sample') return [];
  const problems: string[] = [];
  if (![snapshot.fetchedAt, snapshot.ledgerTime].every(time => Number.isSafeInteger(time) && time > 0)) problems.push('Snapshot or ledger timestamp is missing or invalid.');
  if (now - snapshot.fetchedAt > 120 || now - snapshot.ledgerTime > 120) problems.push('Snapshot is stale. Reload the testnet position.');
  if (snapshot.fetchedAt > now + 60 || snapshot.ledgerTime > now + 60) problems.push('Snapshot time is in the future. Check the system clock.');
  for (const a of snapshot.assets) {
    if (BigInt(a.collateralShares) === 0n && BigInt(a.debtShares) === 0n) continue;
    if (!Number.isFinite(a.priceTimestamp) || a.priceTimestamp <= 0 || a.priceTimestamp + 86400 < Math.max(now, snapshot.ledgerTime)) problems.push(`${a.symbol} oracle price is missing or older than Blend's 24-hour limit.`);
    if (a.priceTimestamp > now + 60) problems.push(`${a.symbol} oracle timestamp is in the future.`);
  }
  return problems;
}
export function simulate(snapshot: PositionSnapshot, assetId: string, shockBps: number, repayId: string, repayment: string) {
  if (!Number.isInteger(shockBps) || shockBps < -9900 || shockBps > 20000) throw Error('Price change must be between -99% and +200%.');
  const changed = structuredClone(snapshot);
  const priced = changed.assets.find(a => a.id === assetId);
  if (!priced) throw Error('Select a supported price asset.');
  priced.price = floor(uint(priced.price) * BigInt(10000 + shockBps), 10000n).toString();
  if (BigInt(priced.price) === 0n) throw Error('The shocked price is below one oracle unit.');
  let applied = 0n, unused = 0n;
  if (repayId) {
    const debt = changed.assets.find(a => a.id === repayId);
    if (!debt) throw Error('Select a supported repayment asset.');
    const requested = parseAmount(repayment, debt.decimals);
    const outstanding = amounts(debt).debt;
    applied = requested > outstanding ? outstanding : requested;
    unused = requested - applied;
    const shares = uint(debt.debtShares);
    const burned = floor(applied * S12, uint(debt.dRate));
    debt.debtShares = (shares - (burned > shares ? shares : burned)).toString();
  } else if (repayment !== '0') throw Error('No debt asset is selected.');
  return { snapshot: changed, risk: calculate(changed), applied, unused };
}
// A one-asset, downward-only boundary. All other prices and all shares/rates stay fixed.
export function dropBoundary(snapshot: PositionSnapshot, assetId: string): string {
  const a = snapshot.assets.find(a => a.id === assetId);
  const initial = calculate(snapshot);
  if (!a || initial.liabilities === 0n) return 'Not applicable: no debt.';
  if (initial.margin <= 0n) return 'Already at or below the boundary.';
  const test = structuredClone(snapshot); const target = test.assets.find(v => v.id === assetId)!;
  const original = BigInt(a.price);
  target.price = '1';
  if (calculate(test).margin >= 0n) return 'No downward boundary for this asset at positive prices.';
  let low = 1n, high = original;
  while (high - low > 1n) {
    const mid = (low + high) / 2n; target.price = mid.toString();
    if (calculate(test).margin < 0n) low = mid; else high = mid;
  }
  return `Approximately ${decimal(high, snapshot.oracleDecimals)} ${snapshot.base} per ${a.symbol}; other inputs fixed.`;
}
