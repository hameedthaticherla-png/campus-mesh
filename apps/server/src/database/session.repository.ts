/**
 * Campus Mesh — Session Repository (Parameterized SQLite Queries)
 */

import { getDb } from './db.client.js';

export interface SessionRow {
  id: string;
  session_code: string;
  class_name: string;
  instructor_name: string;
  passcode_hash: string;
  created_at: string;
  expires_at: string;
  is_active: number;
}

export interface CreateSessionParams {
  id: string;
  sessionCode: string;
  className: string;
  instructorName: string;
  passcodeHash: string;
  expiresAt: string;
}

export class SessionRepository {
  public static create(params: CreateSessionParams): SessionRow {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO sessions (
        id, session_code, class_name, instructor_name, passcode_hash, expires_at, is_active
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 1
      )
    `);

    stmt.run(
      params.id,
      params.sessionCode,
      params.className,
      params.instructorName,
      params.passcodeHash,
      params.expiresAt
    );

    return this.findById(params.id)!;
  }

  public static findById(id: string): SessionRow | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT id, session_code, class_name, instructor_name, passcode_hash, created_at, expires_at, is_active
      FROM sessions
      WHERE id = ?
    `);

    const row = stmt.get(id) as unknown as SessionRow | undefined;
    return row || null;
  }

  public static findByCode(code: string): SessionRow | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT id, session_code, class_name, instructor_name, passcode_hash, created_at, expires_at, is_active
      FROM sessions
      WHERE session_code = ?
    `);

    const row = stmt.get(code.toUpperCase().trim()) as unknown as SessionRow | undefined;
    return row || null;
  }

  public static findActiveByCode(code: string): SessionRow | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT id, session_code, class_name, instructor_name, passcode_hash, created_at, expires_at, is_active
      FROM sessions
      WHERE session_code = ? AND is_active = 1
    `);

    const row = stmt.get(code.toUpperCase().trim()) as unknown as SessionRow | undefined;
    return row || null;
  }

  public static deactivate(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE sessions
      SET is_active = 0
      WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }
}
