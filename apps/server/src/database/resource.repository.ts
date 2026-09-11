/**
 * Campus Mesh — Resource & Chunk Manifest Repository (Parameterized SQLite Queries)
 */

import { getDb } from './db.client.js';
import type { ChunkManifestEntry, ResourceStatus } from '@campus-mesh/shared';

export interface ResourceRow {
  id: string;
  session_id: string;
  file_name: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  file_hash: string;
  storage_path: string;
  status: ResourceStatus;
  created_at: string;
}

export interface ChunkManifestRow {
  id: number;
  resource_id: string;
  chunk_index: number;
  sha256_hash: string;
}

export interface CreateResourceParams {
  id: string;
  sessionId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  fileHash: string;
  storagePath: string;
  status?: ResourceStatus;
}

export class ResourceRepository {
  /**
   * Atomically persists a resource and its complete chunk manifest in a single SQLite transaction.
   */
  public static createWithManifest(
    resource: CreateResourceParams,
    chunks: ChunkManifestEntry[]
  ): ResourceRow {
    const db = getDb();
    const status = resource.status || 'ready';

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertResource = db.prepare(`
        INSERT INTO resources (
          id, session_id, file_name, file_size, chunk_size, total_chunks, file_hash, storage_path, status
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      insertResource.run(
        resource.id,
        resource.sessionId,
        resource.fileName,
        resource.fileSize,
        resource.chunkSize,
        resource.totalChunks,
        resource.fileHash,
        resource.storagePath,
        status
      );

      const insertChunk = db.prepare(`
        INSERT INTO chunk_manifests (
          resource_id, chunk_index, sha256_hash
        ) VALUES (
          ?, ?, ?
        )
      `);

      for (const chunk of chunks) {
        insertChunk.run(resource.id, chunk.index, chunk.sha256);
      }

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return this.findById(resource.id)!;
  }

  public static findById(id: string): ResourceRow | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT id, session_id, file_name, file_size, chunk_size, total_chunks, file_hash, storage_path, status, created_at
      FROM resources
      WHERE id = ?
    `);

    const row = stmt.get(id) as unknown as ResourceRow | undefined;
    return row || null;
  }

  public static findBySessionId(sessionId: string, onlyReady = true): ResourceRow[] {
    const db = getDb();
    const sql = onlyReady
      ? `SELECT id, session_id, file_name, file_size, chunk_size, total_chunks, file_hash, storage_path, status, created_at
         FROM resources
         WHERE session_id = ? AND status = 'ready'
         ORDER BY created_at DESC`
      : `SELECT id, session_id, file_name, file_size, chunk_size, total_chunks, file_hash, storage_path, status, created_at
         FROM resources
         WHERE session_id = ?
         ORDER BY created_at DESC`;

    const stmt = db.prepare(sql);
    const rows = stmt.all(sessionId) as unknown as ResourceRow[];
    return rows || [];
  }

  public static getChunks(resourceId: string): ChunkManifestEntry[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT chunk_index AS "index", sha256_hash AS sha256
      FROM chunk_manifests
      WHERE resource_id = ?
      ORDER BY chunk_index ASC
    `);

    const rows = stmt.all(resourceId) as unknown as Array<{ index: number; sha256: string }>;
    return rows.map(r => ({
      index: r.index,
      size: 0, // Will be computed or populated by service
      sha256: r.sha256
    }));
  }

  public static getChunk(resourceId: string, chunkIndex: number): string | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT sha256_hash
      FROM chunk_manifests
      WHERE resource_id = ? AND chunk_index = ?
    `);

    const row = stmt.get(resourceId, chunkIndex) as unknown as { sha256_hash: string } | undefined;
    return row ? row.sha256_hash : null;
  }

  public static delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare(`
      DELETE FROM resources
      WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }
}
