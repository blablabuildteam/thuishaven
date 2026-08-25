import { Suspense } from "react";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

export const metadata = { title: "Uitnodiging accepteren" };

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg text-text-muted">
          Laden…
        </div>
      }
    >
      <InviteAcceptForm />
    </Suspense>
  );
}
