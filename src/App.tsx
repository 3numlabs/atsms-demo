import { useEffect, useState } from "react";
import { LoginPage } from "@/pages/LoginPage";
import { ChatPage } from "@/pages/ChatPage";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { Spinner } from "@/components/ui/Spinner";

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setStep = useUIStore((s) => s.setOnboardingStep);
  const setError = useUIStore((s) => s.setOnboardingError);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function init() {
      // Check if we're returning from an OAuth callback (hash contains state+code)
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const isCallback =
        hashParams.has("state") &&
        (hashParams.has("code") || hashParams.has("error"));

      if (isCallback) {
        try {
          const { getOAuthClient } = await import("@/lib/oauth");
          const client = await getOAuthClient();
          const result = await client.init();

          if (result?.session) {
            sessionStorage.setItem("atsms_oauth_did", result.session.did);
            setStep("passkey");
            history.replaceState(null, "", window.location.pathname);
          } else {
            setError("OAuth did not return a session");
            setStep("handle");
          }
        } catch (err: any) {
          console.error("OAuth callback error:", err);
          setError(err.message || "Authentication failed");
          setStep("handle");
        }

        setInitializing(false);
        return;
      }

      // Check for pending OAuth from a previous load
      const oauthDid = sessionStorage.getItem("atsms_oauth_did");
      if (oauthDid) {
        setStep("passkey");
      }

      setInitializing(false);
    }

    init();
  }, [setStep, setError]);

  if (initializing) {
    return (
      <div className="h-full flex items-center justify-center bg-main">
        <Spinner size={32} />
      </div>
    );
  }

  return isAuthenticated ? <ChatPage /> : <LoginPage />;
}
