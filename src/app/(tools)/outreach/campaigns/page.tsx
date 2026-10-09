import { redirect } from "next/navigation";

/** Oude campagne-pagina — resultaten per invalshoek staan onder Resultaten. */
export default function CampaignsRedirectPage() {
  redirect("/outreach/analytics");
}
