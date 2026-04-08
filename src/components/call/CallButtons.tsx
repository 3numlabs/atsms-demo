import { useCallStore } from "@/stores/call-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useAuthStore } from "@/stores/auth-store";
import { startCall } from "@/lib/webrtc-manager";

export function CallButtons() {
  const callStatus = useCallStore((s) => s.status);
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const conversations = useConversationStore((s) => s.conversations);
  const did = useAuthStore((s) => s.did);

  const convo = conversations.find((c) => c.id === activeConvoId);
  const recipientDid = convo?.participantDids.find((d) => d !== did);
  const disabled = callStatus !== "idle" || !recipientDid || !activeConvoId;

  async function handleCall(video: boolean) {
    if (!activeConvoId || !recipientDid) return;
    try {
      await startCall(
        activeConvoId,
        recipientDid,
        video ? ["audio", "video"] : ["audio"],
      );
    } catch (err) {
      console.error("Failed to start call:", err);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleCall(false)}
        disabled={disabled}
        className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Audio call"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
      </button>
      <button
        onClick={() => handleCall(true)}
        disabled={disabled}
        className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Video call"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="23,7 16,12 23,17" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      </button>
    </div>
  );
}
