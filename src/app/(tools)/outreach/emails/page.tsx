import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Mailen is merged into the werklijst; keep old links working. */
export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; prospect?: string }>;
}) {
  const params = await searchParams;
  const prospect = params.prospect ?? params.ids?.split(",")[0]?.trim();
  redirect(
    prospect
      ? `/outreach/crm?prospect=${encodeURIComponent(prospect)}`
      : "/outreach/crm?stap=nog",
  );
}
