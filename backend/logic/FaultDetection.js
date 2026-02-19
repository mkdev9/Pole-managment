/*
 * ============================================================
 *  Fault Detection Logic
 * ============================================================
 *  Shared pure logic for detecting faults based on pole states.
 *  Used by both RealSystem and SimSystem.
 * ============================================================
 */

const POLE_ORDER = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];
const RECOVERY_STABLE_MS = 3000;

/**
 * Run the fault detection engine on a given context.
 * @param {Object} ctx - The system context (real or sim) containing poleStates and systemState.
 * @param {Function} queueCommand - Callback to queue a command (poleId, command).
 * @param {Object} io - Socket.IO instance for broadcasting (optional).
 * @returns {Boolean} - True if state changed and needs saving/broadcasting.
 */
function runFaultEngine(ctx, queueCommand, io) {
    const ts = new Date().toISOString();
    const { poleStates, systemState, events, dbPrefix, type } = ctx;
    let stateChanged = false;

    // ── Check Grid status (Pole1 incoming) ─────────────────
    const p1 = poleStates.Pole1;
    if (p1 && p1.incomingCurrent === 'LOW') {
        if (systemState.status !== 'GRID_DOWN') {
            systemState.status = 'GRID_DOWN';
            systemState.faultType = 'GRID_DOWN';
            systemState.faultLocation = 'Grid';
            systemState.lastFaultTime = ts;
            systemState.recoveryStartTime = null;
            stateChanged = true;

            console.log(`🔴 [${type}] GRID_DOWN detected by Pole1`);
            if (io) {
                io.emit(events.gridDown, { message: 'Grid shutdown detected', timestamp: ts });
            }
        }
        return stateChanged;
    }

    // ── Grid recovery check ────────────────────────────────
    if (p1 && p1.incomingCurrent === 'HIGH' && systemState.status === 'GRID_DOWN') {
        systemState.status = 'NORMAL';
        systemState.faultType = null;
        systemState.faultLocation = null;
        systemState.lastRecoveryTime = ts;
        systemState.isolatedSegments = [];
        stateChanged = true;

        console.log(`🟢 [${type}] Grid restored`);
        if (io) {
            io.emit(events.normal, { message: 'Grid restored', timestamp: ts });
        }
        return stateChanged;
    }

    // ── Check each downstream pole for fault mismatches ────
    for (let i = 1; i < POLE_ORDER.length; i++) {
        const currentPoleId = POLE_ORDER[i];
        const upstreamPoleId = POLE_ORDER[i - 1];
        const currentState = poleStates[currentPoleId];
        const upstreamState = poleStates[upstreamPoleId];

        if (!currentState || !upstreamState) continue;

        const faultSegment = `${upstreamPoleId}-${currentPoleId}`;

        // FAULT: Downstream incoming LOW but upstream outgoing HIGH
        if (
            currentState.incomingCurrent === 'LOW' &&
            upstreamState.outgoingCurrent === 'HIGH' &&
            !systemState.isolatedSegments.includes(faultSegment)
        ) {
            systemState.status = 'FAULT';
            systemState.faultType = 'WIRE_CUT';
            systemState.faultLocation = faultSegment;
            systemState.lastFaultTime = ts;
            systemState.recoveryStartTime = null;
            systemState.isolatedSegments.push(faultSegment);
            stateChanged = true;

            // Trigger isolation command
            queueCommand(upstreamPoleId, {
                action: 'DISABLE_OUTGOING_RELAY',
                reason: `Fault detected between ${upstreamPoleId} and ${currentPoleId}`,
            });

            console.log(`🔴 [${type}] FAULT detected: ${faultSegment}`);
            if (io) {
                io.emit(events.fault, {
                    segment: faultSegment,
                    upstream: upstreamPoleId,
                    downstream: currentPoleId,
                    message: `Line fault between ${upstreamPoleId} and ${currentPoleId}`,
                    timestamp: ts,
                });
            }
        }

        // RECOVERY
        if (
            currentState.incomingCurrent === 'HIGH' &&
            upstreamState.outgoingCurrent === 'HIGH' &&
            systemState.isolatedSegments.includes(faultSegment)
        ) {
            if (!systemState.recoveryStartTime) {
                systemState.recoveryStartTime = Date.now();
            }

            const stableFor = Date.now() - systemState.recoveryStartTime;
            if (stableFor >= RECOVERY_STABLE_MS) {
                systemState.isolatedSegments = systemState.isolatedSegments.filter(s => s !== faultSegment);

                if (systemState.isolatedSegments.length === 0) {
                    systemState.status = 'NORMAL';
                    systemState.faultType = null;
                    systemState.faultLocation = null;
                }
                systemState.lastRecoveryTime = ts;
                systemState.recoveryStartTime = null;
                stateChanged = true;

                queueCommand(upstreamPoleId, {
                    action: 'ENABLE_OUTGOING_RELAY',
                    reason: `Fault cleared between ${upstreamPoleId} and ${currentPoleId}`,
                });

                console.log(`🟢 [${type}] FAULT CLEARED: ${faultSegment}`);
                if (io) {
                    io.emit(events.clear, {
                        segment: faultSegment,
                        message: `Fault cleared between ${upstreamPoleId} and ${currentPoleId}`,
                        timestamp: ts,
                    });
                }
            }
        }
    }

    return stateChanged;
}

module.exports = { runFaultEngine };
