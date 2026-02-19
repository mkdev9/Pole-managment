/*
 * ============================================================
 *  System Configuration API
 * ============================================================
 *  Endpoints to manage global system mode.
 *  - GET  /api/settings/mode
 *  - POST /api/settings/mode
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const systemMode = require('../state/systemMode');

const { db } = require('../config/firebase');

// ─── GET Current Mode ───────────────────────────────────────
router.get('/mode', (req, res) => {
    res.json({ mode: systemMode.getMode() });
});

// ─── SET Mode (Gateway Control) ─────────────────────────────
router.post('/mode', (req, res) => {
    const { mode } = req.body;
    const oldMode = systemMode.getMode();

    if (systemMode.setMode(mode)) {
        console.log(`Setting system mode to: ${mode}`);

        // ─── Simulator Cleanup ────────────────────────────────────
        // Wipes cloud data ONLY when exiting Simulation Mode
        if (oldMode === 'SIM' && mode === 'IDLE') {
            console.log('🧹 Cleaning up Simulator Data from Cloud...');
            if (db) {
                db.ref('simulation').remove()
                    .then(() => console.log('✅ Sim Data Cleared from Cloud'))
                    .catch(e => console.error('⚠️ Failed to clear Sim Data:', e));
            }
        }

        res.json({ success: true, mode });
    } else {
        res.status(400).json({ error: 'Invalid mode. Use REAL, SIM, or IDLE.' });
    }
});

// ─── GET /firebase-check (Debug) ────────────────────────────
// Allows user to verify if Firebase connected successfully
router.get('/firebase-check', async (req, res) => {
    const { initError } = require('../config/firebase');
    const systemMode = require('../state/systemMode').getMode();

    const status = {
        connected: !!db,
        initError: initError || null,
        currentMode: systemMode,
        env: {
            hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
            hasDbUrl: !!process.env.FIREBASE_DATABASE_URL,
            dbUrl: process.env.FIREBASE_DATABASE_URL || 'MISSING',
        }
    };

    if (db) {
        try {
            // Read Test
            await db.ref('.info/connected').once('value');
            status.readTest = 'SUCCESS';

            // Write Test (timestamp)
            const testRef = db.ref('debug/connection_test');
            await testRef.set({ timestamp: Date.now(), mode: systemMode });
            status.writeTest = 'SUCCESS - Check /debug/connection_test in Firebase Console';
        } catch (e) {
            status.readTest = status.readTest || 'FAILED';
            status.writeTest = `FAILED: ${e.message}`;
        }
    }

    res.json(status);
});

module.exports = router;
