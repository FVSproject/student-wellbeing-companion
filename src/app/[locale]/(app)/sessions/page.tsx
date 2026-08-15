import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { SessionBadge } from '@/components/status-badge';
import { DeleteRowButton } from '@/components/delete-row-button';
import { getCounselorContext } from '@/lib/auth';
import { SessionStatus } from '@prisma/client';
import { deleteSession } from './actions';

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('sessions');
  const tStatus = await getTranslations('sessions.status');
  const { db } = await getCounselorContext(locale);

  const sessions = await db.session.findMany({
    where: { deletedAt: null },
    include: { student: true },
    orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
    take: 100,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('listTitle')}
        description={t('listSubtitle')}
        action={
          <Link href="/sessions/groups" className="btn-ghost text-sm">
            {t('groupSessionsLink')} →
          </Link>
        }
      />

      {sessions.length === 0 ? (
        <div className="card text-center">
          <h3 className="text-base font-medium">{t('empty')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
          <Link href="/students" className="btn-primary mt-4 inline-flex">
            {t('goToStudents')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('student')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('statusLabel')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('started')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('duration')}</th>
                <th className="px-4 py-3 text-end font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((s) => {
                const started = s.startedAt ? new Date(s.startedAt) : null;
                const ended = s.endedAt ? new Date(s.endedAt) : null;
                const durationMin =
                  started && ended
                    ? Math.round((ended.getTime() - started.getTime()) / 60000)
                    : null;
                const isActive = s.status === SessionStatus.ACTIVE;
                return (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.student.fullName}</td>
                    <td className="px-4 py-3">
                      <SessionBadge status={s.status} label={tStatus(s.status)} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {started ? started.toLocaleString(locale) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {isActive ? t('inProgress') : durationMin ? `${durationMin} min` : '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={isActive ? `/sessions/${s.id}/live` : `/sessions/${s.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {isActive ? t('enterLive') : t('view')} →
                        </Link>
                        {!isActive && (
                          <DeleteRowButton
                            action={deleteSession}
                            hiddenFields={{ sessionId: s.id }}
                            confirmMessage={t('confirmDeleteSession')}
                            label={t('deleteSession')}
                          />
                        )}
                      </div>
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
