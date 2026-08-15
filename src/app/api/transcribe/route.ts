import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { Speaker } from '@prisma/client';
import { getSchoolContext, AuthError } from '@/lib/auth';
import { publishSessionEvent } from '@/lib/ably';
import { maybeRunGroupAnalysis } from '@/lib/analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live audio → text pipe.
 *
 * The counselor's browser captures audio in ~20 s chunks via MediaRecorder
 * and POSTs each chunk here as multipart/form-data. We call OpenAI's Whisper
 * API, write a TranscriptSegment row (speaker = UNKNOWN — no diarization
 * in v1), and publish to Ably. The analyzer's next tick will bundle these
 * segments with recent biometrics into its Claude call automatically.
 *
 * Cost: Whisper is $0.006/min. A 30-min session with continuous audio is
 * ~$0.18. Cheap next to the analysis calls.
 *
 * Silent no-op if OPENAI_API_KEY isn't set — mic capture still works
 * client-side, transcripts just don't materialize.
 */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB per chunk — well beyond a normal 20s clip.

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Transcription not configured' }, { status: 503 });
    }

    const { db, user, schoolId } = await getSchoolContext();
    const form = await req.formData();

    const sessionId = String(form.get('sessionId') ?? '');
    const groupSessionId = String(form.get('groupSessionId') ?? '');
    const localeParam = String(form.get('locale') ?? 'en');
    const locale: 'en' | 'ar' = localeParam === 'ar' ? 'ar' : 'en';
    const startedAtRaw = String(form.get('startedAt') ?? '');
    const durationMs = Number(form.get('durationMs') ?? 0);
    const audio = form.get('audio');

    if ((!sessionId && !groupSessionId) || !(audio instanceof File)) {
      return NextResponse.json(
        { error: 'Missing sessionId or groupSessionId, or audio' },
        { status: 400 }
      );
    }
    if (sessionId && groupSessionId) {
      return NextResponse.json(
        { error: 'Provide either sessionId or groupSessionId, not both' },
        { status: 400 }
      );
    }
    if (audio.size === 0) {
      return NextResponse.json({ ok: true, empty: true });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio chunk too large' }, { status: 413 });
    }

    const startedAt = startedAtRaw ? new Date(startedAtRaw) : new Date();
    if (Number.isNaN(startedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid startedAt' }, { status: 400 });
    }

    if (sessionId) {
      const session = await db.session.findFirst({ where: { id: sessionId } });
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      if (session.counselorId !== user.id) {
        return NextResponse.json({ error: 'Not your session' }, { status: 403 });
      }
    } else {
      const group = await db.groupSession.findFirst({ where: { id: groupSessionId } });
      if (!group) {
        return NextResponse.json({ error: 'Group session not found' }, { status: 404 });
      }
      if (group.counselorId !== user.id) {
        return NextResponse.json({ error: 'Not your session' }, { status: 403 });
      }
    }

    // Forward to Whisper. `language` is a hint — Whisper still auto-detects.
    const whisperForm = new FormData();
    whisperForm.append('file', audio, audio.name || 'chunk.webm');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', locale === 'ar' ? 'ar' : 'en');
    whisperForm.append('response_format', 'json');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const errBody = await whisperRes.text().catch(() => '');
      console.warn('[whisper] failed', whisperRes.status, errBody.slice(0, 300));
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
    }

    const data = (await whisperRes.json()) as { text?: string };
    const text = (data.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ ok: true, empty: true });
    }

    const segment = await db.transcriptSegment.create({
      data: {
        sessionId: sessionId || null,
        groupSessionId: groupSessionId || null,
        schoolId,
        timestamp: startedAt,
        durationMs: Math.max(0, Math.min(durationMs, 5 * 60 * 1000)),
        text,
        speaker: Speaker.UNKNOWN,
      },
    });

    if (sessionId) {
      await publishSessionEvent(sessionId, 'transcript', {
        id: segment.id.toString(),
        timestamp: segment.timestamp.toISOString(),
        text: segment.text,
        speaker: segment.speaker,
      });
    } else if (groupSessionId) {
      // 1:1 analyzer already runs from /api/ingest via `after()`. Group
      // sessions have no ingest pipeline, so trigger the group analyzer here
      // — non-blocking, so the transcript response stays snappy.
      after(async () => {
        await maybeRunGroupAnalysis(groupSessionId, schoolId, locale);
      });
    }

    return NextResponse.json({
      ok: true,
      text,
      timestamp: segment.timestamp.toISOString(),
      segmentId: segment.id.toString(),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/transcribe]', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
