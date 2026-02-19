/*
 * ============================================================
 *  Poles API Routes (Real Hardware Telemetry)
 * ============================================================
 *  Dedicated endpoint for Real Hardware.
 *  Delegates logic to RealSystem.js to ensure single source of truth.
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const RealSystem = require('../logic/RealSystem');
const { db } = require('../config/firebase');

const VALID_POLES = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];

// ─── POST /api/poles/data ───────────────────────────────────
router.post('/data', async (req, res) => {
    // 1. Mode Check
    const currentMode = require('../state/systemMode').getMode();
    const isSimPayload = req.body.isSimulation === true;

    if (currentMode === 'IDLE') return res.status(403).json({ error: 'System is IDLE' });
    if (currentMode === 'SIM' && !isSimPayload) return res.status(403).json({ error: 'SIM mode active' });

    // If we are in REAL mode but get SIM data? 
    // The simulator sends to both. 
    // STRICT SEPARATION: 
    // If this is SIM data, ignore it here? 
    // The simulator.js sends to /coordination/state (handled by SimSystem) AND /poles/data.
    // If we block SIM data here, charts might break if they rely on /poles/data path in DB.
    // BUT SimSystem saves to /simulation/coordination/poles.

    // DECISION: To satisfy "Strict Separation", this route should primarily serve REAL hardware.
    // However, to keep legacy charts working for Sim, we might allow it but ONLY write to DB, not trigger RealSystem logic.

    const { poleId, voltage, current, status, timestamp, isSimulation } = req.body;

    if (!poleId || !VALID_POLES.includes(poleId)) {
        return res.status(400).json({ error: 'Invalid Pole ID' });
    }

    try {
        if (!isSimulation) {
            // ─── REAL HARDWARE FLOW ─────────────────────────────
            // Delegate to RealSystem. It handles:
            // 1. State update
            // 2. Fault Logic
            // 3. Broadcasting
            // 4. Persistence (to /coordination/poles)

            // We also want to save raw telemetry for charts (history)
            // RealSystem doesn't currently do "readings" list, only "latest state".
            // So we do the history push here or move it to RealSystem.

            const record = {
                poleId,
                voltage: parseFloat(voltage),
                current: parseFloat(current),
                status,
                timestamp: timestamp || new Date().toISOString(),
                alert: false // calculate based on thresholds if needed
            };

            // Feed RealSystem
            // We map the raw voltage/current to the state object RealSystem expects
            await RealSystem.updatePole(poleId, {
                ...record,
                incomingCurrent: voltage > 50 ? 'HIGH' : 'LOW', // Simple inference
                nodeState: 'NORMAL' // Default, RealSystem logic will override status if faults found
            });

            // Persist History (Legacy support for charts)
            if (db) {
                await db.ref(`poles/${poleId}/readings`).push(record);
                await db.ref(`poles/${poleId}/latest`).set(record);
            }

            return res.json({ success: true, mode: 'REAL' });

        } else {
            // ─── SIMULATOR FLOW (Legacy Support) ────────────────
            // Simulator sends here mostly for the "readings" history for charts.
            // SimSystem executes via /api/coordination/state.
            // So here we strictly JUST save to DB for charts, do NOT trigger system logic.

            if (db) {
                const record = {
                    poleId, voltage, current, status, timestamp
                };
                await db.ref(`simulation/poles/${poleId}/readings`).push(record);
                await db.ref(`simulation/poles/${poleId}/latest`).set(record);
            }

            // Restore Socket Emission for Dashboard/Charts
            const io = req.app.get('io');
            if (io) {
                io.emit('simPoleData', {
                    poleId,
                    data: {
                        poleId,
                        voltage: parseFloat(voltage),
                        current: parseFloat(current),
                        status,
                        timestamp: timestamp || new Date().toISOString(),
                        alert: status === 'alert'
                    }
                });
            }

            return res.json({ success: true, mode: 'SIM_LOGGING_ONLY' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Error' });
    }
});

// ─── GET /api/poles/:id (Charts) ────────────────────────────
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const isSim = req.query.sim === 'true';
    const dbPath = isSim ? `simulation/poles` : `poles`;

    if (db) {
        const snap = await db.ref(`${dbPath}/${id}/readings`).limitToLast(50).once('value');
        const readings = [];
        snap.forEach(c => readings.push({ id: c.key, ...c.val() }));
        return res.json({ poleId: id, readings });
    }
    res.json({ poleId: id, readings: [] });
});

module.exports = router;
