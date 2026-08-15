import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getSchoolContext, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ locale: z.enum(['en', 'ar']) });

const translateSchema = z.object({
  stateSummary: z.string().min(1).max(1000),
  suggestedApproaches: z.array(z.string().min(1).max(500)).min(1).max(3),
});

/**
 * On-demand translation of a stored AIAnalysis into the viewer's locale.
 * Does NOT persist — the original is preserved as a historical record;
 * the translation is a display convenience.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await getSchoolContext();
    const { locale } = bodySchema.parse(await req.json());

    const analysis = await db.aIAnalysis.findFirst({ where: { id } });
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    if (analysis.locale === locale) {
      return NextResponse.json({
        stateSummary: analysis.stateSummary,
        suggestedApproaches: analysis.suggestedApproaches,
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
      max_tokens: 1024,
      system: `You translate short counselor-facing decision-support notes. Preserve tentative, professional tone. Never add clinical language or diagnostic framing. When translating to Arabic use فصحى مبسّطة with feminine addressee (المرشدة).`,
      tools: [
        {
          name: 'return_translation',
          description: `Return the translated fields in ${targetLang}.`,
          input_schema: {
            type: 'object' as const,
            properties: {
              stateSummary: { type: 'string' },
              suggestedApproaches: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 3,
              },
            },
            required: ['stateSummary', 'suggestedApproaches'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_translation' },
      messages: [
        {
          role: 'user',
          content: `Translate the following counselor-facing analysis into ${targetLang}.

stateSummary:
${analysis.stateSummary}

suggestedApproaches:
${(analysis.suggestedApproaches as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Return via the return_translation tool.`,
        },
      ],
    });

    const toolBlock = message.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'Translation returned no tool call' }, { status: 502 });
    }
    const parsed = translateSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Translation payload invalid' }, { status: 502 });
    }

    return NextResponse.json({
      stateSummary: parsed.data.stateSummary,
      suggestedApproaches: parsed.data.suggestedApproaches,
      cached: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/analyses/translate]', err);
    return NextResponse.json({ error: 'Translate failed' }, { status: 500 });
  }
}
