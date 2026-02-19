/*
 * ============================================================
 *  HardwareStatus — Arduino hardware status sidebar panel
 * ============================================================
 *  Shows REAL connection status for each Arduino pole.
 *  If no data received, shows as "No Device".
 * ============================================================
 */

import React from 'react';

const POLE_CONFIGS = [
    { id: 'Pole1', label: 'Pole A', prefix: 'PA', hasOutgoing: true },
    { id: 'Pole2', label: 'Pole B', prefix: 'PB', hasOutgoing: true },
    { id: 'Pole3', label: 'Pole C', prefix: 'PC', hasOutgoing: true },
    { id: 'Pole4', label: 'Pole D', prefix: 'PD', hasOutgoing: false },
];

function HardwareStatus({ polesData, poleCoordStates }) {
    return (
        <div className="glass-card">
            <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <span className="text-lg">🔧</span>
                Arduino Hardware Status
            </h3>

            <div className="space-y-3">
                {POLE_CONFIGS.map(({ id, label, prefix, hasOutgoing }) => {
                    const data = polesData?.[id];
                    const coord = poleCoordStates?.[id];

                    // Only consider online if we have ACTUAL data with a recent timestamp
                    const hasData = data && data.timestamp;
                    const hasCoord = coord && coord.nodeState && coord.nodeState !== 'OFFLINE';
                    const isOnline = hasData || hasCoord;

                    if (!isOnline) {
                        // ─── No device connected ────────────
                        return (
                            <div key={id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-slate-600" />
                                        <span className="text-xs font-bold text-slate-200">{id}</span>
                                        <span className="text-[0.6rem] text-slate-500">({label})</span>
                                    </div>
                                    <span className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-500">
                                        NO DEVICE
                                    </span>
                                </div>
                                <p className="text-[0.55rem] text-slate-600 italic px-0.5">
                                    Arduino not connected
                                </p>
                            </div>
                        );
                    }

                    // ─── Device connected — show real data ────
                    const nodeState = coord?.nodeState || 'UNKNOWN';
                    const voltage = data?.voltage ?? coord?.voltage ?? null;
                    const current = data?.current ?? coord?.current ?? null;
                    const inCurrent = coord?.incomingCurrent || 'LOW';
                    const outCurrent = coord?.outgoingCurrent || 'LOW';
                    const relayIn = coord?.relayIn || 'OFF';
                    const relayOut = coord?.relayOut || 'OFF';
                    const vHigh = voltage != null ? parseFloat(voltage) > 5 : inCurrent === 'HIGH';

                    const stateColor = {
                        NORMAL: 'text-emerald-400',
                        GRID_DOWN: 'text-amber-400',
                        FAULT_UPSTREAM: 'text-rose-400',
                        FAULT_DOWNSTREAM: 'text-orange-400',
                        RECOVERY: 'text-blue-400',
                    }[nodeState] || 'text-slate-500';

                    return (
                        <div key={id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                                    <span className="text-xs font-bold text-slate-200">{id}</span>
                                    <span className="text-[0.6rem] text-slate-500">({label})</span>
                                </div>
                                <span className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                                    ONLINE
                                </span>
                            </div>

                            {/* State */}
                            <div className="flex items-center justify-between text-[0.6rem] mb-2 px-0.5">
                                <span className="text-slate-500">State</span>
                                <span className={`font-bold ${stateColor}`}>{nodeState}</span>
                            </div>

                            {/* Sensor Grid */}
                            <div className={`grid ${hasOutgoing ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
                                <div className="bg-white/[0.02] rounded-lg px-2 py-1.5">
                                    <div className="text-[0.5rem] text-slate-500 font-semibold uppercase tracking-wider mb-1">
                                        {hasOutgoing ? 'Incoming' : 'Sensors'}
                                    </div>
                                    <div className="space-y-0.5 text-[0.6rem]">
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400">{hasOutgoing ? `${prefix}V1` : `${prefix}V`}</span>
                                            <span className={`font-bold ${vHigh ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                {vHigh ? 'HIGH' : 'LOW'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400">{hasOutgoing ? `${prefix}C1` : `${prefix}C`}</span>
                                            <span className={`font-bold ${inCurrent === 'HIGH' ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                {inCurrent}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {hasOutgoing && (
                                    <div className="bg-white/[0.02] rounded-lg px-2 py-1.5">
                                        <div className="text-[0.5rem] text-slate-500 font-semibold uppercase tracking-wider mb-1">Outgoing</div>
                                        <div className="space-y-0.5 text-[0.6rem]">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">{prefix}V2</span>
                                                <span className={`font-bold ${vHigh && outCurrent === 'HIGH' ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    {vHigh && outCurrent === 'HIGH' ? 'HIGH' : 'LOW'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">{prefix}C2</span>
                                                <span className={`font-bold ${outCurrent === 'HIGH' ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    {outCurrent}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Relay status */}
                            <div className="flex gap-1.5 mt-1.5">
                                <div className={`flex-1 text-center text-[0.55rem] font-bold py-1 rounded-md ${relayIn === 'ON'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}>
                                    {hasOutgoing ? `${prefix}R1` : 'Relay'}: {relayIn}
                                </div>
                                {hasOutgoing && (
                                    <div className={`flex-1 text-center text-[0.55rem] font-bold py-1 rounded-md ${relayOut === 'ON'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                        }`}>
                                        {prefix}R2: {relayOut}
                                    </div>
                                )}
                            </div>

                            {/* Voltage / Current readout */}
                            {(voltage != null || current != null) && (
                                <div className="flex gap-3 mt-2 text-[0.55rem] text-slate-500 px-0.5">
                                    {voltage != null && <span>⚡ {parseFloat(voltage).toFixed(1)}V</span>}
                                    {current != null && <span>🔌 {parseFloat(current).toFixed(2)}A</span>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="text-[0.55rem] text-slate-600 text-center mt-3">
                Live via WebSocket
            </div>
        </div>
    );
}

export default HardwareStatus;
