/**
 * Campus Mesh — Shared Protocol and Model Types
 */

import { SignalingEventType } from './constants.js';

// ==========================================
// Session & Identity Models
// ==========================================
export type UserRole = 'instructor' | 'student';

export interface ClassSession {
  id: string;
  sessionCode: string;
  className: string;
  instructorName: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface PeerIdentity {
  peerId: string;
  sessionId: string;
  displayName: string;
  role: UserRole;
}

export interface PeerInfo {
  peerId: string;
  displayName: string;
  role: UserRole;
  joinedAt: number;
}

// ==========================================
// Authentication & JWT Tokens
// ==========================================
export interface AuthTokenPayload {
  sessionId: string;
  role: UserRole;
  peerId?: string; // Present for students
  displayName: string;
  sessionCode: string;
  exp?: number;
  iat?: number;
}

// ==========================================
// REST API Request / Response DTOs
// ==========================================
export interface CreateSessionRequest {
  className: string;
  instructorName: string;
  passcode: string;
  durationHours?: number;
}

export interface CreateSessionResponse {
  session: {
    id: string;
    sessionCode: string;
    className: string;
    instructorName: string;
    expiresAt: string;
  };
  instructorToken: string;
}

export interface JoinSessionRequest {
  sessionCode: string;
  passcode: string;
  displayName?: string;
}

export interface JoinSessionResponse {
  session: {
    id: string;
    sessionCode: string;
    className: string;
    instructorName: string;
    expiresAt: string;
  };
  peerId: string;
  peerToken: string;
  iceServers: RTCIceServer[];
}

export interface SessionInfoResponse {
  id: string;
  sessionCode: string;
  className: string;
  instructorName: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  activePeersCount: number;
}

export interface EndSessionResponse {
  success: boolean;
  message: string;
  sessionId: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
}

// ==========================================
// Signaling WebSocket Protocol
// ==========================================
export interface SignalingEnvelope<T = unknown> {
  type: SignalingEventType;
  sessionId: string;
  senderPeerId: string;
  targetPeerId?: string | null;
  payload: T;
}

export interface PeerJoinedPayload {
  peerId: string;
  displayName: string;
  role: UserRole;
  joinedAt: number;
}

export interface PeerLeftPayload {
  peerId: string;
  reason?: string;
}

export interface RoomRosterPayload {
  sessionId: string;
  peers: PeerInfo[];
}

export interface SessionEndedPayload {
  sessionId: string;
  reason: string;
}

export interface SignalOfferPayload {
  sdp: RTCSessionDescriptionInit;
}

export interface SignalAnswerPayload {
  sdp: RTCSessionDescriptionInit;
}

export interface SignalIcePayload {
  candidate: RTCIceCandidateInit;
}

// ==========================================
// Resource & Manifest Models
// ==========================================
export type ResourceStatus = 'ready' | 'processing' | 'failed';

export interface ChunkManifestEntry {
  index: number;
  size: number;
  sha256: string;
}

export interface ResourceInfo {
  id: string;
  sessionId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  fileHash: string;
  status: ResourceStatus;
  createdAt: string;
}

export interface ResourceManifest {
  resourceId: string;
  sessionId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  fileHash: string;
  createdAt: string;
  chunks: ChunkManifestEntry[];
  chunkHashes?: string[];
}

export interface ResourceListResponse {
  resources: ResourceInfo[];
}

export interface CreateResourceResponse {
  resource: ResourceInfo;
}

export interface DeleteResourceResponse {
  success: boolean;
  message: string;
  resourceId: string;
}

// ==========================================
// Telemetry & Observability (Phase 4)
// ==========================================
export interface SwarmEvent {
  id: string;
  timestamp: number;
  type: 'peer' | 'chunk' | 'fallback' | 'integrity';
  message: string;
  level: 'info' | 'warn' | 'success';
}

export interface PeerTelemetryReport {
  peerId: string;
  displayName: string;
  activeResourceId?: string | null;
  downloadedBytesP2P: number;
  downloadedBytesServer: number;
  uploadedBytesP2P: number;
  connectedPeersCount: number;
  progressPercent: number;
  transferRateBps?: number;
  chunkCountP2P?: number;
  chunkCountServer?: number;
  averageLatencyMs?: number;
}

export interface SwarmMetrics {
  sessionId: string;
  totalPeers: number;
  activeDataChannels: number;
  totalBytesP2P: number;
  totalBytesServer: number;
  bandwidthSavedBytes: number;
  swarmEfficiencyPercent: number;
  estimatedBaselineBytes: number;
  peerReports: PeerTelemetryReport[];
  lastUpdated: number;
}

