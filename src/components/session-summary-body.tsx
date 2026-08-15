'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Languages, Loader2 } from 'lucide-react';

/**
 * Client-side wrapper that translates BOTH the summary and the
 * suggestion-for-next-session in a single call to the summary translate
 * endpoint. Prevents duplicate API calls that would happen if we used two
 * separate TranslatableText instances.
 */
export function SessionSummaryBody({
  summary,
  suggestion,
  sourceLocale,
  sessionId,
  forNextSessionLabel,
  labels,
}: {
  summary: string;
  suggestion: string | null;
  sourceLocale: string | null;
  sessionId: string;
  forNextSessionLabel: string;
  labels: { translating: string; translated: string; originalNote: string };
}) {
  const currentLocale = useLocale() as 'en' | 'ar';
  const original = (sourceLocale ?? 'en') as 'en' | 'ar';
  const needsTranslation = original !== currentLocale;

  const [translated, setTranslated] = useState<{ text: string; suggestion: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!needsTranslation) {
      setTranslated(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setTranslating(true);
    setFailed(false);
    fetch(`/api/sessions/${sessionId}/summary/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: currentLocale }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (cancelled) return;
        setTranslated({
          text: typeof data.text === 'string' ? data.text : summary,
          suggestion: typeof data.suggestion === 'string' ? data.suggestion : suggestion ?? '',
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsTranslation, currentLocale, sessionId, summary, suggestion]);

  const displaySummary = translated?.text ?? summary;
  const displaySuggestion = translated?.suggestion ?? suggestion ?? '';
  const showBadge = needsTranslation && (translating || translated || failed);

  return (
    <div>
      {showBadge && (
        <div className="mb-1 flex items-center justify-end gap-2 text-[10px]">
          {translating && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {labels.translating}
            </span>
          )}
          {!translating && translated && !failed && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-primary">
              <Languages className="h-3 w-3" />
              {labels.translated}
            </span>
          )}
          {!translating && failed && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {labels.originalNote} ({original.toUpperCase()})
            </span>
          )}
        </div>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{displaySummary}</p>
      {displaySuggestion && (
        <div className="mt-4 rounded-md bg-accent px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-primary">
            {forNextSessionLabel}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{displaySuggestion}</p>
        </div>
      )}
    </div>
  );
}
