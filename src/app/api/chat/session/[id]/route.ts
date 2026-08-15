import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSchoolContext, AuthError } from '@/lib/auth';
import { askReportChat, buildSessionContext } from '@/lib/report-chat';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  locale: z.enum(['en', 'ar']),
  question: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .default([]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, schoolId } = await getSchoolContext();
    const body = bodySchema.parse(await req.json());

    const context = await buildSessionContext(id, schoolId);
    if (!context) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const reply = await askReportChat({
      mode: 'session',
      context,
      locale: body.locale,
      history: body.history,
      question: body.question,
    });
    if (!reply) {
      return NextResponse.json(
        { error: 'Chat is not configured' },
        { status: 503 }
      );
    }

    recordAudit({
      actorUserId: user.id,
      actorClerkUserId: user.clerkUserId,
      schoolId,
      action: 'session.chat',
      targetType: 'session',
      targetId: id,
    });

    return NextResponse.json({ text: reply });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/chat/session]', err);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
