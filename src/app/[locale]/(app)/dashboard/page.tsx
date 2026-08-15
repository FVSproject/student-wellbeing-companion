import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalendarClock, Users, ShieldCheck } from 'lucide-react';
import { UserRole } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/auth';
import { getSchoolContext } from '@/lib/auth';

export default async function DashboardHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Foundation admins don't have a school context — send them to /admin.
  const me = await getCurrentUser();
  if (me.role === UserRole.FOUNDATION_ADMIN) {
    redirect(`/${locale}/admin`);
  }

  const t = await getTranslations('dashboard');
  const tCommon = await getTranslations('nav');
  const { db, user } = await getSchoolContext();

  const [studentCount, activeSessionCount, pendingConsentCount] = await Promise.all([
    db.student.count({ where: { deletedAt: null } }),
    db.session.count({ where: { status: 'ACTIVE' } }),
    db.consentRecord.count({ where: { status: 'PENDING' } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('welcome', { name: user.fullName })}
        description={t('welcomeBody')}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label={tCommon('students')}
          value={studentCount}
          href="/students"
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label={t('activeSessions')}
          value={activeSessionCount}
          href="/sessions"
        />
        <StatCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label={t('pendingConsents')}
          value={pendingConsentCount}
          href="/students"
        />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-accent px-6 py-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {t('framingLabel')}
        </p>
        <p className="mt-1 text-sm text-foreground">{t('framingBody')}</p>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: '/students' | '/sessions' | '/reports';
}) {
  return (
    <Link
      href={href}
      className="card block transition hover:border-primary hover:shadow"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </Link>
  );
}
