/**
 * Campus Mesh — End-to-End WebSocket Signaling & Room Integration Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import { buildApp } from '../src/index.js';
import { initDatabase, resetDatabase } from '../src/database/db.client.js';
import { SignalingEventType } from '@campus-mesh/shared';

describe('Signaling Server & Real-Time Roster Integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverPort: number;

  before(async () => {
    initDatabase();
    resetDatabase();

    app = await buildApp();
    // Listen on dynamic port
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = new URL(address);
    serverPort = Number(url.port);
  });

  after(async () => {
    await app.close();
  });

  test('End-to-End: session creation, student joins, WebSocket signaling handshake, and peer broadcasts', async () => {
    // 1. Instructor creates session
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        className: 'Network Systems Lab',
        instructorName: 'Prof. Cerf',
        passcode: 'tcpip101'
      }
    });

    assert.strictEqual(createRes.statusCode, 201);
    const sessionBody = JSON.parse(createRes.payload);
    const sessionCode = sessionBody.session.sessionCode;
    const sessionId = sessionBody.session.id;

    // 2. Student Alice joins session
    const joinAliceRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode,
        passcode: 'tcpip101',
        displayName: 'Alice (MacBook)'
      }
    });
    assert.strictEqual(joinAliceRes.statusCode, 200);
    const aliceData = JSON.parse(joinAliceRes.payload);

    // 3. Connect Alice via WebSocket
    const aliceWs = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/signaling?token=${aliceData.peerToken}`);

    const aliceMessages: any[] = [];
    aliceWs.on('message', (data) => {
      aliceMessages.push(JSON.parse(data.toString()));
    });

    await new Promise<void>((resolve, reject) => {
      aliceWs.on('open', () => resolve());
      aliceWs.on('error', reject);
    });

    // Alice should receive room-roster with 0 peers
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(aliceMessages.length >= 1);
    assert.strictEqual(aliceMessages[0].type, SignalingEventType.ROOM_ROSTER);
    assert.strictEqual(aliceMessages[0].payload.peers.length, 0);

    // 4. Student Bob joins session
    const joinBobRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        sessionCode,
        passcode: 'tcpip101',
        displayName: 'Bob (Ubuntu)'
      }
    });
    assert.strictEqual(joinBobRes.statusCode, 200);
    const bobData = JSON.parse(joinBobRes.payload);

    // 5. Connect Bob via WebSocket
    const bobWs = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/signaling?token=${bobData.peerToken}`);

    const bobMessages: any[] = [];
    bobWs.on('message', (data) => {
      bobMessages.push(JSON.parse(data.toString()));
    });

    await new Promise<void>((resolve, reject) => {
      bobWs.on('open', () => resolve());
      bobWs.on('error', reject);
    });

    await new Promise((r) => setTimeout(r, 150));

    // 6. Verify Bob received room-roster containing Alice
    const bobRosterMsg = bobMessages.find((m) => m.type === SignalingEventType.ROOM_ROSTER);
    assert.ok(bobRosterMsg, 'Bob must receive room-roster');
    assert.ok(bobRosterMsg.payload.peers.some((p: any) => p.peerId === aliceData.peerId));

    // 7. Verify Alice received peer-joined broadcast for Bob
    const aliceJoinedMsg = aliceMessages.find(
      (m) => m.type === SignalingEventType.PEER_JOINED && m.payload.peerId === bobData.peerId
    );
    assert.ok(aliceJoinedMsg, 'Alice must receive peer-joined for Bob');
    assert.strictEqual(aliceJoinedMsg.payload.displayName, 'Bob (Ubuntu)');

    // 8. Bob disconnects
    bobWs.close();
    await new Promise((r) => setTimeout(r, 150));

    // 9. Verify Alice received peer-left for Bob
    const aliceLeftMsg = aliceMessages.find(
      (m) => m.type === SignalingEventType.PEER_LEFT && m.payload.peerId === bobData.peerId
    );
    assert.ok(aliceLeftMsg, 'Alice must receive peer-left when Bob closes socket');

    // Clean up Alice
    aliceWs.close();
  });
});
