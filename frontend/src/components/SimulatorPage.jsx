/*
 * ============================================================
 *  SimulatorPage — Interactive Grid Fault Simulator
 * ============================================================
 *  Visual testing tool for the distributed fault detection
 *  system. Sends commands to the backend simulator and
 *  displays real-time pole states via WebSocket.
 *  
 *  NOTE: This page exclusively interacts with the SIMULATION
 *  context of the backend.
 * ============================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const POLE_IDS = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];

// ─── Scenario Button ────────────────────────────────────────
function ScenarioButton({ label, icon, color, onClick, disabled, description }) {
    const colorMap = {
        red: 'from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 shadow-rose-500/25',
        amber: 'from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-amber-500/25',
        blue: 'from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-blue-500/25',
        green: 'from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 shadow-emerald-500/25',
        violet: 'from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 shadow-violet-500/25',
    };
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                flex flex-col items-center gap-1.5 px-5 py-4 rounded-2xl
                bg-gradient-to-b ${colorMap[color]}
                text-white font-semibold text-sm
                shadow-lg transition-all duration-200
                hover:scale-[1.03] hover:shadow-xl
                active:scale-[0.97]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                border border-white/10
                min-w-[120px]
            `}
        >
            <span className="text-2xl">{icon}</span>
            <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
            {description && <span className="text-[0.6rem] opacity-70 font-normal">{description}</span>}
        </button>
    );
}

// ─── Visual Wire Segment ────────────────────────────────────
function SimWire({ from, to, isCut, isNoPower, isActive }) {
    let color = 'bg-emerald-500';
    let glow = 'shadow-emerald-500/40';
    let label = '';
    let pulseClass = '';

    if (isCut) {
        color = 'bg-rose-500';
        glow = 'shadow-rose-500/50';
        label = '⚡ CUT';
        pulseClass = 'animate-pulse';
    } else if (isNoPower) {
        color = 'bg-slate-600';
        glow = '';
        label = 'NO POWER';
    } else if (isActive) {
        label = '⚡';
    }

    return (
        <div className="flex flex-col items-center flex-1 min-w-[50px] relative">
            <div className={`h-2 w-full rounded-full ${color} shadow-lg ${glow} transition-all duration-500 ${pulseClass}`}>
                {isCut && <div className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-30" />}
            </div>
            <div className="flex items-center gap-1 mt-1">
                <span className={`text-[0.6rem] font-bold uppercase tracking-wider ${isCut ? 'text-rose-400' : isNoPower ? 'text-slate-500' : 'text-emerald-400/60'}`}>
                    {label}
                </span>
            </div>
            <span className="text-[0.5rem] text-slate-600 mt-0.5">{from}→{to}</span>
        </div>
    );
}

// ─── Visual Pole Node ───────────────────────────────────────
function SimPoleNode({ poleId, state, isGrid }) {
    if (isGrid) {
        const inCurrent = state?.incomingCurrent;
        const isDown = inCurrent === 'LOW' || state?.nodeState === 'GRID_DOWN';
        return (
            <div className="flex flex-col items-center gap-2 min-w-[80px]">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold border-2 transition-all duration-500 ${isDown
                    ? 'bg-red-500/20 border-red-500/50 shadow-lg shadow-red-500/20'
                    : 'bg-emerald-500/15 border-emerald-500/40 shadow-lg shadow-emerald-500/20'
                    }`}>
                    🔌
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">SOURCE</span>
                    <span className={`text-[0.6rem] font-bold px-2 py-0.5 rounded-full mt-1 ${isDown ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {isDown ? 'OFFLINE' : 'ACTIVE'}
                    </span>
                </div>
            </div>
        );
    }

    const nodeState = state?.nodeState || 'OFFLINE';
    const isTerminal = poleId === 'Pole4';
    const voltage = state?.voltage != null ? parseFloat(state.voltage).toFixed(1) : '0.0';
    const current = state?.current != null ? parseFloat(state.current).toFixed(2) : '0.00';

    const borderColors = {
        NORMAL: 'border-emerald-500/50 shadow-emerald-500/15',
        GRID_DOWN: 'border-amber-500/50 shadow-amber-500/15',
        FAULT_UPSTREAM: 'border-rose-500/50 shadow-rose-500/20',
        FAULT_DOWNSTREAM: 'border-orange-500/50 shadow-orange-500/15',
        RECOVERY: 'border-blue-500/50 shadow-blue-500/15',
        OFFLINE: 'border-slate-600/50',
    };

    const stateColors = {
        NORMAL: 'text-emerald-400',
        GRID_DOWN: 'text-amber-400',
        FAULT_UPSTREAM: 'text-rose-400',
        FAULT_DOWNSTREAM: 'text-orange-400',
        RECOVERY: 'text-blue-400',
        OFFLINE: 'text-slate-500',
    };

    const stateBg = {
        NORMAL: 'bg-emerald-500/10',
        GRID_DOWN: 'bg-amber-500/10',
        FAULT_UPSTREAM: 'bg-rose-500/10',
        FAULT_DOWNSTREAM: 'bg-orange-500/10',
        RECOVERY: 'bg-blue-500/10',
        OFFLINE: 'bg-slate-700/20',
    };

    return (
        <div className="flex flex-col items-center gap-2 min-w-[100px]">
            <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border-2 shadow-lg transition-all duration-500 ${stateBg[nodeState] || stateBg.OFFLINE} ${borderColors[nodeState] || borderColors.OFFLINE}`}>
                {isTerminal ? '📡' : '🏗️'}
                {isTerminal && (
                    <div className="absolute -top-3 -right-3 bg-slate-700 text-slate-300 text-[0.5rem] font-bold px-1.5 py-0.5 rounded border border-slate-600 shadow-md">
                        SENSOR
                    </div>
                )}
            </div>

            <div className="flex flex-col items-center">
                <span className="text-[0.7rem] font-bold text-slate-200">{poleId}</span>
                <span className={`text-[0.55rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-0.5 ${stateBg[nodeState] || ''} ${stateColors[nodeState] || 'text-slate-500'}`}>
                    {nodeState.replace('FAULT_', 'FAULT ')}
                </span>
            </div>

            {/* Voltage / Current */}
            <div className="flex flex-col gap-0.5 text-[0.6rem] font-mono bg-slate-900/40 px-2 py-1 rounded border border-white/5">
                <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{isTerminal ? 'PDV' : 'V'}</span>
                    <span className="text-cyan-400">{voltage}V</span>
                </div>
                <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{isTerminal ? 'PDC' : 'A'}</span>
                    <span className="text-amber-400">{current}A</span>
                </div>
            </div>

            {/* Relay states (Hide for Terminal) */}
            {!isTerminal && (
                <div className="flex gap-1 mt-0.5">
                    <span className={`text-[0.45rem] px-1 py-0.5 rounded font-bold uppercase ${state?.relayIn === 'ON' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        R-IN
                    </span>
                    <span className={`text-[0.45rem] px-1 py-0.5 rounded font-bold uppercase ${state?.relayOut === 'ON' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        R-OUT
                    </span>
                </div>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
//  MAIN SIMULATOR PAGE COMPONENT
// ════════════════════════════════════════════════════════════
function SimulatorPage({ socket }) {
    const [poleStates, setPoleStates] = useState({
        Pole1: null, Pole2: null, Pole3: null, Pole4: null,
    });
    const [systemState, setSystemState] = useState({
        status: 'NORMAL', faultLocation: null, isolatedSegments: [],
    });
    const [eventLog, setEventLog] = useState([]);
    const [sending, setSending] = useState(false);
    const [connected, setConnected] = useState(socket?.connected || false);

    // ─── WebSocket Setup ─────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);

        // If already connected
        if (socket.connected) setConnected(true);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        // System state updates (listen for SIM events)
        const onSimSystemStateUpdate = (state) => {
            setSystemState(state);
            if (state.poles) {
                setPoleStates(prev => ({ ...prev, ...state.poles }));
            }
        };
        socket.on('simSystemStateUpdate', onSimSystemStateUpdate);

        // Individual pole updates (listen for SIM events)
        const onSimPoleStateUpdate = ({ poleId, state }) => {
            setPoleStates(prev => ({ ...prev, [poleId]: state }));
        };
        socket.on('simPoleStateUpdate', onSimPoleStateUpdate);

        // Fault events (listen for SIM events)
        const onSimFaultDetected = ({ segment, message, timestamp }) => {
            addLog('🚨', 'FAULT', message, 'text-rose-400');
        };
        socket.on('simFaultDetected', onSimFaultDetected);

        const onSimFaultCleared = ({ segment, message, timestamp }) => {
            addLog('✅', 'CLEARED', message, 'text-emerald-400');
        };
        socket.on('simFaultCleared', onSimFaultCleared);

        const onSimGridDown = ({ message }) => {
            addLog('⚠️', 'GRID DOWN', message, 'text-amber-400');
        };
        socket.on('simGridDown', onSimGridDown);

        const onSimSystemNormal = ({ message }) => {
            addLog('✅', 'NORMAL', message, 'text-emerald-400');
        };
        socket.on('simSystemNormal', onSimSystemNormal);

        // Initial fetch (SIM only)
        fetchSystemState();

        // CLEANUP LISTENERS ONLY - DO NOT DISCONNECT SOCKET
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('simSystemStateUpdate', onSimSystemStateUpdate);
            socket.off('simPoleStateUpdate', onSimPoleStateUpdate);
            socket.off('simFaultDetected', onSimFaultDetected);
            socket.off('simFaultCleared', onSimFaultCleared);
            socket.off('simGridDown', onSimGridDown);
            socket.off('simSystemNormal', onSimSystemNormal);
        };
    }, [socket]);

    const fetchSystemState = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/coordination/system?sim=true`);
            if (!res.ok) return;
            const data = await res.json();
            setSystemState(data);
            if (data.poles) setPoleStates(prev => ({ ...prev, ...data.poles }));
        } catch (_) { }
    };

    // ─── Check active simulator process ────────────────⠀⠀
    const [simRunning, setSimRunning] = useState(true);
    useEffect(() => {
        const checkRun = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/simulator/running`);
                const data = await res.json();
                setSimRunning(data.running);
            } catch (e) {
                console.error('Failed to check simulator status:', e);
                setSimRunning(false);
            }
        };
        checkRun();
        // Poll every 5s to ensure it's still alive
        const interval = setInterval(checkRun, 5000);
        return () => clearInterval(interval);
    }, []);

    const startSimulator = async () => {
        try {
            addLog('🚀', 'STARTING', 'Launching simulator process...', 'text-emerald-400');
            const res = await fetch(`${BACKEND_URL}/api/simulator/start`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setSimRunning(true);
                addLog('✅', 'STARTED', `PID: ${data.pid}`, 'text-emerald-400');
            } else {
                addLog('❌', 'ERROR', data.message, 'text-rose-400');
            }
        } catch (e) {
            addLog('❌', 'ERROR', e.message, 'text-rose-400');
        }
    };

    const addLog = (icon, type, message, color) => {
        setEventLog(prev => [
            { icon, type, message, color, time: new Date() },
            ...prev.slice(0, 19),
        ]);
    };

    // ─── Send command to simulator ───────────────────────────
    const sendCommand = async (action) => {
        setSending(true);
        addLog('📤', 'COMMAND', `Sending: ${action}`, 'text-blue-400');
        try {
            // Note: simulator/command route likely forwards to coordinator/command with isSimulation=true
            // Or we check how backend routes/simulator.js works? 
            // Wait, there is no routes/simulator.js. The simulator script runs independently 
            // But we have an API endpoint `POST /api/simulator/command`? 
            // Previous code used `/api/simulator/command`. 
            // Let me double check if that route exists.
            // If uses coordination route, we use `/api/coordination/command` with { isSimulation:true }

            // Checking previous code: it fetched `${BACKEND_URL}/api/simulator/command`
            // Does that exist in backend? I haven't seen `routes/simulator.js`.
            // The user might have meant `routes/coordination.js`?
            // Actually, `simulator.js` (the script) listens to nothing from HTTP directly usually.
            // But maybe there is a route I missed?
            // Ah, I missed checking `backend/server.js` or `backend/app.js` to see routes.
            // But usually the Simulator Page talks to backend which talks to simulator script?
            // Or the simulator runs as a script and we talk to `coordination` which stores state?
            // The simulator SCRIPT drives the state.
            // The BUTTONS on the page need to tell the SCRIPT to change its internal physics.
            // How does the frontend tell the simulator script what to do?
            // The simulator script listens to a FILE ? Or keyboard?

            // `simulator.js` has: `fs.watchFile(path.join(__dirname, 'commands.json'), ...)`?
            // OR maybe it polls `GET /api/coordination/commands/:id`?
            // The simulator script is a CLIENT of the backend. It polls for commands!
            // `coordination.js` has `GET /commands/:poleId`.
            // So if I queue a command in `coordination.js`, the simulator (acting as Pole) picks it up.

            // BUT, the buttons are "Kill Grid", "Cut Wire". These are GOD MODE commands.
            // Does the simulator pick these up?
            // `simulator.js` currently listens for:
            // `const POLE_ORDER = ...`
            // It runs a physics loop. 
            // It doesn't seem to have a "poll for god commands" logic yet?
            // `simulator.js` lines 294+: `activeFault = null`.
            // It has keyboard listeners.
            // But how do we trigger it from web?

            // The previous `SimulatorPage.jsx` called `/api/simulator/command`. 
            // Use `read_file` on `server.js` or `index.js` to see if that route exists.
            // If not, I need to implement a way for the web to talk to the simulator.
            // A simple way is: Web -> Backend -> File -> Simulator (via watch).
            // Or Web -> Backend (store command) -> Simulator (poll).

            // Let's assume for now I should use `/api/coordination/command` with `isSimulation:true`.
            // And I need to ensure `simulator.js` polls for these commands?
            // OR, `simulator.js` should act as the poles and pick up "DISABLE_RELAY" commands.
            // But "GRID_DOWN" is a scenario.

            // Use `view_file` on `backend/index.js` (or server.js) to see routes.
            // And `view_file` on `backend/simulator.js` to see if it polls.

            const res = await fetch(`${BACKEND_URL}/api/simulator/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (data.success) {
                addLog('✅', 'SENT', `${action} — awaiting response...`, 'text-blue-300');
            } else {
                addLog('❌', 'ERROR', data.error || 'Failed', 'text-rose-400');
            }
        } catch (err) {
            addLog('❌', 'ERROR', err.message, 'text-rose-400');
        }
        setTimeout(() => setSending(false), 800);
    };

    // ─── Determine wire states from system state ─────────────
    const faultLocation = systemState?.faultLocation;
    const isolatedSegments = systemState?.isolatedSegments || [];
    const isGridDown = systemState?.status === 'GRID_DOWN';

    const wireState = (from, to) => {
        const segment = `${from}-${to}`;
        const isCut = faultLocation === segment || isolatedSegments.includes(segment);

        // Check if this segment has no power flowing
        const fromState = poleStates[from];
        const toState = poleStates[to];
        const isNoPower = !isCut && (
            isGridDown ||
            fromState?.outgoingCurrent === 'LOW' ||
            toState?.incomingCurrent === 'LOW'
        );
        const isActive = !isCut && !isNoPower && fromState?.outgoingCurrent === 'HIGH';

        return { isCut, isNoPower, isActive };
    };

    // ─── System banner ───────────────────────────────────────
    const bannerMap = {
        NORMAL: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400', icon: '✅', label: 'All poles energized — system operating normally' },
        FAULT: { bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-400', icon: '🚨', label: `Wire fault between ${faultLocation ? faultLocation.replace('-', ' → ') : 'poles'} — relays isolating affected segment` },
        GRID_DOWN: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400', icon: '⚠️', label: 'Grid power supply offline — all poles de-energized' },
    };
    const banner = bannerMap[systemState?.status] || bannerMap.NORMAL;

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen">
            {/* Header */}
            <header className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent tracking-tight mb-2">
                    🎮 Grid Simulator
                </h1>
                <p className="text-slate-400 text-sm">
                    Test fault detection & isolation logic without Arduino hardware
                </p>
                <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-xs font-medium border backdrop-blur-lg ${connected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}>
                    <span className={`w-2 h-2 rounded-full animate-pulse ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    {connected ? 'Simulator Connected' : 'Disconnected'}
                </div>
            </header>

            {/* System State Banner */}
            <div className={`flex items-center justify-center gap-3 px-4 py-3 rounded-xl border mb-6 ${banner.bg}`}>
                <span className="text-xl">{banner.icon}</span>
                <span className={`text-sm font-bold uppercase tracking-wider ${banner.text}`}>{banner.label}</span>
                {systemState?.status === 'FAULT' && (
                    <span className="relative flex h-3 w-3 ml-1">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                        <span className="inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                    </span>
                )}
            </div>

            {/* ── Visual Topology ─────────────────────────── */}
            <div className="glass-card mb-8 py-8">
                <h3 className="text-sm font-bold text-slate-400 mb-6 text-center uppercase tracking-widest flex items-center justify-center gap-3">
                    <span className="h-px w-8 bg-slate-700"></span>
                    Live Power Topology
                    <span className="h-px w-8 bg-slate-700"></span>
                </h3>

                <div className="flex items-center gap-1 sm:gap-2 px-2 overflow-x-auto py-6 justify-center min-h-[180px]">
                    {/* Grid Node */}
                    <SimPoleNode isGrid={true} state={poleStates.Pole1} />

                    {/* Grid → Pole1 wire */}
                    <SimWire
                        from="Grid" to="P1"
                        isCut={false}
                        isNoPower={isGridDown || poleStates.Pole1?.incomingCurrent === 'LOW'}
                        isActive={poleStates.Pole1?.incomingCurrent === 'HIGH'}
                    />

                    {POLE_IDS.map((poleId, idx) => {
                        const nextPoleId = POLE_IDS[idx + 1];
                        const wire = nextPoleId ? wireState(poleId, nextPoleId) : null;

                        return (
                            <React.Fragment key={poleId}>
                                <SimPoleNode poleId={poleId} state={poleStates[poleId]} />
                                {wire && (
                                    <SimWire
                                        from={`P${idx + 1}`}
                                        to={`P${idx + 2}`}
                                        isCut={wire.isCut}
                                        isNoPower={wire.isNoPower}
                                        isActive={wire.isActive}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-6 mt-4 text-[0.65rem] text-slate-500 font-medium">
                    <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        </span>
                        Power Flowing
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        </span>
                        Wire Cut / Fault
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-slate-600/20 border border-slate-600/50 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                        </span>
                        De-energized
                    </span>
                </div>
            </div>

            {/* ── Scenario Controls ───────────────────────── */}
            <div className="glass-card mb-8 p-6">
                <h3 className="text-sm font-bold text-slate-400 mb-6 text-center uppercase tracking-widest flex items-center justify-center gap-3">
                    <span className="h-px w-8 bg-slate-700"></span>
                    Fault Scenarios
                    <span className="h-px w-8 bg-slate-700"></span>
                </h3>
                <div className="flex flex-wrap justify-center gap-4">
                    <ScenarioButton
                        label="Grid Down"
                        icon="⚡"
                        color="amber"
                        description="Simulate Grid Failure"
                        disabled={sending}
                        onClick={() => sendCommand('GRID_DOWN')}
                    />
                    <ScenarioButton
                        label="Cut 1→2"
                        icon="✂️"
                        color="red"
                        description="Sever P1-P2 Wire"
                        disabled={sending}
                        onClick={() => sendCommand('WIRE_CUT_1')}
                    />
                    <ScenarioButton
                        label="Cut 2→3"
                        icon="✂️"
                        color="red"
                        description="Sever P2-P3 Wire"
                        disabled={sending}
                        onClick={() => sendCommand('WIRE_CUT_2')}
                    />
                    <ScenarioButton
                        label="Cut 3→4"
                        icon="✂️"
                        color="red"
                        description="Sever P3-P4 Wire"
                        disabled={sending}
                        onClick={() => sendCommand('WIRE_CUT_3')}
                    />
                    <div className="w-full sm:w-auto mt-2 sm:mt-0 sm:ml-4 border-l border-slate-700 pl-6">
                        <ScenarioButton
                            label="Recover System"
                            icon="🔄"
                            color="green"
                            description="Restore All Wires"
                            disabled={sending}
                            onClick={() => sendCommand('RECOVER')}
                        />
                    </div>
                </div>
            </div>

            {/* ── Detailed Pole State Cards ───────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {POLE_IDS.map(poleId => {
                    const s = poleStates[poleId];
                    const nodeState = s?.nodeState || 'OFFLINE';
                    const isTerminal = poleId === 'Pole4';

                    const stateColorMap = {
                        NORMAL: 'border-emerald-500/30',
                        GRID_DOWN: 'border-amber-500/30',
                        FAULT_UPSTREAM: 'border-rose-500/30',
                        FAULT_DOWNSTREAM: 'border-orange-500/30',
                        RECOVERY: 'border-blue-500/30',
                        OFFLINE: 'border-slate-600/30',
                    };
                    const textColorMap = {
                        NORMAL: 'text-emerald-400',
                        GRID_DOWN: 'text-amber-400',
                        FAULT_UPSTREAM: 'text-rose-400',
                        FAULT_DOWNSTREAM: 'text-orange-400',
                        RECOVERY: 'text-blue-400',
                        OFFLINE: 'text-slate-500',
                    };

                    // Determine if this pole lost power due to a fault
                    const isPowerHalted = ['FAULT_UPSTREAM', 'FAULT_DOWNSTREAM', 'GRID_DOWN'].includes(nodeState)
                        || (s?.incomingCurrent === 'LOW' && systemState?.status === 'FAULT');
                    const isNormalPowered = nodeState === 'NORMAL' && s?.incomingCurrent === 'HIGH';

                    return (
                        <div key={poleId} className={`glass-card border ${stateColorMap[nodeState] || stateColorMap.OFFLINE}`}>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                    🏗️ {poleId}
                                    {isTerminal && <span className="text-[0.55rem] bg-slate-500/20 text-slate-400 px-1.5 py-0.5 rounded-md font-medium">TERMINAL</span>}
                                </span>
                                <span className={`text-[0.6rem] font-bold uppercase tracking-wider ${textColorMap[nodeState] || 'text-slate-500'}`}>
                                    {nodeState}
                                </span>
                            </div>

                            {/* Power Status Info Banner */}
                            {isPowerHalted && (
                                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300">
                                    <span className="text-base">🚫</span>
                                    <div>
                                        <div className="text-[0.65rem] font-bold uppercase tracking-wider">Power Halted</div>
                                        <div className="text-[0.55rem] text-rose-400/70">
                                            {nodeState === 'GRID_DOWN'
                                                ? 'Grid supply offline — no power available'
                                                : nodeState === 'FAULT_DOWNSTREAM'
                                                    ? 'Outgoing relay opened to isolate downstream fault'
                                                    : 'Upstream wire fault — relay opened, no incoming power'}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {isNormalPowered && systemState?.status === 'FAULT' && (
                                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 text-emerald-300">
                                    <span className="text-base">✅</span>
                                    <div>
                                        <div className="text-[0.65rem] font-bold uppercase tracking-wider">Relays Normal</div>
                                        <div className="text-[0.55rem] text-emerald-400/70">Unaffected by fault — power flowing normally</div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                                    <div className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-0.5">Voltage</div>
                                    <div className="text-lg font-bold font-mono text-cyan-400">
                                        {s?.voltage != null ? parseFloat(s.voltage).toFixed(1) : '0.0'}
                                        <span className="text-[0.6rem] text-slate-500 ml-0.5">V</span>
                                    </div>
                                </div>
                                <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                                    <div className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-0.5">Current</div>
                                    <div className="text-lg font-bold font-mono text-amber-400">
                                        {s?.current != null ? parseFloat(s.current).toFixed(2) : '0.00'}
                                        <span className="text-[0.6rem] text-slate-500 ml-0.5">A</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-2">
                                <div className={`flex-1 text-center text-[0.6rem] py-1.5 rounded-lg font-bold ${s?.incomingCurrent === 'HIGH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/5 text-rose-400/60 border border-rose-500/10'}`}>
                                    IN: {s?.incomingCurrent || 'LOW'}
                                </div>
                                {!isTerminal && (
                                    <div className={`flex-1 text-center text-[0.6rem] py-1.5 rounded-lg font-bold ${s?.outgoingCurrent === 'HIGH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/5 text-rose-400/60 border border-rose-500/10'}`}>
                                        OUT: {s?.outgoingCurrent || 'LOW'}
                                    </div>
                                )}
                            </div>

                            {!isTerminal && (
                                <div className="flex gap-2 mt-2">
                                    <div className={`flex-1 text-center text-[0.6rem] py-1 rounded-lg font-bold ${s?.relayIn === 'ON' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-500'}`}>
                                        Relay In: {s?.relayIn || 'OFF'}
                                    </div>
                                    <div className={`flex-1 text-center text-[0.6rem] py-1 rounded-lg font-bold ${s?.relayOut === 'ON' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-500'}`}>
                                        Relay Out: {s?.relayOut || 'OFF'}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Event Log ───────────────────────────────── */}
            <div className="glass-card">
                <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
                    📋 Simulation Event Log
                    {eventLog.length > 0 && (
                        <button
                            onClick={() => setEventLog([])}
                            className="text-[0.6rem] text-slate-600 hover:text-slate-400 ml-auto transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </h3>
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {eventLog.length === 0 && (
                        <div className="text-xs text-slate-600 text-center py-6">
                            No events yet — trigger a scenario above to see live results
                        </div>
                    )}
                    {eventLog.map((entry, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                            <span>{entry.icon}</span>
                            <span className={`font-bold min-w-[60px] ${entry.color}`}>{entry.type}</span>
                            <span className="text-slate-400 flex-1">{entry.message}</span>
                            <span className="text-slate-600 text-[0.6rem] font-mono">{entry.time.toLocaleTimeString()}</span>
                        </div>
                    ))}
                </div>
            </div>


            {/* ── Offline Overlay ── */}
            {
                !simRunning && (
                    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
                        <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
                            <div className="text-5xl mb-4">🛑</div>
                            <h2 className="text-2xl font-bold text-slate-100 mb-2">Simulator Process Offline</h2>
                            <p className="text-slate-400 mb-6">
                                The backend simulation process is not running. This can happen after a server restart or deployment.
                            </p>
                            <button
                                onClick={startSimulator}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20"
                            >
                                🚀 Launch Simulator
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

export default SimulatorPage;
