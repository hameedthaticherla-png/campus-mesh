/**
 * Campus Mesh — In-Memory Peer Types
 */

import type { WebSocket } from 'ws';
import type { UserRole } from '@campus-mesh/shared';

export interface ConnectedPeer {
  peerId: string;
  sessionId: string;
  displayName: string;
  role: UserRole;
  socket: WebSocket;
  joinedAt: number;
}
