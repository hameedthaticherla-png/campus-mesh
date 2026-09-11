/**
 * Campus Mesh — Root Application Shell
 */

import { useState, useEffect } from 'react';
import { InstructorView } from './features/instructor/InstructorView.js';
import { StudentView } from './features/student/StudentView.js';
import { LandingPage } from './features/landing/LandingPage.js';
import { ToastProvider } from './context/ToastContext.js';
import { Network, GraduationCap, Laptop, Home } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'instructor' | 'student'>('landing');
  const [initialSessionCode, setInitialSessionCode] = useState<string>('');

  // Deep-Link URL parameter inspection (e.g. ?code=MESH-7K4P or ?join=MESH-7K4P)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('code') || params.get('join');
      if (codeParam) {
        const cleaned = codeParam.trim().toUpperCase();
        setInitialSessionCode(cleaned);
        setActiveTab('student');
      }
    } catch {
      // Graceful fallback for non-browser or strange query strings
    }
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-8 selection:bg-indigo-500 selection:text-white">
        {/* Top Header */}
        <header className="w-full max-w-6xl flex flex-col items-center text-center pt-2 pb-6">
          <div className="flex flex-wrap items-center justify-between w-full pb-4 border-b border-slate-900 gap-4">
            {/* Brand Title */}
            <button
              onClick={() => setActiveTab('landing')}
              className="flex items-center gap-2 text-left group focus:outline-none"
            >
              <div className="p-2 rounded-xl bg-indigo-600 group-hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
                  Campus Mesh <span className="text-indigo-400 text-base font-normal">v1.0</span>
                </h1>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  P2P Classroom Resource Distribution
                </p>
              </div>
            </button>

            {/* Navigation Tabs */}
            <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex gap-1 shadow-inner">
              <button
                onClick={() => setActiveTab('landing')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'landing'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>Overview</span>
              </button>

              <button
                onClick={() => setActiveTab('student')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'student'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Join Class</span>
              </button>

              <button
                onClick={() => setActiveTab('instructor')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'instructor'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Instructor Hub</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area (Full responsive width up to max-w-6xl) */}
        <main className="w-full max-w-6xl flex-1 flex flex-col items-center justify-start py-4">
          {activeTab === 'landing' && <LandingPage onNavigate={setActiveTab} />}
          {activeTab === 'student' && <StudentView initialSessionCode={initialSessionCode} />}
          {activeTab === 'instructor' && <InstructorView />}
        </main>

        {/* Footer */}
        <footer className="w-full max-w-6xl text-center py-6 border-t border-slate-900 text-slate-500 text-xs mt-12 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Campus Mesh • Ephemeral Academic WebRTC Swarm Network</span>
          <div className="flex items-center gap-4 text-slate-500">
            <span>256 KB SHA-256 Chunks</span>
            <span>•</span>
            <span>Zero Server State Bloat</span>
            <span>•</span>
            <span>IndexedDB Storage</span>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}
