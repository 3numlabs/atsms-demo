// SMS test surface (flag "sms"): render bridged-SMS provenance and reply through the gateway.
// Design: umbrella docs/plans/agent-config-and-screening.md §6a/§7d, amended by
// gateway-identity-and-transport.md — one registrar identity, gateway-role certs, per-number
// verification, per-topic threading. Test-grade by intent.
import {
  createContent, encodeContent, oneShotConvoIdV2, sealOneShot, textPart, type MessageContent,
} from "@atsms/client";
import { getEndpointCert, getCurrentDid, resolvePDS, checkExistingCerts } from "./atsms-bridge";

/** Synthetic thread id: base one-shot convoId + the topic (per number / group set — §3 of the
 *  decision note). Old entries without a topic keep the bare convoId. */
export function smsThreadId(convoId: string, topicId?: Uint8Array | null): string {
  if (!topicId || topicId.length === 0) return convoId;
  return `${convoId}|${[...topicId].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
export function isSmsThreadId(id: string): boolean { return id.includes("|") || smsThreads.has(id); }
export function baseConvoId(id: string): string { return id.split("|")[0]!; }

/** threadId -> thread state, persisted so the SMS section renders on reload. */
export const smsThreads = new Map<string, { from: string; gatewayDid: string; recipient?: string; topicHex?: string }>(
  JSON.parse(localStorage.getItem("atsms_sms_threads_v2") ?? "[]"),
);
export function rememberSmsThread(id: string, t: { from: string; gatewayDid: string; recipient?: string; topicHex?: string }): void {
  smsThreads.set(id, t);
  localStorage.setItem("atsms_sms_threads_v2", JSON.stringify([...smsThreads]));
}

// ── Verification (§6a amended): sealer == registrar OF THE RECEIVING NUMBER + gateway-role cert ──
const registrarByNumber = new Map<string, string | null>();
async function registrarOf(recipient: string): Promise<string | null> {
  if (registrarByNumber.has(recipient)) return registrarByNumber.get(recipient)!;
  let out: string | null = null;
  const did = getCurrentDid();
  if (did) {
    try {
      const pds = await resolvePDS(did);
      const rkey = recipient.replace(/^\+/, "");
      const res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=at.atsms.e164&rkey=${rkey}`);
      if (res.ok) out = ((await res.json()) as any)?.value?.registrar ?? null;
    } catch { /* unverified */ }
  }
  registrarByNumber.set(recipient, out);
  return out;
}

const roleByDid = new Map<string, boolean>();
/** APPROXIMATION (documented in the decision note follow-ups): checks the sealer DID has at least
 *  one published gateway-role cert — the exact per-envelope check needs the lib to surface the
 *  sealing cert on stored messages. Combined with the machine-only policy the delta is small. */
async function hasGatewayRoleCert(did: string): Promise<boolean> {
  if (roleByDid.has(did)) return roleByDid.get(did)!;
  let out = false;
  try {
    out = (await checkExistingCerts(did)).some((c) => c.hasGatewayRole());
  } catch { /* unverified */ }
  roleByDid.set(did, out);
  return out;
}

/** Per-number + role verification for one SMS thread. Falls back to unverified on any gap. */
export async function verifySmsThread(t: { gatewayDid: string; recipient?: string }): Promise<boolean> {
  if (!t.recipient) return false;
  const reg = await registrarOf(t.recipient);
  return reg === t.gatewayDid && (await hasGatewayRoleCert(t.gatewayDid));
}

/** Reply to a bridged SMS: sealed one-shot to the gateway's DID, smsTo extension (§7e). */
export async function sendSmsReply(threadId: string, text: string): Promise<void> {
  const t = smsThreads.get(threadId);
  const cert = getEndpointCert();
  const did = getCurrentDid();
  if (!t || !cert || !did) throw new Error("SMS thread state missing");
  const topicId = t.topicHex
    ? new Uint8Array(t.topicHex.match(/../g)!.map((h) => parseInt(h, 16)))
    : null;
  const content: MessageContent = createContent({
    salt: crypto.getRandomValues(new Uint8Array(16)),
    convoId: oneShotConvoIdV2([did, t.gatewayDid]),
    ...(topicId ? { topicId } : {}),
    fallback: text,
    extensions: new Map<number | string, unknown>([[1, [t.gatewayDid]], ["smsTo", t.from]]) as MessageContent["extensions"],
    body: [textPart(text)],
  });
  const gwCerts = await checkExistingCerts(t.gatewayDid);
  if (!gwCerts.length) throw new Error("gateway has no published certs");
  const envelope = await sealOneShot(encodeContent(content), cert, gwCerts);
  // Gateway's inbox from its own record (its /inbox endpoint on the messaging worker).
  const pds = await resolvePDS(t.gatewayDid);
  const rec = await (await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(t.gatewayDid)}&collection=at.atsms.inbox&rkey=self`)).json();
  const inbox = (rec?.value?.endpoints ?? []).find((e: any) => e?.uri?.startsWith("https:"))?.uri;
  if (!inbox) throw new Error("gateway publishes no https inbox — outbound not enabled yet");
  let b64 = "";
  for (let i = 0; i < envelope.length; i += 8192) b64 += String.fromCharCode(...envelope.subarray(i, i + 8192));
  const res = await fetch(inbox, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ envelope: btoa(b64) }) });
  if (!res.ok) throw new Error(`SMS send failed ${res.status}: ${(await res.text()).slice(0, 140)}`);
}
