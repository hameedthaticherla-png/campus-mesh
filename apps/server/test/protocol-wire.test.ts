/**
 * Campus Mesh — P2P Binary Wire Protocol Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPUS_MESH_PROTOCOL_VERSION,
  WireMessageType,
  Bitfield,
  encodeBitfield,
  encodeHave,
  encodeRequest,
  encodePiece,
  encodeChoke,
  encodeUnchoke,
  decodeMessage
} from '@campus-mesh/shared';

test('Protocol Wire — BITFIELD Encoding & Decoding', () => {
  const resourceId = 'res_test123';
  const totalChunks = 19; // 3 bytes (19 bits)
  const bf = new Bitfield(totalChunks);
  bf.set(0);
  bf.set(7);
  bf.set(8);
  bf.set(18);

  const encoded = encodeBitfield(resourceId, totalChunks, bf);
  assert.ok(encoded instanceof Uint8Array);

  const decoded = decodeMessage(encoded);
  assert.equal(decoded.type, WireMessageType.BITFIELD);
  if (decoded.type === WireMessageType.BITFIELD) {
    assert.equal(decoded.resourceId, resourceId);
    assert.equal(decoded.totalChunks, totalChunks);
    assert.equal(decoded.bitfield.has(0), true);
    assert.equal(decoded.bitfield.has(1), false);
    assert.equal(decoded.bitfield.has(7), true);
    assert.equal(decoded.bitfield.has(8), true);
    assert.equal(decoded.bitfield.has(18), true);
    assert.equal(decoded.bitfield.count(), 4);
  }
});

test('Protocol Wire — HAVE Encoding & Decoding', () => {
  const resourceId = 'res_have456';
  const chunkIndex = 42;

  const encoded = encodeHave(resourceId, chunkIndex);
  const decoded = decodeMessage(encoded);

  assert.equal(decoded.type, WireMessageType.HAVE);
  if (decoded.type === WireMessageType.HAVE) {
    assert.equal(decoded.resourceId, resourceId);
    assert.equal(decoded.chunkIndex, chunkIndex);
  }

  assert.throws(() => encodeHave(resourceId, -1), RangeError);
});

test('Protocol Wire — REQUEST Encoding & Decoding', () => {
  const resourceId = 'res_req789';
  const chunkIndex = 1005;

  const encoded = encodeRequest(resourceId, chunkIndex);
  const decoded = decodeMessage(encoded);

  assert.equal(decoded.type, WireMessageType.REQUEST);
  if (decoded.type === WireMessageType.REQUEST) {
    assert.equal(decoded.resourceId, resourceId);
    assert.equal(decoded.chunkIndex, chunkIndex);
  }

  assert.throws(() => encodeRequest(resourceId, -5), RangeError);
});

test('Protocol Wire — PIECE Encoding & Decoding with Exact Binary Bytes', () => {
  const resourceId = 'res_piece001';
  const chunkIndex = 3;
  const beginOffset = 65536;
  const totalLength = 262144;
  const payload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

  const encoded = encodePiece(resourceId, chunkIndex, beginOffset, totalLength, payload);
  const decoded = decodeMessage(encoded);

  assert.equal(decoded.type, WireMessageType.PIECE);
  if (decoded.type === WireMessageType.PIECE) {
    assert.equal(decoded.resourceId, resourceId);
    assert.equal(decoded.chunkIndex, chunkIndex);
    assert.equal(decoded.beginOffset, beginOffset);
    assert.equal(decoded.totalLength, totalLength);
    assert.deepEqual(Array.from(decoded.data), Array.from(payload));
  }
});

test('Protocol Wire — CHOKE & UNCHOKE Encoding & Decoding', () => {
  const resourceId = 'res_flow';

  const chokeEncoded = encodeChoke(resourceId);
  const chokeDecoded = decodeMessage(chokeEncoded);
  assert.equal(chokeDecoded.type, WireMessageType.CHOKE);
  assert.equal(chokeDecoded.resourceId, resourceId);

  const unchokeEncoded = encodeUnchoke(resourceId);
  const unchokeDecoded = decodeMessage(unchokeEncoded);
  assert.equal(unchokeDecoded.type, WireMessageType.UNCHOKE);
  assert.equal(unchokeDecoded.resourceId, resourceId);
});

test('Protocol Wire — Malformed & Truncated Packet Protection', () => {
  // Too short
  assert.throws(() => decodeMessage(new Uint8Array([1, 2])), /too short/i);

  // Unsupported protocol version
  assert.throws(
    () => decodeMessage(new Uint8Array([99, WireMessageType.CHOKE, 0])),
    /unsupported protocol version/i
  );

  // Truncated resource ID
  assert.throws(
    () => decodeMessage(new Uint8Array([CAMPUS_MESH_PROTOCOL_VERSION, WireMessageType.CHOKE, 10, 65])),
    /declared resourceId length/i
  );

  // Truncated HAVE (missing 4-byte chunk index)
  assert.throws(
    () => decodeMessage(new Uint8Array([CAMPUS_MESH_PROTOCOL_VERSION, WireMessageType.HAVE, 1, 65, 0, 1])),
    /truncated HAVE/i
  );

  // Unknown opcode
  assert.throws(
    () => decodeMessage(new Uint8Array([CAMPUS_MESH_PROTOCOL_VERSION, 0x99, 1, 65])),
    /unknown wire message opcode/i
  );
});

test('Bitfield — Boundary Operations & Edge Cases', () => {
  // 0-chunk file
  const emptyBf = new Bitfield(0);
  assert.equal(emptyBf.isComplete(), true);
  assert.equal(emptyBf.count(), 0);

  // Multi-byte file
  const bf = new Bitfield(16);
  assert.equal(bf.isComplete(), false);
  bf.set(0);
  bf.set(15);
  assert.equal(bf.count(), 2);
  assert.deepEqual(bf.getAvailableIndices(), [0, 15]);

  bf.clear(0);
  assert.equal(bf.has(0), false);
  assert.equal(bf.count(), 1);

  // Complete bitfield
  const allBf = Bitfield.all(5);
  assert.equal(allBf.isComplete(), true);
  assert.equal(allBf.count(), 5);
  assert.deepEqual(allBf.getMissingIndices(), []);

  // Out of bounds
  assert.throws(() => bf.set(16), RangeError);
  assert.throws(() => bf.set(-1), RangeError);
  assert.equal(bf.has(999), false);
});
