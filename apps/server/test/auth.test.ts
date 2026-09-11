/**
 * Campus Mesh — Authentication & Token Unit Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PasswordService } from '../src/auth/password.service.js';
import { TokenService } from '../src/auth/token.service.js';
import { InMemoryRateLimiter } from '../src/auth/rate-limiter.js';

describe('Auth & Security Services', () => {
  test('PasswordService: hashes and verifies plaintext passcode correctly', async () => {
    const rawPasscode = 'secretPass123';
    const hash = await PasswordService.hashPassword(rawPasscode);

    assert.ok(hash.includes(':'), 'Hash must contain salt:key delimiter');
    const parts = hash.split(':');
    assert.strictEqual(parts.length, 2);
    assert.strictEqual(parts[0].length, 32, 'Salt must be 16 bytes hex (32 chars)');

    // Correct passcode verifies true
    const isValid = await PasswordService.verifyPassword(rawPasscode, hash);
    assert.strictEqual(isValid, true, 'Valid password must verify true');

    // Incorrect passcode verifies false
    const isInvalid = await PasswordService.verifyPassword('wrongPassword', hash);
    assert.strictEqual(isInvalid, false, 'Invalid password must verify false');

    // Malformed hash handles gracefully
    const malformed = await PasswordService.verifyPassword(rawPasscode, 'malformed_hash_no_colon');
    assert.strictEqual(malformed, false, 'Malformed hash must return false without throwing');
  });

  test('TokenService: signs and verifies JWT tokens with correct claims', () => {
    const peerId = TokenService.generatePeerId();
    assert.ok(peerId.startsWith('peer_'), 'Peer ID must start with peer_');
    assert.strictEqual(peerId.length, 13, 'Peer ID length must be 13 (peer_ + 8 hex chars)');

    const payload = {
      sessionId: 'sess_test_123',
      role: 'student' as const,
      peerId,
      sessionCode: 'MESH-9999',
      displayName: 'Alice'
    };

    const token = TokenService.signToken(payload);
    assert.ok(typeof token === 'string' && token.length > 20);

    const verified = TokenService.verifyToken(token);
    assert.ok(verified, 'Verified token must not be null');
    assert.strictEqual(verified.sessionId, payload.sessionId);
    assert.strictEqual(verified.role, payload.role);
    assert.strictEqual(verified.peerId, payload.peerId);
    assert.strictEqual(verified.displayName, payload.displayName);
  });

  test('TokenService: rejects tampered and invalid tokens', () => {
    const validToken = TokenService.signToken({
      sessionId: 'sess_123',
      role: 'student',
      sessionCode: 'MESH-0000',
      displayName: 'Bob'
    });

    // Tamper with payload
    const tampered = validToken.slice(0, -5) + 'xxxxx';
    const result = TokenService.verifyToken(tampered);
    assert.strictEqual(result, null, 'Tampered token must return null');

    const garbage = TokenService.verifyToken('not.a.valid.jwt');
    assert.strictEqual(garbage, null, 'Garbage token must return null');
  });

  test('InMemoryRateLimiter: enforces sliding window limits', () => {
    const limiter = new InMemoryRateLimiter();
    const testIp = '192.168.1.100';

    // Allow 3 requests per 1000ms
    assert.strictEqual(limiter.checkLimit(testIp, 3, 1000), true);
    assert.strictEqual(limiter.checkLimit(testIp, 3, 1000), true);
    assert.strictEqual(limiter.checkLimit(testIp, 3, 1000), true);

    // 4th request must be blocked
    assert.strictEqual(limiter.checkLimit(testIp, 3, 1000), false, 'Should be rate limited on 4th attempt');

    // Different IP must not be affected
    assert.strictEqual(limiter.checkLimit('192.168.1.101', 3, 1000), true);
  });
});
