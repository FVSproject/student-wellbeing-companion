/**
 * BLE GATT contract between the ESP32 bracelet and the counselor's browser.
 *
 * The ESP32 firmware exposes ONE custom service with characteristics
 * for each data stream. The browser (via Web Bluetooth) subscribes to
 * notifications on the sample characteristic, receives packed byte
 * bundles, and forwards them to /api/ingest.
 *
 * UUIDs use a project-specific base — regenerate only if a collision
 * is ever found with a standard SIG assigned UUID.
 */

export const BLE = {
  /** Primary custom service exposed by the bracelet. */
  SERVICE_UUID: 'a1b2c3d4-e5f6-4788-9abc-000000001000',

  /**
   * Notify characteristic. Firmware pushes a packed sample bundle every
   * 1 second. Payload layout (20 bytes — sized to fit in the default BLE
   * ATT MTU of 23 which gives 20 bytes of notification payload):
   *
   *   u32 timestampMs  (device millis since boot)  — offset 0..3
   *   i16 heartRate    (bpm, -1 if invalid)         — offset 4..5
   *   f32 hrv          (ms, RMSSD, NaN if invalid)  — offset 6..9
   *   u8  spo2         (%, 0xFF if invalid)         — offset 10
   *   f32 gsr          (microsiemens, NaN if invalid) — offset 11..14
   *   f32 skinTemp     (celsius, NaN if invalid)    — offset 15..18
   *   u8  batteryPct   (0..100)                     — offset 19
   *
   * Total: 20 bytes.
   *
   * Motion was removed on 2026-09-18 — the current build has no MPU-6050
   * and the previous 21-byte bundle exceeded the default MTU by 1 byte,
   * causing every notify after the first to be silently truncated by the
   * BLE stack (browser decoder threw RangeError on offset 20).
   */
  SAMPLE_BUNDLE_CHAR: 'a1b2c3d4-e5f6-4788-9abc-000000001001',

  /** Read-only characteristic: serial number + firmware rev, ASCII. */
  DEVICE_INFO_CHAR: 'a1b2c3d4-e5f6-4788-9abc-000000001002',
} as const;

/** Decode the 20-byte packed sample bundle into a plain JS object. */
export function decodeSampleBundle(view: DataView): {
  timestampMs: number;
  heartRate: number | null;
  hrv: number | null;
  spo2: number | null;
  gsr: number | null;
  skinTemp: number | null;
  motionScore: number;
  batteryPct: number;
} {
  const hr = view.getInt16(4, true);
  const hrv = view.getFloat32(6, true);
  const spo2 = view.getUint8(10);
  const gsr = view.getFloat32(11, true);
  const skinTemp = view.getFloat32(15, true);
  return {
    timestampMs: view.getUint32(0, true),
    heartRate: hr < 0 ? null : hr,
    hrv: Number.isNaN(hrv) ? null : hrv,
    spo2: spo2 === 0xff ? null : spo2,
    gsr: Number.isNaN(gsr) ? null : gsr,
    skinTemp: Number.isNaN(skinTemp) ? null : skinTemp,
    // Motion is no longer transmitted (removed in the 20-byte layout).
    // Kept in the return type as 0 so downstream code doesn't need to change.
    motionScore: 0,
    batteryPct: view.getUint8(19),
  };
}
