import { create } from "zustand";
import type { AppMessage } from "@/types";
import { getConversationMessages } from "@/lib/atsms-bridge";

interface MessageState {
  messages: AppMessage[];
  loading: boolean;

  loadMessages: (convoId: string) => Promise<void>;
  appendMessage: (msg: AppMessage) => void;
  setOptimistic: (msg: AppMessage) => void;
  updateMessage: (id: string, updates: Partial<AppMessage>) => void;
  removeMessage: (id: string) => void;
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
      if (state.messages.some((m) => m.id === msg.id)) return state;
      const messages = [...state.messages, msg].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      return { messages };
    }),

  setOptimistic: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

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

  clearMessages: () => set({ messages: [], loading: false }),
}));
