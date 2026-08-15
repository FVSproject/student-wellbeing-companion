import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StudentSex } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { SubmitButton } from '@/components/submit-button';
import { AvatarUpload } from '@/components/avatar-upload';
import { guardCounselorPage } from '@/lib/auth';
import { createStudent } from '../actions';

export default async function NewStudentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardCounselorPage(locale);

  const t = await getTranslations('students');
  const tSex = await getTranslations('students.sex');
  const tAvatar = await getTranslations('students.avatar');
  const tCommon = await getTranslations('common');

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('newTitle')} description={t('newSubtitle')} />

      <form action={createStudent} className="card space-y-4">
        <Field
          name="externalId"
          label={t('externalId')}
          hint={t('externalIdHint')}
          required
          maxLength={50}
        />
        <Field name="fullName" label={t('fullName')} required maxLength={200} />

        <div className="grid gap-4 md:grid-cols-2">
          <Field name="gradeLevel" label={t('gradeLevel')} maxLength={50} />
          <Field
            name="age"
            label={t('age')}
            type="number"
            min={3}
            max={25}
          />
        </div>

        <div>
          <label htmlFor="sex" className="block text-sm font-medium">
            {t('sexLabel')}
          </label>
          <select
            id="sex"
            name="sex"
            defaultValue=""
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">—</option>
            <option value={StudentSex.FEMALE}>{tSex('FEMALE')}</option>
            <option value={StudentSex.MALE}>{tSex('MALE')}</option>
            <option value={StudentSex.UNSPECIFIED}>{tSex('UNSPECIFIED')}</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            name="phone"
            label={t('phone')}
            hint={t('phoneHint')}
            type="tel"
            maxLength={30}
          />
          <Field
            name="parentPhone"
            label={t('parentPhone')}
            hint={t('parentPhoneHint')}
            type="tel"
            maxLength={30}
          />
        </div>

        <Field
          name="parentEmail"
          label={t('parentEmail')}
          hint={t('parentEmailHint')}
          type="email"
          maxLength={200}
        />

        <AvatarUpload
          name="avatarUrl"
          label={t('avatarLabel')}
          hint={t('avatarHint')}
          labels={{
            upload: tAvatar('upload'),
            change: tAvatar('change'),
            remove: tAvatar('remove'),
            processing: tAvatar('processing'),
            tooLarge: tAvatar('tooLarge'),
          }}
        />

        <TextArea name="notes" label={t('notes')} maxLength={2000} />

        <div className="flex gap-3 pt-2">
          <SubmitButton pendingLabel={tCommon('loading')}>
            {tCommon('save')}
          </SubmitButton>
          <Link href="/students" className="btn-ghost">
            {tCommon('cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  required,
  maxLength,
  type = 'text',
  min,
  max,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  type?: 'text' | 'number' | 'tel' | 'url' | 'email';
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        min={min}
        max={max}
        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextArea({
  name,
  label,
  maxLength,
}: {
  name: string;
  label: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        maxLength={maxLength}
        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
