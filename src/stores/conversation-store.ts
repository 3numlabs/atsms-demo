import { create } from "zustand";
import type { AppConversation } from "@/types";
import { getConversations } from "@/lib/atsms-bridge";

interface ConversationState {
  conversations: AppConversation[];
  activeConvoId: string | null;
  loading: boolean;

  setActive: (convoId: string | null) => void;
  refresh: () => Promise<void>;
  addOrUpdateConversation: (convo: AppConversation) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  activeConvoId: null,
  loading: false,

  setActive: (convoId) => set({ activeConvoId: convoId }),

  refresh: async () => {
    set({ loading: true });
    try {
      const convos = await getConversations();
      // Sort by last message time, most recent first
      convos.sort((a, b) => {
        const aTime = a.lastMessageAt?.getTime() || 0;
        const bTime = b.lastMessageAt?.getTime() || 0;
        return bTime - aTime;
      });
      set({ conversations: convos, loading: false });
    } catch (err) {
      console.error("Failed to refresh conversations:", err);
      set({ loading: false });
    }
  },

  addOrUpdateConversation: (convo) =>
    set((state) => {
      const idx = state.conversations.findIndex((c) => c.id === convo.id);
      const updated = [...state.conversations];
      if (idx >= 0) {
        updated[idx] = convo;
      } else {
        updated.unshift(convo);
      }
      updated.sort((a, b) => {
        const aTime = a.lastMessageAt?.getTime() || 0;
        const bTime = b.lastMessageAt?.getTime() || 0;
        return bTime - aTime;
      });
      return { conversations: updated };
    }),
}));
