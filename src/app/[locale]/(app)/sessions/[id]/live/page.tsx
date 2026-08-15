import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { SessionLivePanel } from '@/components/session-live-panel';
import { getCounselorContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { SessionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('sessions.live');
  const { db, user, schoolId } = await getCounselorContext(locale);

  const session = await db.session.findFirst({
    where: { id },
    include: { student: true },
  });
  if (!session) notFound();
  if (session.counselorId !== user.id) notFound();
  if (session.status !== SessionStatus.ACTIVE) {
    redirect(`/${locale}/sessions/${session.id}`);
  }

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'session.live.view',
    targetType: 'session',
    targetId: session.id,
  });

  const latestAnalysis = await db.aIAnalysis.findFirst({
    where: { sessionId: session.id },
    orderBy: { timestamp: 'desc' },
  });

  const initialAnalysis = latestAnalysis
    ? {
        id: latestAnalysis.id,
        timestamp: latestAnalysis.timestamp.toISOString(),
        stateSummary: latestAnalysis.stateSummary,
        suggestedApproaches: latestAnalysis.suggestedApproaches as string[],
        locale: latestAnalysis.locale,
        model: latestAnalysis.model,
      }
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('title')} description={session.student.fullName} />
      <SessionLivePanel
        sessionId={session.id}
        initialAnalysis={initialAnalysis}
        labels={{
          pair: t('pair'),
          pairing: t('pairing'),
          paired: t('paired'),
          notSupported: t('notSupported'),
          simulate: t('simulate'),
          stopSimulate: t('stopSimulate'),
          endSession: t('endSession'),
          samplesSent: t('samplesSent'),
          hr: t('hr'),
          hrv: t('hrv'),
          spo2: t('spo2'),
          gsr: t('gsr'),
          skinTemp: t('skinTemp'),
          motion: t('motion'),
          battery: t('battery'),
          reminder: t('reminder'),
          analysisTitle: t('analysisTitle'),
          analysisEmpty: t('analysisEmpty'),
          analysisApproaches: t('analysisApproaches'),
          analysisUpdated: t('analysisUpdated'),
          analysisModel: t('analysisModel'),
          analysisTranslating: t('analysisTranslating'),
          analysisTranslated: t('analysisTranslated'),
          analysisOriginal: t('analysisOriginal'),
          micTitle: t('micTitle'),
          micEnable: t('micEnable'),
          micMute: t('micMute'),
          micUnmute: t('micUnmute'),
          micRequesting: t('micRequesting'),
          micIdle: t('micIdle'),
          micMuted: t('micMuted'),
          micDenied: t('micDenied'),
          micUnsupported: t('micUnsupported'),
          micNotConfigured: t('micNotConfigured'),
          voiceSilent: t('voiceSilent'),
          voiceSoft: t('voiceSoft'),
          voiceSpeaking: t('voiceSpeaking'),
          voiceElevated: t('voiceElevated'),
          voiceHint: t('voiceHint'),
        }}
      />
    </div>
  );
}
