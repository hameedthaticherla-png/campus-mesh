/**
 * Campus Mesh — JWT Authentication Middleware
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { TokenService } from '../../auth/token.service.js';
import type { AuthTokenPayload } from '@campus-mesh/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthTokenPayload;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header.'
    });
    return;
  }

  const token = authHeader.substring(7);
  const payload = TokenService.verifyToken(token);

  if (!payload) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired session token.'
    });
    return;
  }

  req.user = payload;
}
