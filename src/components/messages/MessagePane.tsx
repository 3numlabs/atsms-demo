import { useEffect } from "react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { Avatar } from "@/components/ui/Avatar";

export function MessagePane() {
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const conversations = useConversationStore((s) => s.conversations);
  const loadMessages = useMessageStore((s) => s.loadMessages);
  const did = useAuthStore((s) => s.did);

  const convo = conversations.find((c) => c.id === activeConvoId);

  // Get display name of the other participant
  const otherIdx = convo?.participantDids.findIndex((d) => d !== did) ?? -1;
  const displayName =
    otherIdx >= 0
      ? convo!.participantHandles[otherIdx]
      : convo?.participantHandles[0] || "Unknown";

  useEffect(() => {
    if (activeConvoId) {
      loadMessages(activeConvoId);
    }
  }, [activeConvoId, loadMessages]);

  return (
    <div className="flex flex-col h-full">
      {/* Conversation header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-main shrink-0">
        <Avatar name={displayName} size={28} />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            @{displayName}
          </h2>
        </div>
      </div>

      {/* Messages */}
      <MessageList />

      {/* Composer */}
      <MessageComposer />
    </div>
  );
}
