/**
 * Campus Mesh — RoomManager & Class Isolation Unit Tests
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { RoomManager } from '../src/signaling/room.manager.js';
import type { ConnectedPeer } from '../src/signaling/peer.types.js';

describe('RoomManager (Class-Scoped Swarm Isolation)', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  const createMockSocket = () => ({
    readyState: 1,
    send: () => {},
    close: () => {}
  });

  test('RoomManager: adds, gets, and removes peers within a session', () => {
    const peerA: ConnectedPeer = {
      peerId: 'peer_111',
      sessionId: 'sess_A',
      displayName: 'Alice',
      role: 'student',
      socket: createMockSocket() as any,
      joinedAt: Date.now()
    };

    manager.addPeer('sess_A', peerA);
    assert.strictEqual(manager.getRoomSize('sess_A'), 1);
    assert.strictEqual(manager.getPeer('sess_A', 'peer_111')?.displayName, 'Alice');

    // Remove peer
    const removed = manager.removePeer('sess_A', 'peer_111');
    assert.strictEqual(removed?.peerId, 'peer_111');
    assert.strictEqual(manager.getRoomSize('sess_A'), 0);
  });

  test('RoomManager: guarantees strict class-session isolation', () => {
    const peerA: ConnectedPeer = {
      peerId: 'peer_A',
      sessionId: 'sess_CLASS_1',
      displayName: 'Student in Class 1',
      role: 'student',
      socket: createMockSocket() as any,
      joinedAt: Date.now()
    };

    const peerB: ConnectedPeer = {
      peerId: 'peer_B',
      sessionId: 'sess_CLASS_2',
      displayName: 'Student in Class 2',
      role: 'student',
      socket: createMockSocket() as any,
      joinedAt: Date.now()
    };

    manager.addPeer('sess_CLASS_1', peerA);
    manager.addPeer('sess_CLASS_2', peerB);

    // Class 1 must ONLY see peerA
    const class1Peers = manager.getRoomPeers('sess_CLASS_1');
    assert.strictEqual(class1Peers.length, 1);
    assert.strictEqual(class1Peers[0].peerId, 'peer_A');

    // Class 2 must ONLY see peerB
    const class2Peers = manager.getRoomPeers('sess_CLASS_2');
    assert.strictEqual(class2Peers.length, 1);
    assert.strictEqual(class2Peers[0].peerId, 'peer_B');

    // Cross-session lookup must return null
    assert.strictEqual(manager.getPeer('sess_CLASS_1', 'peer_B'), null);
    assert.strictEqual(manager.getPeer('sess_CLASS_2', 'peer_A'), null);
  });

  test('RoomManager: protects against ghost disconnections when passing socket instance', () => {
    const oldSocket = createMockSocket() as any;
    const newSocket = createMockSocket() as any;

    const peerOld: ConnectedPeer = {
      peerId: 'peer_rapid',
      sessionId: 'sess_reconnect',
      displayName: 'Rapid Peer',
      role: 'student',
      socket: oldSocket,
      joinedAt: Date.now()
    };

    manager.addPeer('sess_reconnect', peerOld);

    // Client reconnects rapidly: new socket added under the same peerId
    const peerNew: ConnectedPeer = {
      peerId: 'peer_rapid',
      sessionId: 'sess_reconnect',
      displayName: 'Rapid Peer',
      role: 'student',
      socket: newSocket,
      joinedAt: Date.now()
    };
    manager.addPeer('sess_reconnect', peerNew);

    // Stale close event arrives from old socket
    const removedOld = manager.removePeer('sess_reconnect', 'peer_rapid', oldSocket);
    assert.strictEqual(removedOld, null, 'Old socket close must not evict the active peer');
    assert.strictEqual(manager.getRoomSize('sess_reconnect'), 1);
    assert.strictEqual(manager.getPeer('sess_reconnect', 'peer_rapid')?.socket, newSocket);

    // Active close event arrives from new socket
    const removedNew = manager.removePeer('sess_reconnect', 'peer_rapid', newSocket);
    assert.strictEqual(removedNew?.peerId, 'peer_rapid');
    assert.strictEqual(manager.getRoomSize('sess_reconnect'), 0);
  });
});
