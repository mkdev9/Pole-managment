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
            <div className="flex flex-col items-center gap-1 min-w-[56px]">
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-lg font-bold border-2 transition-all duration-300 ${isDown
                    ? 'bg-red-500/20 border-red-500/50'
                    : 'bg-emerald-500/20 border-emerald-500/50'
                    }`}>
                    🔌
                </div>
                <span className="text-[0.65rem] font-bold text-slate-300 uppercase">Grid</span>
                <span className={`text-[0.5rem] font-bold px-1.5 py-0.5 rounded-full ${isDown ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {isDown ? '⛔ DOWN' : '● LIVE'}
                </span>
            </div>
        );
    }

    const nodeState = state?.nodeState || 'OFFLINE';

    const stateColors = {
        NORMAL: 'border-emerald-500/50 bg-emerald-500/10',
        GRID_DOWN: 'border-amber-500/50 bg-amber-500/10',
        FAULT_UPSTREAM: 'border-rose-500/50 bg-rose-500/10',
        FAULT_DOWNSTREAM: 'border-orange-500/50 bg-orange-500/10',
        RECOVERY: 'border-blue-500/50 bg-blue-500/10',
        OFFLINE: 'border-slate-600/50 bg-slate-600/10',
        WAITING: 'border-slate-600/50 bg-slate-600/10',
        SIM_IDLE: 'border-violet-600/50 bg-violet-600/10',
        UNKNOWN: 'border-slate-600/50 bg-slate-600/10',
    };

    const stateTextColors = {
        NORMAL: 'text-emerald-400',
        GRID_DOWN: 'text-amber-400',
        FAULT_UPSTREAM: 'text-rose-400',
        FAULT_DOWNSTREAM: 'text-orange-400',
        RECOVERY: 'text-blue-400',
        OFFLINE: 'text-slate-500',
        UNKNOWN: 'text-slate-500',
    };

    return (
        <div className="flex flex-col items-center gap-1 min-w-[56px]">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-lg font-bold border-2 transition-all duration-300 ${stateColors[nodeState] || stateColors.OFFLINE}`}>
                🏗️
            </div>
            <span className="text-[0.65rem] font-bold text-slate-300">{poleId}</span>
            <span className={`text-[0.5rem] font-bold ${stateTextColors[nodeState] || 'text-slate-500'}`}>
                {nodeState}
            </span>
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

    const Dot = ({ isHigh }) => (
        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isHigh ? 'bg-emerald-400' : 'bg-slate-600'}`} />
    );

    const Row = ({ label, isHigh }) => (
        <div className="flex items-center justify-between py-0.5">
            <span className="text-slate-400 font-medium">{label}</span>
            <span className="flex items-center gap-1">
                <Dot isHigh={isHigh} />
                <span className={`font-bold ${isHigh ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {isHigh ? 'HIGH' : 'LOW'}
                </span>
            </span>
        </div>
    );

    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-2.5 hover:bg-white/[0.04] transition-colors">
            <div className="text-[0.65rem] font-bold text-slate-300 mb-2 flex items-center justify-between border-b border-white/[0.05] pb-1.5">
                <span>🏗️ {poleId}</span>
                {isTerminal && <span className="text-[0.5rem] bg-slate-500/20 text-slate-400 px-1.5 py-0.5 rounded-md">TERMINAL</span>}
            </div>
            <div className="space-y-0.5 text-[0.6rem]">
                <Row label={codes.vIn} isHigh={vHigh} />
                <Row label={codes.cIn} isHigh={inCurrent === 'HIGH'} />
                {!isTerminal && (
                    <>
                        <Row label={codes.vOut} isHigh={vHigh && outCurrent === 'HIGH'} />
                        <Row label={codes.cOut} isHigh={outCurrent === 'HIGH'} />
                        <div className="border-t border-white/[0.05] my-1" />
                        <Row label={codes.rIn} isHigh={state?.relayIn === 'ON'} />
                        <Row label={codes.rOut} isHigh={state?.relayOut === 'ON'} />
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
        NORMAL: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400', icon: '✅', label: 'All poles energized — system operating normally' },
        FAULT: { bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-400', icon: '🚨', label: `Wire fault detected between ${faultLocation ? faultLocation.replace('-', ' → ') : 'poles'} — relays isolating` },
        GRID_DOWN: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400', icon: '⚠️', label: 'Grid power supply offline — all poles de-energized' },
        WAITING: { bg: 'bg-slate-500/10 border-slate-500/30', text: 'text-slate-400', icon: '⏳', label: 'Waiting for hardware connection...' },
        SIM_IDLE: { bg: 'bg-violet-500/10 border-violet-500/30', text: 'text-violet-400', icon: '🎮', label: 'Simulator Ready — Press Start to begin' },
    };
    const banner = bannerConfig[status] || bannerConfig.NORMAL;

    return (
        <div className="glass-card mb-8">
            {/* System State Banner */}
            <div className={`flex items-center justify-center gap-3 px-4 py-3 rounded-xl border mb-5 ${banner.bg}`}>
                <span className="text-xl">{banner.icon}</span>
                <span className={`text-sm font-bold uppercase tracking-wider ${banner.text}`}>
                    {banner.label}
                </span>
                {status === 'FAULT' && (
                    <span className="relative flex h-3 w-3 ml-1">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                        <span className="inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                    </span>
                )}
            </div>

            {/* ── Topology Line — clean, compact ──────── */}
            <div className="flex items-center gap-2 sm:gap-3 px-2 overflow-x-auto py-2 justify-center">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 px-1">
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
            <div className="flex justify-center gap-4 mt-4 text-[0.6rem] text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-1 rounded-full bg-emerald-500 inline-block"></span> Healthy
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-1 rounded-full bg-rose-500 inline-block"></span> Fault
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-1 rounded-full bg-slate-600 inline-block"></span> Isolated
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-1 rounded-full bg-amber-500 inline-block"></span> No Power
                </span>
            </div>
        </div>
    );
}

export default TopologyView;
