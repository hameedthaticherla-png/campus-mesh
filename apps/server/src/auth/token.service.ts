/**
 * Campus Mesh — Token & Identity Service
 */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/env.config.js';
import type { AuthTokenPayload } from '@campus-mesh/shared';

export class TokenService {
  /**
   * Generates a cryptographically random ephemeral peer identity.
   * E.g. "peer_a7b9c24f"
   */
  public static generatePeerId(): string {
    const randomHex = crypto.randomBytes(4).toString('hex');
    return `peer_${randomHex}`;
  }

  /**
   * Signs a short-lived session-scoped token.
   */
  public static signToken(payload: AuthTokenPayload, expiresInSeconds?: number): string {
    const ttlSeconds = expiresInSeconds || config.sessionTtlHours * 3600;
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: ttlSeconds
    });
  }

  /**
   * Verifies and decodes a session-scoped token.
   */
  public static verifyToken(token: string): AuthTokenPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }
}
