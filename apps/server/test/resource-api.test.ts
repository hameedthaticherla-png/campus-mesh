/**
 * Campus Mesh — Resource API & HTTP Chunk Streaming End-to-End Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { buildApp } from '../src/index.js';
import { initDatabase, resetDatabase } from '../src/database/db.client.js';

describe('Resource API & Origin Chunk Streaming Pipeline', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const testFileSize = 700 * 1024; // 700 KB (2.73 chunks @ 256KB)
  let testFileBuffer: Buffer;
  let expectedFileHash: string;
  let expectedChunk0Hash: string;
  let expectedChunk1Hash: string;
  let expectedChunk2Hash: string;

  let sessionId: string;
  let instructorToken: string;
  let studentToken: string;
  let resourceId: string;

  before(async () => {
    initDatabase();
    resetDatabase();

    app = await buildApp();

    // 1. Generate deterministic test file
    testFileBuffer = Buffer.alloc(testFileSize);
    for (let i = 0; i < testFileSize; i++) {
      testFileBuffer[i] = (i * 7) % 256;
    }
    expectedFileHash = crypto.createHash('sha256').update(testFileBuffer).digest('hex');
    expectedChunk0Hash = crypto.createHash('sha256').update(testFileBuffer.subarray(0, 262144)).digest('hex');
    expectedChunk1Hash = crypto.createHash('sha256').update(testFileBuffer.subarray(262144, 524288)).digest('hex');
    expectedChunk2Hash = crypto.createHash('sha256').update(testFileBuffer.subarray(524288)).digest('hex');

    // 2. Create instructor session
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Advanced Storage Systems',
        instructorName: 'Prof. Gray',
        passcode: 'storage99'
      }
    });
    assert.strictEqual(sessionRes.statusCode, 201);
    const sessionData = JSON.parse(sessionRes.payload);
    sessionId = sessionData.session.id;
    instructorToken = sessionData.instructorToken;

    // 3. Student joins session
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode: sessionData.session.sessionCode,
        passcode: 'storage99',
        displayName: 'Alice Student'
      }
    });
    assert.strictEqual(joinRes.statusCode, 200);
    const joinData = JSON.parse(joinRes.payload);
    studentToken = joinData.peerToken;
  });

  after(async () => {
    await app.close();
  });

  function createMultipartPayload(fieldName: string, filename: string, content: Buffer) {
    const boundary = '----CampusMeshTestBoundary' + crypto.randomBytes(8).toString('hex');
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([Buffer.from(header), content, Buffer.from(footer)]);
    return {
      payload,
      contentType: `multipart/form-data; boundary=${boundary}`
    };
  }

  test('POST /api/sessions/:id/resources: instructor uploads valid resource payload', async () => {
    const multipart = createMultipartPayload('file', 'ubuntu-setup.iso', testFileBuffer);

    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/resources`,
      headers: {
        authorization: `Bearer ${instructorToken}`,
        'content-type': multipart.contentType
      },
      payload: multipart.payload
    });

    assert.strictEqual(uploadRes.statusCode, 201);
    const body = JSON.parse(uploadRes.payload);
    assert.ok(body.resource);
    assert.ok(body.resource.id.startsWith('res_'));
    assert.strictEqual(body.resource.fileName, 'ubuntu-setup.iso');
    assert.strictEqual(body.resource.fileSize, testFileSize);
    assert.strictEqual(body.resource.totalChunks, 3);
    assert.strictEqual(body.resource.fileHash, expectedFileHash);
    assert.strictEqual(body.resource.status, 'ready');

    resourceId = body.resource.id;
  });

  test('POST /api/sessions/:id/resources: student is rejected with 403 Forbidden', async () => {
    const multipart = createMultipartPayload('file', 'hacker.iso', Buffer.from('data'));

    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/resources`,
      headers: {
        authorization: `Bearer ${studentToken}`,
        'content-type': multipart.contentType
      },
      payload: multipart.payload
    });

    assert.strictEqual(uploadRes.statusCode, 403);
  });

  test('POST /api/sessions/:id/resources: rejects 0-byte empty files with 400 Bad Request', async () => {
    const multipart = createMultipartPayload('file', 'empty.iso', Buffer.alloc(0));

    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/resources`,
      headers: {
        authorization: `Bearer ${instructorToken}`,
        'content-type': multipart.contentType
      },
      payload: multipart.payload
    });

    assert.strictEqual(uploadRes.statusCode, 400);
  });

  test('GET /api/sessions/:id/resources: student can list ready resources', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/resources`,
      headers: {
        authorization: `Bearer ${studentToken}`
      }
    });

    assert.strictEqual(listRes.statusCode, 200);
    const body = JSON.parse(listRes.payload);
    assert.ok(Array.isArray(body.resources));
    assert.strictEqual(body.resources.length, 1);
    assert.strictEqual(body.resources[0].id, resourceId);
    assert.strictEqual(body.resources[0].fileHash, expectedFileHash);
  });

  test('GET /api/resources/:id/manifest: returns deterministic chunk manifest with hashes', async () => {
    const manifestRes = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/manifest`,
      headers: {
        authorization: `Bearer ${studentToken}`
      }
    });

    assert.strictEqual(manifestRes.statusCode, 200);
    const manifest = JSON.parse(manifestRes.payload);
    assert.strictEqual(manifest.resourceId, resourceId);
    assert.strictEqual(manifest.fileSize, testFileSize);
    assert.strictEqual(manifest.totalChunks, 3);
    assert.strictEqual(manifest.fileHash, expectedFileHash);

    assert.strictEqual(manifest.chunks.length, 3);
    assert.strictEqual(manifest.chunks[0].sha256, expectedChunk0Hash);
    assert.strictEqual(manifest.chunks[1].sha256, expectedChunk1Hash);
    assert.strictEqual(manifest.chunks[2].sha256, expectedChunk2Hash);
  });

  test('GET /api/resources/:id/chunks/:index: streams exact chunk slices with security headers', async () => {
    // 1. Chunk 0
    const chunk0Res = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/0`,
      headers: { authorization: `Bearer ${studentToken}` }
    });

    assert.strictEqual(chunk0Res.statusCode, 200);
    assert.strictEqual(chunk0Res.headers['content-length'], '262144');
    assert.strictEqual(chunk0Res.headers['x-chunk-sha256'], expectedChunk0Hash);
    assert.strictEqual(chunk0Res.headers['x-chunk-index'], '0');
    assert.strictEqual(chunk0Res.headers['x-total-chunks'], '3');
    // Verify exact bytes
    assert.deepStrictEqual(chunk0Res.rawPayload, testFileBuffer.subarray(0, 262144));

    // 2. Chunk 1
    const chunk1Res = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/1`,
      headers: { authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(chunk1Res.statusCode, 200);
    assert.strictEqual(chunk1Res.headers['content-length'], '262144');
    assert.strictEqual(chunk1Res.headers['x-chunk-sha256'], expectedChunk1Hash);
    assert.deepStrictEqual(chunk1Res.rawPayload, testFileBuffer.subarray(262144, 524288));

    // 3. Final Partial Chunk 2 (700KB - 512KB = 188KB = 192,512 bytes)
    const chunk2Res = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/2`,
      headers: { authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(chunk2Res.statusCode, 200);
    const expectedChunk2Length = String(testFileSize - 524288);
    assert.strictEqual(chunk2Res.headers['content-length'], expectedChunk2Length);
    assert.strictEqual(chunk2Res.headers['x-chunk-sha256'], expectedChunk2Hash);
    assert.deepStrictEqual(chunk2Res.rawPayload, testFileBuffer.subarray(524288));
  });

  test('GET /api/resources/:id/chunks/:index: rejects invalid and out-of-bounds indices', async () => {
    // Negative index -> 400
    const negRes = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/-1`,
      headers: { authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(negRes.statusCode, 400);

    // Non-numeric index -> 400
    const nanRes = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/abc`,
      headers: { authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(nanRes.statusCode, 400);

    // Out of bounds: index == totalChunks -> 404
    const oobRes = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/3`,
      headers: { authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(oobRes.statusCode, 404);
  });

  test('Cross-Session Security: student in Session B cannot access Session A resource', async () => {
    // Create Session B
    const sessionBRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Different Class',
        instructorName: 'Prof. Hopper',
        passcode: 'hopper123'
      }
    });
    const sessionBData = JSON.parse(sessionBRes.payload);

    // Student B joins Session B
    const joinBRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode: sessionBData.session.sessionCode,
        passcode: 'hopper123',
        displayName: 'Bob in Class B'
      }
    });
    const studentBToken = JSON.parse(joinBRes.payload).peerToken;

    // Student B attempts to access Session A's resource manifest
    const manifestAttempt = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/manifest`,
      headers: { authorization: `Bearer ${studentBToken}` }
    });
    assert.strictEqual(manifestAttempt.statusCode, 403, 'Cross-session manifest access must return 403 Forbidden');

    // Student B attempts to download Session A's chunk 0
    const chunkAttempt = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/0`,
      headers: { authorization: `Bearer ${studentBToken}` }
    });
    assert.strictEqual(chunkAttempt.statusCode, 403, 'Cross-session chunk access must return 403 Forbidden');
  });

  test('Session Termination Integration: ended session immediately revokes chunk access', async () => {
    // Instructor ends Session A
    const endRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/end`,
      headers: { authorization: `Bearer ${instructorToken}` }
    });
    assert.strictEqual(endRes.statusCode, 200);

    // Student A attempts to download chunk 0 from ended session
    const chunkAttempt = await app.inject({
      method: 'GET',
      url: `/api/resources/${resourceId}/chunks/0`,
      headers: { authorization: `Bearer ${studentToken}` }
    });
    assert.ok(
      chunkAttempt.statusCode === 404 || chunkAttempt.statusCode === 410,
      'Access must be revoked once session ends'
    );
  });

  test('DELETE /api/resources/:id: instructor deletes resource, revoking access', async () => {
    // Create new session and upload resource
    const sRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Delete Test Class',
        instructorName: 'Dr. Knuth',
        passcode: 'tex1234'
      }
    });
    const sData = JSON.parse(sRes.payload);
    const insToken = sData.instructorToken;

    const multipart = createMultipartPayload('file', 'temp-to-delete.bin', Buffer.from('hello world'));
    const upRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sData.session.id}/resources`,
      headers: {
        authorization: `Bearer ${insToken}`,
        'content-type': multipart.contentType
      },
      payload: multipart.payload
    });
    assert.strictEqual(upRes.statusCode, 201);
    const resId = JSON.parse(upRes.payload).resource.id;

    // Delete resource
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/resources/${resId}`,
      headers: { authorization: `Bearer ${insToken}` }
    });
    assert.strictEqual(delRes.statusCode, 200);

    // Subsequent chunk request must return 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/resources/${resId}/chunks/0`,
      headers: { authorization: `Bearer ${insToken}` }
    });
    assert.strictEqual(getRes.statusCode, 404);
  });
});
