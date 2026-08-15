import { NextResponse } from 'next/server';
import { getSchoolContext, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Poll target for the live group panel. Returns the latest AI analysis and
 * the recent transcript segments so the client can render both without
 * needing separate endpoints. `sinceId` lets the client ask for anything
 * newer than what it already has (transcripts are BigInt IDs, monotonic).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, schoolId, db } = await getSchoolContext();
    const url = new URL(req.url);
    const sinceIdParam = url.searchParams.get('sinceId');
    const sinceId = sinceIdParam ? BigInt(sinceIdParam) : null;

    const group = await db.groupSession.findFirst({
      where: { id, schoolId },
      select: { id: true, counselorId: true, status: true },
    });
    if (!group) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (group.counselorId !== user.id) {
      return NextResponse.json({ error: 'Not your session' }, { status: 403 });
    }

    const [analysis, transcripts] = await Promise.all([
      db.aIAnalysis.findFirst({
        where: { groupSessionId: id },
        orderBy: { timestamp: 'desc' },
      }),
      db.transcriptSegment.findMany({
        where: {
          groupSessionId: id,
          ...(sinceId !== null ? { id: { gt: sinceId } } : {}),
        },
        orderBy: { timestamp: 'asc' },
        take: 100,
      }),
    ]);

    return NextResponse.json({
      status: group.status,
      analysis: analysis
        ? {
            id: analysis.id,
            timestamp: analysis.timestamp.toISOString(),
            stateSummary: analysis.stateSummary,
            suggestedApproaches: analysis.suggestedApproaches as string[],
            locale: analysis.locale,
            model: analysis.model,
          }
        : null,
      transcripts: transcripts.map((t) => ({
        id: t.id.toString(),
        timestamp: t.timestamp.toISOString(),
        text: t.text,
        speaker: t.speaker,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/groups/live]', err);
    return NextResponse.json({ error: 'Live poll failed' }, { status: 500 });
  }
}
