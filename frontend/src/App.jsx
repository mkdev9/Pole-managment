/*
 * ============================================================
 *  App.jsx — Main Dashboard with Distributed Fault Detection
 * ============================================================
 *  Root component: HTTP fetch, WebSocket real-time updates,
 *  4 pole cards, topology view, stats bar, trend charts,
 *  coordination state management, fault event handling.
 * 
 *  UPDATED: Now features strict mode separation (Real vs Sim).
 * ============================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import PoleCard from './components/PoleCard';
import PoleChart from './components/PoleChart';
import TopologyView from './components/TopologyView';
import SimulatorPage from './components/SimulatorPage';
import ConnectionError from './components/ConnectionError';
import HardwareStatus from './components/HardwareStatus';
import ModeSelection from './components/ModeSelection';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const POLE_IDS = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];

function App() {
    // ─── System Mode State ──────────────────────────────────
    const [currentMode, setCurrentMode] = useState('checking'); // 'checking' | 'IDLE' | 'REAL' | 'SIM'
    const [activePage, setActivePage] = useState('dashboard');

    // ─── Data State ─────────────────────────────────────────
    // We maintain separate objects but only populate the active one effectively
    const [polesData, setPolesData] = useState({ Pole1: null, Pole2: null, Pole3: null, Pole4: null });
    const [polesHistory, setPolesHistory] = useState({ Pole1: [], Pole2: [], Pole3: [], Pole4: [] });
    const [systemState, setSystemState] = useState({ status: 'NORMAL', faultLocation: null, isolatedSegments: [], poles: {} });
    const [poleCoordStates, setPoleCoordStates] = useState({ Pole1: null, Pole2: null, Pole3: null, Pole4: null });

    // ─── Common State ───────────────────────────────────────
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [error, setError] = useState(null);
    const [isSimRunning, setIsSimRunning] = useState(false);
    const [faultLog, setFaultLog] = useState([]);

    const socketRef = useRef(null);

    // ─── Derived State ──────────────────────────────────────
    const isSimView = currentMode === 'SIM';

    // ─── Mode Management ────────────────────────────────────
    useEffect(() => {
        checkSystemMode();
    }, []);

    const checkSystemMode = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/settings/mode`);
            if (res.ok) {
                const data = await res.json();
                setCurrentMode(data.mode);
            } else {
                // If endpoint missing or error, default to IDLE
                setCurrentMode('IDLE');
            }
        } catch (err) {
            console.error('Failed to check mode:', err);
            // If backend down, we can't do much. 
            // ConnectionError component handles it later via socket error
            // But for UI flow:
            setCurrentMode('IDLE');
        }
    };

    const [loading, setLoading] = useState(false);

    // ... (rest of state)

    const handleSelectMode = async (mode) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/api/settings/mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode }),
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentMode(data.mode);
                // Clear old data when switching
                setFaultLog([]);
                fetchInitialData(data.mode === 'SIM');
            } else {
                throw new Error(`Server returned ${res.status}`);
            }
        } catch (err) {
            setError(`Failed to set mode: ${err.message}. Check backend connection.`);
        } finally {
            setLoading(false);
        }
    };

    const handleExitSession = async () => {
        await handleSelectMode('IDLE');
        setActivePage('dashboard');
    };

    // Poll simulator status
    useEffect(() => {
        let interval;
        if (currentMode === 'SIM') {
            const checkRun = async () => {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/simulator/running`);
                    if (res.ok) {
                        const data = await res.json();
                        setIsSimRunning(data.running);
                    }
                } catch (e) {
                    console.error('Failed to check sim status', e);
                }
            };
            checkRun();
            interval = setInterval(checkRun, 3000);
        } else {
            setIsSimRunning(false);
        }
        return () => clearInterval(interval);
    }, [currentMode]);

    const handleStartSim = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/simulator/start`, { method: 'POST' });
            const data = await res.json();
            if (data.success) setIsSimRunning(true);
        } catch (e) {
            console.error(e);
        }
    };

    const handleStopSim = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/simulator/stop`, { method: 'POST' });
            const data = await res.json();
            if (data.success) setIsSimRunning(false);
        } catch (e) {
            console.error(e);
        }
    };

    // ─── Fetch Data ─────────────────────────────────────────
    const fetchInitialData = useCallback(async (isSim) => {
        const query = isSim ? '?sim=true' : '';
        try {
            // Poles
            const res = await fetch(`${BACKEND_URL}/api/poles${query}`);
            if (res.ok) {
                const data = await res.json();
                setPolesData(prev => ({ ...prev, ...data }));
            }

            // System
            const resSys = await fetch(`${BACKEND_URL}/api/coordination/system${query}`);
            if (resSys.ok) {
                const data = await resSys.json();
                setSystemState(data);
                if (data.poles) setPoleCoordStates(prev => ({ ...prev, ...data.poles }));
            }

            // History (for charts)
            POLE_IDS.forEach(async id => {
                const resHist = await fetch(`${BACKEND_URL}/api/poles/${id}${query}`);
                if (resHist.ok) {
                    const data = await resHist.json();
                    if (data.readings) setPolesHistory(prev => ({ ...prev, [id]: data.readings.slice(-30) }));
                }
            });

            setError(null);
        } catch (err) {
            console.error(err);
        }
    }, []);

    // ─── WebSocket ──────────────────────────────────────────
    useEffect(() => {
        // Only connect if we have a valid mode (or we can always connect strictly to listen)
        // Check mode ensures we don't start listening until we know what we are.

        const socket = io(BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: Infinity,
            reconnectionDelay: 2000,
        });
        socketRef.current = socket;

        socket.on('connect', () => { setConnectionStatus('connected'); setError(null); });
        socket.on('disconnect', () => setConnectionStatus('disconnected'));
        socket.on('connect_error', (err) => {
            setConnectionStatus('disconnected');
            // Only show error if we are past the selection screen, 
            // otherwise ModeSelection might look broken
            if (currentMode !== 'checking') {
                // setError(`WebSocket connection failed: ${err.message}`);
            }
        });

        // ─── Event Routes ───────────────────────────────────

        // Helper to update state safely
        const handlePoleData = (id, data) => {
            setPolesData(prev => ({ ...prev, [id]: data }));
            if (data) {
                setPolesHistory(prev => ({
                    ...prev,
                    [id]: [...(prev[id] || []).slice(-29), data],
                }));
            }
        };

        // REAL Events
        socket.on('newPoleData', ({ poleId, data }) => {
            if (currentMode === 'REAL') handlePoleData(poleId, data);
        });
        socket.on('systemStateUpdate', (state) => {
            if (currentMode === 'REAL') {
                setSystemState(state);
                if (state.poles) setPoleCoordStates(prev => ({ ...prev, ...state.poles }));
            }
        });
        socket.on('poleStateUpdate', ({ poleId, state }) => {
            if (currentMode === 'REAL') setPoleCoordStates(prev => ({ ...prev, [poleId]: state }));
        });

        // SIM Events
        socket.on('simPoleData', ({ poleId, data }) => {
            if (currentMode === 'SIM') handlePoleData(poleId, data);
        });
        socket.on('simSystemStateUpdate', (state) => {
            if (currentMode === 'SIM') {
                setSystemState(state);
                if (state.poles) setPoleCoordStates(prev => ({ ...prev, ...state.poles }));
            }
        });
        socket.on('simPoleStateUpdate', ({ poleId, state }) => {
            if (currentMode === 'SIM') setPoleCoordStates(prev => ({ ...prev, [poleId]: state }));
        });

        // Logs
        const handleLog = (type, msg, ts, isSimEvt) => {
            // Only show log if it matches current mode
            const modeMatch = (isSimEvt && currentMode === 'SIM') || (!isSimEvt && currentMode === 'REAL');
            if (modeMatch) {
                setFaultLog(prev => [
                    { type, message: msg, time: new Date(ts), isSim: isSimEvt },
                    ...prev.slice(0, 9),
                ]);
            }
        };

        socket.on('faultDetected', d => handleLog('FAULT', d.message, d.timestamp, false));
        socket.on('faultCleared', d => handleLog('CLEARED', d.message, d.timestamp, false));
        socket.on('gridDown', d => handleLog('GRID_DOWN', d.message, d.timestamp, false));
        socket.on('systemNormal', d => handleLog('NORMAL', d.message, d.timestamp, false));
        socket.on('poleAlert', d => handleLog('ALERT', d.message, new Date(), false));

        socket.on('simFaultDetected', d => handleLog('FAULT', d.message, d.timestamp, true));
        socket.on('simFaultCleared', d => handleLog('CLEARED', d.message, d.timestamp, true));
        socket.on('simGridDown', d => handleLog('GRID_DOWN', d.message, d.timestamp, true));
        socket.on('simSystemNormal', d => handleLog('NORMAL', d.message, d.timestamp, true));

        // Initial fetch on mode change
        if (currentMode === 'REAL' || currentMode === 'SIM') {
            fetchInitialData(currentMode === 'SIM');
        }

        return () => socket.disconnect();
    }, [currentMode, fetchInitialData]);

    // ─── Stats ──────────────────────────────────────────────
    const activePolesNodes = POLE_IDS.filter(id => {
        const cs = poleCoordStates[id];
        if (cs && cs.nodeState && cs.nodeState !== 'OFFLINE') return true;
        return polesData[id] && polesData[id].status !== 'offline';
    }).length;

    const alertPolesCount = POLE_IDS.filter(id => {
        const cs = poleCoordStates[id];
        if (cs && cs.nodeState && !['NORMAL', 'OFFLINE', 'UNKNOWN'].includes(cs.nodeState)) return true;
        return polesData[id]?.status === 'alert';
    }).length;

    // Safety check for avg voltage
    const totalVoltage = POLE_IDS.reduce((s, id) => s + (polesData[id]?.voltage || 0), 0);
    const avgVoltage = activePolesNodes > 0 ? (totalVoltage / activePolesNodes) : 0;


    // ─── RENDER ─────────────────────────────────────────────

    // 1. Loading
    if (currentMode === 'checking') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-slate-200">
                <div className="animate-spin text-emerald-500 text-4xl">⟳</div>
                <p className="text-slate-400">Verifying System Mode...</p>
            </div>
        );
    }

    // 2. Gateway
    if (currentMode === 'IDLE') {
        return <ModeSelection onSelectMode={handleSelectMode} error={error} loading={loading} />;
    }

    // Actually, let's just use a new state variable.
    // I'll do this in two chunks. First add state, then use it.

    // 3. Main Interface (Real or Sim)

    // Status styles
    const statusStyles = {
        connected: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        disconnected: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
        connecting: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    };
    const dotColor = {
        connected: 'bg-emerald-400',
        disconnected: 'bg-rose-400',
        connecting: 'bg-amber-400',
    };

    if (activePage === 'simulator' && isSimView) {
        return (
            <div className="min-h-screen">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                    <div className="flex justify-center gap-2 mb-2">
                        <button onClick={() => setActivePage('dashboard')} className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 border border-white/[0.06]">
                            📊 Dashboard
                        </button>
                        <button className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-lg shadow-violet-500/10">
                            🎮 Simulator Controls
                        </button>
                    </div>
                </div>
                <SimulatorPage />
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen">
            {/* Header / Nav */}
            <div className="flex justify-between items-center mb-8">
                {/* Left: Branding */}
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        Utility Pole Monitor
                    </h1>
                    <div className={`text-[0.6rem] px-2 py-0.5 rounded border uppercase tracking-wider font-bold ${isSimView ? 'bg-violet-500/20 border-violet-500/50 text-violet-400' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'}`}>
                        {isSimView ? 'Simulation Mode' : 'Real Hardware'}
                    </div>
                </div>

                {/* Right: Controls */}
                <div className="flex items-center gap-3">
                    <div className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border backdrop-blur-lg ${statusStyles[connectionStatus]}`}>
                        <span className={`w-2 h-2 rounded-full animate-pulse-dot ${dotColor[connectionStatus]}`}></span>
                        <span className="capitalize">{connectionStatus}</span>
                    </div>

                    <button
                        onClick={handleExitSession}
                        className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold hover:bg-slate-700 hover:text-white transition-colors"
                    >
                        Exit Session
                    </button>
                </div>
            </div>

            {/* Sim Nav Tabs & Controls (Only show in Sim mode) */}
            {isSimView && (
                <div className="flex flex-col items-center gap-4 mb-6">
                    <div className="flex justify-center gap-2">
                        <button className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-500/10">
                            📊 Dashboard
                        </button>
                        <button onClick={() => setActivePage('simulator')} className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 border border-white/[0.06]">
                            🎮 Simulator Controls
                        </button>
                    </div>

                    {/* Master Simulation Process Control */}
                    <div className="flex gap-3">
                        {!isSimRunning ? (
                            <button onClick={handleStartSim} className="group relative px-6 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2">
                                <span className="text-lg">▶</span> Start Simulation
                            </button>
                        ) : (
                            <button onClick={handleStopSim} className="group relative px-6 py-2 rounded-full bg-rose-500 hover:bg-rose-400 text-white font-bold shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2 animate-pulse">
                                <span className="text-lg">⏹</span> Stop Simulation
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="alert-banner bg-rose-500/[0.08] border border-rose-500/40 text-rose-400 rounded-2xl mb-6">
                    <span className="text-lg flex-shrink-0">⚠️</span>
                    {error}
                </div>
            )}

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
                <div>
                    <TopologyView systemState={systemState} poleCoordStates={poleCoordStates} polesData={polesData} />

                    {/* Stats */}
                    <div className="flex justify-center flex-wrap gap-4 sm:gap-6 mb-8 mt-6">
                        <div className="stat-pill">
                            <span className="text-2xl">📡</span>
                            <div>
                                <div className="text-[0.68rem] text-slate-500 uppercase tracking-widest">Active Poles</div>
                                <div className="text-xl font-bold text-slate-100">{activePolesNodes} / {POLE_IDS.length}</div>
                            </div>
                        </div>
                        <div className="stat-pill">
                            <span className="text-2xl">⚡</span>
                            <div>
                                <div className="text-[0.68rem] text-slate-500 uppercase tracking-widest">Avg Voltage</div>
                                <div className="text-xl font-bold text-slate-100">{avgVoltage.toFixed(1)} V</div>
                            </div>
                        </div>
                        <div className="stat-pill">
                            <span className="text-2xl">🛡️</span>
                            <div>
                                <div className="text-[0.68rem] text-slate-500 uppercase tracking-widest">System</div>
                                <div className={`text-xl font-bold ${systemState.status === 'NORMAL' ? 'text-emerald-400' :
                                    systemState.status === 'WAITING' ? 'text-slate-400' : 'text-rose-400'}`}>
                                    {systemState.status}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pole Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
                        {POLE_IDS.map(poleId => (
                            <PoleCard
                                key={poleId}
                                poleId={poleId}
                                data={polesData[poleId]}
                                coordState={poleCoordStates[poleId]}
                            />
                        ))}
                    </div>

                    {/* Log */}
                    {faultLog.length > 0 && (
                        <div className="glass-card mb-10">
                            <h3 className="text-sm font-bold text-slate-400 mb-3">📋 Event Log</h3>
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                {faultLog.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                        <span className={`font-semibold ${entry.type === 'FAULT' ? 'text-rose-400' : 'text-emerald-400'}`}>{entry.type}</span>
                                        <span className="text-slate-300 flex-1">{entry.message}</span>
                                        <span className="text-slate-600 text-[0.65rem]">{entry.time.toLocaleTimeString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Charts */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-100 text-center mb-6">
                            📊 Trends ({isSimView ? 'Simulation' : 'Live'})
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {POLE_IDS.map(poleId => (
                                <PoleChart key={poleId} poleId={poleId} readings={polesHistory[poleId]} />
                            ))}
                        </div>
                    </section>
                </div>

                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <HardwareStatus polesData={polesData} poleCoordStates={poleCoordStates} />
                </aside>
            </div>
        </div>
    );
}

export default App;
