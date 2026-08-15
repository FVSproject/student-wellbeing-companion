import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { BrandMark } from '@/components/brand-mark';
import { ShieldCheck, Activity, EyeOff } from 'lucide-react';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  const tApp = await getTranslations('app');

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <BrandMark size="md" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">
              {tApp('name')}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {tApp('nameAr')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <SignedOut>
            <Link href="/sign-in" className="btn-ghost">
              {t('signIn')}
            </Link>
            <Link href="/sign-up" className="btn-primary">
              {t('signUp')}
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard" className="btn-primary">
              {t('signIn')}
            </Link>
          </SignedIn>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-16 md:pt-24">
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            {t('heroSubtitle')}
          </p>
          <div className="mt-8 flex gap-3">
            <SignedOut>
              <Link href="/sign-up" className="btn-primary">
                {t('signUp')}
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard" className="btn-primary">
                {t('signIn')}
              </Link>
            </SignedIn>
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title={t('featureConsentTitle')}
            body={t('featureConsentBody')}
          />
          <FeatureCard
            icon={<Activity className="h-5 w-5" />}
            title={t('featureLiveTitle')}
            body={t('featureLiveBody')}
          />
          <FeatureCard
            icon={<EyeOff className="h-5 w-5" />}
            title={t('featurePrivateTitle')}
            body={t('featurePrivateBody')}
          />
        </section>

        <section className="mt-16 rounded-2xl border border-border bg-accent px-6 py-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {t('framingNoticeTitle')}
          </p>
          <p className="mt-2 max-w-3xl text-base text-foreground">
            {t('framingNoticeBody')}
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-muted-foreground">
          <div>{tApp('name')} · {new Date().getFullYear()}</div>
          <div className="flex flex-wrap gap-4">
            <Link href="/about" className="hover:text-foreground">{t('footerAbout')}</Link>
            <Link href="/overview" className="hover:text-foreground">{t('footerOverview')}</Link>
            <Link href="/support" className="hover:text-foreground">{t('footerSupport')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
