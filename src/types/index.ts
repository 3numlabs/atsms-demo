export interface AppConversation {
  id: string;
  participantDids: string[];
  participantHandles: string[];
  /** Group name (metadata.title) — set for named groups, absent for DMs. */
  title?: string;
  /** Fixed at creation — NEVER inferred from participant count (a group that
   *  shrinks to two is still a group; a DM is its two people, forever). */
  kind?: "dm" | "group";
  /** This device was removed from the conversation — render read-only. */
  removed?: boolean;
  /** …and it left of its own accord (a different story to tell). */
  left?: boolean;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: number;
  /** SMS test surface (flag "sms"): bridged-SMS thread — from number + §6a verification. */
  sms?: { from: string; verified: boolean };
}

export interface AppMessage {
  /** Bridged SMS (green bubble). */
  sms?: boolean;
  id: string;
  convoId: string;
  senderId: string;
  senderHandle: string;
  text: string;
  createdAt: Date;
  status: "sending" | "sent" | "failed";
  errorText?: string;
}

export type OnboardingStep =
  | "handle"
  | "oauth"
  | "passkey"
  | "passkey-blocked"
  | "initializing";
