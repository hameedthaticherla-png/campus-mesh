/**
 * Campus Mesh — SQLite Database Client (Native node:sqlite)
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: DatabaseSync | null = null;

export function initDatabase(dbPath = config.databasePath): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Performance and integrity pragmas
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Load and apply initial DDL schema
  const candidatePaths = [
    path.resolve(__dirname, './schema.sql'),
    path.resolve(__dirname, '../../src/database/schema.sql'),
    path.resolve(process.cwd(), 'apps/server/src/database/schema.sql'),
    path.resolve(process.cwd(), 'src/database/schema.sql')
  ];
  const schemaPath = candidatePaths.find((p) => fs.existsSync(p));
  if (schemaPath) {
    // Migration check: ensure resources table has status column if migrated from Phase 1
    try {
      const checkTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='resources'").get();
      if (checkTable) {
        const tableInfo = db.prepare("PRAGMA table_info(resources)").all() as { name: string }[];
        if (tableInfo.length > 0 && !tableInfo.some((col) => col.name === 'status')) {
          db.exec("ALTER TABLE resources ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';");
        }
      }
    } catch {
      // Ignored if table does not exist yet
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }

  dbInstance = db;
  return db;
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Resets database tables for test isolation.
 */
export function resetDatabase(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM chunk_manifests;
    DELETE FROM resources;
    DELETE FROM sessions;
  `);
}
