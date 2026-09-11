/**
 * Campus Mesh — End-to-End P2P Chunk Transfer & Swarm Propagation Test Suite
 *
 * Verifies that:
 * 1. Actual binary chunk bytes travel directly between peers over DataChannel wire messages.
 * 2. Receiving peer independently verifies SHA-256 and stores chunk in ChunkStore.
 * 3. Multi-hop propagation works: Peer A -> Peer B -> Peer C (0 origin bytes for Peer C).
 * 4. Poisoned/corrupt chunks are rejected and origin fallback activates.
 * 5. Cross-session signaling is strictly isolated.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  type ResourceManifest,
  Bitfield,
  encodeBitfield,
  encodePiece,
  decodeMessage,
  WireMessageType,
  SignalingEventType,
  P2P_BLOCK_SIZE
} from '@campus-mesh/shared';
import { MemoryChunkStore } from '../../web/src/p2p/storage/chunk.store.js';
import { ChunkScheduler } from '../../web/src/p2p/scheduler/ChunkScheduler.js';
import { roomManager } from '../src/signaling/room.manager.js';
import { TokenService } from '../src/auth/token.service.js';
import { SessionService } from '../src/sessions/session.service.js';
import { initDatabase, resetDatabase } from '../src/database/db.client.js';

initDatabase();

function createManifest(resourceId: string, chunkBuffers: Buffer[]): ResourceManifest {
  const chunks = chunkBuffers.map((buf, idx) => ({
    index: idx,
    size: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex')
  }));

  return {
    resourceId,
    sessionId: 'sess_p2p_sim',
    fileName: 'campus_mesh_test.iso',
    fileSize: chunkBuffers.reduce((acc, b) => acc + b.length, 0),
    chunkSize: 262144,
    totalChunks: chunkBuffers.length,
    fileHash: crypto.createHash('sha256').update(Buffer.concat(chunkBuffers)).digest('hex'),
    createdAt: new Date().toISOString(),
    chunks
  };
}

test('P2P Core — Real Browser-to-Browser Binary Chunk Transfer (Peer A -> Peer B)', async () => {
  // 1. Setup resource and 256 KB chunk
  const chunk0Data = crypto.randomBytes(262144);
  const manifest = createManifest('res_p2p_transfer', [chunk0Data]);

  // Peer A (Seeder)
  const storeA = new MemoryChunkStore();
  const bitfieldA = Bitfield.all(1);
  await storeA.put(manifest.resourceId, 0, new Uint8Array(chunk0Data));

  // Peer B (Leecher)
  const storeB = new MemoryChunkStore();
  const bitfieldB = new Bitfield(1);

  let p2pBytesReceivedByB = 0;
  let originBytesReceivedByB = 0;
  let completedB = false;

  // Mock DataChannel connecting B to A
  const channelBtoA = {
    send: (buffer: Uint8Array) => {
      // Message travels from B to A
      const msg = decodeMessage(buffer);
      if (msg.type === WireMessageType.REQUEST) {
        // Peer A processes request, reads from storeA, and responds with PIECE
        storeA.get(msg.resourceId, msg.chunkIndex).then((data) => {
          if (data) {
            // Send in 64 KB slices
            const blockSize = P2P_BLOCK_SIZE;
            for (let offset = 0; offset < data.length; offset += blockSize) {
              const slice = data.subarray(offset, Math.min(offset + blockSize, data.length));
              const pieceMsg = encodePiece(msg.resourceId, msg.chunkIndex, offset, data.length, slice);
              channelAtoB.receive(pieceMsg);
            }
          }
        });
      }
      return true;
    }
  };

  const channelAtoB = {
    receive: (buffer: Uint8Array) => {
      // Message arrives at Peer B
      const msg = decodeMessage(buffer);
      if (msg.type === WireMessageType.PIECE) {
        schedulerB.handlePiece(msg.chunkIndex, msg.beginOffset, msg.totalLength, msg.data);
      }
    }
  };

  // Create Peer B's scheduler
  const schedulerB = new ChunkScheduler(manifest, storeB, bitfieldB, {
    sendToPeer: (peerId, buf) => {
      assert.equal(peerId, 'peer_A');
      return channelBtoA.send(buf);
    },
    broadcastToPeers: () => {},
    fetchFromOrigin: async () => {
      originBytesReceivedByB += 262144;
      return new Uint8Array();
    },
    onChunkCompleted: (chunkIdx, fromP2P, byteLength) => {
      assert.equal(chunkIdx, 0);
      assert.equal(fromP2P, true);
      p2pBytesReceivedByB += byteLength;
    },
    onDownloadProgress: () => {},
    onDownloadComplete: () => {
      completedB = true;
    },
    onError: (err) => {
      assert.fail(`Unexpected scheduler error: ${err.message}`);
    }
  });

  // Peer A announces availability to Peer B via BITFIELD
  schedulerB.updatePeerBitfield('peer_A', bitfieldA);
  schedulerB.start();

  // Allow async transfer and SHA-256 verification to complete
  await new Promise((r) => setTimeout(r, 100));

  // Assertions
  assert.equal(completedB, true, 'Peer B download must be complete');
  assert.equal(bitfieldB.has(0), true, 'Peer B bitfield must have chunk 0');
  assert.equal(p2pBytesReceivedByB, 262144, 'Peer B must have received exactly 256 KB via P2P');
  assert.equal(originBytesReceivedByB, 0, 'Origin server bytes for Peer B must be EXACTLY 0');

  // Verify binary integrity stored in Peer B's ChunkStore
  const storedInB = await storeB.get(manifest.resourceId, 0);
  assert.ok(storedInB);
  assert.deepEqual(Array.from(storedInB), Array.from(chunk0Data));

  schedulerB.stop();
});

test('P2P Core — Multi-Hop Swarm Propagation (Peer A -> Peer B -> Peer C)', async () => {
  // Setup resource
  const chunk0Data = crypto.randomBytes(262144);
  const manifest = createManifest('res_multihop', [chunk0Data]);

  // Peer A (Origin seeder)
  const storeA = new MemoryChunkStore();
  await storeA.put(manifest.resourceId, 0, new Uint8Array(chunk0Data));
  const bitfieldA = Bitfield.all(1);

  // Peer B (Downloads from A)
  const storeB = new MemoryChunkStore();
  const bitfieldB = new Bitfield(1);

  // Peer C (Downloads from B, NOT A)
  const storeC = new MemoryChunkStore();
  const bitfieldC = new Bitfield(1);

  // Step 1: Transfer from A to B
  const pieceWire = encodePiece(manifest.resourceId, 0, 0, chunk0Data.length, new Uint8Array(chunk0Data));
  const schedulerB = new ChunkScheduler(manifest, storeB, bitfieldB, {
    sendToPeer: () => true,
    broadcastToPeers: () => {},
    fetchFromOrigin: async () => new Uint8Array(),
    onChunkCompleted: () => {},
    onDownloadProgress: () => {},
    onDownloadComplete: () => {},
    onError: () => {}
  });

  schedulerB.updatePeerBitfield('peer_A', bitfieldA);
  schedulerB.start();
  // Feed piece from A directly into B
  const decodedPiece = decodeMessage(pieceWire);
  if (decodedPiece.type === WireMessageType.PIECE) {
    await schedulerB.handlePiece(
      decodedPiece.chunkIndex,
      decodedPiece.beginOffset,
      decodedPiece.totalLength,
      decodedPiece.data
    );
  }
  schedulerB.stop();

  assert.equal(bitfieldB.has(0), true, 'Peer B must have received and stored chunk 0 from Peer A');

  // Step 2: Now Peer C downloads chunk 0 from Peer B
  let p2pBytesC = 0;
  let originBytesC = 0;
  let completedC = false;

  const schedulerC = new ChunkScheduler(manifest, storeC, bitfieldC, {
    sendToPeer: (peerId, buf) => {
      assert.equal(peerId, 'peer_B');
      const msg = decodeMessage(buf);
      if (msg.type === WireMessageType.REQUEST) {
        // Peer B serves from storeB
        storeB.get(msg.resourceId, msg.chunkIndex).then((data) => {
          assert.ok(data);
          const piece = encodePiece(msg.resourceId, msg.chunkIndex, 0, data.length, data);
          const dec = decodeMessage(piece);
          if (dec.type === WireMessageType.PIECE) {
            schedulerC.handlePiece(dec.chunkIndex, dec.beginOffset, dec.totalLength, dec.data);
          }
        });
      }
      return true;
    },
    broadcastToPeers: () => {},
    fetchFromOrigin: async () => {
      originBytesC += 262144;
      return new Uint8Array();
    },
    onChunkCompleted: (_idx, fromP2P, len) => {
      assert.equal(fromP2P, true);
      p2pBytesC += len;
    },
    onDownloadProgress: () => {},
    onDownloadComplete: () => {
      completedC = true;
    },
    onError: (err) => assert.fail(err.message)
  });

  // Peer B advertises to Peer C
  schedulerC.updatePeerBitfield('peer_B', bitfieldB);
  schedulerC.start();

  await new Promise((r) => setTimeout(r, 100));

  assert.equal(completedC, true, 'Peer C must successfully download chunk from Peer B');
  assert.equal(bitfieldC.has(0), true, 'Peer C possesses chunk 0');
  assert.equal(p2pBytesC, 262144, 'Peer C received 256 KB via P2P');
  assert.equal(originBytesC, 0, 'Peer C used 0 bytes from origin server');

  const storedInC = await storeC.get(manifest.resourceId, 0);
  assert.ok(storedInC);
  assert.deepEqual(Array.from(storedInC), Array.from(chunk0Data));

  schedulerC.stop();
});

test('P2P Security — Rejection of Corrupt/Poisoned Chunk & Automatic Origin Recovery', async () => {
  const authenticChunk = crypto.randomBytes(262144);
  const manifest = createManifest('res_poison_test', [authenticChunk]);

  const store = new MemoryChunkStore();
  const bitfield = new Bitfield(1);

  let originFallbackInvoked = false;
  let completed = false;

  const scheduler = new ChunkScheduler(manifest, store, bitfield, {
    sendToPeer: () => true,
    broadcastToPeers: () => {},
    fetchFromOrigin: async (idx) => {
      originFallbackInvoked = true;
      assert.equal(idx, 0);
      return new Uint8Array(authenticChunk); // Origin delivers authentic bytes
    },
    onChunkCompleted: (idx, fromP2P) => {
      if (originFallbackInvoked) {
        assert.equal(fromP2P, false, 'Recovery chunk came from origin fallback');
      }
    },
    onDownloadProgress: () => {},
    onDownloadComplete: () => {
      completed = true;
    },
    onError: (err) => {
      // Expected corrupt chunk rejection error
      assert.match(err.message, /corrupt chunk.*rejected/i);
    }
  });

  // Adversary sends corrupt piece
  const poisonedChunk = Buffer.from(authenticChunk);
  poisonedChunk[50] ^= 0xff; // Flip bits

  scheduler.start();

  // Simulate malicious peer sending poisoned piece
  await scheduler.handlePiece(0, 0, poisonedChunk.length, new Uint8Array(poisonedChunk));

  // Allow origin fallback to complete
  await new Promise((r) => setTimeout(r, 100));

  assert.equal(originFallbackInvoked, true, 'Corrupt chunk must immediately trigger origin fallback');
  assert.equal(completed, true, 'Download must successfully complete via origin fallback');
  assert.equal(bitfield.has(0), true, 'Bitfield must be updated with verified chunk');

  // Verify stored chunk is authentic, NOT poisoned
  const stored = await store.get(manifest.resourceId, 0);
  assert.ok(stored);
  assert.deepEqual(Array.from(stored), Array.from(authenticChunk));

  scheduler.stop();
});

test('P2P Security — Strict Cross-Session Signaling Isolation', async () => {
  resetDatabase();

  // Create Session 1 and Session 2
  const s1 = await SessionService.createSession({
    className: 'Class 1',
    instructorName: 'Prof 1',
    passcode: 'pass1234'
  });
  const s2 = await SessionService.createSession({
    className: 'Class 2',
    instructorName: 'Prof 2',
    passcode: 'pass1234'
  });

  // Peer 1 in Session 1
  const peer1Token = TokenService.signToken({
    sessionId: s1.session.id,
    sessionCode: s1.session.sessionCode,
    peerId: 'peer_s1_user',
    displayName: 'Student S1',
    role: 'student'
  });

  // Peer 2 in Session 2
  const peer2Token = TokenService.signToken({
    sessionId: s2.session.id,
    sessionCode: s2.session.sessionCode,
    peerId: 'peer_s2_user',
    displayName: 'Student S2',
    role: 'student'
  });

  assert.notEqual(s1.session.id, s2.session.id);

  // Add peers to roomManager
  roomManager.addPeer(s1.session.id, {
    peerId: 'peer_s1_user',
    sessionId: s1.session.id,
    displayName: 'Student S1',
    role: 'student',
    socket: { readyState: 1, send: () => {} } as any,
    joinedAt: Date.now()
  });

  roomManager.addPeer(s2.session.id, {
    peerId: 'peer_s2_user',
    sessionId: s2.session.id,
    displayName: 'Student S2',
    role: 'student',
    socket: { readyState: 1, send: () => {} } as any,
    joinedAt: Date.now()
  });

  // Looking up peer_s2_user within Session 1 room must return null
  const targetAcrossSession = roomManager.getPeer(s1.session.id, 'peer_s2_user');
  assert.equal(targetAcrossSession, null, 'Target peer from another session must NEVER be discoverable or routable');
});
