import Anthropic from '@anthropic-ai/sdk';
import { SessionStatus } from '@prisma/client';
import { db } from './db';
import { gsrToNervousness } from './utils';

/**
 * Report-companion chatbot. Ephemeral by design — the client keeps the
 * conversation in local state, and each request rebuilds the context from
 * the DB. Nothing is persisted, so there's no privacy footprint beyond the
 * live records the counselor already sees on the page.
 */

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const LANGUAGE_INSTRUCTION: Record<'en' | 'ar', string> = {
  en: 'Reply in professional, tentative English suitable for a counselor.',
  ar: 'أجيبي بالعربية الفصحى المبسّطة بأسلوب مهني ومحترم، وبصيغة المخاطبة المؤنّثة للمرشدة.',
};

const SHARED_BOUNDARIES = `CRITICAL BOUNDARIES:
- Decision-support only. Never diagnostic. Never a clinical label.
- Prefer tentative language ("appears", "may suggest", "seems").
- If the context does not contain the answer, say so — do not invent details.
- Keep answers focused; a counselor is skimming, not reading an essay.`;

function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ---------- context builders ----------

export async function buildSessionContext(
  sessionId: string,
  schoolId: string
): Promise<string | null> {
  const session = await db.session.findFirst({
    where: { id: sessionId, schoolId },
    include: {
      student: true,
      counselor: { select: { fullName: true } },
      samples: {
        select: {
          timestamp: true,
          heartRate: true,
          gsr: true,
          skinTemp: true,
          voiceLevel: true,
        },
        orderBy: { timestamp: 'asc' },
      },
      transcripts: { orderBy: { timestamp: 'asc' } },
      analyses: { orderBy: { timestamp: 'asc' } },
    },
  });
  if (!session) return null;

  const durationMin =
    session.startedAt && session.endedAt
      ? Math.round(
          (session.endedAt.getTime() - session.startedAt.getTime()) / 60000
        )
      : null;

  const hr = numericStats(session.samples.map((s) => s.heartRate));
  const nervousness = numericStats(
    session.samples.map((s) => gsrToNervousness(s.gsr))
  );
  const skin = numericStats(session.samples.map((s) => s.skinTemp));
  const voice = numericStats(session.samples.map((s) => s.voiceLevel));

  const transcriptBlock =
    session.transcripts.length > 0
      ? session.transcripts
          .map((t) => `[${t.speaker.toLowerCase()}] ${t.text}`)
          .join('\n')
      : '(no transcript captured)';
  const analysesBlock =
    session.analyses.length > 0
      ? session.analyses
          .map(
            (a) =>
              `- ${new Date(a.timestamp).toISOString()}: ${a.stateSummary}`
          )
          .join('\n')
      : '(no per-window analyses)';

  return [
    `SESSION with ${session.student.fullName}`,
    `Status: ${session.status}${durationMin ? `, duration ${durationMin} min` : ''}, samples: ${session.samples.length}`,
    session.counselor?.fullName ? `Counselor: ${session.counselor.fullName}` : '',
    '',
    'BIOMETRIC SUMMARY:',
    `- Heart rate: ${fmt(hr, ' bpm', 0)}`,
    `- Nervousness (0-100 from GSR): ${fmt(nervousness, '%', 0)}`,
    `- Skin temp: ${fmt(skin, '°C')}`,
    `- Voice activity (0-1): ${fmt(voice, '')}`,
    '',
    'WHOLE-SESSION SUMMARY:',
    session.overallSummary ?? '(not yet generated)',
    session.overallSuggestion
      ? `\nSUGGESTION FOR NEXT SESSION:\n${session.overallSuggestion}`
      : '',
    '',
    'PER-WINDOW AI OBSERVATIONS (chronological):',
    analysesBlock,
    '',
    'TRANSCRIPT (chronological):',
    transcriptBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function buildStudentContext(
  studentId: string,
  schoolId: string
): Promise<string | null> {
  const student = await db.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
  });
  if (!student) return null;

  const sessions = await db.session.findMany({
    where: { studentId, schoolId, deletedAt: null },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      status: true,
      overallSummary: true,
      overallSuggestion: true,
    },
  });

  const sessionBlock =
    sessions.length > 0
      ? sessions
          .map((s, i) => {
            const date = s.startedAt
              ? new Date(s.startedAt).toISOString().slice(0, 10)
              : '—';
            const dur =
              s.startedAt && s.endedAt
                ? `${Math.round(
                    (s.endedAt.getTime() - s.startedAt.getTime()) / 60000
                  )} min`
                : s.status;
            const summary = s.overallSummary ?? '(no summary yet)';
            const suggestion = s.overallSuggestion
              ? `\n  Next-session suggestion: ${s.overallSuggestion}`
              : '';
            return `Session ${sessions.length - i} (${date}, ${dur}): ${summary}${suggestion}`;
          })
          .join('\n\n')
      : '(no sessions on record)';

  const profileBits = [
    student.gradeLevel ? `Grade: ${student.gradeLevel}` : null,
    student.age != null ? `Age: ${student.age}` : null,
    student.sex ? `Sex: ${student.sex}` : null,
    student.notes ? `Notes: ${student.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    `STUDENT: ${student.fullName} (ID ${student.externalId})`,
    profileBits,
    '',
    'LONGITUDINAL GROWTH SUMMARY:',
    student.growthSummary ?? '(not yet generated)',
    '',
    `SESSIONS (${sessions.length} most recent, newest first):`,
    sessionBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function buildGroupContext(
  groupSessionId: string,
  schoolId: string
): Promise<string | null> {
  const group = await db.groupSession.findFirst({
    where: { id: groupSessionId, schoolId, deletedAt: null },
    include: {
      members: {
        include: {
          student: {
            select: {
              fullName: true,
              gradeLevel: true,
              growthSummary: true,
            },
          },
        },
      },
    },
  });
  if (!group) return null;

  const [transcripts, analyses] = await Promise.all([
    db.transcriptSegment.findMany({
      where: { groupSessionId, schoolId },
      orderBy: { timestamp: 'asc' },
      take: 200,
    }),
    db.aIAnalysis.findMany({
      where: { groupSessionId, schoolId },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  const durationMin =
    group.startedAt && group.endedAt
      ? Math.round(
          (group.endedAt.getTime() - group.startedAt.getTime()) / 60000
        )
      : null;

  const roster = group.members
    .map((m) => {
      const growth = m.student.growthSummary
        ? ` — growth so far: ${m.student.growthSummary}`
        : '';
      return `- ${m.student.fullName}${
        m.student.gradeLevel ? ` (${m.student.gradeLevel})` : ''
      }${growth}`;
    })
    .join('\n');

  const transcriptBlock =
    transcripts.length > 0
      ? transcripts.map((t) => `[${t.speaker.toLowerCase()}] ${t.text}`).join('\n')
      : '(no transcript captured)';
  const analysesBlock =
    analyses.length > 0
      ? analyses
          .map((a) => `- ${new Date(a.timestamp).toISOString()}: ${a.stateSummary}`)
          .join('\n')
      : '(no per-window observations)';

  return [
    `GROUP SESSION: "${group.title}" — status ${group.status}${
      durationMin ? `, duration ${durationMin} min` : ''
    }`,
    group.topic ? `TOPIC: ${group.topic}` : '',
    '',
    `PARTICIPANTS (${group.members.length}):`,
    roster,
    '',
    'FACILITATOR NOTES:',
    group.notes ?? '(none)',
    '',
    'WHOLE-GROUP SUMMARY:',
    group.overallSummary ?? '(not yet generated)',
    group.overallSuggestion
      ? `\nSUGGESTION FOR NEXT MEETING:\n${group.overallSuggestion}`
      : '',
    '',
    'PER-WINDOW AI OBSERVATIONS (chronological):',
    analysesBlock,
    '',
    'TRANSCRIPT (chronological):',
    transcriptBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- chat runner ----------

export async function askReportChat(opts: {
  mode: 'session' | 'student' | 'group';
  context: string;
  locale: 'en' | 'ar';
  history: ChatMessage[];
  question: string;
}): Promise<string | null> {
  const anthropic = client();
  if (!anthropic) return null;

  const scope =
    opts.mode === 'session'
      ? 'a single counseling session'
      : opts.mode === 'group'
        ? 'a facilitated group counseling session'
        : "a student's counseling arc across multiple sessions";

  const systemPrompt = `You answer a school counselor's questions about ${scope}. You are given the full session/student record below and must answer strictly from it.

${SHARED_BOUNDARIES}

${LANGUAGE_INSTRUCTION[opts.locale]}

--- CONTEXT ---
${opts.context}
--- END CONTEXT ---`;

  const messages: ChatMessage[] = [
    ...opts.history.slice(-8),
    { role: 'user', content: opts.question },
  ];

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const message = await anthropic.messages.create({
    model,
    max_tokens: 800,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return null;
  return textBlock.text.trim();
}

// ---------- helpers ----------

function numericStats(values: (number | null)[]) {
  const clean = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (clean.length === 0) return null;
  return {
    avg: clean.reduce((a, b) => a + b, 0) / clean.length,
    min: Math.min(...clean),
    max: Math.max(...clean),
  };
}

function fmt(
  s: { avg: number; min: number; max: number } | null,
  unit: string,
  decimals = 1
): string {
  if (!s) return 'no data';
  return `avg ${s.avg.toFixed(decimals)}${unit}, range ${s.min.toFixed(decimals)}–${s.max.toFixed(decimals)}${unit}`;
}
