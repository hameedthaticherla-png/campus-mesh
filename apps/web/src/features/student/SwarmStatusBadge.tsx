/**
 * Campus Mesh — Reusable Swarm Status Badge
 */

import React from 'react';
import { Wifi, CheckCircle2, AlertTriangle, HardDrive, Clock } from 'lucide-react';

export type SwarmStatus = 'waiting' | 'swarm' | 'degraded' | 'fallback' | 'completed';

interface SwarmStatusBadgeProps {
  status: SwarmStatus;
  className?: string;
}

export const SwarmStatusBadge: React.FC<SwarmStatusBadgeProps> = ({ status, className = '' }) => {
  switch (status) {
    case 'waiting':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>WAITING FOR PEERS</span>
        </span>
      );

    case 'swarm':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
          <Wifi className="w-3.5 h-3.5 text-indigo-400" />
          <span>P2P SWARM ACTIVE</span>
        </span>
      );

    case 'degraded':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30 ${className}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>MESH DEGRADED</span>
        </span>
      );

    case 'fallback':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 ${className}`}
        >
          <HardDrive className="w-3.5 h-3.5 text-amber-400" />
          <span>HTTP ORIGIN FALLBACK</span>
        </span>
      );

    case 'completed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>DOWNLOAD COMPLETE</span>
        </span>
      );

    default:
      return null;
  }
};
