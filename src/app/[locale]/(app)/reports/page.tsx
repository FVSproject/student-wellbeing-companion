import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FileText, TrendingUp, CalendarClock } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { getCounselorContext } from '@/lib/auth';
import { SessionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('reports');
  const { db } = await getCounselorContext(locale);

  const [students, recentSessions] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { sessions: { where: { deletedAt: null } } } },
      },
      orderBy: { fullName: 'asc' },
    }),
    db.session.findMany({
      where: {
        deletedAt: null,
        status: SessionStatus.COMPLETED,
      },
      include: { student: true },
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t('perStudent')}
        </h3>
        {students.length === 0 ? (
          <div className="card text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {students.map((s) => (
              <div key={s.id} className="card flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.externalId} · {s._count.sessions} {t('sessions')}
                  </div>
                </div>
                <Link
                  href={`/students/${s.id}/report`}
                  className="btn-ghost text-xs"
                >
                  <FileText className="h-4 w-4 ltr:mr-1.5 rtl:ml-1.5" />
                  {t('openReport')}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          {t('perSession')}
        </h3>
        {recentSessions.length === 0 ? (
          <div className="card text-center text-sm text-muted-foreground">
            {t('noSessions')}
          </div>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <div key={s.id} className="card flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{s.student.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.startedAt ? new Date(s.startedAt).toLocaleString(locale) : '—'}
                  </div>
                </div>
                <Link
                  href={`/sessions/${s.id}/report`}
                  className="btn-ghost text-xs"
                >
                  <FileText className="h-4 w-4 ltr:mr-1.5 rtl:ml-1.5" />
                  {t('openReport')}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
