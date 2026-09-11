import React, { useState, useEffect } from 'react';
import PublicHome from './components/PublicHome.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import { Database, Shield, Globe, Lock } from 'lucide-react';

export default function App() {
  const getInitialView = () => {
    const hash = window.location.hash.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    if (hash === '#admin' || path === '/admin' || path.startsWith('/admin/')) {
      return 'admin';
    }
    return 'public';
  };

  const [currentView, setCurrentView] = useState(getInitialView());

  const navigateTo = (view) => {
    setCurrentView(view);
    if (view === 'admin') {
      window.location.hash = '#admin';
    } else {
      window.location.hash = '';
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#admin') {
        setCurrentView('admin');
      } else if (!hash) {
        setCurrentView('public');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div 
            onClick={() => navigateTo('public')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-base sm:text-lg text-white tracking-tight flex items-center gap-1.5">
                QUESTION<span className="text-blue-500">DB</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                Public Submission & Verified Answers
              </div>
            </div>
          </div>

          {/* Navigation Pill */}
          <div className="flex items-center gap-2 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700 shadow-lg">
            <button
              onClick={() => navigateTo('public')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                currentView === 'public'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-4 h-4" /> Public Portal
            </button>
            <button
              onClick={() => navigateTo('admin')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                currentView === 'admin'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/30'
              }`}
            >
              <Shield className="w-4 h-4" /> Admin Panel
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1">
        {currentView === 'public' ? (
          <PublicHome onNavigateAdmin={() => navigateTo('admin')} />
        ) : (
          <AdminDashboard onNavigateHome={() => navigateTo('public')} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>PostgreSQL Database Active (Dual Native/PGlite Engine)</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Anyone can submit questions. Only administrators approve official answers.</span>
            <button
              type="button"
              onClick={() => navigateTo('admin')}
              className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 underline"
            >
              <Lock className="w-3.5 h-3.5" /> Admin Panel
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
