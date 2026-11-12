import { Skeleton } from "@/components/ui/skeleton";

/** Instant shell while the next radar page streams in. */
export default function RadarLoading() {
  return (
    <div
      className="animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Radar laden"
    >
      <div className="mb-6">
        <Skeleton className="mb-1 h-2.5 w-14" />
        <Skeleton className="h-9 w-40 sm:h-10" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="bg-surface px-3 py-3">
            <Skeleton className="mb-2 h-2 w-16" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-0 border border-border">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border/70 px-3 py-3"
          >
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-7 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
