import { create } from "zustand";
import type { ATSMSEndpointCertificate } from "@atsms/client";
import { clearStoredData } from "@/lib/passkey-prf";

interface AuthState {
  isAuthenticated: boolean;
  did: string | null;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  endpointCert: ATSMSEndpointCertificate | null;
  isInitializing: boolean;

  setAuth: (
    did: string,
    handle: string,
    cert: ATSMSEndpointCertificate,
  ) => void;
  setProfile: (displayName: string | null, avatarUrl: string | null) => void;
  setInitializing: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  did: null,
  handle: null,
  displayName: null,
  avatarUrl: null,
  endpointCert: null,
  isInitializing: false,

  setAuth: (did, handle, cert) =>
    set({
      isAuthenticated: true,
      did,
      handle,
      endpointCert: cert,
      isInitializing: false,
    }),

  setProfile: (displayName, avatarUrl) =>
    set({ displayName, avatarUrl }),

  setInitializing: (v) => set({ isInitializing: v }),

  logout: () => {
    clearStoredData();
    set({
      isAuthenticated: false,
      did: null,
      handle: null,
      displayName: null,
      avatarUrl: null,
      endpointCert: null,
      isInitializing: false,
    });
  },
}));
