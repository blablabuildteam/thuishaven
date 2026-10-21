"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  QUEUE_STATUS_NL,
  QUEUE_STATUS_TONE,
  QueueMailPanel,
} from "@/components/outreach/queue-mail-panel";
import type { QueueItem } from "@/lib/outreach/queue";

type Props = {
  prospectId: string;
  companyName: string;
  items: QueueItem[];
  testTo: string;
  testSendBlockReason?: string | null;
  liveSendBlockReason?: string | null;
  aiConfigured?: boolean;
  onClose: () => void;
};

export function MailDrawer({
  prospectId,
  companyName,
  items,
  testTo,
  testSendBlockReason,
  liveSendBlockReason,
  aiConfigured,
  onClose,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(
    items[0]?.emailId ?? null,
  );
  const active =
    items.find((i) => i.emailId === activeId) ?? items[0] ?? null;

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Mail aan ${companyName}`}
        className="h-full w-full max-w-5xl overflow-y-auto border-l border-border bg-bg px-4 py-5 sm:px-6"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-dim">
              Mail aan
            </p>
            <h2 className="font-display text-2xl tracking-[0.04em] text-text">
              {companyName}
            </h2>
            <Link
              href={`/outreach/crm/${prospectId}`}
              className="text-sm text-accent underline"
            >
              Dossier
            </Link>
          </div>
          <button
            type="button"
            className="border border-border px-3 py-1.5 text-sm hover:border-accent"
            onClick={onClose}
          >
            Sluiten
          </button>
        </div>

        {items.length > 1 ? (
          <div className="mb-4 flex flex-wrap gap-2" role="tablist">
            {items.map((item) => {
              const on = item.emailId === active?.emailId;
              return (
                <button
                  key={item.emailId}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActiveId(item.emailId)}
                  className={`border px-3 py-1.5 text-left text-sm ${
                    on
                      ? "border-accent bg-accent/10 text-text"
                      : "border-border text-text-muted hover:text-text"
                  }`}
                >
                  <span className="block">
                    {item.toName ?? item.toEmail ?? "Contact"}
                  </span>
                  <span className="text-xs text-text-dim">
                    {QUEUE_STATUS_NL[item.statusLabel]}
                    {item.scheduledLabel ? ` · ${item.scheduledLabel}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ) : active ? (
          <div className="mb-4">
            <StatusBadge tone={QUEUE_STATUS_TONE[active.statusLabel]}>
              {QUEUE_STATUS_NL[active.statusLabel]}
            </StatusBadge>
          </div>
        ) : null}

        {active ? (
          <QueueMailPanel
            key={active.emailId}
            item={active}
            testTo={testTo}
            testSendBlockReason={testSendBlockReason}
            liveSendBlockReason={liveSendBlockReason}
            aiConfigured={aiConfigured}
          />
        ) : (
          <p className="border-y border-border py-6 text-sm text-text-muted">
            Er staat geen mail meer klaar voor dit bedrijf. Is hij verstuurd,
            dan zie je dat in het dossier.
          </p>
        )}
      </aside>
    </div>
  );
}
