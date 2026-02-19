/*
 * ============================================================
 *  PoleCard Component (Tailwind CSS) — with Coordination Data
 * ============================================================
 *  Displays a single utility pole's live data with:
 *    - Pole ID, status badge, voltage, current, power, timestamp
 *    - Relay states (incoming/outgoing ON/OFF)
 *    - Current flow indicators (incoming/outgoing HIGH/LOW)
 *    - Node state from coordination engine
 *    - Smart alert messages for specific anomalies
 * ============================================================
 */

import React from 'react';

/**
 * Detects the type of anomaly based on voltage/current values
 * and coordination state data.
 */
function detectAnomaly(data, coordState) {
    if (!data && !coordState) return null;

    // Use coordination state if available
    const nodeState = coordState?.nodeState;
    if (nodeState === 'GRID_DOWN') {
        return { icon: '⚠️', message: 'Grid power supply is offline — all poles de-energized', severity: 'critical' };
    }
    if (nodeState === 'FAULT_UPSTREAM') {
        return { icon: '🚫', message: 'Power halted — upstream wire fault detected, relay opened', severity: 'critical' };
    }
    if (nodeState === 'FAULT_DOWNSTREAM') {
        return { icon: '⚡', message: 'Downstream fault — outgoing relay opened to isolate fault', severity: 'danger' };
    }
    if (nodeState === 'RECOVERY') {
        return { icon: '🔄', message: 'Recovery in progress — verifying line stability before re-energizing', severity: 'warning' };
    }

    if (!data) return null;

    const v = data.voltage;
    const c = data.current;

    // Wire cut / Power line down
    if (v <= 5 && c <= 0.5) {
        if (nodeState === 'NORMAL') {
            return { icon: '⚠️', message: 'No power detected — waiting for upstream supply to resume', severity: 'warning' };
        }
        return { icon: '🔌', message: 'Power line cut — zero voltage and current detected', severity: 'critical' };
    }

    // Short circuit
    if (v <= 5 && c > 0.5) {
        return { icon: '💥', message: `Short circuit — voltage dropped to ${v.toFixed(1)}V with ${c.toFixed(2)}A still flowing`, severity: 'critical' };
    }

    // Overvoltage
    if (v > 260) {
        return { icon: '⚡', message: `Overvoltage alert — ${v.toFixed(1)}V exceeds safe 260V limit`, severity: 'danger' };
    }

    // Overcurrent
    if (c > 15) {
        return { icon: '🔥', message: `Overcurrent alert — ${c.toFixed(2)}A exceeds safe 15A limit`, severity: 'danger' };
    }

    // Voltage sag
    if (v > 5 && v < 180) {
        return { icon: '📉', message: `Voltage sag — ${v.toFixed(1)}V is below minimum 180V threshold`, severity: 'warning' };
    }

    return null;
}

function PoleCard({ poleId, data, coordState }) {
    const isOffline = (!data && !coordState) || data?.status === 'offline';
    const nodeState = coordState?.nodeState || (data?.status === 'alert' ? 'FAULT_UPSTREAM' : data?.status === 'normal' ? 'NORMAL' : 'OFFLINE');
    const isAlert = nodeState !== 'NORMAL' && nodeState !== 'OFFLINE' && nodeState !== 'UNKNOWN';
    const isTerminal = poleId === 'Pole4';

    const voltage = data?.voltage != null ? parseFloat(data.voltage).toFixed(1) : '--';
    const current = data?.current != null ? parseFloat(data.current).toFixed(2) : '--';
    const power = data?.voltage != null && data?.current != null
        ? (data.voltage * data.current).toFixed(1)
        : '--';

    const voltageAlert = (data?.voltage != null && data.voltage > 260) || (data?.voltage != null && data.voltage <= 5);
    const currentAlert = data?.current > 15;

    // Detect specific anomaly
    const anomaly = detectAnomaly(data, coordState);

    // Build card class
    const cardClass = [
        'glass-card',
        (isAlert || anomaly) && 'glass-card--alert',
        isOffline && 'glass-card--offline',
    ].filter(Boolean).join(' ');

    const statusType = (isAlert || anomaly) ? 'alert' : isOffline ? 'offline' : 'normal';
    const statusLabel = (isAlert || anomaly) ? '⚠ Alert' : isOffline ? '○ Offline' : '● Normal';

    // Severity colors for alert banner
    const severityColors = {
        critical: 'bg-rose-500/20 border-rose-500/50 text-rose-300',
        danger: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
        warning: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    };

    // Relay/current indicator helpers
    const relayIn = coordState?.relayIn || 'OFF';
    const relayOut = coordState?.relayOut || (isTerminal ? 'N/A' : 'OFF');
    const inCurrent = coordState?.incomingCurrent || 'UNKNOWN';
    const outCurrent = coordState?.outgoingCurrent || (isTerminal ? 'N/A' : 'UNKNOWN');

    // Get short code labels based on Pole ID
    const getLabels = (pid) => {
        if (pid === 'Pole1') return { rIn: 'PAR1', rOut: 'PAR2', cIn: 'PAC1', cOut: 'PAC2', vIn: 'PAV1', vOut: 'PAV2' };
        if (pid === 'Pole2') return { rIn: 'PBR1', rOut: 'PBR2', cIn: 'PBC1', cOut: 'PBC2', vIn: 'PBV1', vOut: 'PBV2' };
        if (pid === 'Pole3') return { rIn: 'PCR1', rOut: 'PCR2', cIn: 'PCC1', cOut: 'PCC2', vIn: 'PCV1', vOut: 'PCV2' };
        return { rIn: 'PDR', rOut: '', cIn: 'PDC', cOut: '', vIn: 'PDV', vOut: '' };
    };
    const labels = getLabels(poleId);

    return (
        <div className={cardClass}>
            {/* Header */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/[0.03]">
                <div className="flex items-center gap-2 text-base font-bold text-slate-200">
                    <span className="text-lg opacity-60">⚡</span>
                    {poleId}
                </div>
                <span className={`badge badge--${statusType}`}>
                    {statusLabel}
                </span>
            </div>

            {/* State & Alert */}
            <div className="min-h-[20px] mb-3">
                {coordState && (
                    <div className={`text-[0.6rem] font-bold uppercase tracking-widest flex items-center gap-2 ${nodeState === 'NORMAL' ? 'text-emerald-500' :
                        nodeState === 'GRID_DOWN' ? 'text-amber-400' :
                            nodeState === 'RECOVERY' ? 'text-blue-400' :
                                'text-rose-400'
                        }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {nodeState}
                    </div>
                )}
            </div>

            {/* Alert Message Banner */}
            {anomaly && (
                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border mb-4 text-xs font-medium leading-relaxed ${severityColors[anomaly.severity]}`}>
                    <span className="text-sm mt-0.5">{anomaly.icon}</span>
                    <span>{anomaly.message}</span>
                </div>
            )}

            {/* Relay Control Status */}
            {coordState && (
                <div className="mb-4 space-y-2">
                    {/* Pole 4 specific: Show PDV/PDC status instead of Relay */}
                    {isTerminal ? (
                        <>
                            <div className={`flex items-center justify-between text-[0.7rem] px-3 py-2 rounded-lg border bg-opacity-20 ${!voltageAlert ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/20'}`}>
                                <div className="flex items-center gap-2">
                                    <span className={`w-1 h-1 rounded-full ${!voltageAlert ? 'bg-emerald-400' : 'bg-rose-500'}`}></span>
                                    <span className="text-slate-400 font-medium">{labels.vIn} Status</span>
                                </div>
                                <span className={`font-bold tracking-wide ${!voltageAlert ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {!voltageAlert ? 'NORMAL' : 'ALERT'}
                                </span>
                            </div>
                            <div className={`flex items-center justify-between text-[0.7rem] px-3 py-2 rounded-lg border bg-opacity-20 ${!currentAlert ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/20'}`}>
                                <div className="flex items-center gap-2">
                                    <span className={`w-1 h-1 rounded-full ${!currentAlert ? 'bg-emerald-400' : 'bg-rose-500'}`}></span>
                                    <span className="text-slate-400 font-medium">{labels.cIn} Status</span>
                                </div>
                                <span className={`font-bold tracking-wide ${!currentAlert ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {!currentAlert ? 'NORMAL' : 'ALERT'}
                                </span>
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <div className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border bg-opacity-20 ${relayIn === 'ON' ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-slate-500/5 border-slate-500/10'}`}>
                                <div className="text-[0.6rem] text-slate-500 font-bold uppercase">{labels.rIn}</div>
                                <span className={`text-xs font-bold tracking-wide ${relayIn === 'ON' ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    {relayIn === 'ON' ? 'OPEN' : 'CLOSED'}
                                </span>
                            </div>

                            {!isTerminal && (
                                <div className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border bg-opacity-20 ${relayOut === 'ON' ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-slate-500/5 border-slate-500/10'}`}>
                                    <div className="text-[0.6rem] text-slate-500 font-bold uppercase">{labels.rOut}</div>
                                    <span className={`text-xs font-bold tracking-wide ${relayOut === 'ON' ? 'text-emerald-400' : 'text-slate-400'}`}>
                                        {relayOut === 'ON' ? 'OPEN' : 'CLOSED'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="metric-tile">
                    <div className="text-[0.6rem] text-slate-500 font-semibold uppercase tracking-wider mb-1">Voltage</div>
                    <div className={`text-xl font-bold font-mono leading-none ${voltageAlert ? 'text-rose-400' : 'text-slate-200'}`}>
                        {voltage}<span className="text-xs font-normal text-slate-600 ml-0.5">V</span>
                    </div>
                </div>
                <div className="metric-tile">
                    <div className="text-[0.6rem] text-slate-500 font-semibold uppercase tracking-wider mb-1">Current</div>
                    <div className={`text-xl font-bold font-mono leading-none ${currentAlert ? 'text-rose-400' : 'text-slate-200'}`}>
                        {current}<span className="text-xs font-normal text-slate-600 ml-0.5">A</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-end mt-auto pt-2 border-t border-white/[0.03]">
                <div className="text-[0.6rem] text-slate-600 font-mono">
                    ID: {labels.vIn}
                </div>
                <div className="text-[0.6rem] text-slate-500 font-mono">
                    {data?.receivedAt
                        ? new Date(data.receivedAt).toLocaleTimeString([], { hour12: false })
                        : 'WAITING'}
                </div>
            </div>
        </div>
    );
}

export default PoleCard;
