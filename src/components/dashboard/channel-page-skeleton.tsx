import { Skeleton } from "@/components/ui/skeleton";

/** Full-page layout preview for YouTube / Meta / TikTok `loading.tsx`. */
export function ChannelPageSkeleton({
  label = "Kanaal laden…",
}: {
  label?: string;
}) {
  return (
    <div aria-busy="true" aria-label={label}>
      <div className="mb-8">
        <Skeleton className="mb-1 h-2.5 w-20" />
        <Skeleton className="h-9 w-56 sm:h-10" />
        <Skeleton className="mt-3 h-3 w-full max-w-xl" />
      </div>

      <div className="mb-6 flex items-center gap-2 text-xs text-text-dim">
        <span className="size-1.5 animate-pulse-soft rounded-full bg-accent" />
        <span className="animate-pulse-soft tracking-[0.08em] uppercase">
          {label}
        </span>
      </div>

      <section className="mb-10 flex flex-wrap gap-8">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-2.5 w-14" />
          </div>
        ))}
      </section>

      <section className="mb-10 grid gap-6 lg:grid-cols-2">
        <div>
          <Skeleton className="mb-3 h-2.5 w-28" />
          <Skeleton className="h-56 w-full" />
        </div>
        <div>
          <Skeleton className="mb-3 h-2.5 w-32" />
          <Skeleton className="h-56 w-full" />
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between gap-3">
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-8 w-28" />
      </div>

      <ul className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="border border-border bg-surface p-3">
            <div className="flex gap-3 sm:items-center">
              <Skeleton className="size-14 shrink-0 sm:size-16" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="ml-auto h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
