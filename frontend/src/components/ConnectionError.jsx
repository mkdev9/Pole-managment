/*
 * ============================================================
 *  ConnectionError — Full-page error when backend is unreachable
 * ============================================================
 *  Shows troubleshooting steps and retry button.
 *  On retry, stays on this page with a loading animation
 *  for up to 10 seconds, then shows "no response" message.
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';

function ConnectionError({ error, onRetry }) {
    const [retryState, setRetryState] = useState('idle'); // 'idle' | 'loading' | 'timeout'
    const timerRef = useRef(null);

    const handleRetry = () => {
        setRetryState('loading');
        if (onRetry) onRetry();

        // After 10 seconds, show timeout message
        timerRef.current = setTimeout(() => {
            setRetryState('timeout');
        }, 10000);
    };

    // Cleanup timer on unmount (e.g. when connection succeeds)
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const isLoading = retryState === 'loading';
    const isTimeout = retryState === 'timeout';

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center">
                {/* Animated Icon */}
                <div className="relative mx-auto w-28 h-28 mb-8">
                    {isLoading ? (
                        <>
                            <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-ping" style={{ animationDuration: '1.5s' }} />
                            <div className="absolute inset-2 rounded-full bg-blue-500/5 animate-ping" style={{ animationDuration: '2s' }} />
                            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-2 border-blue-500/30 flex items-center justify-center shadow-2xl shadow-blue-500/10">
                                <svg className="animate-spin h-12 w-12 text-blue-400" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </div>
                        </>
                    ) : isTimeout ? (
                        <>
                            <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" style={{ animationDuration: '2.5s' }} />
                            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-2 border-amber-500/30 flex items-center justify-center shadow-2xl shadow-amber-500/10">
                                <span className="text-5xl">🔌</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="absolute inset-0 rounded-full bg-rose-500/10 animate-ping" style={{ animationDuration: '2s' }} />
                            <div className="absolute inset-2 rounded-full bg-rose-500/5 animate-ping" style={{ animationDuration: '2.5s' }} />
                            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-rose-500/20 to-rose-600/10 border-2 border-rose-500/30 flex items-center justify-center shadow-2xl shadow-rose-500/10">
                                <span className="text-5xl">🔌</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Title */}
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mb-3">
                    {isLoading ? 'Reconnecting...' : isTimeout ? 'Server Unreachable' : 'Connection Lost'}
                </h2>
                <p className="text-slate-400 text-sm sm:text-base mb-2">
                    {isLoading
                        ? 'Attempting to reach the backend server...'
                        : isTimeout
                            ? 'The server could not be reached. Please verify it is running.'
                            : 'Unable to connect to the backend server.'
                    }
                </p>

                {/* Loading Progress Bar */}
                {isLoading && (
                    <div className="w-full max-w-xs mx-auto mb-6 mt-4">
                        <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                                style={{
                                    animation: 'loading-sweep 2s ease-in-out infinite',
                                }}
                            />
                        </div>
                        <style>{`
                            @keyframes loading-sweep {
                                0% { width: 0%; margin-left: 0%; }
                                50% { width: 60%; margin-left: 20%; }
                                100% { width: 0%; margin-left: 100%; }
                            }
                        `}</style>
                        <p className="text-[0.65rem] text-blue-400/60 mt-2 animate-pulse">
                            Waiting for server response...
                        </p>
                    </div>
                )}

                {/* Timeout message */}
                {isTimeout && (
                    <div className="bg-amber-500/[0.08] border border-amber-500/25 rounded-xl px-4 py-3 mb-6 text-sm text-amber-300/90">
                        <p className="font-semibold mb-1">Connection timed out</p>
                        <p className="text-xs text-amber-400/60">
                            Please check the backend service and try again.
                        </p>
                    </div>
                )}

                {/* Error Detail (only in idle state) */}
                {error && !isLoading && !isTimeout && (
                    <div className="bg-rose-500/[0.06] border border-rose-500/20 rounded-xl px-4 py-3 mb-6 text-xs text-rose-300/80 font-mono break-all">
                        {error}
                    </div>
                )}

                {/* Troubleshooting (not when loading) */}
                {!isLoading && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-5 py-4 mb-6 text-left">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Troubleshooting</h4>
                        <ul className="space-y-2 text-xs text-slate-400">
                            <li className="flex items-start gap-2.5">
                                <span className="text-amber-400 mt-0.5 flex-shrink-0">①</span>
                                Ensure the backend is running: <code className="text-cyan-400 bg-white/[0.05] px-1.5 py-0.5 rounded">node server.js</code>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="text-amber-400 mt-0.5 flex-shrink-0">②</span>
                                Backend should be on <code className="text-cyan-400 bg-white/[0.05] px-1.5 py-0.5 rounded">http://localhost:3000</code>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="text-amber-400 mt-0.5 flex-shrink-0">③</span>
                                Start the simulator: <code className="text-cyan-400 bg-white/[0.05] px-1.5 py-0.5 rounded">node simulator.js</code>
                            </li>
                        </ul>
                    </div>
                )}

                {/* Retry Button */}
                <button
                    onClick={handleRetry}
                    disabled={isLoading}
                    className={`
                        px-8 py-3 rounded-2xl text-sm font-bold
                        ${isLoading
                            ? 'bg-gradient-to-b from-slate-600 to-slate-700 text-slate-400'
                            : 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:scale-[1.03] active:scale-[0.97]'
                        }
                        transition-all duration-200
                        disabled:cursor-not-allowed disabled:hover:scale-100
                        border border-white/10
                    `}
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Connecting...
                        </span>
                    ) : (
                        '🔄 Retry Connection'
                    )}
                </button>

                {/* Status */}
                <p className="text-[0.65rem] text-slate-600 mt-4">
                    {isLoading
                        ? 'Will automatically transition to dashboard once connected.'
                        : 'The page will auto-reconnect when the server becomes available.'
                    }
                </p>
            </div>
        </div>
    );
}

export default ConnectionError;
