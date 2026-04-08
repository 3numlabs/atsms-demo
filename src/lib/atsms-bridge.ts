import {
  ATSMSStorageManager,
  ATSMSClient,
  ATSMSEndpointCertificate,
  IndexedDBAdapter,
  generateDMConvoId,
} from "@atsms/sms";
import { Agent } from "@atproto/api";
import { ATSMS_API_URL, EMAIL_DOMAIN, PLC_DIRECTORY_URL } from "./constants";
import { deriveP256PrivateKeyPEM } from "./passkey-prf";
import type { AppConversation, AppMessage } from "@/types";

let storageManager: ATSMSStorageManager | null = null;
let currentEndpointCert: ATSMSEndpointCertificate | null = null;
let currentDid: string | null = null;

// Handle resolution cache
const handleCache = new Map<string, string>();
const didToHandleCache = new Map<string, string>();

export function getStorageManager(): ATSMSStorageManager | null {
  return storageManager;
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

  // Try resolving via the handle's own domain first (DNS-based)
  // Fall back to bsky.social
  const resolveUrl = `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(cleanHandle)}`;
  const res = await fetch(resolveUrl);
  if (!res.ok) {
    throw new Error(`Could not resolve handle: ${cleanHandle}`);
  }
  const data = await res.json();
  const did = data.did as string;

  handleCache.set(cleanHandle, did);
  didToHandleCache.set(did, cleanHandle);

  // Resolve DID to PDS URL
  const pdsUrl = await resolvePDS(did);
  return { did, pdsUrl };
}

export async function resolvePDS(did: string): Promise<string> {
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`${PLC_DIRECTORY_URL}/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    const doc = await res.json();
    const service = doc.service?.find(
      (s: any) => s.id === "#atproto_pds",
    );
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

export async function initializeWithExistingCert(
  did: string,
  handle: string,
  certPEM: string,
  prfOutput: ArrayBuffer,
): Promise<ATSMSEndpointCertificate | null> {
  const privateKeyPEM = await deriveP256PrivateKeyPEM(prfOutput, did);
  try {
    const endpointCert = await ATSMSEndpointCertificate.fromPEMWithKey(
      certPEM,
      privateKeyPEM,
    );
    await setupStorageManager(did, handle, endpointCert);
    return endpointCert;
  } catch {
    // Key doesn't match existing cert (cert was created with a different key).
    // Caller should fall back to OAuth + new cert creation.
    return null;
  }
}

export async function initializeNewCert(
  did: string,
  handle: string,
  prfOutput: ArrayBuffer,
  agent: any, // AtpAgent from OAuth session or "mock"
): Promise<ATSMSEndpointCertificate> {
  const privateKeyPEM = await deriveP256PrivateKeyPEM(prfOutput, did);

  // Check if any existing cert on PDS matches our derived public key
  const existingCerts = await checkExistingCerts(did);
  let matchedCert: ATSMSEndpointCertificate | null = null;

  for (const cert of existingCerts) {
    try {
      matchedCert = await ATSMSEndpointCertificate.fromPEMWithKey(
        cert.certificatePEM!,
        privateKeyPEM,
      );
      console.log("[ATSMS] Found matching cert on PDS, reusing:", matchedCert.serialNumber);
      break;
    } catch {
      // Key doesn't match this cert, try next
    }
  }

  if (matchedCert) {
    await setupStorageManager(did, handle, matchedCert);
    return matchedCert;
  }

  // No matching cert found — generate a new one
  const endpointCert = await ATSMSEndpointCertificate.generateWithKey(
    privateKeyPEM,
    did,
    handle,
    EMAIL_DOMAIN,
  );

  // Store certificate on PDS (skip with mock agent)
  let atsmsClient: ATSMSClient | undefined;
  if (agent !== "mock") {
    const atpAgent = new Agent(agent);
    atsmsClient = new ATSMSClient(atpAgent as any, did);
    await atsmsClient.storeEndpointCertificate(endpointCert);
  }

  await setupStorageManager(did, handle, endpointCert, atsmsClient);
  return endpointCert;
}

async function setupStorageManager(
  did: string,
  handle: string,
  endpointCert: ATSMSEndpointCertificate,
  atsmsClient?: ATSMSClient,
): Promise<void> {
  currentDid = did;
  currentEndpointCert = endpointCert;

  didToHandleCache.set(did, handle);

  const storage = new IndexedDBAdapter();

  // If no atsmsClient provided, create one with a dummy agent.
  // ATSMSClient only needs the agent for PDS writes (storeEndpointCertificate);
  // getUserCertificates makes direct fetch calls and doesn't use the agent.
  const client =
    atsmsClient || new ATSMSClient(new Agent("https://bsky.social") as any, did);

  storageManager = new ATSMSStorageManager({
    storage,
    inboxUrl: ATSMS_API_URL,
    atsmsClient: client,
  });

  await storageManager.saveDid(did, handle, endpointCert);
  await storageManager.startTransport(did);
}

export async function connectWebSocket(
  onMessage: (msg: AppMessage) => void,
  onConversationUpdate: (convoId: string) => void,
): Promise<void> {
  if (!storageManager || !currentEndpointCert) {
    throw new Error("Storage manager not initialized");
  }

  const wsClient = await storageManager.createWebSocketClient(
    currentEndpointCert,
    {
      onConnect: () => {
        console.log("[ATSMS] WebSocket connected");
      },
      onDisconnect: (code, reason) => {
        console.log(`[ATSMS] WebSocket disconnected: ${code} ${reason}`);
      },
      onError: (error) => {
        console.error("[ATSMS] WebSocket error:", error);
      },
    },
  );

  // Subscribe to new messages
  storageManager.messageAdded$.subscribe(async (localMsg) => {
    const senderHandle = await resolveHandleFromDid(localMsg.senderId);
    let text = "";
    try {
      const parsed = JSON.parse(localMsg.content);
      text = parsed.text || localMsg.content;
    } catch {
      text = localMsg.content;
    }

    onMessage({
      id: localMsg.id,
      convoId: localMsg.convoId,
      senderId: localMsg.senderId,
      senderHandle,
      text,
      createdAt: localMsg.createdAt,
      status: "sent",
    });
  });

  storageManager.conversationUpdated$.subscribe((convoId) => {
    onConversationUpdate(convoId);
  });

  await wsClient.connect();
}

export async function syncMessages(): Promise<void> {
  if (!storageManager || !currentEndpointCert) return;
  await storageManager.syncMessages(currentEndpointCert);
}

export async function sendDM(
  recipientDid: string,
  text: string,
): Promise<string> {
  if (!storageManager || !currentEndpointCert || !currentDid) {
    throw new Error("Not initialized");
  }

  // startConversation handles both creating and reusing existing DM conversations
  const convoId = await storageManager.startConversation(
    [recipientDid],
    text,
    currentEndpointCert,
  );
  return convoId;
}

export async function getConversationMessages(
  convoId: string,
): Promise<AppMessage[]> {
  if (!storageManager) return [];

  const messages = await storageManager.getMessages(convoId);
  const appMessages: AppMessage[] = [];

  for (const msg of messages) {
    const senderHandle = await resolveHandleFromDid(msg.senderId);
    let text = "";
    try {
      const parsed = JSON.parse(msg.content);
      text = parsed.text || msg.content;
    } catch {
      text = msg.content;
    }

    appMessages.push({
      id: msg.id,
      convoId: msg.convoId,
      senderId: msg.senderId,
      senderHandle,
      text,
      createdAt: msg.createdAt,
      status: "sent",
    });
  }

  return appMessages;
}

export async function getConversations(): Promise<AppConversation[]> {
  if (!storageManager) return [];

  const convos = await storageManager.listConversations();
  const appConvos: AppConversation[] = [];

  for (const convo of convos) {
    const handles: string[] = [];
    for (const did of convo.participantIds) {
      handles.push(await resolveHandleFromDid(did));
    }

    const messages = await storageManager.getMessages(convo.id, 1);
    const lastMsg = messages[messages.length - 1];
    let lastMsgText = "";
    if (lastMsg) {
      try {
        const parsed = JSON.parse(lastMsg.content);
        lastMsgText = parsed.text || "";
      } catch {
        lastMsgText = lastMsg.content;
      }
    }

    appConvos.push({
      id: convo.id,
      participantDids: convo.participantIds,
      participantHandles: handles,
      lastMessage: lastMsgText,
      lastMessageAt: convo.lastMessageAt,
      unreadCount: convo.unreadCount,
    });
  }

  return appConvos;
}

export async function getDMConvoId(
  otherDid: string,
): Promise<string> {
  if (!currentDid) throw new Error("Not initialized");
  return generateDMConvoId(currentDid, otherDid);
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
