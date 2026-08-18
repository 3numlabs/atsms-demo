// SMS test surface (flag "sms"): render bridged-SMS provenance and reply through the gateway.
// Design: umbrella docs/plans/agent-config-and-screening.md §6a/§7e. Test-grade by intent.
import {
  createContent, encodeContent, oneShotConvoIdV2, sealOneShot, textPart, type MessageContent,
} from "@atsms/client";
import { getEndpointCert, getCurrentDid, resolvePDS, checkExistingCerts } from "./atsms-bridge";

/** convoId -> { from, gatewayDid } learned from received legacyOrigin messages (session memory). */
export const smsThreads = new Map<string, { from: string; gatewayDid: string }>();

let registrars: Set<string> | null = null;
/** Registrar DIDs from MY OWN at.atsms.e164 consent records — the §6a trust anchors. */
export async function myRegistrars(): Promise<Set<string>> {
  if (registrars) return registrars;
  registrars = new Set();
  const did = getCurrentDid();
  if (!did) return registrars;
  try {
    const pds = await resolvePDS(did);
    const res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=at.atsms.e164&limit=25`);
    for (const r of ((await res.json())?.records ?? [])) {
      if (r?.value?.registrar) registrars.add(r.value.registrar);
    }
  } catch { /* no consent records -> nothing verifies */ }
  return registrars;
}

/** Reply to a bridged SMS: sealed one-shot to the gateway's DID, smsTo extension (§7e). */
export async function sendSmsReply(convoId: string, text: string): Promise<void> {
  const t = smsThreads.get(convoId);
  const cert = getEndpointCert();
  const did = getCurrentDid();
  if (!t || !cert || !did) throw new Error("SMS thread state missing");
  const content: MessageContent = createContent({
    salt: crypto.getRandomValues(new Uint8Array(16)),
    convoId: oneShotConvoIdV2([did, t.gatewayDid]),
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
