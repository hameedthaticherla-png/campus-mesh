/**
 * Campus Mesh — Chunk Scheduler Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  type ResourceManifest,
  Bitfield,
  decodeMessage,
  WireMessageType
} from '@campus-mesh/shared';
import { MemoryChunkStore } from '../../web/src/p2p/storage/chunk.store.js';
import { ChunkScheduler } from '../../web/src/p2p/scheduler/ChunkScheduler.js';

function createMockManifest(totalChunks: number, chunkBuffers: Buffer[]): ResourceManifest {
  const chunks = chunkBuffers.map((buf, idx) => ({
    index: idx,
    size: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex')
  }));

  return {
    resourceId: 'res_mock_sched',
    sessionId: 'sess_mock',
    fileName: 'test.bin',
    fileSize: chunkBuffers.reduce((acc, b) => acc + b.length, 0),
    chunkSize: 262144,
    totalChunks,
    fileHash: 'mock_file_hash',
    createdAt: new Date().toISOString(),
    chunks
  };
}

test('Chunk Scheduler — Rarest-First Peer Request Dispatching', async () => {
  const buf0 = crypto.randomBytes(100);
  const buf1 = crypto.randomBytes(100);
  const buf2 = crypto.randomBytes(100);
  const manifest = createMockManifest(3, [buf0, buf1, buf2]);

  const chunkStore = new MemoryChunkStore();
  const localBitfield = new Bitfield(3);

  const sentRequests: Array<{ peerId: string; chunkIndex: number }> = [];

  const scheduler = new ChunkScheduler(manifest, chunkStore, localBitfield, {
    sendToPeer: (peerId, buf) => {
      const msg = decodeMessage(buf);
      if (msg.type === WireMessageType.REQUEST) {
        sentRequests.push({ peerId, chunkIndex: msg.chunkIndex });
      }
      return true;
    },
    broadcastToPeers: () => {},
    fetchFromOrigin: async () => new Uint8Array(),
    onChunkCompleted: () => {},
    onDownloadProgress: () => {},
    onDownloadComplete: () => {},
    onError: () => {}
  });

  // Peer A has chunk 0 and chunk 1 (rarity = 2 for 0, 1)
  const bfA = new Bitfield(3);
  bfA.set(0);
  bfA.set(1);
  scheduler.updatePeerBitfield('peer_A', bfA);

  // Peer B has only chunk 0 (rarity = 2 for chunk 0)
  const bfB = new Bitfield(3);
  bfB.set(0);
  scheduler.updatePeerBitfield('peer_B', bfB);

  // Peer C has chunk 2 (rarity = 1 for chunk 2 -> rarest!)
  const bfC = new Bitfield(3);
  bfC.set(2);
  scheduler.updatePeerBitfield('peer_C', bfC);

  scheduler.start();

  // Rarest chunk is chunk 2 (only possessed by Peer C). It must be requested!
  const chunk2Req = sentRequests.find((r) => r.chunkIndex === 2);
  assert.ok(chunk2Req, 'Scheduler must request rarest chunk 2');
  assert.equal(chunk2Req.peerId, 'peer_C');

  scheduler.stop();
});

test('Chunk Scheduler — Prevents Duplicate In-Flight Requests', async () => {
  const buf0 = crypto.randomBytes(100);
  const manifest = createMockManifest(1, [buf0]);

  const chunkStore = new MemoryChunkStore();
  const localBitfield = new Bitfield(1);

  let requestCount = 0;
  const scheduler = new ChunkScheduler(manifest, chunkStore, localBitfield, {
    sendToPeer: () => {
      requestCount++;
      return true;
    },
    broadcastToPeers: () => {},
    fetchFromOrigin: async () => new Uint8Array(),
    onChunkCompleted: () => {},
    onDownloadProgress: () => {},
    onDownloadComplete: () => {},
    onError: () => {}
  });

  const bfA = new Bitfield(1);
  bfA.set(0);
  scheduler.updatePeerBitfield('peer_A', bfA);

  scheduler.start();
  scheduler.scheduleNext(); // Called again
  scheduler.scheduleNext(); // Called again

  assert.equal(requestCount, 1, 'In-flight chunk must not be requested redundantly');
  scheduler.stop();
});

test('Chunk Scheduler — Automatic HTTP Origin Fallback When No Peers Have Chunk', async () => {
  const buf0 = crypto.randomBytes(100);
  const manifest = createMockManifest(1, [buf0]);

  const chunkStore = new MemoryChunkStore();
  const localBitfield = new Bitfield(1);

  let originFetched = false;
  let downloadCompleted = false;

  const scheduler = new ChunkScheduler(manifest, chunkStore, localBitfield, {
    sendToPeer: () => false,
    broadcastToPeers: () => {},
    fetchFromOrigin: async (idx) => {
      assert.equal(idx, 0);
      originFetched = true;
      return new Uint8Array(buf0);
    },
    onChunkCompleted: (idx, fromP2P) => {
      assert.equal(idx, 0);
      assert.equal(fromP2P, false);
    },
    onDownloadProgress: () => {},
    onDownloadComplete: () => {
      downloadCompleted = true;
    },
    onError: () => {}
  });

  // No peers added
  scheduler.start();

  // Allow async origin fetch and store to resolve
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(originFetched, true);
  assert.equal(localBitfield.has(0), true);
  assert.equal(downloadCompleted, true);

  scheduler.stop();
});
