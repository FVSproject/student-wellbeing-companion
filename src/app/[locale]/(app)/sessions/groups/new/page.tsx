import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { GroupSessionForm } from '@/components/group-session-form';
import { getCounselorContext } from '@/lib/auth';
import { ConsentStatus } from '@prisma/client';
import { createGroupSession } from '../actions';

export default async function NewGroupSessionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('groupSessions');
  const tCommon = await getTranslations('common');
  const { db } = await getCounselorContext(locale);

  const students = await db.student.findMany({
    where: {
      deletedAt: null,
      consent: { status: ConsentStatus.GRANTED },
    },
    select: { id: true, fullName: true, gradeLevel: true },
    orderBy: { fullName: 'asc' },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('newTitle')} description={t('newSubtitle')} />

      <GroupSessionForm
        students={students}
        action={createGroupSession}
        labels={{
          titleLabel: t('titleLabel'),
          topicLabel: t('topicLabel'),
          topicPlaceholder: t('topicPlaceholder'),
          membersLabel: t('membersLabel'),
          membersHint: t('membersHint'),
          noEligibleStudents: t('noEligibleStudents'),
          needAtLeastTwo: t('needAtLeastTwo'),
          extraLabel: t('extraLabel'),
          extraHint: t('extraHint'),
          extraPlaceholder: t('extraPlaceholder'),
          extraAdd: t('extraAdd'),
          extraRemove: t('extraRemove'),
          startCta: t('startCta'),
          starting: tCommon('loading'),
          cancel: tCommon('cancel'),
        }}
      />
    </div>
  );
}
