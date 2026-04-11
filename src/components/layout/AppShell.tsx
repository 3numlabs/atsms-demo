import { Sidebar } from "./Sidebar";
import { MessagePane } from "@/components/messages/MessagePane";
import { NoChatSelected } from "@/components/messages/NoChatSelected";
import { useConversationStore } from "@/stores/conversation-store";

export function AppShell() {
  const activeConvoId = useConversationStore((s) => s.activeConvoId);

  return (
    <div className="h-full flex">
      {/* Sidebar: always visible on desktop, hidden on mobile when a conversation is active */}
      <div
        className={`h-full shrink-0 ${
          activeConvoId ? "hidden md:flex" : "flex w-full md:w-72"
        }`}
      >
        <Sidebar />
      </div>

      {/* Main content: always visible on desktop, hidden on mobile when no conversation */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          activeConvoId ? "flex" : "hidden md:flex"
        }`}
      >
        {activeConvoId ? <MessagePane /> : <NoChatSelected />}
      </div>
    </div>
  );
}
