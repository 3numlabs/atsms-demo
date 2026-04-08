import { useState, useRef, type KeyboardEvent } from "react";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { sendDM } from "@/lib/atsms-bridge";
import { nanoid } from "nanoid";

export function MessageComposer() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const conversations = useConversationStore((s) => s.conversations);
  const refresh = useConversationStore((s) => s.refresh);
  const setOptimistic = useMessageStore((s) => s.setOptimistic);
  const did = useAuthStore((s) => s.did);
  const handle = useAuthStore((s) => s.handle);

  const convo = conversations.find((c) => c.id === activeConvoId);

  async function handleSend() {
    if (!text.trim() || sending || !convo || !did || !handle) return;

    const msgText = text.trim();
    setText("");

    // Find other participant DID
    const recipientDid = convo.participantDids.find((d) => d !== did);
    if (!recipientDid) return;

    // Optimistic update
    const optimisticId = nanoid(13);
    setOptimistic({
      id: optimisticId,
      convoId: convo.id,
      senderId: did,
      senderHandle: handle,
      text: msgText,
      createdAt: new Date(),
      status: "sending",
    });

    setSending(true);
    try {
      await sendDM(recipientDid, msgText);
      await refresh();
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Auto-resize textarea
  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  return (
    <div className="px-4 py-3 border-t border-border bg-main shrink-0">
      <div className="flex items-end gap-2 bg-input border border-border rounded-lg px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary/60 resize-none focus:outline-none"
          style={{ minHeight: "20px", maxHeight: "120px" }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="text-accent hover:text-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0 pb-0.5"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
