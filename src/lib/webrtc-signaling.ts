/**
 * Call signaling over v2 ephemeral messages (format §8): a `call` part sent
 * with `ephemeral: true` — never persisted, dropped when stale, delivered via
 * the client's `onSignal` callback. Calls require a stateful (DCGKA)
 * conversation; X509 one-shot threads have no session to signal over.
 */

import { callPart, type CallSignal, convoIdToHex, KIND_CALL, type MessageContent } from "@atsms/client";
import { getAtsms } from "./atsms-bridge";
import { getGatewayCall, sealCallReply } from "./call-oneshot";

export async function sendWebRTCSignal(convoId: string, signal: CallSignal): Promise<void> {
  // A call that rang in over a one-shot (the legacy-call gateway bridge) has no DCGKA session —
  // seal the answer/ICE/hangup back to the bridge's answer-inbox instead of sending over a convo.
  const gw = getGatewayCall(signal.callId);
  if (gw) return sealCallReply(gw, signal);

  const atsms = getAtsms();
  if (!atsms) throw new Error("Not initialized");
  const convo = await atsms.conversations.get(convoId);
  if (convo === null) throw new Error("Calls need an open conversation (DCGKA) — not available on this thread");
  await convo.send({ parts: [callPart(signal)], ephemeral: true });
}

export interface InboundSignal {
  senderId: string;
  convoId: string;
  signal: CallSignal;
}

/** Extract call signals from an inbound ephemeral message, or [] if none. */
export function inboundCallSignals(content: MessageContent, senderDid: string): InboundSignal[] {
  const out: InboundSignal[] = [];
  for (const part of content.body ?? []) {
    if (part.kind !== KIND_CALL || !("body" in part)) continue;
    const b = part.body;
    const callId = b.get("callId");
    const type = b.get("type");
    if (typeof callId !== "string" || typeof type !== "string") continue;
    const candidate = b.get("candidate") as Map<string, unknown> | undefined;
    out.push({
      senderId: senderDid,
      convoId: convoIdToHex(content.convoId),
      signal: {
        callId,
        type: type as CallSignal["type"],
        sdp: typeof b.get("sdp") === "string" ? (b.get("sdp") as string) : undefined,
        mediaTypes: Array.isArray(b.get("mediaTypes"))
          ? (b.get("mediaTypes") as ("audio" | "video")[])
          : undefined,
        candidate:
          candidate instanceof Map
            ? {
                candidate: String(candidate.get("candidate")),
                sdpMid: (candidate.get("sdpMid") as string | null) ?? null,
                sdpMLineIndex: (candidate.get("sdpMLineIndex") as number | null) ?? null,
              }
            : undefined,
      },
    });
  }
  return out;
}
