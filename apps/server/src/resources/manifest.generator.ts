/**
 * Campus Mesh — Streaming SHA-256 Manifest Generator
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { CHUNK_SIZE_BYTES, type ChunkManifestEntry } from '@campus-mesh/shared';

export interface GeneratedManifestResult {
  fileSize: number;
  totalChunks: number;
  fileHash: string;
  chunks: ChunkManifestEntry[];
}

export class ManifestGenerator {
  /**
   * Streams a file from disk in 256 KB slices, calculating per-chunk SHA-256
   * and the overall file SHA-256 with minimal memory footprint.
   */
  public static async generate(
    filePath: string,
    chunkSize = CHUNK_SIZE_BYTES
  ): Promise<GeneratedManifestResult> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath);
      const wholeFileHasher = crypto.createHash('sha256');

      const chunks: ChunkManifestEntry[] = [];
      let bufferAccumulator = Buffer.alloc(0);
      let chunkIndex = 0;
      let totalBytes = 0;

      readStream.on('data', (chunk: Buffer | string) => {
        const incomingData = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        wholeFileHasher.update(incomingData);
        totalBytes += incomingData.length;
        bufferAccumulator = Buffer.concat([bufferAccumulator, incomingData]);

        while (bufferAccumulator.length >= chunkSize) {
          const slice = bufferAccumulator.subarray(0, chunkSize);
          bufferAccumulator = bufferAccumulator.subarray(chunkSize);

          const chunkHash = crypto.createHash('sha256').update(slice).digest('hex');
          chunks.push({
            index: chunkIndex++,
            size: slice.length,
            sha256: chunkHash
          });
        }
      });

      readStream.on('end', () => {
        // Handle final partial chunk if any
        if (bufferAccumulator.length > 0) {
          const chunkHash = crypto.createHash('sha256').update(bufferAccumulator).digest('hex');
          chunks.push({
            index: chunkIndex++,
            size: bufferAccumulator.length,
            sha256: chunkHash
          });
          bufferAccumulator = Buffer.alloc(0);
        }

        const fileHash = wholeFileHasher.digest('hex');

        resolve({
          fileSize: totalBytes,
          totalChunks: chunks.length,
          fileHash,
          chunks
        });
      });

      readStream.on('error', (err) => {
        reject(err);
      });
    });
  }
}
