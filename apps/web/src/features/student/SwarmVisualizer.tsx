import React from 'react';
import type { PeerDiagnosticsInfo } from '../../p2p/PeerMeshCoordinator.js';
import type { NetworkHealthStatus } from '../../p2p/telemetry/telemetry.types.js';

interface SwarmVisualizerProps {
  localPeerId: string;
  peers: PeerDiagnosticsInfo[];
  health: NetworkHealthStatus;
  isDownloading: boolean;
  chunksFromP2P: number;
  chunksFromOrigin: number;
}

export const SwarmVisualizer: React.FC<SwarmVisualizerProps> = ({
  localPeerId,
  peers,
  health,
  isDownloading,
  chunksFromP2P,
  chunksFromOrigin
}) => {
  const connectedPeers = peers.filter((p) => p.dataChannelOpen);
  const totalPeers = peers.length;

  // Visual layout constants for SVG
  const width = 500;
  const height = 320;
  const centerX = width / 2;
  const centerY = height / 2 + 20;
  const radius = 110;

  const getHealthBadge = (h: NetworkHealthStatus) => {
    switch (h) {
      case 'excellent':
        return {
          label: 'Optimal Mesh',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        };
      case 'degraded':
        return {
          label: 'Degraded Mesh',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        };
      case 'fallback':
        return {
          label: 'Origin Fallback',
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
        };
      default:
        return {
          label: 'Standby',
          color: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
        };
    }
  };

  const healthBadge = getHealthBadge(health);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connectedPeers.length > 0 ? 'bg-indigo-400' : 'bg-slate-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                connectedPeers.length > 0 ? 'bg-indigo-500' : 'bg-slate-500'
              }`}
            />
          </span>
          <h3 className="text-sm font-semibold text-slate-200">Swarm Mesh Topology</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${healthBadge.color}`}
          >
            {healthBadge.label}
          </span>
          <span className="text-xs text-slate-400">
            {connectedPeers.length} / {totalPeers} WebRTC Connected
          </span>
        </div>
      </div>

      {/* SVG Mesh Topology Canvas */}
      <div className="w-full relative flex justify-center items-center overflow-hidden bg-slate-950/60 rounded-lg border border-slate-800/80 p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-lg h-auto select-none"
        >
          <defs>
            <linearGradient id="p2pLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="serverLineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.7" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background grid concentric circles */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <circle
            cx={centerX}
            cy={centerY}
            r={radius * 0.55}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1"
            strokeDasharray="2 4"
          />

          {/* Line from Origin Server to Local Student */}
          <line
            x1={centerX}
            y1={42}
            x2={centerX}
            y2={centerY}
            stroke="url(#serverLineGrad)"
            strokeWidth={chunksFromOrigin > 0 ? '2' : '1'}
            strokeDasharray={chunksFromOrigin > 0 && isDownloading ? '4 4' : 'none'}
            className={chunksFromOrigin > 0 && isDownloading ? 'animate-pulse' : 'opacity-40'}
          />

          {/* Peer connection links */}
          {peers.map((peer, idx) => {
            const angle = (idx / Math.max(1, peers.length)) * 2 * Math.PI - Math.PI / 2;
            const px = centerX + radius * Math.cos(angle);
            const py = centerY + radius * Math.sin(angle);
            const isConnected = peer.dataChannelOpen;

            return (
              <g key={`link-${peer.peerId}`}>
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={px}
                  y2={py}
                  stroke={isConnected ? 'url(#p2pLineGrad)' : '#334155'}
                  strokeWidth={isConnected ? '2' : '1'}
                  strokeDasharray={isConnected && isDownloading ? '6 4' : isConnected ? 'none' : '3 3'}
                  className={isConnected && isDownloading ? 'animate-pulse' : ''}
                  opacity={isConnected ? 0.9 : 0.4}
                />
              </g>
            );
          })}

          {/* Origin Server Node (Top center) */}
          <g transform={`translate(${centerX}, 36)`}>
            <circle
              r="20"
              fill="#0f172a"
              stroke={chunksFromOrigin > 0 && isDownloading ? '#f59e0b' : '#475569'}
              strokeWidth="2"
              filter="url(#glow)"
            />
            <text
              textAnchor="middle"
              y="4"
              className="text-[10px] fill-amber-300 font-semibold uppercase tracking-wider select-none"
            >
              Origin
            </text>
            <text
              textAnchor="middle"
              y="32"
              className="text-[9px] fill-slate-400 select-none"
            >
              HTTP Fallback
            </text>
          </g>

          {/* Central Node: Local Student */}
          <g transform={`translate(${centerX}, ${centerY})`}>
            <circle
              r="28"
              fill="#1e1b4b"
              stroke="#6366f1"
              strokeWidth="2.5"
              filter="url(#glow)"
            />
            <circle
              r="34"
              fill="none"
              stroke="#818cf8"
              strokeWidth="1"
              strokeOpacity="0.4"
              className={isDownloading ? 'animate-ping' : ''}
            />
            <text
              textAnchor="middle"
              y="-4"
              className="text-[11px] fill-white font-bold select-none"
            >
              YOU
            </text>
            <text
              textAnchor="middle"
              y="10"
              className="text-[9px] fill-indigo-300 select-none font-mono"
            >
              {localPeerId.slice(0, 6)}
            </text>
          </g>

          {/* Surrounding Nodes: Remote Peers */}
          {peers.map((peer, idx) => {
            const angle = (idx / Math.max(1, peers.length)) * 2 * Math.PI - Math.PI / 2;
            const px = centerX + radius * Math.cos(angle);
            const py = centerY + radius * Math.sin(angle);
            const isConnected = peer.dataChannelOpen;

            return (
              <g key={`node-${peer.peerId}`} transform={`translate(${px}, ${py})`}>
                <circle
                  r="18"
                  fill={isConnected ? '#1e293b' : '#0f172a'}
                  stroke={isConnected ? '#10b981' : '#475569'}
                  strokeWidth="2"
                  filter={isConnected ? 'url(#glow)' : 'none'}
                />
                <text
                  textAnchor="middle"
                  y="-2"
                  className="text-[9px] fill-slate-200 font-medium font-mono select-none"
                >
                  {peer.peerId.slice(0, 5)}
                </text>
                <text
                  textAnchor="middle"
                  y="8"
                  className="text-[8px] fill-slate-400 select-none"
                >
                  {peer.chunksPossessed > 0 ? `${peer.chunksPossessed}c` : isConnected ? 'idle' : 'wait'}
                </text>
              </g>
            );
          })}

          {/* Empty swarm hint */}
          {peers.length === 0 && (
            <text
              x={centerX}
              y={centerY + 65}
              textAnchor="middle"
              className="text-xs fill-slate-500 select-none"
            >
              Waiting for peers in classroom session...
            </text>
          )}
        </svg>
      </div>

      {/* Mini summary footer */}
      <div className="w-full grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800 text-center">
        <div className="bg-slate-950/40 rounded p-1.5">
          <p className="text-[10px] uppercase font-semibold text-slate-400">P2P Chunks</p>
          <p className="text-sm font-bold text-indigo-400">{chunksFromP2P}</p>
        </div>
        <div className="bg-slate-950/40 rounded p-1.5">
          <p className="text-[10px] uppercase font-semibold text-slate-400">Origin Chunks</p>
          <p className="text-sm font-bold text-amber-400">{chunksFromOrigin}</p>
        </div>
        <div className="bg-slate-950/40 rounded p-1.5">
          <p className="text-[10px] uppercase font-semibold text-slate-400">P2P Ratio</p>
          <p className="text-sm font-bold text-emerald-400">
            {chunksFromP2P + chunksFromOrigin > 0
              ? Math.round((chunksFromP2P / (chunksFromP2P + chunksFromOrigin)) * 100)
              : 0}
            %
          </p>
        </div>
      </div>
    </div>
  );
};
