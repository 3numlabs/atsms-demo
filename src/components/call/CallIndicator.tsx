import { useCallStore } from "@/stores/call-store";
import { useConversationStore } from "@/stores/conversation-store";

export function CallIndicator() {
  const callStatus = useCallStore((s) => s.status);
  const callConvoId = useCallStore((s) => s.convoId);
  const remoteHandle = useCallStore((s) => s.remoteHandle);
  const activeConvoId = useConversationStore((s) => s.activeConvoId);
  const setActive = useConversationStore((s) => s.setActive);

  // Only show when in a call and viewing a different conversation
  if (callStatus !== "connected" || callConvoId === activeConvoId) return null;

  return (
    <button
      onClick={() => callConvoId && setActive(callConvoId)}
      className="mx-2 my-1 px-3 py-1.5 rounded-lg bg-success/20 border border-success/30 text-success text-xs font-medium flex items-center gap-2 hover:bg-success/30 transition-colors"
    >
      <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
      In call with @{remoteHandle}
    </button>
  );
}
