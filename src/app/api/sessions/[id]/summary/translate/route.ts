import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getSchoolContext, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ locale: z.enum(['en', 'ar']) });

/**
 * On-demand translation of a session's overall summary + suggestion into the
 * viewer's locale. Does not persist — the stored original remains the truth.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await getSchoolContext();
    const { locale } = bodySchema.parse(await req.json());

    const session = await db.session.findFirst({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (!session.overallSummary) {
      return NextResponse.json({ text: '', suggestion: '' });
    }
    if ((session.summaryLocale ?? 'en') === locale) {
      return NextResponse.json({
        text: session.overallSummary,
        suggestion: session.overallSuggestion ?? '',
        cached: true,
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Translation not configured' }, { status: 503 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const targetLang = locale === 'ar' ? 'Arabic (العربية)' : 'English';

    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `You translate short counselor-facing summaries. Preserve the tentative, professional tone. Never add clinical language. When translating to Arabic use فصحى مبسّطة with feminine addressee (المرشدة).`,
      tools: [
        {
          name: 'return_translation',
          description: `Return the translated fields in ${targetLang}.`,
          input_schema: {
            type: 'object' as const,
            properties: {
              text: { type: 'string' },
              suggestion: { type: 'string' },
            },
            required: ['text', 'suggestion'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_translation' },
      messages: [
        {
          role: 'user',
          content: `Translate the following session summary into ${targetLang}.

SUMMARY:
${session.overallSummary}

SUGGESTION FOR NEXT SESSION:
${session.overallSuggestion ?? ''}

Return via the return_translation tool.`,
        },
      ],
    });

    const toolBlock = message.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'Translation returned no tool call' }, { status: 502 });
    }
    const input = toolBlock.input as { text?: string; suggestion?: string };
    return NextResponse.json({
      text: input.text ?? session.overallSummary,
      suggestion: input.suggestion ?? session.overallSuggestion ?? '',
      cached: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/sessions/summary/translate]', err);
    return NextResponse.json({ error: 'Translate failed' }, { status: 500 });
  }
}
