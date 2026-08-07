type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: SectionHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 font-display text-sm tracking-[0.2em] text-text-muted">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-4xl tracking-[0.04em] text-text sm:text-5xl">
          {title}
        </h1>
        <div className="mt-3 h-px w-16 bg-highlight" />
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
