import { NextResponse } from 'next/server';
import { getSchoolContext, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lightweight poll endpoint the live panel hits every few seconds to pick
 * up new AI analyses. Cheap: one indexed row read, no joins.
 *
 * (We publish to Ably server-side as well — this endpoint is what the
 * browser reads when Ably's client bundle isn't loaded.)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db, user } = await getSchoolContext();

    const session = await db.session.findFirst({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.counselorId !== user.id) {
      return NextResponse.json({ error: 'Not your session' }, { status: 403 });
    }

    const latest = await db.aIAnalysis.findFirst({
      where: { sessionId: id },
      orderBy: { timestamp: 'desc' },
    });

    if (!latest) return NextResponse.json({ analysis: null });

    return NextResponse.json({
      analysis: {
        id: latest.id,
        timestamp: latest.timestamp.toISOString(),
        stateSummary: latest.stateSummary,
        suggestedApproaches: latest.suggestedApproaches as string[],
        locale: latest.locale,
        model: latest.model,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/sessions/latest]', err);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}
