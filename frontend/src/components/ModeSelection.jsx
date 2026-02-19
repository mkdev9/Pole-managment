/*
 * ============================================================
 *  Mode Selection Gateway
 * ============================================================
 *  Landing page that forces the user to choose between:
 *  - Real Hardware Monitor
 *  - Simulation
 *  
 *  This ensures strict separation of concerns.
 * ============================================================
 */

import React from 'react';
import HardwareLogo from '../assets/images/HardwareLogo.png';
import SimulationLogo from '../assets/images/SimulationLogo.png';
import BackgroundVideo from '../assets/videos/bg_loop.mp4';

function ModeSelection({ onSelectMode, error, loading }) {
    return (
        <div className="relative min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center justify-center p-4 overflow-hidden">
            {/* Background Video */}
            <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover z-0 opacity-50"
            >
                <source src={BackgroundVideo} type="video/mp4" />
            </video>

            {/* Overlay Gradient */}
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-900/90 pointer-events-none"></div>

            <div className="max-w-4xl w-full z-10 relative">
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
                        <div className="w-32 h-32 rounded-full bg-emerald-500/5 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-300 p-4 ring-1 ring-emerald-500/20 group-hover:ring-emerald-500/50">
                            <img src={HardwareLogo} alt="Hardware Mode" className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Hardware Mode</h2>
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
                        <div className="w-32 h-32 rounded-full bg-violet-500/5 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-300 p-4 ring-1 ring-violet-500/20 group-hover:ring-violet-500/50">
                            <img src={SimulationLogo} alt="Simulation Mode" className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
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

                <div className="mt-16 text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700 text-xs text-slate-500">
                        <span> Designed and Developed by Mallikarjun </span>
                    </div>

                    <div>
                        <a
                            href="https://github.com/mkdev9/Pole-managment.git"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                            </svg>
                            <span>View on GitHub</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ModeSelection;
