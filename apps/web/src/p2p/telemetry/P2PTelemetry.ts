/**
 * Campus Mesh — P2P Swarm Telemetry Engine
 *
 * Tracks, aggregates, and emits real-time verified transfer metrics, latencies,
 * reliability events, and heartbeat reports without simulation or fakes.
 */

import type { SwarmEvent, PeerTelemetryReport } from '@campus-mesh/shared';
import type {
  FullTelemetrySnapshot,
  TransferMetrics,
  ReliabilityMetrics,
  TimingMetrics
} from './telemetry.types.js';
import {
  calculateP2PPercentage,
  calculateBandwidthSaved,
  calculateTransferRate,
  calculateHealthStatus
} from './telemetry.calculations.js';

export class P2PTelemetry {
  private resourceId: string | null = null;
  private totalChunks = 0;

  // Transfer Metrics
  private bytesFromP2P = 0;
  private bytesFromOrigin = 0;
  private bytesUploadedP2P = 0;
  private chunksFromP2P = 0;
  private chunksFromOrigin = 0;

  // Reliability Metrics
  private peerConnectionFailures = 0;
  private retriesCount = 0;
  private originFallbackCount = 0;
  private corruptedChunksCount = 0;
  private verifiedChunksCount = 0;
  private peerDisconnectsCount = 0;

  // Timing Metrics
  private downloadStartedAt: number | null = null;
  private firstByteAt: number | null = null;
  private downloadCompletedAt: number | null = null;
  private readonly p2pLatencies: number[] = [];
  private readonly originLatencies: number[] = [];

  // Bounded Event Feed
  private readonly events: SwarmEvent[] = [];
  private readonly maxEvents = 100;
  private eventSeq = 0;

  public startSession(resourceId: string, totalChunks: number): void {
    this.resourceId = resourceId;
    this.totalChunks = totalChunks;
    this.downloadStartedAt = Date.now();
    this.firstByteAt = null;
    this.downloadCompletedAt = null;

    this.bytesFromP2P = 0;
    this.bytesFromOrigin = 0;
    this.chunksFromP2P = 0;
    this.chunksFromOrigin = 0;
    this.p2pLatencies.length = 0;
    this.originLatencies.length = 0;

    this.recordEvent('chunk', `Download started for ${totalChunks} chunks`, 'info');
  }

  public recordChunkReceived(
    chunkIndex: number,
    fromP2P: boolean,
    byteLength: number,
    latencyMs: number
  ): void {
    const now = Date.now();
    if (!this.firstByteAt) {
      this.firstByteAt = now;
    }

    this.verifiedChunksCount++;

    if (fromP2P) {
      this.bytesFromP2P += byteLength;
      this.chunksFromP2P++;
      this.p2pLatencies.push(latencyMs);
      if (this.p2pLatencies.length > 50) this.p2pLatencies.shift();
      this.recordEvent(
        'chunk',
        `Chunk #${chunkIndex} verified (${Math.round(byteLength / 1024)} KB) via P2P (${latencyMs}ms)`,
        'success'
      );
    } else {
      this.bytesFromOrigin += byteLength;
      this.chunksFromOrigin++;
      this.originLatencies.push(latencyMs);
      if (this.originLatencies.length > 50) this.originLatencies.shift();
      this.recordEvent(
        'fallback',
        `Chunk #${chunkIndex} verified (${Math.round(byteLength / 1024)} KB) via Origin (${latencyMs}ms)`,
        'info'
      );
    }

    if (this.totalChunks > 0 && this.chunksFromP2P + this.chunksFromOrigin >= this.totalChunks) {
      this.downloadCompletedAt = now;
      this.recordEvent('chunk', 'Download 100% completed and verified', 'success');
    }
  }

  public recordBytesUploaded(byteLength: number): void {
    this.bytesUploadedP2P += byteLength;
  }

  public recordCorruption(chunkIndex: number, _expectedHash: string, _actualHash: string): void {
    this.corruptedChunksCount++;
    this.recordEvent(
      'integrity',
      `Corrupt chunk #${chunkIndex} detected and discarded!`,
      'warn'
    );
  }

  public recordRetry(chunkIndex: number, peerId: string): void {
    this.retriesCount++;
    this.recordEvent(
      'chunk',
      `Request for chunk #${chunkIndex} timed out with ${peerId.slice(0, 10)}; retrying...`,
      'warn'
    );
  }

  public recordOriginFallback(chunkIndex: number): void {
    this.originFallbackCount++;
    this.recordEvent(
      'fallback',
      `Activating origin fallback for chunk #${chunkIndex}`,
      'info'
    );
  }

  public recordPeerConnectionChange(peerId: string, state: RTCPeerConnectionState): void {
    if (state === 'failed') {
      this.peerConnectionFailures++;
      this.recordEvent('peer', `WebRTC connection with ${peerId.slice(0, 10)} failed`, 'warn');
    } else if (state === 'disconnected') {
      this.peerDisconnectsCount++;
      this.recordEvent('peer', `Peer ${peerId.slice(0, 10)} disconnected`, 'info');
    } else if (state === 'connected') {
      this.recordEvent('peer', `Direct WebRTC mesh connection established with ${peerId.slice(0, 10)}`, 'success');
    }
  }

  public recordEvent(
    type: 'peer' | 'chunk' | 'fallback' | 'integrity',
    message: string,
    level: 'info' | 'warn' | 'success' = 'info'
  ): void {
    this.eventSeq++;
    const event: SwarmEvent = {
      id: `evt_${Date.now()}_${this.eventSeq}`,
      timestamp: Date.now(),
      type,
      message,
      level
    };

    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }
  }

  public getSnapshot(activePeersCount = 0): FullTelemetrySnapshot {
    const totalBytes = this.bytesFromP2P + this.bytesFromOrigin;
    const totalCompleted = this.chunksFromP2P + this.chunksFromOrigin;
    const p2pPercentage = calculateP2PPercentage(this.bytesFromP2P, this.bytesFromOrigin);
    const originBandwidthSavedBytes = calculateBandwidthSaved(this.bytesFromP2P);

    const now = Date.now();
    const elapsedSeconds = this.downloadStartedAt
      ? Math.max(0.1, (now - this.downloadStartedAt) / 1000)
      : 0;

    const currentTransferRateBps = calculateTransferRate(totalBytes, elapsedSeconds);

    const avgP2PLatency =
      this.p2pLatencies.length > 0
        ? Math.round(this.p2pLatencies.reduce((a, b) => a + b, 0) / this.p2pLatencies.length)
        : 0;

    const avgOriginLatency =
      this.originLatencies.length > 0
        ? Math.round(this.originLatencies.reduce((a, b) => a + b, 0) / this.originLatencies.length)
        : 0;

    const transfer: TransferMetrics = {
      bytesFromP2P: this.bytesFromP2P,
      bytesFromOrigin: this.bytesFromOrigin,
      totalBytes,
      chunksFromP2P: this.chunksFromP2P,
      chunksFromOrigin: this.chunksFromOrigin,
      totalCompletedChunks: totalCompleted,
      totalChunks: this.totalChunks,
      p2pPercentage,
      originBandwidthSavedBytes,
      currentTransferRateBps,
      bytesUploadedP2P: this.bytesUploadedP2P
    };

    const reliability: ReliabilityMetrics = {
      peerConnectionFailures: this.peerConnectionFailures,
      retriesCount: this.retriesCount,
      originFallbackCount: this.originFallbackCount,
      corruptedChunksCount: this.corruptedChunksCount,
      verifiedChunksCount: this.verifiedChunksCount,
      peerDisconnectsCount: this.peerDisconnectsCount
    };

    const timing: TimingMetrics = {
      downloadStartedAt: this.downloadStartedAt,
      firstByteAt: this.firstByteAt,
      downloadCompletedAt: this.downloadCompletedAt,
      elapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
      averageP2PLatencyMs: avgP2PLatency,
      averageOriginLatencyMs: avgOriginLatency
    };

    const health = calculateHealthStatus(
      activePeersCount,
      this.corruptedChunksCount,
      this.originFallbackCount,
      p2pPercentage
    );

    return {
      transfer,
      reliability,
      timing,
      health,
      events: [...this.events]
    };
  }

  public getHeartbeatReport(
    peerId: string,
    displayName: string,
    activeResourceId?: string | null,
    connectedPeersCount = 0,
    progressPercent = 0
  ): PeerTelemetryReport {
    const now = Date.now();
    const elapsedSeconds = this.downloadStartedAt
      ? Math.max(0.1, (now - this.downloadStartedAt) / 1000)
      : 0;
    const totalBytes = this.bytesFromP2P + this.bytesFromOrigin;

    return {
      peerId,
      displayName,
      activeResourceId: activeResourceId || this.resourceId,
      downloadedBytesP2P: this.bytesFromP2P,
      downloadedBytesServer: this.bytesFromOrigin,
      uploadedBytesP2P: this.bytesUploadedP2P,
      connectedPeersCount,
      progressPercent,
      transferRateBps: calculateTransferRate(totalBytes, elapsedSeconds),
      chunkCountP2P: this.chunksFromP2P,
      chunkCountServer: this.chunksFromOrigin,
      averageLatencyMs:
        this.p2pLatencies.length > 0
          ? Math.round(this.p2pLatencies.reduce((a, b) => a + b, 0) / this.p2pLatencies.length)
          : 0
    };
  }
}
