/**
 * Campus Mesh — Resource & Chunk REST Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ResourceService } from '../../resources/resource.service.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export async function resourceRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/sessions/:id/resources
   * Multipart upload of a classroom resource (Instructor only)
   */
  fastify.post<{ Params: { id: string } }>(
    '/sessions/:id/resources',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const sessionId = req.params.id;
      const user = req.user!;

      // Handle multipart file upload
      const part = await req.file();
      if (!part) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No file found in multipart request payload.'
        });
      }

      try {
        const resource = await ResourceService.processUpload({
          sessionId,
          userRole: user.role,
          userSessionId: user.sessionId,
          fileStream: part.file,
          originalFileName: part.filename
        });

        return reply.status(201).send({ resource });
      } catch (err: unknown) {
        const error = err as { statusCode?: number; message?: string };
        return reply.status(error.statusCode || 500).send({
          statusCode: error.statusCode || 500,
          error: error.statusCode === 413 ? 'Payload Too Large' : error.statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
          message: error.message || 'Failed to process resource upload.'
        });
      }
    }
  );

  /**
   * GET /api/sessions/:id/resources
   * Lists active resources for a classroom session (Instructor & Student)
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/resources',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const sessionId = req.params.id;
      const user = req.user!;

      try {
        const resources = await ResourceService.listResources(sessionId, user.sessionId);
        return reply.status(200).send({ resources });
      } catch (err: unknown) {
        const error = err as { statusCode?: number; message?: string };
        return reply.status(error.statusCode || 500).send({
          statusCode: error.statusCode || 500,
          error: error.statusCode === 403 ? 'Forbidden' : error.statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message: error.message || 'Failed to retrieve session resources.'
        });
      }
    }
  );

  /**
   * GET /api/resources/:id/manifest
   * Returns deterministic SHA-256 chunk manifest
   */
  fastify.get<{ Params: { id: string } }>(
    '/resources/:id/manifest',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const resourceId = req.params.id;
      const user = req.user!;

      try {
        const manifest = await ResourceService.getManifest(resourceId, user.sessionId);
        return reply.status(200).send(manifest);
      } catch (err: unknown) {
        const error = err as { statusCode?: number; message?: string };
        return reply.status(error.statusCode || 500).send({
          statusCode: error.statusCode || 500,
          error: error.statusCode === 403 ? 'Forbidden' : error.statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message: error.message || 'Failed to retrieve resource manifest.'
        });
      }
    }
  );

  /**
   * GET /api/resources/:id/chunks/:index
   * HTTP Chunk Streaming Endpoint (The Origin/Fallback Data Plane)
   */
  fastify.get<{ Params: { id: string; index: string } }>(
    '/resources/:id/chunks/:index',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { id: resourceId, index } = req.params;
      const user = req.user!;

      try {
        const chunk = await ResourceService.getChunkStream(resourceId, index, user.sessionId);

        reply.raw.setHeader('Content-Type', 'application/octet-stream');
        reply.raw.setHeader('Content-Length', String(chunk.length));
        reply.raw.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(chunk.fileName)}.chunk${chunk.chunkIndex}"`
        );
        reply.raw.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        reply.raw.setHeader('ETag', `"${chunk.chunkHash}"`);
        reply.raw.setHeader('X-Resource-Id', chunk.resourceId);
        reply.raw.setHeader('X-Chunk-Index', String(chunk.chunkIndex));
        reply.raw.setHeader('X-Chunk-SHA256', chunk.chunkHash);
        reply.raw.setHeader('X-Total-Chunks', String(chunk.totalChunks));

        return reply.send(chunk.stream);
      } catch (err: unknown) {
        const error = err as { statusCode?: number; message?: string };
        return reply.status(error.statusCode || 500).send({
          statusCode: error.statusCode || 500,
          error: error.statusCode === 400 ? 'Bad Request' : error.statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message: error.message || 'Failed to stream chunk.'
        });
      }
    }
  );

  /**
   * DELETE /api/resources/:id
   * Deletes a resource and associated manifests (Instructor only)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/resources/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const resourceId = req.params.id;
      const user = req.user!;

      try {
        const result = await ResourceService.deleteResource(resourceId, user.role, user.sessionId);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        const error = err as { statusCode?: number; message?: string };
        return reply.status(error.statusCode || 500).send({
          statusCode: error.statusCode || 500,
          error: error.statusCode === 403 ? 'Forbidden' : error.statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message: error.message || 'Failed to delete resource.'
        });
      }
    }
  );
}
