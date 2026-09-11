/**
 * Campus Mesh — Environment Configuration & Validation
 */

import path from 'node:path';
import fs from 'node:fs';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  databasePath: string;
  storageDir: string;
  tempStorageDir: string;
  resourceStorageDir: string;
  maxResourceSizeMb: number;
  jwtSecret: string;
  sessionTtlHours: number;
  corsOrigin: string;
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';
  const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS) || 3;
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const maxResourceSizeMb = Number(process.env.MAX_RESOURCE_SIZE_MB) || 5120; // 5 GB default

  // In production, JWT_SECRET must be explicitly set, of high entropy (>= 32 chars), and not the default dev key
  let jwtSecret = process.env.JWT_SECRET;
  if (nodeEnv === 'production') {
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('dev_insecure')) {
      throw new Error(
        'Production Security Error: JWT_SECRET environment variable must be set to a cryptographically secure key of at least 32 characters in production mode.'
      );
    }
  } else {
    jwtSecret = jwtSecret || 'dev_insecure_jwt_secret_key_minimum_32_chars_campus_mesh';
  }

  const databasePath = process.env.DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), './storage/campus_mesh.db');

  const storageDir = process.env.STORAGE_DIR
    ? path.resolve(process.cwd(), process.env.STORAGE_DIR)
    : path.resolve(process.cwd(), './storage/uploads');

  const tempStorageDir = path.resolve(storageDir, 'temporary');
  const resourceStorageDir = path.resolve(storageDir, 'resources');

  // Ensure storage directories exist
  const dbDir = path.dirname(databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  if (!fs.existsSync(tempStorageDir)) {
    fs.mkdirSync(tempStorageDir, { recursive: true });
  }
  if (!fs.existsSync(resourceStorageDir)) {
    fs.mkdirSync(resourceStorageDir, { recursive: true });
  }

  return {
    nodeEnv,
    port,
    host,
    databasePath,
    storageDir,
    tempStorageDir,
    resourceStorageDir,
    maxResourceSizeMb,
    jwtSecret,
    sessionTtlHours,
    corsOrigin
  };
}

export const config = loadConfig();
