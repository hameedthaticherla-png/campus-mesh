/**
 * Campus Mesh — Session Domain & Repository Tests
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { initDatabase, resetDatabase } from '../src/database/db.client.js';
import { SessionService } from '../src/sessions/session.service.js';
import { SessionRepository } from '../src/database/session.repository.js';
import { SessionCodeGenerator } from '../src/sessions/session-code.js';

describe('Session Domain & Repository', () => {
  beforeEach(() => {
    initDatabase();
    resetDatabase();
  });

  test('SessionCodeGenerator: produces valid MESH-XXXX format codes', () => {
    const code = SessionCodeGenerator.generateCandidate();
    assert.match(code, /^MESH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  });

  test('SessionService: creates new session with instructor token', async () => {
    const response = await SessionService.createSession({
      className: 'Distributed Computing',
      instructorName: 'Prof. Turing',
      passcode: 'algo123'
    });

    assert.ok(response.session.id.startsWith('sess_'));
    assert.match(response.session.sessionCode, /^MESH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    assert.strictEqual(response.session.className, 'Distributed Computing');
    assert.strictEqual(response.session.instructorName, 'Prof. Turing');
    assert.ok(response.instructorToken.length > 20);

    // Verify row in SQLite
    const row = SessionRepository.findById(response.session.id);
    assert.ok(row);
    assert.strictEqual(row.class_name, 'Distributed Computing');
    assert.notStrictEqual(row.passcode_hash, 'algo123', 'Plaintext passcode must never be stored');
  });

  test('SessionService: student joins with correct passcode', async () => {
    const created = await SessionService.createSession({
      className: 'Machine Learning',
      instructorName: 'Dr. Ng',
      passcode: 'weights456'
    });

    const joinRes = await SessionService.joinSession({
      sessionCode: created.session.sessionCode,
      passcode: 'weights456',
      displayName: 'Alice Student'
    });

    assert.strictEqual(joinRes.session.id, created.session.id);
    assert.ok(joinRes.peerId.startsWith('peer_'));
    assert.ok(joinRes.peerToken.length > 20);
    assert.ok(Array.isArray(joinRes.iceServers));
  });

  test('SessionService: rejects join with wrong passcode', async () => {
    const created = await SessionService.createSession({
      className: 'Databases',
      instructorName: 'Prof. Stonebraker',
      passcode: 'correctPass'
    });

    await assert.rejects(
      async () => {
        await SessionService.joinSession({
          sessionCode: created.session.sessionCode,
          passcode: 'wrongPass'
        });
      },
      (err: { statusCode?: number; message?: string }) => {
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.message, 'Incorrect session passcode.');
        return true;
      }
    );
  });

  test('SessionService: rejects join for nonexistent session code', async () => {
    await assert.rejects(
      async () => {
        await SessionService.joinSession({
          sessionCode: 'MESH-ZZZZ',
          passcode: 'anyPass'
        });
      },
      (err: { statusCode?: number; message?: string }) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );
  });

  test('SessionService: rejects join for expired session', async () => {
    // Create session that expires in negative time (already expired)
    const created = await SessionService.createSession({
      className: 'History 101',
      instructorName: 'Dr. Brown',
      passcode: 'time123',
      durationHours: -1
    });

    await assert.rejects(
      async () => {
        await SessionService.joinSession({
          sessionCode: created.session.sessionCode,
          passcode: 'time123'
        });
      },
      (err: { statusCode?: number; message?: string }) => {
        assert.strictEqual(err.statusCode, 410);
        return true;
      }
    );
  });

  test('SessionService: instructor ends session, closing it for further joins', async () => {
    const created = await SessionService.createSession({
      className: 'Compiler Construction',
      instructorName: 'Dr. Aho',
      passcode: 'dragon123'
    });

    const endRes = await SessionService.endSession(created.session.id, 'instructor', created.session.id);
    assert.strictEqual(endRes.success, true);

    // Subsequent join attempt must fail with 404 (session ended)
    await assert.rejects(
      async () => {
        await SessionService.joinSession({
          sessionCode: created.session.sessionCode,
          passcode: 'dragon123'
        });
      },
      (err: { statusCode?: number }) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );
  });
});
