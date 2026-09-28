import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { PositionSnapshot } from '../src/model';
import { calculate, decimal, freshness } from '../src/risk';

export async function saveLiveEvidence(snapshot: PositionSnapshot, directory: string, sourceCommit: string | null) {
  if (snapshot.mode !== 'live') throw Error('Synthetic snapshots cannot be captured as live evidence.');
  const risk = calculate(snapshot);
  if (risk.liabilities === 0n || risk.collateral === 0n) throw Error('The reviewer position must have both collateral and debt.');
  const problems = freshness(snapshot);
  if (problems.length) throw Error(problems.join(' '));
  const raw = JSON.stringify(snapshot, null, 2) + '\n';
  const report = {
    verifiedAt: new Date().toISOString(),
    sourceCommit,
    snapshotFile: 'testnet-snapshot.json',
    snapshotSha256: createHash('sha256').update(raw).digest('hex'),
    network: snapshot.network,
    poolId: snapshot.poolId,
    address: snapshot.address,
    wasmHash: snapshot.wasmHash,
    oracleId: snapshot.oracleId,
    ledgerStart: snapshot.ledgerStart,
    ledgerEnd: snapshot.ledgerEnd,
    fetchedAt: snapshot.fetchedAt,
    effectiveCollateral: decimal(risk.collateral, snapshot.oracleDecimals),
    effectiveLiabilities: decimal(risk.liabilities, snapshot.oracleDecimals),
    healthFactor: risk.healthFactor === null ? null : decimal(risk.healthFactor, snapshot.oracleDecimals),
    status: risk.status,
    freshnessIssues: problems,
    warnings: snapshot.warnings,
    note: 'Read-only testnet snapshot. Mock oracle prices. Separate reads span multiple ledgers. This is evidence at the recorded time, not a current execution quote.',
  };
  await mkdir(directory, { recursive: true });
  for (const [name, content] of [['testnet-snapshot.json', raw], ['verification.json', JSON.stringify(report, null, 2) + '\n']]) {
    const path = join(directory, name);
    await writeFile(path + '.tmp', content);
    await rename(path + '.tmp', path);
  }
  return report;
}
