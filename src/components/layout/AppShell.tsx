import { Sidebar } from "./Sidebar";
import { MessagePane } from "@/components/messages/MessagePane";
import { NoChatSelected } from "@/components/messages/NoChatSelected";
import { useConversationStore } from "@/stores/conversation-store";

export function AppShell() {
  const activeConvoId = useConversationStore((s) => s.activeConvoId);

  return (
    <div className="h-full flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {activeConvoId ? <MessagePane /> : <NoChatSelected />}
      </div>
    </div>
  );
}
