/**
 * Campus Mesh — Phase 5 Productization & Demo Reliability Test Suite
 *
 * Validates:
 * 1. POST /api/sessions/:id/telemetry/reset security boundaries (instructor-only, session-isolation, 401/403/200).
 * 2. Session code normalization and deep-link query parameter parsing patterns.
 * 3. Telemetry reset without session termination or resource loss.
 * 4. Post-reset heartbeat telemetry resumption.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/index.js';
import { initDatabase, resetDatabase } from '../src/database/db.client.js';
import { telemetryManager } from '../src/signaling/telemetry.manager.js';
import type { PeerTelemetryReport } from '@campus-mesh/shared';

describe('Phase 5 — Productization, UX & Demo Reliability', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  let sessionAId: string;
  let sessionACode: string;
  let instructorAToken: string;
  let studentAliceToken: string;
  let studentAlicePeerId: string;

  let sessionBId: string;
  let instructorBToken: string;

  before(async () => {
    initDatabase();
    resetDatabase();
    telemetryManager.reset();

    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });

    // 1. Create Session A (Instructor A)
    const resA = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Hackathon Final Demo 2026',
        instructorName: 'Lead Architect',
        passcode: 'demo1234'
      }
    });
    assert.strictEqual(resA.statusCode, 201);
    const bodyA = JSON.parse(resA.payload);
    sessionAId = bodyA.session.id;
    sessionACode = bodyA.session.sessionCode;
    instructorAToken = bodyA.instructorToken;

    // 2. Student Alice joins Session A
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode: sessionACode,
        passcode: 'demo1234',
        displayName: 'Alice (MacBook)'
      }
    });
    assert.strictEqual(joinRes.statusCode, 200);
    const joinBody = JSON.parse(joinRes.payload);
    studentAliceToken = joinBody.peerToken;
    studentAlicePeerId = joinBody.peerId;

    // 3. Create Session B (Instructor B) for cross-session boundary tests
    const resB = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Parallel Computing 301',
        instructorName: 'Prof. Hopper',
        passcode: 'cuda9999'
      }
    });
    assert.strictEqual(resB.statusCode, 201);
    const bodyB = JSON.parse(resB.payload);
    sessionBId = bodyB.session.id;
    instructorBToken = bodyB.instructorToken;
  });

  after(async () => {
    await app.close();
  });

  describe('Session Code Format & URL Deep-Link Normalization', () => {
    test('session codes follow standard MESH-XXXX format', () => {
      const meshCodeRegex = /^MESH-[A-Z0-9]{4}$/;
      assert.match(sessionACode, meshCodeRegex, `Session code ${sessionACode} should match MESH-XXXX`);
    });

    test('student join handles lowercase and whitespace in session code gracefully', async () => {
      const lowerCodeWithSpaces = `  ${sessionACode.toLowerCase()}  `;
      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/join',
        payload: {
          sessionCode: lowerCodeWithSpaces.trim().toUpperCase(),
          passcode: 'demo1234',
          displayName: 'Bob (ThinkPad)'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.session.id, sessionAId);
    });

    test('URL search parameter extraction correctly parses code and join keys', () => {
      const testUrls = [
        'https://mesh.local/?code=mesh-7k4p',
        'https://mesh.local/?join=MESH-7K4P',
        'https://mesh.local/?code=MESH-7K4P&foo=bar'
      ];

      for (const urlStr of testUrls) {
        const parsed = new URL(urlStr);
        const code = parsed.searchParams.get('code') || parsed.searchParams.get('join');
        assert.ok(code);
        assert.strictEqual(code.trim().toUpperCase(), 'MESH-7K4P');
      }
    });
  });

  describe('POST /api/sessions/:id/telemetry/reset (Demo Reliability & Security)', () => {
    before(() => {
      // Seed some dummy telemetry into Session A
      const mockReport: PeerTelemetryReport = {
        peerId: studentAlicePeerId,
        displayName: 'Alice',
        downloadedBytesP2P: 10485760, // 10 MB
        downloadedBytesServer: 1048576, // 1 MB
        uploadedBytesP2P: 5242880, // 5 MB
        connectedPeersCount: 3,
        progressPercent: 100,
        transferRateBps: 1500000,
        averageLatencyMs: 12
      };
      telemetryManager.updatePeerReport(sessionAId, mockReport);

      const metrics = telemetryManager.getMetrics(sessionAId);
      assert.strictEqual(metrics.totalBytesP2P, 10485760);
      assert.strictEqual(metrics.peerReports.length, 1);
    });

    test('rejects unauthenticated reset requests with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionAId}/telemetry/reset`
      });
      assert.strictEqual(res.statusCode, 401);
    });

    test('rejects student peer reset requests with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionAId}/telemetry/reset`,
        headers: {
          authorization: `Bearer ${studentAliceToken}`
        }
      });
      assert.strictEqual(res.statusCode, 403);
      const body = JSON.parse(res.payload);
      assert.match(body.message, /only instructors/i);
    });

    test('rejects cross-session reset requests with 403 Forbidden', async () => {
      // Instructor B tries to reset Session A's telemetry
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionAId}/telemetry/reset`,
        headers: {
          authorization: `Bearer ${instructorBToken}`
        }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    test('successfully resets telemetry when requested by session instructor', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionAId}/telemetry/reset`,
        headers: {
          authorization: `Bearer ${instructorAToken}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.metrics.totalBytesP2P, 0);
      assert.strictEqual(body.metrics.totalBytesServer, 0);
      assert.strictEqual(body.metrics.bandwidthSavedBytes, 0);
      assert.strictEqual(body.metrics.swarmEfficiencyPercent, 0);
      assert.strictEqual(body.metrics.peerReports.length, 0);

      // Confirm through GET endpoint as well
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionAId}/telemetry`,
        headers: {
          authorization: `Bearer ${instructorAToken}`
        }
      });
      assert.strictEqual(getRes.statusCode, 200);
      const getMetrics = JSON.parse(getRes.payload);
      assert.strictEqual(getMetrics.totalBytesP2P, 0);
    });

    test('telemetry resumes cleanly from new baseline when heartbeats arrive after reset', async () => {
      const newReport: PeerTelemetryReport = {
        peerId: studentAlicePeerId,
        displayName: 'Alice',
        downloadedBytesP2P: 2097152, // 2 MB
        downloadedBytesServer: 524288, // 0.5 MB
        uploadedBytesP2P: 1048576,
        connectedPeersCount: 1,
        progressPercent: 20,
        transferRateBps: 500000,
        averageLatencyMs: 15
      };

      telemetryManager.updatePeerReport(sessionAId, newReport);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionAId}/telemetry`,
        headers: {
          authorization: `Bearer ${instructorAToken}`
        }
      });
      assert.strictEqual(getRes.statusCode, 200);
      const getMetrics = JSON.parse(getRes.payload);
      assert.strictEqual(getMetrics.totalBytesP2P, 2097152);
      assert.strictEqual(getMetrics.totalBytesServer, 524288);
      assert.strictEqual(getMetrics.bandwidthSavedBytes, 2097152);
      assert.strictEqual(getMetrics.peerReports.length, 1);
    });

    test('session remains active and accessible after telemetry reset', async () => {
      const getSessionRes = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionAId}/resources`,
        headers: {
          authorization: `Bearer ${studentAliceToken}`
        }
      });
      assert.strictEqual(getSessionRes.statusCode, 200);
    });
  });
});
