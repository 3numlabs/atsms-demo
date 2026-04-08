import { create } from "zustand";
import type { AppMessage } from "@/types";
import { getConversationMessages } from "@/lib/atsms-bridge";

interface MessageState {
  messages: AppMessage[];
  loading: boolean;

  loadMessages: (convoId: string) => Promise<void>;
  appendMessage: (msg: AppMessage) => void;
  setOptimistic: (msg: AppMessage) => void;
  clearMessages: () => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: [],
  loading: false,

  loadMessages: async (convoId) => {
    set({ loading: true, messages: [] });
    try {
      const msgs = await getConversationMessages(convoId);
      set({ messages: msgs, loading: false });
    } catch (err) {
      console.error("Failed to load messages:", err);
      set({ loading: false });
    }
  },

  appendMessage: (msg) =>
    set((state) => {
      // Avoid duplicates
      if (state.messages.some((m) => m.id === msg.id)) return state;
      return { messages: [...state.messages, msg] };
    }),

  setOptimistic: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  clearMessages: () => set({ messages: [], loading: false }),
}));
