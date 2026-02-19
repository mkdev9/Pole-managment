/*
 * ============================================================
 *  Interactive Arduino Simulator — Distributed Fault Detection
 * ============================================================
 *  Simulates 4 poles sending coordination state data.
 *  Uses a cascading physics model to propagate power flow:
 *  Grid → Pole1 → [Line1-2] → Pole2 → [Line2-3] → Pole3 → ...
 *
 *  Usage:  node simulator.js
 * ============================================================
 */

const PORT = process.env.PORT || 3000;
const BACKEND_URL = `http://localhost:${PORT}`;
const INTERVAL_MS = 3000;
const axios = require('axios'); // For HTTP requests
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client'); // For receiving commands from backende keys

// ─── IPC Command Listener ─────────────────────────────────────
process.on('message', (msg) => {
    if (msg.type === 'COMMAND') {
        console.log(`📨 IPC Command Received: ${msg.action}`);
        const action = msg.action;
        if (action === 'GRID_DOWN') simulateGridDown();
        else if (action === 'WIRE_CUT_1') simulateWireCut(1);
        else if (action === 'WIRE_CUT_2') simulateWireCut(2);
        else if (action === 'WIRE_CUT_3') simulateWireCut(3);
        else if (action === 'RECOVER') simulateRecovery();
    }
});

// ─── Simulation State ───────────────────────────────────────
// "Physical" state of lines and grid
const physics = {
    gridPower: true,
    wireCuts: {
        'Pole1-Pole2': false,
        'Pole2-Pole3': false,
        'Pole3-Pole4': false
    }
};

// Pole internal state (Relays default ON)
const poles = {
    Pole1: { baseVoltage: 230, baseCurrent: 5.0, relayIn: 'ON', relayOut: 'ON' },
    Pole2: { baseVoltage: 228, baseCurrent: 6.2, relayIn: 'ON', relayOut: 'ON' },
    Pole3: { baseVoltage: 225, baseCurrent: 3.5, relayIn: 'ON', relayOut: 'ON' },
    Pole4: { baseVoltage: 232, baseCurrent: 7.8, relayIn: 'N/A', relayOut: 'N/A' },
};

// Calculated sensor readings and logic states
const readings = {
    Pole1: { inCurrent: 'LOW', outCurrent: 'LOW', voltage: 0, current: 0, state: 'NORMAL' },
    Pole2: { inCurrent: 'LOW', outCurrent: 'LOW', voltage: 0, current: 0, state: 'NORMAL' },
    Pole3: { inCurrent: 'LOW', outCurrent: 'LOW', voltage: 0, current: 0, state: 'NORMAL' },
    Pole4: { inCurrent: 'LOW', outCurrent: 'N/A', voltage: 0, current: 0, state: 'NORMAL' },
};

let tick = 0;
let activeFault = null;

// ─── Physics Engine: Calculate Power Flow ───────────────────
function calculatePhysics() {
    // 1. Grid to Pole 1
    let powerAvailable = physics.gridPower;

    // Pole 1 Processing
    processPole('Pole1', powerAvailable, 'Pole1-Pole2');

    // Power for next pole depends on Pole 1 Out + Wire 1-2
    powerAvailable = (readings.Pole1.outCurrent === 'HIGH') && !physics.wireCuts['Pole1-Pole2'];

    // Pole 2 Processing
    processPole('Pole2', powerAvailable, 'Pole2-Pole3');

    // Power for next pole
    powerAvailable = (readings.Pole2.outCurrent === 'HIGH') && !physics.wireCuts['Pole2-Pole3'];

    // Pole 3 Processing
    processPole('Pole3', powerAvailable, 'Pole3-Pole4');

    // Power for next pole
    powerAvailable = (readings.Pole3.outCurrent === 'HIGH') && !physics.wireCuts['Pole3-Pole4'];

    // Pole 4 Processing (Terminal)
    processPole('Pole4', powerAvailable, null);
}

function processPole(poleId, inputPowerAvailable, downstreamWire) {
    const p = poles[poleId];
    const r = readings[poleId];
    const isTerminal = poleId === 'Pole4';

    // INCOMING SENSOR: Power must be available AND Relay In must be ON
    // (Assuming sensor is after relay, or relay cuts power to sensor)
    // For Pole 4 (Terminal), relayIn is N/A, so just checking powerAvailable
    const hasRelayOn = (p.relayIn === 'ON') || (isTerminal);
    const hasInputPower = inputPowerAvailable && hasRelayOn;

    r.inCurrent = hasInputPower ? 'HIGH' : 'LOW';

    // OUTGOING SENSOR: Input OK AND Relay Out ON
    // (Assuming single bus)
    let hasOutputPower = hasInputPower;
    if (!isTerminal) {
        hasOutputPower = hasInputPower && (p.relayOut === 'ON');
        r.outCurrent = hasOutputPower ? 'HIGH' : 'LOW';
    }

    // Calculate voltage/current values
    if (hasInputPower) {
        // Add some noise
        r.voltage = parseFloat((p.baseVoltage + (Math.random() - 0.5) * 5).toFixed(1));
        r.current = parseFloat((p.baseCurrent + (Math.random() - 0.5) * 1).toFixed(2));
    } else {
        r.voltage = 0;
        r.current = 0;
    }

    // LOGIC STATE DETERMINATION (Simulating Firmware Logic)
    r.state = 'NORMAL';

    // 1. Grid Down Logic (Pole 1)
    if (poleId === 'Pole1' && !hasInputPower) {
        // Wait, physically Grid Down means inputPowerAvailable is false.
        // If relay is OFF, inputPowerAvailable might be true but hasInputPower false.
        // Firmware logic: If Incoming Low -> GRID_DOWN (for Pole 1)
        if (!physics.gridPower) {
            r.state = 'GRID_DOWN';
        }
    }

    // 2. Fault Upstream Logic (Poles 2-4)
    // Detected if: Incoming is LOW but Upstream Outgoing is HIGH (Mismatch)
    if (poleId !== 'Pole1' && !hasInputPower) {
        // We need to cheat slightly and peek at upstream to simulate "Cloud" knowledge or mismatch
        // In simulator, we declare FAULT_UPSTREAM if we are the *immediate* downstream of a broken wire
        // AND the upstream pole is actually trying to send power.

        // Find upstream pole
        const upstreamId = `Pole${parseInt(poleId.slice(4)) - 1}`;
        const wireKey = `${upstreamId}-${poleId}`;

        // If wire is cut AND upstream is powering it -> FAULT
        const upstreamPowering = readings[upstreamId].outCurrent === 'HIGH';

        if (physics.wireCuts[wireKey] && upstreamPowering) {
            r.state = 'FAULT_UPSTREAM';
        } else if (!upstreamPowering) {
            // Upstream has no power (cascading), so I am NORMAL (just no power)
            r.state = 'NORMAL';
        }
    }

    if (physics.gridPower === false) {
        // Override: verification consistency
        if (r.inCurrent === 'LOW') r.state = 'GRID_DOWN';
        // Actually firmware sets GRID_DOWN if it sees low power on Pole 1.
        // But downstream poles see NORMAL (0V) or RECOVERY.
        // Let's stick to the cascade: Pole 1 GRID_DOWN, others NORMAL (0V)
        if (poleId !== 'Pole1') r.state = 'NORMAL';
    }
}

// ─── Send Data ──────────────────────────────────────────────
async function sendCoordinationState(poleId) {
    const p = poles[poleId];
    const r = readings[poleId];

    // define short code keys
    let kRIn, kROut, kCIn, kCOut, kVIn, kVOut;

    if (poleId === 'Pole1') { kRIn = 'par1'; kROut = 'par2'; kCIn = 'pac1'; kCOut = 'pac2'; kVIn = 'pav1'; kVOut = 'pav2'; }
    else if (poleId === 'Pole2') { kRIn = 'pbr1'; kROut = 'pbr2'; kCIn = 'pbc1'; kCOut = 'pbc2'; kVIn = 'pbv1'; kVOut = 'pbv2'; }
    else if (poleId === 'Pole3') { kRIn = 'pcr1'; kROut = 'pcr2'; kCIn = 'pcc1'; kCOut = 'pcc2'; kVIn = 'pcv1'; kVOut = 'pcv2'; }
    else { kCIn = 'pdc'; kVIn = 'pdv'; } // Pole 4: No Relays

    const body = {
        poleId,
        nodeState: r.state,
        faultFlag: r.state !== 'NORMAL',
        current: r.current,
        timestamp: new Date().toISOString(),
        // Map dynamic keys
        [kCIn]: r.inCurrent,
        [kCIn]: r.inCurrent,
        [kVIn]: r.voltage,
        isSimulation: true, // Flag as simulation data
    };

    if (poleId !== 'Pole4') {
        body[kRIn] = p.relayIn;
        body[kROut] = p.relayOut;
        body[kCOut] = r.outCurrent;
        body[kVOut] = (p.relayOut === 'ON') ? r.voltage : 0;
    } else {
        // Pole 4 has no relay keys
    }

    try {
        // Send to coordination endpoint
        await fetch(`${BACKEND_URL}/api/coordination/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        // Also send to poles data endpoint for charts
        await fetch(`${BACKEND_URL}/api/poles/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                poleId,
                voltage: r.voltage,
                current: r.current,
                status: r.state === 'NORMAL' ? 'normal' : 'alert',
                status: r.state === 'NORMAL' ? 'normal' : 'alert',
                timestamp: body.timestamp,
                isSimulation: true, // Flag as simulation data
            }),
        });

        const icon = r.state === 'NORMAL' ? (r.voltage > 0 ? '✅' : '⚠️') : '🚨';
        console.log(`  ${icon} ${poleId}: ${r.voltage}V ${r.current}A [${r.state}] In:${r.inCurrent} Out:${r.outCurrent}`);
    } catch (err) { }

    // Poll for commands
    try {
        const res = await fetch(`${BACKEND_URL}/api/coordination/commands/${poleId}?sim=true`);
        const data = await res.json();
        if (data.commands) {
            for (const cmd of data.commands) {
                // Execute Command
                if (cmd.action === 'DISABLE_OUTGOING_RELAY') p.relayOut = 'OFF';
                if (cmd.action === 'ENABLE_OUTGOING_RELAY') p.relayOut = 'ON';
                if (cmd.action === 'DISABLE_INCOMING_RELAY') p.relayIn = 'OFF';
                if (cmd.action === 'ENABLE_INCOMING_RELAY') p.relayIn = 'ON';

                console.log(`  📩 ${poleId} Command: ${cmd.action}`);
            }
        }
    } catch (_) { }
}

// ─── Scenarios ──────────────────────────────────────────────
function simulateWireCut(idx) {
    const key = `Pole${idx}-Pole${idx + 1}`;
    console.log(`\n⚡ CUTTING WIRE: ${key}`);
    physics.wireCuts[key] = true;
    activeFault = `CUT ${key}`;
}

function simulateGridDown() {
    console.log(`\n⚠️ GRID SHUTDOWN`);
    physics.gridPower = false;
    activeFault = 'GRID_DOWN';
}

function simulateRecovery() {
    console.log(`\n🟢 REPAIRING ALL`);
    physics.gridPower = true;
    physics.wireCuts['Pole1-Pole2'] = false;
    physics.wireCuts['Pole2-Pole3'] = false;
    physics.wireCuts['Pole3-Pole4'] = false;

    // Reset Relays
    Object.keys(poles).forEach(k => {
        poles[k].relayIn = 'ON';
        if (poles[k].relayOut !== 'N/A') poles[k].relayOut = 'ON';
    });

    activeFault = null;
    fetch(`${BACKEND_URL}/api/coordination/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSimulation: true })
    }).catch(() => { });
}

// ─── Main Loop ──────────────────────────────────────────────
function loop() {
    tick++;
    console.log(`\n── Tick #${tick} ── [${activeFault || 'NORMAL'}] ──`);

    calculatePhysics();

    Object.keys(poles).forEach(id => sendCoordinationState(id));
}

// ─── Keyboard ───────────────────────────────────────────────
function setupKeyboard() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
        const cmd = key.trim().toLowerCase();
        switch (cmd) {
            case '1': simulateWireCut(1); break;
            case '2': simulateWireCut(2); break;
            case '3': simulateWireCut(3); break;
            case 'g': simulateGridDown(); break;
            case 'r': simulateRecovery(); break;
            case 'q': process.exit(0);
        }
    });
}

// ─── Mode Check ─────────────────────────────────────────────
async function checkMode() {
    try {
        const res = await axios.get(`${BACKEND_URL}/api/settings/mode`);
        const mode = res.data.mode;
        if (mode !== 'SIM') {
            console.log('');
            console.error('❌ ERROR: System is not in SIMULATION mode.');
            console.error(`   Current Mode: ${mode}`);
            console.error('   Please select "Run Simulation" in the Dashboard.');
            console.log('');
            process.exit(1);
        }
        console.log('✅ System Mode: SIMULATION');
    } catch (err) {
        console.error('⚠️ Could not verify system mode:', err.message);
        process.exit(1);
    }
}

// Start
console.log('╔═════════════════════════════════════╗');
console.log('║  Cascading Power Simulator          ║');
console.log('╚═════════════════════════════════════╝');
setupKeyboard();

(async () => {
    await checkMode();
    loop();
    setInterval(loop, INTERVAL_MS);
})();
