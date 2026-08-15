import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

export default async function AuditLogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.audit');

  const [entries, schools, users] = await Promise.all([
    db.auditLogEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    db.school.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ select: { id: true, fullName: true, email: true } }),
  ]);

  const schoolMap = new Map(schools.map((s) => [s.id, s.name]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t('when')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('actor')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('school')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('action')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('target')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              entries.map((e) => {
                const actor = e.actorUserId ? userMap.get(e.actorUserId) : null;
                const school = e.schoolId ? schoolMap.get(e.schoolId) : null;
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="px-4 py-3">
                      {actor ? (
                        <div>
                          <div className="text-sm">{actor.fullName}</div>
                          <div className="text-[10px] text-muted-foreground">{actor.email}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">system</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {school ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-muted-foreground">{e.targetType}</div>
                      {e.targetId && (
                        <div className="mt-0.5 font-mono text-[10px]">{e.targetId}</div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('showingLast', { n: entries.length })}
      </p>
    </div>
  );
}
