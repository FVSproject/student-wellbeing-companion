import { z } from 'zod';

/**
 * The shape POSTed to /api/ingest by the counselor's browser.
 * Samples originate either from the BLE device or (in dev) the
 * simulator — both funnel through the same schema.
 */
// Coerce any out-of-physiological-range number to null instead of failing the
// whole ingest. The firmware may occasionally emit noisy spikes while the
// finger settles on the sensor; dropping the bad reading is better UX than
// rejecting the whole 5-second sample bundle.
const clampToNull = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      if (v == null) return null;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return null;
      return v;
    },
    z.number().nullable().optional()
  );

export const sampleSchema = z.object({
  timestamp: z.string().datetime(),
  heartRate: clampToNull(0, 250),
  hrv: clampToNull(0, 500),
  spo2: clampToNull(0, 100),
  gsr: clampToNull(0, 100),
  skinTemp: clampToNull(0, 50),
  motionScore: clampToNull(0, 1),
  voiceLevel: clampToNull(0, 1),
  batteryPct: clampToNull(0, 100),
});

export const ingestPayloadSchema = z.object({
  sessionId: z.string().min(1),
  locale: z.enum(['en', 'ar']).optional().default('en'),
  samples: z.array(sampleSchema).min(1).max(500),
});

export type Sample = z.infer<typeof sampleSchema>;
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
