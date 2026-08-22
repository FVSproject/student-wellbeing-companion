/*
  Student Wellbeing Companion — hand-rest sensor firmware (Arduino IDE version)
  =====================================================================
  Target : Seeed Studio XIAO ESP32-S3 (11-pin, USB-C, on-board LiPo charger)
  Sensors: MAX30102 (HR + SpO2), MLX90614 (skin temp), Grove GSR
  Power  : LiPo → XIAO BAT+/BAT- pads (on-board charger via USB-C)
  Comms  : BLE GATT — the counselor's browser pairs via Web Bluetooth.

  ------------------------------------------------------------------
  ARDUINO IDE SETUP
  ------------------------------------------------------------------
  1. Install ESP32 boards package:
       Preferences → Additional Board Manager URLs:
         https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
       Boards Manager → search "esp32" → install (v2.0.14 or later).

  2. Select the board:
       Tools → Board → ESP32 Arduino → "XIAO_ESP32S3"
       Tools → USB CDC On Boot → "Enabled"   (so Serial works over USB-C)
       Tools → Partition Scheme → "Huge APP (3MB No OTA/1MB SPIFFS)"
       Tools → Upload Speed → 921600

  3. Install libraries (Sketch → Include Library → Manage Libraries):
       - "SparkFun MAX3010x Pulse and Proximity Sensor Library"
       - "Adafruit MLX90614 Library"

  4. Flash. If flashing fails, put the XIAO in bootloader mode: hold BOOT,
     tap RESET, release BOOT. Open Serial Monitor at 115200 baud.
  ------------------------------------------------------------------

  WIRING (XIAO ESP32-S3 silkscreen labels):
    D4  (GPIO 5)  → SDA (MAX30102 + MLX90614)
    D5  (GPIO 6)  → SCL (MAX30102 + MLX90614)
    D0  (GPIO 1)  → GSR yellow (SIG)             — ADC1_CH0
    D1  (GPIO 2)  → battery voltage divider mid  — ADC1_CH1, optional
    3V3           → sensor VCC (MAX30102, MLX90614, Grove GSR red)
    GND           → sensor GND (star topology)
    BAT+, BAT-    → LiPo (on-board charger — USB-C charges the pack)

  LED: LED_BUILTIN (GPIO 21) — the on-board yellow LED is ACTIVE-LOW,
       so writing LOW turns it on.

  Sample bundle protocol MUST match src/lib/ble.ts on the web platform.
*/

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
const uint8_t PIN_I2C_SDA    = 5;   // D4  — I2C SDA default
const uint8_t PIN_I2C_SCL    = 6;   // D5  — I2C SCL default
const uint8_t PIN_GSR        = 1;   // D0  — ADC1_CH0
const uint8_t PIN_BATT_SENSE = 2;   // D1  — ADC1_CH1, optional divider
const uint8_t PIN_STATUS_LED = 21;  // LED_BUILTIN, ACTIVE-LOW yellow LED

// The XIAO's on-board LED is inverted vs. classic ESP32 DevKit: LOW = on.
inline void ledOn()     { digitalWrite(PIN_STATUS_LED, LOW); }
inline void ledOff()    { digitalWrite(PIN_STATUS_LED, HIGH); }
inline void ledToggle() {
  digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
}

// ---------- BLE identifiers (must match src/lib/ble.ts) ----------
const char* BLE_DEVICE_NAME       = "Wellbeing-01";
const char* SERVICE_UUID          = "a1b2c3d4-e5f6-4788-9abc-000000001000";
const char* SAMPLE_CHAR_UUID      = "a1b2c3d4-e5f6-4788-9abc-000000001001";
const char* DEVICE_INFO_CHAR_UUID = "a1b2c3d4-e5f6-4788-9abc-000000001002";

// ---------- 21-byte packed sample bundle ----------
#pragma pack(push, 1)
struct SampleBundle {
  uint32_t timestampMs;   // 0..3
  int16_t  heartRate;     // 4..5  — bpm; -1 = invalid
  float    hrv;           // 6..9  — RMSSD ms; NaN = invalid
  uint8_t  spo2;          // 10    — %; 0xFF = invalid
  float    gsr;           // 11..14 — µS; NaN = invalid
  float    skinTemp;      // 15..18 — °C; NaN = invalid
  uint8_t  motionScore;   // 19    — 0 (no MPU6050 in this build)
  uint8_t  batteryPct;    // 20    — 0..100
};
#pragma pack(pop)
static_assert(sizeof(SampleBundle) == 21, "SampleBundle must be 21 bytes packed");

// Explicit forward declarations for functions that take SampleBundle&.
// The Arduino IDE preprocessor auto-generates prototypes at the top of the
// file (BEFORE the struct is defined) which breaks compilation. Declaring
// them here after the struct suppresses the auto-generated ones.
void fillSampleBundle(SampleBundle& b);

// ---------- sensor objects ----------
MAX30105          hrSensor;
Adafruit_MLX90614 tempSensor;

// ---------- BLE state ----------
BLEServer*         bleServer       = NULL;
BLECharacteristic* sampleChar      = NULL;
BLECharacteristic* deviceInfoChar  = NULL;
volatile bool      clientConnected = false;
volatile bool      advertising     = false;

// ---------- beat detector state (for HRV) ----------
const uint8_t IBI_BUF = 16;
float    ibiBuffer[IBI_BUF] = {0};
uint8_t  ibiIndex           = 0;
uint32_t lastBeatMs         = 0;
float    beatsPerMinute     = NAN;
bool     hasBeat            = false;

// ---------- SpO2 algorithm buffers ----------
// 100 samples of paired IR+Red at 25 Hz effective = 4 second window.
const int32_t SPO2_BUF_LEN = 100;
uint32_t irBuffer[SPO2_BUF_LEN];
uint32_t redBuffer[SPO2_BUF_LEN];
int      spo2SamplesFilled = 0;
int32_t  spo2Percent       = -1;
int8_t   spo2Valid         = 0;
int32_t  hrFromSpo2Algo    = -1;
int8_t   hrFromSpo2Valid   = 0;

// Persistence: Maxim algorithm sometimes flips valid HR without valid SpO2
// (or vice versa). Holding the last valid reading for 15 s keeps both fields
// visible on the platform even when a single window is "invalid".
const uint32_t VALID_HOLD_MS = 15000;
int      lastValidHr        = -1;
uint32_t lastValidHrMs      = 0;
uint8_t  lastValidSpo2      = 0xFF;
uint32_t lastValidSpo2Ms    = 0;

// HR median filter — rejects Maxim's occasional double-peak / harmonic reads
// (200+ bpm spikes when signal quality dips). A rolling median of 5 keeps
// steady-state readings and throws out lone outliers.
const int HR_MEDIAN_SIZE = 5;
int hrHistory[HR_MEDIAN_SIZE] = {0};
int hrHistoryCount = 0;

// Physiologically realistic range for a seated counseling session.
// A resting adult sits at 60-100; anxious/animated peaks around 130-150.
// Anything past 160 or below 40 in this setting is almost certainly noise.
const int HR_MIN_BPM = 40;
const int HR_MAX_BPM = 160;

int computeMedianHr() {
  if (hrHistoryCount == 0) return -1;
  int sorted[HR_MEDIAN_SIZE];
  for (int i = 0; i < hrHistoryCount; i++) sorted[i] = hrHistory[i];
  // Insertion sort — n <= 5.
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

void pushHrReading(int bpm) {
  // Rate-limit: reject anything > 35 bpm from current median (except first reading).
  int median = computeMedianHr();
  if (median > 0 && abs(bpm - median) > 35) return;
  // Shift left, append newest.
  if (hrHistoryCount < HR_MEDIAN_SIZE) {
    hrHistory[hrHistoryCount++] = bpm;
  } else {
    for (int i = 0; i < HR_MEDIAN_SIZE - 1; i++) hrHistory[i] = hrHistory[i + 1];
    hrHistory[HR_MEDIAN_SIZE - 1] = bpm;
  }
}

bool hrSensorOk   = false;
bool tempSensorOk = false;

// ---------- BLE callbacks ----------
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) {
    clientConnected = true;
    ledOn();  // solid = paired
    Serial.println("[ble] client connected");
  }
  void onDisconnect(BLEServer* server) {
    clientConnected = false;
    ledOff();
    Serial.println("[ble] client disconnected — restarting advertising");
    delay(200);
    server->startAdvertising();
    advertising = true;
  }
};

// ---------- helpers ----------
float readGsrMicrosiemens() {
  const int SAMPLES = 8;
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogRead(PIN_GSR);
    delayMicroseconds(200);
  }
  int raw = sum / SAMPLES;
  float voltage = (raw / 4095.0f) * 3.3f;
  float uS = fmaxf(0.0f, (voltage - 0.3f) * 5.0f);
  return uS;
}

uint8_t readBatteryPct() {
  int raw = analogRead(PIN_BATT_SENSE);
  float vbat = (raw / 4095.0f) * 3.3f * 2.0f;
  float pct = ((vbat - 3.3f) / (4.2f - 3.3f)) * 100.0f;
  if (pct < 0)   pct = 0;
  if (pct > 100) pct = 100;
  return (uint8_t)pct;
}

float computeRmssd() {
  int   valid = 0;
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
// this function does now — beat detection runs off the same buffer inside
// updateSpo2() so we never fight sample-rate timing issues.
void pumpMaxSensor() {
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
void detectBeatsFromBuffer() {
  if (spo2SamplesFilled < SPO2_BUF_LEN) return;

  // Stats over the whole window
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

  // Wipe old IBIs each call — HRV is always from the freshest window.
  for (int i = 0; i < IBI_BUF; i++) ibiBuffer[i] = 0;
  ibiIndex = 0;

  if (mean < 50000 || range < 200) {
    hasBeat = false;
    return;
  }

  // Threshold at 60 % of the way between min and max — genuine peaks cross
  // this, small ripple stays below.
  uint32_t threshold = minIr + (range * 3) / 5;

  const float SAMPLE_INTERVAL_MS = 40.0f; // 25 Hz effective
  const int   MIN_GAP            = 8;     // ≥ 320 ms between beats (≤ 188 bpm)

  // Cross-threshold state machine — peak = midpoint of the "above" region.
  bool wasAbove       = false;
  int  enteredAtIdx   = -1;
  int  lastPeakIdx    = -MIN_GAP - 1;
  int  beatCount      = 0;

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
  Serial.print("[hrv-debug] mean=");
  Serial.print(mean);
  Serial.print(" range=");
  Serial.print(range);
  Serial.print(" thr=");
  Serial.print(threshold);
  Serial.print(" peaks=");
  Serial.print(beatCount);
  Serial.print(" ibis=");
  Serial.println(ibiIndex);
}

void updateSpo2() {
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
  // Run our own peak detection on the same buffer to populate IBIs for HRV.
  detectBeatsFromBuffer();
}

void fillSampleBundle(SampleBundle& b) {
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

  float gsr = readGsrMicrosiemens();
  if (isnan(gsr) || gsr < 0.0f || gsr > 100.0f) gsr = NAN;
  b.gsr = gsr;

  if (tempSensorOk) {
    float objectC  = tempSensor.readObjectTempC();
    float ambientC = tempSensor.readAmbientTempC();
    Serial.print("[temp] object=");
    Serial.print(objectC, 2);
    Serial.print("C ambient=");
    Serial.print(ambientC, 2);
    Serial.println("C");
    b.skinTemp = (objectC > 20.0f && objectC < 45.0f) ? objectC : NAN;
  } else {
    b.skinTemp = NAN;
  }

  b.motionScore = 0;
  b.batteryPct  = readBatteryPct();
}

// ---------- setup ----------
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[boot] Student Wellbeing Companion hand-rest sensor");

  pinMode(PIN_STATUS_LED, OUTPUT);
  ledOff();

  analogReadResolution(12);

  // 100 kHz I2C — MLX90614 is slow-bus only.
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 100000);
  delay(250);

  // MAX30102 setup tuned for BOTH HR and SpO2:
  //   ledBrightness = 0x1F (moderate) — Red LED needs adequate signal for SpO2
  //   sampleAverage = 4
  //   ledMode       = 2 (Red + IR, required for SpO2)
  //   sampleRate    = 100 Hz → 25 Hz effective → 4 s per 100-sample window
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

  if (tempSensor.begin()) {
    tempSensorOk = true;
    Serial.println("[boot] MLX90614 ready");
  } else {
    Serial.println("[boot] MLX90614 NOT FOUND — check I2C wiring / power");
  }

  BLEDevice::init(BLE_DEVICE_NAME);
  BLEDevice::setMTU(64);

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
  deviceInfoChar->setValue("wellbeing-01|0.1.0");

  service->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  adv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  advertising = true;

  Serial.print("[boot] BLE advertising as ");
  Serial.println(BLE_DEVICE_NAME);
}

// ---------- loop ----------
uint32_t lastBundleMs = 0;
uint32_t lastBlinkMs  = 0;

void loop() {
  // 1) Drain new MAX30102 samples — feeds beat detector AND SpO2 buffer.
  pumpMaxSensor();

  uint32_t now = millis();

  // 2) Emit a sample bundle every 5 seconds.
  if (now - lastBundleMs >= 5000) {
    lastBundleMs = now;

    SampleBundle bundle;
    fillSampleBundle(bundle);

    if (clientConnected) {
      sampleChar->setValue((uint8_t*)&bundle, sizeof(bundle));
      sampleChar->notify();
    }

    Serial.print("[sample] t=");
    Serial.print(bundle.timestampMs);
    Serial.print(" hr=");
    Serial.print(bundle.heartRate);
    Serial.print(" hrv=");
    Serial.print(isnan(bundle.hrv) ? -1.0f : bundle.hrv, 1);
    Serial.print(" spo2=");
    Serial.print(bundle.spo2);
    Serial.print(" gsr=");
    Serial.print(isnan(bundle.gsr) ? -1.0f : bundle.gsr, 2);
    Serial.print(" temp=");
    Serial.print(isnan(bundle.skinTemp) ? -1.0f : bundle.skinTemp, 2);
    Serial.print(" batt=");
    Serial.print(bundle.batteryPct);
    Serial.println("%");
  }

  // 3) LED heartbeat.
  if (!clientConnected && advertising) {
    if (now - lastBlinkMs >= 1000) {
      lastBlinkMs = now;
      ledToggle();
    }
  }

  // Keep this small so the beat detector gets fresh IR values often.
  delay(1);
}
