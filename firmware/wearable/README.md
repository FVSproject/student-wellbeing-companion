# Hand-rest sensor firmware — Student Wellbeing Companion

Firmware for the **Seeed Studio XIAO ESP32-S3** inside the hand-shaped sensor
pad. Reads the biometric sensors (MAX30102 under the fingertip, GSR under two
other fingertips, MLX90614 above the back of the hand) and streams the packed
sample bundle over BLE to the counselor's browser (Web Bluetooth).

## Board: XIAO ESP32-S3

Very compact (21 × 17.5 mm) ESP32-S3 with USB-C, 8 MB Flash, 8 MB PSRAM, and
on-board LiPo charger circuit. Connect a LiPo to the `BAT+`/`BAT-` pads on the
underside; USB-C both flashes and charges.

Silkscreen labels (`D0`–`D10`) map to underlying GPIOs:

| Silkscreen | GPIO | Notes |
|---|---|---|
| D0 | GPIO 1 | ADC1_CH0 |
| D1 | GPIO 2 | ADC1_CH1 |
| D4 | GPIO 5 | I2C SDA (default) |
| D5 | GPIO 6 | I2C SCL (default) |
| LED_BUILTIN | GPIO 21 | On-board yellow LED, **ACTIVE-LOW** |

## Wiring

| XIAO pin | Connects to | Notes |
|---|---|---|
| **D4** (GPIO 5, SDA) | MAX30102 SDA · MLX90614 SDA | Shared I2C bus |
| **D5** (GPIO 6, SCL) | MAX30102 SCL · MLX90614 SCL | Shared I2C bus |
| **D0** (GPIO 1)      | Grove GSR yellow (SIG) | ADC1_CH0 |
| **D1** (GPIO 2)      | Battery voltage divider midpoint | Optional, ADC1_CH1 |
| **3V3**              | MAX30102 VIN · MLX90614 VCC · Grove GSR red | Regulated 3.3 V from the XIAO |
| **GND**              | MAX30102 GND · MLX90614 GND · Grove GSR black | Star-ground |
| **BAT+ / BAT-** (underside pads) | LiPo | On-board charger — USB-C charges the pack |

**Battery divider (optional but recommended):** two 10 kΩ resistors from
`BAT+` → **D1 (GPIO 2)** → GND. This halves the ~4.2 V battery voltage to a
safe reading on the 3.3 V ADC. Without the divider, `batteryPct` in the
sample bundle reports 0.

**No wristband strap** — the sensors are laid out under a hand-shaped
enclosure. The student rests their palm on it for the duration of the session.

## LED behavior

The XIAO's on-board LED is **active-low** (writing `LOW` turns it on). The
firmware wraps this in `ledOn()` / `ledOff()` / `ledToggle()` helpers, so the
outward behavior matches earlier ESP32 DevKit builds:

| State | LED |
|---|---|
| Advertising, waiting for browser | Slow blink (1 Hz) |
| Paired with browser | Solid on |
| No power | Off |

## Toolchain

Use **PlatformIO** (VS Code extension or CLI). Arduino IDE also works — see
`firmware/wearable_ino/wearable_ino.ino` for the standalone `.ino` variant
with the same pinout.

### First-time setup

```
pio run                    # compile
pio run --target upload    # flash (auto-detects the USB-C serial port)
pio device monitor         # open serial monitor at 115200 baud
```

If flashing fails, put the XIAO in bootloader mode: **hold BOOT, tap RESET,
release BOOT**, then re-run the upload.

## Library dependencies

Auto-installed via `platformio.ini`:

- `SparkFun MAX3010x Pulse and Proximity Sensor Library` — HR + IR/red LED driver
- `Adafruit MLX90614 Library` — contactless temp
- Wire + ESP32 BLE library — bundled with the ESP32 Arduino framework

## What the firmware does

1. Boots, initializes I2C on **D4/D5 at 100 kHz**, both sensors, and BLE.
2. Advertises the service `a1b2c3d4-e5f6-4788-9abc-000000001000`.
3. When a browser pairs, streams a **21-byte packed sample bundle** every 5 s
   over the sample characteristic (`…1001`).
4. Between bundle sends, continuously polls the MAX30102 for beat detection
   (HR + RMSSD).
5. Reads GSR (via `analogRead(D0)`) and skin temp (via MLX90614) at bundle time.
6. Reports battery %, using the voltage divider on D1 if wired, or 0 if not.

## Sample bundle layout (21 bytes, little-endian)

Matches `decodeSampleBundle` in `src/lib/ble.ts` on the web platform. **Do not
change without updating both sides.**

| Offset | Field         | Type   | Notes |
|---|---|---|---|
| 0..3   | timestampMs   | u32    | millis() since boot |
| 4..5   | heartRate     | i16    | bpm; -1 = invalid |
| 6..9   | hrv           | f32    | RMSSD ms; NaN = invalid |
| 10     | spo2          | u8     | % ; 0xFF = invalid |
| 11..14 | gsr           | f32    | µS; NaN = invalid |
| 15..18 | skinTemp      | f32    | °C; NaN = invalid |
| 19     | motionScore   | u8     | 0 (no MPU6050 in this build) |
| 20     | batteryPct    | u8     | 0..100 |

## What's stubbed / TODO

- **SpO2** requires the Maxim algorithm on rolling buffers — pulled in via
  `spo2_algorithm.h`; enable once field-tested.
- **GSR calibration** uses a rough linear voltage-to-microsiemens map. Refine
  once you have real subjects in the pilot.
- **Motion** field is always 0 (no MPU6050 in this build).
- **Power management** — no deep sleep yet. Add before Foundation deployment
  to extend battery life; the XIAO ESP32-S3 supports light + deep sleep with
  low-power BLE wake.

## Testing without the platform

Open the serial monitor at 115200. Every 5 seconds you'll see a `[sample] …`
line with the current readings. This confirms the sensors are wired correctly
before you attempt BLE pairing.

Then in Chrome / Edge on desktop, use the "Pair device" button on the
counselor dashboard's live session page — it filters by our service UUID and
will list "Wellbeing-01".
