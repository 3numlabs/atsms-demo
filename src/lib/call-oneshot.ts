/**
 * Answering a call that came in over a ONE-SHOT (the legacy-call gateway bridge), not a DCGKA
 * conversation. The bridge (a gateway-role device of the number's registrar) seals a WebRTC offer
 * to us as a one-shot carrying a `call` part + a `callReplyTo` extension; we answer over the SAME
 * WebRTC stack, but the answer/ICE/hangup must be SEALED BACK to the bridge's answer-inbox
 * (`callReplyTo`) instead of sent through a `convo` — there is no DCGKA session with a gateway.
 *
 * This mirrors `sms-test.ts` `sendSmsReply` (seal a one-shot, POST {envelope} to the gateway),
 * differing only in destination (the bridge's answer-inbox URL, not its relay inbox) and payload
 * (a `call` part, not text). See docs/plans/encrypted-call-leg.md and number-termination.md §3.
 */

import { callPart, type CallSignal, createContent, encodeContent, type MessageContent, oneShotConvoIdV2, sealOneShot } from "@atsms/client";
import { checkExistingCerts, getCurrentDid, getEndpointCert } from "./atsms-bridge";

/** A call ringing in over a one-shot: who sealed it (the bridge DID) and where to seal replies. */
export interface GatewayCall {
  toDid: string; // the bridge/registrar DID that rang us (offer sender)
  replyTo: string; // the bridge's answer-inbox URL (from the callReplyTo extension)
  convoId: string; // the one-shot thread id the signals are addressed under
}

const calls = new Map<string, GatewayCall>(); // by callId

/** Record (idempotently) a call that arrived over a one-shot, so replies seal back to the bridge. */
export function registerGatewayCall(callId: string, gw: GatewayCall): void {
  calls.set(callId, gw);
}

export function getGatewayCall(callId: string): GatewayCall | undefined {
  return calls.get(callId);
}

/** Seal a WebRTC signal (answer/ICE/hangup) as a one-shot to the bridge and POST it to callReplyTo. */
export async function sealCallReply(gw: GatewayCall, signal: CallSignal): Promise<void> {
  const cert = getEndpointCert();
  const did = getCurrentDid();
  if (!cert || !did) throw new Error("not signed in — cannot answer the call");

  const content: MessageContent = createContent({
    salt: crypto.getRandomValues(new Uint8Array(16)),
    convoId: oneShotConvoIdV2([did, gw.toDid]),
    ephemeral: true,
    fallback: "",
    extensions: new Map<number | string, unknown>([[1, [gw.toDid]]]) as MessageContent["extensions"],
    body: [callPart(signal)],
  });
  const bridgeCerts = await checkExistingCerts(gw.toDid);
  if (!bridgeCerts.length) throw new Error("call bridge has no published certs");
  const envelope = await sealOneShot(encodeContent(content), cert, bridgeCerts);

  let b64 = "";
  for (let i = 0; i < envelope.length; i += 8192) b64 += String.fromCharCode(...envelope.subarray(i, i + 8192));
  const res = await fetch(gw.replyTo, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ envelope: btoa(b64) }),
  });
  if (!res.ok) throw new Error(`call reply failed ${res.status}: ${(await res.text()).slice(0, 140)}`);

  // The call is over once we've sealed the hangup — stop tracking it.
  if (signal.type === "hangup") calls.delete(signal.callId);
}
