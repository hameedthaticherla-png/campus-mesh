import React, { useState } from 'react';
import {
  TrendingDown,
  Wifi,
  Users,
  HardDrive,
  Monitor,
  Zap,
  ShieldCheck,
  RefreshCw,
  Layers,
  RotateCcw
} from 'lucide-react';
import type { SwarmMetrics, PeerInfo } from '@campus-mesh/shared';
import { formatBytes } from '../../p2p/telemetry/telemetry.calculations.js';

interface InstructorDashboardProps {
  metrics: SwarmMetrics | null;
  peers: PeerInfo[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onResetDemo?: () => void;
}

export const InstructorDashboard: React.FC<InstructorDashboardProps> = ({
  metrics,
  peers,
  isLoading = false,
  onRefresh,
  onResetDemo
}) => {
  const [demoMode, setDemoMode] = useState(false);

  // Safe fallback metrics if empty or initial
  const totalPeers = metrics?.totalPeers ?? peers.length;
  const activeChannels = metrics?.activeDataChannels ?? 0;
  const totalBytesP2P = metrics?.totalBytesP2P ?? 0;
  const totalBytesServer = metrics?.totalBytesServer ?? 0;
  const bandwidthSaved = metrics?.bandwidthSavedBytes ?? 0;
  const efficiency = metrics?.swarmEfficiencyPercent ?? 0;
  const totalDelivered = totalBytesP2P + totalBytesServer;

  // Before vs After comparison estimates
  // Baseline = Traditional model where server serves 100% of data to all N students
  const baselineBytes =
    metrics?.estimatedBaselineBytes && metrics.estimatedBaselineBytes > 0
      ? metrics.estimatedBaselineBytes
      : totalDelivered > 0
      ? totalDelivered
      : 0;

  return (
    <div
      className={`space-y-6 text-left transition-all ${
        demoMode
          ? 'p-6 bg-slate-950 rounded-2xl border-2 border-indigo-500 shadow-2xl ring-4 ring-indigo-500/20'
          : ''
      }`}
    >
      {/* Dashboard Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <h2 className={`font-black text-white tracking-tight ${demoMode ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
            Live Swarm Telemetry & Distribution Analytics
          </h2>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            MEASURED SWARM TELEMETRY
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {onResetDemo && (
            <button
              onClick={onResetDemo}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors border border-slate-700 flex items-center gap-1.5"
              title="Reset telemetry counters for a new demo run without dropping connections"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Reset Demo</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors border border-slate-700 disabled:opacity-50"
              title="Refresh Swarm Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Demo Mode Toggle Button */}
          <button
            onClick={() => setDemoMode(!demoMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all border ${
              demoMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-lg shadow-amber-500/10'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 text-amber-400" />
            <span>{demoMode ? 'Stage Mode ON' : 'Projector / Stage Mode'}</span>
          </button>
        </div>
      </div>

      {/* #1 HERO METRIC: SERVER BANDWIDTH SAVED */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-emerald-500/30 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <TrendingDown className="w-36 h-36 text-emerald-400" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs uppercase tracking-widest font-bold text-slate-400">
                Primary Impact Metric
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                {efficiency}% Campus Uplink Saved
              </span>
            </div>
            <h3 className="text-sm font-medium text-slate-300">
              Classroom Server Bandwidth Relieved
            </h3>
            <div className={`font-black text-emerald-400 font-mono tracking-tight mt-1 ${demoMode ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-5xl'}`}>
              {formatBytes(bandwidthSaved)}
            </div>
          </div>

          <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-6">
            <span className="text-xs text-slate-400 block font-medium">P2P Swarm Distribution</span>
            <div className="font-mono text-xl sm:text-2xl font-black text-indigo-400 mt-0.5">
              {efficiency}%
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              {formatBytes(totalBytesP2P)} P2P / {formatBytes(totalDelivered)} Total
            </span>
          </div>
        </div>

        {/* Efficiency Bar */}
        <div className="w-full bg-slate-950 rounded-full h-2.5 mt-4 overflow-hidden border border-slate-800">
          <div
            className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(2, efficiency))}%` }}
          />
        </div>
      </div>

      {/* 3 Secondary Headline Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: P2P Swarm Ratio */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">P2P Ratio</span>
            <Wifi className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className={`font-black text-indigo-400 font-mono tracking-tight ${demoMode ? 'text-3xl' : 'text-2xl'}`}>
              {efficiency}%
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Direct Browser-to-Browser Egress
            </span>
          </div>
        </div>

        {/* Card 2: Connected Students & DataChannels */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Mesh Swarm Peers</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className={`font-black text-white font-mono tracking-tight ${demoMode ? 'text-3xl' : 'text-2xl'}`}>
              {totalPeers} <span className="text-sm font-normal text-slate-400">{totalPeers === 1 ? 'Student' : 'Students'}</span>
            </div>
            <div className="text-[11px] text-cyan-400/90 mt-1 font-mono">
              {activeChannels} Active WebRTC Channels
            </div>
          </div>
        </div>

        {/* Card 3: Total Data Delivered */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Total Swarm Egress</span>
            <HardDrive className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className={`font-black text-slate-100 font-mono tracking-tight ${demoMode ? 'text-3xl' : 'text-2xl'}`}>
              {formatBytes(totalDelivered)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Origin: {formatBytes(totalBytesServer)} | P2P: {formatBytes(totalBytesP2P)}
            </div>
          </div>
        </div>
      </div>

      {/* Before vs After Architecture Comparison */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Network Architecture Comparison: Centralized vs Campus Mesh
            </h3>
          </div>
          <span className="text-xs text-slate-400">Measured Classroom Uplink Relief</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Traditional Model */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-rose-400">Traditional Centralized Model</span>
              <span className="font-mono text-slate-400 font-semibold">{formatBytes(baselineBytes)} Server Egress</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
              <div className="bg-rose-500 h-full rounded-full w-full opacity-80" />
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Server delivers complete file independently to all {totalPeers > 0 ? totalPeers : 'N'} students over campus uplink, saturating access points.
            </p>
          </div>

          {/* Campus Mesh Model */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-indigo-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-400">Campus Mesh P2P Swarm</span>
              <span className="font-mono text-emerald-300 font-semibold">
                {formatBytes(totalBytesServer)} Origin ({efficiency}% Saved)
              </span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800 flex">
              <div
                className="bg-amber-500 h-full transition-all duration-500"
                style={{ width: `${Math.max(2, 100 - efficiency)}%` }}
                title={`Origin Fallback: ${100 - efficiency}%`}
              />
              <div
                className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full transition-all duration-500"
                style={{ width: `${efficiency}%` }}
                title={`P2P Swarm: ${efficiency}%`}
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Server seeds chunks once; students propagate verified 256 KB chunks browser-to-browser via direct WebRTC mesh.
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Student Swarm Peer Telemetry Roster */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Live Student Swarm Telemetry ({metrics?.peerReports?.length || peers.length} Peers)
            </h3>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>SHA-256 Verified Telemetry</span>
          </div>
        </div>

        {(!metrics?.peerReports || metrics.peerReports.length === 0) && peers.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
            <p className="text-xs text-slate-500">
              No student peers currently connected to this session. Share the session code or join link to seed the mesh.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <th className="py-2.5 px-3">Student Peer</th>
                  <th className="py-2.5 px-3">P2P In</th>
                  <th className="py-2.5 px-3">Origin In</th>
                  <th className="py-2.5 px-3">P2P Seeded</th>
                  <th className="py-2.5 px-3">Progress</th>
                  <th className="py-2.5 px-3">Rate</th>
                  <th className="py-2.5 px-3">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(metrics?.peerReports && metrics.peerReports.length > 0
                  ? metrics.peerReports
                  : peers.map((p) => ({
                      peerId: p.peerId,
                      displayName: p.displayName,
                      downloadedBytesP2P: 0,
                      downloadedBytesServer: 0,
                      uploadedBytesP2P: 0,
                      connectedPeersCount: 0,
                      progressPercent: 0,
                      transferRateBps: 0,
                      averageLatencyMs: 0
                    }))
                ).map((rep) => (
                  <tr key={rep.peerId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="font-semibold text-slate-200">{rep.displayName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({rep.peerId.slice(0, 6)})</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-indigo-300">
                      {formatBytes(rep.downloadedBytesP2P)}
                    </td>
                    <td className="py-2.5 px-3 text-amber-300">
                      {formatBytes(rep.downloadedBytesServer)}
                    </td>
                    <td className="py-2.5 px-3 text-emerald-300 font-semibold">
                      {formatBytes(rep.uploadedBytesP2P || 0)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-16 bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                          <div
                            className="bg-indigo-500 h-full rounded-full"
                            style={{ width: `${rep.progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-300">{rep.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {rep.transferRateBps && rep.transferRateBps > 0 ? `${formatBytes(rep.transferRateBps)}/s` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {rep.averageLatencyMs && rep.averageLatencyMs > 0 ? `${rep.averageLatencyMs}ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
