import { LoadingRegion, Skeleton } from '@/components/ui/index';

export default function CustomerLoading() {
  return (
    <LoadingRegion label="Loading">
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}
