export interface AssetPosition {
  id: string; symbol: string; index: number; decimals: number;
  collateralShares: string; supplyShares: string; debtShares: string;
  bRate: string; dRate: string; cFactor: number; lFactor: number;
  price: string; priceTimestamp: number;
  borrowApr: number; supplyApr: number; reserveUpdatedAt: number;
}
export interface PositionSnapshot {
  mode: 'sample' | 'live'; network: 'Testnet'; version: 'Blend V2';
  poolId: string; poolName: string; address: string; oracleId: string;
  oracleDecimals: number; base: string; wasmHash: string; poolStatus: number;
  fetchedAt: number; ledgerTime: number; ledgerStart: number; ledgerEnd: number;
  assets: AssetPosition[]; warnings: string[];
}
export interface ProtocolAdapter { read(address: string): Promise<PositionSnapshot> }
