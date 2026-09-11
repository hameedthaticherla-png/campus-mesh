/**
 * Campus Mesh — WebSocket Signaling Server & Event Dispatcher
 */

import type { WebSocket } from 'ws';
import type { FastifyRequest } from 'fastify';
import {
  SignalingEventType,
  type SignalingEnvelope,
  type PeerInfo
} from '@campus-mesh/shared';
import { TokenService } from '../auth/token.service.js';
import { SessionRepository } from '../database/session.repository.js';
import { roomManager } from './room.manager.js';
import { telemetryManager } from './telemetry.manager.js';
import type { ConnectedPeer } from './peer.types.js';
import type { PeerTelemetryReport } from '@campus-mesh/shared';

export function handleSignalingConnection(socket: WebSocket, req: FastifyRequest): void {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = url.searchParams.get('token');

  if (!token) {
    socket.close(4001, 'Authentication token required');
    return;
  }

  const payload = TokenService.verifyToken(token);
  if (!payload) {
    socket.close(4002, 'Invalid or expired token');
    return;
  }

  const session = SessionRepository.findById(payload.sessionId);
  if (!session || !session.is_active) {
    socket.close(4003, 'Session not found or inactive');
    return;
  }

  // Check expiration
  if (new Date(session.expires_at).getTime() < Date.now()) {
    SessionRepository.deactivate(session.id);
    socket.close(4004, 'Session has expired');
    return;
  }

  const peerId = payload.peerId || `instructor_${payload.sessionId.slice(-6)}`;
  const role = payload.role;
  const displayName = payload.displayName || (role === 'instructor' ? 'Instructor' : 'Student');

  const peer: ConnectedPeer = {
    peerId,
    sessionId: payload.sessionId,
    displayName,
    role,
    socket,
    joinedAt: Date.now()
  };

  // Add to in-memory room manager
  roomManager.addPeer(payload.sessionId, peer);

  // 1. Send existing room roster to the newly connected peer
  const existingPeers: PeerInfo[] = roomManager
    .getRoomPeers(payload.sessionId)
    .filter(p => p.peerId !== peerId)
    .map(p => ({
      peerId: p.peerId,
      displayName: p.displayName,
      role: p.role,
      joinedAt: p.joinedAt
    }));

  socket.send(JSON.stringify({
    type: SignalingEventType.ROOM_ROSTER,
    sessionId: payload.sessionId,
    senderPeerId: 'server',
    payload: {
      sessionId: payload.sessionId,
      peers: existingPeers
    }
  }));

  // 2. Broadcast peer-joined to all other peers in the room
  roomManager.broadcastToRoom(payload.sessionId, {
    type: SignalingEventType.PEER_JOINED,
    sessionId: payload.sessionId,
    senderPeerId: peerId,
    payload: {
      peerId,
      displayName,
      role,
      joinedAt: peer.joinedAt
    }
  }, peerId);

  // 3. Listen for incoming messages
  socket.on('message', (data: Buffer | string) => {
    try {
      const rawText = data.toString();
      if (rawText.length > 65536) {
        // Drop oversized frames (signaling frames should be < 64KB)
        return;
      }

      const envelope = JSON.parse(rawText) as SignalingEnvelope;
      if (!envelope || !envelope.type) {
        return;
      }

      // Security check: NEVER trust client-provided sessionId or senderPeerId
      envelope.sessionId = payload.sessionId;
      envelope.senderPeerId = peerId;

      // Normalize top-level offer/answer/candidate into payload and vice-versa
      const anyEnv = envelope as unknown as Record<string, unknown>;
      if (anyEnv.offer && !envelope.payload) {
        envelope.payload = { sdp: anyEnv.offer };
      } else if (anyEnv.answer && !envelope.payload) {
        envelope.payload = { sdp: anyEnv.answer };
      } else if (anyEnv.candidate && !envelope.payload) {
        envelope.payload = { candidate: anyEnv.candidate };
      } else if (envelope.payload) {
        const p = envelope.payload as Record<string, unknown>;
        if (envelope.type === SignalingEventType.SIGNAL_OFFER && p.sdp && !anyEnv.offer) {
          anyEnv.offer = p.sdp;
        } else if (envelope.type === SignalingEventType.SIGNAL_ANSWER && p.sdp && !anyEnv.answer) {
          anyEnv.answer = p.sdp;
        } else if (envelope.type === SignalingEventType.SIGNAL_ICE && p.candidate && !anyEnv.candidate) {
          anyEnv.candidate = p.candidate;
        }
      }

      // Handle telemetry heartbeat from peer
      if (envelope.type === SignalingEventType.TELEMETRY_HEARTBEAT) {
        const report = (envelope.payload || {}) as PeerTelemetryReport;
        report.peerId = peerId;
        report.displayName = displayName;
        const metrics = telemetryManager.updatePeerReport(payload.sessionId, report);
        roomManager.broadcastToRoom(payload.sessionId, {
          type: SignalingEventType.SWARM_METRICS_UPDATE,
          sessionId: payload.sessionId,
          senderPeerId: 'server',
          payload: metrics
        });
        return;
      }

      // Handle targeted signaling message (e.g. signal-offer, signal-answer, signal-ice)
      if (envelope.targetPeerId) {
        const targetPeer = roomManager.getPeer(payload.sessionId, envelope.targetPeerId);
        if (targetPeer && targetPeer.socket.readyState === 1 /* OPEN */) {
          targetPeer.socket.send(JSON.stringify(envelope));
        }
      }
    } catch {
      // Drop malformed JSON silently to protect server stability
    }
  });

  // 4. Handle socket disconnect
  const cleanup = () => {
    const removed = roomManager.removePeer(payload.sessionId, peerId, socket);
    if (removed) {
      telemetryManager.removePeer(payload.sessionId, peerId);
      const metrics = telemetryManager.getMetrics(payload.sessionId);

      roomManager.broadcastToRoom(payload.sessionId, {
        type: SignalingEventType.PEER_LEFT,
        sessionId: payload.sessionId,
        senderPeerId: peerId,
        payload: {
          peerId
        }
      });

      roomManager.broadcastToRoom(payload.sessionId, {
        type: SignalingEventType.SWARM_METRICS_UPDATE,
        sessionId: payload.sessionId,
        senderPeerId: 'server',
        payload: metrics
      });
    }
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
}
