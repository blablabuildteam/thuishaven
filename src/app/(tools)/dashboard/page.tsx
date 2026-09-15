import { redirect } from "next/navigation";

/** Default dashboard landing is Inzichten; the old events board is unused. */
export default function DashboardPage() {
  redirect("/dashboard/inzichten");
}
