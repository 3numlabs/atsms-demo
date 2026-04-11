import { useEffect } from "react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { Avatar } from "@/components/ui/Avatar";
import { CallButtons } from "@/components/call/CallButtons";

export function MessagePane() {
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const conversations = useConversationStore((s) => s.conversations);
  const setActive = useConversationStore((s) => s.setActive);
  const loadMessages = useMessageStore((s) => s.loadMessages);
  const did = useAuthStore((s) => s.did);
  const profiles = useProfileStore((s) => s.profiles);
  const fetchProfileByDid = useProfileStore((s) => s.fetchProfileByDid);

  const convo = conversations.find((c) => c.id === activeConvoId);

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
      <div className="flex items-center gap-2 px-3 md:px-4 py-3 border-b border-border bg-main shrink-0">
        {/* Back button — mobile only */}
        <button
          onClick={() => setActive(null)}
          className="md:hidden p-1 -ml-1 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <Avatar name={otherHandle} size={28} imageUrl={profile?.avatarUrl} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary truncate">
            {displayLabel}
          </h2>
          {profile?.displayName && (
            <p className="text-xs text-text-secondary truncate">@{otherHandle}</p>
          )}
        </div>
        <CallButtons />
      </div>

      <MessageList />
      <MessageComposer />
    </div>
  );
}
