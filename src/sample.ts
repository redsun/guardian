import { ASSETS } from './config';
import type { PositionSnapshot } from './model';
export function samplePosition(): PositionSnapshot {
  const time = 1780000000;
  return {
    mode: 'sample', network: 'Testnet', version: 'Blend V2', poolId: 'SYNTHETIC',
    poolName: 'Illustrative Blend V2 position', address: 'SYNTHETIC — no wallet',
    oracleId: 'SYNTHETIC', wasmHash: 'Not a deployed position', poolStatus: 0,
    oracleDecimals: 7, base: 'USD', fetchedAt: time, ledgerTime: time, ledgerStart: 0, ledgerEnd: 0,
    warnings: ['Synthetic balances, factors and prices. This is not an on-chain position.'],
    assets: Object.entries(ASSETS).filter(([, symbol]) => ['XLM', 'USDC'].includes(symbol)).map(([id, symbol], index) => ({
      id, symbol, index, decimals: 7,
      collateralShares: symbol === 'XLM' ? '100000000000' : '0',
      supplyShares: symbol === 'USDC' ? '500000000' : '0',
      debtShares: symbol === 'USDC' ? '12000000000' : '0',
      bRate: '1000000000000', dRate: '1000000000000', cFactor: 8000000, lFactor: 9000000,
      price: symbol === 'XLM' ? '2000000' : '10000000', priceTimestamp: time,
      borrowApr: 0.05, supplyApr: 0.02, reserveUpdatedAt: time,
    })),
  };
}
