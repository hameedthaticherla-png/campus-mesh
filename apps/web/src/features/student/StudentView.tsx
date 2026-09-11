/**
 * Campus Mesh — Student View (Session Joining, Live P2P Swarm & Resource Mesh)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users,
  AlertCircle,
  Loader2,
  LogOut,
  Wifi,
  HardDrive,
  Activity,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  TrendingDown,
  Download
} from 'lucide-react';
import { useSignaling } from '../../hooks/useSignaling.js';
import { ResourceList } from './ResourceList.js';
import { SwarmStatusBadge, type SwarmStatus } from './SwarmStatusBadge.js';
import { useToast } from '../../context/ToastContext.js';
import {
  SignalingEventType,
  type JoinSessionResponse,
  type RoomRosterPayload,
  type PeerJoinedPayload,
  type PeerLeftPayload
} from '@campus-mesh/shared';
import { API_BASE_URL } from '../../config/api.config.js';
import {
  PeerMeshCoordinator,
  type CoordinatorState
} from '../../p2p/index.js';
import { SwarmVisualizer } from './SwarmVisualizer.js';
import { EventFeed } from './EventFeed.js';

interface StudentViewProps {
  initialSessionCode?: string;
}

export function StudentView({ initialSessionCode = '' }: StudentViewProps) {
  const { showToast } = useToast();
  const [sessionCode, setSessionCode] = useState(initialSessionCode);
  const [passcode, setPasscode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initialSessionCode if query parameter changes or arrives
  useEffect(() => {
    if (initialSessionCode) {
      setSessionCode(initialSessionCode.toUpperCase().trim());
    }
  }, [initialSessionCode]);

  // Active Session State
  const [sessionData, setSessionData] = useState<JoinSessionResponse | null>(null);

  // P2P Coordinator & State
  const coordinatorRef = useRef<PeerMeshCoordinator | null>(null);
  const [coordinatorState, setCoordinatorState] = useState<CoordinatorState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Handle incoming signaling messages and route to coordinator
  const handleSignalingMessage = useCallback((envelope: any) => {
    if (!coordinatorRef.current) return;

    switch (envelope.type) {
      case SignalingEventType.ROOM_ROSTER: {
        const payload = envelope.payload as RoomRosterPayload;
        for (const p of payload?.peers || []) {
          coordinatorRef.current.handlePeerDiscovered(p.peerId);
        }
        break;
      }
      case SignalingEventType.PEER_JOINED: {
        const payload = envelope.payload as PeerJoinedPayload;
        const pId = payload?.peerId || envelope.senderPeerId;
        if (pId) coordinatorRef.current.handlePeerDiscovered(pId);
        break;
      }
      case SignalingEventType.PEER_LEFT: {
        const payload = envelope.payload as PeerLeftPayload;
        const pId = payload?.peerId || envelope.senderPeerId;
        if (pId) coordinatorRef.current.handlePeerLeft(pId);
        break;
      }
      case SignalingEventType.SIGNAL_OFFER: {
        const sdp = envelope.offer || envelope.payload?.sdp;
        if (sdp && envelope.senderPeerId) {
          coordinatorRef.current.handleSignalOffer(envelope.senderPeerId, sdp);
        }
        break;
      }
      case SignalingEventType.SIGNAL_ANSWER: {
        const sdp = envelope.answer || envelope.payload?.sdp;
        if (sdp && envelope.senderPeerId) {
          coordinatorRef.current.handleSignalAnswer(envelope.senderPeerId, sdp);
        }
        break;
      }
      case SignalingEventType.SIGNAL_ICE: {
        const cand = envelope.candidate || envelope.payload?.candidate;
        if (cand && envelope.senderPeerId) {
          coordinatorRef.current.handleSignalIce(envelope.senderPeerId, cand);
        }
        break;
      }
      case SignalingEventType.SESSION_ENDED: {
        coordinatorRef.current.handleSessionEnded();
        break;
      }
      default:
        break;
    }
  }, []);

  const handleSessionEnded = useCallback((reason: string) => {
    showToast(`Class session ended by instructor: ${reason}`, 'info');
    if (coordinatorRef.current) {
      coordinatorRef.current.stop();
      coordinatorRef.current = null;
    }
    setSessionData(null);
  }, [showToast]);

  // Signaling Hook
  const { status, peers, lastError, sendSignalingMessage } = useSignaling({
    token: sessionData?.peerToken || null,
    onSignalingMessage: handleSignalingMessage,
    onSessionEnded: handleSessionEnded
  });

  // Initialize P2P Coordinator when sessionData is set
  useEffect(() => {
    if (!sessionData) {
      if (coordinatorRef.current) {
        coordinatorRef.current.stop();
        coordinatorRef.current = null;
      }
      setCoordinatorState(null);
      return;
    }

    const coord = new PeerMeshCoordinator({
      localPeerId: sessionData.peerId,
      sessionId: sessionData.session.id,
      displayName: displayName.trim() || `Student-${sessionData.peerId.slice(0, 4)}`,
      iceServers: sessionData.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
      sendSignaling: (type, targetPeerId, payload) => {
        sendSignalingMessage(type, targetPeerId, payload);
      }
    });

    const unsubscribe = coord.subscribe((s) => {
      setCoordinatorState({ ...s });
    });

    coordinatorRef.current = coord;

    return () => {
      unsubscribe();
      coord.stop();
      coordinatorRef.current = null;
    };
  }, [sessionData, sendSignalingMessage]);

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: sessionCode.trim().toUpperCase(),
          passcode: passcode.trim(),
          displayName: displayName.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to join class session.');
      }

      setSessionData(data);
      showToast(`Joined session ${data.session.sessionCode} as ${data.displayName}!`, 'success');
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to join class session.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveSession = () => {
    const confirmLeave = window.confirm('Leave this class session?');
    if (!confirmLeave) return;

    if (coordinatorRef.current) {
      coordinatorRef.current.stop();
      coordinatorRef.current = null;
    }
    setSessionData(null);
    setCoordinatorState(null);
    showToast('Left class session.', 'info');
  };

  const handleStartDownload = async (resourceId: string) => {
    if (!sessionData || !coordinatorRef.current) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/resources/${resourceId}/manifest`, {
        headers: { Authorization: `Bearer ${sessionData.peerToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch resource manifest.');
      const manifest = await res.json();
      await coordinatorRef.current.startDownload(manifest, sessionData.peerToken, API_BASE_URL);
    } catch (err: unknown) {
      showToast(`Swarm download error: ${(err as Error).message}`, 'error');
    }
  };

  const [isAssembling, setIsAssembling] = useState(false);

  const handleSaveAssembledFile = async () => {
    if (!coordinatorRef.current || !download?.resourceId) return;
    try {
      setIsAssembling(true);
      const result = await coordinatorRef.current.assembleFile(download.resourceId);
      if (!result) {
        showToast('Unable to assemble file from local chunk store.', 'error');
        return;
      }
      if (!result.verified) {
        showToast('Integrity check failed: Whole-file SHA-256 hash mismatch!', 'error');
        return;
      }

      // Trigger browser download of verified assembled blob
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`File "${result.fileName}" saved to disk! SHA-256 verified.`, 'success');
    } catch (err: unknown) {
      showToast(`Failed to save file: ${(err as Error).message}`, 'error');
    } finally {
      setIsAssembling(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // If not joined, show Join Form
  if (!sessionData) {
    return (
      <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-left">
        <h2 className="text-xl font-bold text-white mb-2">Join Class Session</h2>
        <p className="text-slate-400 text-xs mb-6 leading-relaxed">
          Enter the session code and passcode provided by your instructor to join the local peer swarm.
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoinSession} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Session Code
            </label>
            <input
              type="text"
              required
              placeholder="e.g. MESH-7K4P"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-mono text-sm uppercase tracking-wider focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Class Passcode
            </label>
            <input
              type="password"
              required
              placeholder="Enter passcode (e.g. paxos123)"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Your Display Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Alice (ThinkPad)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 active:scale-95"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validating Passcode...</span>
              </>
            ) : (
              <span>Join Class Session</span>
            )}
          </button>
        </form>
      </div>
    );
  }

  const download = coordinatorState?.download;
  const totalDownloaded = (download?.bytesFromP2P || 0) + (download?.bytesFromOrigin || 0);
  const p2pRatio = totalDownloaded > 0 ? (download?.bytesFromP2P || 0) / totalDownloaded : 0;
  const originRatio = totalDownloaded > 0 ? (download?.bytesFromOrigin || 0) / totalDownloaded : 0;
  const bandwidthSaved = download?.bytesFromP2P || 0;

  // Determine Swarm Status Badge state
  let currentSwarmStatus: SwarmStatus = 'waiting';
  if (download?.status === 'completed') {
    currentSwarmStatus = 'completed';
  } else if (download?.status === 'downloading') {
    if (download.bytesFromP2P > 0) {
      currentSwarmStatus = 'swarm';
    } else if (download.bytesFromOrigin > 0 && (coordinatorState?.connectedPeersCount || 0) === 0) {
      currentSwarmStatus = 'fallback';
    } else if ((coordinatorState?.connectedPeersCount || 0) > 0) {
      currentSwarmStatus = 'swarm';
    } else {
      currentSwarmStatus = 'waiting';
    }
  } else {
    currentSwarmStatus = 'waiting';
  }

  // Active Student View
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 text-left">
      {/* Session Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  status === 'connected'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                {status === 'connected' ? 'Signaling Connected' : `Signaling: ${status}`}
              </span>

              <SwarmStatusBadge status={currentSwarmStatus} />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white">{sessionData.session.className}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Instructor: {sessionData.session.instructorName}</p>
          </div>

          <button
            onClick={handleLeaveSession}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave Class</span>
          </button>
        </div>

        {/* Ephemeral Peer ID & WebRTC Status */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Your Ephemeral Peer ID:</span>
            <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              {sessionData.peerId}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
            <span>{coordinatorState?.connectedPeersCount || 0} DataChannels Open</span>
          </div>
        </div>
      </div>

      {/* Live P2P Swarm Transfer Status Card */}
      {download && download.resourceId && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <SwarmStatusBadge status={currentSwarmStatus} />
                <span className="text-xs text-slate-400 font-mono">
                  {coordinatorState?.connectedPeersCount || 0} WebRTC Peers Connected
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mt-2">{download.fileName}</h3>
            </div>

            <div className="text-right">
              <span className="text-2xl sm:text-3xl font-black text-indigo-400 font-mono">
                {download.progressPercent}%
              </span>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {download.completedChunks} / {download.totalChunks} chunks (256 KB)
              </div>
              {coordinatorState?.telemetry && coordinatorState.telemetry.transfer.currentTransferRateBps > 0 && (
                <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                  {formatBytes(coordinatorState.telemetry.transfer.currentTransferRateBps)}/s
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                download.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${download.progressPercent}%` }}
            />
          </div>

          {/* Download Complete Trust Banner with Local Disk Export */}
          {download.status === 'completed' && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-emerald-300 text-sm block">
                    Download Complete & 100% SHA-256 Verified
                  </span>
                  <p className="text-slate-300">
                    Every 256 KB chunk was verified against the instructor manifest with SHA-256 and stored in your browser's IndexedDB.
                    You saved <strong className="text-emerald-400">{formatBytes(bandwidthSaved)}</strong> of campus server bandwidth!
                  </p>
                </div>
              </div>

              <button
                onClick={handleSaveAssembledFile}
                disabled={isAssembling}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/30 flex items-center gap-2 shrink-0 active:scale-95"
              >
                {isAssembling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Assembling File...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Save File to Disk</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Live Telemetry: P2P vs Origin Distribution */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-indigo-400" />
                P2P Swarm Download:
              </span>
              <span className="font-mono text-indigo-300 font-medium">
                {formatBytes(download.bytesFromP2P)} ({download.chunksFromP2P} chunks)
              </span>
            </div>

            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round(p2pRatio * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                Origin Server Fallback:
              </span>
              <span className="font-mono text-amber-300 font-medium">
                {formatBytes(download.bytesFromOrigin)} ({download.chunksFromOrigin} chunks)
              </span>
            </div>

            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round(originRatio * 100)}%` }}
              />
            </div>

            {/* Bandwidth Savings & Latency Metrics */}
            <div className="pt-2 border-t border-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-400">Origin Bandwidth Saved: </span>
                <span className="font-bold text-emerald-400 font-mono">
                  {formatBytes(bandwidthSaved)} ({Math.round(p2pRatio * 100)}%)
                </span>
              </div>
              {coordinatorState?.telemetry && (
                <div className="text-[11px] text-slate-400 font-mono">
                  Latency: P2P {coordinatorState.telemetry.timing.averageP2PLatencyMs > 0 ? `~${coordinatorState.telemetry.timing.averageP2PLatencyMs}ms` : '—'} | Origin {coordinatorState.telemetry.timing.averageOriginLatencyMs > 0 ? `~${coordinatorState.telemetry.timing.averageOriginLatencyMs}ms` : '—'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Swarm Visualizer & Live Event Feed Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SwarmVisualizer
          localPeerId={sessionData.peerId}
          peers={coordinatorState?.activePeers || []}
          health={coordinatorState?.telemetry?.health || 'excellent'}
          isDownloading={download?.status === 'downloading'}
          chunksFromP2P={download?.chunksFromP2P || 0}
          chunksFromOrigin={download?.chunksFromOrigin || 0}
        />
        <EventFeed events={coordinatorState?.telemetry?.events || []} />
      </div>

      {/* Classroom Swarm Peers List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Class Peers Online</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-medium">
              {peers.length} Peers Discovered
            </span>
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors flex items-center gap-1"
              title="Toggle WebRTC Diagnostics"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              {showDiagnostics ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {lastError && (
          <div className="p-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
            {lastError}
          </div>
        )}

        {/* Expandable WebRTC Diagnostics Drawer */}
        {showDiagnostics && coordinatorState && (
          <div className="mb-4 p-3.5 rounded-xl bg-slate-950 border border-indigo-500/20 text-xs space-y-2">
            <div className="font-semibold text-indigo-300 text-[11px] uppercase tracking-wider">
              WebRTC DataChannel Diagnostics
            </div>
            {coordinatorState.activePeers.length === 0 ? (
              <p className="text-slate-500 text-[11px]">No active WebRTC peer connections yet.</p>
            ) : (
              <div className="space-y-1.5 font-mono text-[11px]">
                {coordinatorState.activePeers.map((p) => (
                  <div
                    key={p.peerId}
                    className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800"
                  >
                    <span className="text-slate-300">{p.peerId}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        p.dataChannelOpen
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      DC: {p.dataChannelOpen ? 'OPEN' : p.connectionState}
                    </span>
                    <span className="text-slate-400">{p.chunksPossessed} chunks owned</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {peers.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-950/50 border border-dashed border-slate-800">
            <p className="text-xs text-slate-500">
              You are currently the first student peer connected in this room.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 max-h-64 overflow-y-auto">
            {peers.map((peer) => (
              <div key={peer.peerId} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      peer.role === 'instructor' ? 'bg-indigo-400' : 'bg-emerald-400'
                    }`}
                  />
                  <span className="font-medium text-slate-200">{peer.displayName}</span>
                  <span className="font-mono text-slate-500 text-[11px]">({peer.peerId})</span>
                </div>
                <span className="text-[11px] text-slate-500 capitalize">{peer.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Classroom Resources */}
      <ResourceList
        sessionId={sessionData.session.id}
        peerToken={sessionData.peerToken}
        onDownloadResource={handleStartDownload}
        downloadingResourceId={download?.resourceId}
      />
    </div>
  );
}
