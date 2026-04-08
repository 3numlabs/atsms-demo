import { create } from "zustand";
import type { ATSMSEndpointCertificate } from "@atsms/sms";
import { clearStoredData } from "@/lib/passkey-prf";

interface AuthState {
  isAuthenticated: boolean;
  did: string | null;
  handle: string | null;
  endpointCert: ATSMSEndpointCertificate | null;
  isInitializing: boolean;

  setAuth: (
    did: string,
    handle: string,
    cert: ATSMSEndpointCertificate,
  ) => void;
  setInitializing: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  did: null,
  handle: null,
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

  setInitializing: (v) => set({ isInitializing: v }),

  logout: () => {
    clearStoredData();
    set({
      isAuthenticated: false,
      did: null,
      handle: null,
      endpointCert: null,
      isInitializing: false,
    });
  },
}));
