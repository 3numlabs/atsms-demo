/**
 * Bridge between the React app and the `@atsms/client` v2 client (`ATSMS`):
 * boot/wiring, live subscriptions, and the AppMessage/AppConversation
 * mapping. Mode selection is DELIBERATE (sdk-shape.md Part A): a thread is
 * either a secure conversation (DCGKA — forward secrecy, sealed sender,
 * calls) or a one-shot notice thread (X509, certified-mail-style), chosen
 * visibly at creation and pinned in the conversation record. Sends route by
 * the pinned mode — never a per-message decision, never a silent fallback.
 */

import {
  Agent,
  ATSMS,
  ATSMSDeviceIdentity,
  ATSMSEndpointCertificate,
  ATSMSPdsClient,
  ATSMSWorkerEnvelopeTransport,
  convoIdToHex,
  deriveStorageKey,
  didMailtoUri,
  EncryptedStorageAdapter,
  IndexedDBAdapter,
  inboxUrlResolver,
  type LocalMessage,
  type MessageContent,
  oneShotConvoIdV2,
  publishEndpointCertificate,
  type StorageAdapter,
  textOf,
  transcriptMessages,
} from "@atsms/client";
import { ATSMS_API_URL, EMAIL_DOMAIN, PLC_DIRECTORY_URL } from "./constants";
import { deriveP256PrivateKeyPEM } from "./passkey-prf";
import type { AppConversation, AppMessage } from "@/types";
import { hasFlag } from "./flags";
import { smsThreads, myRegistrars, sendSmsReply } from "./sms-test";

let atsms: ATSMS | null = null;
let storage: StorageAdapter | null = null;
let currentEndpointCert: ATSMSEndpointCertificate | null = null;
let currentDid: string | null = null;

/** Signal-class (ephemeral) messages — set by the call layer (ChatPage). */
let signalHandler: ((content: MessageContent, senderDid: string) => void) | null = null;

export function setSignalHandler(fn: (content: MessageContent, senderDid: string) => void): void {
  signalHandler = fn;
}

// Handle resolution cache
const handleCache = new Map<string, string>();
const didToHandleCache = new Map<string, string>();

export function getAtsms(): ATSMS | null {
  return atsms;
}

export function getEndpointCert(): ATSMSEndpointCertificate | null {
  return currentEndpointCert;
}

export function getCurrentDid(): string | null {
  return currentDid;
}

export async function resolveHandle(
  handle: string,
): Promise<{ did: string; pdsUrl: string }> {
  // Strip leading @ if present
  const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;

  const resolveUrl = `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(cleanHandle)}`;
  const res = await fetch(resolveUrl);
  if (!res.ok) {
    throw new Error(`Could not resolve handle: ${cleanHandle}`);
  }
  const data = await res.json();
  const did = data.did as string;

  handleCache.set(cleanHandle, did);
  didToHandleCache.set(did, cleanHandle);

  const pdsUrl = await resolvePDS(did);
  return { did, pdsUrl };
}

export async function resolvePDS(did: string): Promise<string> {
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`${PLC_DIRECTORY_URL}/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    const doc = await res.json();
    const service = doc.service?.find((s: any) => s.id === "#atproto_pds");
    if (!service) throw new Error(`No PDS service found for ${did}`);
    return service.serviceEndpoint;
  } else if (did.startsWith("did:web:")) {
    const domain = did.slice(8);
    return `https://${domain}`;
  }
  throw new Error(`Unsupported DID method: ${did}`);
}

export async function checkExistingCerts(
  did: string,
): Promise<ATSMSEndpointCertificate[]> {
  const pdsUrl = await resolvePDS(did);

  const res = await fetch(
    `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=at.atsms.x509&limit=10`,
  );

  if (!res.ok) return [];

  const data = await res.json();
  const certs: ATSMSEndpointCertificate[] = [];

  for (const record of data.records || []) {
    try {
      const certPEM = record.value?.certificate;
      if (certPEM) {
        certs.push(ATSMSEndpointCertificate.fromPEM(certPEM));
      }
    } catch {
      // Skip invalid certs
    }
  }

  return certs;
}

export async function resolveHandleFromDid(did: string): Promise<string> {
  if (didToHandleCache.has(did)) return didToHandleCache.get(did)!;

  try {
    const pdsUrl = await resolvePDS(did);
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data.handle) {
        didToHandleCache.set(did, data.handle);
        return data.handle;
      }
    }
  } catch {
    // Fall through
  }

  return did; // Return DID as fallback
}

/**
 * Passkey-PRF key → cert (reused from the PDS when the key matches, minted +
 * published otherwise) → a running `ATSMS` client. `oauthSession` must be an
 * authenticated session (the client publishes cert/prekey/inbox records).
 */
export async function initializeNewCert(
  did: string,
  handle: string,
  prfOutput: ArrayBuffer,
  oauthSession: any,
): Promise<ATSMSEndpointCertificate> {
  const privateKeyPEM = await deriveP256PrivateKeyPEM(prfOutput, did);
  const agent = new Agent(oauthSession);
  const pds = new ATSMSPdsClient(agent, did);

  // Reuse a published cert whose key matches the derived key.
  const existingCerts = await checkExistingCerts(did);
  let endpointCert: ATSMSEndpointCertificate | null = null;
  for (const cert of existingCerts) {
    try {
      endpointCert = await ATSMSEndpointCertificate.fromPEMWithKey(
        cert.certificatePEM!,
        privateKeyPEM,
      );
      console.log("[ATSMS] Found matching cert on PDS, reusing:", endpointCert.serialNumber);
      break;
    } catch {
      // Key doesn't match this cert, try next
    }
  }

  if (endpointCert === null) {
    endpointCert = await ATSMSEndpointCertificate.generateWithKey(
      privateKeyPEM,
      did,
      handle,
      EMAIL_DOMAIN,
    );
    await publishEndpointCertificate(pds, endpointCert);
  }

  await bootClient(did, handle, endpointCert, privateKeyPEM, pds, new Uint8Array(prfOutput));
  return endpointCert;
}

const rng = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

async function bootClient(
  did: string,
  handle: string,
  endpointCert: ATSMSEndpointCertificate,
  privateKeyPEM: string,
  pds: ATSMSPdsClient,
  prfSeed: Uint8Array,
): Promise<void> {
  currentDid = did;
  currentEndpointCert = endpointCert;
  didToHandleCache.set(did, handle);

  // Encryption at rest (same shape as atsms-web): the passkey seed derives a
  // storage KEK under its own reserved HKDF label; the adapter envelope-
  // encrypts the DCGKA state blobs (engine state + prekey ring — live
  // secrets; forward secrecy depends on them not sitting in plaintext).
  const base = new IndexedDBAdapter(`atsms-demo-${did}`);
  storage = await EncryptedStorageAdapter.wrap(base, await deriveStorageKey(prfSeed));
  const identity = await ATSMSDeviceIdentity.load({
    did,
    certificatePEM: endpointCert.certificatePEM!,
    privateKeyPEM,
    storage,
    rng,
  });

  const transport = new ATSMSWorkerEnvelopeTransport({
    apiUrl: ATSMS_API_URL,
    did,
    deviceFingerprint: identity.fingerprint,
    privateKeyPEM,
    resolveInboxUrl: inboxUrlResolver(pds),
    pollIntervalMs: 5_000,
    onError: (e) => console.warn("[ATSMS] transport:", e.message),
  });

  atsms = await ATSMS.create({
    identity,
    storage,
    transport,
    pds,
    rng,
    mailtoAddress: didMailtoUri(did, EMAIL_DOMAIN),
    onEvent: (kind, detail) => console.log(`[ATSMS] ${kind}: ${detail}`),
    onSignal: (content, senderDid) => signalHandler?.(content, senderDid),
    // Profiling samples (devtools verbose level; on-device only).
    onMetric: (m) => console.debug("[ATSMS metric]", m),
  });
}

// ── live subscriptions ───────────────────────────────────────────────────────

const watchedConvos = new Map<string, { seen: Set<string>; unsubscribe: () => void }>();
let convosUnsubscribe: (() => void) | null = null;

/**
 * Start the live feeds: watch every conversation's message stream, emitting
 * NEW transcript messages (history is baselined silently — the message store
 * loads it explicitly per conversation).
 */
export function connectLive(
  onMessage: (msg: AppMessage) => void,
  onConversationUpdate: () => void,
): void {
  if (!atsms || !storage) throw new Error("ATSMS client not initialized");
  disconnectLive();

  const sub = atsms.conversations.all$.subscribe((convos) => {
    onConversationUpdate();
    for (const convo of convos) {
      if (watchedConvos.has(convo.id)) continue;
      watchConversation(convo.id, onMessage);
    }
  });
  convosUnsubscribe = () => sub.unsubscribe();
}

function watchConversation(convoId: string, onMessage: (msg: AppMessage) => void): void {
  const state = { seen: new Set<string>(), unsubscribe: () => {} };
  let baselined = false;
  watchedConvos.set(convoId, state);

  const sub = storage!.observeMessages(convoId).subscribe((msgs) => {
    const transcript = transcriptMessages(msgs);
    if (!baselined) {
      // First emission is existing history — record, don't emit.
      for (const m of transcript) state.seen.add(m.id);
      baselined = true;
      return;
    }
    for (const m of transcript) {
      if (state.seen.has(m.id)) continue;
      state.seen.add(m.id);
      void toAppMessage(m).then(onMessage);
    }
  });
  state.unsubscribe = () => sub.unsubscribe();
}

export function disconnectLive(): void {
  convosUnsubscribe?.();
  convosUnsubscribe = null;
  for (const { unsubscribe } of watchedConvos.values()) unsubscribe();
  watchedConvos.clear();
}

// ── sending ──────────────────────────────────────────────────────────────────
//
// Mode selection is DELIBERATE (sdk-shape.md Part A): the thread's mode is
// chosen once, visibly, at creation — secure conversation (DCGKA) or one-shot
// notice thread (X509) — pinned in the conversation record, and sends route by
// the pinned mode. Never a per-message decision, never a silent fallback.

export type Reachability = "conversation" | "one-shot" | "unreachable";

export async function reachabilityOf(did: string): Promise<Reachability> {
  if (!atsms) throw new Error("Not initialized");
  return atsms.reachability(did);
}

/** Start (or reuse) a secure conversation — throws if the recipient lacks a prekey. */
export async function startSecureConversation(
  recipientDids: string[],
  title?: string,
  kind: "dm" | "group" = recipientDids.length === 1 ? "dm" : "group",
): Promise<string> {
  if (!atsms) throw new Error("Not initialized");
  // Two verbs, because they are two different acts: the DM with someone always
  // exists (asking twice gives the same one), while a group is made — and the
  // same people may share several. The SDK stores the title.
  const convo =
    kind === "dm"
      ? await atsms.conversations.with(recipientDids[0]!)
      : await atsms.conversations.createGroup({ members: recipientDids, title });
  return convo.id;
}

/**
 * Start (or reuse) a one-shot notice thread — the certified-mail-style X509
 * surface (no forward secrecy, no calls). The record is pinned
 * `protocol: "x509"` so sends never re-decide the mode.
 */
export async function startNoticeThread(recipientDid: string): Promise<string> {
  if (!atsms || !storage || !currentDid) throw new Error("Not initialized");
  const participants = [...new Set([currentDid, recipientDid])].sort();
  const convoId = convoIdToHex(oneShotConvoIdV2(participants));
  const existing = await storage.getConversation(convoId);
  const now = new Date();
  await storage.saveConversation({
    id: convoId,
    participantIds: participants,
    createdAt: existing?.createdAt ?? now,
    lastMessageAt: existing?.lastMessageAt ?? now,
    unreadCount: existing?.unreadCount ?? 0,
    metadata: { ...existing?.metadata, protocol: "x509" },
  });
  return convoId;
}

/**
 * Membership history for a conversation (who admitted/removed whom), derived
 * from the engine's retained op log — the content format keeps membership
 * events at the DCGKA layer, so these are NOT messages. Causal order; frames
 * carry no clock, so the UI timestamps its own first observation.
 */
export async function membershipHistory(
  convoId: string,
): Promise<Array<{ opId: string; type: "create" | "add" | "remove"; actorDid: string; deviceDids: string[]; deviceFingerprints: string[] }>> {
  if (!atsms || !convoId.startsWith("02")) return [];
  const convo = await atsms.conversations.get(convoId);
  if (convo === null) return [];
  return convo.membershipLog().map((e) => ({
    opId: e.opId,
    type: e.type,
    actorDid: e.actor.did,
    deviceDids: e.devices.map((d) => d.did),
    deviceFingerprints: e.devices.map((d) => bytesToHexLocal(d.fingerprint)),
  }));
}

/** My account's devices, and which of my conversations each is missing from. */
export async function myDevices(): Promise<
  Array<{ fingerprint: string; isThisDevice: boolean; capable: boolean; reason?: string; missingFrom: string[] }>
> {
  if (!atsms) throw new Error("Not initialized");
  return atsms.myDevices();
}

/** Add one of MY other devices to the conversations it is missing from. */
export async function enrolMyDevice(
  fingerprint: string,
): Promise<{ enrolled: string[]; skipped: Array<{ convoId: string; reason: string }> }> {
  if (!atsms) throw new Error("Not initialized");
  return atsms.enrolDevice(fingerprint);
}

/** Admin DIDs of a conversation — who may add, remove, and grant admin. */
export async function conversationAdmins(convoId: string): Promise<string[]> {
  if (!atsms || !convoId.startsWith("02")) return [];
  const convo = await atsms.conversations.get(convoId);
  return convo?.admins ?? [];
}

/**
 * Who in this conversation may never have received their invitation
 * (ordering-auth §8.2): on the roster, never heard from at all — not one
 * frame, not even the mandatory update a device sends on joining.
 *
 * Silence is the ONLY evidence available, because a create/welcome is never
 * acknowledged, and it is ambiguous on purpose: it also covers someone quiet
 * and someone who refused. Show it as "invited", never "delivery failed".
 */
export async function pendingMembers(convoId: string): Promise<string[]> {
  if (!atsms || !convoId.startsWith("02")) return [];
  const convo = await atsms.conversations.get(convoId);
  return convo?.pendingMembers ?? [];
}

/** The group's shared name (group-state.md) — what every member sees. */
export async function groupName(convoId: string): Promise<string | null> {
  if (!atsms || !convoId.startsWith("02")) return null;
  const convo = await atsms.conversations.get(convoId);
  return convo?.name ?? null;
}

/** Rename the group for everyone (admin-only). Capped at 64 BYTES. */
export async function renameGroup(convoId: string, name: string): Promise<void> {
  if (!atsms) throw new Error("ATSMS client not initialized");
  const convo = await atsms.conversations.get(convoId);
  if (convo === null) throw new Error("conversation not found");
  await convo.rename(name);
}

/** UTF-8 length — the group-name cap is bytes, so a UI must count bytes: 64 is
 *  ~64 Latin characters but ~21 CJK or ~16 emoji. */
export function nameByteLength(name: string): number {
  return new TextEncoder().encode(name).length;
}

export const GROUP_NAME_BYTE_LIMIT = 64;

/** Member devices never heard from (fingerprint hex). One whose OWNER is not in
 *  pendingMembers is stranded: that person is here on another device, but this
 *  one may never have received its admission material — the phone in a drawer. */
export async function pendingDevices(convoId: string): Promise<string[]> {
  if (!atsms || !convoId.startsWith("02")) return [];
  const convo = await atsms.conversations.get(convoId);
  return convo?.pendingDevices ?? [];
}

/** Re-send a pending member's admission material (§8.2): the original create
 *  for a founding member, a rebuilt welcome for a later joiner. A deliberate
 *  user action — retrying automatically would chase whoever declined. */
export async function reinviteMember(convoId: string, did: string): Promise<void> {
  if (!atsms) throw new Error("ATSMS client not initialized");
  const convo = await atsms.conversations.get(convoId);
  if (convo === null) throw new Error("conversation not found");
  await convo.reinvite(did);
}

/** DIDs that have sent at least one message here. A member absent from this set
 *  but present in the roster (and not pending) has joined and is reading only —
 *  a distinction the protocol cannot see, since it is derived from content. */
export async function messageSenders(convoId: string): Promise<Set<string>> {
  if (!storage) return new Set();
  return new Set((await storage.getMessages(convoId, 500)).map((m) => m.senderId));
}

/** Current member devices (debug view): DID → device fingerprints in the group. */
export async function memberDevices(convoId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!atsms || !convoId.startsWith("02")) return out;
  const convo = await atsms.conversations.get(convoId);
  if (convo === null) return out;
  for (const [fp, did] of convo.inner.memberDevices) {
    const list = out.get(did) ?? [];
    list.push(fp);
    out.set(did, list);
  }
  return out;
}

const bytesToHexLocal = (u: Uint8Array): string =>
  Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Leave a conversation: every device of this DID is removed, no healing update
 * (the leaver cannot mint an epoch that excludes it — the remaining members
 * heal on their next send). Refuses if this is the sole admin with others
 * still in the group; appoint a successor with `grantAdminTo` first.
 */
export async function leaveConversation(convoId: string): Promise<void> {
  if (!atsms) throw new Error("Not initialized");
  if (!convoId.startsWith("02")) throw new Error("Notice threads have no membership to leave");
  await (await atsms.conversations.get(convoId))!.leave();
}

/** Grant admin to a member (admin-only) — the succession step before leaving. */
export async function grantAdminTo(convoId: string, did: string): Promise<void> {
  if (!atsms) throw new Error("Not initialized");
  await (await atsms.conversations.get(convoId))!.grantAdmin(did);
}

/** Would leaving now strand the group (sole admin, others remain)? */
export async function leavingWouldStrand(convoId: string): Promise<boolean> {
  if (!atsms || !convoId.startsWith("02")) return false;
  const convo = await atsms.conversations.get(convoId);
  return convo?.wouldStrandGroup ?? false;
}

/** Remove a DID from a secure conversation (every device; admin only —
 *  strong remove, enforced by the engine). One-shot threads have no
 *  membership to manage. */
export async function removeMemberFromConversation(convoId: string, did: string): Promise<void> {
  if (!atsms) throw new Error("Not initialized");
  if (!convoId.startsWith("02")) throw new Error("Notice threads have no members to manage");
  await (await atsms.conversations.get(convoId))!.removeMember(did);
}

/** Send into an existing thread, routed by its pinned mode. No fallback. */
export async function sendMessage(convoId: string, text: string): Promise<void> {
  if (!atsms || !storage || !currentDid) throw new Error("Not initialized");

  if (convoId.startsWith("02")) {
    const convo = await atsms.conversations.get(convoId);
    if (convo === null) throw new Error("Conversation is not available on this device");
    await convo.send(text);
    return;
  }

  // SMS test surface: a reply in a bridged-SMS thread routes through the gateway (§7e).
  if (hasFlag("sms") && smsThreads.has(convoId)) {
    await sendSmsReply(convoId, text);
    return;
  }
  // One-shot notice thread: recipients come from the pinned record.
  const record = await storage.getConversation(convoId);
  if (record === null) throw new Error("Unknown conversation");
  const recipients = record.participantIds.filter((d) => d !== currentDid);
  if (recipients.length === 0) throw new Error("No recipients in this thread");
  await atsms.send({ to: recipients, text });
}

// ── reads ────────────────────────────────────────────────────────────────────

async function toAppMessage(msg: LocalMessage): Promise<AppMessage> {
  const senderHandle = await resolveHandleFromDid(msg.senderId);
  let text = msg.deleted ? "[deleted]" : (textOf(msg.content) ?? "[unsupported message]");
  // SMS test surface: surface bridged provenance (flag "sms"). Trust rule per §6a: verified only
  // when the SEALING DID is a registrar my own consent record names.
  if (hasFlag("sms") && !msg.deleted) {
    const lo = (msg.content.extensions as Map<unknown, unknown> | undefined)?.get?.("legacyOrigin") as Map<string, unknown> | undefined;
    const from = lo?.get?.("from");
    if (typeof from === "string") {
      smsThreads.set(msg.convoId, { from, gatewayDid: msg.senderId });
      const verified = (await myRegistrars()).has(msg.senderId);
      text = `[SMS from ${from}${verified ? "" : " — unverified bridge"}] ${text}`;
    }
  }
  return {
    id: msg.id,
    convoId: msg.convoId,
    senderId: msg.senderId,
    senderHandle,
    text,
    createdAt: msg.createdAt,
    status: "sent",
  };
}

export async function getConversationMessages(convoId: string): Promise<AppMessage[]> {
  if (!storage) return [];
  const messages = transcriptMessages(await storage.getMessages(convoId, 200));
  return Promise.all(messages.map(toAppMessage));
}

export async function getConversations(): Promise<AppConversation[]> {
  if (!storage) return [];

  const convos = await storage.getConversations();
  const appConvos: AppConversation[] = [];

  for (const convo of convos) {
    const handles: string[] = [];
    for (const did of convo.participantIds) {
      handles.push(await resolveHandleFromDid(did));
    }

    const transcript = transcriptMessages(await storage.getMessages(convo.id, 10));
    const lastMsg = transcript[transcript.length - 1];
    const lastMsgText = lastMsg === undefined ? "" : (textOf(lastMsg.content) ?? "");

    const meta = convo.metadata as
      | { title?: string; removed?: boolean; left?: boolean; kind?: "dm" | "group" }
      | undefined;
    const title = meta?.title;
    appConvos.push({
      id: convo.id,
      participantDids: convo.participantIds,
      participantHandles: handles,
      ...(title !== undefined ? { title } : {}),
      ...(meta?.removed === true ? { removed: true } : {}),
      ...(meta?.left === true ? { left: true } : {}),
      ...(meta?.kind !== undefined ? { kind: meta.kind } : {}),
      lastMessage: lastMsgText,
      lastMessageAt: convo.lastMessageAt,
      unreadCount: convo.unreadCount,
    });
  }

  return appConvos;
}

export async function fetchProfile(
  didOrHandle: string,
): Promise<{ displayName: string | null; avatarUrl: string | null }> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(didOrHandle)}`,
    );
    if (!res.ok) return { displayName: null, avatarUrl: null };
    const data = await res.json();
    return {
      displayName: data.displayName || null,
      avatarUrl: data.avatar || null,
    };
  } catch {
    return { displayName: null, avatarUrl: null };
  }
}
