/**
 * Campus Mesh — Chunk Integrity Verifier
 *
 * Verifies that downloaded binary chunk buffers match authoritative SHA-256 hashes
 * from the session resource manifest. Rejects corrupt or tampered chunks immediately.
 */

export interface IntegrityVerificationResult {
  valid: boolean;
  actualHash: string;
  expectedHash: string;
}

export class IntegrityVerifier {
  /**
   * Computes the lowercase hex-encoded SHA-256 digest of a Uint8Array.
   */
  public static async computeSha256(data: Uint8Array): Promise<string> {
    // 1. Browser Web Cryptography API
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const digestBuffer = await window.crypto.subtle.digest('SHA-256', buffer as unknown as BufferSource);
      const digestBytes = new Uint8Array(digestBuffer);
      let hex = '';
      for (let i = 0; i < digestBytes.length; i++) {
        hex += digestBytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    }

    // 2. Node.js or global crypto
    try {
      if (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.subtle) {
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        const digestBuffer = await (globalThis as any).crypto.subtle.digest('SHA-256', buffer as unknown as BufferSource);
        const digestBytes = new Uint8Array(digestBuffer);
        let hex = '';
        for (let i = 0; i < digestBytes.length; i++) {
          hex += digestBytes[i].toString(16).padStart(2, '0');
        }
        return hex;
      }

      // Fallback for Node.js test environment
      const nodeCrypto = await import('node:crypto');
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    } catch (err) {
      throw new Error(`No cryptographic SHA-256 provider available: ${err}`);
    }
  }

  /**
   * Verifies data buffer against expected SHA-256 hash.
   */
  public static async verify(
    data: Uint8Array,
    expectedHash: string
  ): Promise<IntegrityVerificationResult> {
    const actualHash = await this.computeSha256(data);
    const normalizedExpected = expectedHash.trim().toLowerCase();
    const normalizedActual = actualHash.trim().toLowerCase();

    return {
      valid: normalizedActual === normalizedExpected,
      actualHash: normalizedActual,
      expectedHash: normalizedExpected
    };
  }
}
