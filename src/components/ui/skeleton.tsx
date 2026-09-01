import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

/** Shimmer bone for layout-preview loading states. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton-bone rounded-none", className)}
      aria-hidden
    />
  );
}

type SkeletonTextProps = {
  className?: string;
  lines?: number;
};

export function SkeletonText({ className, lines = 1 }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3",
            i === lines - 1 && lines > 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}
