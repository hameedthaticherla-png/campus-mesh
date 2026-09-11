/**
 * Campus Mesh — Reactive Signaling WebSocket Hook
 *
 * Provides a stable, flicker-free WebSocket connection to the signaling server.
 * Uses callback refs to prevent unnecessary re-connections on parent re-renders.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SignalingEventType,
  type PeerInfo,
  type RoomRosterPayload,
  type PeerJoinedPayload,
  type PeerLeftPayload,
  type SessionEndedPayload
} from '@campus-mesh/shared';

import { getSignalingWsUrl } from '../config/api.config.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface UseSignalingOptions {
  token: string | null;
  wsUrl?: string;
  onSessionEnded?: (reason: string) => void;
  onSignalingMessage?: (envelope: any) => void;
}

export function useSignaling({
  token,
  wsUrl,
  onSessionEnded,
  onSignalingMessage
}: UseSignalingOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Store latest callbacks in refs to prevent useEffect re-runs when callers pass inline functions
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  const onSignalingMessageRef = useRef(onSignalingMessage);
  onSignalingMessageRef.current = onSignalingMessage;

  const getWsUrl = useCallback(() => {
    if (wsUrl) return wsUrl;
    return getSignalingWsUrl();
  }, [wsUrl]);

  useEffect(() => {
    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let intentionalClose = false;
    let retryAttempt = 0;

    const connect = () => {
      if (!isMounted || !token) return;

      const baseUrl = getWsUrl();
      const fullUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;

      setStatus((prev) => (prev === 'connected' ? 'connected' : retryAttempt > 0 ? 'reconnecting' : 'connecting'));
      setLastError(null);

      const socket = new WebSocket(fullUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!isMounted || socketRef.current !== socket) return;
        retryAttempt = 0;
        setStatus('connected');
        setLastError(null);
      };

      socket.onmessage = (event) => {
        if (!isMounted || socketRef.current !== socket) return;
        try {
          const message = JSON.parse(event.data);
          if (onSignalingMessageRef.current) {
            onSignalingMessageRef.current(message);
          }
          switch (message.type) {
            case SignalingEventType.ROOM_ROSTER: {
              const payload = message.payload as RoomRosterPayload;
              setPeers(payload.peers || []);
              break;
            }
            case SignalingEventType.PEER_JOINED: {
              const payload = message.payload as PeerJoinedPayload;
              setPeers((prev) => {
                if (prev.some((p) => p.peerId === payload.peerId)) return prev;
                return [...prev, payload];
              });
              break;
            }
            case SignalingEventType.PEER_LEFT: {
              const payload = message.payload as PeerLeftPayload;
              setPeers((prev) => prev.filter((p) => p.peerId !== payload.peerId));
              break;
            }
            case SignalingEventType.SESSION_ENDED: {
              const payload = message.payload as SessionEndedPayload;
              intentionalClose = true;
              setStatus('disconnected');
              setPeers([]);
              if (onSessionEndedRef.current) {
                onSessionEndedRef.current(payload.reason || 'Session was ended by the instructor.');
              }
              break;
            }
            default:
              break;
          }
        } catch (err) {
          console.error('[Campus Mesh WS] Failed to parse message frame:', err);
        }
      };

      socket.onerror = () => {
        if (!isMounted || socketRef.current !== socket) return;
        setStatus('error');
        setLastError('WebSocket connection error occurred.');
      };

      socket.onclose = (event) => {
        if (!isMounted || socketRef.current !== socket) return;

        if (intentionalClose || event.code === 1000) {
          setStatus('disconnected');
          if (event.code !== 1000 && event.reason) {
            setLastError(event.reason);
          }
          return;
        }

        // Fatal auth errors (4xxx) -> do not retry endlessly
        if (event.code >= 4000) {
          setStatus('error');
          setLastError(event.reason || `Connection rejected (${event.code}).`);
          return;
        }

        // Unexpected disconnect -> trigger reconnect with exponential backoff
        setStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(1.5, retryAttempt), 8000);
        retryAttempt++;
        reconnectTimer = setTimeout(() => {
          if (isMounted && token) {
            connect();
          }
        }, delay);
      };
    };

    if (!token) {
      setStatus('disconnected');
      setPeers([]);
      if (socketRef.current) {
        intentionalClose = true;
        socketRef.current.close(1000, 'Token cleared');
        socketRef.current = null;
      }
      return;
    }

    connect();

    return () => {
      isMounted = false;
      intentionalClose = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, 'Hook unmounted');
        socketRef.current = null;
      }
    };
  }, [token, getWsUrl]);

  const sendSignalingMessage = useCallback(
    (type: SignalingEventType, targetPeerId: string, payload: unknown) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type,
            targetPeerId,
            payload
          })
        );
      }
    },
    []
  );

  return {
    status,
    peers,
    lastError,
    socket: socketRef.current,
    sendSignalingMessage
  };
}
