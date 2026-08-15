import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { SessionStatus } from '@prisma/client';
import { db } from './db';

// Narrow shape — only the fields we actually read in the stats helpers.
type SampleLite = {
  heartRate: number | null;
  hrv: number | null;
  gsr: number | null;
  skinTemp: number | null;
  motionScore: number | null;
  voiceLevel: number | null;
};

/**
 * Whole-session summary + longitudinal student growth summary.
 *
 * These are separate from the per-window `AIAnalysis` timeline the analyzer
 * produces during a live session. This module handles two "big picture"
 * summaries a counselor sees AFTER a session (session-level) and when
 * reviewing a student over time (student-level).
 *
 * Both are on-demand, cached to the DB, and lazily regenerated when stale.
 */

const SESSION_SUMMARY_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STUDENT_GROWTH_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

const sessionSummarySchema = z.object({
  overallSummary: z.string().min(20).max(1500),
  overallSuggestion: z.string().min(20).max(1000),
});

const growthSummarySchema = z.object({
  growthSummary: z.string().min(20).max(2000),
});

const LANGUAGE_INSTRUCTION: Record<'en' | 'ar', string> = {
  en: 'Write the response in professional, tentative English suitable for a counselor.',
  ar: 'اكتب الرد بالعربية الفصحى المبسّطة بأسلوب مهني ومحترم، وباستخدام صيغة المخاطبة المؤنّثة للمرشدة.',
};

function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ---------- session summary ----------

/**
 * Generates a session-level summary. Returns the saved Session or null if
 * generation was skipped (no API key, session too short, or already fresh).
 */
export async function generateSessionSummary(
  sessionId: string,
  locale: 'en' | 'ar' = 'en',
  force = false
): Promise<void> {
  const anthropic = client();
  if (!anthropic) return;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      student: true,
      samples: {
        select: {
          timestamp: true,
          heartRate: true,
          hrv: true,
          gsr: true,
          skinTemp: true,
          motionScore: true,
          voiceLevel: true,
        },
        orderBy: { timestamp: 'asc' },
      },
      transcripts: { orderBy: { timestamp: 'asc' } },
      analyses: { orderBy: { timestamp: 'asc' } },
    },
  });
  if (!session) return;
  if (session.status !== SessionStatus.COMPLETED) return;
  if (session.samples.length < 3) return;

  if (
    !force &&
    session.overallSummary &&
    session.summaryGeneratedAt &&
    Date.now() - session.summaryGeneratedAt.getTime() < SESSION_SUMMARY_TTL_MS
  ) {
    return;
  }

  const stats = statsFor(session.samples);
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

  const durationMin =
    session.startedAt && session.endedAt
      ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000)
      : 0;

  const systemPrompt = `You produce a whole-session summary for a school counselor after a 1:1 counseling session with a female student.

CRITICAL BOUNDARIES:
- Decision-support only. Never diagnostic. Never a clinical label.
- Prefer tentative language ("appears", "may suggest", "seems").
- The counselor is your reader. The student never sees this.

${LANGUAGE_INSTRUCTION[locale]}

You'll receive: total-session biometric summary, the AI-analysis timeline from the session, and the transcript. Produce ONE cohesive summary via the report tool.`;

  const userPrompt = [
    `SESSION: ${session.student.fullName} — ${durationMin} min, ${session.samples.length} samples`,
    '',
    'BIOMETRIC SUMMARY (whole session):',
    `- Heart rate: ${fmt(stats.heartRate, ' bpm', 0)}`,
    `- HRV (RMSSD): ${fmt(stats.hrv, ' ms', 0)}`,
    `- GSR: ${fmt(stats.gsr, ' µS')}`,
    `- Skin temp: ${fmt(stats.skinTemp, '°C')}`,
    `- Motion (0-1): ${fmt(stats.motionScore, '')}`,
    `- Voice activity (0-1): ${fmt(stats.voiceLevel, '')}`,
    '',
    'PER-WINDOW AI OBSERVATIONS (chronological):',
    analysesBlock,
    '',
    'TRANSCRIPT (chronological):',
    transcriptBlock,
    '',
    'Return the summary via the report_session tool.',
  ].join('\n');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1400,
    system: systemPrompt,
    tools: [
      {
        name: 'report_session',
        description: 'Return the counselor-facing whole-session summary.',
        input_schema: {
          type: 'object',
          properties: {
            overallSummary: {
              type: 'string',
              description:
                '2-3 sentences describing the arc of this session — how the student\'s state evolved, notable moments.',
            },
            overallSuggestion: {
              type: 'string',
              description:
                'A short paragraph on what to consider for the NEXT session with this student.',
            },
          },
          required: ['overallSummary', 'overallSuggestion'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_session' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolBlock = message.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') return;
  const parsed = sessionSummarySchema.safeParse(toolBlock.input);
  if (!parsed.success) return;

  await db.session.update({
    where: { id: sessionId },
    data: {
      overallSummary: parsed.data.overallSummary,
      overallSuggestion: parsed.data.overallSuggestion,
      summaryGeneratedAt: new Date(),
      summaryModel: message.model,
      summaryLocale: locale,
    },
  });
}

// ---------- student growth ----------

export type GrowthMetrics = {
  sessionCount: number;
  totalMinutes: number;
  hrFirst: number | null;
  hrLast: number | null;
  hrDelta: number | null;
  gsrFirst: number | null;
  gsrLast: number | null;
  gsrDelta: number | null;
  motionFirst: number | null;
  motionLast: number | null;
  motionDelta: number | null;
};

export async function generateStudentGrowth(
  studentId: string,
  locale: 'en' | 'ar' = 'en',
  force = false
): Promise<void> {
  const anthropic = client();
  if (!anthropic) return;

  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student) return;

  if (
    !force &&
    student.growthSummary &&
    student.growthGeneratedAt &&
    Date.now() - student.growthGeneratedAt.getTime() < STUDENT_GROWTH_TTL_MS
  ) {
    return;
  }

  const sessions = await db.session.findMany({
    where: { studentId, status: SessionStatus.COMPLETED, deletedAt: null },
    orderBy: { startedAt: 'asc' },
    include: {
      samples: {
        select: {
          heartRate: true,
          gsr: true,
          motionScore: true,
        },
      },
    },
  });

  if (sessions.length < 2) return; // Need at least 2 sessions for a trend.

  const perSession = sessions.map((s) => {
    const hrValues = s.samples.map((x) => x.heartRate).filter((v): v is number => v != null);
    const gsrValues = s.samples.map((x) => x.gsr).filter((v): v is number => v != null);
    const motionValues = s.samples.map((x) => x.motionScore).filter((v): v is number => v != null);
    return {
      id: s.id,
      date: s.startedAt ?? s.createdAt,
      duration:
        s.startedAt && s.endedAt
          ? Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60000)
          : 0,
      hr: avg(hrValues),
      gsr: avg(gsrValues),
      motion: avg(motionValues),
      overallSummary: s.overallSummary,
    };
  });

  const first = perSession[0];
  const last = perSession[perSession.length - 1];

  const metrics: GrowthMetrics = {
    sessionCount: perSession.length,
    totalMinutes: perSession.reduce((a, b) => a + b.duration, 0),
    hrFirst: first.hr,
    hrLast: last.hr,
    hrDelta: first.hr != null && last.hr != null ? last.hr - first.hr : null,
    gsrFirst: first.gsr,
    gsrLast: last.gsr,
    gsrDelta: first.gsr != null && last.gsr != null ? last.gsr - first.gsr : null,
    motionFirst: first.motion,
    motionLast: last.motion,
    motionDelta: first.motion != null && last.motion != null ? last.motion - first.motion : null,
  };

  const perSessionBlock = perSession
    .map((s, i) => {
      const bio = [
        s.hr != null ? `HR ${s.hr.toFixed(0)} bpm` : null,
        s.gsr != null ? `GSR ${s.gsr.toFixed(1)} µS` : null,
        s.motion != null ? `motion ${s.motion.toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `Session ${i + 1} (${new Date(s.date).toISOString().slice(0, 10)}, ${s.duration} min): ${bio}\n  Summary: ${s.overallSummary ?? '(no session summary yet)'}`;
    })
    .join('\n\n');

  const systemPrompt = `You produce a longitudinal summary of a student's counseling arc for a school counselor.

CRITICAL BOUNDARIES:
- Decision-support only. Never diagnostic. Never a clinical label.
- If a trend is thin, say so — do not manufacture progress that isn't there.
- Prefer tentative language.
- Focus on OBSERVATIONS and PATTERNS across sessions, not a single moment.

${LANGUAGE_INSTRUCTION[locale]}

Return one growthSummary paragraph (2-4 sentences) via the report_growth tool.`;

  const userPrompt = [
    `STUDENT: ${student.fullName}`,
    `Sessions completed: ${metrics.sessionCount}, total time: ${metrics.totalMinutes} min`,
    '',
    'BASELINE DELTAS (first session → last session):',
    `- Heart rate baseline: ${fmtDelta(metrics.hrFirst, metrics.hrLast, ' bpm', 0)}`,
    `- GSR baseline: ${fmtDelta(metrics.gsrFirst, metrics.gsrLast, ' µS')}`,
    `- Motion baseline: ${fmtDelta(metrics.motionFirst, metrics.motionLast, '')}`,
    '',
    'PER-SESSION SUMMARIES (chronological):',
    perSessionBlock,
    '',
    'Return the longitudinal summary via the report_growth tool.',
  ].join('\n');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system: systemPrompt,
    tools: [
      {
        name: 'report_growth',
        description: 'Return the longitudinal student growth summary.',
        input_schema: {
          type: 'object',
          properties: {
            growthSummary: {
              type: 'string',
              description:
                '2-4 sentences describing patterns, improvements, or ongoing concerns across the student\'s sessions.',
            },
          },
          required: ['growthSummary'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_growth' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolBlock = message.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') return;
  const parsed = growthSummarySchema.safeParse(toolBlock.input);
  if (!parsed.success) return;

  await db.student.update({
    where: { id: studentId },
    data: {
      growthSummary: parsed.data.growthSummary,
      growthMetrics: metrics as unknown as object,
      growthGeneratedAt: new Date(),
      growthLocale: locale,
    },
  });
}

// ---------- group session summary ----------

/**
 * Whole-group summary + facilitator suggestion for a completed GroupSession.
 * Distinct from 1:1 session summaries — the prompt frames the group as a
 * unit and asks Claude to focus on collective dynamics, not per-student
 * detail. Runs post-response, cached to the group row.
 */
export async function generateGroupSummary(
  groupSessionId: string,
  locale: 'en' | 'ar' = 'en',
  force = false
): Promise<void> {
  const anthropic = client();
  if (!anthropic) return;

  const [group, transcripts, analyses] = await Promise.all([
    db.groupSession.findUnique({
      where: { id: groupSessionId },
      include: {
        members: { include: { student: { select: { fullName: true, gradeLevel: true } } } },
      },
    }),
    db.transcriptSegment.findMany({
      where: { groupSessionId },
      orderBy: { timestamp: 'asc' },
    }),
    db.aIAnalysis.findMany({
      where: { groupSessionId },
      orderBy: { timestamp: 'asc' },
    }),
  ]);
  if (!group) return;
  if (group.status !== SessionStatus.COMPLETED) return;

  if (
    !force &&
    group.overallSummary &&
    group.summaryGeneratedAt &&
    Date.now() - group.summaryGeneratedAt.getTime() < SESSION_SUMMARY_TTL_MS
  ) {
    return;
  }

  const durationMin =
    group.startedAt && group.endedAt
      ? Math.round((group.endedAt.getTime() - group.startedAt.getTime()) / 60000)
      : 0;

  const roster = group.members
    .map(
      (m) =>
        `- ${m.student.fullName}${m.student.gradeLevel ? ` (${m.student.gradeLevel})` : ''}`
    )
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

  const systemPrompt = `You produce a whole-group summary for a school counselor after a facilitated group counseling session with female students.

CRITICAL BOUNDARIES:
- Decision-support only. Never diagnostic. Never a clinical label.
- Focus on GROUP dynamics — cohesion, participation balance, shared themes.
- Do NOT single out individuals unless the counselor's notes explicitly do.
- Prefer tentative language ("appears", "may suggest", "seems").

${LANGUAGE_INSTRUCTION[locale]}

Produce ONE cohesive summary via the report_group tool.`;

  const userPrompt = [
    `GROUP SESSION: "${group.title}" — ${durationMin} min, ${group.members.length} students`,
    group.topic ? `TOPIC: ${group.topic}` : '',
    '',
    'PARTICIPANTS:',
    roster,
    '',
    'FACILITATOR NOTES:',
    group.notes ?? '(none)',
    '',
    'PER-WINDOW AI OBSERVATIONS (chronological):',
    analysesBlock,
    '',
    'TRANSCRIPT (chronological, captured live):',
    transcriptBlock,
    '',
    'Return the summary via the report_group tool.',
  ]
    .filter(Boolean)
    .join('\n');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system: systemPrompt,
    tools: [
      {
        name: 'report_group',
        description: 'Return the counselor-facing whole-group summary.',
        input_schema: {
          type: 'object',
          properties: {
            overallSummary: {
              type: 'string',
              description:
                '2-3 sentences describing the group dynamic, participation balance, and any shared themes that surfaced.',
            },
            overallSuggestion: {
              type: 'string',
              description:
                'Short paragraph on group-level interventions to consider for the next meeting.',
            },
          },
          required: ['overallSummary', 'overallSuggestion'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_group' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolBlock = message.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') return;
  const parsed = sessionSummarySchema.safeParse(toolBlock.input);
  if (!parsed.success) return;

  await db.groupSession.update({
    where: { id: groupSessionId },
    data: {
      overallSummary: parsed.data.overallSummary,
      overallSuggestion: parsed.data.overallSuggestion,
      summaryGeneratedAt: new Date(),
      summaryModel: message.model,
      summaryLocale: locale,
    },
  });
}

// ---------- helpers ----------

type SampleField = keyof SampleLite;

function statsFor(samples: SampleLite[]) {
  const out: Record<SampleField, { avg: number; min: number; max: number } | null> = {
    heartRate: statOf(samples, 'heartRate'),
    hrv: statOf(samples, 'hrv'),
    gsr: statOf(samples, 'gsr'),
    skinTemp: statOf(samples, 'skinTemp'),
    motionScore: statOf(samples, 'motionScore'),
    voiceLevel: statOf(samples, 'voiceLevel'),
  };
  return out;
}

function statOf(samples: SampleLite[], field: SampleField) {
  const values = samples.map((s) => s[field]).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(
  s: { avg: number; min: number; max: number } | null,
  unit: string,
  decimals = 1
): string {
  if (!s) return 'no data';
  return `avg ${s.avg.toFixed(decimals)}${unit}, range ${s.min.toFixed(decimals)}–${s.max.toFixed(decimals)}${unit}`;
}

function fmtDelta(
  first: number | null,
  last: number | null,
  unit: string,
  decimals = 1
): string {
  if (first == null || last == null) return 'no data';
  const delta = last - first;
  const arrow = Math.abs(delta) < 0.5 * Math.pow(10, -decimals) ? '→' : delta > 0 ? '↑' : '↓';
  return `${first.toFixed(decimals)}${unit} → ${last.toFixed(decimals)}${unit} (${arrow} ${Math.abs(delta).toFixed(decimals)}${unit})`;
}
