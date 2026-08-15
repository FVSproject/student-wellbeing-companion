import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { SubmitButton } from '@/components/submit-button';
import { getCounselorContext } from '@/lib/auth';
import { ConsentStatus } from '@prisma/client';
import { upsertConsent } from '../../actions';

const STATUS_OPTIONS: ConsentStatus[] = [
  ConsentStatus.PENDING,
  ConsentStatus.GRANTED,
  ConsentStatus.REVOKED,
];

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('consent');
  const tStatus = await getTranslations('consent.status');
  const tCommon = await getTranslations('common');
  const { db } = await getCounselorContext(locale);

  const student = await db.student.findFirst({
    where: { id, deletedAt: null },
    include: { consent: true },
  });
  if (!student) notFound();

  const c = student.consent;
  const currentStatus = c?.status ?? ConsentStatus.PENDING;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('title')} description={student.fullName} />

      <form action={upsertConsent} className="card space-y-4">
        <input type="hidden" name="studentId" value={student.id} />

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('status.label')}</legend>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm hover:bg-muted"
              >
                <input
                  type="radio"
                  name="status"
                  value={s}
                  defaultChecked={s === currentStatus}
                  required
                />
                {tStatus(s)}
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          name="guardianName"
          label={t('guardianName')}
          defaultValue={c?.guardianName ?? ''}
          required
          maxLength={200}
        />
        <Field
          name="guardianRelation"
          label={t('guardianRelation')}
          defaultValue={c?.guardianRelation ?? ''}
          required
          maxLength={50}
          hint={t('guardianRelationHint')}
        />
        <Field
          name="guardianContact"
          label={t('guardianContact')}
          defaultValue={c?.guardianContact ?? ''}
          required
          maxLength={100}
          hint={t('guardianContactHint')}
        />

        <div>
          <label htmlFor="notes" className="block text-sm font-medium">
            {t('notes')}
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={c?.notes ?? ''}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <SubmitButton pendingLabel={tCommon('loading')}>
            {tCommon('save')}
          </SubmitButton>
          <Link
            href={`/students/${student.id}`}
            className="btn-ghost"
          >
            {tCommon('cancel')}
          </Link>
        </div>
      </form>

      <p className="mt-6 rounded-md bg-accent px-4 py-3 text-xs text-primary">
        {t('framingNote')}
      </p>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  hint,
  required,
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        maxLength={maxLength}
        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
