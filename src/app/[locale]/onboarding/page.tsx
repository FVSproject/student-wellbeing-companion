import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Building2, Plus } from 'lucide-react';
import { UserRole } from '@prisma/client';
import { UserButton } from '@clerk/nextjs';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureUserProvisioned } from '@/lib/provision';
import { SubmitButton } from '@/components/submit-button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { SchoolIconPicker } from '@/components/school-icon-picker';
import { BrandMark } from '@/components/brand-mark';
import { joinSchool, createSchool } from './actions';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await ensureUserProvisioned();
  const user = await getCurrentUser();

  // Already onboarded — send them where they belong.
  if (user.role === UserRole.FOUNDATION_ADMIN) redirect(`/${locale}/admin`);
  if (user.schoolId) redirect(`/${locale}/dashboard`);

  const t = await getTranslations('onboarding');
  const tIcon = await getTranslations('onboarding.icon');
  const tCommon = await getTranslations('common');

  const schools = await db.school.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, city: true },
  });

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex h-14 items-center justify-between border-b border-border bg-white px-4 md:px-6">
        <div className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="text-sm font-semibold">{t('brand')}</span>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <UserButton />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {t('welcome', { name: user.fullName })}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('lede')}</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Join existing */}
          <section className="card">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold">{t('joinTitle')}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t('joinBody')}</p>

            {schools.length === 0 ? (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {t('joinEmpty')}
              </p>
            ) : (
              <form action={joinSchool} className="mt-4 space-y-3">
                <label htmlFor="schoolId" className="block text-sm font-medium">
                  {t('joinPickLabel')}
                </label>
                <select
                  id="schoolId"
                  name="schoolId"
                  required
                  defaultValue=""
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="" disabled>
                    {t('joinPickPlaceholder')}
                  </option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.city ? ` — ${s.city}` : ''}
                    </option>
                  ))}
                </select>
                <SubmitButton pendingLabel={tCommon('loading')}>
                  {t('joinCta')}
                </SubmitButton>
              </form>
            )}
          </section>

          {/* Create new */}
          <section className="card">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
                <Plus className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold">{t('createTitle')}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t('createBody')}</p>

            <form action={createSchool} className="mt-4 space-y-3">
              <div>
                <label htmlFor="name" className="block text-sm font-medium">
                  {t('createNameLabel')} <span className="text-rose-600">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  maxLength={200}
                  placeholder={t('createNamePlaceholder')}
                  className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="city" className="block text-sm font-medium">
                  {t('createCityLabel')}
                </label>
                <input
                  id="city"
                  name="city"
                  maxLength={100}
                  placeholder={t('createCityPlaceholder')}
                  className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <SchoolIconPicker
                emojiName="iconEmoji"
                logoName="logoUrl"
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
              <SubmitButton pendingLabel={tCommon('loading')}>
                {t('createCta')}
              </SubmitButton>
            </form>
          </section>
        </div>

        <p className="mt-8 rounded-lg bg-accent px-4 py-3 text-xs text-primary">
          {t('framingNote')}
        </p>
      </main>
    </div>
  );
}
