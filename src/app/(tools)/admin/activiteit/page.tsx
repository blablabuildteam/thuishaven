import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listActivityEvents } from "@/lib/audit/activity";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Activiteit · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/outreach");

  const rows = await listActivityEvents({ limit: 150, sinceDays: 30 });

  return (
    <div>
      <SectionHeader
        eyebrow="Alleen admin"
        title="Activiteit"
        description="Wat medewerkers in de tools doen: pagina’s, knoppen en API-acties. Niet zichtbaar voor Yoram/Reijner."
        action={
          <Link
            href="/admin/gebruikers"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
          >
            Gebruikers →
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone="accent">Admin only</StatusBadge>
        <StatusBadge tone="neutral">{rows.length} events · 30 dagen</StatusBadge>
      </div>

      {rows.length === 0 ? (
        <p className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
          Nog geen activiteit gelogd. Zodra iemand inlogt of een tools-pagina
          opent, verschijnt dat hier.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Wanneer</th>
                <th className="px-4 py-3 font-medium">Wie</th>
                <th className="px-4 py-3 font-medium">Tool</th>
                <th className="px-4 py-3 font-medium">Actie</th>
                <th className="px-4 py-3 font-medium">Samenvatting</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                    {format(new Date(row.createdAt), "d MMM HH:mm", {
                      locale: nl,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-text">{row.userName ?? "—"}</p>
                    <p className="font-mono text-xs text-text-dim">
                      {row.userEmail}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone="neutral">{row.tool}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {row.action}
                  </td>
                  <td className="px-4 py-3 text-text">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
