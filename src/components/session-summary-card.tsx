import { FileText, RefreshCw } from 'lucide-react';
import { SubmitButton } from './submit-button';
import { SessionSummaryBody } from './session-summary-body';

/**
 * Whole-session AI summary, shown at the top of session detail + report.
 * Auto-populated after `endSession` fires; can be regenerated on-demand.
 * Auto-translates on view if the viewer's locale differs from generation locale.
 */
export function SessionSummaryCard({
  summary,
  suggestion,
  generatedAt,
  model,
  summaryLocale,
  action,
  sessionId,
  labels,
  translationLabels,
  locale,
}: {
  summary: string | null;
  suggestion: string | null;
  generatedAt: Date | null;
  model: string | null;
  summaryLocale: string | null;
  action: (fd: FormData) => Promise<void>;
  sessionId: string;
  labels: {
    title: string;
    empty: string;
    generateCta: string;
    regenerateCta: string;
    generating: string;
    forNextSession: string;
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
            <FileText className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold">{labels.title}</h3>
        </div>
        {generatedAt && (
          <span className="text-[11px] text-muted-foreground">
            {labels.updated}: {new Date(generatedAt).toLocaleString(locale)}
          </span>
        )}
      </div>

      {!summary ? (
        <>
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
          <form action={action} className="mt-3">
            <input type="hidden" name="sessionId" value={sessionId} />
            <SubmitButton pendingLabel={labels.generating}>
              <FileText className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {labels.generateCta}
            </SubmitButton>
          </form>
        </>
      ) : (
        <>
          <SessionSummaryBody
            summary={summary}
            suggestion={suggestion}
            sourceLocale={summaryLocale}
            sessionId={sessionId}
            forNextSessionLabel={labels.forNextSession}
            labels={translationLabels}
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground">
              {model && <span className="font-mono">{model}</span>}
            </span>
            <form action={action}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <SubmitButton pendingLabel={labels.generating} className="btn-ghost text-xs">
                <RefreshCw className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {labels.regenerateCta}
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
