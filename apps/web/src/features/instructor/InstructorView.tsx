/**
 * Campus Mesh — Instructor View (Session Creation & Swarm Control)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Copy,
  Power,
  AlertCircle,
  Loader2,
  Link,
  KeyRound
} from 'lucide-react';
import { useSignaling } from '../../hooks/useSignaling.js';
import { ResourceUploader } from './ResourceUploader.js';
import { InstructorDashboard } from './InstructorDashboard.js';
import { useToast } from '../../context/ToastContext.js';
import {
  SignalingEventType,
  type CreateSessionResponse,
  type SwarmMetrics
} from '@campus-mesh/shared';
import { API_BASE_URL } from '../../config/api.config.js';

export function InstructorView() {
  const { showToast } = useToast();
  const [className, setClassName] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Session State
  const [sessionData, setSessionData] = useState<CreateSessionResponse | null>(null);
  const [swarmMetrics, setSwarmMetrics] = useState<SwarmMetrics | null>(null);
  const [isFetchingTelemetry, setIsFetchingTelemetry] = useState(false);

  // Periodic and on-demand telemetry fetcher
  const fetchTelemetry = useCallback(async () => {
    if (!sessionData) return;
    try {
      setIsFetchingTelemetry(true);
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionData.session.id}/telemetry`, {
        headers: {
          Authorization: `Bearer ${sessionData.instructorToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSwarmMetrics(data.metrics || data);
      }
    } catch {
      // Ignore background network hiccups
    } finally {
      setIsFetchingTelemetry(false);
    }
  }, [sessionData]);

  // Polling fallback every 3s
  useEffect(() => {
    if (!sessionData) {
      setSwarmMetrics(null);
      return;
    }
    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(timer);
  }, [sessionData, fetchTelemetry]);

  // Signaling Hook
  const handleSignalingMessage = useCallback((envelope: any) => {
    if (envelope.type === SignalingEventType.SWARM_METRICS_UPDATE && envelope.payload) {
      setSwarmMetrics(envelope.payload);
    }
  }, []);

  const handleSessionEnded = useCallback(() => {
    showToast('Session ended by server.', 'info');
    setSessionData(null);
  }, [showToast]);

  const { status, peers, lastError } = useSignaling({
    token: sessionData?.instructorToken || null,
    onSignalingMessage: handleSignalingMessage,
    onSessionEnded: handleSessionEnded
  });

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, instructorName, passcode })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create session.');
      }

      setSessionData(data);
      showToast(`Class "${className}" created successfully!`, 'success');
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to create class session.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!sessionData) return;
    const confirmEnd = window.confirm(
      'Are you sure you want to end this class session? All connected students will be disconnected.'
    );
    if (!confirmEnd) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionData.session.id}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.instructorToken}`
        }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to end session.');
      }

      showToast('Class session closed.', 'info');
      setSessionData(null);
    } catch (err: unknown) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleResetDemoTelemetry = async () => {
    if (!sessionData) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionData.session.id}/telemetry/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.instructorToken}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setSwarmMetrics(data.metrics);
        showToast('Demo swarm telemetry reset to 0 for fresh demonstration.', 'success');
      } else {
        const errData = await res.json();
        showToast(errData.message || 'Failed to reset telemetry.', 'error');
      }
    } catch {
      showToast('Network error resetting telemetry.', 'error');
    }
  };

  const copySessionCode = () => {
    if (!sessionData) return;
    navigator.clipboard.writeText(sessionData.session.sessionCode);
    showToast(`Code "${sessionData.session.sessionCode}" copied to clipboard!`, 'success');
  };

  const copyJoinLink = () => {
    if (!sessionData) return;
    const link = `${window.location.origin}/?code=${sessionData.session.sessionCode}`;
    navigator.clipboard.writeText(link);
    showToast('Direct student join link copied to clipboard!', 'success');
  };

  const copyPasscode = () => {
    if (!passcode) return;
    navigator.clipboard.writeText(passcode);
    showToast('Session passcode copied to clipboard!', 'info');
  };

  // If no active session, display creation form
  if (!sessionData) {
    return (
      <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-left">
        <h2 className="text-xl font-bold text-white mb-2">Create Class Session</h2>
        <p className="text-slate-400 text-xs mb-6 leading-relaxed">
          Launch an authoritative classroom session to coordinate local peer-to-peer distribution.
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleCreateSession} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Class Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Distributed Systems Lab"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Instructor Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Prof. David Patterson"
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Session Passcode
            </label>
            <input
              type="password"
              required
              placeholder="Minimum 4 characters (e.g. paxos123)"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
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
                <span>Creating Session...</span>
              </>
            ) : (
              <span>Create Classroom Session</span>
            )}
          </button>
        </form>
      </div>
    );
  }

  // Active Session Dashboard
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 text-left">
      {/* Session Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active Session ({status})
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white">{sessionData.session.className}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Instructor: {sessionData.session.instructorName}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleEndSession}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Power className="w-3.5 h-3.5" />
              <span>End Class</span>
            </button>
          </div>
        </div>

        {/* Big Session Code Box with Action Buttons */}
        <div className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
              Class Session Code & Passcode
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl sm:text-3xl font-mono font-black tracking-wider text-indigo-400">
                {sessionData.session.sessionCode}
              </span>
              {passcode && (
                <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-mono text-xs border border-slate-800">
                  Passcode: <span className="text-emerald-400">{passcode}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyJoinLink}
              className="px-3 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold transition-all flex items-center gap-1.5 border border-indigo-500/40"
              title="Copy direct join URL for students"
            >
              <Link className="w-3.5 h-3.5" />
              <span>Copy Join Link</span>
            </button>

            <button
              onClick={copySessionCode}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5 border border-slate-700"
              title="Copy 8-character session code"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Code</span>
            </button>

            {passcode && (
              <button
                onClick={copyPasscode}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 border border-slate-700"
                title="Copy passcode"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Passcode</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Swarm Telemetry & Analytics Dashboard */}
      <InstructorDashboard
        metrics={swarmMetrics}
        peers={peers}
        isLoading={isFetchingTelemetry}
        onRefresh={fetchTelemetry}
        onResetDemo={handleResetDemoTelemetry}
      />

      {/* Connected Peers Roster */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Connected Students</h3>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-medium">
            {peers.length} Online
          </span>
        </div>

        {lastError && (
          <div className="p-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
            {lastError}
          </div>
        )}

        {peers.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-950/50 border border-dashed border-slate-800">
            <p className="text-xs text-slate-500">
              Waiting for students to join using code <strong className="text-slate-300">{sessionData.session.sessionCode}</strong> or direct join link...
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 max-h-64 overflow-y-auto">
            {peers.map((peer) => (
              <div key={peer.peerId} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="font-medium text-slate-200">{peer.displayName}</span>
                  <span className="font-mono text-slate-500 text-[11px]">({peer.peerId})</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {new Date(peer.joinedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resource Upload & Origin Distribution */}
      <ResourceUploader
        sessionId={sessionData.session.id}
        instructorToken={sessionData.instructorToken}
      />
    </div>
  );
}
