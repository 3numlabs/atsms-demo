import type { AppConversation } from "@/types";
import { Avatar } from "@/components/ui/Avatar";

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
  // Show the other participant's handle (not yourself)
  const otherIdx = conversation.participantDids.findIndex(
    (d) => d !== currentDid,
  );
  const displayName =
    otherIdx >= 0
      ? conversation.participantHandles[otherIdx]
      : conversation.participantHandles[0] || "Unknown";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        isActive
          ? "bg-accent/15 text-text-primary"
          : "text-text-secondary hover:bg-sidebar-hover"
      }`}
    >
      <Avatar name={displayName} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span
            className={`text-sm truncate ${isActive ? "font-semibold text-text-primary" : "font-medium"}`}
          >
            @{displayName}
          </span>
          <span className="text-xs text-text-secondary shrink-0 ml-2">
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>
        {conversation.lastMessage && (
          <p className="text-xs text-text-secondary truncate mt-0.5">
            {conversation.lastMessage}
          </p>
        )}
      </div>
      {conversation.unreadCount > 0 && (
        <span className="bg-accent text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {conversation.unreadCount}
        </span>
      )}
    </button>
  );
}
