import { Skeleton } from '@/components/skeleton';

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border border-border bg-accent/50 p-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
    </div>
  );
}
