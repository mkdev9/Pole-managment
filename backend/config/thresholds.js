/*
 * ============================================================
 *  System Thresholds Configuration
 * ============================================================
 *  Centralized constants for fault detection/status inference.
 * ============================================================
 */

module.exports = {
    // Voltage below this is considered "No Power" (LOW)
    // Adjust based on sensor noise floor.
    VOLTAGE_THRESHOLD: 50.0,

    // Current above this implies active load (outgoing power present)
    // Adjust based on load (e.g. LED bulb approx 0.05-0.1A, Motor > 1A)
    CURRENT_THRESHOLD: 0.1,

    // Time before a pole is considered OFFLINE if no data received
    STALE_TIMEOUT_MS: 15000
};
