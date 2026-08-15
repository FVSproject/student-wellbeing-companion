import { NextResponse } from 'next/server';
import { getSchoolContext, AuthError } from '@/lib/auth';
import { getAblyRest, sessionChannel } from '@/lib/ably';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mint a short-lived Ably token scoped to a single session channel.
 * The token grants subscribe-only capability — publishing happens
 * only from the server (/api/ingest → publishSessionEvent).
 */
export async function GET(req: Request) {
  try {
    const rest = getAblyRest();
    if (!rest) {
      return NextResponse.json({ error: 'Realtime not configured' }, { status: 503 });
    }

    const { db, user } = await getSchoolContext();
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const session = await db.session.findFirst({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.counselorId !== user.id) {
      // Future: allow supervising counselors from the same school to read.
      return NextResponse.json({ error: 'Not your session' }, { status: 403 });
    }

    const tokenRequest = await rest.auth.createTokenRequest({
      clientId: user.id,
      capability: JSON.stringify({
        [sessionChannel(sessionId)]: ['subscribe'],
      }),
      ttl: 60 * 60 * 1000,
    });

    return NextResponse.json(tokenRequest);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/ably/token]', err);
    return NextResponse.json({ error: 'Token mint failed' }, { status: 500 });
  }
}
