/**
 * Bridge between the React app and the `@atsms/sms` v2 client (`ATSMS`):
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
} from "@atsms/sms";
import { ATSMS_API_URL, EMAIL_DOMAIN, PLC_DIRECTORY_URL } from "./constants";
import { deriveP256PrivateKeyPEM } from "./passkey-prf";
import type { AppConversation, AppMessage } from "@/types";

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

  const sub = atsms.conversations$.subscribe((convos) => {
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
): Promise<string> {
  if (!atsms || !storage) throw new Error("Not initialized");
  const convo = await atsms.open({ members: recipientDids });
  if (title !== undefined && title.trim() !== "") {
    // Group name lives in the conversation record's metadata (local for now;
    // in-band name sync is a later protocol feature).
    const record = await storage.getConversation(convo.id);
    if (record !== null) {
      await storage.saveConversation({ ...record, metadata: { ...record.metadata, title: title.trim() } });
    }
  }
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
  const convo = await atsms.get(convoId);
  if (convo === null) return [];
  return convo.membershipLog().map((e) => ({
    opId: e.opId,
    type: e.type,
    actorDid: e.actor.did,
    deviceDids: e.devices.map((d) => d.did),
    deviceFingerprints: e.devices.map((d) => bytesToHexLocal(d.fingerprint)),
  }));
}

/** Current member devices (debug view): DID → device fingerprints in the group. */
export async function memberDevices(convoId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!atsms || !convoId.startsWith("02")) return out;
  const convo = await atsms.get(convoId);
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
  await atsms.leave(convoId);
}

/** Grant admin to a member (admin-only) — the succession step before leaving. */
export async function grantAdminTo(convoId: string, did: string): Promise<void> {
  if (!atsms) throw new Error("Not initialized");
  await atsms.grantAdmin(convoId, did);
}

/** Would leaving now strand the group (sole admin, others remain)? */
export async function leavingWouldStrand(convoId: string): Promise<boolean> {
  if (!atsms || !convoId.startsWith("02")) return false;
  const convo = await atsms.get(convoId);
  return convo?.wouldStrandGroup ?? false;
}

/** Remove a DID from a secure conversation (every device; admin only —
 *  strong remove, enforced by the engine). One-shot threads have no
 *  membership to manage. */
export async function removeMemberFromConversation(convoId: string, did: string): Promise<void> {
  if (!atsms) throw new Error("Not initialized");
  if (!convoId.startsWith("02")) throw new Error("Notice threads have no members to manage");
  await atsms.removeMember(convoId, did);
}

/** Send into an existing thread, routed by its pinned mode. No fallback. */
export async function sendMessage(convoId: string, text: string): Promise<void> {
  if (!atsms || !storage || !currentDid) throw new Error("Not initialized");

  if (convoId.startsWith("02")) {
    const convo = await atsms.get(convoId);
    if (convo === null) throw new Error("Conversation is not available on this device");
    await convo.send(text);
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
  const text = msg.deleted ? "[deleted]" : (textOf(msg.content) ?? "[unsupported message]");
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

    const meta = convo.metadata as { title?: string; removed?: boolean; left?: boolean } | undefined;
    const title = meta?.title;
    appConvos.push({
      id: convo.id,
      participantDids: convo.participantIds,
      participantHandles: handles,
      ...(title !== undefined ? { title } : {}),
      ...(meta?.removed === true ? { removed: true } : {}),
      ...(meta?.left === true ? { left: true } : {}),
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
