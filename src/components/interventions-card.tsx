import { Lightbulb } from 'lucide-react';
import { INTERVENTIONS, localizeIntervention } from '@/lib/interventions';

/**
 * Reference card of suggested interventions the counselor can consider when
 * a matching pattern surfaces in a session. Static content — the AI analyzer
 * separately picks the closest tag when generating a state summary.
 */
export function InterventionsCard({
  locale,
  labels,
}: {
  locale: 'en' | 'ar';
  labels: { title: string; subtitle: string; issueColumn: string; actionColumn: string };
}) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
          <Lightbulb className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">{labels.title}</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{labels.subtitle}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="pb-2 text-start font-medium">{labels.issueColumn}</th>
              <th className="pb-2 text-start font-medium">{labels.actionColumn}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {INTERVENTIONS.map((raw) => {
              const item = localizeIntervention(raw, locale);
              return (
                <tr key={item.tag} className="hover:bg-muted/30">
                  <td className="py-2.5 pe-3">
                    <span className="me-2 text-base">{item.emoji}</span>
                    <span className="font-medium">{item.issue}</span>
                  </td>
                  <td className="py-2.5 text-muted-foreground">{item.action}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
