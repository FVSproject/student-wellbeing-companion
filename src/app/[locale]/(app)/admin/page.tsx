import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Building2, Users, GraduationCap, CalendarClock, EyeOff, Pencil } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { db } from '@/lib/db';
import { SessionStatus, UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin');

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [schools, counselors, students, sessionsAll, sessionsWeek, foundation] =
    await Promise.all([
      db.school.count({ where: { deletedAt: null } }),
      db.user.count({ where: { role: UserRole.COUNSELOR } }),
      db.student.count({ where: { deletedAt: null } }),
      db.session.count({ where: { deletedAt: null } }),
      db.session.count({ where: { deletedAt: null, startedAt: { gte: weekAgo } } }),
      db.foundation.findFirst({}),
    ]);

  const schoolStats = await db.school.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: {
          students: { where: { deletedAt: null } },
          users: true,
          sessions: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('title')}
        description={foundation?.name ?? t('subtitle')}
      />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Stat icon={<Building2 className="h-5 w-5" />} label={t('schools')} value={schools} />
        <Stat icon={<Users className="h-5 w-5" />} label={t('counselors')} value={counselors} />
        <Stat icon={<GraduationCap className="h-5 w-5" />} label={t('students')} value={students} />
        <Stat icon={<CalendarClock className="h-5 w-5" />} label={t('sessionsWeek')} value={sessionsWeek} />
        <Stat icon={<CalendarClock className="h-5 w-5" />} label={t('sessionsAllTime')} value={sessionsAll} />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">{t('schoolsList')}</h3>
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('schoolCol')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('city')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('counselors')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('students')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('sessionsAllTime')}</th>
                <th className="px-4 py-3 text-end font-medium">{t('manage')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schoolStats.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.city ?? '—'}</td>
                  <td className="px-4 py-3">{s._count.users}</td>
                  <td className="px-4 py-3">{s._count.students}</td>
                  <td className="px-4 py-3">{s._count.sessions}</td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/admin/schools/${s.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      {t('edit')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-xs text-primary">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{t('privacyNotice')}</div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
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
