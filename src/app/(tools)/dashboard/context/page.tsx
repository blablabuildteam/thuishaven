import { redirect } from "next/navigation";

/**
 * Losse weertab is niet zinvol: weer hoort als factor op de eventdag.
 * Doorverwijzen naar het event-dashboard.
 */
export default function WeatherContextRedirectPage() {
  redirect("/dashboard");
}
