import { redirect } from "next/navigation";

/** Edities = event-dashboard (één plek). */
export default function EditiesRedirectPage() {
  redirect("/dashboard");
}
