/**
 * Campus Mesh — Chunk Integrity Verifier Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { IntegrityVerifier } from '../../web/src/p2p/integrity/integrity.verifier.js';

test('Integrity Verifier — Validates Legitimate Chunks', async () => {
  const sampleData = crypto.randomBytes(262144);
  const expectedHash = crypto.createHash('sha256').update(sampleData).digest('hex');

  const result = await IntegrityVerifier.verify(new Uint8Array(sampleData), expectedHash);
  assert.equal(result.valid, true);
  assert.equal(result.actualHash, expectedHash);
});

test('Integrity Verifier — Detects and Rejects Poisoned/Corrupt Chunks', async () => {
  const sampleData = crypto.randomBytes(262144);
  const legitimateHash = crypto.createHash('sha256').update(sampleData).digest('hex');

  // Corrupt 1 byte
  const corruptedData = Buffer.from(sampleData);
  corruptedData[100] = corruptedData[100] ^ 0xff;

  const result = await IntegrityVerifier.verify(new Uint8Array(corruptedData), legitimateHash);
  assert.equal(result.valid, false);
  assert.notEqual(result.actualHash, legitimateHash);
});
