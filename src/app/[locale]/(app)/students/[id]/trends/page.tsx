import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalendarClock, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { TimeSeriesChart } from '@/components/timeseries-chart';
import { getCounselorContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { gsrToNervousness } from '@/lib/utils';
import { SessionStatus } from '@prisma/client';
import { ReportChat } from '@/components/report-chat';

export default async function StudentTrendsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('trends');
  const tLive = await getTranslations('sessions.live');
  const tChat = await getTranslations('chat');
  const chatLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';
  const { db, user, schoolId } = await getCounselorContext(locale);

  const student = await db.student.findFirst({
    where: { id, deletedAt: null },
  });
  if (!student) notFound();

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'student.trends.view',
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
      samples: {
        select: { heartRate: true, gsr: true },
      },
      _count: { select: { samples: true, analyses: true } },
    },
  });

  const sessionPoints = sessions.map((s) => {
    const hrValues = s.samples.map((x) => x.heartRate).filter((v): v is number => v != null);
    const gsrValues = s.samples.map((x) => x.gsr).filter((v): v is number => v != null);
    const startedAt = s.startedAt ?? s.createdAt;
    const durationMin =
      s.startedAt && s.endedAt
        ? Math.round(
            (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000
          )
        : 0;
    return {
      id: s.id,
      date: startedAt,
      avgHr: hrValues.length ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : null,
      avgGsr: gsrValues.length ? gsrValues.reduce((a, b) => a + b, 0) / gsrValues.length : null,
      duration: durationMin,
      samples: s._count.samples,
      analyses: s._count.analyses,
    };
  });

  const totalSessions = sessionPoints.length;
  const totalMinutes = sessionPoints.reduce((a, b) => a + b.duration, 0);
  const totalSamples = sessionPoints.reduce((a, b) => a + b.samples, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('title')} description={student.fullName} />

      <section className="grid gap-4 md:grid-cols-3">
        <StatTile
          icon={<CalendarClock className="h-5 w-5" />}
          label={t('sessions')}
          value={String(totalSessions)}
        />
        <StatTile
          icon={<CalendarClock className="h-5 w-5" />}
          label={t('totalTime')}
          value={`${totalMinutes} min`}
        />
        <StatTile
          icon={<Sparkles className="h-5 w-5" />}
          label={t('samplesCollected')}
          value={String(totalSamples)}
        />
      </section>

      {totalSessions < 2 ? (
        <div className="card text-center text-sm text-muted-foreground">
          {t('notEnoughData')}
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="text-rose-600">
            <TimeSeriesChart
              points={sessionPoints.map((p) => ({ t: p.date, v: p.avgHr }))}
              min={40}
              max={140}
              label={`${tLive('hr')} — ${t('perSessionAvg')}`}
              unit="bpm"
              color="currentColor"
              emptyLabel={t('notEnoughData')}
            />
          </div>
          <div className="text-sky-600">
            <TimeSeriesChart
              points={sessionPoints.map((p) => ({
                t: p.date,
                v: gsrToNervousness(p.avgGsr),
              }))}
              min={0}
              max={100}
              label={`${tLive('gsr')} — ${t('perSessionAvg')}`}
              unit="%"
              color="currentColor"
              emptyLabel={t('notEnoughData')}
            />
          </div>
        </section>
      )}

      {totalSessions > 0 && (
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
                  <th className="px-4 py-3 text-end font-medium">{t('view')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessionPoints
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {p.date ? new Date(p.date).toLocaleDateString(locale) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.duration} min
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.avgHr != null ? `${p.avgHr.toFixed(0)} bpm` : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {(() => {
                          const n = gsrToNervousness(p.avgGsr);
                          return n != null ? `${n}%` : '—';
                        })()}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Link
                          href={`/sessions/${p.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          →
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div>
        <Link
          href={`/students/${student.id}`}
          className="text-sm text-primary hover:underline"
        >
          ← {t('backToStudent')}
        </Link>
      </div>

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
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}
