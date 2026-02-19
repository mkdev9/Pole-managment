/*
 * ============================================================
 *  TopologyView — Visual power line topology
 * ============================================================
 *  Displays: Grid → Pole1 → Pole2 → Pole3 → Pole4
 *  Wire segments change color based on fault status.
 *  Sensor & relay details shown in a clean grid below.
 * ============================================================
 */

import React from 'react';

const POLE_ORDER = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];

// ─── Wire segment between two nodes ─────────────────────────
function WireSegment({ from, to, status, isFaulted, isIsolated }) {
    let color = 'bg-emerald-500';
    let glowClass = 'shadow-emerald-500/30';
    let label = null;

    if (isFaulted) {
        color = 'bg-rose-500';
        glowClass = 'shadow-rose-500/50';
        label = '⚡ Wire Cut';
    } else if (isIsolated) {
        color = 'bg-slate-600';
        glowClass = '';
        label = '⛔ Power Halted';
    } else if (status === 'GRID_DOWN') {
        color = 'bg-amber-500';
        glowClass = 'shadow-amber-500/30';
        label = '⚠ Grid Offline';
    }

    return (
        <div className="flex flex-col items-center flex-1 min-w-[40px]">
            <div className={`h-1.5 w-full rounded-full ${color} shadow-lg ${glowClass} transition-all duration-500 relative`}>
                {isFaulted && (
                    <div className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-40" />
                )}
            </div>
            {label && (
                <span className={`text-[0.55rem] font-bold mt-1 uppercase tracking-wider ${isFaulted ? 'text-rose-400' : isIsolated ? 'text-slate-400' : 'text-amber-400'}`}>
                    {label}
                </span>
            )}
        </div>
    );
}

// ─── Compact pole node for topology line ────────────────────
function PoleNode({ poleId, state, isGrid }) {
    if (isGrid) {
        const isDown = state?.status === 'GRID_DOWN';
        return (
            <div className="flex flex-col items-center gap-2 min-w-[60px]">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg transition-all duration-300 ${isDown
                    ? 'bg-rose-500/10 border border-rose-500/30 text-rose-500 shadow-rose-900/20'
                    : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-emerald-900/20'
                    }`}>
                    ⚡
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Grid</span>
                    <span className={`text-[0.55rem] font-bold px-2 py-0.5 rounded-full mt-1 ${isDown ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {isDown ? 'OFFLINE' : 'ONLINE'}
                    </span>
                </div>
            </div>
        );
    }

    const nodeState = state?.nodeState || 'OFFLINE';

    const stateStyles = {
        NORMAL: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
        GRID_DOWN: 'border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
        FAULT_UPSTREAM: 'border-rose-500/40 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
        FAULT_DOWNSTREAM: 'border-orange-500/40 bg-orange-500/10 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
        RECOVERY: 'border-blue-500/40 bg-blue-500/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
        OFFLINE: 'border-slate-600/40 bg-slate-600/10 text-slate-500',
        WAITING: 'border-slate-600/40 bg-slate-600/10 text-slate-500',
        SIM_IDLE: 'border-violet-500/40 bg-violet-500/10 text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.15)]',
        SIM_NORMAL: 'border-violet-500/40 bg-violet-500/10 text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.15)]',
        UNKNOWN: 'border-slate-600/40 bg-slate-600/10 text-slate-500',
    };

    return (
        <div className="flex flex-col items-center gap-2 min-w-[60px]">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold border transition-all duration-300 ${stateStyles[nodeState] || stateStyles.OFFLINE}`}>
                🏗️
            </div>
            <div className="flex flex-col items-center">
                <span className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">{poleId}</span>
                <span className={`text-[0.55rem] font-bold mt-0.5 ${nodeState.includes('FAULT') ? 'text-rose-400' : 'text-slate-500'}`}>
                    {nodeState.replace('_', ' ')}
                </span>
            </div>
        </div>
    );
}

// ─── Sensor detail card shown below topology ────────────────
function SensorDetailCard({ poleId, state, sensorData }) {
    const isTerminal = poleId === 'Pole4';
    const voltage = sensorData?.voltage != null ? parseFloat(sensorData.voltage) : (state?.voltage != null ? parseFloat(state.voltage) : null);
    const inCurrent = state?.incomingCurrent || 'LOW';
    const outCurrent = state?.outgoingCurrent || 'LOW';
    const vHigh = voltage != null ? voltage > 5 : inCurrent === 'HIGH';

    const sensorCodes = {
        Pole1: { vIn: 'PAV1', cIn: 'PAC1', vOut: 'PAV2', cOut: 'PAC2', rIn: 'PAR1', rOut: 'PAR2' },
        Pole2: { vIn: 'PBV1', cIn: 'PBC1', vOut: 'PBV2', cOut: 'PBC2', rIn: 'PBR1', rOut: 'PBR2' },
        Pole3: { vIn: 'PCV1', cIn: 'PCC1', vOut: 'PCV2', cOut: 'PCC2', rIn: 'PCR1', rOut: 'PCR2' },
        Pole4: { vIn: 'PDV', cIn: 'PDC' },
    };
    const codes = sensorCodes[poleId];

    const Dot = ({ isActive, color }) => (
        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? color : 'bg-slate-700'}`} />
    );

    const Row = ({ label, isActive, activeColor = 'text-emerald-400', activeDot = 'bg-emerald-400' }) => (
        <div className="flex items-center justify-between py-1">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className="flex items-center gap-1.5">
                <Dot isActive={isActive} color={activeDot} />
                <span className={`font-bold ${isActive ? activeColor : 'text-slate-600'}`}>
                    {isActive ? 'HIGH' : 'LOW'}
                </span>
            </span>
        </div>
    );

    // Relay Row specifically
    const RelayRow = ({ label, isOpen }) => (
        <div className="flex items-center justify-between py-1">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className="flex items-center gap-1.5">
                <Dot isActive={isOpen} color="bg-blue-400" />
                <span className={`font-bold ${isOpen ? 'text-blue-400' : 'text-slate-600'}`}>
                    {isOpen ? 'OPEN' : 'CLOSED'}
                </span>
            </span>
        </div>
    );

    return (
        <div className="metric-tile hover:bg-white/[0.03] transition-colors p-3">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.04]">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm">🏗️</span>
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{poleId}</span>
                </div>
                {isTerminal && <span className="text-[0.5rem] bg-slate-700/30 text-slate-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Terminal</span>}
            </div>

            <div className="space-y-0.5 text-[0.65rem]">
                <Row label={codes.vIn} isActive={vHigh} />
                <Row label={codes.cIn} isActive={inCurrent === 'HIGH'} />

                {!isTerminal && (
                    <>
                        <Row label={codes.vOut} isActive={vHigh && outCurrent === 'HIGH'} />
                        <Row label={codes.cOut} isActive={outCurrent === 'HIGH'} />
                        <div className="my-2 border-t border-dashed border-white/[0.05]"></div>
                        <RelayRow label={codes.rIn} isOpen={state?.relayIn === 'ON'} />
                        <RelayRow label={codes.rOut} isOpen={state?.relayOut === 'ON'} />
                    </>
                )}
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
//  MAIN TOPOLOGY VIEW
// ════════════════════════════════════════════════════════════
function TopologyView({ systemState, poleCoordStates, polesData }) {
    const status = systemState?.status || 'NORMAL';
    const isolatedSegments = systemState?.isolatedSegments || [];
    const faultLocation = systemState?.faultLocation;

    const bannerConfig = {
        NORMAL: { bg: 'bg-emerald-500/[0.08] border-emerald-500/20', text: 'text-emerald-400', icon: '✅', label: 'All poles energized — system operating normally' },
        FAULT: { bg: 'bg-rose-500/[0.08] border-rose-500/20', text: 'text-rose-400', icon: '🚨', label: `Wire fault detected between ${faultLocation ? faultLocation.replace('-', ' → ') : 'poles'} — relays isolating` },
        GRID_DOWN: { bg: 'bg-amber-500/[0.08] border-amber-500/20', text: 'text-amber-400', icon: '⚠️', label: 'Grid power supply offline — all poles de-energized' },
        WAITING: { bg: 'bg-slate-500/[0.08] border-slate-500/20', text: 'text-slate-400', icon: '⏳', label: 'Waiting for hardware connection...' },
        SIM_IDLE: { bg: 'bg-violet-500/[0.08] border-violet-500/20', text: 'text-violet-400', icon: '🎮', label: 'Simulator Ready — Press Start to begin' },
        SIM_NORMAL: { bg: 'bg-violet-500/[0.08] border-violet-500/20', text: 'text-violet-400', icon: '🎮', label: 'Power line simulation running nominal' },
    };
    const banner = bannerConfig[status] || bannerConfig.NORMAL;

    return (
        <div className="glass-card mb-8">
            {/* System State Banner */}
            <div className={`flex items-center justify-center gap-3 px-6 py-4 rounded-xl border mb-8 ${banner.bg}`}>
                <span className="text-xl">{banner.icon}</span>
                <span className={`text-sm font-bold uppercase tracking-widest ${banner.text}`}>
                    {banner.label}
                </span>
                {status === 'FAULT' && (
                    <span className="relative flex h-3 w-3 ml-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                        <span className="inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                    </span>
                )}
            </div>

            {/* ── Topology Line — clean, compact ──────── */}
            <div className="flex items-start gap-0 sm:gap-2 px-4 overflow-x-auto py-4 justify-center min-h-[140px]">
                <PoleNode isGrid={true} state={systemState} />

                <WireSegment
                    from="Grid" to="Pole1"
                    status={status}
                    isFaulted={false}
                    isIsolated={status === 'GRID_DOWN'}
                />

                {POLE_ORDER.map((poleId, idx) => {
                    const pState = poleCoordStates?.[poleId] || systemState?.poles?.[poleId];
                    const nextPoleId = POLE_ORDER[idx + 1];
                    const segment = nextPoleId ? `${poleId}-${nextPoleId}` : null;

                    return (
                        <React.Fragment key={poleId}>
                            <PoleNode poleId={poleId} state={pState} />
                            {segment && (
                                <WireSegment
                                    from={poleId} to={nextPoleId}
                                    status={status}
                                    isFaulted={faultLocation === segment}
                                    isIsolated={isolatedSegments.includes(segment)}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* ── Sensor & Relay Detail Grid ──────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                {POLE_ORDER.map(poleId => {
                    const pState = poleCoordStates?.[poleId] || systemState?.poles?.[poleId];
                    return (
                        <SensorDetailCard
                            key={poleId}
                            poleId={poleId}
                            state={pState}
                            sensorData={polesData?.[poleId]}
                        />
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-6 mt-6 pb-2 text-[0.6rem] text-slate-500 uppercase tracking-widest font-bold">
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow shadow-emerald-500/50"></span> Healthy
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shadow shadow-rose-500/50"></span> Fault
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-600"></span> Isolated
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shadow shadow-amber-500/50"></span> Grid Off
                </span>
            </div>
        </div>
    );
}

export default TopologyView;
