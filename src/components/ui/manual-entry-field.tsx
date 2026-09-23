import { cn } from "@/lib/utils";

/** Boxed value that reads as something you type, not a calculated total. */
export function ManualEntryField({
  label,
  filled,
  error,
  saving,
  prefix,
  width = "w-[5rem]",
  children,
}: {
  label: string;
  filled: boolean;
  error?: boolean;
  saving?: boolean;
  prefix?: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("ml-auto block", width)}>
      <span className="sr-only">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1 border bg-bg px-1.5 py-0.5",
          "focus-within:border-text",
          error
            ? "border-danger"
            : filled
              ? "border-border"
              : "border-dashed border-text-dim",
          saving && "opacity-60",
        )}
      >
        {prefix ? (
          <span className="text-xs text-text-dim" aria-hidden>
            {prefix}
          </span>
        ) : null}
        {children}
      </span>
    </label>
  );
}

export const manualEntryInputClass =
  "w-full min-w-0 bg-transparent py-0.5 text-right font-mono text-sm tabular-nums outline-none placeholder:text-text-dim";
