import type { QueueScheduleDay } from "@/lib/outreach/batches";

type Props = {
  cadenceLabel: string;
  cadenceRationale: string;
  schedule: QueueScheduleDay[];
  unbatchedCount: number;
  senderLabel: string | null;
};

export function QueueSchedule({
  cadenceLabel,
  cadenceRationale,
  schedule,
  unbatchedCount,
  senderLabel,
}: Props) {
  const plannedCount = schedule.reduce((n, d) => n + d.items.length, 0);

  return (
    <section className="mb-8 border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-[0.04em]">Planning</h2>
          <p className="mt-1 text-sm text-text-muted">
            Voorgestelde verzendmomenten voor mails in bakjes. Nog geen
            auto-send — dit is het ritme om naartoe te werken.
          </p>
        </div>
        <p className="text-sm text-text-dim">
          {plannedCount} gepland
          {unbatchedCount > 0 ? ` · ${unbatchedCount} draft buiten bakje` : ""}
        </p>
      </div>

      <div className="mt-4 border border-border/80 bg-bg px-3 py-3">
        <p className="text-sm text-text">
          <span className="font-medium">Ritme: </span>
          {cadenceLabel || "—"}
        </p>
        {cadenceRationale ? (
          <p className="mt-1 text-xs text-text-dim">{cadenceRationale}</p>
        ) : null}
        {senderLabel ? (
          <p className="mt-1 text-xs text-text-dim">Van: {senderLabel}</p>
        ) : null}
      </div>

      {schedule.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          Nog niets te plannen. Zet drafts in een bakje — dan verschijnen hier
          dagen en tijden.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {schedule.map((day) => (
            <div key={day.day}>
              <h3 className="font-display text-base tracking-[0.06em]">
                {day.weekdayLabel} {day.dayLabel}
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
                      {item.time}
                    </span>
                    <span className="min-w-0 flex-1 text-text">
                      {item.companyName}
                      {item.toEmail ? (
                        <span className="text-text-dim"> · {item.toEmail}</span>
                      ) : null}
                      {item.variantLabel ? (
                        <span className="text-text-dim">
                          {" "}
                          · {item.variantLabel}
                          {item.templateAdapted ? " (aangepast)" : ""}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-text-dim">{item.batchName}</span>
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
