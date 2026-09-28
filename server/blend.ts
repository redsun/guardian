import { Account, Address, Contract, rpc, scValToNative, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { ContractReserve, PoolMetadata, Positions, ReserveV2 } from '@blend-capital/blend-sdk';
import { ASSETS, ORACLE_ID, PASSPHRASE, POOL_ID, RPC_URL, WASM_HASH } from '../src/config';
import type { AssetPosition, PositionSnapshot, ProtocolAdapter } from '../src/model';
import { calculate } from '../src/risk';

export function validateAddress(address: string) {
  if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) throw Error('Enter a valid public Stellar account (G...) or contract (C...) address.');
}
async function retry<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch { return await operation(); }
}
export class BlendAdapter implements ProtocolAdapter {
  private server = new rpc.Server(RPC_URL, { timeout: 15 });
  private ledgers: number[] = [];
  constructor() {
    // The installed fetch-based SDK does not apply the constructor timeout option.
    this.server.httpClient.defaults.timeout = 15000;
  }
  // Only getter calls are allowed. These unsigned envelopes are simulated, never submitted.
  private async getter(contract: string, method: string, ...args: xdr.ScVal[]) {
    if (!['get_positions', 'get_reserve', 'lastprice', 'decimals', 'base'].includes(method)) throw Error('Unsupported read method.');
    const tx = new TransactionBuilder(new Account('GANXGJV2RNOFMOSQ2DTI3RKDBAVERXUVFC27KW3RLVQCLB3RYNO3AAI4', '0'), {
      fee: '1000', networkPassphrase: PASSPHRASE,
    }).addOperation(new Contract(contract).call(method, ...args)).setTimeout(30).build();
    const result = await retry(() => this.server.simulateTransaction(tx));
    if (!rpc.Api.isSimulationSuccess(result) || !result.result || 'restorePreamble' in result) throw Error(`Unable to read ${method}. Contract data may be unavailable or archived; no risk result is available.`);
    this.ledgers.push(result.latestLedger);
    return result.result.retval;
  }
  async read(address: string): Promise<PositionSnapshot> {
    validateAddress(address);
    this.ledgers = [];
    const network = { rpc: RPC_URL, passphrase: PASSPHRASE, opts: { allowHttp: false, timeout: 15 } };
    const start = await retry(() => this.server.getLatestLedger());
    const metadata = await retry(() => PoolMetadata.load(network, POOL_ID));
    if (metadata.wasmHash !== WASM_HASH || metadata.oracle !== ORACLE_ID || metadata.reserveList.some(id => !ASSETS[id])) throw Error('Unsupported pool deployment or configuration. Adapter review is required.');
    this.ledgers.push(start.sequence, metadata.latestLedger);
    const results = await Promise.allSettled([
      this.getter(POOL_ID, 'get_positions', new Address(address).toScVal()),
      this.getter(ORACLE_ID, 'decimals'), this.getter(ORACLE_ID, 'base'),
    ]);
    const values = results.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
    const positions = Positions.fromScVal(values[0].toXDR('base64'));
    const decimals = Number(scValToNative(values[1]));
    const base = scValToNative(values[2]);
    if (!Array.isArray(base) || base[0] !== 'Other' || base[1] !== 'USD') throw Error('Unsupported oracle base; expected USD.');
    for (const map of [positions.collateral, positions.liabilities, positions.supply]) {
      for (const index of map.keys()) if (!metadata.reserveList[index]) throw Error('Position contains an unknown reserve index.');
    }
    const assets: AssetPosition[] = [];
    // Small batches avoid saturating the public RPC. All reserve data comes from contract getters.
    for (const [index, id] of metadata.reserveList.entries()) {
      const results = await Promise.allSettled([
        this.getter(POOL_ID, 'get_reserve', new Address(id).toScVal()),
        this.getter(ORACLE_ID, 'lastprice', xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Stellar'), new Address(id).toScVal()])),
      ]);
      const pair = results.map(r => { if (r.status === 'rejected') throw r.reason; return r.value; });
      const reserve = ContractReserve.fromScVal(pair[0].toXDR('base64'));
      const price = scValToNative(pair[1]);
      if (!price || typeof price.price !== 'bigint' || reserve.config.index !== index || reserve.asset !== id) throw Error('Missing price or inconsistent reserve data.');
      const rates = new ReserveV2(POOL_ID, id, reserve.config, reserve.data, undefined, undefined, 0, 0, 0, 0, 0);
      rates.setRates(BigInt(metadata.backstopRate));
      assets.push({
        id, symbol: ASSETS[id], index, decimals: reserve.config.decimals,
        collateralShares: (positions.collateral.get(index) ?? 0n).toString(),
        supplyShares: (positions.supply.get(index) ?? 0n).toString(),
        debtShares: (positions.liabilities.get(index) ?? 0n).toString(),
        bRate: reserve.data.bRate.toString(), dRate: reserve.data.dRate.toString(),
        cFactor: reserve.config.c_factor, lFactor: reserve.config.l_factor,
        price: price.price.toString(), priceTimestamp: Number(price.timestamp),
        borrowApr: rates.borrowApr, supplyApr: rates.supplyApr, reserveUpdatedAt: reserve.data.lastTime,
      });
    }
    const end = await retry(() => this.server.getLatestLedger()); this.ledgers.push(end.sequence);
    const snapshot: PositionSnapshot = {
      mode: 'live', network: 'Testnet', version: 'Blend V2', poolId: POOL_ID, poolName: metadata.name,
      address, oracleId: metadata.oracle, oracleDecimals: decimals, base: 'USD', wasmHash: metadata.wasmHash,
      poolStatus: metadata.status, fetchedAt: Math.floor(Date.now() / 1000), ledgerTime: Number(end.closeTime),
      ledgerStart: Math.min(...this.ledgers), ledgerEnd: Math.max(...this.ledgers), assets,
      warnings: ['Testnet mock oracle prices are not market prices.', 'Separate RPC reads span multiple ledgers; this is an estimate, not an atomic execution quote.'],
    };
    if (snapshot.ledgerEnd - snapshot.ledgerStart > 20) throw Error('The read spanned too many ledgers. Reload for a more consistent snapshot.');
    if (metadata.status !== 0 && metadata.status !== 1) snapshot.warnings.push(`Pool status ${metadata.status} restricts some actions. Risk arithmetic does not establish transaction eligibility.`);
    calculate(snapshot); // Reject incomplete/invalid mappings before returning any risk data.
    return snapshot;
  }
}
