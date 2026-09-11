/**
 * Campus Mesh — Streaming Manifest Generator Unit Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ManifestGenerator } from '../src/resources/manifest.generator.js';
import { config } from '../src/config/env.config.js';

describe('ManifestGenerator (Cryptographic Streaming Hashing)', () => {
  const testFilePath = path.join(config.tempStorageDir, 'test_manifest_source.bin');
  const testFileSize = 600 * 1024; // 600 KB
  let testFileBuffer: Buffer;
  let expectedFileHash: string;

  before(async () => {
    // Generate deterministic test buffer
    testFileBuffer = Buffer.alloc(testFileSize);
    for (let i = 0; i < testFileSize; i++) {
      testFileBuffer[i] = i % 256;
    }
    await fsp.writeFile(testFilePath, testFileBuffer);
    expectedFileHash = crypto.createHash('sha256').update(testFileBuffer).digest('hex');
  });

  after(async () => {
    await fsp.unlink(testFilePath).catch(() => {});
  });

  test('ManifestGenerator: produces exact whole-file and chunk SHA-256 hashes matching independent reference', async () => {
    const chunkSize = 262144; // 256 KB
    const result = await ManifestGenerator.generate(testFilePath, chunkSize);

    assert.strictEqual(result.fileSize, testFileSize);
    assert.strictEqual(result.totalChunks, 3);
    assert.strictEqual(result.fileHash, expectedFileHash, 'Overall file hash must match reference');

    // Verify Chunk 0 against manual slice
    const slice0 = testFileBuffer.subarray(0, chunkSize);
    const expectedHash0 = crypto.createHash('sha256').update(slice0).digest('hex');
    assert.strictEqual(result.chunks[0].index, 0);
    assert.strictEqual(result.chunks[0].size, chunkSize);
    assert.strictEqual(result.chunks[0].sha256, expectedHash0);

    // Verify Chunk 1 against manual slice
    const slice1 = testFileBuffer.subarray(chunkSize, chunkSize * 2);
    const expectedHash1 = crypto.createHash('sha256').update(slice1).digest('hex');
    assert.strictEqual(result.chunks[1].index, 1);
    assert.strictEqual(result.chunks[1].size, chunkSize);
    assert.strictEqual(result.chunks[1].sha256, expectedHash1);

    // Verify Final Partial Chunk 2 against manual slice
    const slice2 = testFileBuffer.subarray(chunkSize * 2);
    const expectedHash2 = crypto.createHash('sha256').update(slice2).digest('hex');
    assert.strictEqual(result.chunks[2].index, 2);
    assert.strictEqual(result.chunks[2].size, slice2.length);
    assert.strictEqual(result.chunks[2].sha256, expectedHash2);
  });
});
