import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import { HandleInput } from "./HandleInput";
import { PasskeySetup } from "./PasskeySetup";
import { PasskeyBlocker } from "./PasskeyBlocker";
import { startOAuthFlow, getOAuthClient } from "@/lib/oauth";
import { Spinner } from "@/components/ui/Spinner";

export function OnboardingFlow() {
  const step = useUIStore((s) => s.onboardingStep);
  const setStep = useUIStore((s) => s.setOnboardingStep);
  const error = useUIStore((s) => s.onboardingError);
  const setError = useUIStore((s) => s.setOnboardingError);

  const [did, setDid] = useState("");
  const [handle, setHandle] = useState("");
  const [oauthAgent, setOauthAgent] = useState<any>(null);

  // After OAuth redirect, restore did/handle from sessionStorage
  // and restore the OAuth session
  useEffect(() => {
    if (step === "passkey") {
      const storedDid = sessionStorage.getItem("atsms_oauth_did");
      const storedHandle = sessionStorage.getItem("atsms_oauth_handle");

      if (storedDid && !did) {
        setDid(storedDid);
        setHandle(storedHandle || storedDid);

        // Restore OAuth session
        getOAuthClient()
          .then((client) => client.restore(storedDid))
          .then((session) => {
            setOauthAgent(session);
          })
          .catch((err) => {
            console.error("Failed to restore OAuth session:", err);
            setError("Failed to restore authentication session");
            setStep("handle");
          });
      }
    }
  }, [step, did, setError, setStep]);

  async function onHandleResolved(
    resolvedDid: string,
    resolvedHandle: string,
  ) {
    setDid(resolvedDid);
    setHandle(resolvedHandle);

    // Always do OAuth first
    sessionStorage.setItem("atsms_oauth_handle", resolvedHandle);
    setStep("oauth");
    try {
      await startOAuthFlow(resolvedHandle);
    } catch (err: any) {
      setError(err.message || "OAuth flow failed");
      setStep("handle");
    }
  }

  const showPasskey = step === "passkey" && oauthAgent;

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8 justify-center">
        {["handle", "oauth", "passkey"].map(
          (s, i, arr) => {
            const currentIdx = arr.indexOf(
              step === "passkey-blocked"
                ? "passkey"
                : step === "initializing"
                  ? "passkey"
                  : step,
            );
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            return (
              <div
                key={s}
                className={`h-1.5 w-12 rounded-full transition-colors ${
                  isDone || isActive ? "bg-accent" : "bg-border"
                }`}
              />
            );
          },
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-danger/10 border border-danger/30 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {step === "handle" && (
        <HandleInput onResolved={onHandleResolved} />
      )}

      {step === "oauth" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size={32} />
          <p className="text-sm text-text-secondary">
            Redirecting to your PDS for authentication...
          </p>
        </div>
      )}

      {showPasskey && (
        <PasskeySetup
          did={did}
          handle={handle}
          oauthAgent={oauthAgent}
        />
      )}

      {step === "passkey" && !showPasskey && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size={32} />
          <p className="text-sm text-text-secondary">
            Restoring authentication session...
          </p>
        </div>
      )}

      {step === "passkey-blocked" && <PasskeyBlocker />}

      {step === "initializing" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size={32} />
          <p className="text-sm text-text-secondary">
            Setting up encrypted messaging...
          </p>
        </div>
      )}
    </div>
  );
}
