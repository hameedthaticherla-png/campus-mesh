/**
 * Campus Mesh — Chunk Store Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryChunkStore } from '../../web/src/p2p/storage/chunk.store.js';

test('Chunk Store — Put, Get, Has, Delete Operations', async () => {
  const store = new MemoryChunkStore();
  const resourceId = 'res_test_store';
  const chunkIndex = 0;
  const chunkData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  // Initially empty
  assert.equal(await store.has(resourceId, chunkIndex), false);
  assert.equal(await store.get(resourceId, chunkIndex), null);

  // Put
  await store.put(resourceId, chunkIndex, chunkData);
  assert.equal(await store.has(resourceId, chunkIndex), true);

  // Get
  const retrieved = await store.get(resourceId, chunkIndex);
  assert.ok(retrieved);
  assert.deepEqual(Array.from(retrieved), Array.from(chunkData));

  // Delete
  await store.delete(resourceId, chunkIndex);
  assert.equal(await store.has(resourceId, chunkIndex), false);
  assert.equal(await store.get(resourceId, chunkIndex), null);
});

test('Chunk Store — Multi-Resource Isolation', async () => {
  const store = new MemoryChunkStore();
  const resA = 'res_A';
  const resB = 'res_B';

  await store.put(resA, 0, new Uint8Array([10, 20]));
  await store.put(resA, 1, new Uint8Array([30, 40]));
  await store.put(resB, 0, new Uint8Array([99, 88]));

  const availA = await store.getAvailableChunks(resA);
  const availB = await store.getAvailableChunks(resB);

  assert.deepEqual(availA, [0, 1]);
  assert.deepEqual(availB, [0]);

  // Clearing Res A leaves Res B untouched
  await store.clear(resA);
  assert.deepEqual(await store.getAvailableChunks(resA), []);
  assert.deepEqual(await store.getAvailableChunks(resB), [0]);
});
