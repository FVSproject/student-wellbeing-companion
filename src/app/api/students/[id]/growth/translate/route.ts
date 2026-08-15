import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getSchoolContext, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ locale: z.enum(['en', 'ar']) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await getSchoolContext();
    const { locale } = bodySchema.parse(await req.json());

    const student = await db.student.findFirst({ where: { id } });
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    if (!student.growthSummary) {
      return NextResponse.json({ text: '' });
    }
    if ((student.growthLocale ?? 'en') === locale) {
      return NextResponse.json({ text: student.growthSummary, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Translation not configured' }, { status: 503 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const targetLang = locale === 'ar' ? 'Arabic (العربية)' : 'English';

    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `You translate short counselor-facing longitudinal summaries. Preserve the tentative, professional tone. Never add clinical language. When translating to Arabic use فصحى مبسّطة with feminine addressee (المرشدة).`,
      tools: [
        {
          name: 'return_translation',
          description: `Return the translated growth summary in ${targetLang}.`,
          input_schema: {
            type: 'object' as const,
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_translation' },
      messages: [
        {
          role: 'user',
          content: `Translate the following student growth summary into ${targetLang}.

GROWTH SUMMARY:
${student.growthSummary}

Return via the return_translation tool.`,
        },
      ],
    });

    const toolBlock = message.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'Translation returned no tool call' }, { status: 502 });
    }
    const input = toolBlock.input as { text?: string };
    return NextResponse.json({
      text: input.text ?? student.growthSummary,
      cached: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/students/growth/translate]', err);
    return NextResponse.json({ error: 'Translate failed' }, { status: 500 });
  }
}
