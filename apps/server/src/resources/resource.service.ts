/**
 * Campus Mesh — Resource Domain Service
 */

import crypto from 'node:crypto';
import path from 'node:path';
import {
  CHUNK_SIZE_BYTES,
  type ResourceInfo,
  type ResourceManifest,
  type DeleteResourceResponse
} from '@campus-mesh/shared';
import { config } from '../config/env.config.js';
import { localStorageProvider, LocalDiskStorageProvider } from '../storage/local-disk.storage.js';
import { ResourceRepository, type ResourceRow } from '../database/resource.repository.js';
import { SessionRepository } from '../database/session.repository.js';
import { ChunkCalculator, type ChunkBounds } from './chunk.calculator.js';
import { ManifestGenerator } from './manifest.generator.js';

export interface ChunkStreamResult {
  stream: NodeJS.ReadableStream;
  length: number;
  start: number;
  end: number;
  chunkHash: string;
  chunkIndex: number;
  totalChunks: number;
  fileName: string;
  fileSize: number;
  resourceId: string;
}

export class ResourceService {
  /**
   * Sanitizes uploaded filename to prevent directory traversal and injection.
   */
  public static sanitizeFilename(original: string): string {
    if (!original) return 'unnamed_resource.bin';
    // Remove null bytes, backslashes, leading directory paths
    const cleaned = path.basename(original.replace(/\0/g, '').replace(/\\/g, '/')).trim();
    return cleaned || 'unnamed_resource.bin';
  }

  /**
   * Processes a file upload stream atomically, generating SHA-256 manifest and storing metadata.
   */
  public static async processUpload(params: {
    sessionId: string;
    userRole: string;
    userSessionId: string;
    fileStream: NodeJS.ReadableStream;
    originalFileName: string;
  }): Promise<ResourceInfo> {
    const { sessionId, userRole, userSessionId, fileStream, originalFileName } = params;

    // 1. Authorization: Only instructor of this session may upload
    if (userRole !== 'instructor' || userSessionId !== sessionId) {
      throw { statusCode: 403, message: 'Only the session instructor can upload resources.' };
    }

    // 2. Verify Session validity
    const session = SessionRepository.findById(sessionId);
    if (!session || !session.is_active) {
      throw { statusCode: 404, message: 'Session not found or has been ended.' };
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      SessionRepository.deactivate(session.id);
      throw { statusCode: 410, message: 'Session has expired.' };
    }

    const safeFileName = this.sanitizeFilename(originalFileName);
    const tempFileId = `temp_${crypto.randomUUID()}.bin`;
    const tempFilePath = path.join(config.tempStorageDir, tempFileId);

    let bytesWritten = 0;
    try {
      // 3. Stream to temporary file
      bytesWritten = await localStorageProvider.saveStream(fileStream, tempFilePath);

      // 4. Validate file size constraints
      if (bytesWritten <= 0) {
        throw { statusCode: 400, message: 'Empty files are not allowed.' };
      }

      const maxBytes = config.maxResourceSizeMb * 1024 * 1024;
      if (bytesWritten > maxBytes) {
        throw {
          statusCode: 413,
          message: `File size exceeds maximum allowed limit of ${config.maxResourceSizeMb} MB.`
        };
      }

      // 5. Generate deterministic SHA-256 chunk manifest
      const manifestResult = await ManifestGenerator.generate(tempFilePath, CHUNK_SIZE_BYTES);

      // 6. Generate final immutable resource path and move atomically
      const resourceId = `res_${crypto.randomBytes(8).toString('hex')}`;
      const finalFilePath = path.join(config.resourceStorageDir, `${resourceId}.bin`);

      await localStorageProvider.move(tempFilePath, finalFilePath);

      // 7. Persist to SQLite in a single transaction
      const createdRow = ResourceRepository.createWithManifest(
        {
          id: resourceId,
          sessionId,
          fileName: safeFileName,
          fileSize: manifestResult.fileSize,
          chunkSize: CHUNK_SIZE_BYTES,
          totalChunks: manifestResult.totalChunks,
          fileHash: manifestResult.fileHash,
          storagePath: finalFilePath,
          status: 'ready'
        },
        manifestResult.chunks
      );

      return this.formatResourceInfo(createdRow);
    } catch (err) {
      // Clean up temporary file on failure
      await localStorageProvider.delete(tempFilePath).catch(() => {});
      throw err;
    }
  }

  /**
   * Lists all ready resources for a session with cross-session authorization enforcement.
   */
  public static async listResources(sessionId: string, userSessionId: string): Promise<ResourceInfo[]> {
    if (userSessionId !== sessionId) {
      throw { statusCode: 403, message: 'Cannot access resources belonging to another class session.' };
    }

    const session = SessionRepository.findById(sessionId);
    if (!session || !session.is_active) {
      throw { statusCode: 404, message: 'Session not found or has been ended.' };
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      SessionRepository.deactivate(session.id);
      throw { statusCode: 410, message: 'Session has expired.' };
    }

    const rows = ResourceRepository.findBySessionId(sessionId, true);
    return rows.map(r => this.formatResourceInfo(r));
  }

  /**
   * Retrieves complete chunk manifest for a resource.
   */
  public static async getManifest(resourceId: string, userSessionId: string): Promise<ResourceManifest> {
    const resource = ResourceRepository.findById(resourceId);
    if (!resource || resource.status !== 'ready') {
      throw { statusCode: 404, message: 'Resource not found.' };
    }

    if (userSessionId !== resource.session_id) {
      throw { statusCode: 403, message: 'Cannot access resource belonging to another class session.' };
    }

    const session = SessionRepository.findById(resource.session_id);
    if (!session || !session.is_active) {
      throw { statusCode: 404, message: 'Session not found or has been ended.' };
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      SessionRepository.deactivate(session.id);
      throw { statusCode: 410, message: 'Session has expired.' };
    }

    const rawChunks = ResourceRepository.getChunks(resource.id);
    const chunksWithSizes = rawChunks.map(c => {
      const bounds = ChunkCalculator.calculateChunkBounds(c.index, resource.file_size, resource.chunk_size);
      return {
        index: c.index,
        size: bounds.length,
        sha256: c.sha256
      };
    });

    return {
      resourceId: resource.id,
      sessionId: resource.session_id,
      fileName: resource.file_name,
      fileSize: resource.file_size,
      chunkSize: resource.chunk_size,
      totalChunks: resource.total_chunks,
      fileHash: resource.file_hash,
      createdAt: resource.created_at,
      chunks: chunksWithSizes,
      chunkHashes: chunksWithSizes.map(c => c.sha256)
    };
  }

  /**
   * Prepares a stream for a specific chunk index without loading the file into memory.
   */
  public static async getChunkStream(
    resourceId: string,
    rawIndex: unknown,
    userSessionId: string
  ): Promise<ChunkStreamResult> {
    const resource = ResourceRepository.findById(resourceId);
    if (!resource || resource.status !== 'ready') {
      throw { statusCode: 404, message: 'Resource not found.' };
    }

    if (userSessionId !== resource.session_id) {
      throw { statusCode: 403, message: 'Cannot access resource belonging to another class session.' };
    }

    const session = SessionRepository.findById(resource.session_id);
    if (!session || !session.is_active) {
      throw { statusCode: 404, message: 'Session not found or has been ended.' };
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      SessionRepository.deactivate(session.id);
      throw { statusCode: 410, message: 'Session has expired.' };
    }

    // Validate chunk index
    const validation = ChunkCalculator.validateChunkIndex(rawIndex, resource.total_chunks);
    if (!validation.valid) {
      throw { statusCode: validation.statusCode, message: validation.message };
    }

    const chunkIndex = validation.index;
    const bounds = ChunkCalculator.calculateChunkBounds(chunkIndex, resource.file_size, resource.chunk_size);
    const chunkHash = ResourceRepository.getChunk(resource.id, chunkIndex);

    if (!chunkHash) {
      throw { statusCode: 404, message: `Chunk index ${chunkIndex} not found in manifest.` };
    }

    const fileExists = await localStorageProvider.exists(resource.storage_path);
    if (!fileExists) {
      throw { statusCode: 404, message: 'Resource payload file missing from storage.' };
    }

    const stream = localStorageProvider.createReadStream(resource.storage_path, bounds.start, bounds.streamEnd);

    return {
      stream,
      length: bounds.length,
      start: bounds.start,
      end: bounds.end,
      chunkHash,
      chunkIndex,
      totalChunks: resource.total_chunks,
      fileName: resource.file_name,
      fileSize: resource.file_size,
      resourceId: resource.id
    };
  }

  /**
   * Deletes a resource, cascaded chunk manifests, and the physical file.
   */
  public static async deleteResource(
    resourceId: string,
    userRole: string,
    userSessionId: string
  ): Promise<DeleteResourceResponse> {
    if (userRole !== 'instructor') {
      throw { statusCode: 403, message: 'Only the session instructor can delete resources.' };
    }

    const resource = ResourceRepository.findById(resourceId);
    if (!resource) {
      throw { statusCode: 404, message: 'Resource not found.' };
    }

    if (userSessionId !== resource.session_id) {
      throw { statusCode: 403, message: 'Cannot delete resource belonging to another class session.' };
    }

    // Delete from SQLite database
    ResourceRepository.delete(resourceId);

    // Delete physical file from storage
    await localStorageProvider.delete(resource.storage_path).catch(() => {});

    return {
      success: true,
      message: 'Resource and chunk manifest successfully deleted.',
      resourceId
    };
  }

  private static formatResourceInfo(row: ResourceRow): ResourceInfo {
    return {
      id: row.id,
      sessionId: row.session_id,
      fileName: row.file_name,
      fileSize: row.file_size,
      chunkSize: row.chunk_size,
      totalChunks: row.total_chunks,
      fileHash: row.file_hash,
      status: row.status,
      createdAt: row.created_at
    };
  }
}
