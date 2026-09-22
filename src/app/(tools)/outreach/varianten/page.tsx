import { redirect } from "next/navigation";

/** Old mock A/B page — variants live under Wachtrij / Mailen. */
export default function MailVariantsRedirectPage() {
  redirect("/outreach/planning");
}
