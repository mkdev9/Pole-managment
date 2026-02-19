/*
 * ============================================================
 *  Coordination API Routes — Distributed Fault Detection
 * ============================================================
 *  Cloud-based coordination layer for sectional fault isolation.
 *  Supports DUAL CONTEXTS: Real Hardware & Simulator.
 *
 *  Refactored to use dedicated managers:
 *   - RealSystem.js
 *   - SimSystem.js
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const RealSystem = require('../logic/RealSystem');
const SimSystem = require('../logic/SimSystem');

const POLE_ORDER = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];

// ─── Initialize Managers ────────────────────────────────────
// We need to pass the IO instance to them once the server starts.
// But we only get IO in the requests.
// Optimization: Check if IO is set on every request, or use a middleware to init once.
// Simple patterns: just set it every time or check isSet flag.

function ensureManagerIO(req) {
    const io = req.app.get('io');
    if (io) {
        if (!RealSystem.io) {
            RealSystem.setIO(io);
            RealSystem.startStalenessCheck();
        }
        if (!SimSystem.io) {
            SimSystem.setIO(io);
            SimSystem.startStalenessCheck();
        }
    }
}


// ─── POST /state — Pole publishes state ─────────────────────
router.post('/state', async (req, res) => {
    ensureManagerIO(req);

    // ─── Mode Enforcement ─────────────────────────────────────
    const currentMode = require('../state/systemMode').getMode();
    const isSimPayload = req.body.isSimulation === true;

    if (currentMode === 'IDLE') return res.status(403).json({ error: 'System is IDLE' });
    if (currentMode === 'REAL' && isSimPayload) return res.status(403).json({ error: 'REAL mode active' });
    if (currentMode === 'SIM' && !isSimPayload) return res.status(403).json({ error: 'SIM mode active' });

    try {
        const { poleId, isSimulation } = req.body;
        const manager = isSimulation ? SimSystem : RealSystem;

        let {
            incomingCurrent, outgoingCurrent, relayIn, relayOut,
            nodeState, faultFlag, voltage, current, timestamp
        } = req.body;

        // Map short codes
        if (poleId === 'Pole1') {
            if (req.body.par1) relayIn = req.body.par1;
            if (req.body.par2) relayOut = req.body.par2;
            if (req.body.pac1) incomingCurrent = req.body.pac1;
            if (req.body.pac2) outgoingCurrent = req.body.pac2;
            if (req.body.pav1) voltage = req.body.pav1;
        } else if (poleId !== 'Pole4') {
            if (poleId === 'Pole2') {
                if (req.body.pbr1) relayIn = req.body.pbr1;
                if (req.body.pbr2) relayOut = req.body.pbr2;
                if (req.body.pbc1) incomingCurrent = req.body.pbc1;
                if (req.body.pbc2) outgoingCurrent = req.body.pbc2;
                if (req.body.pbv1) voltage = req.body.pbv1;
            }
            if (poleId === 'Pole3') {
                if (req.body.pcr1) relayIn = req.body.pcr1;
                if (req.body.pcr2) relayOut = req.body.pcr2;
                if (req.body.pcc1) incomingCurrent = req.body.pcc1;
                if (req.body.pcc2) outgoingCurrent = req.body.pcc2;
                if (req.body.pcv1) voltage = req.body.pcv1;
            }
        } else {
            // Pole 4
            if (req.body.pdc) incomingCurrent = req.body.pdc;
            if (req.body.pdv) voltage = req.body.pdv;
        }

        const stateData = {
            poleId,
            incomingCurrent: incomingCurrent || 'UNKNOWN',
            outgoingCurrent: poleId === 'Pole4' ? 'N/A' : (outgoingCurrent || 'UNKNOWN'),
            relayIn: poleId === 'Pole4' ? 'N/A' : (relayIn || 'OFF'),
            relayOut: poleId === 'Pole4' ? 'N/A' : (relayOut || 'OFF'),
            nodeState: nodeState || 'NORMAL',
            faultFlag: faultFlag || false,
            voltage: parseFloat(voltage) || 0,
            current: parseFloat(current) || 0,
            timestamp: timestamp || new Date().toISOString(),
            ...req.body
        };

        await manager.updatePole(poleId, stateData);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

// ─── GET /state/:poleId ─────────────────────────────────────
router.get('/state/:poleId', (req, res) => {
    ensureManagerIO(req);
    const { poleId } = req.params;
    const isSim = req.query.sim === 'true';
    const manager = isSim ? SimSystem : RealSystem;

    if (!POLE_ORDER.includes(poleId)) return res.status(400).json({ error: 'Invalid poleId' });

    const state = manager.poleStates[poleId];
    if (!state) return res.json({ poleId, nodeState: 'OFFLINE' });
    res.json(state);
});

// ─── GET /system ────────────────────────────────────────────
router.get('/system', (req, res) => {
    ensureManagerIO(req);
    const isSim = req.query.sim === 'true';
    const manager = isSim ? SimSystem : RealSystem;
    res.json(manager.getSummary());
});

// ─── GET /commands/:poleId ──────────────────────────────────
router.get('/commands/:poleId', (req, res) => {
    ensureManagerIO(req);
    const { poleId } = req.params;
    const isSim = req.query.sim === 'true';
    const manager = isSim ? SimSystem : RealSystem;

    if (!POLE_ORDER.includes(poleId)) return res.status(400).json({ error: 'Invalid poleId' });

    res.json({ poleId, commands: manager.getCommands(poleId) });
});

// ─── POST /command (Admin) ──────────────────────────────────
router.post('/command', (req, res) => {
    ensureManagerIO(req);
    // ─── Mode Enforcement ─────────────────────────────────────
    const currentMode = require('../state/systemMode').getMode();
    const isSimPayload = req.body.isSimulation === true;

    if (currentMode === 'IDLE') return res.status(403).json({ error: 'System is IDLE' });
    if (currentMode === 'REAL' && isSimPayload) return res.status(403).json({ error: 'REAL mode active' });
    if (currentMode === 'SIM' && !isSimPayload) return res.status(403).json({ error: 'SIM mode active' });

    const { poleId, action, reason, isSimulation } = req.body;
    const manager = isSimulation ? SimSystem : RealSystem;

    if (!poleId || !action) return res.status(400).json({ error: 'Missing fields' });

    manager.queueCommand(poleId, { action, reason: reason || 'Manual command' });

    // Broadcast manual command event
    if (manager.io) {
        manager.io.emit(manager.events.command, { poleId, action, reason, timestamp: new Date().toISOString() });
    }

    res.json({ success: true, message: `Command queued` });
});

// ─── POST /reset ────────────────────────────────────────────
router.post('/reset', (req, res) => {
    ensureManagerIO(req);
    const { isSimulation } = req.body;
    const manager = isSimulation ? SimSystem : RealSystem;

    manager.reset();
    res.json({ success: true, message: `State reset for ${manager.type}` });
});

module.exports = router;
