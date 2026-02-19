/*
 * ============================================================
 *  Mode Selection Gateway
 * ============================================================
 *  Landing page that forces the user to choose between:
 *  - 🔌 Real Hardware Monitor
 *  - 🎮 Simulation
 *  
 *  This ensures strict separation of concerns.
 * ============================================================
 */

import React from 'react';

function ModeSelection({ onSelectMode, error, loading }) {
    return (
        <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center justify-center p-4">
            <div className="max-w-4xl w-full">
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-4">
                        Utility Pole Monitor
                    </h1>
                    <p className="text-slate-400 text-lg">
                        Select an operating mode to begin
                    </p>
                    {error && (
                        <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg inline-block">
                            ⚠️ {error}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                    {loading && (
                        <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-3xl">
                            <div className="animate-spin text-emerald-500 text-4xl mb-3">⟳</div>
                            <span className="text-slate-300 font-bold">Connecting...</span>
                        </div>
                    )}
                    {/* Real Hardware Card */}
                    <button
                        onClick={() => onSelectMode('REAL')}
                        disabled={loading}
                        className="group relative flex flex-col items-center p-8 rounded-3xl bg-slate-800/50 border border-slate-700 hover:border-emerald-500/50 transition-all duration-300 hover:bg-slate-800 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center text-4xl mb-6 group-hover:scale-110 transition-transform duration-300 ring-1 ring-emerald-500/20 group-hover:ring-emerald-500/50">
                            🔌
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Real Hardware</h2>
                        <p className="text-slate-400 text-sm text-center">
                            Monitor live data from physical Arduino sensors connected to the grid model.
                        </p>
                        <div className="mt-8 px-6 py-2 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                            Launch Monitor
                        </div>
                    </button>

                    {/* Simulator Card */}
                    <button
                        onClick={() => onSelectMode('SIM')}
                        disabled={loading}
                        className="group relative flex flex-col items-center p-8 rounded-3xl bg-slate-800/50 border border-slate-700 hover:border-violet-500/50 transition-all duration-300 hover:bg-slate-800 hover:shadow-2xl hover:shadow-violet-500/10 hover:-translate-y-1 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <div className="w-24 h-24 rounded-full bg-violet-500/10 flex items-center justify-center text-4xl mb-6 group-hover:scale-110 transition-transform duration-300 ring-1 ring-violet-500/20 group-hover:ring-violet-500/50">
                            🎮
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Simulation</h2>
                        <p className="text-slate-400 text-sm text-center">
                            Run a virtual grid simulation to test fault detection and cascading failure logic.
                        </p>
                        <div className="mt-8 px-6 py-2 rounded-full bg-violet-500/10 text-violet-400 text-xs font-bold uppercase tracking-wider group-hover:bg-violet-500 group-hover:text-white transition-colors">
                            Launch Simulator
                        </div>
                    </button>
                </div>

                <div className="mt-16 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700 text-xs text-slate-500">
                        <span>ℹ️</span>
                        <span>Strict Mode Active: Only one mode can be active at a time</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ModeSelection;
