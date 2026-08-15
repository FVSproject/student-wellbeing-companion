import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { SessionStatus, type SessionSample, type TranscriptSegment } from '@prisma/client';
import { tenantDb } from './tenant';
import { publishSessionEvent } from './ably';

/**
 * Rolling AI analysis of a live counseling session. Runs on the server,
 * triggered fire-and-forget from /api/ingest via `after()`. Reads the last
 * ~30 seconds of samples + transcript, calls Claude with a decision-support
 * framing, writes an AIAnalysis row, and publishes to Ably.
 *
 * Guardrails:
 * - Skips if session is not ACTIVE.
 * - Skips if the previous analysis is younger than MIN_INTERVAL_MS.
 * - Skips if there aren't enough new samples to be meaningful.
 * - Silent no-op if ANTHROPIC_API_KEY isn't set (dev without key still works).
 */

const MIN_INTERVAL_MS = 15_000; // one analysis every 15s max
const MIN_NEW_SAMPLES = 3;
const WINDOW_SAMPLES = 30; // upper bound on samples per bundle

const analysisSchema = z.object({
  stateSummary: z.string().min(10).max(600),
  suggestedApproaches: z.array(z.string().min(5).max(300)).min(1).max(3),
});

const BASE_SYSTEM_PROMPT = `You are a decision-support assistant for a school counselor (مرشدة طلابية) during a live 1:1 counseling session with a female student.

CRITICAL BOUNDARIES:
- You are NEVER a diagnostic or clinical tool.
- You produce ONLY brief, gentle observations and suggested conversational approaches.
- Your output goes to the counselor's private dashboard — NEVER shown to the student.
- Never label the student with any condition. Never suggest referral or medication without a qualified human clinical review path.
- Prefer humble, tentative language ("appears", "may suggest", "possibly") over declarative claims.
- If evidence is thin or the window is too short, say so honestly instead of speculating.

INPUT you receive per window:
- A short transcript segment (may be in Arabic, English, or mixed).
- A biometric summary: heart rate, HRV, GSR (skin conductance), skin temperature, motion — with a per-metric trend hint against the session baseline.

OUTPUT (return via the report_analysis tool):
- stateSummary: 1-2 short plain-language sentences on the student's likely current emotional state IN THIS MOMENT. No jargon.
- suggestedApproaches: 1-3 concrete conversational suggestions for the counselor's NEXT few minutes. Practical, culturally aware, session-appropriate.`;

const LANGUAGE_INSTRUCTION: Record<'en' | 'ar', string> = {
  en: `\n\nLANGUAGE: Write BOTH stateSummary and suggestedApproaches in clear, professional English. Do this regardless of the transcript language.`,
  ar: `\n\nاللغة: اكتب كلًا من stateSummary و suggestedApproaches باللغة العربية الفصحى المبسّطة، بأسلوب مهني ومحترم يناسب المرشدة الطلابية السعودية. استخدم صيغة المخاطبة المؤنّثة عند مخاطبة المرشدة. اكتب بالعربية بغضّ النظر عن لغة الحوار المنقول.`,
};

const REPORT_TOOL = {
  name: 'report_analysis',
  description: 'Return the counselor-facing analysis for the current session window.',
  input_schema: {
    type: 'object' as const,
    properties: {
      stateSummary: {
        type: 'string',
        description: '1-2 short sentences on the student\'s current likely emotional state. Plain language.',
      },
      suggestedApproaches: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: { type: 'string' },
        description: '1-3 concrete suggestions for the counselor.',
      },
    },
    required: ['stateSummary', 'suggestedApproaches'],
  },
};

let clientRef: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!clientRef) clientRef = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return clientRef;
}

export async function maybeRunAnalysis(
  sessionId: string,
  schoolId: string,
  locale: 'en' | 'ar' = 'en'
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const db = tenantDb(schoolId);

  const [session, latest, recentSamples, recentTranscripts, baselineSamples] = await Promise.all([
    db.session.findFirst({ where: { id: sessionId } }),
    db.aIAnalysis.findFirst({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
    }),
    db.sessionSample.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
      take: WINDOW_SAMPLES,
    }),
    db.transcriptSegment.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
      take: 12,
    }),
    db.sessionSample.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      take: 10,
    }),
  ]);

  if (!session || session.status !== SessionStatus.ACTIVE) return;

  const now = new Date();
  if (latest && now.getTime() - latest.timestamp.getTime() < MIN_INTERVAL_MS) return;

  const windowStart = latest?.windowEnd ?? session.startedAt ?? new Date(now.getTime() - 60_000);
  const windowEnd = now;

  const samplesInWindow = recentSamples.filter((s) => s.timestamp >= windowStart);
  if (samplesInWindow.length < MIN_NEW_SAMPLES) return;

  const transcriptsInWindow = recentTranscripts
    .filter((t) => t.timestamp >= windowStart)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const summary = summarizeMetrics(samplesInWindow, baselineSamples);
  const userMessage = renderUserMessage(summary, transcriptsInWindow, windowStart, windowEnd);

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: BASE_SYSTEM_PROMPT + LANGUAGE_INSTRUCTION[locale],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report_analysis' },
      messages: [{ role: 'user', content: userMessage }],
    });

    const toolBlock = message.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      console.warn('[analyzer] Claude did not return the analysis tool call');
      return;
    }
    const parsed = analysisSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      console.warn('[analyzer] analysis payload failed validation', parsed.error);
      return;
    }

    const saved = await db.aIAnalysis.create({
      data: {
        schoolId,
        sessionId,
        windowStart,
        windowEnd,
        stateSummary: parsed.data.stateSummary,
        suggestedApproaches: parsed.data.suggestedApproaches,
        locale,
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    });

    await publishSessionEvent(sessionId, 'analysis', {
      id: saved.id,
      timestamp: saved.timestamp.toISOString(),
      windowStart: saved.windowStart.toISOString(),
      windowEnd: saved.windowEnd.toISOString(),
      stateSummary: saved.stateSummary,
      suggestedApproaches: saved.suggestedApproaches,
      locale: saved.locale,
      model: saved.model,
    });
  } catch (err) {
    console.warn('[analyzer] Claude call failed:', err);
  }
}

// ---------- group session analyzer ----------

const GROUP_MIN_INTERVAL_MS = 20_000;
const GROUP_MIN_NEW_TRANSCRIPTS = 1;

const GROUP_SYSTEM_PROMPT = `You are a decision-support assistant for a school counselor (مرشدة طلابية) facilitating a live GROUP counseling session with 2+ female students.

CRITICAL BOUNDARIES:
- Never diagnostic or clinical.
- Focus on GROUP dynamics — who is engaged, tone, cohesion, shared themes — NOT per-student labels.
- Output is private to the counselor, never shown to students.
- Prefer tentative language ("appears", "may suggest", "seems").
- If the transcript window is too short or ambiguous, say so honestly.

INPUT: a short recent transcript window (may be Arabic, English, or mixed) and the roster of participating students.

OUTPUT via the report_analysis tool:
- stateSummary: 1-2 sentences on the CURRENT group dynamic (engagement, tone, dominant theme).
- suggestedApproaches: 1-3 concrete facilitation moves for the counselor's NEXT few minutes (e.g. "invite quieter members in", "reflect the group's shared frustration", "shift topic").`;

export async function maybeRunGroupAnalysis(
  groupSessionId: string,
  schoolId: string,
  locale: 'en' | 'ar' = 'en'
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const db = tenantDb(schoolId);

  const [group, latest, recentTranscripts] = await Promise.all([
    db.groupSession.findFirst({
      where: { id: groupSessionId },
      include: {
        members: {
          include: {
            student: { select: { fullName: true, gradeLevel: true } },
          },
        },
      },
    }),
    db.aIAnalysis.findFirst({
      where: { groupSessionId },
      orderBy: { timestamp: 'desc' },
    }),
    db.transcriptSegment.findMany({
      where: { groupSessionId },
      orderBy: { timestamp: 'desc' },
      take: 20,
    }),
  ]);

  if (!group || group.status !== SessionStatus.ACTIVE) return;

  const now = new Date();
  if (latest && now.getTime() - latest.timestamp.getTime() < GROUP_MIN_INTERVAL_MS) return;

  const windowStart = latest?.windowEnd ?? group.startedAt ?? new Date(now.getTime() - 60_000);
  const windowEnd = now;

  const transcriptsInWindow = recentTranscripts
    .filter((t) => t.timestamp >= windowStart)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (transcriptsInWindow.length < GROUP_MIN_NEW_TRANSCRIPTS) return;

  const roster = group.members
    .map(
      (m) =>
        `- ${m.student.fullName}${m.student.gradeLevel ? ` (${m.student.gradeLevel})` : ''}`
    )
    .join('\n');

  const transcriptBlock = transcriptsInWindow
    .map((t) => `[${t.speaker.toLowerCase()}] ${t.text}`)
    .join('\n');

  const userMessage = [
    `GROUP: "${group.title}"${group.topic ? ` — topic: ${group.topic}` : ''}`,
    `WINDOW: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`,
    '',
    `PARTICIPANTS (${group.members.length}):`,
    roster,
    '',
    'RECENT TRANSCRIPT (chronological):',
    transcriptBlock,
    '',
    'Return the counselor-facing analysis via the report_analysis tool.',
  ].join('\n');

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: GROUP_SYSTEM_PROMPT + LANGUAGE_INSTRUCTION[locale],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report_analysis' },
      messages: [{ role: 'user', content: userMessage }],
    });

    const toolBlock = message.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') return;
    const parsed = analysisSchema.safeParse(toolBlock.input);
    if (!parsed.success) return;

    await db.aIAnalysis.create({
      data: {
        schoolId,
        groupSessionId,
        windowStart,
        windowEnd,
        stateSummary: parsed.data.stateSummary,
        suggestedApproaches: parsed.data.suggestedApproaches,
        locale,
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    });
  } catch (err) {
    console.warn('[group-analyzer] Claude call failed:', err);
  }
}

// ---------- helpers ----------

type Stat = {
  avg: number;
  min: number;
  max: number;
  baselineAvg: number | null;
  delta: number | null;
  trend: 'stable' | 'rising' | 'falling' | 'unknown';
};

function statFor(
  window: SessionSample[],
  baseline: SessionSample[],
  field: 'heartRate' | 'hrv' | 'spo2' | 'gsr' | 'skinTemp' | 'motionScore' | 'voiceLevel'
): Stat | null {
  const values = window.map((s) => s[field]).filter((v): v is number => v != null);
  if (values.length === 0) return null;

  const baseValues = baseline.map((s) => s[field]).filter((v): v is number => v != null);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const baselineAvg = baseValues.length
    ? baseValues.reduce((a, b) => a + b, 0) / baseValues.length
    : null;
  const delta = baselineAvg != null ? avg - baselineAvg : null;
  const trend: Stat['trend'] =
    delta == null
      ? 'unknown'
      : Math.abs(delta) < 0.05 * Math.max(1, Math.abs(baselineAvg ?? 1))
        ? 'stable'
        : delta > 0
          ? 'rising'
          : 'falling';

  return { avg, min, max, baselineAvg, delta, trend };
}

function summarizeMetrics(window: SessionSample[], baseline: SessionSample[]) {
  // Motion + battery excluded: current hand-rest sensor build (no MPU-6050, no divider)
  // always sends 0 for both, so feeding them to Claude would just be noise.
  return {
    heartRate: statFor(window, baseline, 'heartRate'),
    hrv: statFor(window, baseline, 'hrv'),
    spo2: statFor(window, baseline, 'spo2'),
    gsr: statFor(window, baseline, 'gsr'),
    skinTemp: statFor(window, baseline, 'skinTemp'),
    voiceLevel: statFor(window, baseline, 'voiceLevel'),
  };
}

function voiceQualitative(voice: Stat | null): string {
  if (!voice) return 'no voice signal in window';
  const avg = voice.avg;
  const category =
    avg < 0.01 ? 'mostly silent'
    : avg < 0.05 ? 'quiet / hushed speech'
    : avg < 0.15 ? 'normal conversational speech'
    : 'elevated / loud speech';
  return `${category} (avg RMS ${avg.toFixed(3)}, peak ${voice.max.toFixed(3)}, ${voice.trend} vs baseline)`;
}

function fmt(s: Stat | null, unit: string, decimals = 1): string {
  if (!s) return 'no data';
  const avg = s.avg.toFixed(decimals);
  const baseline = s.baselineAvg != null ? s.baselineAvg.toFixed(decimals) : '—';
  return `avg ${avg}${unit} (baseline ${baseline}${unit}, ${s.trend})`;
}

function renderUserMessage(
  summary: ReturnType<typeof summarizeMetrics>,
  transcripts: TranscriptSegment[],
  windowStart: Date,
  windowEnd: Date
): string {
  const transcriptBlock =
    transcripts.length > 0
      ? transcripts
          .map((t) => `[${t.speaker.toLowerCase()}] ${t.text}`)
          .join('\n')
      : '(no transcript segments in this window)';

  return [
    `WINDOW: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`,
    '',
    'BIOMETRICS:',
    `- Heart rate: ${fmt(summary.heartRate, ' bpm', 0)}`,
    `- SpO₂: ${fmt(summary.spo2, '%', 0)}`,
    `- GSR (skin conductance, higher = more sympathetic arousal): ${fmt(summary.gsr, ' µS')}`,
    `- Skin temp: ${fmt(summary.skinTemp, '°C')}`,
    '',
    `VOICE ACTIVITY (from browser mic): ${voiceQualitative(summary.voiceLevel)}`,
    '',
    'TRANSCRIPT (chronological):',
    transcriptBlock,
    '',
    'Return the counselor-facing analysis via the report_analysis tool.',
  ].join('\n');
}
