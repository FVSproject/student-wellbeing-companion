# Hand-rest sensor firmware — Student Wellbeing Companion

Firmware for the ESP32 DevKitC-32 inside the hand-shaped sensor pad. Reads the
biometric sensors (MAX30102 under the fingertip, GSR under two other fingertips,
MLX90614 above the back of the hand) and streams the packed sample bundle over
BLE to the counselor's browser (Web Bluetooth).

## Wiring

| ESP32 pin | Connects to | Notes |
|---|---|---|
| GPIO 21 (SDA) | MAX30102 SDA · MLX90614 SDA | Shared I2C bus |
| GPIO 22 (SCL) | MAX30102 SCL · MLX90614 SCL | Shared I2C bus |
| GPIO 34       | Grove GSR yellow (SIG) | ADC1, input-only |
| GPIO 35       | Battery voltage divider midpoint | Optional, ADC1 |
| GPIO 2 (LED)  | onboard blue LED | No wiring needed |
| 3V3           | MAX30102 VIN · MLX90614 VCC · Grove GSR red | |
| GND           | MAX30102 GND · MLX90614 GND · Grove GSR black | Star-ground |
| VIN           | JSD19 boost OUT+ (5 V) | Power feed |
| GND           | JSD19 boost OUT− | |

**Battery divider (optional but recommended):** two 10 kΩ resistors from JSD19
B+ (positive battery terminal) → GPIO 35 → GND. This halves the ~4.2 V battery
voltage to a safe reading on the 3.3 V ADC.

## LED behavior

| State | LED |
|---|---|
| Advertising, waiting for browser | Slow blink (1 Hz) |
| Paired with browser | Solid on |
| No power | Off |

## Toolchain

Use **PlatformIO** (VS Code extension or CLI). Arduino IDE also works — copy
`src/main.cpp` into a `.ino` file and install the same libraries.

### First-time setup

```
pio run                # compile
pio run --target upload    # flash (auto-detects the COM port)
pio device monitor         # open serial monitor at 115200 baud
```

## Library dependencies

Auto-installed via `platformio.ini`:

- `SparkFun MAX3010x Pulse and Proximity Sensor Library` — HR + IR/red LED driver
- `Adafruit MLX90614 Library` — contactless temp
- Wire + ESP32 BLE library — bundled with the ESP32 Arduino framework

## What the firmware does

1. Boots, initializes I2C, both sensors, and BLE.
2. Advertises the service `a1b2c3d4-e5f6-4788-9abc-000000001000`.
3. When a browser pairs, streams a **21-byte packed sample bundle** every 5 s
   over the sample characteristic (`…1001`).
4. Between bundle sends, continuously polls the MAX30102 for beat detection
   (HR + RMSSD).
5. Reads GSR (via `analogRead`) and skin temp (via MLX90614) at bundle time.
6. Reports battery %, using the voltage divider if wired, or invalid if not.

## Sample bundle layout (21 bytes, little-endian)

Matches `decodeSampleBundle` in `src/lib/ble.ts` on the web platform. **Do not
change without updating both sides.**

| Offset | Field         | Type   | Notes |
|---|---|---|---|
| 0..3   | timestampMs   | u32    | millis() since boot |
| 4..5   | heartRate     | i16    | bpm; -1 = invalid |
| 6..9   | hrv           | f32    | RMSSD ms; NaN = invalid |
| 10     | spo2          | u8     | % ; 0xFF = invalid (not implemented yet) |
| 11..14 | gsr           | f32    | µS; NaN = invalid |
| 15..18 | skinTemp      | f32    | °C; NaN = invalid |
| 19     | motionScore   | u8     | 0 (no MPU6050 in this build) |
| 20     | batteryPct    | u8     | 0..100 |

## What's stubbed / TODO

- **SpO2** currently reports `0xFF` (invalid). Adding it requires the Maxim
  algorithm on rolling 100-sample buffers — pull in `spo2_algorithm.h` from
  the SparkFun examples and enable when ready.
- **GSR calibration** uses a rough linear voltage-to-microsiemens map. Refine
  once you have real subjects in the pilot.
- **Motion** field is always 0 since MPU6050 is not in this build.
- **Power management** — no deep sleep yet. Add before Foundation deployment
  to extend battery life.

## Testing without the platform

Open the serial monitor at 115200. Every 5 seconds you'll see a `[sample] …`
line with the current readings. This confirms the sensors are wired correctly
before you attempt BLE pairing.

Then in Chrome / Edge on desktop, use the "Pair device" button on the
counselor dashboard's live session page — it filters by our service UUID and
will list "Wellbeing-01".
