import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Wachtwoord resetten" };

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg text-text-muted">
          Laden…
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
