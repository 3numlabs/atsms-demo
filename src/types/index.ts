export interface AppConversation {
  id: string;
  participantDids: string[];
  participantHandles: string[];
  /** Group name (metadata.title) — set for named groups, absent for DMs. */
  title?: string;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: number;
}

export interface AppMessage {
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
