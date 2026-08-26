import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UserPlus } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { DeleteRowButton } from '@/components/delete-row-button';
import { Avatar } from '@/components/avatar';
import { StudentImportDialog } from '@/components/student-import-dialog';
import { getCounselorContext } from '@/lib/auth';
import { deleteStudent } from './actions';

export default async function StudentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('students');
  const tImport = await getTranslations('studentImport');
  const { db } = await getCounselorContext(locale);

  const students = await db.student.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        action={
          <div className="flex flex-wrap gap-2">
            <StudentImportDialog
              labels={{
                triggerButton: tImport('triggerButton'),
                dialogTitle: tImport('dialogTitle'),
                dialogSubtitle: tImport('dialogSubtitle'),
                chooseFile: tImport('chooseFile'),
                reselectFile: tImport('reselectFile'),
                downloadTemplate: tImport('downloadTemplate'),
                parsing: tImport('parsing'),
                parseError: tImport('parseError'),
                emptyFile: tImport('emptyFile'),
                selectAll: tImport('selectAll'),
                clearAll: tImport('clearAll'),
                addSelected: tImport('addSelected'),
                addAll: tImport('addAll'),
                addOne: tImport('addOne'),
                remove: tImport('remove'),
                cancel: tImport('cancel'),
                close: tImport('close'),
                importing: tImport('importing'),
                successTitle: tImport('successTitle'),
                skippedTitle: tImport('skippedTitle'),
                skippedDuplicate: tImport('skippedDuplicate'),
                colId: tImport('colId'),
                colName: tImport('colName'),
                colGrade: tImport('colGrade'),
                colAge: tImport('colAge'),
                colSex: tImport('colSex'),
                colPhone: tImport('colPhone'),
                colParentPhone: tImport('colParentPhone'),
                colParentEmail: tImport('colParentEmail'),
                colActions: tImport('colActions'),
                sexFemale: tImport('sexFemale'),
                sexMale: tImport('sexMale'),
                sexUnspecified: tImport('sexUnspecified'),
                errorMissingRequired: tImport('errorMissingRequired'),
                errorInvalidEmail: tImport('errorInvalidEmail'),
                errorInvalidAge: tImport('errorInvalidAge'),
                helpTitle: tImport('helpTitle'),
                helpBody: tImport('helpBody'),
              }}
            />
            <Link href="/students/new" className="btn-primary">
              <UserPlus className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {t('addStudent')}
            </Link>
          </div>
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
                <Th className="text-end">{t('actions')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <Td className="font-mono text-xs">{s.externalId}</Td>
                  <Td className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.fullName} url={s.avatarUrl} size="sm" />
                      <span>{s.fullName}</span>
                    </div>
                  </Td>
                  <Td className="text-muted-foreground">{s.gradeLevel ?? '—'}</Td>
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
              ))}
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
