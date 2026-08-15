'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Languages, Loader2 } from 'lucide-react';

export type AnalysisData = {
  id: string;
  timestamp: string;
  stateSummary: string;
  suggestedApproaches: string[];
  locale: string | null;
  model: string;
};

/**
 * Renders one AIAnalysis. If the viewer's current locale differs from the
 * locale it was generated in, fetches an on-demand Claude translation and
 * swaps the display. The original is never mutated — this is a view-layer
 * translation only, so history stays a truthful record.
 */
export function AnalysisEntry({
  analysis,
  labels,
}: {
  analysis: AnalysisData;
  labels: { translating: string; translatedNote: string; originalNote: string };
}) {
  const currentLocale = useLocale() as 'en' | 'ar';
  const originalLocale = (analysis.locale ?? 'en') as 'en' | 'ar';
  const needsTranslation = originalLocale !== currentLocale;

  const [translated, setTranslated] = useState<{
    stateSummary: string;
    suggestedApproaches: string[];
  } | null>(null);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (!needsTranslation) {
      setTranslated(null);
      return;
    }
    let cancelled = false;
    setTranslating(true);
    fetch(`/api/analyses/${analysis.id}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: currentLocale }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (cancelled) return;
        setTranslated({
          stateSummary: data.stateSummary,
          suggestedApproaches: data.suggestedApproaches,
        });
      })
      .catch(() => {
        // Silent — fall back to original text.
      })
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysis.id, currentLocale, needsTranslation]);

  const stateSummary = translated?.stateSummary ?? analysis.stateSummary;
  const approaches = translated?.suggestedApproaches ?? analysis.suggestedApproaches;
  const showTranslatedBadge = needsTranslation && translated;
  const showOriginalBadge = needsTranslation && !translated && !translating;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{new Date(analysis.timestamp).toLocaleTimeString()}</span>
        <span className="flex flex-wrap items-center gap-2">
          {translating && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {labels.translating}
            </span>
          )}
          {showTranslatedBadge && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] text-primary">
              <Languages className="h-3 w-3" />
              {labels.translatedNote}
            </span>
          )}
          {showOriginalBadge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
              {labels.originalNote} ({originalLocale.toUpperCase()})
            </span>
          )}
          <span className="font-mono">{analysis.model}</span>
        </span>
      </div>
      <p className="text-sm leading-relaxed">{stateSummary}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {approaches.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
