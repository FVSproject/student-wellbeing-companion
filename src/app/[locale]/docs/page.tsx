import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BookOpen,
  Users,
  ShieldCheck,
  Radio,
  Sparkles,
  MessageCircle,
  Lightbulb,
  UserRoundCog,
  Baby,
  FileText,
  Languages,
  Lock,
  LifeBuoy,
  Menu,
  Play,
  Rocket,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { BrandMark } from '@/components/brand-mark';

/**
 * User-facing documentation for the whole platform. Bilingual via next-intl.
 * Structure: a table of contents on the side (sticky on desktop), with
 * anchored sections rendered from the docs.* translation namespace.
 */
export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');
  const tApp = await getTranslations('app');

  const sections: Array<{
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    key: string;
    subCount: number;
  }> = [
    { id: 'intro', icon: BookOpen, key: 'intro', subCount: 0 },
    { id: 'start', icon: Rocket, key: 'gettingStarted', subCount: 4 },
    { id: 'sidebar', icon: Menu, key: 'sidebar', subCount: 6 },
    { id: 'students', icon: Users, key: 'students', subCount: 5 },
    { id: 'consent', icon: ShieldCheck, key: 'consent', subCount: 4 },
    { id: 'sessions', icon: Radio, key: 'sessions', subCount: 7 },
    { id: 'groups', icon: Users, key: 'groups', subCount: 6 },
    { id: 'ai', icon: Sparkles, key: 'ai', subCount: 4 },
    { id: 'chat', icon: MessageCircle, key: 'chat', subCount: 3 },
    { id: 'interventions', icon: Lightbulb, key: 'interventions', subCount: 2 },
    { id: 'parents', icon: Baby, key: 'parents', subCount: 5 },
    { id: 'reports', icon: FileText, key: 'reports', subCount: 4 },
    { id: 'admin', icon: UserRoundCog, key: 'admin', subCount: 3 },
    { id: 'lang', icon: Languages, key: 'lang', subCount: 2 },
    { id: 'privacy', icon: Lock, key: 'privacy', subCount: 3 },
    { id: 'troubleshooting', icon: LifeBuoy, key: 'troubleshooting', subCount: 5 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent/30 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="text-sm font-semibold tracking-tight">{tApp('name')}</span>
        </Link>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Link href="/support" className="btn-ghost text-sm">
            {t('supportLink')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-10">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-white">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {tApp('name')} · {t('kicker')}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {t('title')}
              </h1>
            </div>
          </div>
          <p className="text-base text-muted-foreground md:text-lg">{t('lede')}</p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Table of Contents */}
          <aside className="lg:sticky lg:top-6 lg:h-fit">
            <nav aria-label={t('tocLabel')} className="rounded-xl border border-border bg-white p-3 shadow-sm">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('tocLabel')}
              </p>
              <ol className="space-y-0.5 text-sm">
                {sections.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="me-1 font-mono text-[10px] text-muted-foreground/70">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 truncate">{t(`sections.${s.key}.title`)}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <div className="mt-4 rounded-xl border border-border bg-accent/40 p-3 text-xs">
              <p className="font-semibold text-primary">{t('framingLabel')}</p>
              <p className="mt-1 text-muted-foreground">{t('framingBody')}</p>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 space-y-16">
            {sections.map((s, i) => (
              <Section
                key={s.id}
                id={s.id}
                index={i + 1}
                icon={s.icon}
                title={t(`sections.${s.key}.title`)}
                intro={t(`sections.${s.key}.intro`)}
                subCount={s.subCount}
                subFor={(idx) => ({
                  heading: t(`sections.${s.key}.sub${idx}.heading`),
                  body: t(`sections.${s.key}.sub${idx}.body`),
                })}
                tipHeading={safeT(t, `sections.${s.key}.tipHeading`)}
                tipBody={safeT(t, `sections.${s.key}.tipBody`)}
              />
            ))}

            <footer className="border-t border-border pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <div>{t('footer', { app: tApp('name') })}</div>
                <div className="flex gap-3">
                  <Link href="/support" className="hover:text-foreground">
                    {t('supportLink')}
                  </Link>
                  <Link href="/about" className="hover:text-foreground">
                    {t('aboutLink')}
                  </Link>
                  <Link href="/" className="hover:text-foreground">
                    {t('homeLink')}
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({
  id,
  index,
  icon: Icon,
  title,
  intro,
  subCount,
  subFor,
  tipHeading,
  tipBody,
}: {
  id: string;
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  intro: string;
  subCount: number;
  subFor: (i: number) => { heading: string; body: string };
  tipHeading?: string | null;
  tipBody?: string | null;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {String(index).padStart(2, '0')}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        </div>
      </div>

      <p className="mb-5 whitespace-pre-wrap text-base leading-relaxed">{intro}</p>

      {subCount > 0 && (
        <div className="space-y-4">
          {Array.from({ length: subCount }).map((_, i) => {
            const sub = subFor(i + 1);
            return (
              <div
                key={i}
                className="rounded-lg border border-border bg-white p-4 shadow-sm"
              >
                <div className="flex items-baseline gap-2">
                  <Play className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                  <h3 className="text-base font-semibold">{sub.heading}</h3>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {sub.body}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {tipHeading && tipBody && (
        <div className="mt-5 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {tipHeading}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{tipBody}</p>
        </div>
      )}
    </section>
  );
}

/** next-intl throws on missing keys — this catches so optional tips can be omitted. */
function safeT(
  t: (key: string) => string,
  key: string
): string | null {
  try {
    const v = t(key);
    // next-intl returns the raw key string when in strict mode with dev config;
    // treat that as absent too.
    return v && v !== key ? v : null;
  } catch {
    return null;
  }
}
