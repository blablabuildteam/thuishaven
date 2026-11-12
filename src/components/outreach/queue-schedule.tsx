import type { QueueItem } from "@/lib/outreach/queue";

type Props = {
  cadenceLabel: string;
  cadenceRationale: string;
  items: QueueItem[];
  onOpen?: (prospectId: string) => void;
  onCancel?: (emailIds: string[]) => void;
  busy?: boolean;
};

type Day = { label: string; items: QueueItem[] };

function groupByDay(items: QueueItem[]): Day[] {
  const days: Day[] = [];
  const planned = items
    .filter((i) => i.scheduledAt && i.scheduledLabel)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  for (const item of planned) {
    const label = item.scheduledLabel!.split(" · ")[0] ?? "";
    let day = days.find((d) => d.label === label);
    if (!day) {
      day = { label, items: [] };
      days.push(day);
    }
    day.items.push(item);
  }
  return days;
}

export function QueueSchedule({
  cadenceLabel,
  cadenceRationale,
  items,
  onOpen,
  onCancel,
  busy = false,
}: Props) {
  const days = groupByDay(items);
  const plannedIds = days.flatMap((d) => d.items.map((i) => i.emailId));

  return (
    <section className="mb-6 th-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-lg tracking-[0.06em]">
            Planning per dag
            <span className="ml-2 font-sans text-sm tracking-normal text-text-dim">
              {plannedIds.length} ingepland
            </span>
          </h2>
          <p className="mt-1 text-xs text-text-dim">
            Ritme: {cadenceLabel || "—"}
            {cadenceRationale ? ` · ${cadenceRationale}` : ""}
          </p>
        </div>
        {onCancel && plannedIds.length > 1 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(plannedIds)}
            className="text-xs text-text-muted underline disabled:opacity-50"
          >
            Alles annuleren
          </button>
        ) : null}
      </div>

      {days.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">
          Nog niets ingepland. Open een mail of vink bedrijven aan en kies
          “Plan in”.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {days.map((day) => (
            <div key={day.label}>
              <h3 className="text-xs font-medium uppercase tracking-wider text-text-dim">
                {day.label} · {day.items.length} mail
                {day.items.length === 1 ? "" : "s"}
              </h3>
              <ul className="mt-1.5 divide-y divide-border/70 border border-border/70 bg-bg">
                {day.items.map((item) => (
                  <li
                    key={item.emailId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                  >
                    <span className="w-12 shrink-0 font-medium tabular-nums text-text">
                      {item.scheduledLabel!.split(" · ")[1]}
                    </span>
                    <span className="min-w-0 flex-1 text-text">
                      {item.companyName}
                      {item.toEmail ? (
                        <span className="text-text-dim"> · {item.toEmail}</span>
                      ) : null}
                      {item.statusLabel === "verlopen" ? (
                        <span className="text-danger"> · tijdstip verlopen</span>
                      ) : !item.armed ? (
                        <span className="text-warn-fg">
                          {" "}
                          · nog niet bevestigd, plan opnieuw
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-text-dim">
                      {item.senderProfileLabel}
                    </span>
                    {onOpen ? (
                      <button
                        type="button"
                        onClick={() => onOpen(item.prospectId)}
                        className="text-xs text-accent underline-offset-2 hover:underline"
                      >
                        Open
                      </button>
                    ) : null}
                    {onCancel ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onCancel([item.emailId])}
                        className="text-xs text-text-muted underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
                      >
                        Annuleer
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
