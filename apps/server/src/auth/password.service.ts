/**
 * Campus Mesh — Passcode Security Service (Scrypt + Salt + Timing-Safe Verify)
 */

import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SCRYPT_OPTIONS: crypto.ScryptOptions = {
  N: 16384, // CPU/memory cost
  r: 8,     // Block size
  p: 1      // Parallelization
};

export class PasswordService {
  /**
   * Hashes a plaintext passcode with a random salt using Scrypt.
   * Returns formatted string: "<salt_hex>:<derived_key_hex>"
   */
  public static async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
      crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  /**
   * Verifies a candidate passcode against the stored salt:hash using timing-safe comparison.
   */
  public static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    return new Promise((resolve) => {
      const parts = storedHash.split(':');
      if (parts.length !== 2) {
        return resolve(false);
      }

      const [salt, keyHex] = parts;
      const originalKey = Buffer.from(keyHex, 'hex');

      crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derivedKey) => {
        if (err) return resolve(false);
        if (originalKey.length !== derivedKey.length) return resolve(false);

        // Timing-safe comparison to prevent timing attacks
        const matches = crypto.timingSafeEqual(originalKey, derivedKey);
        resolve(matches);
      });
    });
  }
}
