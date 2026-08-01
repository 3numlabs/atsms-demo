import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  registerPasskey,
  authenticatePasskey,
  mockRegisterPasskey,
  storeUserData,
  getStoredCredentialId,
  getStoredDid,
  IS_LOCALHOST,
} from "@/lib/passkey-prf";
import { initializeNewCert } from "@/lib/atsms-bridge";
import { useAuthStore } from "@/stores/auth-store";

interface PasskeySetupProps {
  did: string;
  handle: string;
  oauthAgent?: any;
}

export function PasskeySetup({
  did,
  handle,
  oauthAgent,
}: PasskeySetupProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handlePasskey() {
    setLoading(true);
    setError(null);

    try {
      // Reuse the existing credential when this DID already set one up on this
      // browser — re-registering would mint a DIFFERENT key (new device, and
      // the previous session's encrypted storage becomes un-unlockable).
      // Register only on first setup. (Mock on localhost is deterministic.)
      const storedCredentialId = getStoredDid() === did ? getStoredCredentialId() : null;
      let result;
      if (IS_LOCALHOST) {
        result = await mockRegisterPasskey(did);
      } else if (storedCredentialId) {
        try {
          result = await authenticatePasskey(did, storedCredentialId);
        } catch {
          // Credential gone (deleted from the authenticator) — start fresh.
          result = await registerPasskey(did);
        }
      } else {
        result = await registerPasskey(did);
      }

      if (!oauthAgent) {
        throw new Error("No authenticated session available");
      }

      // Generate new certificate with the passkey-derived key and store on PDS
      const endpointCert = await initializeNewCert(
        did,
        handle,
        result.prfOutput,
        oauthAgent,
      );

      // Store user data in localStorage for future sessions
      storeUserData(
        did,
        handle,
        endpointCert.certificatePEM!,
        endpointCert.serialNumber,
        result.credentialId,
      );

      setAuth(did, handle, endpointCert);
    } catch (err: any) {
      console.error("Passkey setup failed:", err);
      setError(err.message || "Passkey authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
            <circle cx="12" cy="16" r="1" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-text-primary">
          Create your encryption key
        </h3>
        <p className="text-sm text-text-secondary">
          ATSMS uses a passkey to generate your private encryption key.
          This key is used for end-to-end encrypted messaging and never leaves your device.
        </p>
        {IS_LOCALHOST && (
          <p className="text-xs text-yellow-500">
            Dev mode: passkey will be mocked
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Button onClick={handlePasskey} loading={loading} className="w-full">
        {IS_LOCALHOST
          ? "Create Key (mock)"
          : getStoredDid() === did && getStoredCredentialId()
            ? "Unlock with Passkey"
            : "Create Passkey"}
      </Button>
    </div>
  );
}
