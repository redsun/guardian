import { execFileSync } from 'node:child_process';
import { BlendAdapter } from '../server/blend';
import { REVIEW_ADDRESS } from '../src/config';
import { calculate, decimal, freshness } from '../src/risk';
import { saveLiveEvidence } from './evidence';

const deadline = setTimeout(() => { console.error('Live verification timed out after 90 seconds. No new evidence was captured.'); process.exit(1); }, 90000);
try {
  const snapshot = await new BlendAdapter().read(process.env.REVIEW_ADDRESS?.trim() || REVIEW_ADDRESS);
  const risk = calculate(snapshot);
  console.log(JSON.stringify({ address: snapshot.address, ledgers: [snapshot.ledgerStart, snapshot.ledgerEnd], fetchedAt: new Date(snapshot.fetchedAt * 1000).toISOString(),
    status: risk.status, collateral: decimal(risk.collateral, snapshot.oracleDecimals), liabilities: decimal(risk.liabilities, snapshot.oracleDecimals), problems: freshness(snapshot) }, null, 2));
  if (risk.liabilities === 0n || risk.collateral === 0n) throw Error('The reviewer position no longer has both collateral and debt. Select another public position.');
  if (freshness(snapshot).length) throw Error('Live data is stale or invalid.');
  if (process.argv.includes('--capture')) {
    let sourceCommit: string | null = null;
    try {
      const clean = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() === '';
      sourceCommit = clean ? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() : null;
    } catch { /* Source provenance is unavailable outside a Git checkout. */ }
    const report = await saveLiveEvidence(snapshot, 'docs/evidence', sourceCommit);
    console.log(`Verified evidence saved. Snapshot SHA-256: ${report.snapshotSha256}`);
  }
} catch (error) {
  console.error(`Live verification failed: ${(error as Error).message}. No successful verification is claimed.`);
  process.exitCode = 1;
} finally { clearTimeout(deadline); }
