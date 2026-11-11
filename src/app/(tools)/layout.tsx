import { AppShell } from "@/components/shell/app-shell";
import { ActivityTracker } from "@/components/audit/activity-tracker";
import { SystemHealthProvider } from "@/components/system/system-health";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SystemHealthProvider>
      <AppShell>
        <ActivityTracker />
        {children}
      </AppShell>
    </SystemHealthProvider>
  );
}
