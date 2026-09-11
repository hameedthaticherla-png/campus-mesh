/**
 * Campus Mesh — Session REST Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  RATE_LIMIT_CREATE_SESSION_MAX,
  RATE_LIMIT_CREATE_SESSION_WINDOW_MS,
  RATE_LIMIT_JOIN_SESSION_MAX,
  RATE_LIMIT_JOIN_SESSION_WINDOW_MS,
  type CreateSessionRequest,
  type JoinSessionRequest
} from '@campus-mesh/shared';
import { SessionService } from '../../sessions/session.service.js';
import { sessionCreateLimiter, sessionJoinLimiter } from '../../auth/rate-limiter.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/sessions
   * Creates a new classroom session (Instructor)
   */
  fastify.post('/sessions', async (req: FastifyRequest<{ Body: CreateSessionRequest }>, reply: FastifyReply) => {
    const ip = req.ip || '127.0.0.1';
    const allowed = sessionCreateLimiter.checkLimit(
      ip,
      RATE_LIMIT_CREATE_SESSION_MAX,
      RATE_LIMIT_CREATE_SESSION_WINDOW_MS
    );

    if (!allowed) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many sessions created recently. Please try again later.'
      });
    }

    try {
      const result = await SessionService.createSession(req.body);
      return reply.status(201).send(result);
    } catch (err: unknown) {
      const error = err as { statusCode?: number; message?: string };
      return reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        error: error.statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: error.message || 'Failed to create class session.'
      });
    }
  });

  /**
   * POST /api/sessions/join
   * Students join a class session by code and passcode
   */
  fastify.post('/sessions/join', async (req: FastifyRequest<{ Body: JoinSessionRequest }>, reply: FastifyReply) => {
    const ip = req.ip || '127.0.0.1';
    const allowed = sessionJoinLimiter.checkLimit(
      ip,
      RATE_LIMIT_JOIN_SESSION_MAX,
      RATE_LIMIT_JOIN_SESSION_WINDOW_MS
    );

    if (!allowed) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many join attempts. Please slow down and try again.'
      });
    }

    try {
      const result = await SessionService.joinSession(req.body);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as { statusCode?: number; message?: string };
      const status = error.statusCode || 500;
      let errorTitle = 'Internal Server Error';
      if (status === 400) errorTitle = 'Bad Request';
      else if (status === 401) errorTitle = 'Unauthorized';
      else if (status === 404) errorTitle = 'Not Found';
      else if (status === 410) errorTitle = 'Gone';

      return reply.status(status).send({
        statusCode: status,
        error: errorTitle,
        message: error.message || 'Failed to join session.'
      });
    }
  });

  /**
   * GET /api/sessions/:id
   * Retrieves session info (Authorized session members only)
   */
  fastify.get<{ Params: { id: string } }>('/sessions/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const sessionId = req.params.id;
    const user = req.user!;

    if (user.sessionId !== sessionId) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You are not authorized to view another class session.'
      });
    }

    try {
      const info = await SessionService.getSessionInfo(sessionId);
      return reply.status(200).send(info);
    } catch (err: unknown) {
      const error = err as { statusCode?: number; message?: string };
      return reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        error: error.statusCode === 404 ? 'Not Found' : error.statusCode === 410 ? 'Gone' : 'Internal Server Error',
        message: error.message || 'Failed to retrieve session info.'
      });
    }
  });

  /**
   * POST /api/sessions/:id/end
   * Ends an active session and evicts room peers (Instructor only)
   */
  fastify.post<{ Params: { id: string } }>('/sessions/:id/end', { preHandler: [requireAuth] }, async (req, reply) => {
    const sessionId = req.params.id;
    const user = req.user!;

    try {
      const result = await SessionService.endSession(sessionId, user.role, user.sessionId);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as { statusCode?: number; message?: string };
      return reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        error: error.statusCode === 403 ? 'Forbidden' : error.statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error.message || 'Failed to end session.'
      });
    }
  });
}
