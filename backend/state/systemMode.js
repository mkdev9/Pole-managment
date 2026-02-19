/*
 * ============================================================
 *  System Mode State
 * ============================================================
 *  Singleton module to track the current operating mode:
 *  - IDLE (Default): No data accepted.
 *  - REAL: Only Real hardware data accepted.
 *  - SIM: Only Simulator data accepted.
 * ============================================================
 */

let systemMode = 'IDLE'; // 'IDLE', 'REAL', 'SIM'

module.exports = {
    getMode: () => systemMode,
    setMode: (mode) => {
        if (['IDLE', 'REAL', 'SIM'].includes(mode)) {
            systemMode = mode;
            console.log(`🔄 System Mode Changed to: ${mode}`);
            return true;
        }
        return false;
    }
};
