import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import { connectLive, disconnectLive, membershipHistory, setSignalHandler } from "@/lib/atsms-bridge";
import { useSystemEventStore } from "@/stores/system-event-store";
import { inboundCallSignals } from "@/lib/webrtc-signaling";
import { handleSignalingMessage } from "@/lib/webrtc-manager";
import { CallOverlay } from "@/components/call/CallOverlay";
import { IncomingCallModal } from "@/components/call/IncomingCallModal";

export function ChatPage() {
  const did = useAuthStore((s) => s.did);
  const appendMessage = useMessageStore((s) => s.appendMessage);
  const recordSystemEvent = useSystemEventStore((s) => s.record);
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
          if (mounted) {
            refresh();
            // A conversation-list change may mean the roster moved: fold any
            // new membership ops into the transcript as system rows.
            void syncSystemEvents();
          }
        },
      );
      refresh();
      void syncSystemEvents();
    } catch (err) {
      console.error("Failed to initialize chat:", err);
    }

    async function syncSystemEvents(): Promise<void> {
      const convos = useConversationStore.getState().conversations;
      for (const c of convos) {
        if (!c.id.startsWith("02")) continue;
        for (const e of await membershipHistory(c.id)) {
          if (e.type === "create") continue; // the conversation itself, not an event
          const who = e.deviceDids[0] ?? "someone";
          const label = who.slice(-6);
          recordSystemEvent({
            id: e.opId,
            convoId: c.id,
            text: e.type === "add" ? `…${label} was added to the conversation` : `…${label} was removed from the conversation`,
          });
        }
      }
    }

    return () => {
      mounted = false;
      disconnectLive();
    };
  }, [did, appendMessage, refresh, recordSystemEvent]);

  return (
    <>
      <AppShell />
      <IncomingCallModal />
      <CallOverlay />
    </>
  );
}
