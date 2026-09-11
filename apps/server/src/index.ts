/**
 * Campus Mesh — Origin Server & Signaling Hub
 * Bootstrap Entrypoint
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { config } from './config/env.config.js';
import { initDatabase } from './database/db.client.js';
import { healthRoutes } from './api/routes/health.routes.js';
import { sessionRoutes } from './api/routes/session.routes.js';
import { resourceRoutes } from './api/routes/resource.routes.js';
import { telemetryRoutes } from './api/routes/telemetry.routes.js';
import { handleSignalingConnection } from './signaling/signaling.server.js';

export async function buildApp() {
  const server = Fastify({
    logger: config.nodeEnv !== 'test'
  });

  // 1. Initialize SQLite Database
  initDatabase();

  // 2. Register Plugins
  await server.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  await server.register(websocket, {
    options: {
      maxPayload: 65536 // 64 KB limit on signaling frames
    }
  });

  await server.register(multipart, {
    limits: {
      fileSize: config.maxResourceSizeMb * 1024 * 1024,
      files: 1
    }
  });

  // 3. Register REST API Routes
  await server.register(healthRoutes, { prefix: '/api' });
  await server.register(sessionRoutes, { prefix: '/api' });
  await server.register(resourceRoutes, { prefix: '/api' });
  await server.register(telemetryRoutes, { prefix: '/api' });

  // 4. Register WebSocket Signaling Route
  server.get('/ws/signaling', { websocket: true }, (socket, req) => {
    handleSignalingConnection(socket, req);
  });

  return server;
}

export async function startServer() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`[Campus Mesh] Server successfully running at http://${config.host}:${config.port}`);
    return app;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Auto-start when run directly
if (process.argv[1] && process.argv[1].endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  startServer();
}
