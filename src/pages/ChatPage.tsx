import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { connectLive, disconnectLive, setSignalHandler } from "@/lib/atsms-bridge";
import { inboundCallSignals } from "@/lib/webrtc-signaling";
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

    // Ephemeral call signaling (never persisted — format §8) → the call layer.
    setSignalHandler((content, senderDid) => {
      for (const signal of inboundCallSignals(content, senderDid)) {
        void handleSignalingMessage(signal);
      }
    });

    try {
      // Live feeds: new transcript messages + conversation-list changes.
      // (The transport polls the relay itself; no manual sync step.)
      connectLive(
        (msg) => {
          if (mounted) {
            appendMessage(msg);
            refresh();
          }
        },
        () => {
          if (mounted) refresh();
        },
      );
      refresh();
    } catch (err) {
      console.error("Failed to initialize chat:", err);
    }

    return () => {
      mounted = false;
      disconnectLive();
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
