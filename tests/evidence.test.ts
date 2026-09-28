import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { samplePosition } from '../src/sample';
import { saveLiveEvidence } from '../scripts/evidence';

test('evidence writer refuses synthetic, stale, and debt-free snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guardian-evidence-'));
  try {
    const snapshot = samplePosition();
    await assert.rejects(saveLiveEvidence(snapshot, directory, null), /Synthetic/);
    snapshot.mode = 'live';
    await assert.rejects(saveLiveEvidence(snapshot, directory, null), /stale/);
    snapshot.assets[1].debtShares = '0';
    await assert.rejects(saveLiveEvidence(snapshot, directory, null), /both collateral and debt/);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true }); }
});

test('evidence writer creates a missing directory and binds a report to the exact snapshot bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guardian-evidence-'));
  try {
    // Synthetic fixture for testing serialization only; never saved to the repository.
    const snapshot = samplePosition(); snapshot.mode = 'live';
    snapshot.fetchedAt = snapshot.ledgerTime = Math.floor(Date.now() / 1000);
    snapshot.assets.forEach(a => { a.priceTimestamp = snapshot.fetchedAt; });
    const directory = join(root, 'nested', 'evidence');
    const report = await saveLiveEvidence(snapshot, directory, 'test-fixture-revision');
    const raw = await readFile(join(directory, 'testnet-snapshot.json'), 'utf8');
    assert.deepEqual(JSON.parse(raw), snapshot);
    assert.equal(report.snapshotSha256, createHash('sha256').update(raw).digest('hex'));
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'verification.json'), 'utf8')), report);
    assert.deepEqual((await readdir(directory)).sort(), ['testnet-snapshot.json', 'verification.json']);
  } finally { await rm(root, { recursive: true }); }
});
