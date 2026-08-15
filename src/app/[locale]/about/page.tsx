import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeartHandshake, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('about');
  const tApp = await getTranslations('app');

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">{tApp('name')}</span>
        </Link>
        <LocaleSwitcher />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="mt-8 text-4xl font-semibold tracking-tight md:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">{t('lede')}</p>

        <section className="mt-12 space-y-6">
          <Block
            icon={<HeartHandshake className="h-5 w-5" />}
            title={t('purposeTitle')}
            body={t('purposeBody')}
          />
          <Block
            icon={<Sparkles className="h-5 w-5" />}
            title={t('howTitle')}
            body={t('howBody')}
          />
          <Block
            icon={<ShieldCheck className="h-5 w-5" />}
            title={t('boundariesTitle')}
            body={t('boundariesBody')}
          />
        </section>

        <div className="mt-12 rounded-xl border border-border bg-accent px-6 py-5 text-sm text-primary">
          {t('framingNote')}
        </div>

        <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6 text-sm">
          <Link href="/overview" className="btn-ghost">{t('overviewLink')}</Link>
          <Link href="/support" className="btn-ghost">{t('supportLink')}</Link>
          <Link href="/" className="btn-ghost">{t('homeLink')}</Link>
        </div>
      </main>
    </div>
  );
}

function Block({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
