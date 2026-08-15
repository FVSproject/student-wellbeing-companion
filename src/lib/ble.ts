/**
 * BLE GATT contract between the ESP32 hand-rest sensor and the counselor's browser.
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
  /** Primary custom service exposed by the hand-rest sensor. */
  SERVICE_UUID: 'a1b2c3d4-e5f6-4788-9abc-000000001000',

  /**
   * Notify characteristic. Firmware pushes a packed sample bundle
   * every ~5 seconds (or on threshold change). Payload layout:
   *
   *   u32 timestampMs  (device millis since boot)
   *   i16 heartRate    (bpm, -1 if invalid)
   *   f32 hrv          (ms, RMSSD, NaN if invalid)
   *   u8  spo2         (%, 0xFF if invalid)
   *   f32 gsr          (microsiemens, NaN if invalid)
   *   f32 skinTemp     (celsius, NaN if invalid)
   *   u8  motionScore  (0..255 → 0..1)
   *   u8  batteryPct   (0..100)
   *
   * Total: 24 bytes. Fits in the default 20-byte MTU only if MTU is
   * renegotiated to >= 27 at connect time — firmware must request this.
   */
  SAMPLE_BUNDLE_CHAR: 'a1b2c3d4-e5f6-4788-9abc-000000001001',

  /** Read-only characteristic: serial number + firmware rev, ASCII. */
  DEVICE_INFO_CHAR: 'a1b2c3d4-e5f6-4788-9abc-000000001002',
} as const;

/** Decode the 24-byte packed sample bundle into a plain JS object. */
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
    motionScore: view.getUint8(19) / 255,
    batteryPct: view.getUint8(20),
  };
}
