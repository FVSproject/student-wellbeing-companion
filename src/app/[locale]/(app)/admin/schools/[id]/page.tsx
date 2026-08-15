import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/page-header';
import { SubmitButton } from '@/components/submit-button';
import { SchoolIconPicker } from '@/components/school-icon-picker';
import { db } from '@/lib/db';
import { updateSchool } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SchoolEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin.school');
  const tIcon = await getTranslations('onboarding.icon');
  const tCommon = await getTranslations('common');

  const school = await db.school.findUnique({ where: { id } });
  if (!school) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('editTitle')} description={school.name} />

      <form action={updateSchool} className="card space-y-4">
        <input type="hidden" name="schoolId" value={school.id} />

        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            {t('name')} <span className="text-rose-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            defaultValue={school.name}
            required
            maxLength={200}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="city" className="block text-sm font-medium">
            {t('city')}
          </label>
          <input
            id="city"
            name="city"
            defaultValue={school.city ?? ''}
            maxLength={100}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <SchoolIconPicker
          emojiName="iconEmoji"
          logoName="logoUrl"
          defaultEmoji={school.iconEmoji}
          defaultLogo={school.logoUrl}
          labels={{
            title: tIcon('title'),
            presetHeading: tIcon('presetHeading'),
            uploadHeading: tIcon('uploadHeading'),
            uploadCta: tIcon('uploadCta'),
            changeCta: tIcon('changeCta'),
            clear: tIcon('clear'),
            processing: tIcon('processing'),
            tooLarge: tIcon('tooLarge'),
            hint: tIcon('hint'),
          }}
        />

        <div className="flex gap-3 pt-2">
          <SubmitButton pendingLabel={tCommon('saving')}>
            {tCommon('save')}
          </SubmitButton>
          <Link href="/admin" className="btn-ghost">
            {tCommon('cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
