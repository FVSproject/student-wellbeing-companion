/*
  Student Wellbeing Companion — hand-rest sensor firmware
  =================================================
  Target : Seeed Studio XIAO ESP32-S3 (11-pin, USB-C, on-board LiPo charger)
  Sensors: MAX30102 (HR + SpO2), MLX90614 (skin temp), Grove GSR
  Power  : LiPo direct to XIAO BAT+/BAT- pads (on-board charger)
  Comms  : BLE GATT — the counselor's browser pairs via Web Bluetooth.

  Wire the sensors per firmware/wearable/README.md.

  Pin notes for XIAO ESP32-S3 (silkscreen → GPIO):
    D4 = GPIO 5  → SDA (I2C default)
    D5 = GPIO 6  → SCL (I2C default)
    D0 = GPIO 1  → GSR analog (ADC1_CH0)
    D1 = GPIO 2  → optional battery-sense (ADC1_CH1)
    LED_BUILTIN = GPIO 21 → on-board yellow LED (ACTIVE-LOW)

  The BLE service contract MUST stay in sync with
  D:/Projects/2026-2027/Student Wellbeing Companion/src/lib/ble.ts on the
  web platform. UUIDs and the 21-byte packed sample bundle layout below
  are what the browser decoder expects.
*/

#include <Arduino.h>
#include <Wire.h>
#include <math.h>

#include <MAX30105.h>
#include "heartRate.h"
#include "spo2_algorithm.h"
#include <Adafruit_MLX90614.h>

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------- pins (XIAO ESP32-S3) ----------
constexpr uint8_t PIN_I2C_SDA      = 5;    // D4  — I2C SDA default
constexpr uint8_t PIN_I2C_SCL      = 6;    // D5  — I2C SCL default
constexpr uint8_t PIN_GSR          = 1;    // D0  — ADC1_CH0
constexpr uint8_t PIN_BATT_SENSE   = 2;    // D1  — ADC1_CH1, optional divider
constexpr uint8_t PIN_STATUS_LED   = 21;   // LED_BUILTIN, ACTIVE-LOW yellow LED

// XIAO's built-in LED is inverted: LOW = on, HIGH = off.
inline void ledOn()  { digitalWrite(PIN_STATUS_LED, LOW); }
inline void ledOff() { digitalWrite(PIN_STATUS_LED, HIGH); }
inline void ledToggle() {
  digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
}

// ---------- BLE identifiers (must match src/lib/ble.ts) ----------
constexpr char BLE_DEVICE_NAME[]     = "Wellbeing-01";
constexpr char SERVICE_UUID[]        = "a1b2c3d4-e5f6-4788-9abc-000000001000";
constexpr char SAMPLE_CHAR_UUID[]    = "a1b2c3d4-e5f6-4788-9abc-000000001001";
constexpr char DEVICE_INFO_CHAR_UUID[] = "a1b2c3d4-e5f6-4788-9abc-000000001002";

// ---------- protocol: 21-byte packed sample bundle ----------
// Field order + offsets EXACTLY match `decodeSampleBundle` on the browser.
#pragma pack(push, 1)
struct SampleBundle {
  uint32_t timestampMs;   // 0..3  — millis() since boot
  int16_t  heartRate;     // 4..5  — bpm; -1 = invalid
  float    hrv;           // 6..9  — RMSSD ms; NaN = invalid
  uint8_t  spo2;          // 10    — percent; 0xFF = invalid
  float    gsr;           // 11..14 — microsiemens; NaN = invalid
  float    skinTemp;      // 15..18 — celsius; NaN = invalid
  uint8_t  motionScore;   // 19    — 0..255 → 0..1 (no MPU6050 in this build → 0)
  uint8_t  batteryPct;    // 20    — 0..100
};
#pragma pack(pop)
static_assert(sizeof(SampleBundle) == 21, "SampleBundle must be 21 bytes packed");

// ---------- sensor objects ----------
MAX30105              hrSensor;
Adafruit_MLX90614     tempSensor;

// ---------- state ----------
BLEServer*         bleServer     = nullptr;
BLECharacteristic* sampleChar    = nullptr;
BLECharacteristic* deviceInfoChar = nullptr;
volatile bool      clientConnected = false;
volatile bool      advertising     = false;

// Heart-rate detection state
constexpr uint8_t IBI_BUF = 16;
float             ibiBuffer[IBI_BUF] = {0};
uint8_t           ibiIndex           = 0;
uint32_t          lastBeatMs         = 0;
float             beatsPerMinute     = NAN;
bool              hasBeat            = false;

// SpO2 algorithm buffers — needs 100 samples of both IR and red LED at 25 Hz.
constexpr int32_t SPO2_BUF_LEN = 100;
uint32_t irBuffer[SPO2_BUF_LEN];
uint32_t redBuffer[SPO2_BUF_LEN];
int      spo2SamplesFilled  = 0;
int32_t  spo2Percent        = -1;
int8_t   spo2Valid          = 0;
int32_t  hrFromSpo2Algo     = -1;
int8_t   hrFromSpo2Valid    = 0;

// Persistence: Maxim algorithm sometimes flips valid HR without valid SpO2
// (or vice versa). Holding the last valid reading for 15 s keeps both fields
// visible on the platform even when a single window is "invalid".
constexpr uint32_t VALID_HOLD_MS = 15000;
int      lastValidHr        = -1;
uint32_t lastValidHrMs      = 0;
uint8_t  lastValidSpo2      = 0xFF;
uint32_t lastValidSpo2Ms    = 0;

// HR median filter — rejects Maxim's occasional double-peak / harmonic reads
// (200+ bpm spikes when signal quality dips). A rolling median of 5 keeps
// steady-state readings and throws out lone outliers.
constexpr int HR_MEDIAN_SIZE = 5;
int hrHistory[HR_MEDIAN_SIZE] = {0};
int hrHistoryCount = 0;

// Physiologically realistic range for a seated counseling session.
constexpr int HR_MIN_BPM = 40;
constexpr int HR_MAX_BPM = 160;

static int computeMedianHr() {
  if (hrHistoryCount == 0) return -1;
  int sorted[HR_MEDIAN_SIZE];
  for (int i = 0; i < hrHistoryCount; i++) sorted[i] = hrHistory[i];
  for (int i = 1; i < hrHistoryCount; i++) {
    int key = sorted[i];
    int j = i - 1;
    while (j >= 0 && sorted[j] > key) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = key;
  }
  return sorted[hrHistoryCount / 2];
}

static void pushHrReading(int bpm) {
  int median = computeMedianHr();
  if (median > 0 && abs(bpm - median) > 35) return;
  if (hrHistoryCount < HR_MEDIAN_SIZE) {
    hrHistory[hrHistoryCount++] = bpm;
  } else {
    for (int i = 0; i < HR_MEDIAN_SIZE - 1; i++) hrHistory[i] = hrHistory[i + 1];
    hrHistory[HR_MEDIAN_SIZE - 1] = bpm;
  }
}

// Sensor presence flags — populated in setup(), used to gate reads.
bool hrSensorOk   = false;
bool tempSensorOk = false;

// ---------- BLE callbacks ----------
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* /*server*/) override {
    clientConnected = true;
    ledOn();  // solid = paired
    Serial.println("[ble] client connected");
  }
  void onDisconnect(BLEServer* server) override {
    clientConnected = false;
    ledOff();
    Serial.println("[ble] client disconnected — restarting advertising");
    // Slight delay lets the stack clean up before re-advertising.
    delay(200);
    server->startAdvertising();
    advertising = true;
  }
};

// ---------- helpers ----------
static float readGsrMicrosiemens() {
  // Grove GSR outputs 0..VCC; higher voltage = higher skin conductance.
  // Skin conductance changes SLOWLY (seconds), so an 8-sample average
  // dampens ADC noise without hiding the real signal.
  constexpr int SAMPLES = 8;
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogRead(PIN_GSR);
    delayMicroseconds(200);
  }
  int raw = sum / SAMPLES;
  float voltage = (raw / 4095.0f) * 3.3f;
  // Rough mapping: 0.5 V → ~1 µS, 2.5 V → ~10 µS. Refine with real subjects.
  float uS = fmaxf(0.0f, (voltage - 0.3f) * 5.0f);
  return uS;
}

static uint8_t readBatteryPct() {
  // Voltage divider: two 10 kΩ resistors, midpoint on GPIO35.
  int raw = analogRead(PIN_BATT_SENSE);
  float vbat = (raw / 4095.0f) * 3.3f * 2.0f;
  // Map 3.3 V (empty) → 4.2 V (full) linearly.
  float pct = ((vbat - 3.3f) / (4.2f - 3.3f)) * 100.0f;
  if (pct < 0)   pct = 0;
  if (pct > 100) pct = 100;
  return (uint8_t)pct;
}

static float computeRmssd() {
  // RMSSD = sqrt(mean of squared successive differences of IBIs).
  // Need at least 3 IBIs to be meaningful.
  int valid = 0;
  float squaredSum = 0.0f;
  for (int i = 1; i < IBI_BUF; i++) {
    if (ibiBuffer[i] > 0 && ibiBuffer[i - 1] > 0) {
      float diff = ibiBuffer[i] - ibiBuffer[i - 1];
      squaredSum += diff * diff;
      valid++;
    }
  }
  if (valid < 2) return NAN;
  return sqrtf(squaredSum / valid);
}

// Drain FIFO into the rolling IR + Red buffers. That's the only thing
// this function does — beat detection runs off the same buffer inside
// updateSpo2() so we never fight sample-rate timing issues.
static void pumpMaxSensor() {
  if (!hrSensorOk) return;
  hrSensor.check();
  while (hrSensor.available()) {
    uint32_t red = hrSensor.getRed();
    uint32_t ir  = hrSensor.getIR();

    if (spo2SamplesFilled < SPO2_BUF_LEN) {
      irBuffer[spo2SamplesFilled]  = ir;
      redBuffer[spo2SamplesFilled] = red;
      spo2SamplesFilled++;
    } else {
      for (int i = 0; i < SPO2_BUF_LEN - 1; i++) {
        irBuffer[i]  = irBuffer[i + 1];
        redBuffer[i] = redBuffer[i + 1];
      }
      irBuffer[SPO2_BUF_LEN - 1]  = ir;
      redBuffer[SPO2_BUF_LEN - 1] = red;
    }
    hrSensor.nextSample();
  }
}

// Custom peak detector — state-machine style, robust to PPG noise/plateaus
// that trip strict local-max checks. Runs on the same 100-sample IR buffer
// the SpO2 algorithm uses. Populates ibiBuffer with fresh IBIs for HRV.
static void detectBeatsFromBuffer() {
  if (spo2SamplesFilled < SPO2_BUF_LEN) return;

  uint64_t sum = 0;
  uint32_t maxIr = 0;
  uint32_t minIr = 0xFFFFFFFF;
  for (int i = 0; i < SPO2_BUF_LEN; i++) {
    sum += irBuffer[i];
    if (irBuffer[i] > maxIr) maxIr = irBuffer[i];
    if (irBuffer[i] < minIr) minIr = irBuffer[i];
  }
  uint32_t mean  = sum / SPO2_BUF_LEN;
  uint32_t range = maxIr - minIr;

  for (int i = 0; i < IBI_BUF; i++) ibiBuffer[i] = 0;
  ibiIndex = 0;

  if (mean < 50000 || range < 200) {
    hasBeat = false;
    return;
  }

  // 60 % of the way between min and max — genuine peaks cross, ripple stays below.
  uint32_t threshold = minIr + (range * 3) / 5;

  const float SAMPLE_INTERVAL_MS = 40.0f;
  const int   MIN_GAP            = 8;

  bool wasAbove     = false;
  int  enteredAtIdx = -1;
  int  lastPeakIdx  = -MIN_GAP - 1;
  int  beatCount    = 0;

  for (int i = 0; i < SPO2_BUF_LEN; i++) {
    bool above = (irBuffer[i] > threshold);
    if (above && !wasAbove) {
      enteredAtIdx = i;
    } else if (!above && wasAbove) {
      int peakIdx = (enteredAtIdx + i - 1) / 2;
      if (peakIdx - lastPeakIdx >= MIN_GAP) {
        if (beatCount > 0) {
          float ibiMs = (peakIdx - lastPeakIdx) * SAMPLE_INTERVAL_MS;
          if (ibiMs >= 300.0f && ibiMs <= 2000.0f && ibiIndex < IBI_BUF) {
            ibiBuffer[ibiIndex++] = ibiMs;
          }
        }
        lastPeakIdx = peakIdx;
        beatCount++;
      }
    }
    wasAbove = above;
  }

  hasBeat = (ibiIndex >= 2);
  if (ibiIndex > 0) beatsPerMinute = 60000.0f / ibiBuffer[ibiIndex - 1];

  // Diagnostic — comment out once HRV is stable.
  Serial.printf(
    "[hrv-debug] mean=%u range=%u thr=%u peaks=%d ibis=%d\n",
    mean, range, threshold, beatCount, ibiIndex
  );
}

static void updateSpo2() {
  if (spo2SamplesFilled < SPO2_BUF_LEN) return;
  if (irBuffer[SPO2_BUF_LEN - 1] < 50000) {
    spo2Valid = 0;
    spo2Percent = -1;
    hrFromSpo2Valid = 0;
    hasBeat = false;
    return;
  }
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, SPO2_BUF_LEN, redBuffer,
    &spo2Percent, &spo2Valid,
    &hrFromSpo2Algo, &hrFromSpo2Valid
  );
  detectBeatsFromBuffer();
}

static void fillSampleBundle(SampleBundle& b) {
  b.timestampMs = millis();

  // Run algorithms + peak detector before deciding what to publish.
  updateSpo2();

  const uint32_t now = millis();

  // HR pipeline: candidate → range clamp → median filter → 15 s hold cache.
  int candidateHr = -1;
  if (hrFromSpo2Valid && hrFromSpo2Algo >= HR_MIN_BPM && hrFromSpo2Algo <= HR_MAX_BPM) {
    candidateHr = (int)hrFromSpo2Algo;
  } else if (hasBeat && !isnan(beatsPerMinute)) {
    int bpm = (int)beatsPerMinute;
    if (bpm >= HR_MIN_BPM && bpm <= HR_MAX_BPM) candidateHr = bpm;
  }
  if (candidateHr > 0) {
    pushHrReading(candidateHr);
    int filtered = computeMedianHr();
    if (filtered > 0) {
      lastValidHr   = filtered;
      lastValidHrMs = now;
    }
  }
  b.heartRate = (lastValidHr > 0 && (now - lastValidHrMs) < VALID_HOLD_MS)
                  ? (int16_t)lastValidHr
                  : -1;

  // HRV removed from display — kept as NaN so downstream consumers see "no data".
  b.hrv = NAN;

  // SpO2 with the same persistence pattern.
  uint8_t freshSpo2 = 0xFF;
  if (spo2Valid && spo2Percent >= 70 && spo2Percent <= 100) {
    freshSpo2 = (uint8_t)spo2Percent;
  }
  if (freshSpo2 != 0xFF) {
    lastValidSpo2   = freshSpo2;
    lastValidSpo2Ms = now;
  }
  b.spo2 = (lastValidSpo2 != 0xFF && (now - lastValidSpo2Ms) < VALID_HOLD_MS)
             ? lastValidSpo2
             : 0xFF;

  // GSR: clamp to 0..100 µS. Above that = sensor error or short.
  float gsr = readGsrMicrosiemens();
  if (isnan(gsr) || gsr < 0.0f || gsr > 100.0f) gsr = NAN;
  b.gsr = gsr;

  if (tempSensorOk) {
    float objectC = tempSensor.readObjectTempC();
    float ambientC = tempSensor.readAmbientTempC();
    // Diagnostic: print the RAW reading so you can tell whether the sensor
    // is stuck reading room air vs skin. Remove once you're happy.
    Serial.printf("[temp] object=%.2fC ambient=%.2fC\n", objectC, ambientC);
    b.skinTemp = (objectC > 20.0f && objectC < 45.0f) ? objectC : NAN;
  } else {
    b.skinTemp = NAN;
  }

  b.motionScore = 0; // No MPU6050 in this build.

  b.batteryPct = readBatteryPct();
}

// ---------- setup ----------
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[boot] Student Wellbeing Companion hand-rest sensor");

  pinMode(PIN_STATUS_LED, OUTPUT);
  ledOff();

  analogReadResolution(12); // 0..4095 for GSR + battery

  // 100 kHz I2C — MLX90614 is slow-bus only. MAX30102 handles both speeds
  // fine so we standardize on the lower speed to keep both sensors happy.
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 100000);
  delay(250); // let sensors finish their internal power-on before we probe

  // MAX30102 init tuned for both HR and SpO2:
  //   ledBrightness = 0x1F (moderate) — Red LED needs adequate signal for SpO2
  //   sampleAverage = 4 (internal averaging)
  //   ledMode       = 2 (Red + IR, required for SpO2)
  //   sampleRate    = 100 Hz  → 25 Hz after 4x averaging → 4 s per 100-sample window
  //   pulseWidth    = 411 µs, adcRange = 4096
  if (hrSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    hrSensor.setup(0x1F, 4, 2, 100, 411, 4096);
    hrSensor.setPulseAmplitudeRed(0x1F);
    hrSensor.setPulseAmplitudeIR(0x1F);
    hrSensor.setPulseAmplitudeGreen(0);
    hrSensorOk = true;
    Serial.println("[boot] MAX30102 ready");
  } else {
    Serial.println("[boot] MAX30102 NOT FOUND — check I2C wiring / power");
  }

  // MLX90614 init
  if (tempSensor.begin()) {
    tempSensorOk = true;
    Serial.println("[boot] MLX90614 ready");
  } else {
    Serial.println("[boot] MLX90614 NOT FOUND — check I2C wiring / power");
  }

  // BLE init
  BLEDevice::init(BLE_DEVICE_NAME);
  BLEDevice::setMTU(64); // Bundle is 21 bytes; default 23 works but we ask for more.

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService* service = bleServer->createService(SERVICE_UUID);

  sampleChar = service->createCharacteristic(
    SAMPLE_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  sampleChar->addDescriptor(new BLE2902());

  deviceInfoChar = service->createCharacteristic(
    DEVICE_INFO_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ
  );
  // ASCII: "<serial>|<firmwareRev>" — matches the browser contract.
  deviceInfoChar->setValue("wellbeing-01|0.1.0");

  service->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  adv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  advertising = true;

  Serial.println("[boot] BLE advertising as " + String(BLE_DEVICE_NAME));
}

// ---------- loop ----------
uint32_t lastBundleMs = 0;
uint32_t lastBlinkMs  = 0;

void loop() {
  // 1) Drain new samples — feeds beat detector AND SpO2 rolling buffer.
  pumpMaxSensor();

  // 2) Emit a sample bundle every 5 seconds (matches the platform's expected cadence).
  const uint32_t now = millis();
  if (now - lastBundleMs >= 5000) {
    lastBundleMs = now;

    SampleBundle bundle;
    fillSampleBundle(bundle);

    if (clientConnected) {
      sampleChar->setValue((uint8_t*)&bundle, sizeof(bundle));
      sampleChar->notify();
    }

    // Debug log — useful during bench-testing without a paired browser.
    Serial.printf(
      "[sample] t=%lu hr=%d hrv=%.1f spo2=%u gsr=%.2f temp=%.2f batt=%u%%\n",
      (unsigned long)bundle.timestampMs,
      (int)bundle.heartRate,
      isnan(bundle.hrv) ? -1.0 : bundle.hrv,
      bundle.spo2,
      isnan(bundle.gsr) ? -1.0 : bundle.gsr,
      isnan(bundle.skinTemp) ? -1.0 : bundle.skinTemp,
      bundle.batteryPct
    );
  }

  // 3) LED heartbeat: slow blink while advertising, solid while connected.
  if (!clientConnected && advertising) {
    if (now - lastBlinkMs >= 1000) {
      lastBlinkMs = now;
      ledToggle();
    }
  }

  // Yield to the RTOS so BLE stack isn't starved. Very short — beat detector
  // needs frequent getIR() calls to catch pulses.
  delay(5);
}
