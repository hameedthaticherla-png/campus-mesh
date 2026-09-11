/**
 * Campus Mesh — Phase 6 Final Hardening, Edge-Case Resilience & Attack Test Suite
 *
 * Hardening Tests:
 * 1. Auth & Privilege Escalation (student attempting instructor operations)
 * 2. Token Security (tampered signature, expired tokens)
 * 3. Session Isolation Attacks (cross-session resources, manifests, chunks, telemetry)
 * 4. Path Traversal & Parameter Injection Attacks (../, ..\, /etc/passwd, negative/decimal chunk indexes)
 * 5. Resource Upload Constraints (empty file rejection, filename sanitization)
 * 6. Storage Confinement Defense (path escaping storage directory)
 * 7. P2P Chunk Poisoning Defense (corrupted chunks rejected, not saved, not advertised, recovered via origin)
 * 8. Download Reassembly & Whole-File SHA-256 Byte-for-Byte Verification
 * 9. Session Termination Memory Cleanup (telemetryManager & roomManager zero leakage)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { buildApp } from '../src/index.js';
import { initDatabase, resetDatabase } from '../src/database/db.client.js';
import { config } from '../src/config/env.config.js';
import { TokenService } from '../src/auth/token.service.js';
import { SessionService } from '../src/sessions/session.service.js';
import { ResourceService } from '../src/resources/resource.service.js';
import { ChunkCalculator } from '../src/resources/chunk.calculator.js';
import { localStorageProvider } from '../src/storage/local-disk.storage.js';
import { telemetryManager } from '../src/signaling/telemetry.manager.js';
import { roomManager } from '../src/signaling/room.manager.js';
import { IntegrityVerifier } from '../../web/src/p2p/integrity/integrity.verifier.js';
import { MemoryChunkStore } from '../../web/src/p2p/storage/chunk.store.js';
import { ChunkScheduler } from '../../web/src/p2p/scheduler/ChunkScheduler.js';
import {
  type ResourceManifest,
  Bitfield,
  CHUNK_SIZE_BYTES
} from '@campus-mesh/shared';

describe('Phase 6 — Final Hardening & Attack Resistance Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  let sessionAId: string;
  let sessionACode: string;
  let instructorAToken: string;
  let studentA1Token: string;
  let studentA1PeerId: string;

  let sessionBId: string;
  let sessionBCode: string;
  let instructorBToken: string;
  let studentB1Token: string;

  let resourceAId: string;
  let resourceAFileSize: number;
  let resourceAFileHash: string;
  let resourceAChunks: Buffer[] = [];

  before(async () => {
    initDatabase();
    resetDatabase();
    telemetryManager.reset();
    roomManager.reset();

    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });

    // 1. Create Session A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Computer Architecture 301',
        instructorName: 'Prof. Patterson',
        passcode: 'mips32pass'
      }
    });
    assert.strictEqual(resA.statusCode, 201);
    const bodyA = JSON.parse(resA.payload);
    sessionAId = bodyA.session.id;
    sessionACode = bodyA.session.sessionCode;
    instructorAToken = bodyA.instructorToken;

    // 2. Student A1 joins Session A
    const joinA = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode: sessionACode,
        passcode: 'mips32pass',
        displayName: 'Student A1'
      }
    });
    assert.strictEqual(joinA.statusCode, 200);
    const bodyJoinA = JSON.parse(joinA.payload);
    studentA1Token = bodyJoinA.peerToken;
    studentA1PeerId = bodyJoinA.peerId;

    // 3. Create Session B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Operating Systems 401',
        instructorName: 'Prof. Tanenbaum',
        passcode: 'minixpass'
      }
    });
    assert.strictEqual(resB.statusCode, 201);
    const bodyB = JSON.parse(resB.payload);
    sessionBId = bodyB.session.id;
    sessionBCode = bodyB.session.sessionCode;
    instructorBToken = bodyB.instructorToken;

    // 4. Student B1 joins Session B
    const joinB = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode: sessionBCode,
        passcode: 'minixpass',
        displayName: 'Student B1'
      }
    });
    assert.strictEqual(joinB.statusCode, 200);
    const bodyJoinB = JSON.parse(joinB.payload);
    studentB1Token = bodyJoinB.peerToken;

    // 5. Upload a multi-chunk resource to Session A (3 chunks: 256 KB + 256 KB + 100 KB = 612 KB)
    const chunk0 = crypto.randomBytes(262144);
    const chunk1 = crypto.randomBytes(262144);
    const chunk2 = crypto.randomBytes(102400);
    resourceAChunks = [chunk0, chunk1, chunk2];
    const fullBuffer = Buffer.concat(resourceAChunks);
    resourceAFileSize = fullBuffer.length;
    resourceAFileHash = crypto.createHash('sha256').update(fullBuffer).digest('hex');

    // Simulate multipart upload using boundaries
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const payloadBuffer = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="riscv_toolchain.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`
      ),
      fullBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionAId}/resources`,
      headers: {
        authorization: `Bearer ${instructorAToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: payloadBuffer
    });
    assert.strictEqual(uploadRes.statusCode, 201);
    const uploadBody = JSON.parse(uploadRes.payload);
    resourceAId = uploadBody.resource.id;
    assert.strictEqual(uploadBody.resource.totalChunks, 3);
  });

  after(async () => {
    await app.close();
  });

  describe('1. Authentication & Privilege Escalation Hardening', () => {
    test('rejects expired JWT session tokens with 401', async () => {
      // Sign token expired 1 hour ago
      const expiredToken = jwt.sign(
        {
          sessionId: sessionAId,
          role: 'student',
          peerId: 'peer_expired',
          sessionCode: sessionACode
        },
        config.jwtSecret,
        { expiresIn: -3600 }
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionAId}`,
        headers: { authorization: `Bearer ${expiredToken}` }
      });
      assert.strictEqual(res.statusCode, 401);
      const body = JSON.parse(res.payload);
      assert.match(body.message, /invalid or expired/i);
    });

    test('rejects tampered JWT session tokens with 401', async () => {
      // Sign with a rogue secret
      const rogueToken = jwt.sign(
        {
          sessionId: sessionAId,
          role: 'instructor'
        },
        'malicious_rogue_secret_key_that_does_not_match'
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionAId}`,
        headers: { authorization: `Bearer ${rogueToken}` }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    test('blocks student attempting instructor upload (HTTP 403)', async () => {
      const boundary = '----WebKitFormBoundaryTest';
      const payloadBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="hack.bin"\r\n\r\n`),
        Buffer.from('hello world'),
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionAId}/resources`,
        headers: {
          authorization: `Bearer ${studentA1Token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`
        },
        payload: payloadBuffer
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('blocks student attempting instructor resource deletion (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/resources/${resourceAId}`,
        headers: { authorization: `Bearer ${studentA1Token}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('blocks student attempting instructor session termination (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionAId}/end`,
        headers: { authorization: `Bearer ${studentA1Token}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('blocks student attempting demo telemetry reset (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionAId}/telemetry/reset`,
        headers: { authorization: `Bearer ${studentA1Token}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('2. Cross-Session Isolation Attacks', () => {
    test('blocks Student B1 from listing Session A resources (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionAId}/resources`,
        headers: { authorization: `Bearer ${studentB1Token}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('blocks Student B1 from retrieving Session A resource manifest (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/resources/${resourceAId}/manifest`,
        headers: { authorization: `Bearer ${studentB1Token}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('blocks Student B1 from streaming Session A chunk 0 (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/resources/${resourceAId}/chunks/0`,
        headers: { authorization: `Bearer ${studentB1Token}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('blocks Student B1 from accessing Session A telemetry (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionAId}/telemetry`,
        headers: { authorization: `Bearer ${studentB1Token}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('blocks Instructor B from deleting Session A resource (HTTP 403)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/resources/${resourceAId}`,
        headers: { authorization: `Bearer ${instructorBToken}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('3. Resource Storage & Path Traversal Attacks', () => {
    test('blocks directory traversal attempts in chunk index (HTTP 400)', async () => {
      const maliciousIndexes = [
        '../0',
        '..\\0',
        '%2e%2e/0',
        '../../etc/passwd',
        '0/../../etc',
        'C:\\Windows\\System32',
        '/etc/passwd'
      ];

      for (const badIdx of maliciousIndexes) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/resources/${resourceAId}/chunks/${encodeURIComponent(badIdx)}`,
          headers: { authorization: `Bearer ${studentA1Token}` }
        });
        assert.strictEqual(res.statusCode, 400, `Path traversal index "${badIdx}" should return 400 Bad Request`);
      }
    });

    test('blocks invalid chunk index types (negative, decimal, NaN, huge out of range)', async () => {
      const invalidIndexes = [
        { idx: '-1', expectedStatus: 400 },
        { idx: '1.5', expectedStatus: 400 },
        { idx: 'abc', expectedStatus: 400 },
        { idx: 'NaN', expectedStatus: 400 },
        { idx: '999999', expectedStatus: 404 } // Out of bounds for 3-chunk resource
      ];

      for (const item of invalidIndexes) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/resources/${resourceAId}/chunks/${item.idx}`,
          headers: { authorization: `Bearer ${studentA1Token}` }
        });
        assert.strictEqual(res.statusCode, item.expectedStatus);
      }
    });

    test('sanitizes malicious filenames during upload', () => {
      const dirtyPaths = [
        '../../../../etc/passwd',
        '..\\..\\Windows\\System32\\cmd.exe',
        'folder/subfolder/test.iso',
        '\0malicious.bin'
      ];

      for (const dirty of dirtyPaths) {
        const cleaned = ResourceService.sanitizeFilename(dirty);
        assert.ok(!cleaned.includes('/'));
        assert.ok(!cleaned.includes('\\'));
        assert.ok(!cleaned.includes('\0'));
        assert.ok(!cleaned.includes('..'));
      }
    });

    test('LocalDiskStorageProvider throws Security Violation if path escapes storageDir', async () => {
      const outsidePath = path.resolve(process.cwd(), '../outside_sensitive_file.txt');
      assert.throws(
        () => {
          localStorageProvider.createReadStream(outsidePath);
        },
        /Security Violation/i
      );
    });
  });

  describe('4. P2P Chunk Integrity & Poisoning Resilience', () => {
    test('IntegrityVerifier rejects poisoned/tampered chunk bytes', async () => {
      const validBytes = crypto.randomBytes(262144);
      const expectedHash = crypto.createHash('sha256').update(validBytes).digest('hex');

      // 1. Valid test
      const validCheck = await IntegrityVerifier.verify(new Uint8Array(validBytes), expectedHash);
      assert.strictEqual(validCheck.valid, true);

      // 2. Tamper a single bit
      const tamperedBytes = Buffer.from(validBytes);
      tamperedBytes[100] = tamperedBytes[100] ^ 0xff; // Flip bits

      const corruptCheck = await IntegrityVerifier.verify(new Uint8Array(tamperedBytes), expectedHash);
      assert.strictEqual(corruptCheck.valid, false);
      assert.notStrictEqual(corruptCheck.actualHash, expectedHash);
    });

    test('ChunkScheduler rejects corrupt chunk from peer, does NOT store, and recovers via origin', async () => {
      const chunk0 = crypto.randomBytes(262144);
      const expectedHash0 = crypto.createHash('sha256').update(chunk0).digest('hex');

      const manifest: ResourceManifest = {
        resourceId: 'res_corruption_test',
        sessionId: sessionAId,
        fileName: 'corrupt_test.bin',
        fileSize: 262144,
        chunkSize: 262144,
        totalChunks: 1,
        fileHash: expectedHash0,
        createdAt: new Date().toISOString(),
        chunks: [{ index: 0, size: 262144, sha256: expectedHash0 }]
      };

      const store = new MemoryChunkStore();
      const localBitfield = new Bitfield(1);

      let originFallbackTriggered = false;
      let corruptionReported = false;
      let broadcastHaveEmitted = false;
      let downloadCompleted = false;

      const scheduler = new ChunkScheduler(manifest, store, localBitfield, {
        sendToPeer: () => true,
        broadcastToPeers: () => {
          broadcastHaveEmitted = true;
        },
        fetchFromOrigin: async () => {
          originFallbackTriggered = true;
          return new Uint8Array(chunk0); // Clean chunk
        },
        onChunkCompleted: () => {},
        onDownloadProgress: () => {},
        onDownloadComplete: () => {
          downloadCompleted = true;
        },
        onError: () => {},
        onCorruption: () => {
          corruptionReported = true;
        }
      });

      // Peer delivers POISONED chunk
      const poisonedChunk = Buffer.from(chunk0);
      poisonedChunk[0] = poisonedChunk[0] ^ 0xff; // Corrupt byte 0

      // Simulate incoming piece
      scheduler.updatePeerHave('peer_bad', 0);
      scheduler.start();

      await scheduler.handlePiece(0, 0, 262144, new Uint8Array(poisonedChunk));

      // Assertions on corruption handling
      assert.strictEqual(corruptionReported, true, 'Scheduler must report corruption');
      assert.strictEqual(broadcastHaveEmitted, false, 'Must NOT broadcast HAVE for corrupt chunk');
      assert.strictEqual(localBitfield.has(0), false, 'Bitfield must NOT mark corrupt chunk as possessed');
      assert.strictEqual(await store.has(manifest.resourceId, 0), false, 'Store must NOT save corrupt chunk');
      assert.strictEqual(originFallbackTriggered, true, 'Scheduler must trigger fallback to origin');

      // Wait for origin fetch to resolve and complete
      await new Promise((r) => setTimeout(r, 50));

      // After origin fallback succeeds:
      assert.strictEqual(localBitfield.has(0), true, 'Bitfield marks chunk possessed after clean origin fetch');
      assert.strictEqual(await store.has(manifest.resourceId, 0), true, 'Store saved clean chunk');
      assert.strictEqual(broadcastHaveEmitted, true, 'HAVE broadcast emitted for clean verified chunk');
      assert.strictEqual(downloadCompleted, true, 'Download complete after clean recovery');

      scheduler.stop();
    });
  });

  describe('5. Download Reassembly & Whole-File SHA-256 Byte-for-Byte Verification', () => {
    test('reassembled file from chunk store is 100% byte-for-byte identical to original', async () => {
      // Populate chunkStore with the 3 chunks from resourceA
      const store = new MemoryChunkStore();
      for (let i = 0; i < resourceAChunks.length; i++) {
        await store.put(resourceAId, i, new Uint8Array(resourceAChunks[i]));
      }

      // Reassemble
      const parts: Uint8Array[] = [];
      for (let i = 0; i < resourceAChunks.length; i++) {
        const chunk = await store.get(resourceAId, i);
        assert.ok(chunk);
        parts.push(chunk);
      }

      const assembledBuffer = Buffer.concat(parts);
      assert.strictEqual(assembledBuffer.length, resourceAFileSize);

      // Verify SHA-256 matches the original file
      const assembledHash = crypto.createHash('sha256').update(assembledBuffer).digest('hex');
      assert.strictEqual(assembledHash, resourceAFileHash);
    });
  });

  describe('6. Session Termination & Memory Leak Hardening', () => {
    test('ending session deactivates room and removes all telemetry reports from memory', async () => {
      // 1. Send telemetry into Session B
      telemetryManager.updatePeerReport(sessionBId, {
        peerId: 'peer_b1',
        displayName: 'Student B1',
        downloadedBytesP2P: 500000,
        downloadedBytesServer: 100000,
        uploadedBytesP2P: 200000,
        connectedPeersCount: 1,
        progressPercent: 50,
        transferRateBps: 200000,
        averageLatencyMs: 15
      });

      const metricsBefore = telemetryManager.getMetrics(sessionBId);
      assert.strictEqual(metricsBefore.totalBytesP2P, 500000);

      // 2. Instructor B terminates Session B
      const endRes = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionBId}/end`,
        headers: { authorization: `Bearer ${instructorBToken}` }
      });
      assert.strictEqual(endRes.statusCode, 200);

      // 3. Confirm roomManager has 0 peers
      assert.strictEqual(roomManager.getRoomSize(sessionBId), 0);

      // 4. Confirm telemetryManager reports for Session B were completely cleared from memory
      const metricsAfter = telemetryManager.getMetrics(sessionBId);
      assert.strictEqual(metricsAfter.totalBytesP2P, 0);
      assert.strictEqual(metricsAfter.peerReports.length, 0);

      // 5. Subsequent access to Session B session info shows inactive (isActive = false)
      const sessionInfoRes = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionBId}`,
        headers: { authorization: `Bearer ${instructorBToken}` }
      });
      assert.strictEqual(sessionInfoRes.statusCode, 200);
      const infoBody = JSON.parse(sessionInfoRes.payload);
      assert.strictEqual(infoBody.isActive, false);

      // Accessing resources of ended session is strictly rejected with 404
      const resourcesRes = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionBId}/resources`,
        headers: { authorization: `Bearer ${instructorBToken}` }
      });
      assert.strictEqual(resourcesRes.statusCode, 404);
    });
  });
});
