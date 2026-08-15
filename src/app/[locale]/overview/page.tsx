import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  Users,
  ShieldCheck,
  Bluetooth,
  Activity,
  Sparkles,
  FileText,
  Settings,
  ScrollText,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('overview');
  const tApp = await getTranslations('app');

  const flow = [
    { icon: <Users className="h-5 w-5" />, key: 'step1' },
    { icon: <ShieldCheck className="h-5 w-5" />, key: 'step2' },
    { icon: <Bluetooth className="h-5 w-5" />, key: 'step3' },
    { icon: <Activity className="h-5 w-5" />, key: 'step4' },
    { icon: <Sparkles className="h-5 w-5" />, key: 'step5' },
    { icon: <FileText className="h-5 w-5" />, key: 'step6' },
    { icon: <ScrollText className="h-5 w-5" />, key: 'step7' },
    { icon: <Settings className="h-5 w-5" />, key: 'step8' },
  ] as const;

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

        <ol className="mt-12 space-y-6">
          {flow.map((step, i) => (
            <li key={step.key} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                {step.icon}
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('stepLabel', { n: i + 1 })}
                </div>
                <h2 className="mt-0.5 text-base font-semibold">
                  {t(`${step.key}.title`)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(`${step.key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6 text-sm">
          <Link href="/about" className="btn-ghost">{t('aboutLink')}</Link>
          <Link href="/support" className="btn-ghost">{t('supportLink')}</Link>
          <Link href="/" className="btn-ghost">{t('homeLink')}</Link>
        </div>
      </main>
    </div>
  );
}
