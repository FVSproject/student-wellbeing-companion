import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UserPlus } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { ConsentBadge } from '@/components/status-badge';
import { DeleteRowButton } from '@/components/delete-row-button';
import { Avatar } from '@/components/avatar';
import { getCounselorContext } from '@/lib/auth';
import { ConsentStatus } from '@prisma/client';
import { deleteStudent } from './actions';

export default async function StudentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('students');
  const tStatus = await getTranslations('consent.status');
  const { db } = await getCounselorContext(locale);

  const students = await db.student.findMany({
    where: { deletedAt: null },
    include: { consent: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        action={
          <Link href="/students/new" className="btn-primary">
            <UserPlus className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {t('addStudent')}
          </Link>
        }
      />

      {students.length === 0 ? (
        <div className="card text-center">
          <h3 className="text-base font-medium">{t('empty')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
          <Link href="/students/new" className="btn-primary mt-4 inline-flex">
            {t('addStudent')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <Th>{t('externalId')}</Th>
                <Th>{t('fullName')}</Th>
                <Th>{t('gradeLevel')}</Th>
                <Th>{t('consent')}</Th>
                <Th className="text-end">{t('actions')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => {
                const status = s.consent?.status ?? ConsentStatus.PENDING;
                return (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <Td className="font-mono text-xs">{s.externalId}</Td>
                    <Td className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.fullName} url={s.avatarUrl} size="sm" />
                        <span>{s.fullName}</span>
                      </div>
                    </Td>
                    <Td className="text-muted-foreground">{s.gradeLevel ?? '—'}</Td>
                    <Td>
                      <ConsentBadge status={status} label={tStatus(status)} />
                    </Td>
                    <Td className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/students/${s.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t('view')} →
                        </Link>
                        <DeleteRowButton
                          action={deleteStudent}
                          hiddenFields={{ studentId: s.id }}
                          confirmMessage={t('confirmDeleteStudent', { name: s.fullName })}
                          label={t('deleteStudent')}
                        />
                      </div>
                    </Td>
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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-start font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
