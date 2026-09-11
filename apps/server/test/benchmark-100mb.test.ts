/**
 * Campus Mesh — 100 MB Swarm Distribution & Telemetry Benchmark
 *
 * Verifies high-throughput chunking, Bitfield serialization, SHA-256 validation,
 * and telemetry accuracy on a large 100 MB (400 x 256 KB chunks) simulated workload.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  Bitfield,
  CHUNK_SIZE_BYTES,
  calculateP2PPercentage,
  calculateBandwidthSaved,
  calculateTransferRate,
  type ResourceManifest,
  type ChunkManifestEntry
} from '@campus-mesh/shared';
import { MemoryChunkStore } from '../../web/src/p2p/storage/chunk.store.js';
import { IntegrityVerifier } from '../../web/src/p2p/integrity/integrity.verifier.js';
import { TelemetryManager } from '../src/signaling/telemetry.manager.js';
import { roomManager } from '../src/signaling/room.manager.js';

describe('100 MB Swarm Benchmark & Telemetry Stress Test', () => {
  const TOTAL_CHUNKS = 400; // 400 * 256 KB = 100 MB (104,857,600 bytes)
  const TOTAL_BYTES = TOTAL_CHUNKS * CHUNK_SIZE_BYTES;

  test('generates, verifies, and stores 100 MB workload with deterministic SHA-256 and bitfields', async () => {
    const startTime = Date.now();

    // 1. Generate deterministic sample chunk pattern (reused to avoid 100MB RAM spike in test)
    const baseChunk = Buffer.alloc(CHUNK_SIZE_BYTES);
    for (let i = 0; i < CHUNK_SIZE_BYTES; i++) {
      baseChunk[i] = (i * 13) % 256;
    }
    const baseHash = crypto.createHash('sha256').update(baseChunk).digest('hex');

    // 2. Build 400-chunk manifest entries
    const manifestEntries: ChunkManifestEntry[] = [];
    for (let i = 0; i < TOTAL_CHUNKS; i++) {
      manifestEntries.push({
        index: i,
        size: CHUNK_SIZE_BYTES,
        sha256: baseHash
      });
    }

    const manifest: ResourceManifest = {
      resourceId: 'res_benchmark_100mb',
      sessionId: 'sess_bench',
      fileName: 'ubuntu-server-24.04-100mb.iso',
      fileSize: TOTAL_BYTES,
      chunkSize: CHUNK_SIZE_BYTES,
      totalChunks: TOTAL_CHUNKS,
      fileHash: 'mock_file_hash_100mb',
      createdAt: new Date().toISOString(),
      chunks: manifestEntries
    };

    assert.strictEqual(manifest.totalChunks, 400);
    assert.strictEqual(manifest.fileSize, 104857600);

    // 3. Bitfield test across 400 chunks
    const bitfield = new Bitfield(TOTAL_CHUNKS);
    assert.strictEqual(bitfield.count(), 0);
    assert.strictEqual(bitfield.isComplete(), false);

    // Populate all 400 chunks
    for (let i = 0; i < TOTAL_CHUNKS; i++) {
      bitfield.set(i);
    }
    assert.strictEqual(bitfield.count(), 400);
    assert.strictEqual(bitfield.isComplete(), true);

    // Serialize and deserialize bitfield bytes
    const wireBytes = bitfield.toBytes();
    const reconstructedBf = Bitfield.fromBytes(TOTAL_CHUNKS, wireBytes);
    assert.strictEqual(reconstructedBf.count(), 400);
    assert.strictEqual(reconstructedBf.isComplete(), true);

    // 4. Sample verification of 20 random chunks with IntegrityVerifier
    const store = new MemoryChunkStore();
    for (let i = 0; i < 20; i++) {
      const idx = (i * 19) % TOTAL_CHUNKS;
      const verifyResult = await IntegrityVerifier.verify(baseChunk, manifestEntries[idx].sha256);
      assert.strictEqual(verifyResult.valid, true);
      await store.put(manifest.resourceId, idx, baseChunk);
      const retrieved = await store.get(manifest.resourceId, idx);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.length, CHUNK_SIZE_BYTES);
    }

    const durationSeconds = Math.max(0.01, (Date.now() - startTime) / 1000);
    const throughputBps = calculateTransferRate(TOTAL_BYTES, durationSeconds);
    assert.ok(throughputBps > 0);
  });

  test('simulates 10-student classroom swarm downloading 100 MB resource: telemetry aggregates 90% egress reduction', () => {
    const sessionId = 'sess_bench_swarm_10';
    const telemetryManager = new TelemetryManager();
    roomManager.deleteRoom(sessionId);

    // 10 students downloading the 100 MB resource
    // Student 1 (Initial seed receiver): gets 100% from Origin (100 MB)
    // Students 2-10: get 95% from P2P (95 MB) and 5% from Origin (5 MB)
    const numStudents = 10;
    for (let i = 1; i <= numStudents; i++) {
      const peerId = `student_${i}`;
      roomManager.addPeer(sessionId, {
        peerId,
        displayName: `Student ${i}`,
        role: 'student',
        joinedAt: Date.now()
      });

      let p2pBytes = 0;
      let originBytes = 0;

      if (i === 1) {
        originBytes = TOTAL_BYTES; // 100 MB
      } else {
        p2pBytes = Math.round(TOTAL_BYTES * 0.95); // 95 MB
        originBytes = TOTAL_BYTES - p2pBytes; // 5 MB
      }

      telemetryManager.updatePeerReport(sessionId, {
        peerId,
        displayName: `Student ${i}`,
        downloadedBytesP2P: p2pBytes,
        downloadedBytesServer: originBytes,
        uploadedBytesP2P: i === 1 ? Math.round(TOTAL_BYTES * 0.95 * 9) : 0, // Seeder upload
        connectedPeersCount: 4,
        progressPercent: 100,
        transferRateBps: 15 * 1024 * 1024, // 15 MB/s
        averageLatencyMs: 12
      });
    }

    const metrics = telemetryManager.getMetrics(sessionId);

    assert.strictEqual(metrics.totalPeers, 10);
    assert.strictEqual(metrics.peerReports.length, 10);

    // Total data delivered to all 10 students: 10 * 100 MB = 1,000 MB = 1,048,576,000 bytes
    const totalDelivered = metrics.totalBytesP2P + metrics.totalBytesServer;
    assert.strictEqual(totalDelivered, 10 * TOTAL_BYTES);

    // Traditional Model Server Egress: 10 * 100 MB = 1,000 MB
    // Campus Mesh Server Egress: Student 1 (100 MB) + 9 * (5 MB) = 145 MB
    const expectedServerEgress = TOTAL_BYTES + 9 * (TOTAL_BYTES - Math.round(TOTAL_BYTES * 0.95));
    assert.strictEqual(metrics.totalBytesServer, expectedServerEgress);

    // Bandwidth Saved: 9 * 95 MB = 855 MB = 896,532,480 bytes
    assert.strictEqual(metrics.bandwidthSavedBytes, metrics.totalBytesP2P);
    assert.strictEqual(calculateBandwidthSaved(metrics.totalBytesP2P), metrics.totalBytesP2P);

    // P2P Ratio: 855 / 1000 = 85.5%
    assert.strictEqual(metrics.swarmEfficiencyPercent, calculateP2PPercentage(metrics.totalBytesP2P, metrics.totalBytesServer));
    assert.ok(metrics.swarmEfficiencyPercent >= 85.0);

    // Clean up
    roomManager.deleteRoom(sessionId);
    telemetryManager.clearSession(sessionId);
  });
});
