/**
 * Campus Mesh — Chunk Math & Boundary Calculator
 */

import { CHUNK_SIZE_BYTES } from '@campus-mesh/shared';

export interface ChunkBounds {
  index: number;
  start: number;
  end: number;           // Exclusive end byte offset [start, end)
  streamEnd: number;     // Inclusive end byte offset for fs.createReadStream { start, end: streamEnd }
  length: number;        // Total bytes in this slice
}

export class ChunkCalculator {
  /**
   * Calculates total chunks for a given file size.
   * E.g. 256 KB -> 1 chunk; 512 KB -> 2 chunks; 257 KB -> 2 chunks; 1 byte -> 1 chunk.
   */
  public static calculateTotalChunks(fileSize: number, chunkSize = CHUNK_SIZE_BYTES): number {
    if (fileSize <= 0) return 0;
    return Math.ceil(fileSize / chunkSize);
  }

  /**
   * Calculates exact byte offsets for a chunk index.
   */
  public static calculateChunkBounds(index: number, fileSize: number, chunkSize = CHUNK_SIZE_BYTES): ChunkBounds {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const length = Math.max(0, end - start);
    const streamEnd = Math.max(start, end - 1);

    return {
      index,
      start,
      end,
      streamEnd,
      length
    };
  }

  /**
   * Validates chunk index parameter against total chunks.
   * Returns parsed integer index or error status/message.
   */
  public static validateChunkIndex(
    rawIndex: unknown,
    totalChunks: number
  ): { valid: true; index: number } | { valid: false; statusCode: number; message: string } {
    if (typeof rawIndex !== 'string' && typeof rawIndex !== 'number') {
      return { valid: false, statusCode: 400, message: 'Invalid chunk index parameter.' };
    }

    const str = String(rawIndex).trim();
    // Must be integer digits only
    if (!/^\d+$/.test(str)) {
      return { valid: false, statusCode: 400, message: 'Chunk index must be a non-negative integer.' };
    }

    const index = Number.parseInt(str, 10);
    if (!Number.isSafeInteger(index) || index < 0) {
      return { valid: false, statusCode: 400, message: 'Chunk index must be a non-negative safe integer.' };
    }

    if (totalChunks <= 0 || index >= totalChunks) {
      return {
        valid: false,
        statusCode: 404,
        message: `Chunk index ${index} out of range (total chunks: ${totalChunks}).`
      };
    }

    return { valid: true, index };
  }
}
