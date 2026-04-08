import { useEffect } from "react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { Avatar } from "@/components/ui/Avatar";

export function MessagePane() {
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const conversations = useConversationStore((s) => s.conversations);
  const loadMessages = useMessageStore((s) => s.loadMessages);
  const did = useAuthStore((s) => s.did);
  const profiles = useProfileStore((s) => s.profiles);
  const fetchProfileByDid = useProfileStore((s) => s.fetchProfileByDid);

  const convo = conversations.find((c) => c.id === activeConvoId);

  // Get the other participant
  const otherIdx = convo?.participantDids.findIndex((d) => d !== did) ?? -1;
  const otherDid = otherIdx >= 0 ? convo!.participantDids[otherIdx] : null;
  const otherHandle =
    otherIdx >= 0
      ? convo!.participantHandles[otherIdx]
      : convo?.participantHandles[0] || "Unknown";

  const profile = otherDid ? profiles[otherDid] : undefined;

  useEffect(() => {
    if (otherDid) fetchProfileByDid(otherDid);
  }, [otherDid, fetchProfileByDid]);

  useEffect(() => {
    if (activeConvoId) {
      loadMessages(activeConvoId);
    }
  }, [activeConvoId, loadMessages]);

  const displayLabel = profile?.displayName || otherHandle;

  return (
    <div className="flex flex-col h-full">
      {/* Conversation header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-main shrink-0">
        <Avatar name={otherHandle} size={28} imageUrl={profile?.avatarUrl} />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            {displayLabel}
          </h2>
          {profile?.displayName && (
            <p className="text-xs text-text-secondary">@{otherHandle}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageList />

      {/* Composer */}
      <MessageComposer />
    </div>
  );
}
