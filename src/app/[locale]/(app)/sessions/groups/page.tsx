import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Users, Plus } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { SessionBadge } from '@/components/status-badge';
import { getCounselorContext } from '@/lib/auth';

export default async function GroupSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('groupSessions');
  const tStatus = await getTranslations('sessions.status');
  const { db } = await getCounselorContext(locale);

  const groups = await db.groupSession.findMany({
    where: { deletedAt: null },
    orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
    take: 100,
    include: {
      members: { include: { student: { select: { fullName: true } } } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('listTitle')}
        description={t('listSubtitle')}
        action={
          <Link href="/sessions/groups/new" className="btn-primary text-sm">
            <Plus className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {t('newCta')}
          </Link>
        }
      />

      {groups.length === 0 ? (
        <div className="card text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-accent text-primary">
            <Users className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-base font-medium">{t('empty')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
          <Link href="/sessions/groups/new" className="btn-primary mt-4 inline-flex">
            {t('newCta')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('title')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('statusLabel')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('members')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('started')}</th>
                <th className="px-4 py-3 text-end font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groups.map((g) => {
                const roster = g.members
                  .map((m) => m.student.fullName)
                  .slice(0, 3)
                  .join('، ');
                const extra = g.members.length > 3 ? ` +${g.members.length - 3}` : '';
                return (
                  <tr key={g.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{g.title}</td>
                    <td className="px-4 py-3">
                      <SessionBadge status={g.status} label={tStatus(g.status)} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {roster}
                      {extra}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {g.startedAt ? new Date(g.startedAt).toLocaleString(locale) : '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Link
                        href={`/sessions/groups/${g.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {t('view')} →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
