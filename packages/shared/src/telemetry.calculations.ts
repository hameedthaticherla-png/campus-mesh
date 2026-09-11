/**
 * Campus Mesh — Pure Telemetry Calculation Functions
 *
 * Implements authoritative mathematical metrics with zero simulated or fake numbers
 * and safe division guarding.
 */

export type NetworkHealthStatus = 'excellent' | 'degraded' | 'fallback';

/**
 * Calculates percentage of received bytes delivered via P2P swarm.
 */
export function calculateP2PPercentage(bytesP2P: number, bytesOrigin: number): number {
  const total = bytesP2P + bytesOrigin;
  if (total <= 0) return 0;
  return Math.round((bytesP2P / total) * 1000) / 10;
}

/**
 * Calculates origin server bandwidth saved in bytes.
 * For any chunk received via P2P, that exact byte volume was spared from the origin server.
 */
export function calculateBandwidthSaved(bytesP2P: number): number {
  return Math.max(0, bytesP2P);
}

/**
 * Calculates current transfer throughput rate in bytes per second.
 */
export function calculateTransferRate(verifiedBytes: number, elapsedSeconds: number): number {
  if (elapsedSeconds <= 0 || verifiedBytes <= 0) return 0;
  return Math.round(verifiedBytes / elapsedSeconds);
}

/**
 * Derives network health status based on peer connectivity, corruption, and fallback ratio.
 */
export function calculateHealthStatus(
  activePeersCount: number,
  corruptedChunksCount: number,
  originFallbackCount: number,
  p2pPercentage: number
): NetworkHealthStatus {
  if (activePeersCount === 0 || (originFallbackCount > 2 && p2pPercentage < 20)) {
    return 'fallback';
  }
  if (corruptedChunksCount > 0 || p2pPercentage < 50) {
    return 'degraded';
  }
  return 'excellent';
}

/**
 * Formats raw byte amounts into human-readable strings (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIdx = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(k, clampedIdx)).toFixed(1)} ${sizes[clampedIdx]}`;
}
