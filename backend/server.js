/*
 * ============================================================
 *  IoT Utility Pole Monitoring - Main Server
 * ============================================================
 *
 *  This is the entry point for the Node.js backend.
 *  It sets up:
 *    - Express HTTP server
 *    - Socket.IO WebSocket server
 *    - Firebase Realtime Database connection
 *    - CORS for React frontend
 *    - API routes for pole data
 *    - Error handling middleware
 *
 *  Deployment target: Render Web Service
 * ============================================================
 */

// ─── Load environment variables ─────────────────────────────
require('dotenv').config();

// ─── Core dependencies ─────────────────────────────────────
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// ─── Routes ─────────────────────────────────────────────────
const polesRouter = require('./routes/poles');
const coordinationRouter = require('./routes/coordination');
// Updated import to get both the router and the stop function
const { router: simulatorRouter, stopSimulator } = require('./routes/simulator-routes');
const settingsRouter = require('./routes/settings');

// ─── App initialization ─────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── CORS Configuration ─────────────────────────────────────
/*
 * Allow requests from the React frontend.
 * In production, restrict this to your actual frontend URL.
 */
const normalizeUrl = (url) => url ? url.trim().replace(/\/$/, '') : '';

// Parse FRONTEND_URL as a comma-separated list (e.g. "https://myapp.com,https://myapp.vercel.app")
const envOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeUrl)
    .filter(Boolean);

const allowedOrigins = [
    'http://localhost:5173',           // Vite dev server
    'http://localhost:3000',           // CRA dev server
    'http://localhost:3001',           // Alternative port
    ...envOrigins,                     // Production frontend URLs
].filter(Boolean);

console.log('🛡️ CORS Allowed Origins:', allowedOrigins);

const corsOptions = {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
};

app.use(cors(corsOptions));

// ─── Socket.IO Configuration ────────────────────────────────
/*
 * WebSocket server for real-time data broadcasting.
 * The React dashboard connects here to receive live updates.
 */
const io = new Server(server, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
});

// Make io accessible in routes via req.app.get('io')
app.set('io', io);

// ─── Socket.IO Event Handlers ───────────────────────────────
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Send welcome message with supported poles
    socket.emit('connected', {
        message: 'Connected to Utility Pole Monitor',
        poles: ['Pole1', 'Pole2', 'Pole3', 'Pole4'],
        timestamp: new Date().toISOString(),
    });

    socket.on('disconnect', (reason) => {
        console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);

        // AUTO-STOP SIMULATOR ON DISCONNECT
        // This ensures the simulator doesn't keep running as a "zombie" process
        // if the user closes the tab without stopping it.
        // We add a small delay to avoid stopping on quick refresh/reconnects?
        // For now, strict stop is safer for a demo/single-user app.

        stopSimulator().then(stopped => {
            if (stopped) console.log('🛑 Simulator auto-stopped due to client disconnect.');
        });
    });

    // Allow clients to subscribe to specific pole updates
    socket.on('subscribeToPole', (poleId) => {
        socket.join(poleId);
        console.log(`   📎 ${socket.id} subscribed to ${poleId}`);
    });
});

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));   // Parse JSON bodies (limit size)
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// ─── API Routes ─────────────────────────────────────────────
app.use('/api/poles', polesRouter);
app.use('/api/coordination', coordinationRouter);
app.use('/api/simulator', simulatorRouter);
app.use('/api/settings', settingsRouter);

// ─── Health Check Endpoint ──────────────────────────────────
/*
 * Used by Render (or any hosting service) to verify the server
 * is running. Returns basic server info.
 */
app.get('/', (req, res) => {
    res.json({
        service: 'Utility Pole Monitor API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: 'GET /',
            getAllPoles: 'GET /api/poles',
            getPole: 'GET /api/poles/:id',
            postData: 'POST /api/poles/data',
            postState: 'POST /api/coordination/state',
            getState: 'GET /api/coordination/state/:poleId',
            getSystem: 'GET /api/coordination/system',
            getCommands: 'GET /api/coordination/commands/:poleId',
            resetSystem: 'POST /api/coordination/reset',
        },
        poles: ['Pole1', 'Pole2', 'Pole3', 'Pole4'],
        timestamp: new Date().toISOString(),
    });
});

// ─── 404 Handler ────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} does not exist`,
        availableEndpoints: {
            'GET /': 'Health check',
            'GET /api/poles': 'Get latest readings for all poles',
            'GET /api/poles/:id': 'Get readings for a specific pole',
            'POST /api/poles/data': 'Submit pole reading from Arduino',
            'POST /api/coordination/state': 'Publish pole state',
            'GET /api/coordination/system': 'Get system state',
        },
    });
});

// ─── Global Error Handler ───────────────────────────────────
app.use((err, req, res, next) => {
    console.error('💥 Unhandled Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production'
            ? 'Something went wrong'
            : err.message,
    });
});

// ─── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   Utility Pole Monitor — Backend Server      ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║   🌐 HTTP Server : http://localhost:${PORT}     ║`);
    console.log(`║   🔌 WebSocket   : ws://localhost:${PORT}       ║`);
    console.log('║   📊 Poles       : Pole1, Pole2, Pole3, Pole4║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
});

module.exports = { app, server, io };
