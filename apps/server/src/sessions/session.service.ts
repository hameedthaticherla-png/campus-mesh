/**
 * Campus Mesh — Session Domain Service
 */

import crypto from 'node:crypto';
import {
  MIN_PASSCODE_LENGTH,
  MAX_PASSCODE_LENGTH,
  MIN_CLASS_NAME_LENGTH,
  MAX_CLASS_NAME_LENGTH,
  DEFAULT_SESSION_TTL_HOURS,
  SignalingEventType,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type JoinSessionRequest,
  type JoinSessionResponse,
  type SessionInfoResponse,
  type EndSessionResponse,
  DEFAULT_ICE_SERVERS
} from '@campus-mesh/shared';
import { SessionRepository, type SessionRow } from '../database/session.repository.js';
import { PasswordService } from '../auth/password.service.js';
import { TokenService } from '../auth/token.service.js';
import { SessionCodeGenerator } from './session-code.js';
import { roomManager } from '../signaling/room.manager.js';
import { telemetryManager } from '../signaling/telemetry.manager.js';

export class SessionService {
  /**
   * Creates a new class session.
   */
  public static async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const className = request.className?.trim();
    const instructorName = request.instructorName?.trim();
    const passcode = request.passcode?.trim();
    const durationHours = request.durationHours || DEFAULT_SESSION_TTL_HOURS;

    // Validation
    if (!className || className.length < MIN_CLASS_NAME_LENGTH || className.length > MAX_CLASS_NAME_LENGTH) {
      throw { statusCode: 400, message: `Class name must be between ${MIN_CLASS_NAME_LENGTH} and ${MAX_CLASS_NAME_LENGTH} characters.` };
    }
    if (!instructorName || instructorName.length < 2 || instructorName.length > 50) {
      throw { statusCode: 400, message: 'Instructor name must be between 2 and 50 characters.' };
    }
    if (!passcode || passcode.length < MIN_PASSCODE_LENGTH || passcode.length > MAX_PASSCODE_LENGTH) {
      throw { statusCode: 400, message: `Passcode must be between ${MIN_PASSCODE_LENGTH} and ${MAX_PASSCODE_LENGTH} characters.` };
    }

    const id = `sess_${crypto.randomUUID()}`;
    const sessionCode = SessionCodeGenerator.generateUniqueCode();
    const passcodeHash = await PasswordService.hashPassword(passcode);

    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

    const created = SessionRepository.create({
      id,
      sessionCode,
      className,
      instructorName,
      passcodeHash,
      expiresAt
    });

    const instructorToken = TokenService.signToken({
      sessionId: created.id,
      role: 'instructor',
      sessionCode: created.session_code,
      displayName: created.instructor_name
    });

    return {
      session: {
        id: created.id,
        sessionCode: created.session_code,
        className: created.class_name,
        instructorName: created.instructor_name,
        expiresAt: created.expires_at
      },
      instructorToken
    };
  }

  /**
   * Validates student join request and issues ephemeral peer identity and token.
   */
  public static async joinSession(request: JoinSessionRequest): Promise<JoinSessionResponse> {
    const sessionCode = request.sessionCode?.trim().toUpperCase();
    const passcode = request.passcode?.trim();
    const displayName = request.displayName?.trim() || 'Anonymous Student';

    if (!sessionCode) {
      throw { statusCode: 400, message: 'Session code is required.' };
    }
    if (!passcode) {
      throw { statusCode: 400, message: 'Passcode is required.' };
    }

    const session = SessionRepository.findByCode(sessionCode);
    if (!session || !session.is_active) {
      throw { statusCode: 404, message: 'Session not found or has been ended.' };
    }

    // Verify expiration
    if (this.isSessionExpired(session)) {
      SessionRepository.deactivate(session.id);
      throw { statusCode: 410, message: 'Class session has expired.' };
    }

    // Verify passcode
    const isPasswordValid = await PasswordService.verifyPassword(passcode, session.passcode_hash);
    if (!isPasswordValid) {
      throw { statusCode: 401, message: 'Incorrect session passcode.' };
    }

    const peerId = TokenService.generatePeerId();
    const peerToken = TokenService.signToken({
      sessionId: session.id,
      role: 'student',
      peerId,
      sessionCode: session.session_code,
      displayName
    });

    return {
      session: {
        id: session.id,
        sessionCode: session.session_code,
        className: session.class_name,
        instructorName: session.instructor_name,
        expiresAt: session.expires_at
      },
      peerId,
      peerToken,
      iceServers: DEFAULT_ICE_SERVERS
    };
  }

  /**
   * Retrieves session information (excluding security secrets).
   */
  public static async getSessionInfo(sessionId: string): Promise<SessionInfoResponse> {
    const session = SessionRepository.findById(sessionId);
    if (!session) {
      throw { statusCode: 404, message: 'Session not found.' };
    }

    if (this.isSessionExpired(session)) {
      SessionRepository.deactivate(session.id);
      throw { statusCode: 410, message: 'Session has expired.' };
    }

    return {
      id: session.id,
      sessionCode: session.session_code,
      className: session.class_name,
      instructorName: session.instructor_name,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      isActive: Boolean(session.is_active),
      activePeersCount: roomManager.getRoomSize(session.id)
    };
  }

  /**
   * Terminates a class session (Instructor only).
   */
  public static async endSession(sessionId: string, requesterRole: string, requesterSessionId: string): Promise<EndSessionResponse> {
    if (requesterRole !== 'instructor' || requesterSessionId !== sessionId) {
      throw { statusCode: 403, message: 'Only the instructor of this session can end it.' };
    }

    const session = SessionRepository.findById(sessionId);
    if (!session) {
      throw { statusCode: 404, message: 'Session not found.' };
    }

    // Mark inactive in SQLite
    SessionRepository.deactivate(sessionId);

    // Broadcast session-ended notification to all connected peers in room
    roomManager.broadcastToRoom(sessionId, {
      type: SignalingEventType.SESSION_ENDED,
      sessionId,
      payload: {
        sessionId,
        reason: 'Instructor ended the class session.'
      }
    });

    // Gracefully disconnect and evict all peers from room
    const evictedPeers = roomManager.deleteRoom(sessionId);
    for (const peer of evictedPeers) {
      try {
        peer.socket.close(1000, 'Session ended by instructor');
      } catch {
        // Ignore close errors
      }
    }

    // Clean up room telemetry from memory
    telemetryManager.clearSession(sessionId);

    return {
      success: true,
      message: 'Class session successfully ended and room closed.',
      sessionId
    };
  }

  private static isSessionExpired(session: SessionRow): boolean {
    const expiresAtMs = new Date(session.expires_at).getTime();
    return Date.now() > expiresAtMs;
  }
}
