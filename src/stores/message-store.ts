import { create } from "zustand";
import type { AppMessage } from "@/types";
import { getConversationMessages } from "@/lib/atsms-bridge";

interface MessageState {
  messages: AppMessage[];
  /** Which conversation `messages` belongs to. The live feed reports messages
   *  from EVERY conversation, so without this the open thread absorbed
   *  whatever arrived — a group message showed up in the DM you were viewing
   *  until the next load replaced the list (live bug, 2026-08-03). */
  convoId: string | null;
  loading: boolean;

  loadMessages: (convoId: string) => Promise<void>;
  appendMessage: (msg: AppMessage) => void;
  setOptimistic: (msg: AppMessage) => void;
  updateMessage: (id: string, updates: Partial<AppMessage>) => void;
  removeMessage: (id: string) => void;
  clearMessages: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  convoId: null,
  loading: false,

  loadMessages: async (convoId) => {
    set({ loading: true, messages: [], convoId });
    try {
      const msgs = await getConversationMessages(convoId);
      // A slower load for a conversation the user has already navigated away
      // from must not replace the current thread's messages.
      if (get().convoId !== convoId) return;
      set({ messages: msgs, loading: false });
    } catch (err) {
      console.error("Failed to load messages:", err);
      if (get().convoId === convoId) set({ loading: false });
    }
  },

  appendMessage: (msg) =>
    set((state) => {
      // Only the open conversation's messages belong in this list; others are
      // already persisted and surface via the conversation list / on open.
      if (msg.convoId !== state.convoId) return state;
      if (state.messages.some((m) => m.id === msg.id)) return state;

      // The sender's own message is persisted while send() is still running,
      // so the real row arrives BEFORE the composer can retire its optimistic
      // placeholder — which briefly showed the same message twice. Replace the
      // placeholder in place instead: one bubble, which simply stops looking
      // pending. (Derived message IDs mean the placeholder cannot be given the
      // real ID up front, so it is matched on sender + text.)
      const pending = state.messages.findIndex(
        (m) => m.status === "sending" && m.senderId === msg.senderId && m.text === msg.text,
      );
      if (pending >= 0) {
        const messages = [...state.messages];
        messages[pending] = msg; // keeps its position — no reflow, no flicker
        return { messages };
      }

      const messages = [...state.messages, msg].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      return { messages };
    }),

  setOptimistic: (msg) =>
    set((state) =>
      msg.convoId === state.convoId ? { messages: [...state.messages, msg] } : state,
    ),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),

  clearMessages: () => set({ messages: [], convoId: null, loading: false }),
}));
