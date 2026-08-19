import { redirect } from "next/navigation";

export default function WeatherContextRedirectPage() {
  redirect("/dashboard/weer");
}
