import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { connectWebSocket, syncMessages } from "@/lib/atsms-bridge";
import { handleSignalingMessage } from "@/lib/webrtc-manager";
import { CallOverlay } from "@/components/call/CallOverlay";
import { IncomingCallModal } from "@/components/call/IncomingCallModal";

export function ChatPage() {
  const did = useAuthStore((s) => s.did);
  const appendMessage = useMessageStore((s) => s.appendMessage);
  const refresh = useConversationStore((s) => s.refresh);

  useEffect(() => {
    if (!did) return;

    let mounted = true;

    async function init() {
      try {
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
          (localMsg) => {
            // Route WebRTC signaling to the manager
            handleSignalingMessage(localMsg);
          },
        );

        // Show existing conversations from local storage immediately
        if (mounted) {
          await refresh();
        }

        // Then sync new messages from the server
        await syncMessages();

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

  return (
    <>
      <AppShell />
      <IncomingCallModal />
      <CallOverlay />
    </>
  );
}
