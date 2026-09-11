/**
 * Campus Mesh — Rarest-First Chunk Scheduler & Swarm Pipeline
 *
 * Coordinates swarm chunk acquisition using rarest-first peer selection,
 * in-flight request tracking, timeout failovers, and HTTP origin fallback.
 */

import {
  P2P_CHUNK_TIMEOUT_MS,
  P2P_REQUEST_RETRIES,
  type ResourceManifest,
  Bitfield,
  encodeRequest,
  encodeHave
} from '@campus-mesh/shared';
import type { IChunkStore } from '../storage/chunk.store.js';
import { IntegrityVerifier } from '../integrity/integrity.verifier.js';

export interface SchedulerCallbacks {
  sendToPeer: (peerId: string, buffer: Uint8Array) => boolean;
  broadcastToPeers: (buffer: Uint8Array) => void;
  fetchFromOrigin: (chunkIndex: number) => Promise<Uint8Array>;
  onChunkCompleted: (chunkIndex: number, fromP2P: boolean, byteLength: number, latencyMs: number) => void;
  onDownloadProgress: (completed: number, total: number) => void;
  onDownloadComplete: () => void;
  onError: (err: Error) => void;
  onCorruption?: (chunkIndex: number, expectedHash: string, actualHash: string) => void;
  onRetry?: (chunkIndex: number, peerId: string) => void;
  onOriginFallback?: (chunkIndex: number) => void;
}

interface InFlightRequest {
  chunkIndex: number;
  peerId: string;
  retries: number;
  timer: any;
  requestedAt: number;
}

interface ChunkReassembly {
  totalLength: number;
  receivedBytes: number;
  parts: Map<number, Uint8Array>; // beginOffset -> data
}

export class ChunkScheduler {
  public readonly resourceId: string;
  public readonly manifest: ResourceManifest;
  private readonly chunkStore: IChunkStore;
  public readonly localBitfield: Bitfield;
  private readonly callbacks: SchedulerCallbacks;

  private readonly peerBitfields = new Map<string, Bitfield>();
  private readonly peerChoked = new Map<string, boolean>();
  private readonly inFlight = new Map<number, InFlightRequest>();
  private readonly reassembly = new Map<number, ChunkReassembly>();
  private readonly originInFlight = new Set<number>();

  private isRunning = false;
  private readonly maxInFlightPerPeer = 2;
  private readonly maxTotalInFlight = 8;

  constructor(
    manifest: ResourceManifest,
    chunkStore: IChunkStore,
    localBitfield: Bitfield,
    callbacks: SchedulerCallbacks
  ) {
    this.resourceId = manifest.resourceId;
    this.manifest = manifest;
    this.chunkStore = chunkStore;
    this.localBitfield = localBitfield;
    this.callbacks = callbacks;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNext();
  }

  public stop(): void {
    this.isRunning = false;
    // Clear all pending in-flight timers
    for (const req of this.inFlight.values()) {
      clearTimeout(req.timer);
    }
    this.inFlight.clear();
    this.reassembly.clear();
    this.originInFlight.clear();
  }

  public updatePeerBitfield(peerId: string, bitfield: Bitfield): void {
    this.peerBitfields.set(peerId, bitfield);
    if (!this.peerChoked.has(peerId)) {
      this.peerChoked.set(peerId, false); // Default to unchoked
    }
    if (this.isRunning) {
      this.scheduleNext();
    }
  }

  public updatePeerHave(peerId: string, chunkIndex: number): void {
    let bf = this.peerBitfields.get(peerId);
    if (!bf) {
      bf = new Bitfield(this.manifest.totalChunks);
      this.peerBitfields.set(peerId, bf);
    }
    bf.set(chunkIndex);
    if (this.isRunning) {
      this.scheduleNext();
    }
  }

  public setPeerChoked(peerId: string, choked: boolean): void {
    this.peerChoked.set(peerId, choked);
    if (!choked && this.isRunning) {
      this.scheduleNext();
    }
  }

  public removePeer(peerId: string): void {
    this.peerBitfields.delete(peerId);
    this.peerChoked.delete(peerId);

    // Cancel all in-flight requests assigned to this peer
    for (const [chunkIdx, req] of Array.from(this.inFlight.entries())) {
      if (req.peerId === peerId) {
        clearTimeout(req.timer);
        this.inFlight.delete(chunkIdx);
        this.reassembly.delete(chunkIdx);
        // Re-schedule immediately
        this.scheduleChunk(chunkIdx, req.retries + 1);
      }
    }

    if (this.isRunning) {
      this.scheduleNext();
    }
  }

  /**
   * Primary scheduling loop: scans missing chunks and assigns them
   * via rarest-first P2P or origin fallback.
   */
  public scheduleNext(): void {
    if (!this.isRunning || this.localBitfield.isComplete()) {
      if (this.localBitfield.isComplete()) {
        this.callbacks.onDownloadComplete();
      }
      return;
    }

    if (this.inFlight.size + this.originInFlight.size >= this.maxTotalInFlight) {
      return; // Capacity reached
    }

    const missingIndices = this.localBitfield.getMissingIndices();
    const candidateIndices = missingIndices.filter(
      (idx) => !this.inFlight.has(idx) && !this.originInFlight.has(idx)
    );

    if (candidateIndices.length === 0) {
      return;
    }

    // Calculate rarity for candidate chunks across unchoked peers
    const rarityMap: Array<{ chunkIndex: number; rarity: number; peers: string[] }> = [];

    for (const chunkIdx of candidateIndices) {
      const eligiblePeers: string[] = [];
      for (const [peerId, bf] of this.peerBitfields.entries()) {
        const choked = this.peerChoked.get(peerId) ?? false;
        if (!choked && bf.has(chunkIdx)) {
          eligiblePeers.push(peerId);
        }
      }
      rarityMap.push({
        chunkIndex: chunkIdx,
        rarity: eligiblePeers.length,
        peers: eligiblePeers
      });
    }

    // 1. Prioritize rarest chunks available in the swarm (rarity > 0)
    const availableFromPeers = rarityMap
      .filter((entry) => entry.rarity > 0)
      .sort((a, b) => a.rarity - b.rarity);

    for (const entry of availableFromPeers) {
      if (this.inFlight.size + this.originInFlight.size >= this.maxTotalInFlight) break;

      // Select peer with lowest in-flight load
      const candidatePeers = entry.peers.filter(
        (p) => this.countInFlightForPeer(p) < this.maxInFlightPerPeer
      );

      if (candidatePeers.length > 0) {
        candidatePeers.sort(
          (a, b) => this.countInFlightForPeer(a) - this.countInFlightForPeer(b)
        );
        const selectedPeer = candidatePeers[0];
        this.dispatchP2PRequest(entry.chunkIndex, selectedPeer, 0);
      }
    }

    // 2. Chunks that have 0 peer availability (nobody has it yet):
    // Fall back to origin immediately to seed the swarm
    const unavailableFromPeers = rarityMap.filter((entry) => entry.rarity === 0);
    for (const entry of unavailableFromPeers) {
      if (this.inFlight.size + this.originInFlight.size >= this.maxTotalInFlight) break;
      this.dispatchOriginFallback(entry.chunkIndex);
    }
  }

  private countInFlightForPeer(peerId: string): number {
    let count = 0;
    for (const req of this.inFlight.values()) {
      if (req.peerId === peerId) count++;
    }
    return count;
  }

  private dispatchP2PRequest(chunkIndex: number, peerId: string, retries: number): void {
    const wireMsg = encodeRequest(this.resourceId, chunkIndex);
    const sent = this.callbacks.sendToPeer(peerId, wireMsg);
    if (!sent) {
      // Peer data channel failed; retry with alternate or origin
      this.scheduleChunk(chunkIndex, retries + 1);
      return;
    }

    const timer = setTimeout(() => {
      // Timeout fired without receiving complete chunk
      this.handleTimeout(chunkIndex);
    }, P2P_CHUNK_TIMEOUT_MS);

    this.inFlight.set(chunkIndex, {
      chunkIndex,
      peerId,
      retries,
      timer,
      requestedAt: Date.now()
    });
  }

  private handleTimeout(chunkIndex: number): void {
    const req = this.inFlight.get(chunkIndex);
    if (!req) return;

    this.inFlight.delete(chunkIndex);
    this.reassembly.delete(chunkIndex);

    this.callbacks.onRetry?.(chunkIndex, req.peerId);

    // Retry with alternate peer or fallback to origin
    this.scheduleChunk(chunkIndex, req.retries + 1);
    this.scheduleNext();
  }

  private scheduleChunk(chunkIndex: number, retries: number): void {
    if (this.localBitfield.has(chunkIndex)) return;

    if (retries <= P2P_REQUEST_RETRIES) {
      // Attempt alternate peer if available
      const eligiblePeers: string[] = [];
      for (const [peerId, bf] of this.peerBitfields.entries()) {
        const choked = this.peerChoked.get(peerId) ?? false;
        if (!choked && bf.has(chunkIndex)) {
          eligiblePeers.push(peerId);
        }
      }

      if (eligiblePeers.length > 0) {
        eligiblePeers.sort(
          (a, b) => this.countInFlightForPeer(a) - this.countInFlightForPeer(b)
        );
        this.dispatchP2PRequest(chunkIndex, eligiblePeers[0], retries);
        return;
      }
    }

    // Retries exhausted or no alternate peer exists: Fallback to origin
    this.dispatchOriginFallback(chunkIndex);
  }

  private dispatchOriginFallback(chunkIndex: number): void {
    if (this.localBitfield.has(chunkIndex) || this.originInFlight.has(chunkIndex)) {
      return;
    }

    this.originInFlight.add(chunkIndex);
    this.callbacks.onOriginFallback?.(chunkIndex);
    const fetchStart = Date.now();

    this.callbacks
      .fetchFromOrigin(chunkIndex)
      .then(async (data) => {
        const latencyMs = Math.max(1, Date.now() - fetchStart);
        await this.verifyAndStoreChunk(chunkIndex, data, false, latencyMs);
      })
      .catch((err) => {
        this.callbacks.onError(
          new Error(`Origin fallback failed for chunk ${chunkIndex}: ${err}`)
        );
      })
      .finally(() => {
        this.originInFlight.delete(chunkIndex);
        if (this.isRunning) {
          this.scheduleNext();
        }
      });
  }

  /**
   * Handles incoming binary PIECE message. Supports single 256 KB slice
   * or sub-piece blocks.
   */
  public async handlePiece(
    chunkIndex: number,
    beginOffset: number,
    totalLength: number,
    data: Uint8Array
  ): Promise<void> {
    const inFlightReq = this.inFlight.get(chunkIndex);
    if (!inFlightReq) {
      return; // Stale or unsolicited piece
    }

    let item = this.reassembly.get(chunkIndex);
    if (!item) {
      item = {
        totalLength,
        receivedBytes: 0,
        parts: new Map()
      };
      this.reassembly.set(chunkIndex, item);
    }

    if (!item.parts.has(beginOffset)) {
      item.parts.set(beginOffset, new Uint8Array(data));
      item.receivedBytes += data.length;
    }

    if (item.receivedBytes >= item.totalLength) {
      // Chunk fully reassembled!
      const latencyMs = inFlightReq.requestedAt ? Math.max(1, Date.now() - inFlightReq.requestedAt) : 50;
      clearTimeout(inFlightReq.timer);
      this.inFlight.delete(chunkIndex);
      this.reassembly.delete(chunkIndex);

      const assembledBuffer = new Uint8Array(item.totalLength);
      for (const [offset, slice] of item.parts.entries()) {
        assembledBuffer.set(slice, offset);
      }

      await this.verifyAndStoreChunk(chunkIndex, assembledBuffer, true, latencyMs);

      if (this.isRunning) {
        this.scheduleNext();
      }
    }
  }

  /**
   * Verifies SHA-256 against manifest. If valid, persists to ChunkStore,
   * updates Bitfield, broadcasts HAVE to swarm, and records telemetry.
   */
  private async verifyAndStoreChunk(
    chunkIndex: number,
    data: Uint8Array,
    fromP2P: boolean,
    latencyMs = 50
  ): Promise<void> {
    const expectedHash =
      this.manifest.chunks[chunkIndex]?.sha256 ||
      this.manifest.chunkHashes?.[chunkIndex];

    if (!expectedHash) {
      this.callbacks.onError(
        new Error(`Missing expected SHA-256 hash in manifest for chunk ${chunkIndex}`)
      );
      return;
    }

    const verification = await IntegrityVerifier.verify(data, expectedHash);
    if (!verification.valid) {
      // Chunk Poisoning or corruption detected! Discard and retry from origin
      this.callbacks.onCorruption?.(chunkIndex, expectedHash, verification.actualHash);
      this.callbacks.onError(
        new Error(
          `Corrupt chunk ${chunkIndex} rejected! Expected ${expectedHash}, got ${verification.actualHash}`
        )
      );
      this.dispatchOriginFallback(chunkIndex);
      return;
    }

    // Verified! Save to local storage
    await this.chunkStore.put(this.resourceId, chunkIndex, data);
    this.localBitfield.set(chunkIndex);

    // Broadcast HAVE to all connected peers in swarm
    const haveMsg = encodeHave(this.resourceId, chunkIndex);
    this.callbacks.broadcastToPeers(haveMsg);

    // Notify caller with telemetry
    this.callbacks.onChunkCompleted(chunkIndex, fromP2P, data.length, latencyMs);
    this.callbacks.onDownloadProgress(
      this.localBitfield.count(),
      this.manifest.totalChunks
    );

    if (this.localBitfield.isComplete()) {
      this.callbacks.onDownloadComplete();
    }
  }
}
