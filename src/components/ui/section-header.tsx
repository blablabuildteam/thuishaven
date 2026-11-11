type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

/**
 * Page header as a thuishaven.nl-style poster band: black (cream in dark mode)
 * with sunburst rays. The band swaps colour tokens, so buttons and inputs
 * passed in `action` adapt without extra styling.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: SectionHeaderProps) {
  return (
    <header className="th-poster-band mb-8 flex flex-col gap-5 px-5 pt-6 pb-5 sm:px-8 sm:pt-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="th-sticker mb-2 text-xs text-text-dim">{eyebrow}</p>
        )}
        <h1 className="th-poster-title text-5xl break-words text-text sm:text-7xl">
          {title}
        </h1>
        {description && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="min-w-0 shrink-0">{action}</div>}
    </header>
  );
}
