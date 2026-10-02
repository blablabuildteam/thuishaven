import { Skeleton } from "@/components/ui/skeleton";

/** Instant shell while the next outreach page streams in. */
export default function OutreachLoading() {
  return (
    <div
      className="animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Pagina laden"
    >
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Skeleton className="mb-1 h-2.5 w-16" />
          <Skeleton className="h-9 w-48 sm:h-10" />
          <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mb-6 flex flex-wrap gap-4 border-b border-border pb-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border/70 py-3"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
