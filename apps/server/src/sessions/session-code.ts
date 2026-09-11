/**
 * Campus Mesh — Session Code Generator
 */

import crypto from 'node:crypto';
import {
  SESSION_CODE_PREFIX,
  SESSION_CODE_CHARSET,
  SESSION_CODE_RANDOM_LENGTH
} from '@campus-mesh/shared';
import { SessionRepository } from '../database/session.repository.js';

export class SessionCodeGenerator {
  /**
   * Generates a random alphanumeric candidate code.
   * E.g. "MESH-7K4P"
   */
  public static generateCandidate(): string {
    const chars = SESSION_CODE_CHARSET;
    const bytes = crypto.randomBytes(SESSION_CODE_RANDOM_LENGTH);
    let randomPart = '';

    for (let i = 0; i < SESSION_CODE_RANDOM_LENGTH; i++) {
      const index = bytes[i] % chars.length;
      randomPart += chars[index];
    }

    return `${SESSION_CODE_PREFIX}-${randomPart}`;
  }

  /**
   * Generates a guaranteed-unique session code among currently active sessions.
   */
  public static generateUniqueCode(maxAttempts = 10): string {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = this.generateCandidate();
      const existing = SessionRepository.findActiveByCode(code);
      if (!existing) {
        return code;
      }
    }

    throw new Error('Failed to generate a unique session code after multiple attempts.');
  }
}
