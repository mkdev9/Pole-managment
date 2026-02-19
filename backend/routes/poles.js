/*
 * ============================================================
 *  Poles API Routes
 * ============================================================
 *  Handles all REST API endpoints for pole data:
 *    POST /api/poles/data   → Receive data from Arduino
 *    GET  /api/poles        → Get latest readings for all 4 poles
 *    GET  /api/poles/:id    → Get all readings for a specific pole
 *
 *  Each incoming record is:
 *    - Validated for correct poleId, numeric values, and status
 *    - Stored in Firebase Realtime Database
 *    - Broadcast via Socket.IO for real-time dashboard updates
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// ─── VALID POLE IDs ─────────────────────────────────────────
const VALID_POLES = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];

// ─── THRESHOLDS (server-side) ───────────────────────────────
const OVERVOLTAGE_THRESHOLD = parseFloat(process.env.OVERVOLTAGE_THRESHOLD) || 260;
const OVERCURRENT_THRESHOLD = parseFloat(process.env.OVERCURRENT_THRESHOLD) || 15;

// ─── IN-MEMORY STORE (fallback when Firebase is unavailable) ─
let inMemoryStore = {
    Pole1: { readings: [], latest: null },
    Pole2: { readings: [], latest: null },
    Pole3: { readings: [], latest: null },
    Pole4: { readings: [], latest: null },
};

// ─── Track last update time per pole ────────────────────────
let poleLastUpdate = {
    Pole1: 0, Pole2: 0, Pole3: 0, Pole4: 0,
};
let poleIORef = null;
const POLE_STALE_MS = 15000; // 15 seconds

// ─── Staleness checker — clear latest data when stale ───────
setInterval(() => {
    const now = Date.now();
    for (const poleId of VALID_POLES) {
        if (poleLastUpdate[poleId] > 0) {
            const elapsed = now - poleLastUpdate[poleId];
            if (elapsed > POLE_STALE_MS && inMemoryStore[poleId].latest !== null) {
                console.log(`⏱️  ${poleId} sensor data stale — clearing`);
                inMemoryStore[poleId].latest = null;
                poleLastUpdate[poleId] = 0;
                // Broadcast null data so frontend knows to clear
                if (poleIORef) {
                    poleIORef.emit('newPoleData', { poleId, data: null });
                }
            }
        }
    }
}, 5000);


// ╔════════════════════════════════════════════════════════════╗
// ║  POST /api/poles/data                                     ║
// ║  Receives JSON from Arduino and stores + broadcasts it    ║
// ╚════════════════════════════════════════════════════════════╝
router.post('/data', async (req, res) => {
    // ─── Mode Enforcement ─────────────────────────────────────
    const currentMode = require('../state/systemMode').getMode();
    const isSimPayload = req.body.isSimulation === true;

    if (currentMode === 'IDLE') {
        return res.status(403).json({ error: 'System is IDLE. Select mode in dashboard.' });
    }
    if (currentMode === 'REAL' && isSimPayload) {
        return res.status(403).json({ error: 'System is in REAL mode. Simulation data rejected.' });
    }
    if (currentMode === 'SIM' && !isSimPayload) {
        return res.status(403).json({ error: 'System is in SIM mode. Real hardware data rejected.' });
    }

    try {
        const { poleId, voltage, current, status, timestamp, isSimulation } = req.body;

        // ── Determine Paths & event names ─────────────────────
        const dbPath = isSimulation ? `simulation/poles` : `poles`;
        const socketEvent = isSimulation ? 'simPoleData' : 'newPoleData';
        // Note: Staleness checker currently only tracks REAL poles. 
        // We could add sim tracking but let's keep it simple for now.

        // ── Validation ────────────────────────────────────────
        // Check required fields exist
        if (!poleId || voltage === undefined || current === undefined || !status) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Missing required fields: poleId, voltage, current, status',
            });
        }

        // Validate poleId
        if (!VALID_POLES.includes(poleId)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: `Invalid poleId. Must be one of: ${VALID_POLES.join(', ')}`,
            });
        }

        // Validate voltage and current are numeric
        if (typeof voltage !== 'number' || isNaN(voltage)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'voltage must be a valid number',
            });
        }
        if (typeof current !== 'number' || isNaN(current)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'current must be a valid number',
            });
        }

        // Validate status
        if (!['normal', 'alert'].includes(status)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'status must be "normal" or "alert"',
            });
        }

        // ── Build record ──────────────────────────────────────
        poleLastUpdate[poleId] = Date.now(); // Update timestamp
        const record = {
            poleId,
            voltage: parseFloat(voltage.toFixed(2)),
            current: parseFloat(current.toFixed(2)),
            status,
            timestamp: timestamp || new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            alert: voltage > OVERVOLTAGE_THRESHOLD || current > OVERCURRENT_THRESHOLD,
        };

        // Log alerts to console
        if (record.alert) {
            console.log(`🚨 ALERT on ${poleId}: V=${record.voltage}V, I=${record.current}A`);
        } else {
            console.log(`📊 ${poleId}: V=${record.voltage}V, I=${record.current}A [${status}]`);
        }

        // ── Store in Firebase ─────────────────────────────────
        if (db) {
            // Push to readings history
            await db.ref(`${dbPath}/${poleId}/readings`).push(record);

            // Update latest reading for quick access
            await db.ref(`${dbPath}/${poleId}/latest`).set(record);

            console.log(`   ✅ Saved to Firebase: ${dbPath}/${poleId}`);
        } else {
            // Fallback: in-memory storage
            inMemoryStore[poleId].readings.push(record);
            // Keep only last 100 readings in memory
            if (inMemoryStore[poleId].readings.length > 100) {
                inMemoryStore[poleId].readings.shift();
            }
            inMemoryStore[poleId].latest = record;
            console.log(`   📦 Saved to in-memory store (Firebase unavailable)`);
        }

        // ── Broadcast via WebSocket ───────────────────────────
        // ── Broadcast via WebSocket ───────────────────────────
        const io = req.app.get('io');
        if (io) {
            if (!isSimulation) poleIORef = io; // Only track staleness for REAL data
            io.emit(socketEvent, {
                poleId,
                data: record,
            });
            if (record.alert) {
                io.emit('poleAlert', {
                    poleId,
                    data: record,
                    message: `Alert on ${poleId}: V=${record.voltage}V, I=${record.current}A`,
                });
            }
            console.log(`   📡 Broadcast to WebSocket clients`);
        }

        // ── Response ──────────────────────────────────────────
        return res.status(201).json({
            success: true,
            message: `Data recorded for ${poleId}`,
            record,
        });

    } catch (error) {
        console.error('❌ Error processing pole data:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
        });
    }
});


// ╔════════════════════════════════════════════════════════════╗
// ║  GET /api/poles                                           ║
// ║  Returns latest readings for all 4 poles                  ║
// ╚════════════════════════════════════════════════════════════╝
router.get('/', async (req, res) => {
    try {
        let result = {};

        const isSim = req.query.sim === 'true';
        const dbPath = isSim ? `simulation/poles` : `poles`;

        if (db) {
            // Fetch latest readings from Firebase
            for (const poleId of VALID_POLES) {
                const snapshot = await db.ref(`${dbPath}/${poleId}/latest`).once('value');
                result[poleId] = snapshot.val() || { status: 'offline', message: 'No data received yet' };
            }
        } else {
            // Fallback: in-memory
            for (const poleId of VALID_POLES) {
                result[poleId] = inMemoryStore[poleId].latest || {
                    status: 'offline',
                    message: 'No data received yet',
                };
            }
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('❌ Error fetching pole data:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
        });
    }
});


// ╔════════════════════════════════════════════════════════════╗
// ║  GET /api/poles/:id                                       ║
// ║  Returns all readings for a specific pole                 ║
// ╚════════════════════════════════════════════════════════════╝
router.get('/:id', async (req, res) => {
    try {
        const poleId = req.params.id;

        // Validate poleId
        if (!VALID_POLES.includes(poleId)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: `Invalid poleId. Must be one of: ${VALID_POLES.join(', ')}`,
            });
        }

        const isSim = req.query.sim === 'true';
        const dbPath = isSim ? `simulation/poles` : `poles`;

        if (db) {
            // Fetch all readings from Firebase (limited to last 50)
            const snapshot = await db
                .ref(`${dbPath}/${poleId}/readings`)
                .orderByKey()
                .limitToLast(50)
                .once('value');

            const readings = [];
            if (snapshot.exists()) {
                snapshot.forEach((child) => {
                    readings.push({ id: child.key, ...child.val() });
                });
            }

            // Also get latest
            const latestSnap = await db.ref(`${dbPath}/${poleId}/latest`).once('value');

            return res.status(200).json({
                poleId,
                latest: latestSnap.val() || null,
                readings,
                count: readings.length,
            });
        } else {
            // Fallback: in-memory
            const readings = inMemoryStore[poleId].readings;
            return res.status(200).json({
                poleId,
                latest: inMemoryStore[poleId].latest || null,
                readings: readings.slice(-50),
                count: readings.length,
            });
        }

    } catch (error) {
        console.error(`❌ Error fetching data for ${req.params.id}:`, error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
        });
    }
});


module.exports = router;
