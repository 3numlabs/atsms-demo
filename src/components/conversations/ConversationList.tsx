import { useConversationStore } from "@/stores/conversation-store";
import { useUIStore } from "@/stores/ui-store";
import { ConversationItem } from "./ConversationItem";
import { EmptyState } from "./EmptyState";
import { NewConversation } from "./NewConversation";
import { useAuthStore } from "@/stores/auth-store";

export function ConversationList() {
  const conversations = useConversationStore((s) => s.conversations);
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const setActive = useConversationStore((s) => s.setActive);
  const newChatModalOpen = useUIStore((s) => s.newChatModalOpen);
  const setNewChatModalOpen = useUIStore((s) => s.setNewChatModalOpen);
  const did = useAuthStore((s) => s.did);

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="py-1">
          {conversations.map((convo) => (
            <ConversationItem
              key={convo.id}
              conversation={convo}
              isActive={convo.id === activeConvoId}
              onClick={() => setActive(convo.id)}
              currentDid={did || ""}
            />
          ))}
        </div>
      )}
      <NewConversation
        open={newChatModalOpen}
        onClose={() => setNewChatModalOpen(false)}
      />
    </div>
  );
}
