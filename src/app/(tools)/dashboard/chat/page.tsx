import { SectionHeader } from "@/components/ui/section-header";
import { AiChatPanel } from "@/components/dashboard/ai-chat-panel";

export const metadata = { title: "AI Chat" };

export default function ChatPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="AI"
        title="Vragen over je data"
        description="Chat in gewone taal over campagnes, edities en verkoop. Antwoorden onderbouwd met dashboardcijfers — nu nog mock-responses."
      />
      <AiChatPanel />
    </div>
  );
}
