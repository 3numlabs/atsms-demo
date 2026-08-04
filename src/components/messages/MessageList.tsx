import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSystemEventStore } from "@/stores/system-event-store";
import { Spinner } from "@/components/ui/Spinner";

export function MessageList() {
  const messages = useMessageStore((s) => s.messages);
  const convoId = useMessageStore((s) => s.convoId);
  const loading = useMessageStore((s) => s.loading);
  const did = useAuthStore((s) => s.did);
  const systemEvents = useSystemEventStore((s) => s.events);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Messages and membership events share the transcript, interleaved by time.
  const rows = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt.getTime(), message: m })),
    ...systemEvents
      .filter((e) => e.convoId === convoId)
      .map((e) => ({ kind: "system" as const, at: e.observedAt, event: e })),
  ].sort((a, b) => a.at - b.at);

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

  if (messages.length === 0 && rows.length === 0) {
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
      {rows.map((row, i) => {
        if (row.kind === "system") {
          return (
            <div key={row.event.id} className="py-1 text-center">
              <span className="text-xs text-text-secondary/80">{row.event.text}</span>
            </div>
          );
        }
        const prev = i > 0 ? rows[i - 1] : null;
        const prevMsg = prev !== null && prev.kind === "message" ? prev.message : null;
        const showSender = !prevMsg || prevMsg.senderId !== row.message.senderId;
        const isOwn = row.message.senderId === did;

        return (
          <MessageBubble
            key={row.message.id}
            message={row.message}
            isOwn={isOwn}
            showSender={showSender}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
