/**
 * Campus Mesh — Health Check Routes
 */

import type { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: 'campus-mesh-control-plane',
      timestamp: new Date().toISOString()
    };
  });
}
