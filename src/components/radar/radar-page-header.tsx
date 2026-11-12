import { cn } from "@/lib/utils";

export function RadarPageHeader({
  eyebrow = "DJ Talenten Radar",
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4",
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl">
        <p className="mb-1 text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl tracking-[0.03em] sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function RadarStatStrip({
  items,
}: {
  items: Array<{ label: string; value: string | number; hint?: string }>;
}) {
  return (
    <dl className="mb-8 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-3 py-3 sm:px-4">
          <dt className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
            {item.label}
          </dt>
          <dd className="mt-1 font-display text-2xl tabular-nums tracking-[0.02em]">
            {item.value}
          </dd>
          {item.hint ? (
            <p className="mt-0.5 text-[11px] text-text-muted">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function RadarEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-border bg-bg-elevated/40 px-5 py-10 text-center sm:px-8">
      <p className="font-display text-xl tracking-[0.04em]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
        {body}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
