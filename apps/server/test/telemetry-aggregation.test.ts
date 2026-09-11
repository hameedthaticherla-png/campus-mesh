/**
 * Campus Mesh — Telemetry Manager & Swarm Aggregation Unit Tests
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TelemetryManager } from '../src/signaling/telemetry.manager.js';
import { roomManager } from '../src/signaling/room.manager.js';
import type { PeerTelemetryReport } from '@campus-mesh/shared';

describe('TelemetryManager (Server-Side Swarm Aggregation)', () => {
  let telemetryManager: TelemetryManager;
  const sessionIdA = 'session_alpha';
  const sessionIdB = 'session_beta';

  beforeEach(() => {
    telemetryManager = new TelemetryManager();
    roomManager.deleteRoom(sessionIdA);
    roomManager.deleteRoom(sessionIdB);
  });

  test('initializes with default zero metrics for empty session', () => {
    const metrics = telemetryManager.getMetrics(sessionIdA);
    assert.strictEqual(metrics.sessionId, sessionIdA);
    assert.strictEqual(metrics.totalPeers, 0);
    assert.strictEqual(metrics.activeDataChannels, 0);
    assert.strictEqual(metrics.totalBytesP2P, 0);
    assert.strictEqual(metrics.totalBytesServer, 0);
    assert.strictEqual(metrics.bandwidthSavedBytes, 0);
    assert.strictEqual(metrics.swarmEfficiencyPercent, 0);
    assert.strictEqual(metrics.peerReports.length, 0);
  });

  test('aggregates heartbeat reports across multiple students in a session', () => {
    // Mock room peers in roomManager
    roomManager.addPeer(sessionIdA, {
      peerId: 'peer_1',
      displayName: 'Student Alice',
      role: 'student',
      joinedAt: Date.now()
    });
    roomManager.addPeer(sessionIdA, {
      peerId: 'peer_2',
      displayName: 'Student Bob',
      role: 'student',
      joinedAt: Date.now()
    });
    roomManager.addPeer(sessionIdA, {
      peerId: 'peer_3',
      displayName: 'Student Charlie',
      role: 'student',
      joinedAt: Date.now()
    });

    const report1: PeerTelemetryReport = {
      peerId: 'peer_1',
      displayName: 'Student Alice',
      downloadedBytesP2P: 800 * 1024, // 800 KB
      downloadedBytesServer: 200 * 1024, // 200 KB
      uploadedBytesP2P: 400 * 1024,
      connectedPeersCount: 2,
      progressPercent: 100,
      transferRateBps: 500000,
      averageLatencyMs: 25
    };

    const report2: PeerTelemetryReport = {
      peerId: 'peer_2',
      displayName: 'Student Bob',
      downloadedBytesP2P: 900 * 1024, // 900 KB
      downloadedBytesServer: 100 * 1024, // 100 KB
      uploadedBytesP2P: 600 * 1024,
      connectedPeersCount: 2,
      progressPercent: 100,
      transferRateBps: 600000,
      averageLatencyMs: 20
    };

    const report3: PeerTelemetryReport = {
      peerId: 'peer_3',
      displayName: 'Student Charlie',
      downloadedBytesP2P: 700 * 1024, // 700 KB
      downloadedBytesServer: 300 * 1024, // 300 KB
      uploadedBytesP2P: 200 * 1024,
      connectedPeersCount: 2,
      progressPercent: 100,
      transferRateBps: 450000,
      averageLatencyMs: 30
    };

    telemetryManager.updatePeerReport(sessionIdA, report1);
    telemetryManager.updatePeerReport(sessionIdA, report2);
    const metrics = telemetryManager.updatePeerReport(sessionIdA, report3);

    assert.strictEqual(metrics.totalPeers, 3);
    assert.strictEqual(metrics.peerReports.length, 3);

    // Sum P2P: 800 + 900 + 700 = 2400 KB
    const expectedP2P = 2400 * 1024;
    assert.strictEqual(metrics.totalBytesP2P, expectedP2P);

    // Sum Server: 200 + 100 + 300 = 600 KB
    const expectedServer = 600 * 1024;
    assert.strictEqual(metrics.totalBytesServer, expectedServer);

    // Bandwidth saved = totalBytesP2P = 2400 KB
    assert.strictEqual(metrics.bandwidthSavedBytes, expectedP2P);

    // Efficiency: 2400 / (2400 + 600) = 2400 / 3000 = 80.0%
    assert.strictEqual(metrics.swarmEfficiencyPercent, 80);

    // Data channels: 2 + 2 + 2 = 6 / 2 = 3 active duplex channels
    assert.strictEqual(metrics.activeDataChannels, 3);
  });

  test('updates metrics when a peer disconnects and report is removed', () => {
    roomManager.addPeer(sessionIdA, {
      peerId: 'p1',
      displayName: 'Alice',
      role: 'student',
      joinedAt: Date.now()
    });
    roomManager.addPeer(sessionIdA, {
      peerId: 'p2',
      displayName: 'Bob',
      role: 'student',
      joinedAt: Date.now()
    });

    telemetryManager.updatePeerReport(sessionIdA, {
      peerId: 'p1',
      displayName: 'Alice',
      downloadedBytesP2P: 1000,
      downloadedBytesServer: 0,
      uploadedBytesP2P: 0,
      connectedPeersCount: 1,
      progressPercent: 100
    });

    telemetryManager.updatePeerReport(sessionIdA, {
      peerId: 'p2',
      displayName: 'Bob',
      downloadedBytesP2P: 2000,
      downloadedBytesServer: 0,
      uploadedBytesP2P: 0,
      connectedPeersCount: 1,
      progressPercent: 100
    });

    let metrics = telemetryManager.getMetrics(sessionIdA);
    assert.strictEqual(metrics.totalBytesP2P, 3000);

    // Disconnect peer 1
    roomManager.removePeer(sessionIdA, 'p1');
    metrics = telemetryManager.removePeer(sessionIdA, 'p1')!;

    assert.ok(metrics);
    assert.strictEqual(metrics.totalBytesP2P, 2000);
    assert.strictEqual(metrics.peerReports.length, 1);
    assert.strictEqual(metrics.peerReports[0].peerId, 'p2');
  });

  test('strict session isolation: metrics in Session A never leak into Session B', () => {
    roomManager.addPeer(sessionIdA, {
      peerId: 'alice',
      displayName: 'Alice',
      role: 'student',
      joinedAt: Date.now()
    });
    roomManager.addPeer(sessionIdB, {
      peerId: 'bob',
      displayName: 'Bob',
      role: 'student',
      joinedAt: Date.now()
    });

    telemetryManager.updatePeerReport(sessionIdA, {
      peerId: 'alice',
      displayName: 'Alice',
      downloadedBytesP2P: 500000,
      downloadedBytesServer: 50000,
      uploadedBytesP2P: 0,
      connectedPeersCount: 0,
      progressPercent: 90
    });

    const metricsA = telemetryManager.getMetrics(sessionIdA);
    const metricsB = telemetryManager.getMetrics(sessionIdB);

    assert.strictEqual(metricsA.totalBytesP2P, 500000);
    assert.strictEqual(metricsA.peerReports.length, 1);

    // Session B must have 0 bytes and 0 reports
    assert.strictEqual(metricsB.totalBytesP2P, 0);
    assert.strictEqual(metricsB.totalBytesServer, 0);
    assert.strictEqual(metricsB.peerReports.length, 0);
  });

  test('clearSession removes all reports and metrics for that session', () => {
    telemetryManager.updatePeerReport(sessionIdA, {
      peerId: 'alice',
      displayName: 'Alice',
      downloadedBytesP2P: 1000,
      downloadedBytesServer: 0,
      uploadedBytesP2P: 0,
      connectedPeersCount: 0,
      progressPercent: 50
    });

    assert.strictEqual(telemetryManager.getMetrics(sessionIdA).peerReports.length, 1);

    telemetryManager.clearSession(sessionIdA);

    const cleared = telemetryManager.getMetrics(sessionIdA);
    assert.strictEqual(cleared.peerReports.length, 0);
    assert.strictEqual(cleared.totalBytesP2P, 0);
  });
});
