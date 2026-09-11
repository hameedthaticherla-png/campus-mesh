import React, { useState, useMemo } from 'react';
import type { SwarmEvent } from '@campus-mesh/shared';

interface EventFeedProps {
  events: SwarmEvent[];
  maxDisplay?: number;
}

export const EventFeed: React.FC<EventFeedProps> = ({ events, maxDisplay = 50 }) => {
  const [filter, setFilter] = useState<'all' | 'peer' | 'chunk' | 'fallback' | 'integrity'>('all');

  const filteredEvents = useMemo(() => {
    const list = filter === 'all' ? events : events.filter((e) => e.type === filter);
    return list.slice(0, maxDisplay);
  }, [events, filter, maxDisplay]);

  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts);
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  };

  const getEventBadge = (type: SwarmEvent['type'], level: SwarmEvent['level']) => {
    switch (type) {
      case 'peer':
        return {
          label: 'PEER',
          bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
        };
      case 'chunk':
        return {
          label: 'CHUNK',
          bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        };
      case 'fallback':
        return {
          label: 'ORIGIN',
          bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        };
      case 'integrity':
        return {
          label: 'INTEGRITY',
          bg: level === 'warn' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
        };
      default:
        return {
          label: 'INFO',
          bg: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
        };
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <h3 className="text-sm font-semibold text-slate-200">Live Telemetry Feed</h3>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
            {events.length} events
          </span>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center space-x-1 text-xs">
          {(['all', 'peer', 'chunk', 'fallback', 'integrity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2 py-1 rounded text-[11px] capitalize font-medium transition-colors ${
                filter === tab
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Events log list */}
      <div className="flex-1 overflow-y-auto max-h-72 space-y-1.5 font-mono text-xs pr-1 select-text scrollbar-thin scrollbar-thumb-slate-700">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No telemetry events recorded yet.
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const badge = getEventBadge(evt.type, evt.level);
            return (
              <div
                key={evt.id}
                className="flex items-start space-x-2 p-2 rounded bg-slate-950/50 hover:bg-slate-950/80 border border-slate-800/60 transition-colors"
              >
                <span className="text-slate-500 text-[10px] shrink-0 pt-0.5">
                  {formatTimestamp(evt.timestamp)}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold tracking-wider shrink-0 ${badge.bg}`}
                >
                  {badge.label}
                </span>
                <span
                  className={`text-[11px] leading-relaxed break-all ${
                    evt.level === 'warn'
                      ? 'text-rose-300'
                      : evt.level === 'success'
                      ? 'text-slate-200'
                      : 'text-slate-300'
                  }`}
                >
                  {evt.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
