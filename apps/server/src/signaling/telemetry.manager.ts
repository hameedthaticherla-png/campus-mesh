/**
 * Campus Mesh — Server-Side Swarm Telemetry Manager
 *
 * Aggregates verified peer telemetry reports per session and computes
 * authoritative room-wide swarm metrics (total P2P bytes, origin bytes,
 * bandwidth saved, and distribution efficiency).
 */

import type { PeerTelemetryReport, SwarmMetrics } from '@campus-mesh/shared';
import { roomManager } from './room.manager.js';

export class TelemetryManager {
  // Map<sessionId, Map<peerId, PeerTelemetryReport>>
  private readonly reports = new Map<string, Map<string, PeerTelemetryReport>>();

  /**
   * Updates or records a peer's telemetry heartbeat report.
   */
  public updatePeerReport(sessionId: string, report: PeerTelemetryReport): SwarmMetrics {
    let sessionMap = this.reports.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map<string, PeerTelemetryReport>();
      this.reports.set(sessionId, sessionMap);
    }
    sessionMap.set(report.peerId, { ...report });
    return this.getMetrics(sessionId);
  }

  /**
   * Removes a peer's telemetry on disconnect.
   */
  public removePeer(sessionId: string, peerId: string): SwarmMetrics | null {
    const sessionMap = this.reports.get(sessionId);
    if (!sessionMap) return null;

    sessionMap.delete(peerId);
    if (sessionMap.size === 0) {
      this.reports.delete(sessionId);
    }

    return this.getMetrics(sessionId);
  }

  /**
   * Calculates authoritative aggregated SwarmMetrics for a session.
   */
  public getMetrics(sessionId: string): SwarmMetrics {
    const sessionMap = this.reports.get(sessionId);
    const peerReports = sessionMap ? Array.from(sessionMap.values()) : [];

    const roomPeers = roomManager.getRoomPeers(sessionId);
    const totalPeers = roomPeers.filter((p) => p.role !== 'instructor').length;
    let totalBytesP2P = 0;
    let totalBytesServer = 0;
    let sumDataChannels = 0;

    for (const r of peerReports) {
      totalBytesP2P += r.downloadedBytesP2P || 0;
      totalBytesServer += r.downloadedBytesServer || 0;
      sumDataChannels += r.connectedPeersCount || 0;
    }

    // Each DataChannel connection is reported by 2 endpoints; divide by 2 (or 0)
    const activeDataChannels = Math.max(0, Math.round(sumDataChannels / 2));
    const totalBytes = totalBytesP2P + totalBytesServer;
    const bandwidthSavedBytes = totalBytesP2P;

    const swarmEfficiencyPercent =
      totalBytes > 0 ? Math.round((totalBytesP2P / totalBytes) * 1000) / 10 : 0;

    return {
      sessionId,
      totalPeers,
      activeDataChannels,
      totalBytesP2P,
      totalBytesServer,
      bandwidthSavedBytes,
      swarmEfficiencyPercent,
      estimatedBaselineBytes: totalBytes,
      peerReports,
      lastUpdated: Date.now()
    };
  }

  /**
   * Cleans up all telemetry data for an ended session.
   */
  public clearSession(sessionId: string): void {
    this.reports.delete(sessionId);
  }

  /**
   * Resets all sessions (used for test isolation).
   */
  public reset(): void {
    this.reports.clear();
  }
}

export const telemetryManager = new TelemetryManager();
