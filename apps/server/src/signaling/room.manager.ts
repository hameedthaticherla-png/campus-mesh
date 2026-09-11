/**
 * Campus Mesh — In-Memory Room Manager (Class-Scoped Isolation Engine)
 */

import type { ConnectedPeer } from './peer.types.js';

export class RoomManager {
  // Map<sessionId, Map<peerId, ConnectedPeer>>
  private rooms = new Map<string, Map<string, ConnectedPeer>>();

  /**
   * Adds a peer to a specific session room.
   */
  public addPeer(sessionId: string, peer: ConnectedPeer): void {
    let room = this.rooms.get(sessionId);
    if (!room) {
      room = new Map<string, ConnectedPeer>();
      this.rooms.set(sessionId, room);
    }
    room.set(peer.peerId, peer);
  }

  /**
   * Removes a peer from a session room.
   * If an optional socket instance is passed, the peer is only removed
   * if its registered socket matches the closing socket, preventing race
   * conditions where a superseded socket closes after reconnection.
   */
  public removePeer(sessionId: string, peerId: string, socket?: unknown): ConnectedPeer | null {
    const room = this.rooms.get(sessionId);
    if (!room) return null;

    const peer = room.get(peerId) || null;
    if (!peer) return null;

    if (socket && peer.socket !== socket) {
      return null;
    }

    room.delete(peerId);

    if (room.size === 0) {
      this.rooms.delete(sessionId);
    }

    return peer;
  }

  /**
   * Retrieves a specific peer within a session room.
   */
  public getPeer(sessionId: string, peerId: string): ConnectedPeer | null {
    const room = this.rooms.get(sessionId);
    if (!room) return null;
    return room.get(peerId) || null;
  }

  /**
   * Returns all connected peers in a session room.
   */
  public getRoomPeers(sessionId: string): ConnectedPeer[] {
    const room = this.rooms.get(sessionId);
    if (!room) return [];
    return Array.from(room.values());
  }

  /**
   * Returns the count of connected peers in a session room.
   */
  public getRoomSize(sessionId: string): number {
    const room = this.rooms.get(sessionId);
    return room ? room.size : 0;
  }

  /**
   * Deletes an entire room and returns all evicted peers.
   */
  public deleteRoom(sessionId: string): ConnectedPeer[] {
    const room = this.rooms.get(sessionId);
    if (!room) return [];

    const peers = Array.from(room.values());
    this.rooms.delete(sessionId);
    return peers;
  }

  /**
   * Broadcasts a JSON message strictly to peers in the same session.
   */
  public broadcastToRoom(sessionId: string, message: unknown, excludePeerId?: string): void {
    const peers = this.getRoomPeers(sessionId);
    const serialized = JSON.stringify(message);

    for (const peer of peers) {
      if (excludePeerId && peer.peerId === excludePeerId) {
        continue;
      }
      try {
        if (peer.socket.readyState === 1 /* OPEN */) {
          peer.socket.send(serialized);
        }
      } catch (err) {
        // Socket errors handled by socket onclose/onerror
      }
    }
  }

  /**
   * Clears all rooms (used for test resets).
   */
  public reset(): void {
    this.rooms.clear();
  }
}

export const roomManager = new RoomManager();
