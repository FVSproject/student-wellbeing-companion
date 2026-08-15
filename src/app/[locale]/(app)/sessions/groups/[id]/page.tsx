import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Users, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { SessionBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import { DeleteButton } from '@/components/delete-button';
import { ReportChat } from '@/components/report-chat';
import { GroupLivePanel } from '@/components/group-live-panel';
import { getCounselorContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { SessionStatus } from '@prisma/client';
import {
  endGroupSession,
  regenerateGroupSummary,
  deleteGroupSession,
} from '../actions';

export default async function GroupSessionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('groupSessions');
  const tStatus = await getTranslations('sessions.status');
  const tChat = await getTranslations('chat');
  const { db, user, schoolId } = await getCounselorContext(locale);
  const chatLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';

  const group = await db.groupSession.findFirst({
    where: { id, deletedAt: null },
    include: {
      counselor: { select: { fullName: true } },
      members: {
        include: {
          student: {
            select: { id: true, fullName: true, gradeLevel: true, avatarUrl: true },
          },
        },
      },
    },
  });
  if (!group) notFound();

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'groupSession.view',
    targetType: 'groupSession',
    targetId: group.id,
    metadata: { memberCount: group.members.length },
  });

  const isActive = group.status === SessionStatus.ACTIVE;
  const durationMin =
    group.startedAt && group.endedAt
      ? Math.round(
          (group.endedAt.getTime() - group.startedAt.getTime()) / 60000
        )
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={group.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <SessionBadge status={group.status} label={tStatus(group.status)} />
            {group.startedAt && (
              <span className="text-sm">
                {new Date(group.startedAt).toLocaleString(locale)}
              </span>
            )}
          </span>
        }
      />

      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {t('members')} ({group.members.length})
          </h3>
        </div>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {group.members.map((m) => (
            <li
              key={m.student.id}
              className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
            >
              <Link
                href={`/students/${m.student.id}`}
                className="font-medium hover:underline"
              >
                {m.student.fullName}
              </Link>
              {m.student.gradeLevel && (
                <span className="text-xs text-muted-foreground">
                  {m.student.gradeLevel}
                </span>
              )}
            </li>
          ))}
        </ul>
        {group.topic && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('topicLabel')}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{group.topic}</p>
          </div>
        )}
      </section>

      {isActive && <GroupLivePanel groupId={group.id} />}

      {isActive ? (
        <form action={endGroupSession} className="card space-y-3">
          <input type="hidden" name="groupId" value={group.id} />
          <div>
            <label htmlFor="notes" className="block text-sm font-medium">
              {t('endNotesLabel')}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('endNotesHint')}
            </p>
            <textarea
              id="notes"
              name="notes"
              rows={5}
              maxLength={4000}
              placeholder={t('endNotesPlaceholder')}
              className="mt-2 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <SubmitButton pendingLabel={t('ending')}>{t('endCta')}</SubmitButton>
        </form>
      ) : (
        <>
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t('summaryTitle')}</h3>
              </div>
              <form action={regenerateGroupSummary}>
                <input type="hidden" name="groupId" value={group.id} />
                <SubmitButton
                  className="btn-ghost text-xs"
                  pendingLabel={t('summaryGenerating')}
                >
                  {group.overallSummary ? t('summaryRegenerate') : t('summaryGenerate')}
                </SubmitButton>
              </form>
            </div>
            {group.overallSummary ? (
              <div className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{group.overallSummary}</p>
                {group.overallSuggestion && (
                  <div className="rounded-md bg-accent/40 px-3 py-2 text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('summarySuggestion')}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {group.overallSuggestion}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('summaryEmpty')}</p>
            )}
          </section>

          {group.notes && (
            <section className="card">
              <h3 className="text-sm font-semibold">{t('facilitatorNotes')}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{group.notes}</p>
            </section>
          )}
        </>
      )}

      <section className="card text-xs text-muted-foreground">
        <span className="me-4">
          {t('counselor')}: {group.counselor.fullName}
        </span>
        {durationMin && (
          <span>
            {t('duration')}: {durationMin} min
          </span>
        )}
      </section>

      <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-rose-900">
              {t('dangerZone')}
            </h3>
            <p className="mt-1 text-xs text-rose-800">{t('deleteHint')}</p>
          </div>
          <DeleteButton
            action={deleteGroupSession}
            hiddenFields={{ groupId: group.id }}
            confirmMessage={t('confirmDelete')}
            label={t('deleteCta')}
          />
        </div>
      </section>

      <ReportChat
        mode="group"
        id={group.id}
        locale={chatLocale}
        labels={{
          fab: tChat('fab'),
          title: tChat('titleGroup'),
          subtitle: tChat('subtitleGroup'),
          placeholder: tChat('placeholder'),
          send: tChat('send'),
          thinking: tChat('thinking'),
          errorGeneric: tChat('errorGeneric'),
          emptyState: tChat('emptyStateGroup'),
          close: tChat('close'),
        }}
      />
    </div>
  );
}
