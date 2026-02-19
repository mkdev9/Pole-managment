/*
 * ============================================================
 *  Real System Manager
 * ============================================================
 *  Manages the state of the Real Hardware context.
 *  - Handles data from Poles 1-4
 *  - Runs fault detection logic
 *  - Syncs with Firebase /coordination
 *  - Broadcasts io events
 * ============================================================
 */

const { runFaultEngine } = require('./FaultDetection');
const { db } = require('../config/firebase');

const POLE_ORDER = ['Pole1', 'Pole2', 'Pole3', 'Pole4'];
const STALE_TIMEOUT_MS = 15000;

class RealSystem {
    constructor() {
        this.type = 'real';
        this.dbPrefix = '/coordination';
        this.events = {
            update: 'systemStateUpdate',
            poleUpdate: 'poleStateUpdate',
            gridDown: 'gridDown',
            fault: 'faultDetected',
            clear: 'faultCleared',
            normal: 'systemNormal',
            command: 'commandSent'
        };

        this.poleStates = { Pole1: null, Pole2: null, Pole3: null, Pole4: null };
        this.pendingCommands = { Pole1: [], Pole2: [], Pole3: [], Pole4: [] };
        this.lastUpdateTime = { Pole1: 0, Pole2: 0, Pole3: 0, Pole4: 0 };

        this.systemState = {
            status: 'WAITING',
            faultLocation: null,
            faultType: null,
            lastFaultTime: null,
            lastRecoveryTime: null,
            recoveryStartTime: null,
            isolatedSegments: [],
            poleStates: {},
        };

        this.io = null;
    }

    setIO(ioInstance) {
        this.io = ioInstance;
    }

    /**
     * Called by routes/poles.js or routes/coordination.js when a pole reports status.
     */
    async updatePole(poleId, data) {
        // Update local state
        this.poleStates[poleId] = data;
        this.lastUpdateTime[poleId] = Date.now();

        // Save to Firebase
        // We save the 'coordination' view of the pole here.
        // (poles.js saves the raw readings separately, but that might be refactored later)
        await this.saveToFirebase(`${this.dbPrefix}/poles/${poleId}`, data);

        // Run Logic
        const changed = runFaultEngine(this, this.queueCommand.bind(this), this.io);

        // Broadcast
        if (this.io) {
            this.io.emit(this.events.poleUpdate, { poleId, state: data });
            if (changed) {
                this.io.emit(this.events.update, this.getSummary());
                await this.saveToFirebase(`${this.dbPrefix}/system`, this.getSummary());
            }
        }
    }

    queueCommand(poleId, command) {
        if (!this.pendingCommands[poleId]) this.pendingCommands[poleId] = [];
        const cmdObj = {
            ...command,
            id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            timestamp: new Date().toISOString(),
            status: 'PENDING',
        };
        this.pendingCommands[poleId].push(cmdObj);

        // In a real system, we might want to notify the pole immediately if it uses long-polling or websockets
        // For now, it polls via GET /commands
    }

    getCommands(poleId) {
        const cmds = this.pendingCommands[poleId] || [];
        this.pendingCommands[poleId] = []; // Clear after fetch
        return cmds;
    }

    getSummary() {
        const summary = {
            status: this.systemState.status,
            faultLocation: this.systemState.faultLocation,
            faultType: this.systemState.faultType,
            lastFaultTime: this.systemState.lastFaultTime,
            lastRecoveryTime: this.systemState.lastRecoveryTime,
            isolatedSegments: this.systemState.isolatedSegments,
            poles: {},
        };

        for (const poleId of POLE_ORDER) {
            const s = this.poleStates[poleId];
            summary.poles[poleId] = s ? {
                nodeState: s.nodeState || 'UNKNOWN',
                incomingCurrent: s.incomingCurrent || 'UNKNOWN',
                outgoingCurrent: s.outgoingCurrent ?? 'N/A',
                relayIn: s.relayIn || 'UNKNOWN',
                relayOut: s.relayOut ?? 'N/A',
                voltage: s.voltage || 0,
                current: s.current || 0,
                faultFlag: s.faultFlag || false,
                lastUpdate: s.timestamp,
            } : { nodeState: 'OFFLINE' };
        }
        return summary;
    }

    reset() {
        this.poleStates = { Pole1: null, Pole2: null, Pole3: null, Pole4: null };
        this.pendingCommands = { Pole1: [], Pole2: [], Pole3: [], Pole4: [] };
        this.systemState = {
            status: 'WAITING',
            faultLocation: null,
            faultType: null,
            lastFaultTime: null,
            lastRecoveryTime: null,
            recoveryStartTime: null,
            isolatedSegments: [],
            poleStates: {},
        };

        if (this.io) {
            this.io.emit(this.events.normal, { message: 'System reset', timestamp: new Date().toISOString() });
            this.io.emit(this.events.update, this.getSummary());
        }
        this.saveToFirebase(`${this.dbPrefix}/system`, this.getSummary());
    }

    async saveToFirebase(path, data) {
        if (!db) return;
        try {
            await db.ref(path).set(data);
        } catch (err) {
            console.error(`Firebase write error (${path}):`, err.message);
        }
    }

    // Staleness loop
    startStalenessCheck() {
        setInterval(() => {
            const now = Date.now();
            let anyActive = false;
            let anyWentStale = false;

            for (const poleId of POLE_ORDER) {
                if (this.lastUpdateTime[poleId] > 0) {
                    const elapsed = now - this.lastUpdateTime[poleId];
                    if (elapsed > STALE_TIMEOUT_MS) {
                        if (this.poleStates[poleId] !== null) {
                            console.log(`⏱️  [REAL] ${poleId} stale (${(elapsed / 1000).toFixed(0)}s) — clearing state`);
                            this.poleStates[poleId] = null;
                            this.lastUpdateTime[poleId] = 0;
                            anyWentStale = true;
                        }
                    } else {
                        anyActive = true;
                    }
                }
            }

            if (anyWentStale && !anyActive) {
                console.log(`🔄 [REAL] All data sources inactive — resetting system state to WAITING`);
                this.reset(); // This resets everything to WAITING
            } else if (anyWentStale && this.io) {
                this.io.emit(this.events.update, this.getSummary());
                for (const poleId of POLE_ORDER) {
                    this.io.emit(this.events.poleUpdate, { poleId, state: this.poleStates[poleId] || { nodeState: 'OFFLINE' } });
                }
            }

        }, 5000);
    }
}

module.exports = new RealSystem();
