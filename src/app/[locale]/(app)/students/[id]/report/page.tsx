import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { ConsentBadge } from '@/components/status-badge';
import { TimeSeriesChart } from '@/components/timeseries-chart';
import { PrintButton } from '@/components/print-button';
import { GrowthCard, type GrowthMetrics } from '@/components/growth-card';
import { ReportChat } from '@/components/report-chat';
import { getCounselorContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { ConsentStatus, SessionStatus } from '@prisma/client';
import { regenerateStudentGrowth } from '../../growth-actions';

export const dynamic = 'force-dynamic';

export default async function StudentReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('report');
  const tCommon = await getTranslations('students');
  const tLive = await getTranslations('sessions.live');
  const tStatus = await getTranslations('consent.status');
  const tGrowth = await getTranslations('report.growth');
  const tChat = await getTranslations('chat');
  const chatLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';
  const { db, user, schoolId } = await getCounselorContext(locale);

  const student = await db.student.findFirst({
    where: { id, deletedAt: null },
    include: {
      consent: true,
      school: true,
    },
  });
  if (!student) notFound();

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'student.report.view',
    targetType: 'student',
    targetId: student.id,
  });

  const sessions = await db.session.findMany({
    where: {
      studentId: id,
      status: SessionStatus.COMPLETED,
      deletedAt: null,
    },
    orderBy: { startedAt: 'asc' },
    include: {
      samples: { select: { heartRate: true, gsr: true } },
      _count: { select: { analyses: true } },
    },
  });

  const perSession = sessions.map((s) => {
    const hrValues = s.samples.map((x) => x.heartRate).filter((v): v is number => v != null);
    const gsrValues = s.samples.map((x) => x.gsr).filter((v): v is number => v != null);
    return {
      id: s.id,
      date: s.startedAt ?? s.createdAt,
      avgHr: hrValues.length ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : null,
      avgGsr: gsrValues.length ? gsrValues.reduce((a, b) => a + b, 0) / gsrValues.length : null,
      duration:
        s.startedAt && s.endedAt
          ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
          : 0,
    };
  });

  const totalMinutes = perSession.reduce((a, b) => a + b.duration, 0);
  const consentStatus = student.consent?.status ?? ConsentStatus.PENDING;

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-full">
      <PageHeader
        title={t('studentReport')}
        description={student.school?.name ?? ''}
        action={<PrintButton label={t('print')} />}
      />

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {tCommon('fullName')}
            </div>
            <div className="mt-0.5 text-lg font-semibold">{student.fullName}</div>
          </div>
          <ConsentBadge status={consentStatus} label={tStatus(consentStatus)} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Info label={tCommon('externalId')} value={student.externalId} />
          <Info label={tCommon('gradeLevel')} value={student.gradeLevel ?? '—'} />
          <Info label={t('sessionsCount')} value={String(sessions.length)} />
          <Info label={t('totalTime')} value={`${totalMinutes} min`} />
        </dl>
      </section>

      <GrowthCard
        summary={student.growthSummary}
        summaryLocale={student.growthLocale}
        metrics={student.growthMetrics as GrowthMetrics}
        generatedAt={student.growthGeneratedAt}
        action={regenerateStudentGrowth}
        studentId={student.id}
        locale={locale}
        labels={{
          title: tGrowth('title'),
          emptyOneSession: tGrowth('emptyOneSession'),
          emptyReady: tGrowth('emptyReady'),
          generateCta: tGrowth('generateCta'),
          regenerateCta: tGrowth('regenerateCta'),
          generating: tGrowth('generating'),
          hrBaseline: tGrowth('hrBaseline'),
          gsrBaseline: tGrowth('gsrBaseline'),
          motionBaseline: tGrowth('motionBaseline'),
          improving: tGrowth('improving'),
          stable: tGrowth('stable'),
          rising: tGrowth('rising'),
          updated: tGrowth('updated'),
        }}
        translationLabels={{
          translating: tLive('analysisTranslating'),
          translated: tLive('analysisTranslated'),
          originalNote: tLive('analysisOriginal'),
        }}
      />

      {perSession.length >= 2 && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="text-rose-600">
            <TimeSeriesChart
              points={perSession.map((p) => ({ t: p.date, v: p.avgHr }))}
              min={40}
              max={140}
              label={`${tLive('hr')} — ${t('perSessionAvg')}`}
              unit="bpm"
              emptyLabel={t('notEnoughData')}
            />
          </div>
          <div className="text-sky-600">
            <TimeSeriesChart
              points={perSession.map((p) => ({ t: p.date, v: p.avgGsr }))}
              min={0}
              max={10}
              label={`${tLive('gsr')} — ${t('perSessionAvg')}`}
              unit="µS"
              emptyLabel={t('notEnoughData')}
            />
          </div>
        </section>
      )}

      {perSession.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">{t('sessionsList')}</h3>
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t('date')}</th>
                  <th className="px-4 py-3 text-start font-medium">{t('duration')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tLive('hr')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tLive('gsr')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perSession
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        {new Date(p.date).toLocaleDateString(locale)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.duration} min
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.avgHr != null ? `${p.avgHr.toFixed(0)} bpm` : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.avgGsr != null ? `${p.avgGsr.toFixed(1)} µS` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="border-t border-border pt-4 text-[10px] text-muted-foreground">
        {t('footer', {
          school: student.school?.name ?? '',
          counselor: user.fullName,
          date: new Date().toLocaleString(locale),
        })}
      </footer>

      <div className="print:hidden">
        <ReportChat
          mode="student"
          id={student.id}
          locale={chatLocale}
          labels={{
            fab: tChat('fab'),
            title: tChat('titleStudent'),
            subtitle: tChat('subtitleStudent'),
            placeholder: tChat('placeholder'),
            send: tChat('send'),
            thinking: tChat('thinking'),
            errorGeneric: tChat('errorGeneric'),
            emptyState: tChat('emptyStateStudent'),
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
