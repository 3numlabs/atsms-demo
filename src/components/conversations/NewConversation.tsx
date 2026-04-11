import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  resolveHandle,
  getDMConvoId,
  getStorageManager,
  getCurrentDid,
  checkExistingCerts,
} from "@/lib/atsms-bridge";
import { useConversationStore } from "@/stores/conversation-store";
import { useAuthStore } from "@/stores/auth-store";

interface NewConversationProps {
  open: boolean;
  onClose: () => void;
}

export function NewConversation({ open, onClose }: NewConversationProps) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCertWarning, setNoCertWarning] = useState(false);
  const [resolvedInfo, setResolvedInfo] = useState<{
    did: string;
    handle: string;
  } | null>(null);
  const setActive = useConversationStore((s) => s.setActive);
  const addOrUpdateConversation = useConversationStore(
    (s) => s.addOrUpdateConversation,
  );
  const did = useAuthStore((s) => s.did);
  const myHandle = useAuthStore((s) => s.handle);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);
    setNoCertWarning(false);

    try {
      const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
      const { did: recipientDid } = await resolveHandle(cleanHandle);

      // Check if recipient has ATSMS certs
      const certs = await checkExistingCerts(recipientDid);
      if (certs.length === 0) {
        // Show warning but allow proceeding
        setNoCertWarning(true);
        setResolvedInfo({ did: recipientDid, handle: cleanHandle });
        setLoading(false);
        return;
      }

      await startConversation(recipientDid, cleanHandle);
    } catch (err: any) {
      setError(err.message || "Could not find that user");
    } finally {
      setLoading(false);
    }
  }

  async function startConversation(recipientDid: string, cleanHandle: string) {
    const convoId = await getDMConvoId(recipientDid);

    const sm = getStorageManager();
    if (sm) {
      const existing = await sm.getConversation(convoId);
      if (!existing) {
        await sm.getOrCreateConversation([getCurrentDid()!, recipientDid]);
      }
    }

    addOrUpdateConversation({
      id: convoId,
      participantDids: [did!, recipientDid],
      participantHandles: [myHandle!, cleanHandle],
      lastMessage: undefined,
      lastMessageAt: undefined,
      unreadCount: 0,
    });

    setActive(convoId);
    setHandle("");
    setNoCertWarning(false);
    setResolvedInfo(null);
    onClose();
  }

  function handleClose() {
    setHandle("");
    setError(null);
    setNoCertWarning(false);
    setResolvedInfo(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Message">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          placeholder="@handle.bsky.social"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            setNoCertWarning(false);
            setResolvedInfo(null);
          }}
          error={error || undefined}
          autoFocus
        />

        {noCertWarning && resolvedInfo && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 space-y-2">
            <p className="text-sm text-yellow-400">
              @{resolvedInfo.handle} hasn't set up ATSMS yet. They won't be
              able to receive messages until they register a certificate.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                type="button"
                className="text-xs"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="text-xs"
                onClick={() =>
                  startConversation(resolvedInfo.did, resolvedInfo.handle)
                }
              >
                Start anyway
              </Button>
            </div>
          </div>
        )}

        {!noCertWarning && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Start Chat
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
