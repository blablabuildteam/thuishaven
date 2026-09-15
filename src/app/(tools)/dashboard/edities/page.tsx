import { redirect } from "next/navigation";

/** Edities lived on the old events dashboard; Inzichten is the landing now. */
export default function EditiesRedirectPage() {
  redirect("/dashboard/inzichten");
}
