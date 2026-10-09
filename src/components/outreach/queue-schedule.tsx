import type { QueueItem } from "@/lib/outreach/queue";

type Props = {
  cadenceLabel: string;
  cadenceRationale: string;
  items: QueueItem[];
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

export function QueueSchedule({ cadenceLabel, cadenceRationale, items }: Props) {
  const days = groupByDay(items);
  const plannedCount = days.reduce((n, d) => n + d.items.length, 0);

  return (
    <section className="mb-8 border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-[0.04em]">Planning</h2>
          <p className="mt-1 text-sm text-text-muted">
            Wanneer ingeplande mails de deur uit gaan. Alleen mails met
            “Activeer verzenden” worden echt verstuurd.
          </p>
        </div>
        <p className="text-sm text-text-dim">{plannedCount} ingepland</p>
      </div>

      <div className="mt-4 border border-border/80 bg-bg px-3 py-3">
        <p className="text-sm text-text">
          <span className="font-medium">Ritme: </span>
          {cadenceLabel || "—"}
        </p>
        {cadenceRationale ? (
          <p className="mt-1 text-xs text-text-dim">{cadenceRationale}</p>
        ) : null}
      </div>

      {days.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          Nog niets ingepland. Vink hierboven mails aan en kies “Plan in” — dan
          zie je hier per dag wanneer ze verstuurd worden.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {days.map((day) => (
            <div key={day.label}>
              <h3 className="font-display text-base tracking-[0.06em]">
                {day.label}
                <span className="ml-2 text-xs font-sans tracking-normal text-text-dim">
                  {day.items.length} mail{day.items.length === 1 ? "" : "s"}
                </span>
              </h3>
              <ul className="mt-2 divide-y divide-border/70 border border-border/70">
                {day.items.map((item) => (
                  <li
                    key={item.emailId}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm"
                  >
                    <span className="w-12 shrink-0 font-medium tabular-nums text-text">
                      {item.scheduledLabel!.split(" · ")[1]}
                    </span>
                    <span className="min-w-0 flex-1 text-text">
                      {item.companyName}
                      {item.toEmail ? (
                        <span className="text-text-dim"> · {item.toEmail}</span>
                      ) : null}
                      {item.variantLabel ? (
                        <span className="text-text-dim"> · {item.variantLabel}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-text-dim">
                      {item.senderProfileLabel}
                      {item.statusLabel === "actief" ? " · actief" : " · nog niet geactiveerd"}
                    </span>
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
