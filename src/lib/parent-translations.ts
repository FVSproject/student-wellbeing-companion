import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';

/**
 * Server-side translation for the public parent page. AI-generated summaries
 * are stored in whatever locale the counselor was in when they generated
 * them; a parent viewing in the opposite locale needs on-the-fly translation.
 *
 * Cost/latency is controlled by caching the whole batch on the ParentShareLink
 * row keyed by locale + content hash — a second view in the same locale is
 * instant.
 */

export type ParentBundle = {
  growthSummary: string | null;
  sessions: Array<{
    id: string;
    summary: string | null;
    suggestion: string | null;
  }>;
};

type CachedEntry = {
  hash: string;
  content: ParentBundle;
};
type TranslationsCache = Partial<Record<'en' | 'ar', CachedEntry>>;

function bundleHash(b: ParentBundle): string {
  const material = JSON.stringify({
    g: b.growthSummary ?? '',
    s: b.sessions.map((s) => ({ id: s.id, u: s.summary ?? '', g: s.suggestion ?? '' })),
  });
  return crypto.createHash('sha1').update(material).digest('hex');
}

/**
 * Returns the parent-facing bundle in `target`. If nothing needs translating
 * (empty strings, or source already matches target), returns the source as-is.
 * Otherwise consults the per-link cache and — on miss — calls Claude once,
 * saving the result before returning.
 */
export async function getLocalizedParentBundle(
  linkId: string,
  source: ParentBundle,
  cache: TranslationsCache | null,
  target: 'en' | 'ar'
): Promise<ParentBundle> {
  const hash = bundleHash(source);

  const cached = cache?.[target];
  if (cached && cached.hash === hash) {
    return cached.content;
  }

  if (!process.env.ANTHROPIC_API_KEY) return source;

  const nonEmpty =
    (source.growthSummary && source.growthSummary.trim().length > 0) ||
    source.sessions.some(
      (s) =>
        (s.summary && s.summary.trim().length > 0) ||
        (s.suggestion && s.suggestion.trim().length > 0)
    );
  if (!nonEmpty) return source;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const targetLangName = target === 'ar' ? 'Arabic (العربية الفصحى)' : 'English';

  const bundleForClaude = {
    growth_summary: source.growthSummary ?? '',
    sessions: source.sessions.map((s) => ({
      id: s.id,
      summary: s.summary ?? '',
      suggestion: s.suggestion ?? '',
    })),
  };

  try {
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `You translate short counselor-authored summaries for a parent-facing progress page. Preserve the tentative, respectful tone. Never add clinical language. When translating to Arabic use فصحى مبسّطة suitable for a parent.`,
      tools: [
        {
          name: 'return_translated_bundle',
          description: `Return the entire bundle translated into ${targetLangName}. Preserve the session ids exactly. Empty strings must stay empty.`,
          input_schema: {
            type: 'object' as const,
            properties: {
              growth_summary: { type: 'string' },
              sessions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    summary: { type: 'string' },
                    suggestion: { type: 'string' },
                  },
                  required: ['id', 'summary', 'suggestion'],
                },
              },
            },
            required: ['growth_summary', 'sessions'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_translated_bundle' },
      messages: [
        {
          role: 'user',
          content: `Translate every string in the following JSON bundle into ${targetLangName}. Return via the return_translated_bundle tool.

BUNDLE:
${JSON.stringify(bundleForClaude, null, 2)}`,
        },
      ],
    });

    const toolBlock = message.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') return source;

    const input = toolBlock.input as {
      growth_summary?: string;
      sessions?: Array<{ id: string; summary?: string; suggestion?: string }>;
    };

    // Rebuild the bundle in the original session order, preserving nulls
    // where the source was null so downstream rendering stays consistent.
    const sessionMap = new Map((input.sessions ?? []).map((s) => [s.id, s]));
    const translated: ParentBundle = {
      growthSummary:
        source.growthSummary != null ? (input.growth_summary ?? '') : null,
      sessions: source.sessions.map((s) => {
        const tr = sessionMap.get(s.id);
        return {
          id: s.id,
          summary: s.summary != null ? (tr?.summary ?? s.summary) : null,
          suggestion:
            s.suggestion != null ? (tr?.suggestion ?? s.suggestion) : null,
        };
      }),
    };

    // Persist the new translation into the per-link cache. Read-modify-write
    // is fine here — parent views are rare and racing is inconsequential.
    const nextCache: TranslationsCache = { ...(cache ?? {}) };
    nextCache[target] = { hash, content: translated };
    await db.parentShareLink
      .update({
        where: { id: linkId },
        data: { translations: nextCache as unknown as object },
      })
      .catch(() => {});

    return translated;
  } catch {
    return source;
  }
}
