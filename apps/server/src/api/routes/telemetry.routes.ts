/**
 * Campus Mesh — Session Swarm Telemetry REST Routes
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { telemetryManager } from '../../signaling/telemetry.manager.js';
import { SessionRepository } from '../../database/session.repository.js';

export const telemetryRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /sessions/:id/telemetry
   * Fetches latest aggregated swarm telemetry metrics for the session.
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/telemetry',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user;

      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
      }

      // Enforce session boundary
      if (user.sessionId !== id) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Cannot access telemetry from another session.' });
      }

      const session = SessionRepository.findById(id);
      if (!session) {
        return reply.status(404).send({ error: 'Not Found', message: 'Session does not exist.' });
      }

      const metrics = telemetryManager.getMetrics(id);
      return reply.status(200).send(metrics);
    }
  );

  /**
   * POST /sessions/:id/telemetry/reset
   * Resets in-memory swarm telemetry metrics for live demo restarts without destroying session or resources.
   */
  fastify.post<{ Params: { id: string } }>(
    '/sessions/:id/telemetry/reset',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user;

      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
      }

      // Only instructors can reset demo telemetry
      if (user.role !== 'instructor') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Only instructors can reset session telemetry.' });
      }

      // Enforce session boundary
      if (user.sessionId !== id) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Cannot reset telemetry for another session.' });
      }

      const session = SessionRepository.findById(id);
      if (!session) {
        return reply.status(404).send({ error: 'Not Found', message: 'Session does not exist.' });
      }

      telemetryManager.clearSession(id);
      const cleanMetrics = telemetryManager.getMetrics(id);

      return reply.status(200).send({
        success: true,
        message: 'Telemetry metrics reset successfully.',
        metrics: cleanMetrics
      });
    }
  );
};
