import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  ticketDemographics,
  ticketInventory,
  type DemographicBucket,
} from "@/lib/db/schema";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ editionId: string }>;
}) {
  const { editionId } = await params;
  if (!hasDatabase() || !UUID_RE.test(editionId)) {
    return { title: "Editie" };
  }
  const db = getDb();
  const row = await db
    .select({ name: editions.name })
    .from(editions)
    .where(eq(editions.id, editionId))
    .limit(1);
  return { title: row[0]?.name ?? "Editie" };
}

function topCities(cities: DemographicBucket[], limit = 12): DemographicBucket[] {
  const known = cities.filter((c) => c.key !== "onbekend");
  const unknown = cities.find((c) => c.key === "onbekend");
  const top = known.slice(0, limit);
  const rest = known.slice(limit).reduce((s, c) => s + c.count, 0);
  const out = [...top];
  if (rest > 0) out.push({ key: "overig", count: rest });
  if (unknown && unknown.count > 0) out.push(unknown);
  return out;
}

function DemoList({
  title,
  rows,
}: {
  title: string;
  rows: DemographicBucket[];
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <section className="border border-border">
      <h2 className="border-b border-border px-4 py-3 font-display text-lg tracking-[0.03em]">
        {title}
      </h2>
      {!rows.length || total <= 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">Nog geen data.</p>
      ) : (
        <ul>
          {rows.map((row) => {
            const pct = total > 0 ? (row.count / total) * 100 : 0;
            return (
              <li
                key={row.key}
                className="border-b border-border/70 px-4 py-2 last:border-0"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{row.key}</span>
                  <span className="shrink-0 font-mono text-text-muted">
                    {formatNumber(row.count)} · {formatPercent(pct, 0)}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden bg-border">
                  <div
                    className="h-full bg-text"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function WeeztixEditionPage({
  params,
}: {
  params: Promise<{ editionId: string }>;
}) {
  const { editionId } = await params;
  if (!hasDatabase() || !UUID_RE.test(editionId)) notFound();

  const db = getDb();
  const editionRows = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      sold: ticketInventory.sold,
      scanned: ticketInventory.scanned,
      paidSold: ticketInventory.paidSold,
      freeSold: ticketInventory.freeSold,
      revenueCents: ticketInventory.revenueCents,
      capacity: ticketInventory.capacity,
      available: ticketInventory.available,
    })
    .from(editions)
    .leftJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(eq(editions.id, editionId))
    .limit(1);

  const edition = editionRows[0];
  if (!edition) notFound();

  const demoRows = await db
    .select()
    .from(ticketDemographics)
    .where(
      and(
        eq(ticketDemographics.editionId, edition.id),
        eq(ticketDemographics.platform, "weeztix"),
      ),
    )
    .limit(1);
  const demo = demoRows[0] ?? null;

  const inv = normalizeWeeztixInventory({
    sold: edition.sold,
    capacity: edition.capacity,
    available: edition.available,
  });
  const scanned = edition.scanned ?? 0;
  const scanRate = inv.sold > 0 ? (scanned / inv.sold) * 100 : null;
  const fill =
    inv.capacity != null && inv.capacity > 0
      ? (inv.sold / inv.capacity) * 100
      : null;
  const coverage =
    demo && demo.total > 0 ? (demo.answered / demo.total) * 100 : null;
  const ageKnown = (demo?.age ?? [])
    .filter((r) => r.key !== "onbekend")
    .reduce((s, r) => s + r.count, 0);
  const ageReady = demo != null && demo.answered > 0 && ageKnown / demo.answered >= 0.4;

  return (
    <div>
      <p className="mb-4 text-sm text-text-muted">
        <Link href="/dashboard/weeztix" className="hover:underline">
          ← Tickets
        </Link>
      </p>
      <SectionHeader
        eyebrow="Weeztix"
        title={edition.name}
        description={edition.startsAt.toLocaleDateString("nl-NL", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />

      <div className="mb-8 flex flex-wrap gap-8">
        <p>
          <span className="font-display text-3xl">{formatNumber(inv.sold)}</span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            sold
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">{formatNumber(scanned)}</span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            gescand
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {scanRate != null ? formatPercent(scanRate, 0) : "—"}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            scan
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatNumber(edition.paidSold ?? 0)}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            betaald
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatNumber(edition.freeSold ?? 0)}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            gratis
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatCurrency((edition.revenueCents ?? 0) / 100)}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            omzet
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {fill != null ? formatPercent(fill, 0) : "—"}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            fill
          </span>
        </p>
      </div>

      <h2 className="mb-3 font-display text-xl tracking-[0.03em]">Demografie</h2>
      {!demo ? (
        <p className="mb-8 border border-border px-4 py-3 text-sm text-text-muted">
          Nog geen gastgegevens voor deze editie. Die komen mee bij de volgende
          Weeztix-sync (08:00 Amsterdam).
        </p>
      ) : (
        <>
          {coverage != null && (
            <p className="mb-4 text-sm text-text-muted">
              Geslacht ingevuld voor {formatNumber(demo.answered)} van{" "}
              {formatNumber(demo.total)} tickets ({formatPercent(coverage, 0)}
              ). Lege antwoorden = nog niet gepersonaliseerd.
            </p>
          )}
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <DemoList title="Geslacht" rows={demo.gender} />
            {ageReady ? (
              <DemoList title="Leeftijd" rows={demo.age} />
            ) : (
              <section className="border border-border">
                <h2 className="border-b border-border px-4 py-3 font-display text-lg tracking-[0.03em]">
                  Leeftijd
                </h2>
                <p className="px-4 py-6 text-sm text-text-muted">
                  Weeztix geeft geboortedata alleen als top-waarden terug, niet
                  als volledige leeftijdsverdeling. Geslacht en stad zijn
                  compleet.
                </p>
              </section>
            )}
            <DemoList title="Stad" rows={topCities(demo.city)} />
          </div>
        </>
      )}

      <p className="text-xs text-text-dim">
        Aggregaties uit Weeztix visitor questions (geslacht, stad, geboortedatum
        → leeftijdsgroep). Geen namen of e-mails.
      </p>
    </div>
  );
}
