/**
 * Campus Mesh — Chunk Math & Boundary Unit Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ChunkCalculator } from '../src/resources/chunk.calculator.js';
import { CHUNK_SIZE_BYTES } from '@campus-mesh/shared';

describe('ChunkCalculator (Boundary Math & Validations)', () => {
  test('calculateTotalChunks: computes exact chunk counts for various file sizes', () => {
    assert.strictEqual(ChunkCalculator.calculateTotalChunks(0), 0);
    assert.strictEqual(ChunkCalculator.calculateTotalChunks(1), 1, '1-byte file must be 1 chunk');
    assert.strictEqual(ChunkCalculator.calculateTotalChunks(CHUNK_SIZE_BYTES), 1, 'Exact 256 KB must be 1 chunk');
    assert.strictEqual(ChunkCalculator.calculateTotalChunks(CHUNK_SIZE_BYTES + 1), 2, '256 KB + 1 byte must be 2 chunks');
    assert.strictEqual(ChunkCalculator.calculateTotalChunks(CHUNK_SIZE_BYTES * 2), 2, 'Exact 512 KB must be 2 chunks');
    assert.strictEqual(ChunkCalculator.calculateTotalChunks(1024 * 1024), 4, '1 MB file must be 4 chunks');
    assert.strictEqual(ChunkCalculator.calculateTotalChunks(100 * 1024 * 1024), 400, '100 MB must be 400 chunks');
  });

  test('calculateChunkBounds: calculates exact byte offsets for first, middle, and final partial chunks', () => {
    const fileSize = 600 * 1024; // 614,400 bytes (2.34 chunks @ 256KB)
    const totalChunks = ChunkCalculator.calculateTotalChunks(fileSize);
    assert.strictEqual(totalChunks, 3);

    // Chunk 0 (First full 256 KB slice)
    const chunk0 = ChunkCalculator.calculateChunkBounds(0, fileSize);
    assert.strictEqual(chunk0.start, 0);
    assert.strictEqual(chunk0.end, 262144);
    assert.strictEqual(chunk0.streamEnd, 262143);
    assert.strictEqual(chunk0.length, 262144);

    // Chunk 1 (Middle full 256 KB slice)
    const chunk1 = ChunkCalculator.calculateChunkBounds(1, fileSize);
    assert.strictEqual(chunk1.start, 262144);
    assert.strictEqual(chunk1.end, 524288);
    assert.strictEqual(chunk1.streamEnd, 524287);
    assert.strictEqual(chunk1.length, 262144);

    // Chunk 2 (Final partial slice: 614,400 - 524,288 = 90,112 bytes)
    const chunk2 = ChunkCalculator.calculateChunkBounds(2, fileSize);
    assert.strictEqual(chunk2.start, 524288);
    assert.strictEqual(chunk2.end, 614400);
    assert.strictEqual(chunk2.streamEnd, 614399);
    assert.strictEqual(chunk2.length, 90112);
  });

  test('validateChunkIndex: correctly accepts valid indices and rejects invalid inputs', () => {
    const totalChunks = 10;

    // Valid zero-indexed boundaries
    assert.deepStrictEqual(ChunkCalculator.validateChunkIndex(0, totalChunks), { valid: true, index: 0 });
    assert.deepStrictEqual(ChunkCalculator.validateChunkIndex(9, totalChunks), { valid: true, index: 9 });
    assert.deepStrictEqual(ChunkCalculator.validateChunkIndex('5', totalChunks), { valid: true, index: 5 });

    // Invalid: negative index
    const neg = ChunkCalculator.validateChunkIndex(-1, totalChunks);
    assert.strictEqual(neg.valid, false);
    if (!neg.valid) assert.strictEqual(neg.statusCode, 400);

    // Invalid: non-integer float
    const floatVal = ChunkCalculator.validateChunkIndex('1.5', totalChunks);
    assert.strictEqual(floatVal.valid, false);
    if (!floatVal.valid) assert.strictEqual(floatVal.statusCode, 400);

    // Invalid: non-numeric string
    const nonNum = ChunkCalculator.validateChunkIndex('abc', totalChunks);
    assert.strictEqual(nonNum.valid, false);
    if (!nonNum.valid) assert.strictEqual(nonNum.statusCode, 400);

    // Invalid: out of bounds (index == totalChunks)
    const boundaryOOB = ChunkCalculator.validateChunkIndex(10, totalChunks);
    assert.strictEqual(boundaryOOB.valid, false);
    if (!boundaryOOB.valid) assert.strictEqual(boundaryOOB.statusCode, 404);

    // Invalid: out of bounds (index > totalChunks)
    const farOOB = ChunkCalculator.validateChunkIndex(99, totalChunks);
    assert.strictEqual(farOOB.valid, false);
    if (!farOOB.valid) assert.strictEqual(farOOB.statusCode, 404);
  });
});
