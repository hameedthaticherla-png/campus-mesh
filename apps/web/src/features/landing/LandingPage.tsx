/**
 * Campus Mesh — Hero Landing Page
 *
 * Explains the core problem, architecture, and value proposition within 30 seconds
 * for hackathon judges, instructors, and students.
 */

import React, { useState } from 'react';
import {
  Network,
  Zap,
  ShieldCheck,
  HardDrive,
  Users,
  ArrowRight,
  GraduationCap,
  Laptop,
  Server,
  Layers
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (view: 'instructor' | 'student') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [modelView, setModelView] = useState<'mesh' | 'traditional'>('mesh');

  return (
    <div className="w-full max-w-5xl mx-auto space-y-12 py-4 text-left">
      {/* Hero Header Section */}
      <section className="text-center space-y-5 pt-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider shadow-sm">
          <Network className="w-3.5 h-3.5" />
          <span>Browser-to-Browser Academic Distribution Mesh</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
          Share once.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">
            Distribute everywhere.
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-slate-300 text-base sm:text-lg leading-relaxed">
          In college computer labs, 50 students downloading the same 5 GB installer wastes <strong>250 GB</strong> of campus uplink bandwidth.
          <strong> Campus Mesh</strong> turns student browsers into an ephemeral, high-speed <strong>WebRTC peer-to-peer swarm</strong>.
        </p>

        {/* Primary Call-to-Actions */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            onClick={() => onNavigate('instructor')}
            className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-xl shadow-indigo-600/30 flex items-center gap-2.5 active:scale-95"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Create a Class (Instructor)</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          <button
            onClick={() => onNavigate('student')}
            className="px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700 font-semibold text-sm transition-all shadow-lg flex items-center gap-2.5 active:scale-95"
          >
            <Laptop className="w-4 h-4 text-indigo-400" />
            <span>Join a Class (Student)</span>
          </button>
        </div>
      </section>

      {/* Interactive Architecture Comparison Widget */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white">How Campus Mesh Transforms Bandwidth</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                Architecture Model
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Theoretical architectural model showing how data flows through the classroom network.
            </p>
          </div>

          {/* Model Toggle Buttons */}
          <div className="p-1 rounded-xl bg-slate-950 border border-slate-800 flex gap-1">
            <button
              onClick={() => setModelView('mesh')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                modelView === 'mesh'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Campus Mesh (P2P)</span>
            </button>
            <button
              onClick={() => setModelView('traditional')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                modelView === 'traditional'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Traditional Server</span>
            </button>
          </div>
        </div>

        {/* Dynamic Visual Diagram */}
        <div className="relative rounded-2xl bg-slate-950 border border-slate-800/80 p-6 sm:p-8 overflow-hidden">
          {modelView === 'mesh' ? (
            <div className="space-y-6">
              {/* Mesh Diagram Graphic */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center text-center">
                {/* Server */}
                <div className="p-4 rounded-xl bg-slate-900 border border-indigo-500/30 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400 mb-2">
                    <Server className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-sm text-white">Class Server</span>
                  <span className="text-[11px] text-emerald-400 font-mono mt-1">Sends Chunks ONCE</span>
                  <span className="text-xs text-slate-400 mt-1">Egress: ~5.0 GB</span>
                </div>

                {/* Transfer Arrow */}
                <div className="flex flex-col items-center justify-center text-indigo-400">
                  <div className="hidden md:flex items-center gap-1">
                    <div className="h-0.5 w-16 bg-gradient-to-r from-indigo-500 to-emerald-500 animate-pulse" />
                    <Zap className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-mono text-emerald-300 font-semibold mt-1">
                    WebRTC Mesh Swarm
                  </span>
                  <span className="text-[10px] text-slate-500">256 KB Verified Chunks</span>
                </div>

                {/* Peer Ring */}
                <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-2">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-sm text-white">50 Student Laptops</span>
                  <span className="text-[11px] text-indigo-300 font-mono mt-1">Share Browser-to-Browser</span>
                  <span className="text-xs text-slate-400 mt-1">Uplink Relieved: 98%</span>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-900">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Origin Egress</span>
                  <span className="text-lg font-black font-mono text-emerald-400">~5.2 GB</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Bandwidth Saved</span>
                  <span className="text-lg font-black font-mono text-emerald-400">244.8 GB</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Integrity Check</span>
                  <span className="text-lg font-black font-mono text-indigo-400">SHA-256</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Egress Relieved</span>
                  <span className="text-lg font-black font-mono text-emerald-400">98.0%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Traditional Diagram Graphic */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center text-center">
                {/* Server */}
                <div className="p-4 rounded-xl bg-slate-900 border border-rose-500/30 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-rose-500/10 text-rose-400 mb-2">
                    <Server className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-sm text-white">Central Server</span>
                  <span className="text-[11px] text-rose-400 font-mono mt-1">Saturated Uplink</span>
                  <span className="text-xs text-rose-300 font-bold mt-1">Egress: 250 GB!</span>
                </div>

                {/* Overloaded Arrow */}
                <div className="flex flex-col items-center justify-center text-rose-400">
                  <div className="hidden md:flex items-center gap-1">
                    <div className="h-0.5 w-16 bg-rose-500" />
                    <HardDrive className="w-4 h-4 text-rose-400" />
                  </div>
                  <span className="text-[11px] font-mono text-rose-300 font-semibold mt-1">
                    50 Independent Streams
                  </span>
                  <span className="text-[10px] text-slate-500">Access Point Congestion</span>
                </div>

                {/* Overloaded Peers */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-slate-800 text-slate-400 mb-2">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-sm text-white">50 Student Laptops</span>
                  <span className="text-[11px] text-slate-400 font-mono mt-1">Each Downloads From Server</span>
                  <span className="text-xs text-slate-400 mt-1">Bandwidth Saved: 0 GB</span>
                </div>
              </div>

              {/* Traditional Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-900">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Origin Egress</span>
                  <span className="text-lg font-black font-mono text-rose-400">250.0 GB</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Bandwidth Saved</span>
                  <span className="text-lg font-black font-mono text-slate-500">0.0 GB</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">AP Congestion</span>
                  <span className="text-lg font-black font-mono text-rose-400">Critical</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Egress Relieved</span>
                  <span className="text-lg font-black font-mono text-slate-500">0.0%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Three Core Engineering Pillars */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-3 shadow-lg">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 w-fit">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Zero-Install WebRTC</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Runs natively inside standard browser tabs using standard WebRTC DataChannels. No browser extensions, daemons, or root privileges needed.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-3 shadow-lg">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">BitTorrent-Style SHA-256</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Deterministic 256 KB chunking with hardware-accelerated Web Crypto API verification. Every chunk is verified against the author's manifest before saving to IndexedDB.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-3 shadow-lg">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 w-fit">
            <HardDrive className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Automatic HTTP Fallback</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Rarest-first piece scheduling dynamically prioritizes peer transfers. If a peer drops or times out, the missing chunk seamlessly streams from the server with zero disruption.
          </p>
        </div>
      </section>

      {/* 30-Second Quick Workflow */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-bold text-white text-center">How It Works in 3 Steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3.5">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              1
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Instructor Creates Class</h4>
              <p className="text-xs text-slate-400 mt-1">
                Launches an ephemeral class session and uploads resource files. The server deterministically splits files into 256 KB SHA-256 chunks.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              2
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Students Join Swarm</h4>
              <p className="text-xs text-slate-400 mt-1">
                Students click the join link or enter the 8-character code. Signaling coordinates direct browser-to-browser WebRTC DataChannels.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              3
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">P2P Swarm Distribution</h4>
              <p className="text-xs text-slate-400 mt-1">
                Once the first student pulls chunks from the server, all other students download directly from their peers, slashing server load by 80–98%.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
