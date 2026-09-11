/**
 * Campus Mesh — Headless Peer Mesh Coordinator
 *
 * Coordinates WebRTC peer lifecycle, deterministic glare resolution,
 * binary DataChannel wire message dispatch, and active chunk scheduling.
 */

import {
  SignalingEventType,
  MAX_PEER_CONNECTIONS,
  P2P_BLOCK_SIZE,
  PEER_HEARTBEAT_INTERVAL_MS,
  WireMessageType,
  type ResourceManifest,
  Bitfield,
  decodeMessage,
  encodeBitfield,
  encodePiece,
  encodeUnchoke
} from '@campus-mesh/shared';
import { WebRtcPeerConnection } from './webrtc/WebRtcPeerConnection.js';
import { ChunkScheduler } from './scheduler/ChunkScheduler.js';
import { type IChunkStore, IndexedDbChunkStore } from './storage/chunk.store.js';
import { P2PTelemetry } from './telemetry/P2PTelemetry.js';
import type { FullTelemetrySnapshot } from './telemetry/telemetry.types.js';

export interface CoordinatorConfig {
  localPeerId: string;
  sessionId: string;
  displayName?: string;
  iceServers: RTCIceServer[];
  sendSignaling: (type: SignalingEventType, targetPeerId: string, payload: unknown) => void;
  chunkStore?: IChunkStore;
}

export interface PeerDiagnosticsInfo {
  peerId: string;
  connectionState: RTCPeerConnectionState;
  dataChannelOpen: boolean;
  chunksPossessed: number;
}

export interface CoordinatorState {
  localPeerId: string;
  connectedPeersCount: number;
  activePeers: PeerDiagnosticsInfo[];
  download: {
    resourceId: string | null;
    fileName: string | null;
    totalChunks: number;
    completedChunks: number;
    progressPercent: number;
    bytesFromP2P: number;
    bytesFromOrigin: number;
    chunksFromP2P: number;
    chunksFromOrigin: number;
    status: 'idle' | 'downloading' | 'completed' | 'error';
    lastError: string | null;
  };
  telemetry: FullTelemetrySnapshot;
}

export class PeerMeshCoordinator {
  public readonly localPeerId: string;
  public readonly sessionId: string;
  public readonly displayName: string;
  public readonly telemetry: P2PTelemetry;
  private readonly iceServers: RTCIceServer[];
  private readonly sendSignaling: (type: SignalingEventType, targetPeerId: string, payload: unknown) => void;
  private readonly chunkStore: IChunkStore;

  private readonly peers = new Map<string, WebRtcPeerConnection>();
  private readonly peerBitfields = new Map<string, Bitfield>();
  private scheduler: ChunkScheduler | null = null;
  private currentManifest: ResourceManifest | null = null;
  private heartbeatTimer: any = null;

  private state: CoordinatorState;
  private readonly listeners = new Set<(state: CoordinatorState) => void>();

  constructor(config: CoordinatorConfig) {
    this.localPeerId = config.localPeerId;
    this.sessionId = config.sessionId;
    this.displayName = config.displayName || `Peer-${this.localPeerId.slice(0, 6)}`;
    this.iceServers = config.iceServers;
    this.sendSignaling = config.sendSignaling;
    this.chunkStore = config.chunkStore || new IndexedDbChunkStore();
    this.telemetry = new P2PTelemetry();

    this.state = {
      localPeerId: this.localPeerId,
      connectedPeersCount: 0,
      activePeers: [],
      download: {
        resourceId: null,
        fileName: null,
        totalChunks: 0,
        completedChunks: 0,
        progressPercent: 0,
        bytesFromP2P: 0,
        bytesFromOrigin: 0,
        chunksFromP2P: 0,
        chunksFromOrigin: 0,
        status: 'idle',
        lastError: null
      },
      telemetry: this.telemetry.getSnapshot(0)
    };

    this.startHeartbeat();
  }

  public subscribe(listener: (state: CoordinatorState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): CoordinatorState {
    const connectedPeersCount = Array.from(this.peers.values()).filter((p) => p.isChannelOpen()).length;
    return {
      ...this.state,
      connectedPeersCount,
      activePeers: Array.from(this.peers.entries()).map(([pId, conn]) => ({
        peerId: pId,
        connectionState: conn.getConnectionState(),
        dataChannelOpen: conn.isChannelOpen(),
        chunksPossessed: this.peerBitfields.get(pId)?.count() || 0
      })),
      telemetry: this.telemetry.getSnapshot(connectedPeersCount)
    };
  }

  private emitState(): void {
    const s = this.getState();
    for (const listener of this.listeners) {
      listener(s);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, PEER_HEARTBEAT_INTERVAL_MS);
  }

  private sendHeartbeat(): void {
    try {
      const openCount = Array.from(this.peers.values()).filter((p) => p.isChannelOpen()).length;
      const report = this.telemetry.getHeartbeatReport(
        this.localPeerId,
        this.displayName,
        this.state.download.resourceId,
        openCount,
        this.state.download.progressPercent
      );
      this.sendSignaling(SignalingEventType.TELEMETRY_HEARTBEAT, 'SERVER', report);
    } catch {
      // Catch errors if signaling socket is disconnected
    }
  }

  // ==========================================
  // Signaling Integration & Glare Resolution
  // ==========================================

  public handlePeerDiscovered(remotePeerId: string): void {
    if (remotePeerId === this.localPeerId) return;
    if (this.peers.has(remotePeerId)) return;
    if (this.peers.size >= MAX_PEER_CONNECTIONS) return;

    // Deterministic glare resolution rule: Higher peerId initiates, Lower peerId waits
    const isInitiator = this.localPeerId > remotePeerId;

    const connection = new WebRtcPeerConnection(
      remotePeerId,
      isInitiator,
      this.iceServers,
      {
        onDataMessage: (data) => this.handleDataMessage(remotePeerId, data),
        onChannelOpen: () => this.handleChannelOpen(remotePeerId),
        onChannelClose: () => this.handleChannelClose(remotePeerId),
        onIceCandidate: (candidate) => {
          this.sendSignaling(SignalingEventType.SIGNAL_ICE, remotePeerId, {
            candidate
          });
        },
        onConnectionStateChange: () => {
          const conn = this.peers.get(remotePeerId);
          if (conn) {
            this.telemetry.recordPeerConnectionChange(remotePeerId, conn.getConnectionState());
          }
          this.emitState();
        },
        onError: (err) => {
          console.warn(`[P2P] Peer ${remotePeerId} error:`, err);
          this.telemetry.recordPeerConnectionChange(remotePeerId, 'failed');
          this.emitState();
        }
      }
    );

    this.peers.set(remotePeerId, connection);
    this.emitState();

    if (isInitiator) {
      connection
        .createOffer()
        .then((offer) => {
          this.sendSignaling(SignalingEventType.SIGNAL_OFFER, remotePeerId, {
            sdp: offer
          });
        })
        .catch((err) => {
          console.error(`[P2P] Failed to create offer for ${remotePeerId}:`, err);
        });
    }
  }

  public handleSignalOffer(remotePeerId: string, offer: RTCSessionDescriptionInit): void {
    let connection = this.peers.get(remotePeerId);
    if (!connection) {
      if (this.peers.size >= MAX_PEER_CONNECTIONS) return;

      connection = new WebRtcPeerConnection(
        remotePeerId,
        false,
        this.iceServers,
        {
          onDataMessage: (data) => this.handleDataMessage(remotePeerId, data),
          onChannelOpen: () => this.handleChannelOpen(remotePeerId),
          onChannelClose: () => this.handleChannelClose(remotePeerId),
          onIceCandidate: (candidate) => {
            this.sendSignaling(SignalingEventType.SIGNAL_ICE, remotePeerId, {
              candidate
            });
          },
          onConnectionStateChange: () => {
            const conn = this.peers.get(remotePeerId);
            if (conn) {
              this.telemetry.recordPeerConnectionChange(remotePeerId, conn.getConnectionState());
            }
            this.emitState();
          },
          onError: (err) => {
            console.warn(`[P2P] Peer ${remotePeerId} error:`, err);
            this.telemetry.recordPeerConnectionChange(remotePeerId, 'failed');
            this.emitState();
          }
        }
      );
      this.peers.set(remotePeerId, connection);
    }

    connection
      .setRemoteOffer(offer)
      .then((answer) => {
        this.sendSignaling(SignalingEventType.SIGNAL_ANSWER, remotePeerId, {
          sdp: answer
        });
        this.emitState();
      })
      .catch((err) => {
        console.error(`[P2P] Failed to accept offer from ${remotePeerId}:`, err);
      });
  }

  public handleSignalAnswer(remotePeerId: string, answer: RTCSessionDescriptionInit): void {
    const connection = this.peers.get(remotePeerId);
    if (connection) {
      connection.setRemoteAnswer(answer).catch((err) => {
        console.error(`[P2P] Failed to set answer from ${remotePeerId}:`, err);
      });
    }
  }

  public handleSignalIce(remotePeerId: string, candidate: RTCIceCandidateInit): void {
    const connection = this.peers.get(remotePeerId);
    if (connection) {
      connection.addIceCandidate(candidate).catch((err) => {
        console.warn(`[P2P] Failed to add ICE candidate from ${remotePeerId}:`, err);
      });
    }
  }

  public handlePeerLeft(remotePeerId: string): void {
    const connection = this.peers.get(remotePeerId);
    if (connection) {
      connection.close();
      this.peers.delete(remotePeerId);
    }
    this.peerBitfields.delete(remotePeerId);
    if (this.scheduler) {
      this.scheduler.removePeer(remotePeerId);
    }
    this.telemetry.recordPeerConnectionChange(remotePeerId, 'disconnected');
    this.emitState();
  }

  public handleSessionEnded(): void {
    this.stop();
  }

  // ==========================================
  // DataChannel Wire Protocol Handling
  // ==========================================

  private async handleChannelOpen(remotePeerId: string): Promise<void> {
    const connection = this.peers.get(remotePeerId);
    if (!connection) return;

    this.telemetry.recordPeerConnectionChange(remotePeerId, 'connected');

    // If currently downloading or possessing a resource, send BITFIELD
    if (this.currentManifest && this.scheduler) {
      const bfBytes = encodeBitfield(
        this.currentManifest.resourceId,
        this.currentManifest.totalChunks,
        this.scheduler.localBitfield
      );
      connection.send(bfBytes);
      connection.send(encodeUnchoke(this.currentManifest.resourceId));
    }

    this.emitState();
  }

  private handleChannelClose(remotePeerId: string): void {
    this.handlePeerLeft(remotePeerId);
  }

  private async handleDataMessage(remotePeerId: string, raw: ArrayBuffer): Promise<void> {
    try {
      const msg = decodeMessage(raw);

      switch (msg.type) {
        case WireMessageType.BITFIELD: {
          this.peerBitfields.set(remotePeerId, msg.bitfield);
          if (this.scheduler && this.scheduler.resourceId === msg.resourceId) {
            this.scheduler.updatePeerBitfield(remotePeerId, msg.bitfield);
          }
          this.emitState();
          break;
        }

        case WireMessageType.HAVE: {
          let bf = this.peerBitfields.get(remotePeerId);
          if (!bf && this.currentManifest) {
            bf = new Bitfield(this.currentManifest.totalChunks);
            this.peerBitfields.set(remotePeerId, bf);
          }
          if (bf) {
            bf.set(msg.chunkIndex);
          }
          if (this.scheduler && this.scheduler.resourceId === msg.resourceId) {
            this.scheduler.updatePeerHave(remotePeerId, msg.chunkIndex);
          }
          this.emitState();
          break;
        }

        case WireMessageType.REQUEST: {
          // Serve chunk to requesting peer if possessed
          const chunkData = await this.chunkStore.get(msg.resourceId, msg.chunkIndex);
          if (chunkData) {
            const connection = this.peers.get(remotePeerId);
            if (connection && connection.isChannelOpen()) {
              // Send in SCTP-safe blocks (e.g. 64 KB slices)
              const blockSize = P2P_BLOCK_SIZE;
              for (let offset = 0; offset < chunkData.length; offset += blockSize) {
                const slice = chunkData.subarray(
                  offset,
                  Math.min(offset + blockSize, chunkData.length)
                );
                const pieceMsg = encodePiece(
                  msg.resourceId,
                  msg.chunkIndex,
                  offset,
                  chunkData.length,
                  slice
                );
                connection.send(pieceMsg);
                this.telemetry.recordBytesUploaded(slice.length);
              }
            }
          }
          break;
        }

        case WireMessageType.PIECE: {
          if (this.scheduler && this.scheduler.resourceId === msg.resourceId) {
            await this.scheduler.handlePiece(
              msg.chunkIndex,
              msg.beginOffset,
              msg.totalLength,
              msg.data
            );
          }
          break;
        }

        case WireMessageType.CHOKE: {
          if (this.scheduler && this.scheduler.resourceId === msg.resourceId) {
            this.scheduler.setPeerChoked(remotePeerId, true);
          }
          break;
        }

        case WireMessageType.UNCHOKE: {
          if (this.scheduler && this.scheduler.resourceId === msg.resourceId) {
            this.scheduler.setPeerChoked(remotePeerId, false);
          }
          break;
        }
      }
    } catch (err) {
      console.warn(`[P2P] Malformed wire message from ${remotePeerId}:`, err);
    }
  }

  // ==========================================
  // Resource Download Orchestration
  // ==========================================

  public async startDownload(
    manifest: ResourceManifest,
    authToken: string,
    apiBaseUrl: string
  ): Promise<void> {
    if (this.scheduler) {
      this.scheduler.stop();
    }

    this.currentManifest = manifest;
    this.telemetry.startSession(manifest.resourceId, manifest.totalChunks);

    // Load available chunks from ChunkStore to reconstruct local Bitfield
    const available = await this.chunkStore.getAvailableChunks(manifest.resourceId);
    const localBitfield = new Bitfield(manifest.totalChunks);
    for (const idx of available) {
      localBitfield.set(idx);
    }

    this.state.download = {
      resourceId: manifest.resourceId,
      fileName: manifest.fileName,
      totalChunks: manifest.totalChunks,
      completedChunks: localBitfield.count(),
      progressPercent:
        manifest.totalChunks > 0
          ? Math.round((localBitfield.count() / manifest.totalChunks) * 100)
          : 100,
      bytesFromP2P: 0,
      bytesFromOrigin: 0,
      chunksFromP2P: 0,
      chunksFromOrigin: 0,
      status: localBitfield.isComplete() ? 'completed' : 'downloading',
      lastError: null
    };
    this.emitState();

    if (localBitfield.isComplete()) {
      return;
    }

    this.scheduler = new ChunkScheduler(
      manifest,
      this.chunkStore,
      localBitfield,
      {
        sendToPeer: (peerId, buf) => {
          const conn = this.peers.get(peerId);
          return conn ? conn.send(buf) : false;
        },
        broadcastToPeers: (buf) => {
          for (const conn of this.peers.values()) {
            if (conn.isChannelOpen()) {
              conn.send(buf);
            }
          }
        },
        fetchFromOrigin: async (chunkIndex) => {
          const url = `${apiBaseUrl}/api/resources/${manifest.resourceId}/chunks/${chunkIndex}`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${authToken}`
            }
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching chunk ${chunkIndex} from origin`);
          }
          const arrayBuffer = await res.arrayBuffer();
          return new Uint8Array(arrayBuffer);
        },
        onChunkCompleted: (chunkIdx, fromP2P, byteLength, latencyMs) => {
          if (fromP2P) {
            this.state.download.bytesFromP2P += byteLength;
            this.state.download.chunksFromP2P += 1;
          } else {
            this.state.download.bytesFromOrigin += byteLength;
            this.state.download.chunksFromOrigin += 1;
          }
          this.telemetry.recordChunkReceived(chunkIdx, fromP2P, byteLength, latencyMs);
        },
        onCorruption: (chunkIdx, expectedHash, actualHash) => {
          this.telemetry.recordCorruption(chunkIdx, expectedHash, actualHash);
        },
        onRetry: (chunkIdx, peerId) => {
          this.telemetry.recordRetry(chunkIdx, peerId);
        },
        onOriginFallback: (chunkIdx) => {
          this.telemetry.recordOriginFallback(chunkIdx);
        },
        onDownloadProgress: (completed, total) => {
          this.state.download.completedChunks = completed;
          this.state.download.progressPercent =
            total > 0 ? Math.round((completed / total) * 100) : 100;
          this.emitState();
        },
        onDownloadComplete: () => {
          this.state.download.status = 'completed';
          this.emitState();
        },
        onError: (err) => {
          this.state.download.lastError = err.message;
          this.emitState();
        }
      }
    );

    // Provide existing peer bitfields to the scheduler
    for (const [pId, bf] of this.peerBitfields.entries()) {
      this.scheduler.updatePeerBitfield(pId, bf);
    }

    // Broadcast our BITFIELD to all open data channels
    const bfWire = encodeBitfield(manifest.resourceId, manifest.totalChunks, localBitfield);
    for (const conn of this.peers.values()) {
      if (conn.isChannelOpen()) {
        conn.send(bfWire);
      }
    }

    this.scheduler.start();
  }

  /**
   * Assembles all verified chunks from storage into a single Blob,
   * verifies whole-file SHA-256 hash against manifest, and returns result.
   */
  public async assembleFile(resourceId: string): Promise<{
    blob: Blob;
    fileHash: string;
    verified: boolean;
    fileName: string;
  } | null> {
    const manifest = this.currentManifest;
    if (!manifest || manifest.resourceId !== resourceId) return null;

    const parts: BlobPart[] = [];
    for (let i = 0; i < manifest.totalChunks; i++) {
      const chunk = await this.chunkStore.get(resourceId, i);
      if (!chunk) {
        throw new Error(`Missing chunk #${i} in local chunk store.`);
      }
      parts.push(chunk as unknown as BlobPart);
    }

    const blob = new Blob(parts, { type: 'application/octet-stream' });
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const verified = computedHash.toLowerCase() === manifest.fileHash.toLowerCase();

    return {
      blob,
      fileHash: computedHash,
      verified,
      fileName: manifest.fileName
    };
  }

  public stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.scheduler) {
      this.scheduler.stop();
      this.scheduler = null;
    }
    for (const conn of this.peers.values()) {
      conn.close();
    }
    this.peers.clear();
    this.peerBitfields.clear();
    this.state.download.status = 'idle';
    this.emitState();
  }
}
