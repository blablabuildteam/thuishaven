import { redirect } from "next/navigation";

/** Old mock A/B page — variants live under Wachtrij / E-mails. */
export default function MailVariantsRedirectPage() {
  redirect("/outreach/planning");
}
