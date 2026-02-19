/*
 * ============================================================
 *  IoT Utility Pole Monitor — Distributed Fault Detection
 * ============================================================
 *
 *  ARCHITECTURE:
 *    Grid → Pole1 → Pole2 → Pole3 → Pole4 (terminal)
 *
 *  Each pole is an autonomous protection node. No direct
 *  wired communication between poles — all coordination
 *  happens through cloud (Firebase) via the Node.js backend.
 *
 *  HARDWARE PER POLE:
 *    - Arduino Nano
 *    - ENC28J60 Ethernet module (SPI)
 *    - I2C 16×2 LCD
 *    - ZMPT101B voltage sensor (analog)
 *    - Incoming current sensor (ACS712 or digital, on IN_CURRENT_PIN)
 *    - Incoming relay module (RELAY_IN_PIN)
 *    - Buzzer (BUZZER_PIN)
 *    + Poles 1-3 ONLY:
 *      - Outgoing current sensor (OUT_CURRENT_PIN)
 *      - Outgoing relay module (RELAY_OUT_PIN)
 *
 *  STATE MACHINE:
 *    NORMAL → GRID_DOWN | FAULT_UPSTREAM | FAULT_DOWNSTREAM
 *    FAULT_* → RECOVERY → NORMAL
 *
 *  CONFIGURABLE: Change POLE_NUMBER (1-4) for each pole.
 * ============================================================
 */

#include <SPI.h>
#include <UIPEthernet.h>
#include <ArduinoHttpClient.h>
#include <LiquidCrystal_I2C.h>
#include <avr/wdt.h>               // Watchdog timer
#include <math.h>

// ╔════════════════════════════════════════════════════════════╗
// ║  CONFIGURATION — Change for each pole                     ║
// ╚════════════════════════════════════════════════════════════╝
#define POLE_NUMBER   1             // 1, 2, 3, or 4
#define IS_TERMINAL   (POLE_NUMBER == 4)

// Pole identity string
#if POLE_NUMBER == 1
  const char POLE_ID[] = "Pole1";
  const char UPSTREAM_ID[] = "";    // No upstream for Pole1
#elif POLE_NUMBER == 2
  const char POLE_ID[] = "Pole2";
  const char UPSTREAM_ID[] = "Pole1";
#elif POLE_NUMBER == 3
  const char POLE_ID[] = "Pole3";
  const char UPSTREAM_ID[] = "Pole2";
#elif POLE_NUMBER == 4
  const char POLE_ID[] = "Pole4";
  const char UPSTREAM_ID[] = "Pole3";
#endif

// ─── PIN DEFINITIONS ────────────────────────────────────────
#define VOLTAGE_PIN       A0        // ZMPT101B analog output
#define IN_CURRENT_PIN    A1        // Incoming current sensor (analog/digital)
#define BUZZER_PIN        8         // Buzzer

#if POLE_NUMBER != 4
  #define RELAY_IN_PIN      7         // Incoming relay control
#endif

#if !IS_TERMINAL
  #define OUT_CURRENT_PIN A2        // Outgoing current sensor (Poles 1-3 only)
  #define RELAY_OUT_PIN   6         // Outgoing relay control (Poles 1-3 only)
#endif

// ─── SENSOR CONFIGURATION ───────────────────────────────────
#define CURRENT_THRESHOLD 512       // ADC midpoint — above = HIGH, below = LOW
                                    // For digital sensor: HIGH/LOW directly
#define VOLTAGE_MIDPOINT  512       // ZMPT101B zero-cross ADC value
#define VOLTAGE_CAL       0.4545    // Calibration factor (adjust for your sensor)
#define CURRENT_CAL       0.0735    // ACS712-30A calibration factor
#define SAMPLES           500       // RMS sample count

// ─── THRESHOLDS ─────────────────────────────────────────────
#define OVERVOLTAGE_THRESHOLD   260.0   // Volts
#define OVERCURRENT_THRESHOLD   15.0    // Amps

// ─── TIMING ─────────────────────────────────────────────────
#define SEND_INTERVAL       5000    // ms between state publishes
#define POLL_INTERVAL       2000    // ms between upstream state polls
#define DEBOUNCE_MS         500     // Fault must be stable for this long
#define RECOVERY_MS         3000    // Recovery requires this stable duration
#define CMD_POLL_INTERVAL   3000    // ms between command polls

// ─── NETWORK ────────────────────────────────────────────────
const char  serverAddress[] = "your-backend.onrender.com";
const int   serverPort      = 80;
const char  statePostPath[] = "/api/coordination/state";
const char  cmdPollPath[]   = "/api/coordination/commands/";

byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, POLE_NUMBER };

// ─── OBJECTS ────────────────────────────────────────────────
LiquidCrystal_I2C lcd(0x27, 16, 2);
EthernetClient ethClient;

// ─── STATE MACHINE ──────────────────────────────────────────
enum NodeState {
  STATE_NORMAL,
  STATE_GRID_DOWN,
  STATE_FAULT_UPSTREAM,
  STATE_FAULT_DOWNSTREAM,
  STATE_RECOVERY
};

NodeState currentState = STATE_NORMAL;

// ─── SENSOR/RELAY STATE ─────────────────────────────────────
bool     incomingCurrentHigh  = false;
bool     outgoingCurrentHigh  = false;
bool     relayInEnabled       = false;   // Default OFF (fail-safe)
bool     relayOutEnabled      = false;   // Default OFF (fail-safe)
float    measuredVoltage      = 0.0;
float    measuredCurrent      = 0.0;
bool     faultFlag            = false;

// Upstream state (from cloud)
bool     upstreamOutHigh      = false;
bool     upstreamDataValid    = false;

// ─── TIMING STATE ───────────────────────────────────────────
unsigned long lastSendTime    = 0;
unsigned long lastPollTime    = 0;
unsigned long lastCmdPoll     = 0;
unsigned long faultStartTime  = 0;     // When fault condition first detected
unsigned long recoveryStart   = 0;     // When recovery condition first detected
bool          faultDebounced  = false;
bool          cloudConnected  = true;

// ─── LCD CUSTOM CHARACTERS ──────────────────────────────────
byte alertChar[8] = { 0b00100, 0b01110, 0b01110, 0b11111, 0b11111, 0b00100, 0b00000, 0b00100 };
byte checkChar[8] = { 0b00000, 0b00001, 0b00011, 0b10110, 0b11100, 0b01000, 0b00000, 0b00000 };
byte faultChar[8] = { 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b00000, 0b00000, 0b00000 };

// ╔════════════════════════════════════════════════════════════╗
// ║                        SETUP                              ║
// ╚════════════════════════════════════════════════════════════╝
void setup() {
  wdt_enable(WDTO_8S);              // Watchdog: reset if hung > 8s
  Serial.begin(115200);
  Serial.println(F("═══════════════════════════════════════"));
  Serial.print(F("  Distributed Fault Detection — "));
  Serial.println(POLE_ID);
  Serial.println(F("═══════════════════════════════════════"));

  // Pin modes
  pinMode(VOLTAGE_PIN, INPUT);
  pinMode(IN_CURRENT_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  #if POLE_NUMBER != 4
    pinMode(RELAY_IN_PIN, OUTPUT);
    // Fail-safe: incoming relay OFF at startup
    digitalWrite(RELAY_IN_PIN, LOW);
    relayInEnabled = false;
  #endif
  #if !IS_TERMINAL
    pinMode(OUT_CURRENT_PIN, INPUT);
    pinMode(RELAY_OUT_PIN, OUTPUT);
    digitalWrite(RELAY_OUT_PIN, LOW);
    relayOutEnabled = false;
  #endif
  digitalWrite(BUZZER_PIN, LOW);

  // LCD
  lcd.init();
  lcd.backlight();
  lcd.createChar(0, alertChar);
  lcd.createChar(1, checkChar);
  lcd.createChar(2, faultChar);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(POLE_ID);
  lcd.setCursor(0, 1);
  lcd.print(F("Initializing..."));

  // Ethernet
  Serial.println(F("Initializing Ethernet..."));
  if (Ethernet.begin(mac) == 0) {
    Serial.println(F("DHCP failed. Using fallback IP."));
    IPAddress fallback(192, 168, 1, 100 + POLE_NUMBER);
    Ethernet.begin(mac, fallback);
  }
  Serial.print(F("IP: "));
  Serial.println(Ethernet.localIP());

  // Initial validation: enable relays after boot delay
  delay(2000);
  readCurrentSensors();

  if (POLE_NUMBER == 1) {
    // Pole 1: enable if grid is live
    if (incomingCurrentHigh) {
      enableRelay(true, true);
      #if !IS_TERMINAL
        enableRelay(false, true);
      #endif
      currentState = STATE_NORMAL;
      Serial.println(F("Grid detected — relays enabled."));
    } else {
      currentState = STATE_GRID_DOWN;
      Serial.println(F("No grid power — GRID_DOWN."));
    }
  } else {
    // Other poles: wait for cloud validation before enabling
    currentState = STATE_NORMAL;
    enableRelay(true, true);
    #if !IS_TERMINAL
      enableRelay(false, true);
    #endif
  }

  lcd.clear();
  wdt_reset();
}

// ╔════════════════════════════════════════════════════════════╗
// ║                      MAIN LOOP                            ║
// ╚════════════════════════════════════════════════════════════╝
void loop() {
  wdt_reset();

  unsigned long now = millis();

  // 1. Read local sensors
  readCurrentSensors();
  readVoltageCurrent();

  // 2. Run state machine
  runStateMachine(now);

  // 3. Update LCD
  updateLCD();

  // 4. Send state to cloud at interval
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;
    publishState();
  }

  // 5. Poll upstream state from cloud (non-Pole1)
  #if POLE_NUMBER > 1
    if (now - lastPollTime >= POLL_INTERVAL) {
      lastPollTime = now;
      pollUpstreamState();
    }
  #endif

  // 6. Poll for commands from cloud
  if (now - lastCmdPoll >= CMD_POLL_INTERVAL) {
    lastCmdPoll = now;
    pollCommands();
  }

  wdt_reset();
  delay(100);
}


// ╔════════════════════════════════════════════════════════════╗
// ║              SENSOR READING FUNCTIONS                     ║
// ╚════════════════════════════════════════════════════════════╝

// Read digital current sensors (HIGH = current present, LOW = no current)
void readCurrentSensors() {
  // Incoming current sensor
  int inVal = analogRead(IN_CURRENT_PIN);
  incomingCurrentHigh = (inVal > CURRENT_THRESHOLD);

  // Outgoing current sensor (Poles 1-3 only)
  #if !IS_TERMINAL
    int outVal = analogRead(OUT_CURRENT_PIN);
    outgoingCurrentHigh = (outVal > CURRENT_THRESHOLD);
  #else
    outgoingCurrentHigh = false;
  #endif
}

// Read AC voltage and current RMS values
void readVoltageCurrent() {
  float sumV = 0.0, sumC = 0.0;

  for (int i = 0; i < SAMPLES; i++) {
    int rawV = analogRead(VOLTAGE_PIN) - VOLTAGE_MIDPOINT;
    int rawC = analogRead(IN_CURRENT_PIN) - CURRENT_THRESHOLD;
    sumV += (float)rawV * rawV;
    sumC += (float)rawC * rawC;
  }

  measuredVoltage = sqrt(sumV / SAMPLES) * VOLTAGE_CAL;
  measuredCurrent = sqrt(sumC / SAMPLES) * CURRENT_CAL;

  // Safety: treat sensor read failure as no current
  if (isnan(measuredVoltage)) measuredVoltage = 0.0;
  if (isnan(measuredCurrent)) measuredCurrent = 0.0;

  // Force 0 if digital check says no power (matches simulation logic)
  if (!incomingCurrentHigh) {
    measuredVoltage = 0.0;
    measuredCurrent = 0.0;
  }
}


// ╔════════════════════════════════════════════════════════════╗
// ║                STATE MACHINE                              ║
// ╚════════════════════════════════════════════════════════════╝

void runStateMachine(unsigned long now) {
  switch (currentState) {
    case STATE_NORMAL:
      handleNormalState(now);
      break;
    case STATE_GRID_DOWN:
      handleGridDownState(now);
      break;
    case STATE_FAULT_UPSTREAM:
      handleFaultUpstreamState(now);
      break;
    case STATE_FAULT_DOWNSTREAM:
      handleFaultDownstreamState(now);
      break;
    case STATE_RECOVERY:
      handleRecoveryState(now);
      break;
  }
}

void handleNormalState(unsigned long now) {
  faultFlag = false;
  digitalWrite(BUZZER_PIN, LOW);

  // Pole 1: Check grid status
  // GRID DOWN = NO relay changes. Just update state.
  // All poles lose power naturally.
  #if POLE_NUMBER == 1
    if (!incomingCurrentHigh) {
      if (faultStartTime == 0) { faultStartTime = now; }
      if (now - faultStartTime >= DEBOUNCE_MS) {
        currentState = STATE_GRID_DOWN;
        // NO relay changes — grid is down, relays stay as-is.
        faultFlag = true;
        faultStartTime = 0;
        Serial.println(F("⚠ GRID SHUTDOWN — no relay changes"));
      }
      return;
    }
    faultStartTime = 0;
  #endif

  // Poles 2-4: Check for upstream fault
  // If fault detected, DON'T change any relays here.
  // The cloud engine will only command the upstream pole's
  // outgoing relay. This pole is safe — just has no power.
  #if POLE_NUMBER > 1
    if (!incomingCurrentHigh && upstreamDataValid && upstreamOutHigh) {
      // Mismatch: upstream sending power but we don't receive it
      if (faultStartTime == 0) { faultStartTime = now; }
      if (now - faultStartTime >= DEBOUNCE_MS) {
        currentState = STATE_FAULT_UPSTREAM;
        // NO relay changes — this pole is safe, just no power.
        faultFlag = true;
        faultStartTime = 0;
        Serial.print(F("🔴 FAULT between "));
        Serial.print(UPSTREAM_ID);
        Serial.print(F(" and "));
        Serial.println(POLE_ID);
      }
      return;
    }
    faultStartTime = 0;
  #endif

  // Check for outgoing mismatch (local detection of downstream fault)
  #if !IS_TERMINAL
    // If we're sending power out but outgoing current is LOW, possible downstream issue
    if (relayOutEnabled && !outgoingCurrentHigh) {
      // Could indicate downstream fault, but let the downstream pole confirm via cloud
      // We just note it locally
    }
  #endif

  // Overvoltage / overcurrent check
  if (measuredVoltage > OVERVOLTAGE_THRESHOLD || measuredCurrent > OVERCURRENT_THRESHOLD) {
    faultFlag = true;
    enableRelay(true, false);
    #if !IS_TERMINAL
      enableRelay(false, false);
    #endif
    digitalWrite(BUZZER_PIN, HIGH);
  }
}

void handleGridDownState(unsigned long now) {
  faultFlag = true;
  digitalWrite(BUZZER_PIN, HIGH);
  // NO relay changes. Relays stay as-is during grid down.

  // Check for grid recovery
  #if POLE_NUMBER == 1
    if (incomingCurrentHigh) {
      currentState = STATE_NORMAL;
      faultFlag = false;
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("� Grid restored — NORMAL"));
    }
  #else
    // Non-Pole1: recover when incoming current is restored
    if (incomingCurrentHigh) {
      currentState = STATE_NORMAL;
      faultFlag = false;
      digitalWrite(BUZZER_PIN, LOW);
    }
  #endif
}

void handleFaultUpstreamState(unsigned long now) {
  faultFlag = true;
  digitalWrite(BUZZER_PIN, HIGH);
  // NO relay changes. Relays stay as-is. This pole is safe,
  // it just has no power flowing to it.

  // Check for recovery: incoming current restored
  if (incomingCurrentHigh) {
    currentState = STATE_NORMAL;
    faultFlag = false;
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println(F("� Incoming current restored — NORMAL"));
  }
}

void handleFaultDownstreamState(unsigned long now) {
  faultFlag = true;
  // Outgoing relay disabled by cloud command
  // Wait for cloud to send recovery command

  // If outgoing current comes back, might recover
  #if !IS_TERMINAL
    if (outgoingCurrentHigh) {
      currentState = STATE_RECOVERY;
      recoveryStart = now;
    }
  #endif
}

void handleRecoveryState(unsigned long now) {
  // Recovery from FAULT_DOWNSTREAM (cloud commanded our outgoing relay off).
  // Verify outgoing current is back before re-enabling.
  bool stable = incomingCurrentHigh;
  #if !IS_TERMINAL
    stable = stable && (outgoingCurrentHigh || !relayOutEnabled);
  #endif

  if (!stable) {
    currentState = STATE_FAULT_DOWNSTREAM;
    recoveryStart = 0;
    return;
  }

  if (now - recoveryStart >= RECOVERY_MS) {
    currentState = STATE_NORMAL;
    faultFlag = false;
    // Re-enable outgoing relay (it was the only one disabled by cloud command)
    #if !IS_TERMINAL
      enableRelay(false, true);
    #endif
    digitalWrite(BUZZER_PIN, LOW);
    recoveryStart = 0;
    Serial.println(F("✅ Recovery complete — NORMAL."));
  }
}


// ╔════════════════════════════════════════════════════════════╗
// ║                RELAY CONTROL                              ║
// ╚════════════════════════════════════════════════════════════╝

void enableRelay(bool isIncoming, bool enable) {
  if (isIncoming) {
    #if POLE_NUMBER != 4
      relayInEnabled = enable;
      digitalWrite(RELAY_IN_PIN, enable ? HIGH : LOW);
    #endif
  } else {
    #if !IS_TERMINAL
      relayOutEnabled = enable;
      digitalWrite(RELAY_OUT_PIN, enable ? HIGH : LOW);
    #endif
  }
}


// ╔════════════════════════════════════════════════════════════╗
// ║                  LCD DISPLAY UPDATE                       ║
// ╚════════════════════════════════════════════════════════════╝

void updateLCD() {
  lcd.setCursor(0, 0);

  switch (currentState) {
    case STATE_NORMAL:
      lcd.print(F("V:"));
      lcd.print(measuredVoltage, 1);
      lcd.print(F("V I:"));
      lcd.print(measuredCurrent, 2);
      lcd.print(F("A     "));
      lcd.setCursor(0, 1);
      lcd.write(1);  // Check mark
      lcd.print(F(" Normal         "));
      break;

    case STATE_GRID_DOWN:
      lcd.print(POLE_ID);
      lcd.print(F("            "));
      lcd.setCursor(0, 1);
      lcd.write(0);  // Alert
      lcd.print(F(" GRID SHUTDOWN  "));
      break;

    case STATE_FAULT_UPSTREAM:
      lcd.print(POLE_ID);
      lcd.print(F("            "));
      lcd.setCursor(0, 1);
      lcd.write(2);  // Fault X
      lcd.print(F(" LINE FAULT!    "));
      break;

    case STATE_FAULT_DOWNSTREAM:
      lcd.print(POLE_ID);
      lcd.print(F("            "));
      lcd.setCursor(0, 1);
      lcd.write(2);
      lcd.print(F(" D/S FAULT      "));
      break;

    case STATE_RECOVERY:
      lcd.print(POLE_ID);
      lcd.print(F("            "));
      lcd.setCursor(0, 1);
      lcd.print(F("  RECOVERING... "));
      break;
  }
}


// ╔════════════════════════════════════════════════════════════╗
// ║              CLOUD COMMUNICATION                          ║
// ╚════════════════════════════════════════════════════════════╝

// Publish this pole's state to the cloud
void publishState() {
  const char* stateStr;
  switch (currentState) {
    case STATE_NORMAL:          stateStr = "NORMAL"; break;
    case STATE_GRID_DOWN:       stateStr = "GRID_DOWN"; break;
    case STATE_FAULT_UPSTREAM:  stateStr = "FAULT_UPSTREAM"; break;
    case STATE_FAULT_DOWNSTREAM:stateStr = "FAULT_DOWNSTREAM"; break;
    case STATE_RECOVERY:        stateStr = "RECOVERY"; break;
    default:                    stateStr = "UNKNOWN"; break;
  }

  String json = "{";
  json += "\"poleId\":\"" + String(POLE_ID) + "\",";

  // Construct JSON with Short Codes
  String kRIn = "", kROut = "", kCIn = "", kCOut = "", kVIn = "";
  if (POLE_NUMBER == 1) { kRIn="par1"; kROut="par2"; kCIn="pac1"; kCOut="pac2"; kVIn="pav1"; }
  else if (POLE_NUMBER == 2) { kRIn="pbr1"; kROut="pbr2"; kCIn="pbc1"; kCOut="pbc2"; kVIn="pbv1"; }
  else if (POLE_NUMBER == 3) { kRIn="pcr1"; kROut="pcr2"; kCIn="pcc1"; kCOut="pcc2"; kVIn="pcv1"; }
  else { kCIn="pdc"; kVIn="pdv"; } // Pole 4: No Relays

  if (POLE_NUMBER != 4) {
      json += "\"" + kRIn + "\":\"" + String(relayInEnabled ? "ON" : "OFF") + "\",";
  }
  json += "\"" + kCIn + "\":\"" + String(incomingCurrentHigh ? "HIGH" : "LOW") + "\",";
  json += "\"" + kVIn + "\":" + String(measuredVoltage, 2) + ",";

  #if !IS_TERMINAL
    json += "\"" + kROut + "\":\"" + String(relayOutEnabled ? "ON" : "OFF") + "\",";
    json += "\"" + kCOut + "\":\"" + String(outgoingCurrentHigh ? "HIGH" : "LOW") + "\",";
    // Simulated Output Voltage Check (pav2/pbv2/pcv2)
    String kVOut = (POLE_NUMBER==1)?"pav2":(POLE_NUMBER==2)?"pbv2":"pcv2";
    float vOut = relayOutEnabled ? measuredVoltage : 0.0;
    json += "\"" + kVOut + "\":" + String(vOut, 2) + ",";
  #endif

  json += "\"nodeState\":\"" + String(stateStr) + "\",";
  json += "\"faultFlag\":" + String(faultFlag ? "true" : "false") + ",";
  json += "\"current\":" + String(measuredCurrent, 2);
  json += "}";

  HttpClient http(ethClient, serverAddress, serverPort);
  http.beginRequest();
  http.post(statePostPath);
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("Content-Length", json.length());
  http.beginBody();
  http.print(json);
  http.endRequest();

  int status = http.responseStatusCode();
  if (status == 200) {
    cloudConnected = true;
    Serial.print(F("☁ Published state: "));
    Serial.println(stateStr);
  } else {
    cloudConnected = false;
    Serial.print(F("☁ Publish failed: HTTP "));
    Serial.println(status);
  }
  http.stop();
  wdt_reset();
}

// Poll upstream pole's state from cloud (Poles 2-4 only)
void pollUpstreamState() {
  #if POLE_NUMBER > 1
    String path = "/api/coordination/state/" + String(UPSTREAM_ID);

    HttpClient http(ethClient, serverAddress, serverPort);
    http.get(path.c_str());

    int status = http.responseStatusCode();
    if (status == 200) {
      String body = http.responseBody();
      cloudConnected = true;

      // Simple JSON parsing for outgoingCurrent field
      int idx = body.indexOf("\"outgoingCurrent\"");
      if (idx >= 0) {
        upstreamDataValid = true;
        upstreamOutHigh = (body.indexOf("HIGH", idx) > idx && body.indexOf("HIGH", idx) < idx + 30);
      }
    } else {
      cloudConnected = false;
      // Cloud offline — fall back to local-only protection
      if (!cloudConnected) {
        upstreamDataValid = false;
        // In local mode, rely only on local sensor data
      }
    }
    http.stop();
    wdt_reset();
  #endif
}

// Poll for pending commands from cloud
// Only two commands are possible from the fault engine:
//   DISABLE_OUTGOING_RELAY — fault detected downstream
//   ENABLE_OUTGOING_RELAY  — fault cleared downstream
void pollCommands() {
  String path = String(cmdPollPath) + String(POLE_ID);

  HttpClient http(ethClient, serverAddress, serverPort);
  http.get(path.c_str());

  int status = http.responseStatusCode();
  if (status == 200) {
    String body = http.responseBody();

    // Only handle outgoing relay commands (the only ones the cloud sends)
    if (body.indexOf("DISABLE_OUTGOING_RELAY") >= 0) {
      #if !IS_TERMINAL
        enableRelay(false, false);       // Disable outgoing relay
        currentState = STATE_FAULT_DOWNSTREAM;
        faultFlag = true;
        digitalWrite(BUZZER_PIN, HIGH);
        Serial.println(F("📩 CMD: Disable outgoing relay — fault downstream"));
      #endif
    }
    if (body.indexOf("ENABLE_OUTGOING_RELAY") >= 0 && body.indexOf("DISABLE") < 0) {
      #if !IS_TERMINAL
        enableRelay(false, true);        // Re-enable outgoing relay
        currentState = STATE_RECOVERY;
        recoveryStart = millis();
        Serial.println(F("📩 CMD: Enable outgoing relay — fault cleared"));
      #endif
    }
  }
  http.stop();
  wdt_reset();
}
