import { Skeleton, SkeletonCard } from '@/components/skeleton';

export default function AppLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
