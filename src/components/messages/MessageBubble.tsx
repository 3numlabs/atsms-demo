import type { AppMessage } from "@/types";
import { Avatar } from "@/components/ui/Avatar";

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
  return (
    <div
      className={`flex gap-2 ${showSender ? "mt-3" : "mt-0.5"} ${isOwn ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar space */}
      <div className="w-8 shrink-0">
        {showSender && !isOwn && (
          <Avatar name={message.senderHandle} size={32} />
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
              @{message.senderHandle}
            </span>
            <span className="text-xs text-text-secondary">
              {formatMessageTime(message.createdAt)}
            </span>
          </div>
        )}
        <div
          className={`rounded-lg px-3 py-1.5 text-sm break-words ${
            isOwn
              ? "bg-sent text-white"
              : "bg-surface text-text-primary"
          } ${message.status === "sending" ? "opacity-60" : ""} ${message.status === "failed" ? "border border-danger" : ""}`}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
}
