import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { SessionBadge } from '@/components/status-badge';
import { TimeSeriesChart } from '@/components/timeseries-chart';
import { PrintButton } from '@/components/print-button';
import { getCounselorContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { gsrToNervousness } from '@/lib/utils';
import { AnalysisEntry } from '@/components/analysis-entry';
import { ReportChat } from '@/components/report-chat';

export const dynamic = 'force-dynamic';

export default async function SessionReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('report');
  const tSessions = await getTranslations('sessions');
  const tLive = await getTranslations('sessions.live');
  const tStatus = await getTranslations('sessions.status');
  const tChat = await getTranslations('chat');
  const chatLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';
  const { db, user, schoolId } = await getCounselorContext(locale);

  const session = await db.session.findFirst({
    where: { id },
    include: {
      student: { include: { school: true } },
      counselor: true,
      device: true,
      samples: {
        select: {
          timestamp: true,
          heartRate: true,
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
    action: 'session.report.view',
    targetType: 'session',
    targetId: session.id,
  });

  const started = session.startedAt ? new Date(session.startedAt) : null;
  const ended = session.endedAt ? new Date(session.endedAt) : null;
  const durationMin =
    started && ended
      ? Math.round((ended.getTime() - started.getTime()) / 60000)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-full">
      <PageHeader
        title={t('sessionReport')}
        description={session.student.fullName}
        action={<PrintButton label={t('print')} />}
      />

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SessionBadge status={session.status} label={tStatus(session.status)} />
          {started && <span className="text-sm">{started.toLocaleString(locale)}</span>}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Info label={tSessions('counselor')} value={session.counselor.fullName} />
          <Info label={tSessions('device')} value={session.device?.name ?? '—'} />
          <Info
            label={tSessions('duration')}
            value={durationMin ? `${durationMin} min` : '—'}
          />
          <Info label={tSessions('samplesCount')} value={String(session.samples.length)} />
        </dl>
        {session.notes && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {tSessions('notes')}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{session.notes}</p>
          </div>
        )}
      </section>

      {session.samples.length > 0 && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="text-rose-600">
            <TimeSeriesChart
              points={session.samples.map((s) => ({ t: s.timestamp, v: s.heartRate }))}
              min={40}
              max={140}
              label={tLive('hr')}
              unit="bpm"
              emptyLabel={tSessions('noSamples')}
            />
          </div>
          <div className="text-sky-600">
            <TimeSeriesChart
              points={session.samples.map((s) => ({
                t: s.timestamp,
                v: gsrToNervousness(s.gsr),
              }))}
              min={0}
              max={100}
              label={tLive('gsr')}
              unit="%"
              emptyLabel={tSessions('noSamples')}
            />
          </div>
        </section>
      )}

      {session.analyses.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            {tSessions('analysesTimeline')}
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
                    translating: tSessions('translating'),
                    translatedNote: tSessions('translated'),
                    originalNote: tSessions('originalLang'),
                  }}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      {session.transcripts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">{tSessions('transcript')}</h3>
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

      <footer className="border-t border-border pt-4 text-[10px] text-muted-foreground">
        {t('footer', {
          school: session.student.school?.name ?? '',
          counselor: user.fullName,
          date: new Date().toLocaleString(locale),
        })}
      </footer>

      <div className="print:hidden">
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
