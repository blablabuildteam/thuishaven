import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminUsersPanel } from "@/components/auth/admin-users-panel";

export const metadata = { title: "Gebruikers" };

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

  return <AdminUsersPanel />;
}
