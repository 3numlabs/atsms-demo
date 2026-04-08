import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { Spinner } from "@/components/ui/Spinner";

export function MessageList() {
  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);
  const did = useAuthStore((s) => s.did);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-text-secondary">
          No messages yet. Say hello!
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      {messages.map((msg, i) => {
        const prevMsg = i > 0 ? messages[i - 1] : null;
        const showSender = !prevMsg || prevMsg.senderId !== msg.senderId;
        const isOwn = msg.senderId === did;

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={isOwn}
            showSender={showSender}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
