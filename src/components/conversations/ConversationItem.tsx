import { useEffect } from "react";
import type { AppConversation } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { useProfileStore } from "@/stores/profile-store";

interface ConversationItemProps {
  conversation: AppConversation;
  isActive: boolean;
  onClick: () => void;
  currentDid: string;
}

function formatTime(date?: Date): string {
  if (!date) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function ConversationItem({
  conversation,
  isActive,
  onClick,
  currentDid,
}: ConversationItemProps) {
  const fetchProfileByDid = useProfileStore((s) => s.fetchProfileByDid);
  const profiles = useProfileStore((s) => s.profiles);

  const isGroup = conversation.participantDids.length > 2;
  const others = conversation.participantHandles.filter(
    (_, i) => conversation.participantDids[i] !== currentDid,
  );

  // Find the other participant (DM display)
  const otherIdx = conversation.participantDids.findIndex(
    (d) => d !== currentDid,
  );
  const otherDid =
    !isGroup && otherIdx >= 0 ? conversation.participantDids[otherIdx] : null;
  const otherHandle =
    otherIdx >= 0
      ? conversation.participantHandles[otherIdx]
      : conversation.participantHandles[0] || "Unknown";

  const profile = otherDid ? profiles[otherDid] : undefined;

  // Fetch profile for the other participant (DMs only)
  useEffect(() => {
    if (otherDid) fetchProfileByDid(otherDid);
  }, [otherDid, fetchProfileByDid]);

  const displayLabel = isGroup
    ? conversation.title || others.join(", ") || `${others.length + 1} people`
    : profile?.displayName || otherHandle;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        isActive
          ? "bg-accent/15 text-text-primary"
          : "text-text-secondary hover:bg-sidebar-hover"
      }`}
    >
      <Avatar
        name={isGroup ? displayLabel : otherHandle}
        size={32}
        imageUrl={isGroup ? null : profile?.avatarUrl}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span
            className={`text-sm truncate ${isActive ? "font-semibold text-text-primary" : "font-medium"}`}
          >
            {displayLabel}
          </span>
          <span className="text-xs text-text-secondary shrink-0 ml-2">
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>
        {profile?.displayName && (
          <p className="text-xs text-text-secondary truncate mt-0.5">
            @{otherHandle}
          </p>
        )}
        {conversation.lastMessage && (
          <p className="text-xs text-text-secondary truncate mt-0.5">
            {conversation.lastMessage}
          </p>
        )}
      </div>
    </button>
  );
}
