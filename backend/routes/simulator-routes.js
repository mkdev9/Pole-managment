/*
 * ============================================================
 *  Simulator Command Route
 * ============================================================
 *  Allows the frontend to trigger simulation scenarios by
 *  writing to sim_command.txt, which simulator.js watches.
 *
 *  POST /api/simulator/command  { action: "GRID_DOWN" | "WIRE_CUT_1" | ... | "RECOVER" }
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');

const cmdFile = path.join(__dirname, '..', 'sim_command.txt');
const PORT = process.env.PORT || 3000;

let simProcess = null;

// Map frontend actions → sim_command.txt codes
const ACTION_MAP = {
    'GRID_DOWN': '1',
    'WIRE_CUT_1': '2',   // Cut Pole1-Pole2
    'WIRE_CUT_2': '3',   // Cut Pole2-Pole3
    'WIRE_CUT_3': '4',   // Cut Pole3-Pole4
    'RECOVER': 'r',
};

// ─── Helpher: Stop Simulator ──────────────────────────────────
async function stopSimulator() {
    if (!simProcess) return false;

    console.log('🛑 Stopping Simulator Process (Process or Socket Trigger)...');
    simProcess.kill();
    simProcess = null;

    // Reset system state to "Unknown" / Normal
    try {
        console.log('🔄 Triggering coordination state reset...');
        // Wait briefly for process to die before cleaning DB
        setTimeout(async () => {
            try {
                await axios.post(`http://localhost:${PORT}/api/coordination/reset`, { isSimulation: true });
            } catch (err) {
                console.error('⚠️ Failed to reset coordination state:', err.message);
            }
        }, 500);
    } catch (err) {
        console.error('⚠️ Failed to reset coordination state logic:', err.message);
    }
    return true;
}

// ─── POST /command ──────────────────────────────────────────
router.post('/command', (req, res) => {
    const { action } = req.body || {};

    console.log('📬 Received simulator command request:', req.body);

    // Validate action
    if (!action || !ACTION_MAP[action]) {
        console.warn(`⚠️ Invalid simulator action received: "${action}"`);
        return res.status(400).json({
            error: 'Invalid action',
            received: action,
            validActions: Object.keys(ACTION_MAP),
        });
    }

    if (simProcess) {
        simProcess.send({ type: 'COMMAND', action });
        console.log(`👉 Sent IPC command: ${action}`);
        res.json({ success: true, action, message: `Command "${action}" sent to simulator` });
    } else {
        console.warn('⚠️ Simulator process not running. Command ignored.');
        res.status(503).json({ error: 'Simulator is not running', action });
    }
});

// ─── GET /status ──────────────────────────────────────────────
router.get('/status', (req, res) => {
    try {
        const cmd = fs.existsSync(cmdFile) ? fs.readFileSync(cmdFile, 'utf8').trim() : '';
        res.json({ lastCommand: cmd });
    } catch (_) {
        res.json({ lastCommand: '' });
    }
});

// ─── POST /start ──────────────────────────────────────────────
router.post('/start', (req, res) => {
    if (simProcess) {
        return res.json({ success: false, message: 'Simulator is already running.' });
    }

    console.log('🚀 Starting Simulator Process...');
    // Execute simulator.js in the current working directory (backend root)
    simProcess = spawn('node', ['simulator.js'], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        cwd: process.cwd(),
        env: { ...process.env, PORT: PORT } // Pass current PORT to child process
    });

    console.log(`✅ Simulator started with PID: ${simProcess.pid}`);

    simProcess.on('exit', (code) => {
        console.log(`🛑 Simulator process exited with code ${code}`);
        simProcess = null;
    });

    res.json({ success: true, pid: simProcess.pid });
});

// ─── POST /stop ───────────────────────────────────────────────
router.post('/stop', async (req, res) => {
    const stopped = await stopSimulator();
    if (!stopped) {
        // Even if not running, ensure state is reset to be safe
        try {
            await axios.post(`http://localhost:${PORT}/api/coordination/reset`, { isSimulation: true });
        } catch (e) { }
        return res.json({ success: false, message: 'Simulator is not running (State reset requested).' });
    }
    res.json({ success: true, message: 'Simulator stopped and state reset' });
});

// ─── GET /running ─────────────────────────────────────────────
router.get('/running', (req, res) => {
    res.json({ running: !!simProcess });
});

module.exports = { router, stopSimulator };
