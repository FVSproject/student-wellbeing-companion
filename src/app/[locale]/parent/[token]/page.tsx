import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Users, Sparkles, Calendar, TrendingUp, MessageSquare, Languages } from 'lucide-react';
import { SessionStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { getLocalizedParentBundle, type ParentBundle } from '@/lib/parent-translations';

export const dynamic = 'force-dynamic';

/**
 * Public magic-link page for a parent. Shows growth summary, per-session
 * summaries (plain language, no biometrics), and longitudinal trends.
 * Deliberately excludes raw biometric charts and transcripts.
 *
 * AI content is stored in the counselor's locale-at-generation; the parent
 * can flip between AR/EN via the switcher, and stored summaries are
 * translated on the fly via getLocalizedParentBundle (cached on the link).
 */
export default async function ParentAccessPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('parentAccess');
  const viewerLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';

  if (!token || token.length < 10) notFound();

  const link = await db.parentShareLink.findUnique({
    where: { token },
    include: {
      student: {
        include: {
          school: { select: { name: true, iconEmoji: true, logoUrl: true } },
        },
      },
    },
  });

  if (!link || !link.student || link.student.deletedAt) notFound();

  if (link.revokedAt) {
    return <PublicShell school={null} title={t('publicTitle')} body={t('publicRevoked')} />;
  }
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return <PublicShell school={null} title={t('publicTitle')} body={t('publicExpired')} />;
  }

  // Track view without blocking render.
  void db.parentShareLink
    .update({
      where: { id: link.id },
      data: { lastViewedAt: new Date(), viewCount: { increment: 1 } },
    })
    .catch(() => {});

  const sessions = await db.session.findMany({
    where: {
      studentId: link.studentId,
      status: SessionStatus.COMPLETED,
      deletedAt: null,
    },
    orderBy: { startedAt: 'desc' },
    take: 30,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      overallSummary: true,
      overallSuggestion: true,
    },
  });

  // Build the source content bundle from what's in the DB, then translate it
  // to the viewer's locale (cache-backed).
  const source: ParentBundle = {
    growthSummary: link.student.growthSummary ?? null,
    sessions: sessions.map((s) => ({
      id: s.id,
      summary: s.overallSummary,
      suggestion: s.overallSuggestion,
    })),
  };
  const cache = link.translations as
    | Partial<Record<'en' | 'ar', { hash: string; content: ParentBundle }>>
    | null;
  const localized = await getLocalizedParentBundle(
    link.id,
    source,
    cache ?? null,
    viewerLocale
  );

  // Fast lookup for per-session translated text while we still iterate over
  // the DB rows (for dates/durations, which are locale-agnostic).
  const localizedById = new Map(localized.sessions.map((s) => [s.id, s]));

  const schoolName = link.student.school?.name ?? '';
  const totalMinutes = sessions.reduce((acc, s) => {
    if (s.startedAt && s.endedAt) {
      return acc + Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60000);
    }
    return acc;
  }, 0);

  type Metrics = Partial<{
    sessionCount: number;
    totalMinutes: number;
    hrFirst: number;
    hrLast: number;
    hrDelta: number;
    gsrFirst: number;
    gsrLast: number;
    gsrDelta: number;
    motionFirst: number;
    motionLast: number;
    motionDelta: number;
  }>;
  const metrics = (link.student.growthMetrics as Metrics | null) ?? {};
  const hasTrends =
    metrics.hrDelta != null || metrics.gsrDelta != null || sessions.length >= 2;

  // Language switcher targets — swap the leading /en/ or /ar/ segment.
  const arHref = `/ar/parent/${token}`;
  const enHref = `/en/parent/${token}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent/40 to-white" dir={viewerLocale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {schoolName}
            </p>
            <h1 className="text-lg font-semibold">{link.student.fullName}</h1>
          </div>
        </div>

        <LangSwitcher
          current={viewerLocale}
          enHref={enHref}
          arHref={arHref}
          label={t('languageLabel')}
        />
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 pb-24">
        <p className="text-sm text-muted-foreground">
          {t('publicSubtitle', { school: schoolName })}
        </p>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatTile
            label={t('publicSessionsCount')}
            value={String(sessions.length)}
          />
          <StatTile
            label={t('publicTotalTime')}
            value={`${totalMinutes} min`}
          />
          <StatTile
            label={t('publicLatestSession')}
            value={
              sessions[0]?.startedAt
                ? new Date(sessions[0].startedAt).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'
            }
          />
        </section>

        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">{t('publicSummary')}</h2>
          </div>
          {localized.growthSummary ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {localized.growthSummary}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('publicNoSummary')}</p>
          )}
        </section>

        {hasTrends && (
          <section className="card">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">{t('publicTrendsTitle')}</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {t('publicTrendsHint')}
            </p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TrendTile
                label={t('publicTrendCalm')}
                trend={qualitativeTrend(metrics.hrDelta, true)}
                labels={{
                  improving: t('publicTrendImproving'),
                  stable: t('publicTrendStable'),
                  attention: t('publicTrendAttention'),
                  noData: t('publicTrendNoData'),
                }}
              />
              <TrendTile
                label={t('publicTrendComposure')}
                trend={qualitativeTrend(metrics.gsrDelta, true)}
                labels={{
                  improving: t('publicTrendImproving'),
                  stable: t('publicTrendStable'),
                  attention: t('publicTrendAttention'),
                  noData: t('publicTrendNoData'),
                }}
              />
              <TrendTile
                label={t('publicTrendEngagement')}
                trend={qualitativeTrend(metrics.motionDelta, false)}
                labels={{
                  improving: t('publicTrendImproving'),
                  stable: t('publicTrendStable'),
                  attention: t('publicTrendAttention'),
                  noData: t('publicTrendNoData'),
                }}
              />
            </dl>
          </section>
        )}

        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">{t('publicSessionsHistory')}</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('publicSessionsHistoryHint')}
          </p>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ol className="space-y-4">
              {sessions.map((s) => {
                const dur =
                  s.startedAt && s.endedAt
                    ? Math.round(
                        (s.endedAt.getTime() - s.startedAt.getTime()) / 60000
                      )
                    : null;
                const dateStr = s.startedAt
                  ? new Date(s.startedAt).toLocaleDateString(locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—';
                const loc = localizedById.get(s.id);
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{dateStr}</span>
                      <span className="text-xs text-muted-foreground">
                        {dur ? `${dur} min` : '—'}
                      </span>
                    </div>
                    {loc?.summary ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                        {loc.summary}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs italic text-muted-foreground">
                        {t('publicSessionNoSummary')}
                      </p>
                    )}
                    {loc?.suggestion && (
                      <div className="mt-3 flex items-start gap-2 rounded-md bg-accent/40 px-3 py-2 text-xs">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <p className="whitespace-pre-wrap">{loc.suggestion}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          {t('publicFooter')}
        </p>
      </main>
    </div>
  );
}

function LangSwitcher({
  current,
  enHref,
  arHref,
  label,
}: {
  current: 'en' | 'ar';
  enHref: string;
  arHref: string;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-border bg-white p-0.5 shadow-sm"
      aria-label={label}
    >
      <Languages className="h-3.5 w-3.5 text-muted-foreground ltr:ml-2 rtl:mr-2" aria-hidden />
      <Link
        href={arHref}
        prefetch={false}
        className={
          current === 'ar'
            ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-white'
            : 'rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'
        }
      >
        العربية
      </Link>
      <Link
        href={enHref}
        prefetch={false}
        className={
          current === 'en'
            ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-white'
            : 'rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'
        }
      >
        English
      </Link>
    </div>
  );
}

type TrendKind = 'improving' | 'stable' | 'attention' | 'noData';

function qualitativeTrend(delta: number | undefined, lowerIsBetter: boolean): TrendKind {
  if (delta == null || Number.isNaN(delta)) return 'noData';
  if (Math.abs(delta) < 0.5) return 'stable';
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? 'improving' : 'attention';
}

function TrendTile({
  label,
  trend,
  labels,
}: {
  label: string;
  trend: TrendKind;
  labels: { improving: string; stable: string; attention: string; noData: string };
}) {
  const styles: Record<TrendKind, { bg: string; text: string; label: string; icon: string }> = {
    improving: { bg: 'bg-emerald-50 ring-emerald-200', text: 'text-emerald-700', label: labels.improving, icon: '↑' },
    stable: { bg: 'bg-sky-50 ring-sky-200', text: 'text-sky-700', label: labels.stable, icon: '→' },
    attention: { bg: 'bg-amber-50 ring-amber-200', text: 'text-amber-800', label: labels.attention, icon: '!' },
    noData: { bg: 'bg-muted/40 ring-border', text: 'text-muted-foreground', label: labels.noData, icon: '—' },
  };
  const s = styles[trend];
  return (
    <div className={`rounded-lg p-3 ring-1 ${s.bg}`}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 flex items-center gap-2 text-sm font-medium ${s.text}`}>
        <span className="font-mono text-base">{s.icon}</span>
        {s.label}
      </dd>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function PublicShell({
  school,
  title,
  body,
}: {
  school: string | null;
  title: string;
  body: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-accent/40 to-white">
      <main className="mx-auto max-w-md px-6 pt-24 text-center">
        {school && (
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {school}
          </p>
        )}
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">{body}</p>
      </main>
    </div>
  );
}
