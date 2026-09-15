import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { IntegrationsHub } from "@/components/integrations/integrations-hub";

export const metadata = { title: "Koppelingen" };

export default async function KoppelingenPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard/inzichten");

  return <IntegrationsHub />;
}
