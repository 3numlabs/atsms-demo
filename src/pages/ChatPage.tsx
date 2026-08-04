import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useMessageStore } from "@/stores/message-store";
import {
  connectLive,
  disconnectLive,
  membershipHistory,
  resolveHandleFromDid,
  setSignalHandler,
} from "@/lib/atsms-bridge";
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
      const myDid = did;
      const convos = useConversationStore.getState().conversations;
      for (const c of convos) {
        if (!c.id.startsWith("02")) continue;
        const history = await membershipHistory(c.id);
        // One row per PERSON, not per device op. Adding a DID with three
        // devices mints three add ops; a reader wants "Bob joined", once. Runs
        // of consecutive ops of the same type on the same DID are one event,
        // keyed by the run's first op id so it stays stable across reloads.
        let i = 0;
        while (i < history.length) {
          const e = history[i]!;
          if (e.type === "create") {
            i += 1;
            continue; // the conversation itself, not an event
          }
          const did = e.deviceDids[0] ?? "";
          let j = i;
          while (
            j + 1 < history.length &&
            history[j + 1]!.type === e.type &&
            (history[j + 1]!.deviceDids[0] ?? "") === did
          ) {
            j += 1;
          }
          const devices = j - i + 1;
          // Resolve from the cached DID→handle map, NOT the conversation's
          // participant list: that list lags an add and excludes a removal, so
          // the same event read differently depending on which side it was.
          const who = did === "" ? "someone" : `@${await resolveHandleFromDid(did)}`;
          const suffix = devices > 1 ? ` (${devices} devices)` : "";
          // Who did it. A removal whose actor IS the subject is someone
          // leaving of their own accord — a different sentence entirely.
          const byMe = e.actorDid === myDid;
          const actor = byMe ? "You" : `@${await resolveHandleFromDid(e.actorDid)}`;
          const subjectIsActor = e.actorDid === did;
          const subject = did === myDid ? "You" : who;
          recordSystemEvent({
            id: e.opId,
            convoId: c.id,
            text:
              e.type === "add"
                ? `${subject} ${subject === "You" ? "were" : "was"} added by ${actor}${suffix}`
                : subjectIsActor
                  ? `${subject} left the conversation${suffix}`
                  : `${subject} ${subject === "You" ? "were" : "was"} removed by ${actor}${suffix}`,
          });
          i = j + 1;
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
