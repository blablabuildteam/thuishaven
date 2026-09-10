import { AppShell } from "@/components/shell/app-shell";
import { ActivityTracker } from "@/components/audit/activity-tracker";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ActivityTracker />
      {children}
    </AppShell>
  );
}
