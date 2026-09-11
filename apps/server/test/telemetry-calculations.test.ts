/**
 * Campus Mesh — Telemetry Calculations Unit Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  calculateP2PPercentage,
  calculateBandwidthSaved,
  calculateTransferRate,
  calculateHealthStatus,
  formatBytes
} from '@campus-mesh/shared';

describe('Telemetry Calculations (Pure Mathematical Verification)', () => {
  describe('calculateP2PPercentage', () => {
    test('returns 0 when total bytes is 0 (safe zero-division guard)', () => {
      assert.strictEqual(calculateP2PPercentage(0, 0), 0);
    });

    test('returns 100 when all bytes are from P2P', () => {
      assert.strictEqual(calculateP2PPercentage(1048576, 0), 100);
    });

    test('returns 0 when all bytes are from Origin', () => {
      assert.strictEqual(calculateP2PPercentage(0, 1048576), 0);
    });

    test('computes accurate ratio with 1-decimal precision', () => {
      // 3 chunks P2P (768 KB), 1 chunk Origin (256 KB) => 75%
      assert.strictEqual(calculateP2PPercentage(768 * 1024, 256 * 1024), 75);

      // 1 chunk P2P (256 KB), 2 chunks Origin (512 KB) => 33.3%
      assert.strictEqual(calculateP2PPercentage(256 * 1024, 512 * 1024), 33.3);
    });
  });

  describe('calculateBandwidthSaved', () => {
    test('equals exactly the P2P downloaded bytes', () => {
      const p2pBytes = 52428800; // 50 MB
      assert.strictEqual(calculateBandwidthSaved(p2pBytes), 52428800);
    });

    test('clamps negative values to 0', () => {
      assert.strictEqual(calculateBandwidthSaved(-100), 0);
    });
  });

  describe('calculateTransferRate', () => {
    test('returns 0 if elapsed time is 0 (division by zero protection)', () => {
      assert.strictEqual(calculateTransferRate(1048576, 0), 0);
      assert.strictEqual(calculateTransferRate(1048576, -1), 0);
    });

    test('calculates correct throughput bytes per second', () => {
      // 10 MB in 2 seconds = 5 MB/s
      const tenMb = 10 * 1024 * 1024;
      assert.strictEqual(calculateTransferRate(tenMb, 2), 5 * 1024 * 1024);
    });
  });

  describe('calculateHealthStatus', () => {
    test('returns "fallback" when 0 active peers connected', () => {
      assert.strictEqual(calculateHealthStatus(0, 0, 0, 100), 'fallback');
    });

    test('returns "fallback" when repeated origin fallbacks occurred and P2P ratio is low', () => {
      assert.strictEqual(calculateHealthStatus(2, 0, 3, 10), 'fallback');
    });

    test('returns "degraded" when corrupted chunks detected', () => {
      assert.strictEqual(calculateHealthStatus(3, 1, 0, 90), 'degraded');
    });

    test('returns "degraded" when P2P ratio drops below 50%', () => {
      assert.strictEqual(calculateHealthStatus(3, 0, 0, 45), 'degraded');
    });

    test('returns "excellent" when active peers exist with clean high-ratio P2P transfer', () => {
      assert.strictEqual(calculateHealthStatus(4, 0, 0, 85), 'excellent');
    });
  });

  describe('formatBytes', () => {
    test('formats 0 bytes', () => {
      assert.strictEqual(formatBytes(0), '0 B');
    });

    test('formats bytes, kilobytes, megabytes, gigabytes cleanly', () => {
      assert.strictEqual(formatBytes(500), '500.0 B');
      assert.strictEqual(formatBytes(1024), '1.0 KB');
      assert.strictEqual(formatBytes(1048576), '1.0 MB');
      assert.strictEqual(formatBytes(1073741824), '1.0 GB');
      assert.strictEqual(formatBytes(262144), '256.0 KB');
    });
  });
});
