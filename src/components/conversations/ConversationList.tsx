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
          {conversations.filter((c) => !c.sms).map((convo) => (
            <ConversationItem
              key={convo.id}
              conversation={convo}
              isActive={convo.id === activeConvoId}
              onClick={() => setActive(convo.id)}
              currentDid={did || ""}
            />
          ))}
          {conversations.some((c) => c.sms) && (
            <>
              <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                SMS
              </div>
              {conversations.filter((c) => c.sms).map((convo) => (
                <ConversationItem
                  key={convo.id}
                  conversation={{
                    ...convo,
                    title: `${convo.sms!.from}${convo.sms!.verified ? "" : " ⚠"}`,
                    kind: "group", // reuse the title-rendering branch for the number
                  }}
                  isActive={convo.id === activeConvoId}
                  onClick={() => setActive(convo.id)}
                  currentDid={did || ""}
                />
              ))}
            </>
          )}
        </div>
      )}
      <NewConversation
        open={newChatModalOpen}
        onClose={() => setNewChatModalOpen(false)}
      />
    </div>
  );
}
