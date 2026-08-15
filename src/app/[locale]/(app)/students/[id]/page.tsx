import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalendarClock, ShieldCheck, TrendingUp } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { ConsentBadge, SessionBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import { getCounselorContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { ConsentStatus } from '@prisma/client';
import { headers } from 'next/headers';
import { startSession } from '../../sessions/actions';
import { deleteStudent, createParentShareLink, revokeParentShareLink } from '../actions';
import { DeleteButton } from '@/components/delete-button';
import { Avatar } from '@/components/avatar';
import { InterventionsCard } from '@/components/interventions-card';
import { ReportChat } from '@/components/report-chat';
import { ParentShareCard } from '@/components/parent-share-card';

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('students');
  const tConsent = await getTranslations('consent');
  const tStatus = await getTranslations('consent.status');
  const tSessionStatus = await getTranslations('sessions.status');
  const { db, user, schoolId } = await getCounselorContext(locale);

  const student = await db.student.findFirst({
    where: { id, deletedAt: null },
    include: {
      consent: true,
      school: { select: { name: true } },
      sessions: {
        orderBy: { startedAt: 'desc' },
        take: 10,
      },
      parentShares: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!student) notFound();

  const hdrs = await headers();
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const host = hdrs.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'student.view',
    targetType: 'student',
    targetId: student.id,
  });

  const consentStatus = student.consent?.status ?? ConsentStatus.PENDING;
  const canStartSession = consentStatus === ConsentStatus.GRANTED;
  const tSex = await getTranslations('students.sex');
  const tChat = await getTranslations('chat');
  const tParent = await getTranslations('parentAccess');
  const chatLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-4">
        <Avatar name={student.fullName} url={student.avatarUrl} size="lg" />
        <div className="flex-1">
          <PageHeader
            title={student.fullName}
            description={`${t('externalId')}: ${student.externalId}${student.gradeLevel ? ` · ${student.gradeLevel}` : ''}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/students/${student.id}/trends`}
              className="btn-ghost"
            >
              <TrendingUp className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {t('viewTrends')}
            </Link>
            <Link
              href={`/students/${student.id}/consent`}
              className="btn-ghost"
            >
              <ShieldCheck className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {tConsent('manage')}
            </Link>
            <form action={startSession}>
              <input type="hidden" name="studentId" value={student.id} />
              <SubmitButton
                disabled={!canStartSession}
                title={canStartSession ? undefined : tConsent('gateHint')}
                pendingLabel={t('startSession')}
              >
                <CalendarClock className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                {t('startSession')}
              </SubmitButton>
            </form>
          </div>
        }
      />
        </div>
      </div>

      <section className="card">
        <h3 className="mb-3 text-sm font-semibold">{t('profileDetails')}</h3>
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <Info label={t('age')} value={student.age != null ? String(student.age) : '—'} />
          <Info
            label={t('sexLabel')}
            value={student.sex ? tSex(student.sex) : '—'}
          />
          <Info label={t('phone')} value={student.phone ?? '—'} />
          <Info label={t('parentPhone')} value={student.parentPhone ?? '—'} />
        </dl>
        {student.notes && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('notes')}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{student.notes}</p>
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{tConsent('title')}</h3>
          <ConsentBadge status={consentStatus} label={tStatus(consentStatus)} />
        </div>
        {student.consent ? (
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <Info label={tConsent('guardianName')} value={student.consent.guardianName} />
            <Info label={tConsent('guardianRelation')} value={student.consent.guardianRelation} />
            <Info label={tConsent('guardianContact')} value={student.consent.guardianContact} />
            <Info
              label={tConsent('signedAt')}
              value={
                student.consent.signedAt
                  ? new Date(student.consent.signedAt).toLocaleDateString(locale)
                  : '—'
              }
            />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{tConsent('empty')}</p>
        )}
        {!canStartSession && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {tConsent('gateHint')}
          </p>
        )}
      </section>

      <InterventionsCard
        locale={locale === 'ar' ? 'ar' : 'en'}
        labels={{
          title: t('interventions.title'),
          subtitle: t('interventions.subtitle'),
          issueColumn: t('interventions.issueColumn'),
          actionColumn: t('interventions.actionColumn'),
        }}
      />

      <ParentShareCard
        studentId={student.id}
        studentName={student.fullName}
        schoolName={student.school?.name ?? ''}
        parentEmail={student.parentEmail ?? null}
        origin={origin}
        locale={locale}
        links={student.parentShares.map((s) => ({
          id: s.id,
          token: s.token,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt?.toISOString() ?? null,
          revokedAt: s.revokedAt?.toISOString() ?? null,
          viewCount: s.viewCount,
        }))}
        createAction={createParentShareLink}
        revokeAction={revokeParentShareLink}
        labels={{
          title: tParent('title'),
          subtitle: tParent('subtitle'),
          generate: tParent('generate'),
          generating: tParent('generating'),
          expiresLabel: tParent('expiresLabel'),
          expiresHint: tParent('expiresHint'),
          activeLinks: tParent('activeLinks'),
          noLinks: tParent('noLinks'),
          copy: tParent('copy'),
          copied: tParent('copied'),
          revoke: tParent('revoke'),
          confirmRevoke: tParent('confirmRevoke'),
          sendEmail: tParent('sendEmail'),
          neverExpires: tParent('neverExpires'),
          revoked: tParent('revoked'),
          emailSubject: tParent('emailSubject', { name: student.fullName }),
        }}
      />

      <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-rose-900">{t('dangerZone')}</h3>
            <p className="mt-1 text-xs text-rose-800">{t('deleteStudentHint')}</p>
          </div>
          <DeleteButton
            action={deleteStudent}
            hiddenFields={{ studentId: student.id }}
            confirmMessage={t('confirmDeleteStudent', { name: student.fullName })}
            label={t('deleteStudent')}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">{t('sessionHistory')}</h3>
        {student.sessions.length === 0 ? (
          <div className="card text-center text-sm text-muted-foreground">
            {t('noSessions')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t('date')}</th>
                  <th className="px-4 py-3 text-start font-medium">{t('duration')}</th>
                  <th className="px-4 py-3 text-start font-medium">{t('status')}</th>
                  <th className="px-4 py-3 text-end font-medium">{t('view')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {student.sessions.map((s) => {
                  const durationMin =
                    s.startedAt && s.endedAt
                      ? Math.round(
                          (new Date(s.endedAt).getTime() -
                            new Date(s.startedAt).getTime()) /
                            60000
                        )
                      : null;
                  return (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {s.startedAt
                          ? new Date(s.startedAt).toLocaleString(locale)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {durationMin ? `${durationMin} min` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <SessionBadge
                          status={s.status}
                          label={tSessionStatus(s.status)}
                        />
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Link
                          href={`/sessions/${s.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
