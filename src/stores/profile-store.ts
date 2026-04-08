import { create } from "zustand";
import { fetchProfile } from "@/lib/atsms-bridge";

interface ProfileData {
  displayName: string | null;
  avatarUrl: string | null;
  handle?: string;
}

interface ProfileState {
  profiles: Record<string, ProfileData>;
  loading: Set<string>;
  fetchProfileByDid: (did: string) => void;
  getProfile: (did: string) => ProfileData | undefined;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: {},
  loading: new Set(),

  fetchProfileByDid: (did: string) => {
    const state = get();
    if (state.profiles[did] || state.loading.has(did)) return;

    // Mark as loading
    set((s) => ({
      loading: new Set(s.loading).add(did),
    }));

    fetchProfile(did).then(({ displayName, avatarUrl }) => {
      // Normalize avatar URL
      const normalizedAvatar =
        avatarUrl && !avatarUrl.includes("@") ? avatarUrl + "@jpeg" : avatarUrl;

      set((s) => {
        const newLoading = new Set(s.loading);
        newLoading.delete(did);
        return {
          profiles: {
            ...s.profiles,
            [did]: { displayName, avatarUrl: normalizedAvatar },
          },
          loading: newLoading,
        };
      });
    });
  },

  getProfile: (did: string) => {
    return get().profiles[did];
  },
}));
