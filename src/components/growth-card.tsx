import { TrendingDown, TrendingUp, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { SubmitButton } from './submit-button';
import { TranslatableText } from './translatable-text';

export type GrowthMetrics = {
  sessionCount: number;
  totalMinutes: number;
  hrFirst: number | null;
  hrLast: number | null;
  hrDelta: number | null;
  gsrFirst: number | null;
  gsrLast: number | null;
  gsrDelta: number | null;
  motionFirst: number | null;
  motionLast: number | null;
  motionDelta: number | null;
} | null;

/**
 * Longitudinal AI summary + baseline delta pills. For counselor-facing
 * student reports so they can see how the student is trending over time.
 */
export function GrowthCard({
  summary,
  summaryLocale,
  metrics,
  generatedAt,
  action,
  studentId,
  labels,
  translationLabels,
  locale,
}: {
  summary: string | null;
  summaryLocale: string | null;
  metrics: GrowthMetrics;
  generatedAt: Date | null;
  action: (fd: FormData) => Promise<void>;
  studentId: string;
  labels: {
    title: string;
    emptyOneSession: string;
    emptyReady: string;
    generateCta: string;
    regenerateCta: string;
    generating: string;
    hrBaseline: string;
    gsrBaseline: string;
    motionBaseline: string;
    improving: string;
    stable: string;
    rising: string;
    updated: string;
  };
  translationLabels: { translating: string; translated: string; originalNote: string };
  locale: string;
}) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold">{labels.title}</h3>
        </div>
        {generatedAt && (
          <span className="text-[11px] text-muted-foreground">
            {labels.updated}: {new Date(generatedAt).toLocaleString(locale)}
          </span>
        )}
      </div>

      {metrics && metrics.sessionCount >= 2 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <DeltaPill
            label={labels.hrBaseline}
            delta={metrics.hrDelta}
            unit="bpm"
            decimals={0}
            first={metrics.hrFirst}
            last={metrics.hrLast}
            improveLower
            labels={labels}
          />
          <DeltaPill
            label={labels.gsrBaseline}
            delta={metrics.gsrDelta}
            unit="µS"
            decimals={1}
            first={metrics.gsrFirst}
            last={metrics.gsrLast}
            improveLower
            labels={labels}
          />
          <DeltaPill
            label={labels.motionBaseline}
            delta={metrics.motionDelta}
            unit=""
            decimals={2}
            first={metrics.motionFirst}
            last={metrics.motionLast}
            improveLower
            labels={labels}
          />
        </div>
      )}

      {summary ? (
        <>
          <TranslatableText
            text={summary}
            sourceLocale={summaryLocale}
            translateUrl={`/api/students/${studentId}/growth/translate`}
            labels={translationLabels}
          />
          <div className="mt-4 flex justify-end">
            <form action={action}>
              <input type="hidden" name="studentId" value={studentId} />
              <SubmitButton pendingLabel={labels.generating} className="btn-ghost text-xs">
                <RefreshCw className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {labels.regenerateCta}
              </SubmitButton>
            </form>
          </div>
        </>
      ) : metrics && metrics.sessionCount < 2 ? (
        <p className="text-sm text-muted-foreground">{labels.emptyOneSession}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{labels.emptyReady}</p>
          <form action={action} className="mt-3">
            <input type="hidden" name="studentId" value={studentId} />
            <SubmitButton pendingLabel={labels.generating} className="btn-ghost text-xs">
              <Sparkles className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
              {labels.generateCta}
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  );
}

function DeltaPill({
  label,
  delta,
  unit,
  decimals,
  first,
  last,
  improveLower,
  labels,
}: {
  label: string;
  delta: number | null;
  unit: string;
  decimals: number;
  first: number | null;
  last: number | null;
  improveLower: boolean;
  labels: { improving: string; stable: string; rising: string };
}) {
  if (delta == null || first == null || last == null) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">—</div>
      </div>
    );
  }

  const stableThreshold = Math.pow(10, -decimals) * 2;
  const isStable = Math.abs(delta) < stableThreshold;
  const isImproving = improveLower ? delta < -stableThreshold : delta > stableThreshold;
  const isRising = !isStable && !isImproving;

  const tone = isImproving
    ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    : isRising
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : 'bg-muted text-muted-foreground ring-border';

  const Icon = isImproving ? TrendingDown : isRising ? TrendingUp : ArrowRight;
  const tagText = isImproving ? labels.improving : isRising ? labels.rising : labels.stable;

  return (
    <div className={`rounded-md p-3 ring-1 ring-inset ${tone}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-sm">
          {first.toFixed(decimals)}
          {unit}
        </span>
        <ArrowRight className="h-3 w-3 opacity-60" />
        <span className="font-mono text-sm font-semibold">
          {last.toFixed(decimals)}
          {unit}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px]">
        <Icon className="h-3 w-3" />
        <span>{tagText}</span>
      </div>
    </div>
  );
}
