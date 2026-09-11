/**
 * Campus Mesh — Core Architectural Constants
 */

// Chunk Sizing: 256 KB slices ensure optimal balance between frame overhead and WebRTC SCTP buffer limits
export const CHUNK_SIZE_BYTES = 262144; // 256 * 1024 bytes

// Scheduler Timeouts
export const CHUNK_REQUEST_TIMEOUT_MS = 1500; // Time before falling back to HTTP origin server
export const PEER_HEARTBEAT_INTERVAL_MS = 2000; // Periodic telemetry push interval
export const SESSION_EXPIRATION_DEFAULT_HOURS = 3;
export const DEFAULT_SESSION_TTL_HOURS = SESSION_EXPIRATION_DEFAULT_HOURS;

// Session Validation Constraints
export const SESSION_CODE_PREFIX = 'MESH';
export const SESSION_CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // Unambiguous characters (no 0/O, 1/I/L)
export const SESSION_CODE_RANDOM_LENGTH = 4;
export const SESSION_CODE_REGEX = /^MESH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export const MIN_PASSCODE_LENGTH = 4;
export const MAX_PASSCODE_LENGTH = 32;
export const MIN_CLASS_NAME_LENGTH = 2;
export const MAX_CLASS_NAME_LENGTH = 80;
export const MIN_DISPLAY_NAME_LENGTH = 1;
export const MAX_DISPLAY_NAME_LENGTH = 40;

// Rate Limiting (In-Memory per IP)
export const RATE_LIMIT_CREATE_SESSION_MAX = 10; // Max 10 creates per 10 minutes
export const RATE_LIMIT_CREATE_SESSION_WINDOW_MS = 10 * 60 * 1000;
export const RATE_LIMIT_JOIN_SESSION_MAX = 30; // Max 30 join attempts per 5 minutes
export const RATE_LIMIT_JOIN_SESSION_WINDOW_MS = 5 * 60 * 1000;

// WebRTC Configuration
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// DataChannel Wire Message Types (Binary protocol opcodes for Phase 2+)
export enum WireMessageType {
  BITFIELD = 0x01,
  HAVE = 0x02,
  REQUEST = 0x03,
  PIECE = 0x04,
  CHOKE = 0x05,
  UNCHOKE = 0x06
}

// WebSocket Signaling Event Names
export enum SignalingEventType {
  PEER_JOINED = 'peer-joined',
  PEER_LEFT = 'peer-left',
  ROOM_ROSTER = 'room-roster',
  SESSION_ENDED = 'session-ended',
  SIGNAL_OFFER = 'signal-offer',
  SIGNAL_ANSWER = 'signal-answer',
  SIGNAL_ICE = 'signal-ice',
  TELEMETRY_HEARTBEAT = 'telemetry-heartbeat',
  SWARM_METRICS_UPDATE = 'swarm-metrics-update',
  ERROR = 'error'
}

// Phase 3 P2P & DataChannel Constants
export const CAMPUS_MESH_PROTOCOL_VERSION = 1;
export const MAX_PEER_CONNECTIONS = 6;
export const P2P_CHUNK_TIMEOUT_MS = 1500;
export const P2P_REQUEST_RETRIES = 2;
export const P2P_BUFFER_LOW_THRESHOLD = 65536; // 64 KB backpressure threshold
export const P2P_BUFFER_HIGH_WATERMARK = 196608; // 192 KB pause threshold
export const P2P_BLOCK_SIZE = 65536; // 64 KB sub-piece block size
export const DATA_CHANNEL_LABEL = 'campus-mesh-data';

