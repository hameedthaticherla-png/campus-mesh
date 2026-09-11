/**
 * Campus Mesh — Telemetry State & Metric Interfaces
 */

import type { SwarmEvent } from '@campus-mesh/shared';

export type NetworkHealthStatus = 'excellent' | 'degraded' | 'fallback';

export interface TransferMetrics {
  bytesFromP2P: number;
  bytesFromOrigin: number;
  totalBytes: number;
  chunksFromP2P: number;
  chunksFromOrigin: number;
  totalCompletedChunks: number;
  totalChunks: number;
  p2pPercentage: number;
  originBandwidthSavedBytes: number;
  currentTransferRateBps: number;
  bytesUploadedP2P: number;
}

export interface ReliabilityMetrics {
  peerConnectionFailures: number;
  retriesCount: number;
  originFallbackCount: number;
  corruptedChunksCount: number;
  verifiedChunksCount: number;
  peerDisconnectsCount: number;
}

export interface TimingMetrics {
  downloadStartedAt: number | null;
  firstByteAt: number | null;
  downloadCompletedAt: number | null;
  elapsedSeconds: number;
  averageP2PLatencyMs: number;
  averageOriginLatencyMs: number;
}

export interface FullTelemetrySnapshot {
  transfer: TransferMetrics;
  reliability: ReliabilityMetrics;
  timing: TimingMetrics;
  health: NetworkHealthStatus;
  events: SwarmEvent[];
}
