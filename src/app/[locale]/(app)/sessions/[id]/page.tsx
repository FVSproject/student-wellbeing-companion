import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { SessionBadge } from '@/components/status-badge';
import { TimeSeriesChart } from '@/components/timeseries-chart';
import { getCounselorContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { gsrToNervousness } from '@/lib/utils';
import { deleteSession, regenerateSessionSummary } from './../actions';
import { DeleteButton } from '@/components/delete-button';
import { AnalysisEntry } from '@/components/analysis-entry';
import { SessionSummaryCard } from '@/components/session-summary-card';
import { ReportChat } from '@/components/report-chat';
import { SessionStatus } from '@prisma/client';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('sessions');
  const tLive = await getTranslations('sessions.live');
  const tStatus = await getTranslations('sessions.status');
  const tSummary = await getTranslations('sessions.sessionSummary');
  const tChat = await getTranslations('chat');
  const chatLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';
  const { db, user, schoolId } = await getCounselorContext(locale);

  const session = await db.session.findFirst({
    where: { id },
    include: {
      student: true,
      counselor: true,
      device: true,
      samples: {
        select: {
          timestamp: true,
          heartRate: true,
          hrv: true,
          gsr: true,
          skinTemp: true,
          motionScore: true,
        },
        orderBy: { timestamp: 'asc' },
      },
      transcripts: { orderBy: { timestamp: 'asc' } },
      analyses: { orderBy: { timestamp: 'desc' } },
    },
  });
  if (!session) notFound();

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'session.view',
    targetType: 'session',
    targetId: session.id,
    metadata: { studentId: session.studentId, samples: session.samples.length },
  });

  const started = session.startedAt ? new Date(session.startedAt) : null;
  const ended = session.endedAt ? new Date(session.endedAt) : null;
  const durationMin =
    started && ended
      ? Math.round((ended.getTime() - started.getTime()) / 60000)
      : null;

  const hrPoints = session.samples.map((s) => ({ t: s.timestamp, v: s.heartRate }));
  const gsrPoints = session.samples.map((s) => ({
    t: s.timestamp,
    v: gsrToNervousness(s.gsr),
  }));
  const skinPoints = session.samples.map((s) => ({ t: s.timestamp, v: s.skinTemp }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={session.student.fullName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <SessionBadge status={session.status} label={tStatus(session.status)} />
            {started && <span className="text-sm">{started.toLocaleString(locale)}</span>}
          </span>
        }
      />

      {session.status === SessionStatus.COMPLETED && (
        <SessionSummaryCard
          summary={session.overallSummary}
          suggestion={session.overallSuggestion}
          generatedAt={session.summaryGeneratedAt}
          model={session.summaryModel}
          summaryLocale={session.summaryLocale}
          action={regenerateSessionSummary}
          sessionId={session.id}
          locale={locale}
          labels={{
            title: tSummary('title'),
            empty: tSummary('empty'),
            generateCta: tSummary('generateCta'),
            regenerateCta: tSummary('regenerateCta'),
            generating: tSummary('generating'),
            forNextSession: tSummary('forNextSession'),
            updated: tSummary('updated'),
          }}
          translationLabels={{
            translating: t('translating'),
            translated: t('translated'),
            originalNote: t('originalLang'),
          }}
        />
      )}

      <section className="card">
        <h3 className="text-sm font-semibold">{t('summary')}</h3>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Info label={t('counselor')} value={session.counselor.fullName} />
          <Info label={t('device')} value={session.device?.name ?? '—'} />
          <Info
            label={t('duration')}
            value={durationMin ? `${durationMin} min` : t('inProgress')}
          />
          <Info label={t('samplesCount')} value={String(session.samples.length)} />
        </dl>
        {session.notes && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('notes')}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{session.notes}</p>
          </div>
        )}
      </section>

      {session.samples.length > 0 && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="text-rose-600">
            <TimeSeriesChart
              points={hrPoints}
              min={40}
              max={140}
              label={tLive('hr')}
              unit="bpm"
              color="currentColor"
              emptyLabel={t('noSamples')}
            />
          </div>
          <div className="text-sky-600">
            <TimeSeriesChart
              points={gsrPoints}
              min={0}
              max={100}
              label={tLive('gsr')}
              unit="%"
              color="currentColor"
              emptyLabel={t('noSamples')}
            />
          </div>
          <div className="text-amber-600 md:col-span-2">
            <TimeSeriesChart
              points={skinPoints}
              min={32}
              max={37}
              label={tLive('skinTemp')}
              unit="°C"
              color="currentColor"
              emptyLabel={t('noSamples')}
            />
          </div>
        </section>
      )}

      {session.analyses.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('analysesTimeline')}
          </h3>
          <ol className="space-y-3">
            {session.analyses.map((a) => (
              <li key={a.id} className="card">
                <AnalysisEntry
                  analysis={{
                    id: a.id,
                    timestamp: a.timestamp.toISOString(),
                    stateSummary: a.stateSummary,
                    suggestedApproaches: a.suggestedApproaches as string[],
                    locale: a.locale,
                    model: a.model,
                  }}
                  labels={{
                    translating: t('translating'),
                    translatedNote: t('translated'),
                    originalNote: t('originalLang'),
                  }}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      {session.transcripts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">{t('transcript')}</h3>
          <div className="card space-y-3">
            {session.transcripts.map((seg) => (
              <div key={seg.id.toString()} className="text-sm">
                <div className="mb-0.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>{seg.speaker.toLowerCase()}</span>
                  <span>·</span>
                  <span>{new Date(seg.timestamp).toLocaleTimeString(locale)}</span>
                </div>
                <p>{seg.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-rose-900">{t('dangerZone')}</h3>
            <p className="mt-1 text-xs text-rose-800">{t('deleteSessionHint')}</p>
          </div>
          <DeleteButton
            action={deleteSession}
            hiddenFields={{ sessionId: session.id }}
            confirmMessage={t('confirmDeleteSession')}
            label={t('deleteSession')}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/students/${session.student.id}`}
          className="text-sm text-primary hover:underline"
        >
          ← {t('backToStudent')}
        </Link>
        <Link
          href={`/students/${session.student.id}/trends`}
          className="text-sm text-primary hover:underline"
        >
          {t('viewTrends')} →
        </Link>
      </div>

      <ReportChat
        mode="session"
        id={session.id}
        locale={chatLocale}
        labels={{
          fab: tChat('fab'),
          title: tChat('titleSession'),
          subtitle: tChat('subtitleSession'),
          placeholder: tChat('placeholder'),
          send: tChat('send'),
          thinking: tChat('thinking'),
          errorGeneric: tChat('errorGeneric'),
          emptyState: tChat('emptyStateSession'),
          close: tChat('close'),
        }}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
