import { useEffect, useRef, useState } from "react";
import { LoginPage } from "@/pages/LoginPage";
import { ChatPage } from "@/pages/ChatPage";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { Spinner } from "@/components/ui/Spinner";

// Detect OAuth callback synchronously at module load — this prevents
// the LoginPage from flashing before the callback is processed.
function isOAuthCallback(): boolean {
  if (typeof window === "undefined") return false;
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  return (
    hashParams.has("state") &&
    (hashParams.has("code") || hashParams.has("error"))
  );
}

const HAS_OAUTH_CALLBACK = isOAuthCallback();

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setStep = useUIStore((s) => s.setOnboardingStep);
  const setError = useUIStore((s) => s.setOnboardingError);

  // Initialize step to "passkey" immediately if we have a callback,
  // so OnboardingFlow doesn't briefly render the handle step
  const [initializing, setInitializing] = useState(
    HAS_OAUTH_CALLBACK || !!sessionStorage.getItem("atsms_oauth_did"),
  );

  // Prevent re-entrancy from React StrictMode double-invoking effects
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    async function init() {
      if (HAS_OAUTH_CALLBACK) {
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
