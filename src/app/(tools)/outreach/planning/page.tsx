import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The Wachtrij is merged into the werklijst; keep old links working. */
export default function OutreachPlanningPage() {
  redirect("/outreach/crm?stap=check");
}
