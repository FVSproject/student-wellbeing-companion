import { Sparkles } from 'lucide-react';

export function ComingSoon({
  title,
  description,
  step,
}: {
  title: string;
  description: string;
  step: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {step}
        </p>
      </div>
    </div>
  );
}
