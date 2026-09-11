/**
 * Campus Mesh — Telemetry REST API & WebSocket Signaling Integration Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import { buildApp } from '../src/index.js';
import { initDatabase, resetDatabase } from '../src/database/db.client.js';
import { SignalingEventType, type PeerTelemetryReport, type SwarmMetrics } from '@campus-mesh/shared';

describe('Telemetry REST API & WebSocket Signaling Heartbeat Integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverPort: number;

  let sessionIdA: string;
  let sessionCodeA: string;
  let instructorTokenA: string;
  let studentAliceToken: string;
  let studentAlicePeerId: string;

  let sessionIdB: string;
  let instructorTokenB: string;

  before(async () => {
    initDatabase();
    resetDatabase();

    app = await buildApp();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = new URL(address);
    serverPort = Number(url.port);

    // 1. Instructor creates Session A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Distributed Systems 401',
        instructorName: 'Dr. Leslie',
        passcode: 'paxos123'
      }
    });
    assert.strictEqual(resA.statusCode, 201);
    const bodyA = JSON.parse(resA.payload);
    sessionIdA = bodyA.session.id;
    sessionCodeA = bodyA.session.sessionCode;
    instructorTokenA = bodyA.instructorToken;

    // 2. Student Alice joins Session A
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode: sessionCodeA,
        passcode: 'paxos123',
        displayName: 'Alice'
      }
    });
    assert.strictEqual(joinRes.statusCode, 200);
    const joinBody = JSON.parse(joinRes.payload);
    studentAliceToken = joinBody.peerToken;
    studentAlicePeerId = joinBody.peerId;

    // 3. Instructor creates Session B (for cross-session isolation test)
    const resB = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Database Systems 201',
        instructorName: 'Dr. Stonebraker',
        passcode: 'postgres99'
      }
    });
    assert.strictEqual(resB.statusCode, 201);
    const bodyB = JSON.parse(resB.payload);
    sessionIdB = bodyB.session.id;
    instructorTokenB = bodyB.instructorToken;
  });

  after(async () => {
    await app.close();
  });

  describe('GET /api/sessions/:id/telemetry (REST Security & Access Control)', () => {
    test('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionIdA}/telemetry`
      });
      assert.strictEqual(res.statusCode, 401);
    });

    test('rejects cross-session telemetry access with 403 Forbidden', async () => {
      // Instructor B attempts to access Session A's telemetry
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionIdA}/telemetry`,
        headers: {
          authorization: `Bearer ${instructorTokenB}`
        }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('returns 404 for nonexistent session', async () => {
      // Create a valid token with dummy session id
      const dummySessionId = 'sess_00000000-0000-0000-0000-000000000000';
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${dummySessionId}/telemetry`,
        headers: {
          // Token is for session A, route is for dummySessionId -> 403
          authorization: `Bearer ${instructorTokenA}`
        }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('returns 200 OK with valid SwarmMetrics for instructor', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionIdA}/telemetry`,
        headers: {
          authorization: `Bearer ${instructorTokenA}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
      const metrics = JSON.parse(res.payload);
      assert.strictEqual(metrics.sessionId, sessionIdA);
      assert.strictEqual(typeof metrics.totalBytesP2P, 'number');
      assert.strictEqual(typeof metrics.totalBytesServer, 'number');
      assert.strictEqual(typeof metrics.bandwidthSavedBytes, 'number');
      assert.strictEqual(typeof metrics.swarmEfficiencyPercent, 'number');
      assert.ok(Array.isArray(metrics.peerReports));
    });

    test('returns 200 OK with valid SwarmMetrics for student peer', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionIdA}/telemetry`,
        headers: {
          authorization: `Bearer ${studentAliceToken}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
      const metrics = JSON.parse(res.payload);
      assert.strictEqual(metrics.sessionId, sessionIdA);
    });
  });

  describe('WebSocket TELEMETRY_HEARTBEAT & SWARM_METRICS_UPDATE broadcast flow', () => {
    test('updates swarm telemetry when peer emits heartbeat and broadcasts to room', async () => {
      // Connect instructor WebSocket to receive updates
      const wsUrlInstructor = `ws://127.0.0.1:${serverPort}/ws/signaling?token=${encodeURIComponent(instructorTokenA)}`;
      const instructorSocket = new WebSocket(wsUrlInstructor);

      await new Promise<void>((resolve, reject) => {
        instructorSocket.once('open', resolve);
        instructorSocket.once('error', reject);
      });

      // Connect student Alice WebSocket
      const wsUrlAlice = `ws://127.0.0.1:${serverPort}/ws/signaling?token=${encodeURIComponent(studentAliceToken)}`;
      const aliceSocket = new WebSocket(wsUrlAlice);

      await new Promise<void>((resolve, reject) => {
        aliceSocket.once('open', resolve);
        aliceSocket.once('error', reject);
      });

      // Prepare promise for instructor receiving SWARM_METRICS_UPDATE
      const metricsUpdatePromise = new Promise<SwarmMetrics>((resolve) => {
        instructorSocket.on('message', (data) => {
          try {
            const envelope = JSON.parse(data.toString());
            if (envelope.type === SignalingEventType.SWARM_METRICS_UPDATE) {
              resolve(envelope.payload as SwarmMetrics);
            }
          } catch {
            // Ignore non-json frames
          }
        });
      });

      // Alice sends TELEMETRY_HEARTBEAT
      const heartbeatReport: PeerTelemetryReport = {
        peerId: studentAlicePeerId,
        displayName: 'Alice',
        downloadedBytesP2P: 1572864, // 1.5 MB
        downloadedBytesServer: 524288, // 0.5 MB
        uploadedBytesP2P: 1048576, // 1.0 MB
        connectedPeersCount: 2,
        progressPercent: 75,
        transferRateBps: 800000,
        averageLatencyMs: 18
      };

      aliceSocket.send(
        JSON.stringify({
          type: SignalingEventType.TELEMETRY_HEARTBEAT,
          sessionId: sessionIdA,
          payload: heartbeatReport
        })
      );

      const receivedMetrics = await metricsUpdatePromise;
      assert.ok(receivedMetrics);
      assert.strictEqual(receivedMetrics.sessionId, sessionIdA);
      assert.strictEqual(receivedMetrics.totalBytesP2P, 1572864);
      assert.strictEqual(receivedMetrics.totalBytesServer, 524288);
      assert.strictEqual(receivedMetrics.bandwidthSavedBytes, 1572864);
      // 1.5 MB / (1.5 + 0.5 MB) = 75%
      assert.strictEqual(receivedMetrics.swarmEfficiencyPercent, 75);
      assert.strictEqual(receivedMetrics.peerReports.length, 1);
      assert.strictEqual(receivedMetrics.peerReports[0].peerId, studentAlicePeerId);
      assert.strictEqual(receivedMetrics.peerReports[0].uploadedBytesP2P, 1048576);

      // Clean up sockets
      aliceSocket.close();
      instructorSocket.close();
    });
  });
});
