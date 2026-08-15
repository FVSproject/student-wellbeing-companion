'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Languages, Loader2 } from 'lucide-react';

/**
 * Renders a paragraph of AI-generated text. If the viewer's current locale
 * differs from the locale the text was originally generated in, transparently
 * fetches a Claude translation from `translateUrl` and swaps in place.
 *
 * The original is never mutated — this is a view-layer courtesy, matching the
 * pattern already used for AIAnalysis entries.
 */
export function TranslatableText({
  text,
  sourceLocale,
  translateUrl,
  labels,
  className,
}: {
  text: string;
  sourceLocale: string | null;
  translateUrl: string;
  labels: { translating: string; translated: string; originalNote: string };
  className?: string;
}) {
  const currentLocale = useLocale() as 'en' | 'ar';
  const original = (sourceLocale ?? 'en') as 'en' | 'ar';
  const needsTranslation = original !== currentLocale;

  const [translated, setTranslated] = useState<string | null>(null);
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
    fetch(translateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: currentLocale }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (cancelled) return;
        if (typeof data.text === 'string') setTranslated(data.text);
        else setFailed(true);
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
  }, [needsTranslation, currentLocale, translateUrl]);

  const display = translated ?? text;
  const showTranslated = needsTranslation && translated && !failed;
  const showOriginal = needsTranslation && (!translated || failed) && !translating;

  return (
    <div className={className}>
      {(translating || showTranslated || showOriginal) && (
        <div className="mb-1 flex items-center justify-end gap-2 text-[10px]">
          {translating && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {labels.translating}
            </span>
          )}
          {showTranslated && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-primary">
              <Languages className="h-3 w-3" />
              {labels.translated}
            </span>
          )}
          {showOriginal && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {labels.originalNote} ({original.toUpperCase()})
            </span>
          )}
        </div>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{display}</p>
    </div>
  );
}
