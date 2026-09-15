import { redirect } from "next/navigation";

/** Opening the app should land on Inzichten, not the tool chooser. */
export default function HubPage() {
  redirect("/dashboard/inzichten");
}
