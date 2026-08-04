import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { enrolMyDevice, myDevices } from "@/lib/atsms-bridge";
import { useConversationStore } from "@/stores/conversation-store";

interface MyDevice {
  fingerprint: string;
  isThisDevice: boolean;
  capable: boolean;
  reason?: string;
  missingFrom: string[];
}

/**
 * My account's devices. A newly installed device cannot join anything by
 * itself — it holds no conversation list, and a non-member cannot author the
 * op that would admit it — so an existing device adds it here, deliberately.
 * Nothing is admitted automatically: device discovery trusts this account's
 * PDS, and silently trusting whatever appears there would turn an account
 * compromise into access to every conversation.
 */
export function MyDevices({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [devices, setDevices] = useState<MyDevice[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const refresh = useConversationStore((s) => s.refresh);

  const load = () => {
    setError(null);
    myDevices()
      .then(setDevices)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    if (open) load();
    else {
      setDevices(null);
      setNote(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="My devices">
      <div className="space-y-3">
        {devices === null && !error && <p className="text-sm text-text-secondary">Loading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {note && <p className="text-sm text-accent">{note}</p>}

        {devices?.map((d) => (
          <div key={d.fingerprint} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-mono text-xs text-text-primary truncate">
                {d.fingerprint.slice(0, 16)}…
                {d.isThisDevice && <span className="ml-2 text-accent">this device</span>}
              </p>
              <p className="text-xs text-text-secondary">
                {!d.capable
                  ? `can't receive yet (${d.reason ?? "no verified prekey"})`
                  : d.isThisDevice
                    ? "in your conversations"
                    : d.missingFrom.length === 0
                      ? "in all your conversations"
                      : `missing from ${d.missingFrom.length} conversation${d.missingFrom.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {!d.isThisDevice && d.capable && d.missingFrom.length > 0 && (
              <Button
                type="button"
                className="text-xs shrink-0"
                loading={busy === d.fingerprint}
                onClick={async () => {
                  setBusy(d.fingerprint);
                  setError(null);
                  setNote(null);
                  try {
                    const { enrolled, skipped } = await enrolMyDevice(d.fingerprint);
                    setNote(
                      `Added to ${enrolled.length} conversation${enrolled.length === 1 ? "" : "s"}` +
                        (skipped.length > 0 ? `, ${skipped.length} skipped` : "") +
                        ". It will see messages from now on — not older ones.",
                    );
                    load();
                    void refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Add to my conversations
              </Button>
            )}
          </div>
        ))}

        {devices !== null && devices.length <= 1 && (
          <p className="text-xs text-text-secondary">
            Only this device is on your account. Sign in somewhere else and it will appear here,
            ready to be added.
          </p>
        )}
      </div>
    </Modal>
  );
}
