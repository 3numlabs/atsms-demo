import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useUIStore } from "@/stores/ui-store";
import { resolveHandle } from "@/lib/atsms-bridge";
import { checkPRFSupport } from "@/lib/passkey-prf";

interface HandleInputProps {
  onResolved: (did: string, handle: string) => void;
}

export function HandleInput({ onResolved }: HandleInputProps) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setOnboardingStep = useUIStore((s) => s.setOnboardingStep);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Check PRF support first
      const prfSupported = await checkPRFSupport();
      if (!prfSupported) {
        setOnboardingStep("passkey-blocked");
        return;
      }

      const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
      const { did } = await resolveHandle(cleanHandle);
      onResolved(did, cleanHandle);
    } catch (err: any) {
      setError(err.message || "Failed to resolve handle");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-text-secondary mb-2">
          Enter your Bluesky handle
        </label>
        <Input
          type="text"
          placeholder="@alice.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={error || undefined}
          autoFocus
        />
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Continue
      </Button>
    </form>
  );
}
