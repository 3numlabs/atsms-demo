import { useEffect } from "react";
import type { AppMessage } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { useProfileStore } from "@/stores/profile-store";

interface MessageBubbleProps {
  message: AppMessage;
  isOwn: boolean;
  showSender: boolean;
}

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageBubble({
  message,
  isOwn,
  showSender,
}: MessageBubbleProps) {
  const profiles = useProfileStore((s) => s.profiles);
  const fetchProfileByDid = useProfileStore((s) => s.fetchProfileByDid);

  const profile = profiles[message.senderId];

  useEffect(() => {
    if (!isOwn) fetchProfileByDid(message.senderId);
  }, [message.senderId, isOwn, fetchProfileByDid]);

  const displayName = profile?.displayName || message.senderHandle;

  return (
    <div
      className={`flex gap-2 ${showSender ? "mt-3" : "mt-0.5"} ${isOwn ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar space */}
      <div className="w-8 shrink-0">
        {showSender && !isOwn && (
          <Avatar
            name={message.senderHandle}
            size={32}
            imageUrl={profile?.avatarUrl}
          />
        )}
      </div>

      <div
        className={`max-w-[70%] min-w-0 ${isOwn ? "items-end" : "items-start"}`}
      >
        {showSender && (
          <div
            className={`flex items-baseline gap-2 mb-0.5 ${isOwn ? "justify-end" : ""}`}
          >
            <span className="text-xs font-medium text-text-primary">
              {displayName}
            </span>
            <span className="text-xs text-text-secondary">
              {formatMessageTime(message.createdAt)}
            </span>
          </div>
        )}
        <div
          className={`rounded-lg px-3 py-1.5 text-sm break-words ${
            message.sms
              ? isOwn
                ? "bg-[#34c759] text-white"      // iMessage green: SMS left the encrypted world
                : "bg-[#34c759]/25 text-text-primary"
              : isOwn
              ? "bg-sent text-white"
              : "bg-surface text-text-primary"
          } ${message.status === "sending" ? "opacity-60" : ""} ${message.status === "failed" ? "opacity-60" : ""} transition-opacity duration-150`}
        >
          {message.text}
        </div>
        {message.status === "failed" && message.errorText && (
          <p
            className={`text-xs text-danger mt-0.5 ${isOwn ? "text-right" : ""}`}
          >
            {message.errorText}
          </p>
        )}
      </div>
    </div>
  );
}
