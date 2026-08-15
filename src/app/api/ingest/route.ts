import { NextResponse, after } from 'next/server';
import { SessionStatus } from '@prisma/client';
import { getSchoolContext, AuthError } from '@/lib/auth';
import { ingestPayloadSchema } from '@/lib/ingest-schema';
import { publishSessionEvent } from '@/lib/ably';
import { maybeRunAnalysis } from '@/lib/analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { db, user, schoolId } = await getSchoolContext();
    const payload = ingestPayloadSchema.parse(await req.json());

    // Verify session belongs to this school (tenantDb auto-scopes),
    // that the current counselor owns it, and that it's live.
    const session = await db.session.findFirst({ where: { id: payload.sessionId } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.counselorId !== user.id) {
      return NextResponse.json({ error: 'Session not yours' }, { status: 403 });
    }
    if (session.status !== SessionStatus.ACTIVE) {
      return NextResponse.json({ error: 'Session not active' }, { status: 409 });
    }

    await db.sessionSample.createMany({
      data: payload.samples.map((s) => ({
        sessionId: payload.sessionId,
        schoolId,
        timestamp: new Date(s.timestamp),
        heartRate: s.heartRate ?? null,
        hrv: s.hrv ?? null,
        spo2: s.spo2 ?? null,
        gsr: s.gsr ?? null,
        skinTemp: s.skinTemp ?? null,
        motionScore: s.motionScore ?? null,
        voiceLevel: s.voiceLevel ?? null,
        batteryPct: s.batteryPct ?? null,
      })),
    });

    // Fan out to subscribers on the live dashboard. Never blocks the response.
    await publishSessionEvent(payload.sessionId, 'sample-batch', {
      samples: payload.samples,
    });

    // Fire-and-forget: run Claude analysis after the response is sent.
    // `after()` keeps the serverless invocation alive long enough on Vercel.
    after(async () => {
      await maybeRunAnalysis(payload.sessionId, schoolId, payload.locale);
    });

    return NextResponse.json({ ok: true, accepted: payload.samples.length });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/ingest]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ingest failed' },
      { status: 400 }
    );
  }
}
