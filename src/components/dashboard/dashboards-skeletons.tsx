import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function SectionEyebrow({
  titleWidth = "w-24",
  headingWidth = "w-48",
  desc = true,
}: {
  titleWidth?: string;
  headingWidth?: string;
  desc?: boolean;
}) {
  return (
    <div className="mb-4">
      <Skeleton className={cn("h-2.5", titleWidth)} />
      <Skeleton className={cn("mt-2 h-7", headingWidth)} />
      {desc && <Skeleton className="mt-2 h-3 w-full max-w-md" />}
    </div>
  );
}

function EventRowSkeleton() {
  return (
    <li className="flex items-start gap-4 border border-border bg-surface px-4 py-3.5">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5 max-w-[220px]" />
        <Skeleton className="h-3 w-1/3 max-w-[160px]" />
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-1">
        <Skeleton className="size-9" />
        <div className="w-20 space-y-1">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-1.5 w-full" />
        </div>
        <Skeleton className="size-4" />
      </div>
    </li>
  );
}

export function EventInsightsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Event-inzichten laden"
    >
      <div className="mb-8">
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
          <div>
            <Skeleton className="mb-1 h-2.5 w-16" />
            <Skeleton className="h-8 w-48 sm:h-9" />
          </div>
          <Skeleton className="h-8 w-10" />
        </div>
        <ul className="space-y-5">
          {Array.from({ length: Math.min(rows, 3) }, (_, i) => (
            <EventRowSkeleton key={`up-${i}`} />
          ))}
        </ul>
      </div>
      <div className="mt-12 border-t-2 border-border pt-10">
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
          <div>
            <Skeleton className="mb-1 h-2.5 w-14" />
            <Skeleton className="h-8 w-52 sm:h-9" />
          </div>
          <Skeleton className="h-8 w-10" />
        </div>
        <ul className="space-y-5">
          {Array.from({ length: Math.max(2, rows - 3) }, (_, i) => (
            <EventRowSkeleton key={`past-${i}`} />
          ))}
        </ul>
      </div>
      <span className="sr-only">Laden…</span>
    </div>
  );
}

export function SalesSkeleton() {
  return (
    <section
      className="mb-12 animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Kaartverkoop laden"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionEyebrow
          titleWidth="w-28"
          headingWidth="w-36"
          desc={false}
        />
        <div className="flex gap-1 border border-border p-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-14" />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-8">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-2.5 w-20" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden border border-border">
        <div className="flex gap-4 border-b border-border px-4 py-3">
          {["w-28", "w-16", "w-14", "w-12", "w-24", "w-16"].map((w, i) => (
            <Skeleton key={i} className={cn("h-2.5", w)} />
          ))}
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border/70 px-4 py-3 last:border-0"
          >
            <div className="min-w-[140px] flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <span className="sr-only">Laden…</span>
    </section>
  );
}

export function MarketingSkeleton() {
  return (
    <section
      className="mb-12 animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Marketing laden"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionEyebrow titleWidth="w-24" headingWidth="w-56" />
        <Skeleton className="h-3 w-28" />
      </div>

      <div className="mb-8">
        <Skeleton className="mb-3 h-2.5 w-48" />
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="border border-border bg-surface px-4 py-3">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-2 h-7 w-16" />
              <Skeleton className="mt-2 h-2.5 w-28" />
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6 flex flex-wrap gap-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-2.5 w-28" />
          </div>
        ))}
      </div>

      <ul className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5 max-w-[200px]" />
              <Skeleton className="h-2.5 w-1/3 max-w-[160px]" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-6 w-32" />
            </div>
          </li>
        ))}
      </ul>
      <span className="sr-only">Laden…</span>
    </section>
  );
}

export function CorrelationSkeleton() {
  return (
    <section
      className="mb-12 animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Correlatie laden"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionEyebrow titleWidth="w-24" headingWidth="w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>

      <div className="relative h-72 w-full overflow-hidden border border-border bg-surface">
        <Skeleton className="absolute inset-0 opacity-40" />
        <svg
          className="absolute inset-x-4 bottom-8 top-8 text-border"
          viewBox="0 0 400 160"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0 120 C40 100, 80 130, 120 90 S200 40, 240 70 S320 110, 400 50"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="animate-pulse-soft"
          />
          <path
            d="M0 140 C50 120, 100 145, 150 110 S250 80, 300 100 S360 90, 400 70"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="animate-pulse-soft opacity-60"
          />
        </svg>
      </div>

      <ul className="mt-6 grid gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="border border-border bg-surface px-4 py-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="mt-2 h-7 w-14" />
            <Skeleton className="mt-2 h-2.5 w-36" />
          </li>
        ))}
      </ul>
      <span className="sr-only">Laden…</span>
    </section>
  );
}

export function CreativesSkeleton() {
  return (
    <section
      className="mb-12 animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Creatives laden"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionEyebrow titleWidth="w-24" headingWidth="w-40" />
        <Skeleton className="h-3 w-28" />
      </div>

      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-28" />
          </li>
        ))}
      </ul>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <li
            key={i}
            className="overflow-hidden border border-border bg-surface"
          >
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="mt-1 h-2.5 w-32" />
            </div>
          </li>
        ))}
      </ul>
      <span className="sr-only">Laden…</span>
    </section>
  );
}

export function ClaimsSkeleton() {
  return (
    <section
      className="mb-12 animate-fade-up"
      role="status"
      aria-busy="true"
      aria-label="Inzichten laden"
    >
      <Skeleton className="mb-1 h-2.5 w-20" />
      <Skeleton className="mb-4 h-7 w-52" />

      <div className="border border-border bg-surface p-5">
        <div className="flex flex-wrap gap-6">
          <Skeleton className="h-16 w-16" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full max-w-lg" />
            <Skeleton className="h-3 w-2/3 max-w-sm" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <article key={i} className="border border-border bg-surface p-5">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-3 h-2.5 w-1/2" />
          </article>
        ))}
      </div>
      <span className="sr-only">Laden…</span>
    </section>
  );
}

export function ConflictsSkeleton() {
  return (
    <div
      className="mb-6 flex items-center gap-2 text-xs text-text-dim"
      role="status"
      aria-busy="true"
      aria-label="Alerts laden"
    >
      <span className="size-1.5 animate-pulse-soft rounded-full bg-accent" />
      <span className="animate-pulse-soft tracking-[0.08em] uppercase">
        Controleren op alerts…
      </span>
    </div>
  );
}

/** Full-page layout preview for route-level `loading.tsx`. */
export function DashboardsPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Dashboard laden">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Skeleton className="mb-1 h-2.5 w-20" />
          <Skeleton className="h-9 w-56 sm:h-10" />
          <Skeleton className="mt-3 h-3 w-full max-w-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2 text-xs text-text-dim">
        <span className="size-1.5 animate-pulse-soft rounded-full bg-accent" />
        <span className="animate-pulse-soft tracking-[0.08em] uppercase">
          Dashboard laden…
        </span>
      </div>

      <section className="mb-12">
        <EventInsightsSkeleton />
      </section>
      <SalesSkeleton />
      <MarketingSkeleton />
      <CorrelationSkeleton />
      <CreativesSkeleton />
      <ClaimsSkeleton />

      <section className="border border-border bg-surface p-5">
        <Skeleton className="mb-1 h-2.5 w-10" />
        <Skeleton className="mb-3 h-6 w-36" />
        <Skeleton className="h-24 w-full" />
      </section>
    </div>
  );
}

export function LoadedSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-fade-up", className)}>{children}</div>
  );
}
