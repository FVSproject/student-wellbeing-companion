import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Mail, LifeBuoy, MessageCircle, BookOpen } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('support');
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-primary">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {t('title')}
          </h1>
        </div>
        <p className="mt-4 text-lg text-muted-foreground">{t('lede')}</p>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <ContactCard
            icon={<Mail className="h-5 w-5" />}
            title={t('emailTitle')}
            body={t('emailBody')}
            href="mailto:support@rawafid.local"
            cta={t('emailCta')}
          />
          <ContactCard
            icon={<MessageCircle className="h-5 w-5" />}
            title={t('escalateTitle')}
            body={t('escalateBody')}
            href="mailto:yakhy2301@gmail.com"
            cta={t('escalateCta')}
          />
        </section>

        <section className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            {t('faqsTitle')}
          </h2>
          <div className="space-y-3">
            {['faq1', 'faq2', 'faq3', 'faq4'].map((k) => (
              <details key={k} className="card group">
                <summary className="cursor-pointer text-sm font-medium marker:content-none">
                  {t(`${k}.q`)}
                  <span className="ms-2 text-muted-foreground group-open:hidden">+</span>
                  <span className="ms-2 text-muted-foreground group-open:inline hidden">−</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{t(`${k}.a`)}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6 text-sm">
          <Link href="/docs" className="btn-primary">{t('docsLink')}</Link>
          <Link href="/about" className="btn-ghost">{t('aboutLink')}</Link>
          <Link href="/overview" className="btn-ghost">{t('overviewLink')}</Link>
          <Link href="/" className="btn-ghost">{t('homeLink')}</Link>
        </div>
      </main>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="card">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
        {icon}
      </div>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <a href={href} className="btn-primary mt-4 inline-flex">
        {cta}
      </a>
    </div>
  );
}
