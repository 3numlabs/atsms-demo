import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { connectWebSocket, syncMessages } from "@/lib/atsms-bridge";

export function ChatPage() {
  const did = useAuthStore((s) => s.did);
  const appendMessage = useMessageStore((s) => s.appendMessage);
  const refresh = useConversationStore((s) => s.refresh);

  useEffect(() => {
    if (!did) return;

    let mounted = true;

    async function init() {
      try {
        // Connect WebSocket for real-time updates
        await connectWebSocket(
          (msg) => {
            if (mounted) {
              appendMessage(msg);
              refresh();
            }
          },
          (_convoId) => {
            if (mounted) {
              refresh();
            }
          },
        );

        // Sync existing messages
        await syncMessages();

        // Load conversations
        if (mounted) {
          await refresh();
        }
      } catch (err) {
        console.error("Failed to initialize chat:", err);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [did, appendMessage, refresh]);

  return <AppShell />;
}
